import { base } from '$app/paths';

import { exchangeAuthCode } from '$lib/server/googleDrive';
import type { PageServerLoad } from './$types';

const STATE_COOKIE = 'intermittens_google_state';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const expectedState = cookies.get(STATE_COOKIE);
	cookies.delete(STATE_COOKIE, { path: `${base}/setup-google` });

	const state = url.searchParams.get('state');
	const code = url.searchParams.get('code');
	const googleError = url.searchParams.get('error');

	// The state cookie is only set for a logged-in user who started the flow from /setup-google,
	// so this public page never hands a token to anyone else.
	if (!expectedState || !state || state !== expectedState) {
		return { ok: false as const, message: 'Lien expiré ou invalide. Recommencez depuis /setup-google.' };
	}
	if (googleError || !code) {
		return { ok: false as const, message: `Google a refusé l'accès (${googleError ?? 'code absent'}).` };
	}

	try {
		const refreshToken = await exchangeAuthCode(code, `${url.origin}${base}/setup-google/callback`);
		return { ok: true as const, refreshToken };
	} catch (cause) {
		return {
			ok: false as const,
			message: `Échange avec Google impossible : ${cause instanceof Error ? cause.message : cause}`
		};
	}
};
