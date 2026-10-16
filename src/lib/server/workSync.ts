import type { AppData, AuthorWork, ContractDocument } from '$lib/types';

/**
 * Builds the author works ("œuvres") from the cession contracts and the royalty statements:
 * - each cession contract gives a work (its title, the producer, the rights promised);
 * - each royalty statement is linked to its work by title, or creates it.
 * The amount promised can then be compared with what the statements actually paid.
 */

const STOP_WORDS = new Set([
	'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'et', 'the', 'a', 'of',
	'documentaire', 'docu', 'film', 'captation', 'concert', 'spectacle'
]);

function flatten(text: string) {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[’']/g, ' ')
		.replace(/œ/gi, 'oe')
		.replace(/\bpage \d+ sur \d+\b/gi, ' ')
		.replace(/\s+/g, ' ');
}

export function titleTokens(title: string) {
	return flatten(title)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((token) => token && !STOP_WORDS.has(token))
		// "tenors"/"tenor", "chants"/"chant": compare singular stems.
		.map((token) => (token.length > 3 ? token.replace(/s$/, '') : token));
}

/** Same work when every significant word of the shorter title is in the longer one. */
export function titlesMatch(a: string, b: string) {
	const left = titleTokens(a);
	const right = titleTokens(b);
	if (!left.length || !right.length) return false;
	const [short, long] = left.length <= right.length ? [left, right] : [right, left];
	const longSet = new Set(long);
	// Years must agree (Chants Libres 2025 ≠ 2026).
	const years = (tokens: string[]) => tokens.filter((token) => /^(19|20)\d{2}$/.test(token));
	const yearsA = years(left);
	const yearsB = years(right);
	if (yearsA.length && yearsB.length && !yearsA.some((year) => yearsB.includes(year))) return false;
	return short.every((token) => longSet.has(token));
}

function toAmount(value: string | undefined) {
	if (!value) return undefined;
	const parsed = Number(value.replace(/[\s  .]/g, '').replace(',', '.'));
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const AMOUNT = String.raw`([0-9]{1,3}(?:[\s  .][0-9]{3})*(?:,[0-9]{1,2})?)\s*(?:€|euros?\b)`;

function amountsIn(segment: string) {
	return [...segment.matchAll(new RegExp(AMOUNT, 'gi'))]
		.map((match) => toAmount(match[1]))
		.filter((value): value is number => value !== undefined);
}

export function isCessionContract(text: string) {
	const flat = flatten(text).toLowerCase();
	return /contrat de cession de droits|cession de droits|contrat de realisation d une oeuvre/.test(flat) &&
		!/\bnet a payer\b/.test(flat);
}

export type ParsedCession = {
	title: string;
	promised: number;
	how: string;
	isAvenant: boolean;
};

/** Reads the work title and the gross rights promised in a cession contract or avenant. */
export function parseCessionContract(text: string): ParsedCession | undefined {
	if (!isCessionContract(text)) return undefined;
	const flat = flatten(text);
	const lower = flat.toLowerCase();
	const isAvenant = /\bavenant n\s*\S*\s*\d/.test(lower);

	const title =
		flat.match(/titre provisoire\s*:\s*[«"“]\s*(.+?)\s*[»"”]/i)?.[1] ??
		flat.match(/titre\s*:\s*[«"“]\s*(.+?)\s*[»"”]/i)?.[1] ??
		flat.match(/film intitule\s*[«"“]\s*(.+?)\s*[»"”]/i)?.[1] ??
		'';

	let promised: number | undefined;
	let how = '';

	// 1. Payment schedule: "DROITS D'AUTEURS (montants bruts) … SALAIRES".
	const schedule = flat.match(/droits d\s*auteurs?\s*\(montants? bruts?\)(.*?)salaires?\s*\(montants? bruts?\)/i)?.[1];
	if (schedule) {
		const values = amountsIn(schedule);
		if (values.length) {
			const [head, ...rest] = values;
			const restSum = rest.reduce((total, value) => total + value, 0);
			// "4 000 € — 1ère échéance 2 000 € — 2ème 2 000 €": the first figure is the total.
			promised = rest.length >= 2 && Math.abs(head - restSum) < 0.01 ? head : head + restSum;
			how = 'échéancier du contrat';
		}
	}

	// 2. "Des droits d'auteur d'un montant brut de 450 €" (one per film, add them up).
	if (promised === undefined) {
		const values = [
			...flat.matchAll(new RegExp(String.raw`droits d\s*auteurs? d\s*un montant brut de\s*${AMOUNT}`, 'gi'))
		]
			.map((match) => toAmount(match[1]))
			.filter((value): value is number => value !== undefined);
		if (values.length) {
			promised = values.reduce((total, value) => total + value, 0);
			how = 'droits d’auteur prévus au contrat';
		}
	}

	// 3. Article 4.2: "minimum garanti de 500 €" / "somme brute hors taxes de 4 000 €".
	if (promised === undefined) {
		const value = toAmount(
			flat.match(new RegExp(String.raw`minimum garanti de\s*${AMOUNT}`, 'i'))?.[1] ??
				flat.match(
					new RegExp(String.raw`droits d\s*auteur[^.]{0,200}?somme brute(?: hors taxes)? de\s*${AMOUNT}`, 'i')
				)?.[1]
		);
		if (value !== undefined) {
			promised = value;
			how = 'article « Droits d’auteur » du contrat';
		}
	}

	if (promised === undefined && !title) return undefined;
	return { title: title.trim(), promised: promised ?? 0, how, isAvenant };
}

/** "Décompte n° 003 — CONTRE TENORS" → "CONTRE TENORS". */
export function workTitleFromRoyaltyLabel(label: string) {
	const part = label.split('—').slice(1).join('—').trim();
	return part || '';
}

function newWork(title: string, producer: string): AuthorWork {
	return {
		id: `work_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
		title,
		kind: 'Audiovisuel',
		society: 'Droits directs',
		reference: '',
		coAuthors: '',
		sharePercent: 100,
		depositDate: '',
		notes: '',
		producer,
		promisedAmount: 0,
		promisedNotes: '',
		sourceDocumentIds: []
	};
}

function prettyTitle(title: string) {
	// Statement labels are in capitals: "MUSIC PROMENADE" → "Music Promenade".
	if (title !== title.toUpperCase()) return title;
	return title.toLowerCase().replace(/(^|[\s\-/'(])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase());
}

export async function syncWorks(
	data: AppData,
	readFullText: (document: ContractDocument) => Promise<string>
) {
	const companyName = (id: string) =>
		data.companies.find((company) => company.id === id)?.name.split('(')[0].trim() ?? '';
	const findWork = (title: string) => data.works.find((work) => titlesMatch(work.title, title));
	let changed = 0;

	// 1. Cession contracts (oldest first, so an avenant overrides its contract).
	const processed = new Set(data.works.flatMap((work) => work.sourceDocumentIds));
	const candidates = data.documents
		.filter((document) => document.kind === 'Contrat' && !processed.has(document.id))
		.filter(
			(document) =>
				isCessionContract(document.extractedTextPreview) ||
				/titre\s*(?:provisoire\s*)?:/i.test(document.extractedTextPreview)
		)
		.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));

	for (const document of candidates) {
		let text = document.extractedTextPreview;
		try {
			text = (await readFullText(document)) || text;
		} catch {
			// Keep the preview: the title is usually in it.
		}
		const parsed = parseCessionContract(text);
		const contract = data.contracts.find((item) => item.id === document.contractId);
		const projectName = data.projects.find((project) => project.id === contract?.projectId)?.name ?? '';
		const title = parsed?.title || projectName;
		if (!title) continue;

		let work = findWork(title) ?? (projectName ? findWork(projectName) : undefined);
		if (!work) {
			work = newWork(title, contract ? companyName(contract.companyId) : '');
			data.works.unshift(work);
		}
		if (!work.producer && contract) work.producer = companyName(contract.companyId);
		if (parsed?.promised && (parsed.isAvenant || !work.promisedAmount)) {
			work.promisedAmount = parsed.promised;
			work.promisedNotes = `${parsed.isAvenant ? 'Avenant' : 'Contrat'} (${parsed.how}) · ${document.originalFileName || document.fileName}`;
		}
		work.sourceDocumentIds.push(document.id);
		changed += 1;
	}

	// 2. Royalty statements: link each one to its work, or create the work.
	for (const payment of data.royalties) {
		if (payment.workId && data.works.some((work) => work.id === payment.workId)) continue;
		const title = workTitleFromRoyaltyLabel(payment.label);
		if (!title) continue;
		let work = findWork(title);
		if (!work) {
			work = newWork(prettyTitle(title), payment.payerName);
			data.works.unshift(work);
		}
		payment.workId = work.id;
		changed += 1;
	}

	return changed;
}
