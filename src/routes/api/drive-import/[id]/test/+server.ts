import { error, json, type RequestHandler } from '@sveltejs/kit';

import {
	analyzeDocumentText,
	extractPdfDocumentText,
	extractTextFromBuffer
} from '$lib/server/documentAnalysis';
import { driveDownloadById, driveEnabled } from '$lib/server/googleDrive';
import { splitAndClassifyDocument } from '$lib/server/pdfParts';

/** Dry run: analyses one Drive document and reports what was found, without saving anything. */
export const GET: RequestHandler = async ({ params, url }) => {
	if (!driveEnabled()) error(400, "Google Drive n'est pas relié.");

	const file = await driveDownloadById(params.id ?? '');
	if (!file) error(404, 'Document introuvable.');

	const started = Date.now();
	const isPdf = (file.meta.mimeType ?? '').includes('pdf');
	const extraction = isPdf
		? await extractPdfDocumentText(file.content)
		: (() => ({ pages: [] as string[], ocrPageNumbers: [] as number[], ocrFailed: false, text: '' }))();
	if (!isPdf) {
		extraction.text = await extractTextFromBuffer(file.meta.name, file.meta.mimeType ?? '', file.content);
		extraction.pages = [extraction.text];
	}
	const analysis = analyzeDocumentText(extraction.text);
	// Same split/classification as the real import, to explain what it will do.
	const parts = await splitAndClassifyDocument(file.meta.name, file.meta.mimeType ?? '', file.content, 'Autre');

	return json({
		name: file.meta.name,
		pages: extraction.pages.length,
		ocrPages: extraction.ocrPageNumbers,
		ocrFailed: extraction.ocrFailed,
		textStart: extraction.text.slice(0, url.searchParams.has('full') ? 8000 : 300),
		fields: analysis.fields,
		notes: analysis.notes,
		parts: parts.map((part) => ({
			kind: part.kind,
			pages: `${part.pageStart}-${part.pageEnd}`,
			fields: analyzeDocumentText(part.text).fields,
			textStart: part.text.slice(0, 200)
		})),
		seconds: Math.round((Date.now() - started) / 100) / 10
	});
};
