import { json, type RequestHandler } from '@sveltejs/kit';

import { extractTextFromBuffer } from '$lib/server/documentAnalysis';
import { readData, readStoredFile, saveData } from '$lib/server/storage';
import { syncWorks } from '$lib/server/workSync';

/** Builds the works from the cession contracts and links the royalty statements to them. */
export const POST: RequestHandler = async () => {
	const data = await readData();
	const changed = await syncWorks(data, async (document) => {
		const buffer = await readStoredFile(document.storedName);
		return extractTextFromBuffer(document.fileName, document.mimeType, Buffer.from(buffer));
	});
	const saved = changed ? await saveData(data) : data;
	return json({ data: saved, changed });
};
