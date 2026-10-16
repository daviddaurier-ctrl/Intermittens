import { json, type RequestHandler } from '@sveltejs/kit';

import { driveEnabled, driveRecentFiles } from '$lib/server/googleDrive';

export const GET: RequestHandler = async ({ url }) => {
	if (!driveEnabled()) return json({ message: "Google Drive n'est pas relié." }, { status: 400 });
	const hours = Math.min(Number(url.searchParams.get('hours') ?? 48) || 48, 24 * 31);
	const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
	return json({ files: await driveRecentFiles(since) });
};
