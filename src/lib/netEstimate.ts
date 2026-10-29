import type { AppData, Contract } from '$lib/types';

/** Used only when no payslip at all has been imported yet. */
const DEFAULT_NET_RATIO = 0.775;
const DEFAULT_TAXABLE_RATIO = 0.8;
const MAX_SAMPLES = 6;

const isTechnician = (contract: Pick<Contract, 'employmentStatus'>) =>
	/technicien/i.test(contract.employmentStatus);

const round2 = (value: number) => Math.round(value * 100) / 100;

function median(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Net salary of a contract signed but not paid yet (no payslip), estimated from the
 * gross with the net/gross ratio of the user's own payslips: same employer and same
 * status first (artiste or technicien), then same status, then a default ratio.
 * Stored apart from netSalary so the real payslip still fills netSalary when it comes.
 */
export function estimateNetSalaries(data: AppData): AppData {
	const paid = data.contracts
		.filter((contract) => contract.netSalary > 0 && contract.grossSalary > 0)
		.sort((a, b) => b.startDate.localeCompare(a.startDate));

	for (const contract of data.contracts) {
		delete contract.estimatedNetSalary;
		delete contract.estimatedTaxableNetSalary;
		delete contract.netEstimateBasis;
		if (contract.netSalary > 0 || contract.grossSalary <= 0) continue;

		const sameStatus = paid.filter((item) => isTechnician(item) === isTechnician(contract));
		const sameEmployer = sameStatus.filter((item) => item.companyId === contract.companyId);
		const samples = (sameEmployer.length ? sameEmployer : sameStatus).slice(0, MAX_SAMPLES);
		const basis = sameEmployer.length
			? `${samples.length} bulletin(s) de la même structure`
			: samples.length
				? `${samples.length} bulletin(s) ${isTechnician(contract) ? 'technicien' : 'artiste'}`
				: 'taux moyen par défaut';

		const netRatio = samples.length
			? median(samples.map((item) => item.netSalary / item.grossSalary))
			: DEFAULT_NET_RATIO;
		const taxableSamples = samples.filter(
			(item) => item.taxableNetSalary >= item.netSalary && item.taxableNetSalary < item.grossSalary
		);
		const taxableRatio = taxableSamples.length
			? median(taxableSamples.map((item) => item.taxableNetSalary / item.grossSalary))
			: DEFAULT_TAXABLE_RATIO;

		contract.estimatedNetSalary = round2(contract.grossSalary * netRatio);
		contract.estimatedTaxableNetSalary = round2(contract.grossSalary * taxableRatio);
		contract.netEstimateBasis = basis;
	}
	return data;
}

/** Real net when the payslip is in, otherwise the estimate (0 if no gross either). */
export function contractNet(contract: Contract) {
	return contract.netSalary || contract.estimatedNetSalary || 0;
}

export function contractTaxableNet(contract: Contract) {
	return contract.taxableNetSalary || contract.netSalary || contract.estimatedTaxableNetSalary || 0;
}

export function netIsEstimated(contract: Contract) {
	return !contract.netSalary && Boolean(contract.estimatedNetSalary);
}
