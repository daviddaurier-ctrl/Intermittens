import { parseFrenchDate } from '$lib/date';
import type { RoyaltyPayment } from '$lib/types';

/**
 * Royalty statements paid directly by a producer ("Décompte de droits", "Note de droits
 * d'auteur"). They are author income, not salary: they go to the royalties tab, never to a
 * contract nor to the 507 hours.
 */

const money = String.raw`(-?[0-9]{1,3}(?:[\s.][0-9]{3})*(?:,[0-9]{1,2})|-?[0-9]+(?:[,.][0-9]{1,2})?)`;

function toAmount(value: string | undefined) {
	if (!value) return undefined;
	const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
	return Number.isFinite(parsed) ? Math.abs(parsed) : undefined;
}

function first(text: string, pattern: RegExp) {
	return toAmount(text.match(pattern)?.[1]);
}

function flatten(text: string) {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[’']/g, ' ')
		.replace(/\s+/g, ' ');
}

export function isRoyaltyStatement(text: string) {
	const flat = flatten(text).toLowerCase();
	// A statement, not a contract: a "décompte"/"note" header and an amount actually paid.
	if (/\bcontrat de cession\b|\bcontrat d auteur\b/.test(flat)) return false;
	const hasHeader = /\bdecompte de droits\b/.test(flat) || /\bnote de droits d auteurs?\b/.test(flat);
	return hasHeader && /\bnet a payer\b/.test(flat);
}

export function analyzeRoyaltyStatement(
	text: string,
	fileName: string
): Omit<RoyaltyPayment, 'id' | 'storedName' | 'fileName'> | undefined {
	if (!isRoyaltyStatement(text)) return undefined;

	const flat = flatten(text);
	const grossAmount =
		first(flat, new RegExp(String.raw`droits d auteurs?\s+${money}`, 'i')) ??
		first(flat, new RegExp(String.raw`\*+\s*brut\s*\*+\s+${money}`, 'i')) ??
		0;
	const withheldContributions =
		first(flat, new RegExp(String.raw`total retenues\s*\*+\s+${money}`, 'i')) ?? 0;
	const netAmount = first(flat, new RegExp(String.raw`net a payer\s*\*+\s+${money}`, 'i')) ?? 0;
	const taxable = first(flat, new RegExp(String.raw`net imposable\s*\*+\s+${money}`, 'i'));

	const paidOn = flat.match(/pay[e]? le\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
	const periodEnd = flat.match(/au\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
	const paymentDate = parseFrenchDate(paidOn ?? periodEnd ?? '') ?? '';

	const payerName =
		flat.match(/decompte de droits\s+(.+?)\s+periode/i)?.[1]?.trim() ||
		flat.match(/note de droits d auteurs?\s+(.+?)\s+(?:periode|date)/i)?.[1]?.trim() ||
		'';
	const statementNumber = flat.match(/decompte n\S*\s*([0-9]+)/i)?.[1];
	const project = flat
		.match(/cout total diffuseur\s+\S+\s+\S+\s+\d+\s+(.+?)\s+brut\b/i)?.[1]
		?.trim();

	const label = [statementNumber ? `Décompte n° ${statementNumber}` : '', project ?? '']
		.filter(Boolean)
		.join(' — ');
	const notes = [
		taxable !== undefined ? `Net imposable : ${taxable.toFixed(2).replace('.', ',')} €` : '',
		`Importé depuis ${fileName}`
	]
		.filter(Boolean)
		.join(' · ');

	return {
		source: 'Droits directs',
		payerName,
		workId: '',
		label,
		paymentDate,
		grossAmount,
		withheldContributions,
		netAmount,
		contributionsWithheld: withheldContributions > 0,
		status: 'Reçu',
		notes
	};
}
