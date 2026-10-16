export type ContractStatus = 'Estimation' | 'Signé' | 'Payé';
export type DocumentKind =
	| 'AEM'
	| 'Contrat'
	| 'Fiche de paie'
	| 'Congé Spectacle'
	| 'Déclaration Guso'
	| 'Notification ARE'
	| 'Autre';

export type Company = {
	id: string;
	name: string;
	legalName: string;
	contactName: string;
	email: string;
	phone: string;
	address: string;
	postalCode: string;
	city: string;
	siren: string;
	siret: string;
	ape: string;
	legalCategory: string;
	activityLabel: string;
	color: string;
	source: string;
	sourceUpdatedAt: string;
	notes: string;
};

export type Project = {
	id: string;
	companyId: string;
	name: string;
	role: string;
	location: string;
	startDate: string;
	endDate: string;
	notes: string;
};

export type ContractDocument = {
	id: string;
	contractId: string;
	kind: DocumentKind;
	fileName: string;
	originalFileName: string;
	storedName: string;
	mimeType: string;
	size: number;
	pageStart: number;
	pageEnd: number;
	uploadedAt: string;
	extractedTextPreview: string;
	extractedFields: Partial<ContractFields>;
	analysisNotes: string[];
};

export type ContractFields = {
	companyId: string;
	projectId: string;
	title: string;
	startDate: string;
	endDate: string;
	hours: number;
	cachets: number;
	employmentStatus: string;
	netSalary: number;
	taxableNetSalary: number;
	grossSalary: number;
	contributions: number;
	netHourlyRate: number;
	grossHourlyRate: number;
	status: ContractStatus;
	notes: string;
};

export type Contract = ContractFields & {
	id: string;
	documentIds: string[];
	createdAt: string;
	updatedAt: string;
};

export type FutureContractAmountType = 'employerCost' | 'gross' | 'net';

export type FutureContract = {
	id: string;
	companyName: string;
	amount: number;
	amountType: FutureContractAmountType;
	estimatedHours: number;
	notes: string;
};

export type MonthlyInfo = {
	month: string;
	periodId: string;
	congeSpectacle: number;
	realIndemnity: number;
	dailyIndemnity: number;
	notes: string;
};

export type IntermittencePeriod = {
	id: string;
	label: string;
	status: 'Estimation' | 'Notifie' | 'Archive';
	admissionDate: string;
	indemnizationStartDate: string;
	anniversaryDate: string;
	referenceStartDate: string;
	referenceEndDate: string;
	hours: number;
	cachets: number;
	grossSalary: number;
	dailyAllowance: number;
	waitingDays: number;
	salaryFranchiseDays: number;
	congeFranchiseDays: number;
	sourceFileName: string;
	sourceStoredName: string;
	sourceTextPreview: string;
	analysisNotes: string[];
	createdAt: string;
	updatedAt: string;
	notes: string;
};

export type RoyaltySource = 'SACEM' | 'SACD' | 'SCAM' | 'Droits directs' | 'Autre';
export type RoyaltyStatus = 'Attendu' | 'Reçu' | 'Déclaré';
export type WorkKind = 'Musique' | 'Spectacle vivant' | 'Audiovisuel' | 'Texte' | 'Autre';

export type AuthorWork = {
	id: string;
	title: string;
	kind: WorkKind;
	society: RoyaltySource;
	reference: string;
	coAuthors: string;
	sharePercent: number;
	depositDate: string;
	notes: string;
	/** Producer who pays the rights (from the cession contract or the statements). */
	producer: string;
	/** Gross rights promised by the cession contract(s), avenants included (0 = unknown). */
	promisedAmount: number;
	/** How the promised amount was found (contract, schedule…). */
	promisedNotes: string;
	/** Contract documents already read for this work (so they are not parsed again). */
	sourceDocumentIds: string[];
};

/** One line of a collecting society statement (SACD…): a broadcast or use of a work. */
export type RoyaltyLine = {
	title: string;
	workId: string;
	broadcaster: string;
	/** "07/05/2023" or "15/04/2025-09/05/2025". */
	period: string;
	/** Broadcasts (or views for replay). */
	count: number;
	duration: string;
	/** DIFF (TV broadcast), COPIE_PR (private copy), TVR (replay)… */
	mode: string;
	country: string;
	/** Rights for this line, after the society's own fee. */
	amount: number;
	societyFee: number;
	sharePercent: number;
	/** Column codes: BA (bande-annonce), EXT (extrait), CPLT (complément), SOLDE; type of rights on stage. */
	flags: string;
	/** Producer of the show (stage performances). */
	producer: string;
};

