import { base } from '$app/paths';
import { passwordIsValid, rememberClient } from '$lib/server/access';
import { checkLogin, recordFailure, recordSuccess } from '$lib/server/loginGuard';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function clientAddress(getClientAddress: () => string) {
	try {
		return getClientAddress();
	} catch {
		return 'unknown';
	}
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function safeDestination(candidate: string | null) {
	const fallback = `${base}/`;
	if (!candidate) return fallback;

	try {
		const destination = new URL(candidate, 'http://intermittens.local');
		const requiredPrefix = base ? `${base}/` : '/';

		if (
			destination.origin !== 'http://intermittens.local' ||
			!destination.pathname.startsWith(requiredPrefix)
		) {
			return fallback;
		}

		return `${destination.pathname}${destination.search}${destination.hash}`;
	} catch {
		return fallback;
	}
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.authenticated) {
		throw redirect(303, safeDestination(url.searchParams.get('next')));
	}
};

export const actions: Actions = {
	default: async ({ cookies, getClientAddress, request, url }) => {
		const address = clientAddress(getClientAddress);
		const check = await checkLogin(address);

		if (!check.allowed) {
			const minutes = check.retryInMinutes;
			return fail(429, {
				error: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`
			});
		}

		const formData = await request.formData();
		const password = formData.get('password');

		if (typeof password !== 'string' || !passwordIsValid(password)) {
			const result = await recordFailure(address);
			// Slow down guessing a little more on every failure.
			await pause(800);
			return fail(400, {
				error: result.locked
					? 'Mot de passe incorrect. Trop de tentatives : connexion bloquée pour un moment.'
					: `Mot de passe incorrect. Encore ${result.remaining} essai${result.remaining > 1 ? 's' : ''} avant blocage.`
			});
		}

		await recordSuccess(address);
		rememberClient(cookies, url.protocol === 'https:');
		throw redirect(303, safeDestination(url.searchParams.get('next')));
	}
};
