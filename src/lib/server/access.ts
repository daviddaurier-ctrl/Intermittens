import { createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import type { Cookies } from '@sveltejs/kit';

const DEFAULT_PASSWORD_SALT = 'InterMittens access v1';
const DEFAULT_PASSWORD_DIGEST = 'e50c15579c0835a83d9ab4dc2b3f3b1066ecc627625a79e0206a42e2f814283e';
const ACCESS_COOKIE = 'intermittens_access';
const COOKIE_VERSION = 'v1';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

function configuredPassword() {
	return env.ACCESS_PASSWORD?.trim();
}

function digest(value: string) {
	return createHash('sha256').update(value, 'utf8').digest();
}

function sessionToken() {
	const passwordCredential =
		configuredPassword() || Buffer.from(DEFAULT_PASSWORD_DIGEST, 'hex').toString('base64url');

	return `${COOKIE_VERSION}.${digest(
		`intermittens:${COOKIE_VERSION}:${passwordCredential}`
	).toString('base64url')}`;
}

function safelyEqual(left: string, right: string) {
	const leftDigest = digest(left);
	const rightDigest = digest(right);
	return timingSafeEqual(leftDigest, rightDigest);
}

function cookiePath() {
	return base || '/';
}

export function passwordIsValid(candidate: string) {
	const password = configuredPassword();
	if (password) return safelyEqual(candidate, password);
	// Hosted on Vercel without ACCESS_PASSWORD: refuse every login rather than fall back to the
	// original author's built-in password.
	if (env.VERCEL) return false;

	const candidateDigest = scryptSync(candidate, DEFAULT_PASSWORD_SALT, 32);
	const expectedDigest = Buffer.from(DEFAULT_PASSWORD_DIGEST, 'hex');
	return timingSafeEqual(candidateDigest, expectedDigest);
}

export function hasValidAccessCookie(cookies: Cookies) {
	const candidate = cookies.get(ACCESS_COOKIE);
	return candidate ? safelyEqual(candidate, sessionToken()) : false;
}

export function rememberClient(cookies: Cookies, secure: boolean) {
	cookies.set(ACCESS_COOKIE, sessionToken(), {
		httpOnly: true,
		maxAge: COOKIE_MAX_AGE,
		path: cookiePath(),
		sameSite: 'strict',
		secure
	});
}

export function forgetClient(cookies: Cookies, secure: boolean) {
	cookies.delete(ACCESS_COOKIE, {
		path: cookiePath(),
		secure
	});
}
