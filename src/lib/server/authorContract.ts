import type { AppData, Contract, Project } from '$lib/types';
import { createId } from '$lib/server/storage';

/** True when the text is an author-rights assignment (cession de droits d'auteur), not a payslip. */
export function isAuthorRightsContract(text: string) {
	if (!/CONTRAT\s+DE\s+(R[ÉE]ALISATION[^\n]{0,80})?CESSION\s+DE\s+DROITS|CESSION\s+DE\s+DROITS\s+D.?AUTEUR|AVENANT[^\n]{0,40}CESSION\s+DE\s+DROITS/i.test(text)) {
		return false;
	}
	// A payslip or an AEM in the same file is a salary document, never an author contract.
	return !/BULLETIN\s+DE\s+(PAIE|SALAIRE)|P[ÉE]RIODE\s+DE\s+PAIE|ATTESTATION\s*\(AEM\)/i.test(text);
}

const romans: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7' };
const stopWords = new Set(['aus', 'the', 'les', 'des', 'and', 'avec', 'pour', 'stockhausen', 'documentaire', 'docu', 'film']);

function tokens(value: string) {
	return value
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/\bactes?\b/g, ' acte ')
		.split(/[^a-z0-9]+/)
		.map((word) => romans[word] ?? word)
		.filter((word) => word && (/\d/.test(word) || (word.length > 2 && !stopWords.has(word))));
}

/** Finds the project an author contract belongs to, by title words; numbers (Acte 3 vs Actes 1 et 2) must agree. */
export function findProjectForAuthorContract(projects: Project[], title: string, companyId: string) {
	const wanted = tokens(title);
	if (!wanted.length) return undefined;
	const wantedNumbers = wanted.filter((word) => /^\d{1,2}$/.test(word));
	let best: { project: Project; score: number } | undefined;

	for (const project of projects) {
		if (companyId && project.companyId && project.companyId !== companyId) continue;
		const own = tokens(project.name);
		if (!own.length) continue;
		const ownNumbers = own.filter((word) => /^\d{1,2}$/.test(word));
		if ((wantedNumbers.length || ownNumbers.length) && wantedNumbers.join() !== ownNumbers.join()) continue;
		const words = own.filter((word) => !/^\d{1,2}$/.test(word));
		if (!words.length) continue;
		const wantedWords = wanted.filter((word) => !/^\d{1,2}$/.test(word));
		const shared = words.filter((word) => wanted.includes(word)).length;
		const smaller = Math.min(words.length, wantedWords.length);
		if (shared < Math.min(2, smaller)) continue;
		const score = shared / Math.max(1, smaller);
		if (score >= 0.6 && (!best || score > best.score)) best = { project, score };
	}
	return best?.project;
}

/**
 * Where an author contract goes: the project's existing "droits d'auteur" sheet, else its first
 * salary contract, else a new 0 € "droits d'auteur" sheet (in a new project if needed).
 * Never changes salary, hours or dates of an existing contract.
 */
export function routeAuthorContract(
	data: AppData,
	title: string,
	companyId: string,
	companyShortName: string,
	newContractId: string
): { contract: Contract; created: boolean } {
	let project = findProjectForAuthorContract(data.projects, title, companyId);
	if (!project) {
		project = {
			id: createId('project'),
			companyId,
			name: title,
			role: 'Réalisateur',
			location: '',
			startDate: '',
			endDate: '',
			notes: 'Créé depuis un contrat de cession de droits d’auteur.'
		};
		data.projects.unshift(project);
	}
	const inProject = data.contracts
		.filter((contract) => contract.projectId === project.id)
		.sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));
	const existing =
		inProject.find((contract) => /droits d.auteur/i.test(contract.title + ' ' + contract.notes)) ?? inProject[0];
	if (existing) return { contract: existing, created: false };

	const now = new Date().toISOString();
	const contract: Contract = {
		id: newContractId,
		companyId: companyId || project.companyId,
		projectId: project.id,
		title: `${companyShortName ? companyShortName + ' · ' : ''}${project.name} · droits d’auteur`,
		startDate: '',
		endDate: '',
		hours: 0,
		cachets: 0,
		employmentStatus: '',
		netSalary: 0,
		taxableNetSalary: 0,
		grossSalary: 0,
		contributions: 0,
		netHourlyRate: 0,
		grossHourlyRate: 0,
		status: 'Signé',
		notes: 'Contrat de cession de droits d’auteur : pas de salaire (les droits sont dans l’onglet Droits d’auteur).',
		documentIds: [],
		createdAt: now,
		updatedAt: now
	};
	data.contracts.unshift(contract);
	return { contract, created: true };
}
