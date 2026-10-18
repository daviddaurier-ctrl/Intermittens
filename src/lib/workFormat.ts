import type { RoyaltySource, WorkFormat } from '$lib/types';

/**
 * Which society a film goes to depends on what it is, not on the contract:
 * - a documentary → SCAM;
 * - a staged show (opera, theatre, dance, any mise en scène), filmed or created → SACD;
 * - a filmed concert with no staging → SACEM.
 */
export const workFormats: { value: WorkFormat; label: string; society: RoyaltySource }[] = [
	{ value: 'Documentaire', label: 'Documentaire', society: 'SCAM' },
	{ value: 'Mise en scène', label: 'Spectacle mis en scène (opéra, théâtre, danse…)', society: 'SACD' },
	{ value: 'Concert', label: 'Concert filmé sans mise en scène', society: 'SACEM' }
];

export function societyForFormat(format: WorkFormat | '' | undefined): RoyaltySource | '' {
	return workFormats.find((item) => item.value === format)?.society ?? '';
}

/** Best guess from the contract text; '' when it cannot tell (the author chooses). */
export function guessWorkFormat(text: string): WorkFormat | '' {
	const flat = text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();
	if (/genre\s*:\s*documentaire|\bdocumentaire\b|\bdocu\b/.test(flat)) return 'Documentaire';
	if (/\bopera\b|mise en scene|metteur en scene|theatre|choregraph|\bdanse\b|ballet/.test(flat)) return 'Mise en scène';
	if (/\bconcert\b|\brecital\b|choeur|chorale/.test(flat)) return 'Concert';
	return '';
}
