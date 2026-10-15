import { json, type RequestHandler } from '@sveltejs/kit';

import { extractPdfDocumentText } from '$lib/server/documentAnalysis';
import { extractAnalytique, linkContractToProject } from '$lib/server/projectFromPayslip';
import { readData, readStoredFile, saveData } from '$lib/server/storage';

/** One-time pass: link already-imported contracts to the project named on their payslip. */
export const POST: RequestHandler = async () => {
	const data = await readData();
	const pending = data.contracts.filter((contract) => !contract.projectId);
	const names = new Map<string, string>();

	const jobs = pending.map((contract) => async () => {
		const documents = data.documents.filter((document) => contract.documentIds.includes(document.id));
		const payslips = documents.filter(
			(document) =>
				/bulletin|bul_|^bp-|paie/i.test(document.originalFileName || document.fileName) ||
				document.kind === 'Fiche de paie'
		);
		for (const document of payslips) {
			try {
				const buffer = await readStoredFile(document.storedName);
				const name = extractAnalytique((await extractPdfDocumentText(buffer)).text);
				if (name) {
					names.set(contract.id, name);
					return;
				}
			} catch (cause) {
				console.error('Lecture du bulletin impossible:', document.storedName, cause);
			}
		}
	});

	for (let index = 0; index < jobs.length; index += 6) {
		await Promise.all(jobs.slice(index, index + 6).map((job) => job()));
	}

	const linked: { contract: string; project: string }[] = [];
	for (const contract of pending) {
		const name = names.get(contract.id);
		if (name && linkContractToProject(data, contract, name)) {
			linked.push({ contract: contract.title, project: name });
		}
	}

	const saved = await saveData(data);
	return json({ data: saved, linked });
};
