<script lang="ts">
	import type { IntermittensState } from '$lib/app/state.svelte';
	import DateInput from '$lib/components/DateInput.svelte';
	import { formatCurrency, formatDate, formatNumber, formatPreciseCurrency } from '$lib/format';
	import {
		buildYearOverview,
		effectiveNet,
		paymentYear,
		royaltySources,
		royaltyYears,
		workTotals
	} from '$lib/royalties';
	import type { AuthorWork, RoyaltyPayment, RoyaltyStatus, WorkKind } from '$lib/types';

	let { state: appState }: { state: IntermittensState } = $props();

	const statuses: RoyaltyStatus[] = ['Attendu', 'Reçu', 'Déclaré'];
	const workKinds: WorkKind[] = ['Musique', 'Spectacle vivant', 'Audiovisuel', 'Texte', 'Autre'];

	const createId = (prefix: string) =>
		`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

	let years = $derived(royaltyYears(appState.appData));
	let selectedYear = $state(String(new Date().getFullYear()));
	let selectedPaymentId = $state('');
	let selectedWorkId = $state('');

	let overview = $derived(buildYearOverview(appState.appData, selectedYear));
	let yearPayments = $derived(
		appState.appData.royalties
			.filter((payment) => paymentYear(payment) === selectedYear || !payment.paymentDate)
			.sort((a, b) => (b.paymentDate || '9999').localeCompare(a.paymentDate || '9999'))
	);
	let selectedPayment = $derived(
		appState.appData.royalties.find((payment) => payment.id === selectedPaymentId)
	);
	let selectedWork = $derived(appState.appData.works.find((work) => work.id === selectedWorkId));
	let selectedWorkTotals = $derived(
		selectedWork ? workTotals(appState.appData, selectedWork.id) : undefined
	);

	function workTitle(workId: string) {
		return appState.appData.works.find((work) => work.id === workId)?.title ?? '';
	}

	function addPayment() {
		const today = new Date().toISOString().slice(0, 10);
		const payment: RoyaltyPayment = {
			id: createId('royalty'),
			source: 'SACEM',
			payerName: '',
			workId: selectedWorkId,
			label: '',
			paymentDate: selectedYear === today.slice(0, 4) ? today : `${selectedYear}-01-01`,
			grossAmount: 0,
			withheldContributions: 0,
			netAmount: 0,
			contributionsWithheld: true,
			status: 'Reçu',
			notes: ''
		};
		appState.appData.royalties.unshift(payment);
		selectedPaymentId = payment.id;
		appState.touch();
	}

	function removePayment(payment: RoyaltyPayment) {
		if (!confirm('Supprimer ce versement ?')) return;
		appState.appData.royalties = appState.appData.royalties.filter(
			(item) => item.id !== payment.id
		);
		selectedPaymentId = '';
		appState.touch();
	}

	function addWork() {
		const work: AuthorWork = {
			id: createId('work'),
			title: 'Nouvelle œuvre',
			kind: 'Musique',
			society: 'SACEM',
			reference: '',
			coAuthors: '',
			sharePercent: 100,
			depositDate: '',
			notes: ''
		};
		appState.appData.works.unshift(work);
		selectedWorkId = work.id;
		appState.touch();
	}

	function removeWork(work: AuthorWork) {
		if (!confirm(`Supprimer l'œuvre « ${work.title} » ? Les versements liés sont conservés.`))
			return;
		appState.appData.works = appState.appData.works.filter((item) => item.id !== work.id);
		for (const payment of appState.appData.royalties) {
			if (payment.workId === work.id) payment.workId = '';
		}
		selectedWorkId = '';
		appState.touch();
	}

	function fillNet(payment: RoyaltyPayment) {
		if (!payment.netAmount && payment.grossAmount) {
			payment.netAmount = Math.max(0, payment.grossAmount - payment.withheldContributions);
			appState.touch();
		}
	}

	function markYearDeclared() {
		const pending = appState.appData.royalties.filter(
			(payment) => paymentYear(payment) === selectedYear && payment.status === 'Reçu'
		);
		if (!pending.length) return;
		if (!confirm(`Marquer ${pending.length} versement(s) de ${selectedYear} comme déclarés ?`))
			return;
		for (const payment of pending) payment.status = 'Déclaré';
		appState.touch();
	}
