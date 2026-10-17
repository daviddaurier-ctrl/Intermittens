import type { AppData, AuthorWork } from '$lib/types';

const round2 = (value: number) => Math.round(value * 100) / 100;

export type SalaryFollowUp = {
	promisedSalary: number;
	promisedCachets: number;
	paidSalary: number;
	paidCachets: number;
	remainingSalary: number;
	remainingCachets: number;
	contracts: number;
	state: 'ok' | 'partial' | 'over' | 'unknown';
};

/** Salary promised by the cession contract vs what the payslips of the project show. */
export function salaryFollowUp(data: AppData, work: AuthorWork): SalaryFollowUp | undefined {
	if (!work.projectId || (!work.promisedSalary && !work.promisedCachets)) return undefined;
	const contracts = data.contracts.filter(
		(contract) => contract.projectId === work.projectId && !/technicien/i.test(contract.employmentStatus)
	);
	const paidSalary = round2(contracts.reduce((total, contract) => total + contract.grossSalary, 0));
	const paidCachets = contracts.reduce((total, contract) => total + (contract.cachets || 0), 0);
	const remainingSalary = round2(work.promisedSalary - paidSalary);
	const remainingCachets = work.promisedCachets ? work.promisedCachets - paidCachets : 0;
	const state =
		remainingSalary < -0.5 || remainingCachets < 0
			? 'over'
			: remainingSalary <= 0.5 && remainingCachets <= 0
				? 'ok'
				: 'partial';
	return {
		promisedSalary: work.promisedSalary,
		promisedCachets: work.promisedCachets,
		paidSalary,
		paidCachets,
		remainingSalary,
		remainingCachets,
		contracts: contracts.length,
		state
	};
}

export function workForProject(data: AppData, projectId: string) {
	return projectId ? data.works.find((work) => work.projectId === projectId) : undefined;
}
