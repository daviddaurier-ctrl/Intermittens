import { randomBytes } from 'node:crypto';

import { base } from '$app/paths';
import { redirect } from '@sveltejs/kit';

import { driveEnabled, googleAuthUrl, googleOAuthConfigured } from '$lib/server/googleDrive';
import type { Actions, PageServerLoad } from './$types';

const STATE_COOKIE = 'intermittens_google_state';

export const load: PageServerLoad = async ({ url }) => {
	return {
		oauthConfigured: googleOAuthConfigured(),
		driveLinked: driveEnabled(),
		redirectUri: `${url.origin}${base}/setup-google/callback`
	};
};

export const actions: Actions = {
	default: async ({ cookies, url }) => {
		const state = randomBytes(24).toString('base64url');
		cookies.set(STATE_COOKIE, state, {
			httpOnly: true,
			maxAge: 600,
			path: `${base}/setup-google`,
			// Lax so the cookie comes back on the top-level redirect from Google.
			sameSite: 'lax',
			secure: url.protocol === 'https:'
		});
		redirect(303, googleAuthUrl(`${url.origin}${base}/setup-google/callback`, state));
	}
};
