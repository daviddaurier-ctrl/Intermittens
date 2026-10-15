import { error, type RequestHandler } from '@sveltejs/kit';

import { readData, readStoredFile } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params }) => {
	const data = await readData();
	const period = data.periods.find((item) => item.id === params.id);

	if (!period || !period.sourceStoredName) error(404, 'Document introuvable.');

	const file = new Uint8Array(await readStoredFile(period.sourceStoredName));

	return new Response(file, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-disposition': `inline; filename="${period.sourceFileName.replace(/"/g, '')}"`
		}
	});
};
