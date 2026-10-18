import type { FranceTravailDocument, MonthlyInfo } from '$lib/types';

/**
 * France Travail letters that are NOT an admission notification:
 * - "Relevé de situation": monthly allowances paid (days, gross, tax, net) per month;
 * - "Justificatif pour votre déclaration fiscale": amount to report in 1AP for the year;
 * - "Fin de période d'indemnisation" / other letters: kept as documents only.
 */

function flatten(text: string) {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[’']/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

const NUM = String.raw`(-?(?:\d{1,3}(?:[\s\u202f\u00a0]\d{3})+|\d+),\d{2})`;
const toAmount = (value?: string) =>
	value ? Number(value.replace(/[\s  ]/g, '').replace(',', '.')) || 0 : 0;
const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

function letterDate(flat: string) {
	const match = flat.match(/le (\d{1,2}) ([a-z]+) (\d{4})/i);
	if (!match) return '';
	const month = MONTHS.indexOf(match[2].toLowerCase());
	return month < 0 ? '' : `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

export function isFranceTravailLetter(text: string) {
	return /france travail|pole emploi/i.test(flatten(text));
}

/** Admission / rights notifications stay handled as an indemnisation period. */
export function isAdmissionNotification(text: string) {
	const flat = flatten(text).toLowerCase();
	return /notification|ouverture de droits|admission|rechargement|reexamen/.test(flat) &&
		!/releve de situation|justificatif pour votre declaration fiscale|attestation d indemnisation en/.test(flat);
}

export type SituationMonth = {
	month: string;
	days: number;
	gross: number;
	pension: number;
	social: number;
	tax: number;
	net: number;
};

/** Last figures per allocation month (a "régularisé" block replaces the provisional one). */
export function parseSituationStatement(text: string) {
	const flat = flatten(text);
	const months = new Map<string, SituationMonth>();
	const blocks = [...flat.matchAll(/periode du \d{2}\/(\d{2})\/(\d{4}) au \d{2}\/\d{2}\/\d{4}/gi)];
	blocks.forEach((block, index) => {
		const end = blocks[index + 1]?.index ?? flat.length;
		const segment = flat.slice(block.index!, end);
		const rows = [
			...segment.matchAll(
				new RegExp(String.raw`allocation d aide au retour a l emploi\s+(\d+)\s+${NUM}\s+${NUM}\s+${NUM}\s+${NUM}\s+${NUM}`, 'gi')
			)
		];
		const row = rows.at(-1);
		if (!row) return;
		const month = `${block[2]}-${block[1]}`;
		months.set(month, {
			month,
			days: Number(row[1]),
			gross: toAmount(row[2]),
			pension: toAmount(row[3]),
			social: toAmount(row[4]),
			tax: toAmount(row[5]),
			net: toAmount(row[6])
		});
	});
	const dailyAllowance = toAmount(flat.match(new RegExp(String.raw`montant journalier de\s+(\d+,\d{2})`, 'i'))?.[1]);
	const rightsEnd = flat.match(/date limite de votre indemnisation est le (\d{2})\/(\d{2})\/(\d{4})/i);
	return {
		months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
		dailyAllowance,
		rightsEnd: rightsEnd ? `${rightsEnd[3]}-${rightsEnd[2]}-${rightsEnd[1]}` : ''
	};
}

export function analyzeFranceTravailLetter(
	text: string,
	fileName: string
): (Omit<FranceTravailDocument, 'id' | 'storedName'> & { situation?: ReturnType<typeof parseSituationStatement> }) | undefined {
	if (!isFranceTravailLetter(text) || isAdmissionNotification(text)) return undefined;
	const flat = flatten(text);
	const date = letterDate(flat);
	const base = { fileName, date, year: '', amount: 0, withheldTax: 0, months: [] as string[] };

	if (/releve de situation/i.test(flat)) {
		const situation = parseSituationStatement(text);
		const total = situation.months.reduce((sum, item) => sum + item.net, 0);
		return {
			...base,
			kind: 'Relevé de situation',
			months: situation.months.map((item) => item.month),
			summary: situation.months.length
				? situation.months
						.map((item) => `${item.month} : ${item.days} AJ, ${item.net.toFixed(2).replace('.', ',')} € net`)
						.join(' · ')
				: 'Relevé sans allocation versée',
			amount: Math.round(total * 100) / 100,
			situation
		};
	}

	if (/justificatif pour votre declaration fiscale|attestation d indemnisation en/i.test(flat)) {
		const year =
			flat.match(/declaration fiscale (\d{4})/i)?.[1] ??
			flat.match(/attestation d indemnisation en (\d{4})/i)?.[1] ??
			flat.match(/declaration de revenus de (\d{4})/i)?.[1] ??
			'';
		const nothing = /montant a declarer aupres de votre administration fiscale est nul/i.test(flat);
		const amount = nothing
			? 0
			: toAmount(flat.match(new RegExp(String.raw`lignes? ap a fp\)? de votre declaration de revenus de \d{4}\s*:?\s*${NUM}`, 'i'))?.[1]);
		const withheld = toAmount(
			flat.match(new RegExp(String.raw`prelev[ée] a la source et verse a la direction generale des finances publiques est de\s*${NUM}`, 'i'))?.[1]
		);
		return {
			...base,
			kind: 'Attestation fiscale',
			year,
			amount,
			withheldTax: withheld,
			summary: nothing
				? `Revenus ${year} : rien à déclarer pour ce dossier`
				: `Revenus ${year} : ${amount.toFixed(2).replace('.', ',')} € à déclarer (case 1AP)${withheld ? `, ${withheld.toFixed(2).replace('.', ',')} € prélevés à la source` : ''}`
		};
	}

	if (/fin de (?:periode|droits)|atteinte de votre/i.test(flat) || /fin periode indemnisation/i.test(flatten(fileName))) {
		return { ...base, kind: 'Fin de droits', summary: 'Fin de période d’indemnisation' };
	}

	return { ...base, kind: 'Courrier', summary: 'Courrier France Travail' };
}

/** Writes the allocations of a statement into the monthly infos (net received, gross per day). */
export function applySituationMonths(
	monthlyInfos: MonthlyInfo[],
	months: SituationMonth[],
	periodId: string
) {
	for (const item of months) {
		let info = monthlyInfos.find((entry) => entry.month === item.month && (entry.periodId === periodId || !entry.periodId));
		if (!info) {
			info = { month: item.month, periodId, congeSpectacle: 0, realIndemnity: 0, dailyIndemnity: 0, notes: '' };
			monthlyInfos.push(info);
		}
		info.realIndemnity = item.net;
		info.dailyIndemnity = item.days ? Math.round((item.gross / item.days) * 100) / 100 : 0;
		const note = `France Travail : ${item.days} AJ, brut ${item.gross.toFixed(2).replace('.', ',')} €, PAS ${item.tax.toFixed(2).replace('.', ',')} €`;
		info.notes = [info.notes.replace(/France Travail : [^·]*/g, '').replace(/^\s*·\s*|\s*·\s*$/g, ''), note].filter(Boolean).join(' · ');
	}
}
