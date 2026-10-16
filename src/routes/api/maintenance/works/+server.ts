import { json, type RequestHandler } from '@sveltejs/kit';

import { extractTextFromBuffer } from '$lib/server/documentAnalysis';
import { analyzeSacdStatement } from '$lib/server/sacdAnalysis';
import { readData, readStoredFile, saveData } from '$lib/server/storage';
import { syncWorks } from '$lib/server/workSync';

/**
 * Builds the works from the cession contracts and links the royalty statements to them.
 * ?reparse=sacd reads the stored SACD statements again with the current parser.
 */
export const POST: RequestHandler = async ({ url }) => {
	const data = await readData();
	let reparsed = 0;
	const failures: string[] = [];

	if (url.searchParams.get('reparse') === 'sacd') {
		for (const payment of data.royalties) {
			if (payment.source !== 'SACD' || !payment.storedName) continue;
			try {
				const buffer = await readStoredFile(payment.storedName);
				const text = await extractTextFromBuffer(payment.fileName || payment.storedName, 'application/pdf', Buffer.from(buffer));
				const parsed = analyzeSacdStatement(text, payment.fileName || payment.storedName);
				if (!parsed) {
					failures.push(payment.fileName);
					continue;
				}
				Object.assign(payment, { ...parsed, status: payment.status, workId: '' });
				reparsed += 1;
			} catch {
				failures.push(payment.fileName);
			}
		}
	}

	const changed = await syncWorks(data, async (document) => {
		const buffer = await readStoredFile(document.storedName);
		return extractTextFromBuffer(document.fileName, document.mimeType, Buffer.from(buffer));
	});
	const saved = changed || reparsed ? await saveData(data) : data;
	return json({ data: saved, changed, reparsed, failures });
};
