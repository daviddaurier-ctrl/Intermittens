import { parseFrenchDate } from '$lib/date';
import type { CongesPayment } from '$lib/types';

/**
 * Audiens "État récapitulatif des paiements Congés" statements. Holiday pay is taxable in the
 * year it is paid; it is not a contract and does not count toward the 507 hours.
 */

const money = String.raw`([0-9]{1,3}(?:[\s.][0-9]{3})*(?:,[0-9]{1,2})|[0-9]+(?:[,.][0-9]{1,2})?)`;

function toAmount(value: string | undefined) {
	if (!value) return undefined;
	const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
	return Number.isFinite(parsed) ? parsed : undefined;
}

function flatten(text: string) {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[’']/g, ' ')
		.replace(/\s+/g, ' ');
}

export function isCongesStatement(text: string) {
	const flat = flatten(text).toLowerCase();
	return /etat recapitulatif des paiements\s+conges/.test(flat) ||
		(/conges spectacles/.test(flat) && /brut indemnite/.test(flat) && /regle le/.test(flat));
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function analyzeCongesStatement(
	text: string
): Omit<CongesPayment, 'id' | 'fileName' | 'storedName'> | undefined {
	if (!isCongesStatement(text)) return undefined;
	const flat = flatten(text);

	// "TOTAL <brut indemnité> <brut abattu> <jours> <cotisations> <net avant impôts>"
	const total = flat.match(
		new RegExp(String.raw`\btotal\s+${money}\s+${money}\s+${money}\s+${money}\s+${money}`, 'i')
	);
	const grossAmount = toAmount(total?.[1]) ?? 0;
	const days = toAmount(total?.[3]) ?? 0;
	const netAmount =
		toAmount(total?.[5]) ??
		toAmount(flat.match(new RegExp(String.raw`net a payer avant impots\s+${money}`, 'i'))?.[1]) ??
		0;
	// One "NET IMPOSABLE" per attestation (artiste / technicien, cadre / non cadre): add them up.
	const taxableAmount = round2(
		[...flat.matchAll(new RegExp(String.raw`\bnet imposable\s+${money}`, 'gi'))]
			.map((match) => toAmount(match[1]) ?? 0)
			.reduce((sum, value) => sum + value, 0)
	);
	const withheldTax =
		toAmount(flat.match(new RegExp(String.raw`\bimpots\s+${money}\s+net a payer total`, 'i'))?.[1]) ?? 0;
	const paymentDate = parseFrenchDate(flat.match(/regle le\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? '') ?? '';
	const season = flat.match(/conges saison\s+(\d{4})/i)?.[1] ?? '';

	return {
		paymentDate,
		season,
		grossAmount,
		netAmount,
		taxableAmount,
		withheldTax,
		days,
		notes: season ? `Congés Spectacles saison ${season}` : 'Congés Spectacles'
	};
}
