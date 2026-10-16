import { json, type RequestHandler } from '@sveltejs/kit';

import { guardStatus, resetGuard } from '$lib/server/loginGuard';

// Protected by the login hook like every /api route.
export const GET: RequestHandler = async () => json(await guardStatus());

export const DELETE: RequestHandler = async () => {
	await resetGuard();
	return json(await guardStatus());
};
