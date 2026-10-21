import type { AppData } from '$lib/types';

/**
 * Readable names for the copies kept in the app's storage folder, e.g.
 * "202607_Bulletin_maprod_mon-projet.pdf".
 */

function plain(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

const LEGAL_WORDS = new Set([
	'eurl', 'sarl', 'sas', 'sasu', 'sa', 'scop', 'sci', 'snc', 'scic',
	'production', 'productions', 'prod', 'prods', 'association', 'asso', 'ste', 'societe'
]);

export function employerSlug(name: string) {
	const main = name.split('(')[0];
	const words = plain(main)
		.split(' ')
		.filter((word) => word && !LEGAL_WORDS.has(word));
	return (words.join('') || plain(main).replace(/ /g, '')).slice(0, 30);
}

export function projectSlug(name: string) {
	return plain(name).split(' ').filter(Boolean).join('-').slice(0, 40).replace(/-+$/, '');
}

function monthOf(date: string) {
	return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7).replace('-', '') : '000000';
}

function documentType(fileName: string, kind: string, isPart = false) {
	const name = plain(fileName);
	// A part cut out of a multi-document PDF ("…-p2.pdf") keeps the parent's file name, so the
	// name says nothing about this part: trust the kind detected from its own content.
	if (!isPart) {
		if (/\bbulletin|\bbul\b|^bp\b|\bpaie\b|\bfiche de paie\b/.test(name)) return 'Bulletin';
		if (/\baem\b/.test(name)) return 'AEM';
		if (/\bcontrat\b|\bsigned\b/.test(name)) return 'Contrat';
		if (/^cs\b|\bconges?\b|\bcertificat\b/.test(name)) return 'CongesSpectacles';
		if (/\bnda\b|\bdecompte\b|\bdroits?\b/.test(name)) return 'NoteDroits';
	}
	switch (kind) {
		case 'Fiche de paie':
			return 'Bulletin';
		case 'AEM':
			return 'AEM';
		case 'Contrat':
			return 'Contrat';
		case 'Congé Spectacle':
			return 'CongesSpectacles';
		case 'Déclaration Guso':
			return 'Guso';
		case 'Notification ARE':
			return 'ARE';
		default:
			return 'Document';
	}
}

function extensionOf(name: string) {
	const match = name.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
	return match ? `.${match[1]}` : '.pdf';
}

const FOLDER_BY_TYPE: Record<string, string> = {
	Bulletin: 'Bulletins de salaire',
	AEM: 'AEM',
	Contrat: 'Contrats',
	CongesSpectacles: 'Congés Spectacles',
	// Rights paid by producers under the cession contract.
	NoteDroits: "Droits d'auteur",
	// Broadcast/performance rights paid by the societies (SACD, SACEM, SCAM).
	Diffusion: 'Droits de diffusion',
	ARE: 'Notifications ARE',
	FranceTravail: 'France Travail',
	Guso: 'GUSO',
	Document: 'Autres'
};

/** "Folder/AAAAMM_Type_employeur_projet.ext"; parts[1] is the document type. */
function build(parts: string[], extension: string) {
	const folder = FOLDER_BY_TYPE[parts[1]] ?? 'Autres';
	return `${folder}/${parts.filter(Boolean).join('_')}${extension}`;
}

export type RenamePlan = { from: string; to: string };

/** Computes the target name of every stored file and updates `data` in place. */
export function planReadableNames(data: AppData): RenamePlan[] {
	const plans: RenamePlan[] = [];
	const taken = new Set<string>();

	const unique = (wanted: string, current: string) => {
		if (wanted === current) {
			taken.add(current);
			return current;
		}
		const dot = wanted.lastIndexOf('.');
		const stem = wanted.slice(0, dot);
		const extension = wanted.slice(dot);
		let candidate = wanted;
		for (let index = 2; taken.has(candidate) || (candidate !== current && allNames.has(candidate)); index += 1) {
			candidate = `${stem}_${index}${extension}`;
		}
		taken.add(candidate);
		return candidate;
	};

	const allNames = new Set([
		...data.documents.map((item) => item.storedName),
		...data.periods.map((item) => item.sourceStoredName),
		...data.royalties.map((item) => item.storedName),
		...(data.congesPayments ?? []).map((item) => item.storedName)
	].filter(Boolean));

	const renamed = new Map<string, string>();
	const rename = (current: string, wanted: string) => {
		if (!current) return current;
		const already = renamed.get(current);
		if (already) return already;
		const target = unique(wanted, current);
		renamed.set(current, target);
		if (target !== current) {
			plans.push({ from: current, to: target });
			allNames.delete(current);
			allNames.add(target);
		}
		return target;
	};

	for (const document of data.documents) {
		const contract = data.contracts.find((item) => item.id === document.contractId);
		const company = data.companies.find((item) => item.id === contract?.companyId);
		const project = data.projects.find((item) => item.id === contract?.projectId);
		const date = contract?.startDate || document.extractedFields.startDate || document.uploadedAt;
		const wanted = build(
			[
				monthOf(date),
				documentType(
					document.originalFileName || document.fileName,
					document.kind,
					/-p\d+(?:-\d+)?\.[a-z0-9]+$/i.test(document.fileName)
				),
				company ? employerSlug(company.name) : '',
				project ? projectSlug(project.name) : ''
			],
			extensionOf(document.storedName)
		);
		document.storedName = rename(document.storedName, wanted);
	}

	for (const period of data.periods) {
		if (!period.sourceStoredName) continue;
		const wanted = build(
			[monthOf(period.admissionDate || period.createdAt), 'ARE', 'francetravail'],
			extensionOf(period.sourceStoredName)
		);
		period.sourceStoredName = rename(period.sourceStoredName, wanted);
	}

	for (const payment of data.congesPayments ?? []) {
		if (!payment.storedName) continue;
		const wanted = build(
			[monthOf(payment.paymentDate), 'CongesSpectacles', 'audiens', payment.season ? `saison-${payment.season}` : ''],
			extensionOf(payment.storedName)
		);
		payment.storedName = rename(payment.storedName, wanted);
	}

	for (const letter of data.franceTravailDocs ?? []) {
		if (!letter.storedName) continue;
		const type =
			letter.kind === 'Relevé de situation'
				? 'ReleveSituation'
				: letter.kind === 'Attestation fiscale'
					? `AttestationFiscale${letter.year ? `-${letter.year}` : ''}`
					: letter.kind === 'Fin de droits'
						? 'FinDeDroits'
						: 'Courrier';
		const wanted = `${FOLDER_BY_TYPE.FranceTravail}/${[monthOf(letter.date), type, 'francetravail'].join('_')}${extensionOf(letter.storedName)}`;
		letter.storedName = rename(letter.storedName, wanted);
	}

	for (const payment of data.royalties) {
		if (!payment.storedName) continue;
		const project = payment.label.split('—').slice(1).join('—').trim();
		const society = payment.source === 'SACD' || payment.source === 'SACEM' || payment.source === 'SCAM';
		const wanted = build(
			[
				monthOf(payment.paymentDate),
				society ? 'Diffusion' : 'NoteDroits',
				payment.payerName ? employerSlug(payment.payerName) : payment.source === 'SACEM' ? 'sacem' : payment.source === 'SACD' ? 'sacd' : '',
				project ? projectSlug(project) : ''
			],
			extensionOf(payment.storedName)
		);
		payment.storedName = rename(payment.storedName, wanted);
	}

	return plans;
}
