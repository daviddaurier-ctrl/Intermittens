import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '$env/dynamic/private';

import { driveEnabled, driveReadFile, driveWriteFile } from '$lib/server/googleDrive';
import { dataDir } from '$lib/server/storage';

/**
 * Persistent login throttling. Serverless instances (Vercel) don't share memory, so failures are
 * stored next to the app data (Google Drive or the local data folder).
 *
 * - Per address: 5 failures → 15 min lock, 10 → 1 h, 15 or more → 24 h. A success resets it.
 * - Everyone: more than 30 failures within an hour (an attacker rotating addresses) locks the
 *   login form for 1 h. Devices already recognised keep working, they don't need to log in.
 */

const FILE = 'login-guard.json';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const GLOBAL_LIMIT = 30;

type AddressState = { fails: number; lastFail: number; lockedUntil: number };
type GuardState = {
	addresses: Record<string, AddressState>;
	global: { windowStart: number; fails: number; lockedUntil: number };
};

function emptyState(): GuardState {
	return { addresses: {}, global: { windowStart: 0, fails: 0, lockedUntil: 0 } };
}

/** Addresses are stored hashed, never in clear. */
function addressKey(address: string) {
	const salt = env.ACCESS_PASSWORD?.length ? 'intermimi-guard' : 'intermimi-guard-local';
	return createHash('sha256').update(`${salt}:${address}`).digest('base64url').slice(0, 22);
}

async function load(): Promise<GuardState> {
	try {
		const raw = driveEnabled()
			? await driveReadFile('root', FILE)
			: await readFile(path.join(dataDir, FILE));
		if (!raw) return emptyState();
		const parsed = JSON.parse(raw.toString('utf-8')) as Partial<GuardState>;
		return {
			addresses: parsed.addresses ?? {},
			global: { ...emptyState().global, ...(parsed.global ?? {}) }
		};
	} catch {
		return emptyState();
	}
}

async function save(state: GuardState) {
	const body = JSON.stringify(state);
	try {
		if (driveEnabled()) {
			await driveWriteFile('root', FILE, body, 'application/json');
		} else {
			await mkdir(dataDir, { recursive: true });
			await writeFile(path.join(dataDir, FILE), body, 'utf-8');
		}
	} catch (cause) {
		console.error('Enregistrement du verrou de connexion impossible:', cause);
	}
}

function prune(state: GuardState, now: number) {
	for (const [key, value] of Object.entries(state.addresses)) {
		if (value.lockedUntil < now && now - value.lastFail > DAY) delete state.addresses[key];
	}
	if (now - state.global.windowStart > HOUR) {
		state.global.windowStart = now;
		state.global.fails = 0;
	}
}

function lockFor(fails: number) {
	if (fails >= 15) return DAY;
	if (fails >= 10) return HOUR;
	if (fails >= 5) return 15 * 60 * 1000;
	return 0;
}

export type GuardCheck = { allowed: true } | { allowed: false; retryInMinutes: number };

export async function checkLogin(address: string): Promise<GuardCheck> {
	const now = Date.now();
	const state = await load();
	const lockedUntil = Math.max(
		state.global.lockedUntil,
		state.addresses[addressKey(address)]?.lockedUntil ?? 0
	);
	if (lockedUntil > now) {
		return { allowed: false, retryInMinutes: Math.ceil((lockedUntil - now) / 60000) };
	}
	return { allowed: true };
}

/** Records a failure; returns how many tries remain before the next lock. */
export async function recordFailure(address: string) {
	const now = Date.now();
	const state = await load();
	prune(state, now);

	const key = addressKey(address);
	const entry = state.addresses[key] ?? { fails: 0, lastFail: 0, lockedUntil: 0 };
	entry.fails += 1;
	entry.lastFail = now;
	const lock = lockFor(entry.fails);
	if (lock) entry.lockedUntil = now + lock;
	state.addresses[key] = entry;

	state.global.fails += 1;
	if (state.global.fails > GLOBAL_LIMIT) state.global.lockedUntil = now + HOUR;

	await save(state);
	const nextThreshold = entry.fails < 5 ? 5 : entry.fails < 10 ? 10 : 15;
	return { remaining: Math.max(0, nextThreshold - entry.fails), locked: lock > 0 };
}

export async function recordSuccess(address: string) {
	const state = await load();
	const key = addressKey(address);
	if (!state.addresses[key]) return;
	delete state.addresses[key];
	await save(state);
}
