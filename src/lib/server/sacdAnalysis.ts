import type { RoyaltyLine, RoyaltyPayment } from '$lib/types';

/**
 * SACD statements ("Bordereau : Juin 2026" + "Relevé de situation en euro"): one payment per
 * statement, with one line per broadcast (title, channel, period, number, rights).
 */

const NUM = String.raw`(\d{1,3}(?:[\s  ]\d{3})*,\d{2})`;

function toAmount(value: string | undefined) {
	if (!value) return 0;
	const parsed = Number(value.replace(/[\s  ]/g, '').replace(',', '.'));
	return Number.isFinite(parsed) ? parsed : 0;
}

function flatten(text: string) {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[’']/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function isSacdStatement(text: string) {
	const flat = flatten(text).toLowerCase();
	return (
		/societe des auteurs et compositeurs dramatiques|www\.sacd\.fr/.test(flat) &&
		/releve de situation|bordereau\s*:/.test(flat)
	);
}

const REGIONS = [
	'NORD - PAS DE CALAIS', 'NORD-PAS-DE-CALAIS', 'PICARDIE', 'HAUTS-DE-FRANCE', 'HAUTS DE FRANCE',
	'PARIS ILE-DE-FRANCE', 'PARIS ILE DE FRANCE', 'ILE-DE-FRANCE', 'GRAND EST', 'ALSACE', 'LORRAINE',
	'CHAMPAGNE-ARDENNE', 'BRETAGNE', 'NORMANDIE', 'BASSE-NORMANDIE', 'HAUTE-NORMANDIE', 'PAYS DE LA LOIRE',
	'CENTRE-VAL DE LOIRE', 'CENTRE', 'BOURGOGNE-FRANCHE-COMTE', 'BOURGOGNE', 'FRANCHE-COMTE',
	'AUVERGNE-RHONE-ALPES', 'RHONE-ALPES', 'AUVERGNE', 'ALPES', 'NOUVELLE-AQUITAINE', 'AQUITAINE',
	'LIMOUSIN', 'POITOU-CHARENTES', 'OCCITANIE', 'MIDI-PYRENEES', 'LANGUEDOC-ROUSSILLON',
	'PROVENCE-ALPES', "PROVENCE-ALPES-COTE D AZUR", 'COTE D AZUR', 'CORSE VIA STELLA', 'CORSE'
];
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CHANNEL = new RegExp(
	String.raw`^(FRANCE\.TV|FRANCE TV|FRANCE \d(?: (?:${REGIONS.map(escape).join('|')}))?|ARTE(?: [A-Z]{2,})?|MEZZO(?: LIVE(?: HD)?)?|CANAL\+(?: [A-Z]+)?|TV5 ?MONDE|TF1|M6|C8|LCP|PUBLIC SENAT|OCS(?: [A-Z]+)?|CULTUREBOX|PARIS PREMIERE|PLANETE\+?|TOUTE L HISTOIRE|HISTOIRE TV|RTBF|RTS|RTL|SSR|TSR|TV5|FRANCE O)\s+(.+)$`
);

function splitChannelAndTitle(text: string, knownTitles: string[]) {
	const upper = text.toUpperCase();
	for (const title of knownTitles) {
		const t = flatten(title).toUpperCase();
		if (t && upper.endsWith(` ${t}`)) {
			return { broadcaster: text.slice(0, text.length - t.length).trim(), title: text.slice(-t.length) };
		}
	}
	const match = text.match(CHANNEL);
	if (match) return { broadcaster: match[1], title: match[2] };
	return { broadcaster: '', title: text };
}

export function parseSacdLines(text: string, knownTitles: string[] = []): RoyaltyLine[] {
	const flat = flatten(text);
	const table = flat.match(/\bpays\b(.*?)total droits bruts/i)?.[1] ?? '';
	const DATE = String.raw`\d{2}\/\d{2}\/\d{4}(?:\s*-\s*\d{2}\/\d{2}\/\d{4})?`;
	const row = new RegExp(
		String.raw`(?:(\S.*?)\s+)??(\d+)\s+(\d{1,3},\d{2})\s+(\d{1,3},\d{2})%\s+(.+?)\s+${NUM}\s+${NUM}\s+Real\.\s+(?:(\d+:\d{2}:\d{2})\s+)?([A-Z_]{2,})\s+([A-Z_]{2,})`,
		'g'
	);
	const lines: RoyaltyLine[] = [];
	for (const match of table.matchAll(row)) {
		const [, rawLeading, count, share, , rawMiddle, amount, fee, duration, a, b] = match;
		// Column codes printed before the title: BA (bande-annonce) / EXT (extrait),
		// CPLT (complément) / SOLDE. They are flags, not part of the title.
		const flags: string[] = [];
		const stripFlags = (value: string) =>
			value.replace(/^(?:(BA|EXT|CPLT|SOLDE)\s+|(BA|EXT|CPLT|SOLDE)$)+/g, (token) => {
				flags.push(token.trim());
				return '';
			}).trim();
		const leadingTitle = stripFlags(rawLeading ?? '') || undefined;
		const middle = stripFlags(rawMiddle);
		const period = middle.match(new RegExp(DATE))?.[0]?.replace(/\s+/g, '') ?? '';
		const [before, after] = period ? middle.split(middle.match(new RegExp(DATE))![0]).map((part) => part.trim()) : ['', middle];
		let broadcaster = '';
		let title = '';
		if (before) {
			// Scrambled row: "TITLE <date> CHANNEL".
			title = before;
			broadcaster = after;
		} else {
			const split = splitChannelAndTitle(after, [leadingTitle ?? '', ...knownTitles].filter(Boolean));
			broadcaster = split.broadcaster;
			title = split.title;
		}
		if (!title && leadingTitle) title = leadingTitle;
		// Mode and country may come in either order: the country is the 2-letter code.
		const country = /^[A-Z]{2}$/.test(b) ? b : /^[A-Z]{2}$/.test(a) ? a : b;
		const mode = country === b ? a : b;
		lines.push({
			title: title.trim(),
			workId: '',
			broadcaster: broadcaster.trim(),
			period,
			count: Number(count) || 0,
			duration: duration ?? '',
			mode,
			country,
			amount: toAmount(amount),
			societyFee: toAmount(fee),
			sharePercent: toAmount(share),
			flags: [...new Set(flags)].join(' ')
		});
	}
	// Rows whose channel and title could not be told apart: use the titles read elsewhere.
	const titles = [...new Set(lines.filter((line) => line.broadcaster).map((line) => line.title))];
	for (const line of lines) repairSacdLine(line, [...titles, ...knownTitles]);
	return lines;
}

/** Fixes a line whose title is glued to the channel ("FRANCE 3 LES ENFANTS TERRIBLES"). */
export function repairSacdLine(line: RoyaltyLine, knownTitles: string[]) {
	const flagOnly = /^(?:(?:BA|EXT|CPLT|SOLDE)\s*)+$/;
	if (flagOnly.test(line.title)) {
		line.flags = [...new Set([...(line.flags ? line.flags.split(' ') : []), ...line.title.split(/\s+/)])].join(' ');
		line.title = '';
		line.workId = '';
	}
	const glued = line.title ? '' : line.broadcaster;
	const candidate = glued || (!line.broadcaster ? line.title : '');
	if (!candidate) return false;
	const upper = flatten(candidate).toUpperCase();
	const sorted = [...new Set(knownTitles.filter(Boolean))].sort((x, y) => y.length - x.length);
	for (const title of sorted) {
		const t = flatten(title).toUpperCase();
		if (upper === t) continue;
		if (upper.endsWith(` ${t}`)) {
			line.broadcaster = candidate.slice(0, candidate.length - t.length).trim();
			line.title = candidate.slice(-t.length).trim();
			line.workId = '';
			return true;
		}
	}
	const split = splitChannelAndTitle(candidate, []);
	if (split.broadcaster) {
		line.broadcaster = split.broadcaster;
		line.title = split.title;
		line.workId = '';
		return true;
	}
	return false;
}

export const SACD_MODES: Record<string, string> = {
	DIFF: 'Diffusion TV',
	COPIE_PR: 'Copie privée',
	TVR: 'Replay (TV de rattrapage)',
	VAD: 'Vidéo à la demande',
	SVOD: 'Vidéo à la demande (abonnement)'
};

export function analyzeSacdStatement(
	text: string,
	fileName: string,
	knownTitles: string[] = []
): Omit<RoyaltyPayment, 'id' | 'storedName' | 'fileName'> | undefined {
	if (!isSacdStatement(text)) return undefined;
	const flat = flatten(text);

	const settlement = flat.match(/(\d{4})\/(\d{2})\/(\d{2})\s*-\s*Virement/i);
	const paymentDate = settlement ? `${settlement[1]}-${settlement[2]}-${settlement[3]}` : '';
	// The social contributions base is the gross author income of the statement.
	const grossAmount = toAmount(flat.match(new RegExp(String.raw`assurance vieillesse plafonnee\s+100\s*%\s+${NUM}`, 'i'))?.[1]);
	const netSocial = toAmount(flat.match(new RegExp(String.raw`montant net social\s+${NUM}`, 'i'))?.[1]);
	const netAmount = toAmount(flat.match(new RegExp(String.raw`montants nets\s+${NUM}`, 'i'))?.[1]);
	const taxable = toAmount(flat.match(new RegExp(String.raw`montants imposables\s+net\s*:\s*${NUM}`, 'i'))?.[1]);
	const paid = toAmount(flat.match(new RegExp(String.raw`nos reglements\s+${NUM}`, 'i'))?.[1]);
	const membership = flat.match(new RegExp(String.raw`cotisation sacd (\d{4})`, 'i'));
	const withheld = grossAmount && netSocial ? Math.round((grossAmount - netSocial) * 100) / 100 : 0;

	const month = text.replace(/\s+/g, ' ').match(/bordereau\s*:\s*(\S+\s+\d{4})/i)?.[1];
	const refund = /remboursement de retenue statutaire\s*(\d{4})?/i.exec(flat);
	const lines = parseSacdLines(text, knownTitles);
	const titles = [...new Set(lines.map((line) => line.title))];
	const label = [
		month ? `Bordereau ${month}` : refund ? `Remboursement de retenue statutaire${refund[1] ? ` ${refund[1]}` : ''}` : 'Relevé SACD',
		titles.join(', ')
	]
		.filter(Boolean)
		.join(' — ');

	const notes = [
		taxable ? `Net imposable : ${taxable.toFixed(2).replace('.', ',')} €` : '',
		paid && netAmount && paid < netAmount - 0.01
			? `Virement de ${paid.toFixed(2).replace('.', ',')} € après cotisation SACD${membership ? ` ${membership[1]}` : ''} (${(netAmount - paid).toFixed(2).replace('.', ',')} €)`
			: '',
		`Importé depuis ${fileName}`
	]
		.filter(Boolean)
		.join(' · ');

	return {
		source: 'SACD',
		payerName: 'SACD',
		workId: '',
		label,
		paymentDate,
		grossAmount,
		withheldContributions: withheld,
		netAmount,
		contributionsWithheld: withheld > 0,
		status: 'Reçu',
		notes,
		taxableAmount: taxable,
		lines
	};
}
