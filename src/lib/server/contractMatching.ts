import type { AppData, Company, Contract, ContractDocument, ContractFields } from '$lib/types';

export type EmployerRelationship = 'same' | 'different' | 'unknown';

function fileNameStem(fileName: string) {
	return fileName
		.replace(/^.*[/\\]/, '')
		.replace(/\.[^.]+$/, '')
		.trim();
}

function stripDocumentRolePrefix(value: string) {
	return value.replace(/^\s*\[[^\]]+\]\s*/, '').trim();
}

function isoFileDate(year: string, month: string, day: string) {
	const fullYear = Number(year);
	const monthNumber = Number(month);
	const dayNumber = Number(day);
	const date = new Date(Date.UTC(fullYear, monthNumber - 1, dayNumber));

	if (
		date.getUTCFullYear() !== fullYear ||
		date.getUTCMonth() !== monthNumber - 1 ||
		date.getUTCDate() !== dayNumber
	) {
		return '';
	}

	return `${String(fullYear).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}-${String(
		dayNumber
	).padStart(2, '0')}`;
}

export function dateFromFileName(fileName: string) {
	const stem = stripDocumentRolePrefix(fileNameStem(fileName));
	const ymd = stem.match(/\b((?:19|20)\d{2})[-_. ]*([01]?\d)[-_. ]*([0-3]?\d)\b/);
	if (ymd) return isoFileDate(ymd[1], ymd[2], ymd[3]);

	const dmy = stem.match(/\b([0-3]?\d)[-_. ]*([01]?\d)[-_. ]*((?:19|20)\d{2})\b/);
	if (dmy) return isoFileDate(dmy[3], dmy[2], dmy[1]);

	return '';
}

