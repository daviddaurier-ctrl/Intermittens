import { base } from '$app/paths';
import { hasValidAccessCookie } from '$lib/server/access';
import { json, redirect, type Handle } from '@sveltejs/kit';

const PUBLIC_ROUTES = new Set(['/login', '/logout', '/setup-google/callback', '/confidentialite']);

function applySecurityHeaders(response: Response) {
	response.headers.set('cache-control', 'private, no-store');
	response.headers.set('referrer-policy', 'same-origin');
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('x-frame-options', 'DENY');
	return response;
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.authenticated = hasValidAccessCookie(event.cookies);

	if (event.route.id && PUBLIC_ROUTES.has(event.route.id)) {
		return applySecurityHeaders(await resolve(event));
	}

	if (event.locals.authenticated) {
		return applySecurityHeaders(await resolve(event));
	}

	if (event.route.id?.startsWith('/api/')) {
		return json(
			{ message: 'Authentification requise.' },
			{
				headers: { 'cache-control': 'private, no-store' },
				status: 401
			}
		);
	}

	const next = `${event.url.pathname}${event.url.search}`;
	const loginUrl = `${base}/login?next=${encodeURIComponent(next)}`;
	throw redirect(303, loginUrl);
};
