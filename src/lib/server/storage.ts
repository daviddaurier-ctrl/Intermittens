import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultCompanyColor, normalizeCompanyColor } from '$lib/companyColors';
import {
	DOCUMENT_TYPE_FOLDERS,
	driveDailyBackup,
	driveEnabled,
	driveListFiles,
	driveReadFile,
	driveRenameFile,
	driveTrashFile,
	driveWriteFile,
	storageRequiresDrive
} from '$lib/server/googleDrive';
import type {
	AppData,
	AuthorWork,
	Company,
	CongesPayment,
	Contract,
	ContractFields,
	FutureContract,
	FutureContractAmountType,
	IntermittencePeriod,
	MonthlyInfo,
	Project,
	RoyaltyPayment,
	RoyaltySource,
	RoyaltyStatus,
	TaxYearSettings,
	WorkKind
} from '$lib/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const dataDir = path.join(root, 'data');
export const documentDir = path.join(dataDir, 'documents');
const dataFileName = 'intermittens.json';
const dataFile = path.join(dataDir, dataFileName);
const documentDirResolved = path.resolve(documentDir);

const now = () => new Date().toISOString();

export function createId(prefix: string) {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyContractFields(): ContractFields {
	return {
		companyId: '',
		projectId: '',
		title: '',
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
		status: 'Estimation',
		notes: ''
	};
}

export function createDefaultData(): AppData {
	return {
		version: 1,
		updatedAt: now(),
		companies: [
			{
				id: createId('company'),
				name: 'Compagnie exemple',
				legalName: '',
				contactName: '',
				email: '',
				phone: '',
				address: '',
				postalCode: '',
				city: '',
				siren: '',
				siret: '',
				ape: '',
				legalCategory: '',
				activityLabel: '',
				color: defaultCompanyColor('Compagnie exemple'),
				source: '',
				sourceUpdatedAt: '',
				notes: 'Remplace cette fiche par tes vraies structures.'
			}
		],
		projects: [],
		contracts: [],
		documents: [],
		periods: [],
		futureContracts: [],
		monthlyInfos: [],
		works: [],
		royalties: [],
		congesPayments: [],
		franceTravailDocs: [],
		settings: {
			referenceStartDate: `${new Date().getFullYear()}-01-01`,
			targetHours: 507,
			annex: 'Annexe 8',
			minDailyAllowance: 31.97,
			smicHourlyGross: 11.88,
			annex8SalaryCoefficient: 0.42,
			annex8HoursCoefficient: 0.26,
			annex8FixedCoefficient: 0.4,
			monthlyWorkDayDivisor: 8,
			monthlyShiftCoefficient: 1.4,
			pmss: 3925,
			cumulPmssMultiplier: 1.18,
			transatEmail: '',
			ghsApiBaseUrl: '',
			ghsApiToken: '',
			ghsSyncEnabled: false,
			ghsLastSyncAt: '',
			ghsLastSyncStatus: 'Connecteur non configuré',
			activePeriodId: '',
			remoteBaseUrl: 'https://yoursite.fr/intermittens',
			remoteSyncEnabled: false,
			remoteLastSyncAt: '',
			remoteLastSyncStatus: 'Synchronisation distante non activée',
			driveImportFolder: 'salaire',
			driveImportedFileIds: [],
			taxYears: {}
		}
	};
}

/** Google Drive when configured; otherwise the local `data/` folder (original behaviour). */
function useDrive() {
	if (driveEnabled()) return true;
	if (storageRequiresDrive()) {
		throw new Error(
			"Stockage non configuré : sur Vercel, reliez d'abord Google Drive via la page /setup-google."
		);
	}
	return false;
}

function mimeTypeFor(storedName: string) {
	const extension = path.extname(storedName).toLowerCase();
	if (extension === '.pdf') return 'application/pdf';
	if (extension === '.png') return 'image/png';
	if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
	if (extension === '.txt') return 'text/plain';
	return 'application/octet-stream';
}

export async function writeStoredFile(storedName: string, content: Buffer | Uint8Array) {
	if (useDrive()) {
		await driveWriteFile('documents', storedName, content, mimeTypeFor(storedName));
		return;
	}
	const target = resolveStoredDocumentPath(storedName);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, content);
}

