import type { AppData, RoyaltyPayment, RoyaltySource } from '$lib/types';

export const royaltySources: RoyaltySource[] = ['SACEM', 'SACD', 'Droits directs', 'Autre'];

export type RoyaltyTotals = {
	count: number;
	gross: number;
	withheld: number;
	net: number;
	expected: number;
	notWithheldGross: number;
	undeclaredCount: number;
};

export type YearOverview = {
	year: string;
	royalties: RoyaltyTotals;
	bySource: { source: RoyaltySource; totals: RoyaltyTotals }[];
	salaryNet: number;
	salaryTaxable: number;
	salaryGross: number;
	royaltyShare: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function paymentYear(payment: RoyaltyPayment) {
	return payment.paymentDate.slice(0, 4);
}

/** Net amount actually received; falls back to gross minus withheld contributions. */
export function effectiveNet(payment: RoyaltyPayment) {
	if (payment.netAmount) return payment.netAmount;
	return Math.max(0, payment.grossAmount - payment.withheldContributions);
}

export function emptyTotals(): RoyaltyTotals {
	return {
		count: 0,
		gross: 0,
		withheld: 0,
		net: 0,
		expected: 0,
		notWithheldGross: 0,
		undeclaredCount: 0
	};
}

export function sumRoyalties(payments: RoyaltyPayment[]): RoyaltyTotals {
	const totals = emptyTotals();

	for (const payment of payments) {
		if (payment.status === 'Attendu') {
			totals.expected += payment.grossAmount || effectiveNet(payment);
			continue;
		}
		totals.count += 1;
		totals.gross += payment.grossAmount;
		totals.withheld += payment.withheldContributions;
		totals.net += effectiveNet(payment);
		if (!payment.contributionsWithheld) totals.notWithheldGross += payment.grossAmount;
		if (payment.status !== 'Déclaré') totals.undeclaredCount += 1;
	}

	for (const key of Object.keys(totals) as (keyof RoyaltyTotals)[]) {
		totals[key] = round2(totals[key]);
	}
	return totals;
}

export function royaltyYears(data: AppData) {
	const years = new Set<string>([String(new Date().getFullYear())]);
	for (const payment of data.royalties) {
		const year = paymentYear(payment);
		if (/^\d{4}$/.test(year)) years.add(year);
	}
	for (const contract of data.contracts) {
		const year = contract.startDate.slice(0, 4);
		if (/^\d{4}$/.test(year)) years.add(year);
	}
	return [...years].sort().reverse();
}

export function buildYearOverview(data: AppData, year: string): YearOverview {
	const payments = data.royalties.filter((payment) => paymentYear(payment) === year);
	const contracts = data.contracts.filter((contract) => contract.startDate.slice(0, 4) === year);
	const royalties = sumRoyalties(payments);
	const salaryNet = round2(contracts.reduce((total, item) => total + item.netSalary, 0));
	const salaryTaxable = round2(
		contracts.reduce((total, item) => total + (item.taxableNetSalary || item.netSalary), 0)
	);
	const salaryGross = round2(contracts.reduce((total, item) => total + item.grossSalary, 0));
	const totalNet = salaryNet + royalties.net;

	return {
		year,
		royalties,
		bySource: royaltySources.map((source) => ({
			source,
			totals: sumRoyalties(payments.filter((payment) => payment.source === source))
		})),
		salaryNet,
		salaryTaxable,
		salaryGross,
		royaltyShare: totalNet ? royalties.net / totalNet : 0
	};
}

export function workTotals(data: AppData, workId: string) {
	return sumRoyalties(data.royalties.filter((payment) => payment.workId === workId));
}
