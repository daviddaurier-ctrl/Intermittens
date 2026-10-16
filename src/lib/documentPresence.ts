import type { Contract, ContractDocument, DocumentKind } from '$lib/types';

export const requiredContractDocuments = [
	{ kind: 'Contrat', label: 'Contrat', shortLabel: 'Contrat' },
	{ kind: 'AEM', label: 'AEM', shortLabel: 'AEM' },
	{ kind: 'Fiche de paie', label: 'Fiche de paie', shortLabel: 'Paie' },
	{ kind: 'Congé Spectacle', label: 'Congé Spectacle', shortLabel: 'CS' }
] as const satisfies readonly {
	kind: DocumentKind;
	label: string;
	shortLabel: string;
}[];

export type RequiredContractDocumentKind = (typeof requiredContractDocuments)[number]['kind'];

export function hasRequiredDocument(
	documents: readonly Pick<ContractDocument, 'kind'>[],
	kind: RequiredContractDocumentKind
) {
	return documents.some((document) => document.kind === kind);
}

export function missingRequiredDocuments(documents: readonly Pick<ContractDocument, 'kind'>[]) {
	return requiredContractDocuments.filter(({ kind }) => !hasRequiredDocument(documents, kind));
}

export function summarizeContractDocuments(
	contracts: readonly Pick<Contract, 'documentIds'>[],
	documents: readonly Pick<ContractDocument, 'id' | 'kind'>[]
) {
	const documentsById = new Map(documents.map((document) => [document.id, document]));
	const missingByKind = Object.fromEntries(
		requiredContractDocuments.map(({ kind }) => [kind, 0])
	) as Record<RequiredContractDocumentKind, number>;
	let incompleteContracts = 0;

	for (const contract of contracts) {
		const contractDocuments = contract.documentIds.flatMap((id) => {
			const document = documentsById.get(id);
			return document ? [document] : [];
		});
		const missingDocuments = missingRequiredDocuments(contractDocuments);

		if (missingDocuments.length > 0) incompleteContracts += 1;
		for (const { kind } of missingDocuments) missingByKind[kind] += 1;
	}

	return {
		totalContracts: contracts.length,
		completeContracts: contracts.length - incompleteContracts,
		incompleteContracts,
		missingByKind
	};
}

export type ContractHealth = 'ok' | 'partial' | 'missing';

/**
 * Traffic-light summary of a contract's paperwork:
 * - red ("missing"): the signed contract itself is not attached;
 * - orange ("partial"): the contract is there but, once the job is over, the payslip or AEM is missing;
 * - green ("ok"): everything expected so far is attached.
 * Congés Spectacles statements are yearly (Audiens), so they are not expected per contract.
 */
export function contractHealth(
	contract: Pick<Contract, 'startDate' | 'endDate'>,
	documents: readonly Pick<ContractDocument, 'kind'>[],
	today = new Date().toISOString().slice(0, 10)
): { health: ContractHealth; missing: string[] } {
	const ended = (contract.endDate || contract.startDate || '9999') < today;
	const expected: RequiredContractDocumentKind[] = ended
		? ['Contrat', 'Fiche de paie', 'AEM']
		: ['Contrat'];
	const missing = expected.filter((kind) => !hasRequiredDocument(documents, kind));
	const labels = missing.map(
		(kind) => requiredContractDocuments.find((item) => item.kind === kind)?.label ?? kind
	);
	if (missing.includes('Contrat')) return { health: 'missing', missing: labels };
	return { health: missing.length ? 'partial' : 'ok', missing: labels };
}
