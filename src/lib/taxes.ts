import type { AppData, TaxYearSettings } from '$lib/types';

/**
 * Calendar-year (January–December) income summary for the tax return. Salaries are counted by
 * contract start month, royalties by payment date, unemployment and Congés Spectacles by the
 * monthly amounts entered in the Intermittence tab unless the yearly certificate amount is set.
 */

export type TaxMonth = {
	month: string;
	salaryGross: number;
	salaryTaxable: number;
	contributions: number;
	unemployment: number;
	congesSpectacles: number;
	royaltiesTaxable: number;
	total: number;
};

export type TaxEmployer = {
	name: string;
	contracts: number;
	gross: number;
	taxable: number;
	missingTaxable: number;
};

export type TaxYearSummary = {
	year: string;
	months: TaxMonth[];
	employers: TaxEmployer[];
	salaryGross: number;
	salaryTaxable: number;
	contributions: number;
	contractsWithoutTaxable: number;
	unemployment: number;
	unemploymentIsEstimate: boolean;
	congesSpectacles: number;
	congesSpectaclesIsEstimate: boolean;
	royaltiesGross: number;
	royaltiesWithheld: number;
	royaltiesNet: number;
	royaltiesTaxable: number;
	royaltiesWithoutTaxable: number;
	totalTaxable: number;
	flatDeduction: number;
	actualExpenses: number;
	bestDeduction: number;
	bestIsActual: boolean;
	netTaxable: number;
	withheldAtSource: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function taxYears(data: AppData) {
	const years = new Set<string>([String(new Date().getFullYear() - 1), String(new Date().getFullYear())]);
	for (const contract of data.contracts) if (/^\d{4}/.test(contract.startDate)) years.add(contract.startDate.slice(0, 4));
	for (const payment of data.royalties) if (/^\d{4}/.test(payment.paymentDate)) years.add(payment.paymentDate.slice(0, 4));
	return [...years].sort().reverse();
}

export function taxSettingsFor(data: AppData, year: string, defaults: TaxYearSettings) {
	return data.settings.taxYears?.[year] ?? defaults;
}

export function actualExpenses(settings: TaxYearSettings) {
	return round2(
		settings.mileageKm * settings.mileageRate +
			settings.meals +
			settings.equipment +
			settings.otherExpenses
	);
}

export function buildTaxYear(data: AppData, year: string, settings: TaxYearSettings): TaxYearSummary {
	const months: TaxMonth[] = Array.from({ length: 12 }, (_, index) => ({
		month: `${year}-${String(index + 1).padStart(2, '0')}`,
		salaryGross: 0,
		salaryTaxable: 0,
		contributions: 0,
		unemployment: 0,
		congesSpectacles: 0,
		royaltiesTaxable: 0,
		total: 0
	}));
	const monthOf = (date: string) => months[Number(date.slice(5, 7)) - 1];
	const employers = new Map<string, TaxEmployer>();
	let contractsWithoutTaxable = 0;

	for (const contract of data.contracts) {
		if (!contract.startDate.startsWith(year)) continue;
		const month = monthOf(contract.startDate);
		if (!month) continue;
		const taxable = contract.taxableNetSalary || contract.netSalary;
		if (!contract.taxableNetSalary && (contract.netSalary || contract.grossSalary)) contractsWithoutTaxable += 1;
		month.salaryGross += contract.grossSalary;
		month.salaryTaxable += taxable;
		month.contributions += contract.contributions;

		const company = data.companies.find((item) => item.id === contract.companyId);
		const name = company?.name.split('(')[0].trim() || 'Employeur non renseigné';
		const employer = employers.get(name) ?? { name, contracts: 0, gross: 0, taxable: 0, missingTaxable: 0 };
		employer.contracts += 1;
		employer.gross += contract.grossSalary;
		employer.taxable += taxable;
		if (!contract.taxableNetSalary) employer.missingTaxable += 1;
		employers.set(name, employer);
	}

	for (const info of data.monthlyInfos) {
		if (!info.month.startsWith(year)) continue;
		const month = monthOf(info.month);
		if (!month) continue;
		month.unemployment += info.realIndemnity;
		month.congesSpectacles += info.congeSpectacle;
	}

	let royaltiesGross = 0;
	let royaltiesWithheld = 0;
	let royaltiesNet = 0;
	let royaltiesWithoutTaxable = 0;
	for (const payment of data.royalties) {
		if (payment.status === 'Attendu' || !payment.paymentDate.startsWith(year)) continue;
		const month = monthOf(payment.paymentDate);
		const net = payment.netAmount || Math.max(0, payment.grossAmount - payment.withheldContributions);
		const taxable = payment.taxableAmount || net;
		if (!payment.taxableAmount) royaltiesWithoutTaxable += 1;
		royaltiesGross += payment.grossAmount;
		royaltiesWithheld += payment.withheldContributions;
		royaltiesNet += net;
		if (month) month.royaltiesTaxable += taxable;
	}

	for (const month of months) {
		month.total = month.salaryTaxable + month.unemployment + month.congesSpectacles + month.royaltiesTaxable;
		for (const key of Object.keys(month) as (keyof TaxMonth)[]) {
			if (key !== 'month') (month[key] as number) = round2(month[key] as number);
		}
	}

	const sum = (key: keyof Omit<TaxMonth, 'month'>) => round2(months.reduce((total, month) => total + month[key], 0));
	const estimatedUnemployment = sum('unemployment');
	const estimatedConges = sum('congesSpectacles');
	const unemployment = settings.unemploymentTaxable || estimatedUnemployment;
	const congesSpectacles = settings.congesSpectaclesTaxable || estimatedConges;
	const salaryTaxable = sum('salaryTaxable');
	const royaltiesTaxable = sum('royaltiesTaxable');
	const totalTaxable = round2(salaryTaxable + unemployment + congesSpectacles + royaltiesTaxable);

	const flatDeduction = round2(
		Math.min(settings.flatDeductionMax, Math.max(settings.flatDeductionMin, totalTaxable * 0.1), totalTaxable)
	);
	const expenses = actualExpenses(settings);
	const bestIsActual = expenses > flatDeduction;
	const bestDeduction = bestIsActual ? expenses : flatDeduction;

	return {
		year,
		months,
		employers: [...employers.values()]
			.map((employer) => ({ ...employer, gross: round2(employer.gross), taxable: round2(employer.taxable) }))
			.sort((a, b) => b.taxable - a.taxable),
		salaryGross: sum('salaryGross'),
		salaryTaxable,
		contributions: sum('contributions'),
		contractsWithoutTaxable,
		unemployment,
		unemploymentIsEstimate: !settings.unemploymentTaxable,
		congesSpectacles,
		congesSpectaclesIsEstimate: !settings.congesSpectaclesTaxable,
		royaltiesGross: round2(royaltiesGross),
		royaltiesWithheld: round2(royaltiesWithheld),
		royaltiesNet: round2(royaltiesNet),
		royaltiesTaxable,
		royaltiesWithoutTaxable,
		totalTaxable,
		flatDeduction,
		actualExpenses: expenses,
		bestDeduction,
		bestIsActual,
		netTaxable: round2(Math.max(0, totalTaxable - bestDeduction)),
		withheldAtSource: settings.withheldAtSource
	};
}

export function taxYearCsv(summary: TaxYearSummary) {
	const money = (value: number) => value.toFixed(2).replace('.', ',');
	const rows = [
		['Mois', 'Salaires bruts', 'Salaires net imposable', 'Cotisations', 'Chômage (ARE)', 'Congés Spectacles', "Droits d'auteur net imposable", 'Total imposable'],
		...summary.months.map((month) => [
			month.month,
			money(month.salaryGross),
			money(month.salaryTaxable),
			money(month.contributions),
			money(month.unemployment),
			money(month.congesSpectacles),
			money(month.royaltiesTaxable),
			money(month.total)
		]),
		[],
		['Synthèse', summary.year],
		['Salaires net imposable', money(summary.salaryTaxable)],
		['Allocations chômage imposables', money(summary.unemployment)],
		['Congés Spectacles imposables', money(summary.congesSpectacles)],
		["Droits d'auteur net imposable", money(summary.royaltiesTaxable)],
		['Total imposable avant déduction', money(summary.totalTaxable)],
		['Déduction forfaitaire 10 %', money(summary.flatDeduction)],
		['Frais réels', money(summary.actualExpenses)],
		['Déduction retenue', money(summary.bestDeduction)],
		['Net imposable estimé', money(summary.netTaxable)],
		['Prélevé à la source', money(summary.withheldAtSource)],
		[],
		['Employeur', 'Contrats', 'Brut', 'Net imposable'],
		...summary.employers.map((employer) => [employer.name, String(employer.contracts), money(employer.gross), money(employer.taxable)])
	];
	return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
}
