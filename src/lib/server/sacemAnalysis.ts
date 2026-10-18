import type { RoyaltyLine, RoyaltyPayment } from '$lib/types';

/**
 * SACEM "Mon relevé de compte" (export .xlsx/.csv of the member account): one line per movement.
 * Each "REPARTITION nnn" opens a distribution; the following lines (TVA forfait, contributions,
 * cotisation SACEM) belong to it until the bank transfer. One payment per distribution.
 */

type Movement = { date: string; label: string; amount: number };

function toAmount(value: string) {
	const parsed = Number(value.replace(/[\s  "]/g, '').replace(',', '.'));
	return Number.isFinite(parsed) ? parsed : 0;
}

function parseMovements(text: string): Movement[] {
	const movements: Movement[] = [];
	// "07/01/2026,REPARTITION 673,"43,53","43,53"" — one row per line, or glued on one line.
	const row = /(\d{2})\/(\d{2})\/(\d{4}),([^,\n]+?),"?(-?[\d\s.]+,\d{2})"?,"?-?[\d\s.]+,\d{2}"?/g;
	for (const match of text.matchAll(row)) {
		const [, day, month, year, label, amount] = match;
		movements.push({ date: `${year}-${month}-${day}`, label: label.trim(), amount: toAmount(amount) });
	}
	return movements;
}

export function isSacemAccountStatement(text: string) {
	return (
		/mon relev[ée] de compte|date\s*,\s*libell[ée]\s*,\s*mouvements/i.test(text) &&
		/\bREPARTITION\s+\d+/i.test(text)
	);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function analyzeSacemAccount(
	text: string,
	fileName: string
): Omit<RoyaltyPayment, 'id' | 'storedName' | 'fileName'>[] {
	if (!isSacemAccountStatement(text)) return [];
	const movements = parseMovements(text);
	const payments: Omit<RoyaltyPayment, 'id' | 'storedName' | 'fileName'>[] = [];
	const byDate = new Map<string, Movement[]>();
	for (const movement of movements) {
		const list = byDate.get(movement.date) ?? [];
		list.push(movement);
		byDate.set(movement.date, list);
	}

	for (const [date, list] of byDate) {
		const distribution = list.find((item) => /^repartition\b/i.test(item.label));
		if (!distribution) continue;
		const gross = distribution.amount;
		const vatForfait = list.filter((item) => /forfait tva/i.test(item.label)).reduce((t, i) => t + i.amount, 0);
		const social = list.filter((item) =>
			/cotisation urssaf|contribution formation|csg|crds|racd|retraite/i.test(item.label)
		);
		const withheld = round2(-social.reduce((t, i) => t + i.amount, 0));
		const membership = round2(-list.filter((item) => /cotisation sacem/i.test(item.label)).reduce((t, i) => t + i.amount, 0));
		const transfer = round2(-list.filter((item) => /virement/i.test(item.label)).reduce((t, i) => t + i.amount, 0));
		// Taxable net (as on SACD statements): gross + TVA forfait − deductible contributions
		// (pension, training, deductible CSG); non-deductible CSG and CRDS stay taxable.
		const deductible = -social
			.filter((item) => !/non deductible|crds/i.test(item.label.normalize('NFD').replace(/\p{Diacritic}/gu, '')))
			.reduce((t, i) => t + i.amount, 0);
		const taxable = round2(gross + vatForfait - deductible);
		const netAmount = round2(gross + vatForfait - withheld);
		const notes = [
			`Net imposable : ${taxable.toFixed(2).replace('.', ',')} €`,
			membership ? `Cotisation SACEM retenue : ${membership.toFixed(2).replace('.', ',')} €` : '',
			transfer ? `Virement : ${transfer.toFixed(2).replace('.', ',')} €` : '',
			`Importé depuis ${fileName}`
		]
			.filter(Boolean)
			.join(' · ');
		payments.push({
			source: 'SACEM',
			payerName: 'SACEM',
			workId: '',
			label: distribution.label.replace(/^repartition/i, 'Répartition'),
			paymentDate: date,
			grossAmount: round2(gross),
			withheldContributions: withheld,
			netAmount,
			contributionsWithheld: withheld > 0,
			status: 'Reçu',
			notes,
			taxableAmount: taxable,
			lines: []
		});
	}
	return payments.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
}

/**
 * SACEM "Toutes œuvres" detail export (CSV, ";"): one line per work and use, with the
 * distribution number ("Rion paiement"), title, work code, user (channel), period and net rights.
 */
export function isSacemWorksDetail(text: string) {
	return /rion paiement\s*;\s*titre de l.oeuvre/i.test(text.replace(/^﻿/, ''));
}

export type SacemDetailLine = RoyaltyLine & { distribution: string };

export function parseSacemWorksDetail(text: string): SacemDetailLine[] {
	const rows = text
		.replace(/^﻿/, '')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const header = rows.shift()?.split(';').map((cell) => cell.trim().toLowerCase()) ?? [];
	const col = (name: RegExp) => header.findIndex((cell) => name.test(cell));
	const at = {
		distribution: col(/^rion paiement/),
		title: col(/^titre de l.oeuvre$/),
		code: col(/^code de l.oeuvre$/),
		genre: col(/^genre$/),
		family: col(/^familles/),
		use: col(/^types d.utilisation/),
		user: col(/^utilisateurs/),
		country: col(/^pays/),
		period: col(/^p[ée]riode/),
		quantity: col(/^quantit/),
		share: col(/^cl[ée] de$/),
		net: col(/^mes droits en net/)
	};
	const num = (value?: string) => Number((value ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
	return rows.map((row) => {
		const cells = row.split(';');
		const get = (index: number) => (index >= 0 ? (cells[index] ?? '').trim() : '');
		const rawTitle = get(at.title);
		const title = /^non renseign/i.test(rawTitle) ? '' : rawTitle;
		return {
			distribution: get(at.distribution),
			workCode: get(at.code) === '-1' ? '' : get(at.code),
			title,
			workId: '',
			broadcaster: get(at.user),
			period: get(at.period),
			count: num(get(at.quantity)),
			duration: '',
			mode: get(at.use) || get(at.family),
			country: get(at.country) === 'FRANCE' ? 'FR' : get(at.country),
			amount: Math.round(num(get(at.net)) * 100) / 100,
			societyFee: 0,
			sharePercent: num(get(at.share)),
			flags: get(at.genre),
			producer: ''
		};
	});
}
