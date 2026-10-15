import { findProjectForProduction } from '$lib/server/contractImport';
import { createId } from '$lib/server/storage';
import type { AppData, Contract } from '$lib/types';

function titleCase(value: string) {
	return value
		.toLocaleLowerCase('fr')
		.replace(/(^|[\s/(-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase('fr'));
}

/**
 * Project name from the payroll "Analytique" line, e.g.
 * "Analytique : 203 CHANTS LIBRES 2026 Allègement…" → "Chants Libres 2026",
 * "Analytique : SP2609STOCKBERL STOCKHAUSEN / LE BALCON - … /2211 Dans votre…" → "Stockhausen / Le Balcon - …".
 */
export function extractAnalytique(text: string) {
	const flat = text.replace(/\s+/g, ' ');
	const raw = flat.match(
		/analytique\s*:\s*(.+?)(?=\s+(?:all[eè]gement|dans votre|net pay|total vers|$))/i
	)?.[1];
	if (!raw) return '';

	const cleaned = raw
		.replace(/^(?:\d+|[A-Z]{1,4}\d+\S*)\s+/i, '')
		.replace(/\s*\/\s*\d+\s*$/, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 60)
		.trim();
	return cleaned.length >= 3 ? titleCase(cleaned) : '';
}

/** Links the contract to the project (created if needed) unless it already has one. */
export function linkContractToProject(data: AppData, contract: Contract, projectName: string) {
	if (!projectName || contract.projectId) return false;

	let project = findProjectForProduction(data.projects, projectName, contract.companyId);
	if (!project) {
		project = {
			id: createId('project'),
			companyId: contract.companyId,
			name: projectName,
			role: '',
			location: '',
			startDate: contract.startDate,
			endDate: contract.endDate,
			notes: 'Créé depuis la ligne « Analytique » du bulletin.'
		};
		data.projects.unshift(project);
	} else {
		if (contract.startDate && (!project.startDate || contract.startDate < project.startDate)) {
			project.startDate = contract.startDate;
		}
		if (contract.endDate && contract.endDate > project.endDate) project.endDate = contract.endDate;
	}
	contract.projectId = project.id;
	return true;
}