export async function readStoredFile(storedName: string) {
	if (useDrive()) {
		const file = await driveReadFile('documents', storedName);
		if (!file) throw new Error(`Fichier introuvable sur Google Drive : ${storedName}`);
		return file;
	}
	return readFile(resolveStoredDocumentPath(storedName));
}

async function ensureDataFiles() {
	await mkdir(documentDir, { recursive: true });

	try {
		await stat(dataFile);
	} catch {
		await writeJson(createDefaultData());
	}
}

function normalizeNumber(value: unknown) {
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

function cleanString(value: unknown) {
	return typeof value === 'string' ? value : '';
}

function normalizeFutureContractAmountType(value: unknown): FutureContractAmountType {
	const amountType = cleanString(value);

	return amountType === 'employerCost' || amountType === 'gross' || amountType === 'net'
		? amountType
		: 'gross';
}

/**
 * "FUTUR ANTERIEUR PRODUCTION (FUTUR ANTERIEUR PRODUCTION)" → "FUTUR ANTERIEUR PRODUCTION":
 * drops a parenthesised trade name that only repeats words already in the name.
 */
export function withoutRepeatedTradeName(value: string) {
	return value.replace(/^([^()]+?)\s*\(([^()]+)\)/, (whole, outer: string, inner: string) => {
		const words = (text: string) =>
			text
				.normalize('NFD')
				.replace(/\p{Diacritic}/gu, '')
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter((word) => word.length >= 2);
		const outerWords = new Set(words(outer));
		const innerWords = words(inner);
		return innerWords.length && innerWords.every((word) => outerWords.has(word)) ? outer.trim() : whole;
	});
}

function normalizeCompany(company: Partial<Company>): Company {
	const id = cleanString(company.id) || createId('company');
	const name = withoutRepeatedTradeName(cleanString(company.name)) || 'Nouvelle structure';

	return {
		id,
		name,
		legalName: cleanString(company.legalName),
		contactName: cleanString(company.contactName),
		email: cleanString(company.email),
		phone: cleanString(company.phone),
		address: cleanString(company.address),
		postalCode: cleanString(company.postalCode),
		city: cleanString(company.city),
		siren: cleanString(company.siren),
		siret: cleanString(company.siret),
		ape: cleanString(company.ape),
		legalCategory: cleanString(company.legalCategory),
		activityLabel: cleanString(company.activityLabel),
		color: normalizeCompanyColor(cleanString(company.color), `${id}:${name}`),
		source: cleanString(company.source),
		sourceUpdatedAt: cleanString(company.sourceUpdatedAt),
		notes: cleanString(company.notes)
	};
}

function normalizeProject(project: Partial<Project>): Project {
	return {
		id: cleanString(project.id) || createId('project'),
		companyId: cleanString(project.companyId),
		name: cleanString(project.name) || 'Nouveau projet',
		role: cleanString(project.role),
		location: cleanString(project.location),
		startDate: cleanString(project.startDate),
		endDate: cleanString(project.endDate),
		notes: cleanString(project.notes)
	};
}

function normalizeContract(contract: Partial<Contract>): Contract {
	const fields = emptyContractFields();
	const createdAt = cleanString(contract.createdAt) || now();
	const updatedAt = cleanString(contract.updatedAt) || now();
	const status = cleanString(contract.status);

	return {
		id: cleanString(contract.id) || createId('contract'),
		companyId: cleanString(contract.companyId),
		projectId: cleanString(contract.projectId),
		title: withoutRepeatedTradeName(cleanString(contract.title)) || 'Nouveau contrat',
		startDate: cleanString(contract.startDate),
		endDate: cleanString(contract.endDate),
		hours: normalizeNumber(contract.hours),
		cachets: normalizeNumber(contract.cachets),
		employmentStatus: cleanString(contract.employmentStatus),
		netSalary: normalizeNumber(contract.netSalary),
		taxableNetSalary: normalizeNumber(contract.taxableNetSalary),
		grossSalary: normalizeNumber(contract.grossSalary),
		contributions: normalizeNumber(contract.contributions),
		netHourlyRate: normalizeNumber(contract.netHourlyRate || fields.netHourlyRate),
		grossHourlyRate: normalizeNumber(contract.grossHourlyRate || fields.grossHourlyRate),
		status:
			status === 'Signé' || status === 'Signe'
				? 'Signé'
				: status === 'Payé' || status === 'Paye'
					? 'Payé'
					: status === 'Estimation'
						? 'Estimation'
						: 'Estimation',
		notes: cleanString(contract.notes),
		documentIds: Array.isArray(contract.documentIds) ? contract.documentIds.map(String) : [],
		createdAt,
		updatedAt
	};
}

function normalizeFutureContract(future: Partial<FutureContract>): FutureContract {
	const legacy = future as Partial<FutureContract> & {
		label?: unknown;
		expectedHours?: unknown;
		expectedGrossSalary?: unknown;
	};

	return {
		id: cleanString(future.id) || createId('future'),
		companyName: cleanString(future.companyName) || cleanString(legacy.label),
		amount: normalizeNumber(future.amount ?? legacy.expectedGrossSalary),
		amountType: normalizeFutureContractAmountType(future.amountType),
		estimatedHours: normalizeNumber(future.estimatedHours ?? legacy.expectedHours),
		notes: cleanString(future.notes)
	};
}

function normalizePeriod(period: Partial<IntermittencePeriod>): IntermittencePeriod {
	const createdAt = cleanString(period.createdAt) || now();
	const updatedAt = cleanString(period.updatedAt) || now();

	return {
		id: cleanString(period.id) || createId('period'),
		label: cleanString(period.label) || 'Période intermittence',
		status:
			period.status === 'Notifie' || period.status === 'Archive' || period.status === 'Estimation'
				? period.status
				: 'Estimation',
		admissionDate: cleanString(period.admissionDate),
		indemnizationStartDate: cleanString(period.indemnizationStartDate),
		anniversaryDate: cleanString(period.anniversaryDate),
		referenceStartDate: cleanString(period.referenceStartDate),
		referenceEndDate: cleanString(period.referenceEndDate),
		hours: normalizeNumber(period.hours),
		cachets: normalizeNumber(period.cachets),
		grossSalary: normalizeNumber(period.grossSalary),
		dailyAllowance: normalizeNumber(period.dailyAllowance),
		waitingDays: normalizeNumber(period.waitingDays),
		salaryFranchiseDays: normalizeNumber(period.salaryFranchiseDays),
		congeFranchiseDays: normalizeNumber(period.congeFranchiseDays),
		sourceFileName: cleanString(period.sourceFileName),
		sourceStoredName: cleanString(period.sourceStoredName),
		sourceTextPreview: cleanString(period.sourceTextPreview),
		analysisNotes: Array.isArray(period.analysisNotes) ? period.analysisNotes.map(String) : [],
		createdAt,
		updatedAt,
		notes: cleanString(period.notes)
	};
}

function normalizeMonthlyInfo(info: Partial<MonthlyInfo>): MonthlyInfo {
	return {
		month: cleanString(info.month),
		periodId: cleanString(info.periodId),
		congeSpectacle: normalizeNumber(info.congeSpectacle),
		realIndemnity: normalizeNumber(info.realIndemnity),
		dailyIndemnity: normalizeNumber(info.dailyIndemnity),
		notes: cleanString(info.notes)
	};
}

const royaltySources: RoyaltySource[] = ['SACEM', 'SACD', 'SCAM', 'Droits directs', 'Autre'];
const royaltyStatuses: RoyaltyStatus[] = ['Attendu', 'Reçu', 'Déclaré'];
const workKinds: WorkKind[] = ['Musique', 'Spectacle vivant', 'Audiovisuel', 'Texte', 'Autre'];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
	return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeWork(work: Partial<AuthorWork>): AuthorWork {
	return {
		id: cleanString(work.id) || createId('work'),
		title: cleanString(work.title) || 'Nouvelle œuvre',
		kind: pick(work.kind, workKinds, 'Autre'),
		society: pick(work.society, royaltySources, 'Autre'),
		reference: cleanString(work.reference),
		coAuthors: cleanString(work.coAuthors),
		sharePercent: normalizeNumber(work.sharePercent ?? 100),
		depositDate: cleanString(work.depositDate),
		notes: cleanString(work.notes),
		producer: cleanString(work.producer),
		promisedAmount: normalizeNumber(work.promisedAmount),
		promisedNotes: cleanString(work.promisedNotes),
		sourceDocumentIds: Array.isArray(work.sourceDocumentIds)
			? work.sourceDocumentIds.map(cleanString).filter(Boolean)
			: [],
		projectId: cleanString(work.projectId),
		promisedSalary: normalizeNumber(work.promisedSalary),
		promisedCachets: normalizeNumber(work.promisedCachets),
		salaryNotes: cleanString(work.salaryNotes),
		salaryChecked: work.salaryChecked === true,
		declarations: Array.isArray(work.declarations)
			? work.declarations.map((item) => ({
					society: pick(item?.society, royaltySources, 'SACEM'),
					status: (['À déclarer', 'Déclarée', 'Confirmée'] as const).includes(item?.status as never)
						? item.status
						: 'À déclarer',
					date: cleanString(item?.date),
					reference: cleanString(item?.reference),
					notes: cleanString(item?.notes)
				}))
			: []
	};
}

function normalizeRoyalty(payment: Partial<RoyaltyPayment>): RoyaltyPayment {
	return {
		id: cleanString(payment.id) || createId('royalty'),
		source: pick(payment.source, royaltySources, 'Autre'),
		payerName: cleanString(payment.payerName),
		workId: cleanString(payment.workId),
		label: cleanString(payment.label),
		paymentDate: cleanString(payment.paymentDate),
		grossAmount: normalizeNumber(payment.grossAmount),
		withheldContributions: normalizeNumber(payment.withheldContributions),
		netAmount: normalizeNumber(payment.netAmount),
		contributionsWithheld: payment.contributionsWithheld !== false,
		status: pick(payment.status, royaltyStatuses, 'Reçu'),
		notes: cleanString(payment.notes),
		taxableAmount:
			normalizeNumber(payment.taxableAmount) ||
			normalizeNumber(
				cleanString(payment.notes)
					.match(/net imposable\s*:\s*([0-9 ]+(?:,[0-9]+)?)/i)?.[1]
					?.replace(/\s/g, '')
					.replace(',', '.')
			),
		fileName: cleanString(payment.fileName),
		storedName: cleanString(payment.storedName),
		lines: Array.isArray(payment.lines)
			? payment.lines.map((line) => ({
					title: cleanString(line?.title),
					workId: cleanString(line?.workId),
					broadcaster: cleanString(line?.broadcaster),
					period: cleanString(line?.period),
					count: normalizeNumber(line?.count),
					duration: cleanString(line?.duration),
					mode: cleanString(line?.mode),
					country: cleanString(line?.country),
					amount: normalizeNumber(line?.amount),
					societyFee: normalizeNumber(line?.societyFee),
					sharePercent: normalizeNumber(line?.sharePercent),
					flags: cleanString(line?.flags),
					producer: cleanString(line?.producer),
					workCode: cleanString(line?.workCode)
				}))
			: []
	};
}

function normalizeCongesPayment(payment: Partial<CongesPayment>): CongesPayment {
	return {
		id: cleanString(payment.id) || createId('conges'),
		paymentDate: cleanString(payment.paymentDate),
		season: cleanString(payment.season),
		grossAmount: normalizeNumber(payment.grossAmount),
		netAmount: normalizeNumber(payment.netAmount),
		taxableAmount: normalizeNumber(payment.taxableAmount),
		withheldTax: normalizeNumber(payment.withheldTax),
		days: normalizeNumber(payment.days),
		fileName: cleanString(payment.fileName),
		storedName: cleanString(payment.storedName),
		notes: cleanString(payment.notes)
	};
}

export function defaultTaxYear(): TaxYearSettings {
	// Bounds of the 10 % deduction for 2025 income (declared in 2026); editable per year.
	return {
		flatDeductionMin: 509,
		flatDeductionMax: 14555,
		unemploymentTaxable: 0,
		congesSpectaclesTaxable: 0,
		withheldAtSource: 0,
		mileageKm: 0,
		mileageRate: 0,
		meals: 0,
		equipment: 0,
		otherExpenses: 0,
		notes: ''
	};
}

function normalizeTaxYear(value: Partial<TaxYearSettings>): TaxYearSettings {
	const defaults = defaultTaxYear();
	return {
		flatDeductionMin: normalizeNumber(value.flatDeductionMin ?? defaults.flatDeductionMin),
		flatDeductionMax: normalizeNumber(value.flatDeductionMax ?? defaults.flatDeductionMax),
		unemploymentTaxable: normalizeNumber(value.unemploymentTaxable),
		congesSpectaclesTaxable: normalizeNumber(value.congesSpectaclesTaxable),
		withheldAtSource: normalizeNumber(value.withheldAtSource),
		mileageKm: normalizeNumber(value.mileageKm),
		mileageRate: normalizeNumber(value.mileageRate),
		meals: normalizeNumber(value.meals),
		equipment: normalizeNumber(value.equipment),
		otherExpenses: normalizeNumber(value.otherExpenses),
		notes: cleanString(value.notes)
	};
}

const TECHNICAL_JOB =
	/\b(?:concepteur|conceptrice|createur|creatrice|ingenieur|ingenieure)\s+(?:du\s+|de\s+la\s+)?(?:son|sonore|lumiere|lumieres)\b|\b(?:sonorisateur|eclairagiste|machiniste)\b/i;

/** Contracts read as "Artiste" although their document names a technical job (sound, light…). */
function fixTechnicalStatuses(data: AppData) {
	for (const contract of data.contracts) {
		if (contract.employmentStatus !== 'Artiste') continue;
		const texts = data.documents
			.filter((document) => contract.documentIds.includes(document.id))
			.map((document) =>
				document.extractedTextPreview
					.normalize('NFD')
					.replace(/\p{Diacritic}/gu, '')
					.toLowerCase()
			);
		if (texts.some((text) => TECHNICAL_JOB.test(text))) contract.employmentStatus = 'Technicien';
	}
	return data;
}

export function normalizeData(input: Partial<AppData>): AppData {
	const defaults = createDefaultData();
	const settings = { ...defaults.settings, ...(input.settings ?? {}) };

	return fixTechnicalStatuses({
		version: 1,
		updatedAt: now(),
		companies: Array.isArray(input.companies) ? input.companies.map(normalizeCompany) : [],
		projects: Array.isArray(input.projects) ? input.projects.map(normalizeProject) : [],
		contracts: Array.isArray(input.contracts) ? input.contracts.map(normalizeContract) : [],
		documents: Array.isArray(input.documents) ? input.documents : [],
		periods: Array.isArray(input.periods) ? input.periods.map(normalizePeriod) : [],
		futureContracts: Array.isArray(input.futureContracts)
			? input.futureContracts.map(normalizeFutureContract)
			: [],
		monthlyInfos: Array.isArray(input.monthlyInfos)
			? input.monthlyInfos.map(normalizeMonthlyInfo).filter((info) => info.month)
			: [],
		works: Array.isArray(input.works) ? input.works.map(normalizeWork) : [],
		royalties: Array.isArray(input.royalties) ? input.royalties.map(normalizeRoyalty) : [],
		congesPayments: Array.isArray(input.congesPayments)
			? input.congesPayments.map(normalizeCongesPayment)
			: [],
		franceTravailDocs: Array.isArray(input.franceTravailDocs)
			? input.franceTravailDocs.map((item) => ({
					id: cleanString(item?.id) || createId('ft'),
					kind: (['Relevé de situation', 'Attestation fiscale', 'Fin de droits', 'Courrier'] as const).includes(
						item?.kind as never
					)
						? item.kind
						: 'Courrier',
					date: cleanString(item?.date),
					fileName: cleanString(item?.fileName),
					storedName: cleanString(item?.storedName),
					summary: cleanString(item?.summary),
					year: cleanString(item?.year),
					amount: normalizeNumber(item?.amount),
					withheldTax: normalizeNumber(item?.withheldTax),
					months: Array.isArray(item?.months) ? item.months.map(cleanString).filter(Boolean) : []
				}))
			: [],
		settings: {
			...settings,
			targetHours: normalizeNumber(settings.targetHours) || defaults.settings.targetHours,
			minDailyAllowance:
				normalizeNumber(settings.minDailyAllowance) || defaults.settings.minDailyAllowance,
			smicHourlyGross:
				normalizeNumber(settings.smicHourlyGross) || defaults.settings.smicHourlyGross,
			annex8SalaryCoefficient:
				normalizeNumber(settings.annex8SalaryCoefficient) ||
				defaults.settings.annex8SalaryCoefficient,
			annex8HoursCoefficient:
				normalizeNumber(settings.annex8HoursCoefficient) ||
				defaults.settings.annex8HoursCoefficient,
			annex8FixedCoefficient: normalizeNumber(settings.annex8FixedCoefficient),
			monthlyWorkDayDivisor:
				normalizeNumber(settings.monthlyWorkDayDivisor) || defaults.settings.monthlyWorkDayDivisor,
			monthlyShiftCoefficient:
				normalizeNumber(settings.monthlyShiftCoefficient) ||
				defaults.settings.monthlyShiftCoefficient,
			pmss: normalizeNumber(settings.pmss) || defaults.settings.pmss,
			cumulPmssMultiplier:
				normalizeNumber(settings.cumulPmssMultiplier) || defaults.settings.cumulPmssMultiplier,
			transatEmail: cleanString(settings.transatEmail),
			ghsApiBaseUrl: cleanString(settings.ghsApiBaseUrl),
			ghsApiToken: cleanString(settings.ghsApiToken),
			ghsSyncEnabled: Boolean(settings.ghsSyncEnabled),
			ghsLastSyncAt: cleanString(settings.ghsLastSyncAt),
			ghsLastSyncStatus:
				cleanString(settings.ghsLastSyncStatus) || defaults.settings.ghsLastSyncStatus,
			activePeriodId: cleanString(settings.activePeriodId),
			remoteBaseUrl: cleanString(settings.remoteBaseUrl) || defaults.settings.remoteBaseUrl,
			remoteSyncEnabled: Boolean(settings.remoteSyncEnabled),
			remoteLastSyncAt: cleanString(settings.remoteLastSyncAt),
			remoteLastSyncStatus:
				cleanString(settings.remoteLastSyncStatus) || defaults.settings.remoteLastSyncStatus,
			driveImportFolder: cleanString(settings.driveImportFolder) || 'salaire',
			driveImportedFileIds: Array.isArray(settings.driveImportedFileIds)
				? settings.driveImportedFileIds.map(String)
				: [],
			taxYears:
				settings.taxYears && typeof settings.taxYears === 'object'
					? Object.fromEntries(
							Object.entries(settings.taxYears).map(([year, value]) => [
								year,
								normalizeTaxYear(value as Partial<TaxYearSettings>)
							])
						)
					: {}
		}
	});
}

async function writeJson(data: AppData) {
	if (useDrive()) {
		try {
			await driveDailyBackup(dataFileName);
		} catch (cause) {
			// A failed backup must never block saving.
			console.error('Sauvegarde quotidienne impossible', cause);
		}
		await driveWriteFile(
			'root',
			dataFileName,
			`${JSON.stringify(data, null, 2)}\n`,
			'application/json'
		);
		return;
	}
	await mkdir(dataDir, { recursive: true });
	const tmpFile = `${dataFile}.tmp`;
	await writeFile(tmpFile, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
	await rename(tmpFile, dataFile);
}

export async function readData(): Promise<AppData> {
	if (useDrive()) {
		const raw = await driveReadFile('root', dataFileName);
		if (!raw) {
			const initial = createDefaultData();
			await writeJson(initial);
			return initial;
		}
		return normalizeData(JSON.parse(raw.toString('utf-8')) as AppData);
	}
	await ensureDataFiles();
	const raw = await readFile(dataFile, 'utf-8');
	return normalizeData(JSON.parse(raw) as AppData);
}

export async function saveData(data: AppData): Promise<AppData> {
	const normalized = normalizeData(data);
	await writeJson(normalized);
	return normalized;
}

export async function mutateData(mutator: (data: AppData) => AppData | void): Promise<AppData> {
	const data = await readData();
	const result = mutator(data) ?? data;
	return saveData(result);
}

function resolveStoredDocumentPath(storedName: string) {
	const target = path.resolve(documentDir, storedName);
	if (target !== documentDirResolved && !target.startsWith(`${documentDirResolved}${path.sep}`)) {
		throw new Error(`Chemin document invalide: ${storedName}`);
	}
	return target;
}

export async function renameStoredFile(storedName: string, newName: string) {
	if (useDrive()) return driveRenameFile('documents', storedName, newName);
	try {
		const target = resolveStoredDocumentPath(newName);
		await mkdir(path.dirname(target), { recursive: true });
		await rename(resolveStoredDocumentPath(storedName), target);
		return true;
	} catch {
		return false;
	}
}

export async function deleteStoredFiles(storedNames: string[]) {
	const deletedFiles: string[] = [];

	for (const storedName of [...new Set(storedNames.filter(Boolean))]) {
		if (useDrive()) {
			if (await driveTrashFile('documents', storedName)) deletedFiles.push(storedName);
			continue;
		}
		try {
			await unlink(resolveStoredDocumentPath(storedName));
			deletedFiles.push(storedName);
		} catch (cause) {
			if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') {
				throw cause;
			}
		}
	}

	return deletedFiles;
}

export function usedStoredFiles(data: AppData) {
	return new Set([
		...data.documents.map((document) => document.storedName).filter(Boolean),
		...data.periods.map((period) => period.sourceStoredName).filter(Boolean),
		...(data.royalties ?? []).map((payment) => payment.storedName).filter(Boolean),
		...(data.congesPayments ?? []).map((payment) => payment.storedName).filter(Boolean)
	]);
}

export async function cleanupUnusedDocumentFiles(data: AppData) {
	const used = usedStoredFiles(data ?? (await readData()));
	let files: string[];
	if (useDrive()) {
		files = await driveListFiles('documents');
	} else {
		await mkdir(documentDir, { recursive: true });
		const entries = await readdir(documentDir, { withFileTypes: true });
		files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
		for (const folder of DOCUMENT_TYPE_FOLDERS) {
			const nested = await readdir(path.join(documentDir, folder), { withFileTypes: true }).catch(
				() => []
			);
			files.push(...nested.filter((entry) => entry.isFile()).map((entry) => `${folder}/${entry.name}`));
		}
	}
	const unused = files.filter((file) => !used.has(file));
	const deletedFiles = await deleteStoredFiles(unused);

	return {
		deletedFiles,
		deletedCount: deletedFiles.length
	};
}
