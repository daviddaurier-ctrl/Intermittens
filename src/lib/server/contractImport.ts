import type { AppData, Company, ContractFields, Project } from '$lib/types';

type ContractPayFields = Pick<
	ContractFields,
	'hours' | 'netSalary' | 'grossSalary' | 'contributions' | 'netHourlyRate' | 'grossHourlyRate'
>;

const frenchMonths = [
	'janvier',
	'février',
	'mars',
	'avril',
	'mai',
	'juin',
	'juillet',
	'août',
	'septembre',
	'octobre',
	'novembre',
	'décembre'
];

export function normalizeProjectName(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

export function findProjectForProduction(
	projects: Project[],
	productionName: string,
	companyId = ''
) {
	const productionKey = normalizeProjectName(productionName);
	if (!productionKey) return undefined;

	const matches = projects.filter(
		(project) => normalizeProjectName(project.name) === productionKey
	);
	if (!matches.length) return undefined;

	if (companyId) {
		return (
			matches.find((project) => project.companyId === companyId) ??
			(matches.length === 1 && !matches[0].companyId ? matches[0] : undefined)
		);
	}

	return matches.length === 1 ? matches[0] : undefined;
}

export function importMonthLabel(dateValue: string) {
	const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(dateValue);
	if (!match) return '';

	const monthIndex = Number(match[2]) - 1;
	const month = frenchMonths[monthIndex];
	return month ? `${month} ${match[1]}` : '';
}

export function importedContractTitle(subject: string, dateValue: string) {
	const cleanedSubject = subject.replace(/\s+/g, ' ').trim();
	const month = importMonthLabel(dateValue);

	if (cleanedSubject && month) return `${cleanedSubject} · ${month}`;
	return cleanedSubject || (month ? `Contrat · ${month}` : 'Contrat importé');
}

export function deriveMissingPayFields(contract: ContractPayFields) {
	const derived: Partial<ContractPayFields> = {};

	if (contract.hours > 0 && contract.grossSalary > 0 && !contract.grossHourlyRate) {
		derived.grossHourlyRate = Number((contract.grossSalary / contract.hours).toFixed(2));
	}

	if (contract.hours > 0 && contract.netSalary > 0 && !contract.netHourlyRate) {
		derived.netHourlyRate = Number((contract.netSalary / contract.hours).toFixed(2));
	}

	if (!contract.contributions && contract.grossSalary > 0 && contract.netSalary > 0) {
		derived.contributions = Number((contract.grossSalary - contract.netSalary).toFixed(2));
	}

	return derived;
}

const SMALL_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'en', 'a', 'au', 'aux']);
const LEGAL_FORMS = new Set(['sarl', 'sas', 'sasu', 'eurl', 'sa', 'scop', 'snc', 'sci', 'scic', 'ste']);

/**
 * Short name of a production company, used to start every contract title:
 * initials of a multi-word name ("Futur Antérieur Production" → "FAP"),
 * the word itself for a one-word name. `company.shortName` overrides it.
 */
export function companyShortName(company: Pick<Company, 'name' | 'legalName'> & { shortName?: string }) {
	if (company.shortName?.trim()) return company.shortName.trim();
	const source = (company.name || company.legalName || '').split('(')[0];
	const words = source
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.split(/[^A-Za-z0-9]+/)
		.filter((word) => word && !SMALL_WORDS.has(word.toLowerCase()) && !LEGAL_FORMS.has(word.toLowerCase()));
	if (!words.length) return source.trim();
	if (words.length === 1) return words[0].toUpperCase();
	return words.map((word) => word[0].toUpperCase()).join('');
}

/** "FAP · Projet · octobre 2026": always starts with the production company's short name. */
export function contractTitleFor(company: Company | undefined, project: Project | undefined, dateValue: string) {
	const parts = [company ? companyShortName(company) : '', project?.name.trim() ?? '', importMonthLabel(dateValue)];
	return parts.filter(Boolean).join(' · ');
}

/** Rewrites every contract title that has a known company so it follows contractTitleFor. */
export function retitleContracts(data: AppData) {
	for (const contract of data.contracts) {
		const company = data.companies.find((item) => item.id === contract.companyId);
		if (!company) continue;
		const project = data.projects.find((item) => item.id === contract.projectId);
		const title = contractTitleFor(company, project, contract.startDate || contract.endDate);
		if (title && contract.title !== title) contract.title = title;
	}
	return data;
}