</script>

<section class="royalties-toolbar">
	<label class="compact-select">
		<span>Année</span>
		<select bind:value={selectedYear}>
			{#each years as year}
				<option value={year}>{year}</option>
			{/each}
		</select>
	</label>
	<div class="button-row">
		<button class="primary" type="button" onclick={addPayment}>+ Versement</button>
		<button type="button" onclick={addWork}>+ Œuvre</button>
	</div>
</section>

<section class="metrics-grid" aria-label="Droits d'auteur de l'année">
	<div class="metric">
		<span>Droits bruts {selectedYear}</span>
		<strong>{formatCurrency(overview.royalties.gross)}</strong>
		<small>{overview.royalties.count} versement(s) reçu(s)</small>
	</div>
	<div class="metric">
		<span>Net perçu</span>
		<strong>{formatCurrency(overview.royalties.net)}</strong>
		<small>Cotisations précomptées {formatCurrency(overview.royalties.withheld)}</small>
	</div>
	<div class="metric">
		<span>À venir</span>
		<strong>{formatCurrency(overview.royalties.expected)}</strong>
		<small>Versements marqués « Attendu »</small>
	</div>
	<div class="metric">
		<span>Part des droits</span>
		<strong>{formatNumber(overview.royaltyShare * 100, 0)} %</strong>
		<small>du net total (salaires {formatCurrency(overview.salaryNet)})</small>
	</div>
</section>

<section class="view-grid two-columns">
	<section class="panel">
		<div class="panel-heading">
			<h3>Versements</h3>
			<button type="button" title="Ajouter un versement" onclick={addPayment}>+</button>
		</div>
		<div class="table-wrap">
			<table class="royalties-table">
				<thead>
					<tr>
						<th>Date</th>
						<th>Source</th>
						<th>Payeur / libellé</th>
						<th>Œuvre</th>
						<th class="num">Brut</th>
						<th class="num">Net</th>
						<th>Statut</th>
					</tr>
				</thead>
				<tbody>
					{#each yearPayments as payment (payment.id)}
						<tr
							class:selected={payment.id === selectedPaymentId}
							onclick={() => (selectedPaymentId = payment.id)}
						>
							<td>{formatDate(payment.paymentDate)}</td>
							<td><span class="source-tag" data-source={payment.source}>{payment.source}</span></td>
							<td>{payment.payerName || payment.label || '—'}</td>
							<td>{workTitle(payment.workId) || '—'}</td>
							<td class="num">{formatPreciseCurrency(payment.grossAmount)}</td>
							<td class="num">{formatPreciseCurrency(effectiveNet(payment))}</td>
							<td><span class="status" data-status={payment.status}>{payment.status}</span></td>
						</tr>
					{/each}
					{#if yearPayments.length === 0}
						<tr>
							<td colspan="7" class="empty">Aucun versement en {selectedYear}.</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

		{#if selectedPayment}
			<div class="form-grid tight royalty-form">
				<label>
					<span>Source</span>
					<select bind:value={selectedPayment.source}>
						{#each royaltySources as source}
							<option value={source}>{source}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>Date de versement</span>
					<DateInput bind:value={selectedPayment.paymentDate} />
				</label>
				<label>
					<span>Payeur</span>
					<input
						bind:value={selectedPayment.payerName}
						placeholder={selectedPayment.source === 'Droits directs' ? 'Producteur, éditeur…' : selectedPayment.source}
					/>
				</label>
				<label>
					<span>Libellé</span>
					<input bind:value={selectedPayment.label} placeholder="Répartition, note de droits n°…" />
				</label>
				<label class="wide">
					<span>Œuvre</span>
					<select bind:value={selectedPayment.workId}>
						<option value="">Plusieurs œuvres / non précisé</option>
						{#each appState.appData.works as work}
							<option value={work.id}>{work.title}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>Montant brut</span>
					<input type="number" min="0" step="0.01" bind:value={selectedPayment.grossAmount} />
				</label>
				<label>
					<span>Cotisations précomptées</span>
					<input
						type="number"
						min="0"
						step="0.01"
						bind:value={selectedPayment.withheldContributions}
						onchange={() => fillNet(selectedPayment!)}
					/>
				</label>
				<label>
					<span>Net versé</span>
					<input
						type="number"
						min="0"
						step="0.01"
						bind:value={selectedPayment.netAmount}
						placeholder="brut − cotisations"
					/>
				</label>
				<label>
					<span>Statut</span>
					<select bind:value={selectedPayment.status}>
						{#each statuses as status}
							<option value={status}>{status}</option>
						{/each}
					</select>
				</label>
				<label class="wide checkbox-line">
					<input type="checkbox" bind:checked={selectedPayment.contributionsWithheld} />
					<span>Cotisations prélevées à la source par le payeur (précompte)</span>
				</label>
				<label class="wide">
					<span>Notes</span>
					<textarea rows="2" bind:value={selectedPayment.notes}></textarea>
				</label>
				<div class="button-row wide">
					<button class="danger" type="button" onclick={() => removePayment(selectedPayment!)}>
						Supprimer
					</button>
				</div>
			</div>
		{/if}
	</section>

	<section class="panel">
		<div class="panel-heading">
			<h3>Aide à la déclaration {selectedYear}</h3>
			<button
				type="button"
				disabled={!overview.royalties.undeclaredCount}
				onclick={markYearDeclared}>Tout marquer déclaré</button
			>
		</div>

		<div class="table-wrap">
			<table class="royalties-table">
				<thead>
					<tr>
						<th>Source</th>
						<th class="num">Brut</th>
						<th class="num">Précompté</th>
						<th class="num">Net</th>
						<th class="num">Versements</th>
					</tr>
				</thead>
				<tbody>
					{#each overview.bySource as row}
						<tr class:muted-row={!row.totals.count}>
							<td><span class="source-tag" data-source={row.source}>{row.source}</span></td>
							<td class="num">{formatPreciseCurrency(row.totals.gross)}</td>
							<td class="num">{formatPreciseCurrency(row.totals.withheld)}</td>
							<td class="num">{formatPreciseCurrency(row.totals.net)}</td>
							<td class="num">{row.totals.count}</td>
						</tr>
					{/each}
					<tr class="total-row">
						<td>Total droits</td>
						<td class="num">{formatPreciseCurrency(overview.royalties.gross)}</td>
						<td class="num">{formatPreciseCurrency(overview.royalties.withheld)}</td>
						<td class="num">{formatPreciseCurrency(overview.royalties.net)}</td>
						<td class="num">{overview.royalties.count}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div class="declaration-checklist">
			{#if overview.royalties.notWithheldGross > 0}
				<p class="alert">
					<strong>{formatPreciseCurrency(overview.royalties.notWithheldGross)}</strong> de droits bruts
					ont été versés <em>sans précompte</em> : les cotisations n'ont pas été prélevées, pensez à
					les déclarer vous-même à l'URSSAF artistes-auteurs.
				</p>
			{/if}
			{#if overview.royalties.undeclaredCount > 0}
				<p class="hint">
					{overview.royalties.undeclaredCount} versement(s) reçu(s) en {selectedYear} pas encore
					marqué(s) comme déclaré(s).
				</p>
			{:else if overview.royalties.count > 0}
				<p class="ok-line">Tous les versements de {selectedYear} sont marqués déclarés.</p>
			{/if}

			<div class="income-compare">
				<div>
					<span>Salaires intermittence</span>
					<strong>{formatCurrency(overview.salaryTaxable)}</strong>
					<small>net imposable · brut {formatCurrency(overview.salaryGross)}</small>
				</div>
				<div>
					<span>Droits d'auteur</span>
					<strong>{formatCurrency(overview.royalties.gross)}</strong>
					<small>brut · net {formatCurrency(overview.royalties.net)}</small>
				</div>
			</div>

			<p class="hint">
				Ces totaux servent de base pour la déclaration annuelle à l'URSSAF artistes-auteurs et pour la
				déclaration de revenus. Les droits d'auteur ne comptent pas dans les 507 heures. Vérifiez
				toujours les montants sur les relevés de la SACEM, de la SACD et vos notes de droits.
			</p>
			<div class="button-row">
				<a class="ghost-button" href="https://www.artistes-auteurs.urssaf.fr" target="_blank" rel="noreferrer"
					>URSSAF artistes-auteurs ↗</a
				>
				<a class="ghost-button" href="https://www.impots.gouv.fr" target="_blank" rel="noreferrer"
					>impots.gouv.fr ↗</a
				>
			</div>
		</div>
	</section>
</section>

<section class="view-grid two-columns">
	<section class="panel">
		<div class="panel-heading">
			<h3>Œuvres</h3>
			<button type="button" title="Ajouter une œuvre" onclick={addWork}>+</button>
		</div>
		<div class="list compact">
			{#each appState.appData.works as work (work.id)}
				<button
					type="button"
					class:selected={work.id === selectedWorkId}
					onclick={() => (selectedWorkId = work.id)}
				>
					<strong>{work.title}</strong>
					<span>{work.kind} · {work.society}{work.reference ? ` · ${work.reference}` : ''}</span>
				</button>
			{/each}
			{#if appState.appData.works.length === 0}
				<p class="empty">Aucune œuvre. Ajoutez vos œuvres déposées pour suivre ce que chacune rapporte.</p>
			{/if}
		</div>
	</section>

	<section class="panel">
		{#if selectedWork}
			<div class="panel-heading">
				<h3>{selectedWork.title}</h3>
				{#if selectedWorkTotals}
					<span class="work-total"
						>{formatCurrency(selectedWorkTotals.gross)} brut depuis le début</span
					>
				{/if}
			</div>
			<div class="form-grid tight">
				<label class="wide">
					<span>Titre</span>
					<input bind:value={selectedWork.title} />
				</label>
				<label>
					<span>Type</span>
					<select bind:value={selectedWork.kind}>
						{#each workKinds as kind}
							<option value={kind}>{kind}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>Société de gestion</span>
					<select bind:value={selectedWork.society}>
						{#each royaltySources as source}
							<option value={source}>{source === 'Droits directs' ? 'Aucune (droits directs)' : source}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>Référence / code œuvre</span>
					<input bind:value={selectedWork.reference} placeholder="ISWC, n° de dépôt…" />
				</label>
				<label>
					<span>Date de dépôt</span>
					<DateInput bind:value={selectedWork.depositDate} />
				</label>
				<label>
					<span>Co-auteurs</span>
					<input bind:value={selectedWork.coAuthors} />
				</label>
				<label>
					<span>Ma part (%)</span>
					<input type="number" min="0" max="100" step="0.01" bind:value={selectedWork.sharePercent} />
				</label>
				<label class="wide">
					<span>Notes</span>
					<textarea rows="2" bind:value={selectedWork.notes}></textarea>
				</label>
				<div class="button-row wide">
					<button type="button" onclick={addPayment}>+ Versement pour cette œuvre</button>
					<button class="danger" type="button" onclick={() => removeWork(selectedWork!)}>Supprimer</button>
				</div>
			</div>
		{:else}
			<p class="empty">Sélectionnez une œuvre pour voir sa fiche.</p>
		{/if}
	</section>
</section>
