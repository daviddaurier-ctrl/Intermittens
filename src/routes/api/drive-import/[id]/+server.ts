import { error, type RequestHandler } from '@sveltejs/kit';

import { driveDownloadById, driveEnabled } from '$lib/server/googleDrive';

export const GET: RequestHandler = async ({ params }) => {
	if (!driveEnabled()) error(400, "Google Drive n'est pas relié.");

	const file = await driveDownloadById(params.id ?? '');
	if (!file) error(404, 'Document introuvable ou format non pris en charge.');

	return new Response(new Uint8Array(file.content), {
		headers: {
			'content-type': file.meta.mimeType ?? 'application/octet-stream',
			'cache-control': 'private, no-store'
		}
	});
};