export type RoyaltyPayment = {
	id: string;
	source: RoyaltySource;
	payerName: string;
	workId: string;
	label: string;
	paymentDate: string;
	grossAmount: number;
	withheldContributions: number;
	netAmount: number;
	contributionsWithheld: boolean;
	status: RoyaltyStatus;
	notes: string;
	/** Net imposable printed on the statement (0 when unknown). */
	taxableAmount: number;
	/** Attached statement (stored like contract documents). */
	fileName: string;
	storedName: string;
	/** Detail of the statement (broadcasts per work), when the statement lists them. */
	lines: RoyaltyLine[];
};

/** A Congés Spectacles (Audiens) payment statement: holiday pay, taxable in the year paid. */
export type CongesPayment = {
	id: string;
	paymentDate: string;
	season: string;
	grossAmount: number;
	netAmount: number;
	taxableAmount: number;
	withheldTax: number;
	days: number;
	fileName: string;
	storedName: string;
	notes: string;
};

export type TaxYearSettings = {
	/** Deduction bounds for the 10 % flat professional-expenses allowance of that income year. */
	flatDeductionMin: number;
	flatDeductionMax: number;
	/** Taxable unemployment benefits from France Travail's yearly tax certificate (0 = estimate). */
	unemploymentTaxable: number;
	/** Taxable Congés Spectacles indemnities from the Audiens certificate (0 = estimate). */
	congesSpectaclesTaxable: number;
	/** Income tax already withheld at source during the year (PAS). */
	withheldAtSource: number;
	/** Actual professional expenses ("frais réels"). */
	mileageKm: number;
	mileageRate: number;
	meals: number;
	equipment: number;
	otherExpenses: number;
	notes: string;
};

export type AppSettings = {
	referenceStartDate: string;
	targetHours: number;
	annex: 'Annexe 8';
	minDailyAllowance: number;
	smicHourlyGross: number;
	annex8SalaryCoefficient: number;
	annex8HoursCoefficient: number;
	annex8FixedCoefficient: number;
	monthlyWorkDayDivisor: number;
	monthlyShiftCoefficient: number;
	pmss: number;
	cumulPmssMultiplier: number;
	transatEmail: string;
	ghsApiBaseUrl: string;
	ghsApiToken: string;
	ghsSyncEnabled: boolean;
	ghsLastSyncAt: string;
	ghsLastSyncStatus: string;
	activePeriodId: string;
	remoteBaseUrl: string;
	remoteSyncEnabled: boolean;
	remoteLastSyncAt: string;
	remoteLastSyncStatus: string;
	driveImportFolder: string;
	driveImportedFileIds: string[];
	taxYears: Record<string, TaxYearSettings>;
};

export type AppData = {
	version: 1;
	updatedAt: string;
	companies: Company[];
	projects: Project[];
	contracts: Contract[];
	documents: ContractDocument[];
	periods: IntermittencePeriod[];
	futureContracts: FutureContract[];
	monthlyInfos: MonthlyInfo[];
	works: AuthorWork[];
	royalties: RoyaltyPayment[];
	congesPayments: CongesPayment[];
	settings: AppSettings;
};

export type MonthlyStats = {
	month: string;
	label: string;
	hours: number;
	cachets: number;
	netSalary: number;
	taxableNetSalary: number;
	grossSalary: number;
	contributions: number;
	contributionRate: number;
	netHourlyRate: number;
	grossHourlyRate: number;
	contractCount: number;
	workedDaysEstimate: number;
	estimatedDailyAllowance: number;
	estimatedIndemnity: number;
	realIndemnity: number;
	congeSpectacle: number;
	totalIncomeEstimated: number;
	totalIncomeReal: number;
};

export type PeriodStats = {
	monthCount: number;
	hours: number;
	cachets: number;
	netSalary: number;
	taxableNetSalary: number;
	grossSalary: number;
	contributions: number;
	contributionRate: number;
	netHourlyRate: number;
	grossHourlyRate: number;
	contractCount: number;
	workedDaysEstimate: number;
	estimatedIndemnity: number;
	realIndemnity: number;
	congeSpectacle: number;
	totalIncomeEstimated: number;
	totalIncomeReal: number;
};

export type CompanySearchResult = {
	id: string;
	score: number;
	name: string;
	legalName: string;
	siren: string;
	siret: string;
	ape: string;
	address: string;
	postalCode: string;
	city: string;
	legalCategory: string;
	activityLabel: string;
	employeeRange: string;
	isEmployer: boolean;
	isAssociation: boolean;
	isEntrepreneurSpectacle: boolean;
	sourceUpdatedAt: string;
	sourceUrl: string;
};

export type CompanySuggestion = {
	contractId: string;
	siret: string;
	result: CompanySearchResult;
};
