import type { YearOverview } from '$lib/royalties';

/** SMIC horaire brut au 1er janvier (sert au seuil de 600 h SMIC). */
const smicHoraire: Record<string, number> = {
	'2022': 10.57,
	'2023': 11.27,
	'2024': 11.65,
	'2025': 11.88,
	'2026': 12.02
};

/**
 * Taux approximatif à la charge de l'auteur quand rien n'a été précompté :
 * vieillesse plafonnée 6,90 % + déplafonnée 0,40 % − 1,15 pt pris en charge par l'État,
 * CSG 9,20 % + CRDS 0,50 % sur 98,25 %, formation 0,35 %.
 */
export const URSSAF_AUTHOR_RATE = 0.069 + 0.004 - 0.0115 + (0.092 + 0.005) * 0.9825 + 0.0035;

export type UrssafYear = {
	year: string;
	declarationYear: number;
	gross: number;
	withheldGross: number;
	notWithheldGross: number;
	estimatedDue: number;
	threshold: number;
	belowThreshold: boolean;
	smic: number;
};

export function urssafAuthorYear(overview: YearOverview): UrssafYear {
	const known = Object.keys(smicHoraire).sort();
	const smic = smicHoraire[overview.year] ?? smicHoraire[known[known.length - 1]];
	const gross = overview.royalties.gross;
	const notWithheldGross = overview.royalties.notWithheldGross;
	const threshold = Math.round(600 * smic);
	return {
		year: overview.year,
		declarationYear: Number(overview.year) + 1,
		gross,
		withheldGross: Math.round((gross - notWithheldGross) * 100) / 100,
		notWithheldGross,
		estimatedDue: Math.round(notWithheldGross * URSSAF_AUTHOR_RATE),
		threshold,
		belowThreshold: gross > 0 && gross < threshold,
		smic
	};
}
