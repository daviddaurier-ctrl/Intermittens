import { error, type RequestHandler } from '@sveltejs/kit';

import { inlineContentDisposition } from '$lib/server/contentDisposition';
import { readData, readStoredFile } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params }) => {
	const data = await readData();
	const payment = data.royalties.find((item) => item.id === params.id);
	if (!payment?.storedName) error(404, 'Document introuvable.');

	const file = new Uint8Array(await readStoredFile(payment.storedName));
	return new Response(file, {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': inlineContentDisposition(payment.fileName, 'note-de-droits.pdf')
		}
	});
};
