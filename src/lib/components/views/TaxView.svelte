<script lang="ts">
	import type { IntermittensState } from '$lib/app/state.svelte';
	import { formatCurrency, formatPreciseCurrency } from '$lib/format';
	import { monthLabel } from '$lib/stats';
	import { buildTaxYear, taxYearCsv, taxYears } from '$lib/taxes';
	import type { TaxYearSettings } from '$lib/types';

	let { state: appState }: { state: IntermittensState } = $props();

	const defaultSettings = (): TaxYearSettings => ({
		// 10 % deduction bounds for 2025 income (declared in 2026); to check for other years.
		flatDeductionMin: 509,
		flatDeductionMax: 14555,
		unemploymentTaxable: 0,
		congesSpectaclesTaxable: 0,
		withheldAtSource: 0,
		mileageKm: 0,
		mileageRate: 0,
		meals: 0,
		equipment: 0,
		otherExpenses: 0,
		notes: ''
	});

	let years = $derived(taxYears(appState.appData));
	let selectedYear = $state(String(new Date().getFullYear() - 1));

	$effect(() => {
		const settings = appState.appData.settings;
		settings.taxYears ??= {};
		if (!settings.taxYears[selectedYear]) settings.taxYears[selectedYear] = defaultSettings();
	});

	let settings = $derived(appState.appData.settings.taxYears?.[selectedYear] ?? defaultSettings());
	let summary = $derived(buildTaxYear(appState.appData, selectedYear, settings));

	function downloadCsv() {
		const blob = new Blob(['﻿' + taxYearCsv(summary)], { type: 'text/csv;charset=utf-8' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `impots-${selectedYear}.csv`;
		link.click();
		URL.revokeObjectURL(link.href);
	}
</script>

<section class="royalties-toolbar">
	<label class="compact-select">
		<span>Année des revenus</span>
		<select bind:value={selectedYear}>
			{#each years as year}
				<option value={year}>{year} (déclarés en {Number(year) + 1})</option>
			{/each}
		</select>
	</label>
	<div class="button-row">
		<button type="button" onclick={downloadCsv}>Exporter le bilan (CSV)</button>
	</div>
</section>

<section class="metrics-grid" aria-label="Bilan fiscal de l'année">
	<div class="metric">
		<span>Revenus imposables {selectedYear}</span>
		<strong>{formatCurrency(summary.totalTaxable)}</strong>
		<small>avant déduction des frais</small>
	</div>
	<div class="metric">
		<span>Déduction retenue</span>
		<strong>{formatCurrency(summary.bestDeduction)}</strong>
		<small>{summary.bestIsActual ? 'frais réels' : 'forfait 10 %'}</small>
	</div>
	<div class="metric">
		<span>Net imposable estimé</span>
		<strong>{formatCurrency(summary.netTaxable)}</strong>
		<small>janvier → décembre {selectedYear}</small>
	</div>
	<div class="metric">
		<span>Déjà prélevé à la source</span>
		<strong>{formatCurrency(summary.withheldAtSource)}</strong>
		<small>à saisir (relevé impots.gouv)</small>
	</div>
</section>

<section class="view-grid two-columns">
	<section class="panel">
		<div class="panel-heading">
			<h3>Ce qu'il faut déclarer</h3>
		</div>
		<div class="table-wrap">
			<table class="royalties-table">
				<tbody>
					<tr>
						<td>Salaires (net imposable des bulletins)</td>
						<td class="num">{formatPreciseCurrency(summary.salaryTaxable)}</td>
					</tr>
					<tr>
						<td>
							Allocations chômage France Travail
							{#if summary.unemploymentIsEstimate}<small> · estimation</small>{/if}
						</td>
						<td class="num">{formatPreciseCurrency(summary.unemployment)}</td>
					</tr>
					<tr>
						<td>
							Indemnités Congés Spectacles
							{#if summary.congesSpectaclesIsEstimate}<small> · estimation</small>{/if}
						</td>
						<td class="num">{formatPreciseCurrency(summary.congesSpectacles)}</td>
					</tr>
					<tr>
						<td>Droits d'auteur (net imposable des décomptes)</td>
						<td class="num">{formatPreciseCurrency(summary.royaltiesTaxable)}</td>
					</tr>
					<tr class="total-row">
						<td>Total imposable</td>
						<td class="num">{formatPreciseCurrency(summary.totalTaxable)}</td>
					</tr>
					<tr>
						<td>− {summary.bestIsActual ? 'Frais réels' : 'Déduction forfaitaire 10 %'}</td>
						<td class="num">{formatPreciseCurrency(summary.bestDeduction)}</td>
					</tr>
					<tr class="total-row">
						<td>Net imposable estimé</td>
						<td class="num">{formatPreciseCurrency(summary.netTaxable)}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div class="declaration-checklist">
			{#if summary.contractsWithoutTaxable}
				<p class="alert">
					{summary.contractsWithoutTaxable} contrat(s) sans net imposable : le net est utilisé à la
					place. Vérifiez-les dans l'onglet Contrats.
				</p>
			{/if}
			{#if summary.unemploymentIsEstimate}
				<p class="hint">
					Allocations : estimation à partir des montants saisis dans l'onglet Intermittence. Pour le
					chiffre exact, reportez ci-dessous le montant de l'attestation fiscale France Travail.
				</p>
			{/if}
			<p class="hint">
				Comparez avec votre déclaration pré-remplie : salaires et allocations y figurent déjà,
				employeur par employeur. Les droits d'auteur déclarés par le producteur peuvent être
				ajoutés aux salaires (et profiter de la même déduction) ou déclarés en BNC. Ce bilan est une
				aide, pas un calcul officiel de l'impôt.
			</p>
			<div class="button-row">
				<a class="ghost-button" href="https://www.impots.gouv.fr" target="_blank" rel="noreferrer"
					>impots.gouv.fr ↗</a
				>
				<a class="ghost-button" href="https://www.artistes-auteurs.urssaf.fr" target="_blank" rel="noreferrer"
					>URSSAF artistes-auteurs ↗</a
				>
			</div>
		</div>
	</section>

	<section class="panel">
		<div class="panel-heading">
			<h3>Forfait 10 % ou frais réels ?</h3>
		</div>
		<div class="form-grid tight">
			<label>
				<span>Kilomètres professionnels</span>
				<input type="number" min="0" step="1" bind:value={settings.mileageKm} />
			</label>
			<label>
				<span>Barème €/km (selon votre véhicule)</span>
				<input type="number" min="0" step="0.001" bind:value={settings.mileageRate} />
			</label>
			<label>
				<span>Repas</span>
				<input type="number" min="0" step="0.01" bind:value={settings.meals} />
			</label>
			<label>
				<span>Matériel, logiciels</span>
				<input type="number" min="0" step="0.01" bind:value={settings.equipment} />
			</label>
			<label class="wide">
				<span>Autres frais (formation, documentation, téléphone…)</span>
				<input type="number" min="0" step="0.01" bind:value={settings.otherExpenses} />
			</label>
		</div>
		<div class="income-compare tax-compare">
			<div class:best={!summary.bestIsActual}>
				<span>Forfait 10 %</span>
				<strong>{formatCurrency(summary.flatDeduction)}</strong>
				<small>min {formatCurrency(settings.flatDeductionMin)} · max {formatCurrency(settings.flatDeductionMax)}</small>
			</div>
			<div class:best={summary.bestIsActual}>
				<span>Frais réels</span>
				<strong>{formatCurrency(summary.actualExpenses)}</strong>
				<small>{summary.bestIsActual ? 'plus avantageux' : 'moins que le forfait'}</small>
			</div>
		</div>
		<p class="hint">
			Aux frais réels, gardez les justificatifs. Le barème kilométrique dépend de la puissance du
			véhicule et de la distance : prenez le chiffre officiel de l'année sur impots.gouv.fr.
		</p>

		<h3 class="tax-subtitle">Montants officiels de l'année</h3>
		<div class="form-grid tight">
			<label>
				<span>Allocations chômage (attestation France Travail)</span>
				<input type="number" min="0" step="0.01" bind:value={settings.unemploymentTaxable} placeholder="0 = estimation" />
			</label>
			<label>
				<span>Congés Spectacles (attestation Audiens)</span>
				<input type="number" min="0" step="0.01" bind:value={settings.congesSpectaclesTaxable} placeholder="0 = estimation" />
			</label>
			<label>
				<span>Prélèvement à la source de l'année</span>
				<input type="number" min="0" step="0.01" bind:value={settings.withheldAtSource} />
			</label>
			<label>
				<span>Forfait 10 % : minimum / maximum</span>
				<span class="pair-inputs">
					<input type="number" min="0" step="1" bind:value={settings.flatDeductionMin} />
					<input type="number" min="0" step="1" bind:value={settings.flatDeductionMax} />
				</span>
			</label>
			<label class="wide">
				<span>Notes</span>
				<textarea rows="2" bind:value={settings.notes}></textarea>
			</label>
		</div>
		<p class="hint">
			Minimum et maximum par défaut : ceux des revenus 2025 (509 € et 14 555 €). Pour une autre
			année, vérifiez-les sur impots.gouv.fr.
		</p>
	</section>
</section>

<section class="view-grid two-columns">
	<section class="panel">
		<div class="panel-heading">
			<h3>Mois par mois</h3>
		</div>
		<div class="table-wrap">
			<table class="royalties-table">
				<thead>
					<tr>
						<th>Mois</th>
						<th class="num">Salaires imposables</th>
						<th class="num">Chômage</th>
						<th class="num">Congés Spect.</th>
						<th class="num">Droits d'auteur</th>
						<th class="num">Total</th>
					</tr>
				</thead>
				<tbody>
					{#each summary.months as month}
						<tr class:muted-row={!month.total}>
							<td>{monthLabel(month.month)}</td>
							<td class="num">{formatCurrency(month.salaryTaxable)}</td>
							<td class="num">{formatCurrency(month.unemployment)}</td>
							<td class="num">{formatCurrency(month.congesSpectacles)}</td>
							<td class="num">{formatCurrency(month.royaltiesTaxable)}</td>
							<td class="num">{formatCurrency(month.total)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="panel">
		<div class="panel-heading">
			<h3>Par employeur</h3>
		</div>
		<div class="table-wrap">
			<table class="royalties-table">
				<thead>
					<tr>
						<th>Employeur</th>
						<th class="num">Contrats</th>
						<th class="num">Brut</th>
						<th class="num">Net imposable</th>
					</tr>
				</thead>
				<tbody>
					{#each summary.employers as employer}
						<tr>
							<td>{employer.name}{#if employer.missingTaxable}<small> · {employer.missingTaxable} sans net imp.</small>{/if}</td>
							<td class="num">{employer.contracts}</td>
							<td class="num">{formatPreciseCurrency(employer.gross)}</td>
							<td class="num">{formatPreciseCurrency(employer.taxable)}</td>
						</tr>
					{/each}
					{#if summary.employers.length === 0}
						<tr><td colspan="4" class="empty">Aucun contrat en {selectedYear}.</td></tr>
					{/if}
				</tbody>
			</table>
		</div>
		<p class="hint">
			Droits d'auteur {selectedYear} : {formatPreciseCurrency(summary.royaltiesGross)} bruts,
			{formatPreciseCurrency(summary.royaltiesWithheld)} de cotisations retenues,
			{formatPreciseCurrency(summary.royaltiesNet)} nets versés.
		</p>
	</section>
</section>