export function companyNameFromFileName(fileName: string) {
	return stripDocumentRolePrefix(fileNameStem(fileName))
		.replace(/\b(?:19|20)\d{2}[-_. ]*[01]?\d[-_. ]*[0-3]?\d\b/g, ' ')
		.replace(/\b[0-3]?\d[-_. ]*[01]?\d[-_. ]*(?:19|20)\d{2}\b/g, ' ')
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function normalizeSearch(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function normalizeDigits(value: string) {
	return value.replace(/\D/g, '');
}

export function extractSirets(text: string) {
	const candidates = new Set<string>();
	const normalized = text.replace(/\u0000/g, ' ');
	const patterns = [
		/\b(\d{14})\b/g,
		/\b(\d{3})\s*(\d{3})\s*(\d{3})\s*(\d{5})\b/g,
		/\b(\d{9})\s*(\d{5})\b/g
	];

	for (const pattern of patterns) {
		for (const match of normalized.matchAll(pattern)) {
			const digits = match.slice(1).join('').replace(/\D/g, '');
			if (digits.length === 14) candidates.add(digits);
		}
	}

	return [...candidates];
}

export function parseDate(value: string) {
	const date = new Date(`${value}T00:00:00`);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
	const aStart = parseDate(startA);
	const bStart = parseDate(startB);
	if (!aStart || !bStart) return false;

	const aEnd = parseDate(endA) ?? aStart;
	const bEnd = parseDate(endB) ?? bStart;
	return aStart <= bEnd && bStart <= aEnd;
}

function documentFileGroupKey(fileName: string) {
	const date = dateFromFileName(fileName);
	const companyName = companyNameFromFileName(fileName);
	const normalizedCompany = normalizeSearch(companyName);

	return date && normalizedCompany ? `${date}:${normalizedCompany}` : '';
}

function identityKeysForSiret(value: string) {
	const siret = normalizeDigits(value);
	if (siret.length !== 14) return [];

	return [`siret:${siret}`, `siren:${siret.slice(0, 9)}`];
}

function companyIdentityKeys(company: Company | undefined) {
	if (!company) return [];

	const keys = new Set<string>([`company:${company.id}`]);
	const siret = normalizeDigits(company.siret);
	const siren = normalizeDigits(company.siren) || (siret.length === 14 ? siret.slice(0, 9) : '');
	if (siret.length === 14) keys.add(`siret:${siret}`);
	if (siren.length === 9) keys.add(`siren:${siren}`);

	for (const name of [company.legalName, company.name]) {
		const normalized = normalizeSearch(name);
		if (normalized) keys.add(`name:${normalized}`);
	}

	return [...keys];
}

function incomingEmployerKeys(data: AppData, companyId: string, incomingSirets: string[]) {
	const keys = new Set(
		companyIdentityKeys(data.companies.find((company) => company.id === companyId))
	);
	for (const siret of incomingSirets) {
		for (const key of identityKeysForSiret(siret)) keys.add(key);
	}
	return keys;
}

function contractEmployerKeys(data: AppData, contract: Contract, documents: ContractDocument[]) {
	const keys = new Set(
		companyIdentityKeys(data.companies.find((company) => company.id === contract.companyId))
	);

	for (const document of documents) {
		const documentCompanyId = document.extractedFields.companyId;
		if (documentCompanyId) {
			for (const key of companyIdentityKeys(
				data.companies.find((company) => company.id === documentCompanyId)
			)) {
				keys.add(key);
			}
		}
		for (const siret of extractSirets(document.extractedTextPreview)) {
			for (const key of identityKeysForSiret(siret)) keys.add(key);
		}
	}

	return keys;
}

export function contractEmployerRelationship(
	data: AppData,
	contract: Contract,
	documents: ContractDocument[],
	incomingCompanyId: string,
	incomingSirets: string[]
): EmployerRelationship {
	const incomingKeys = incomingEmployerKeys(data, incomingCompanyId, incomingSirets);
	const existingKeys = contractEmployerKeys(data, contract, documents);
	if (!incomingKeys.size || !existingKeys.size) return 'unknown';

	return [...incomingKeys].some((key) => existingKeys.has(key)) ? 'same' : 'different';
}

function closeNumber(a: number, b: number, tolerance = 0.01) {
	return a > 0 && b > 0 && Math.abs(a - b) <= Math.max(tolerance, Math.abs(a) * 0.01);
}

function normalizedPeriod(startDate: string, endDate: string) {
	if (!startDate) return undefined;
	return {
		startDate,
		endDate: endDate || startDate
	};
}

function contractPeriods(contract: Contract, documents: ContractDocument[]) {
	const periods = new Map<string, { startDate: string; endDate: string }>();

	for (const period of [
		normalizedPeriod(contract.startDate, contract.endDate),
		...documents.map((document) =>
			normalizedPeriod(
				document.extractedFields?.startDate ?? '',
				document.extractedFields.endDate ?? document.extractedFields?.startDate ?? ''
			)
		)
	]) {
		if (period) periods.set(`${period.startDate}/${period.endDate}`, period);
	}

	return [...periods.values()];
}

function incomingPeriodFromFields(fields: Partial<ContractFields>) {
	return normalizedPeriod(fields?.startDate ?? '', fields.endDate ?? fields?.startDate ?? '');
}

function hasExactPeriodMatch(
	fields: Partial<ContractFields>,
	periods: { startDate: string; endDate: string }[]
) {
	const incoming = incomingPeriodFromFields(fields);
	if (!incoming) return false;

	return periods.some(
		(period) =>
			period.startDate === incoming.startDate &&
			(period.endDate || period.startDate) === incoming.endDate
	);
}

function hasOverlappingPeriodMatch(
	fields: Partial<ContractFields>,
	periods: { startDate: string; endDate: string }[]
) {
	const incoming = incomingPeriodFromFields(fields);
	if (!incoming) return false;

	return periods.some((period) =>
		rangesOverlap(
			period.startDate,
			period.endDate || period.startDate,
			incoming.startDate,
			incoming.endDate || incoming.startDate
		)
	);
}

function scoreContract(
	data: AppData,
	contract: Contract,
	fields: Partial<ContractFields>,
	companyId: string,
	projectId: string,
	incomingSirets: string[],
	documents: ContractDocument[],
	originalFileName: string
) {
	const periods = contractPeriods(contract, documents);
	const incomingHasPeriod = Boolean(fields.startDate);
	const exactPeriodMatch = hasExactPeriodMatch(fields, periods);
	const overlappingPeriodMatch = hasOverlappingPeriodMatch(fields, periods);
	const employerRelationship = contractEmployerRelationship(
		data,
		contract,
		documents,
		companyId,
		incomingSirets
	);
	const incomingGroupKey = documentFileGroupKey(originalFileName);
	const sameDocumentGroup = Boolean(
		incomingGroupKey &&
		documents.some(
			(document) => documentFileGroupKey(document.originalFileName) === incomingGroupKey
		)
	);

	if (employerRelationship === 'different') return -1;
	// Same project, different job: a director's contract (artist, paid per cachet) and an editor's
	// contract (technician cadre, paid per day) must stay separate even when the dates overlap.
	if (projectId && contract.projectId && contract.projectId !== projectId) return -1;
	const payKind = (cachets?: number, hours?: number, gross?: number) =>
		(cachets ?? 0) > 0 ? 'cachet' : (hours ?? 0) > 0 && (gross ?? 0) > 0 ? 'jour' : '';
	const incomingPay = payKind(fields.cachets, fields.hours, fields.grossSalary);
	const contractPay = payKind(contract.cachets, contract.hours, contract.grossSalary);
	if (incomingPay && contractPay && incomingPay !== contractPay) return -1;
	const roleKind = (status?: string) =>
		/technicien/i.test(status ?? '') ? 'technicien' : /artiste/i.test(status ?? '') ? 'artiste' : '';
	const incomingRole = roleKind(fields.employmentStatus);
	const contractRole = roleKind(contract.employmentStatus);
	if (incomingRole && contractRole && incomingRole !== contractRole) return -1;
	if (incomingHasPeriod && periods.length > 0 && !exactPeriodMatch && !overlappingPeriodMatch) {
		return -1;
	}

	let score = 0;

	if (documents.some((document) => document.originalFileName === originalFileName)) score += 100;
	if (sameDocumentGroup) score += 48;
	if (employerRelationship === 'same') score += 55;
	if (exactPeriodMatch) score += 60;
	else if (overlappingPeriodMatch) score += 34;
	if (projectId && contract.projectId === projectId) score += 52;
	if (companyId && contract.companyId === companyId) score += 30;
	if (fields.startDate && contract.startDate === fields.startDate) score += 28;
	if (fields.endDate && contract.endDate === fields.endDate) score += 22;
	if (fields.grossSalary && closeNumber(contract.grossSalary, fields.grossSalary, 1)) score += 18;
	if (fields.netSalary && closeNumber(contract.netSalary, fields.netSalary, 1)) score += 14;
	if (fields.hours && closeNumber(contract.hours, fields.hours, 0.25)) score += 16;
	if (fields.cachets && contract.cachets === fields.cachets) score += 10;

	return score;
}

export function findExistingContract(
	data: AppData,
	fields: Partial<ContractFields>,
	companyId: string,
	projectId: string,
	incomingSirets: string[],
	originalFileName: string
) {
	const scored = data.contracts
		.map((contract) => ({
			contract,
			score: scoreContract(
				data,
				contract,
				fields,
				companyId,
				projectId,
				incomingSirets,
				data.documents.filter((document) => document.contractId === contract.id),
				originalFileName
			)
		}))
		.sort((a, b) => b.score - a.score);

	const best = scored[0];
	return best && best.score >= 44 ? best.contract : undefined;
}
