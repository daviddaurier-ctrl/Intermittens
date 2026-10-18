<script lang="ts">
	import { base } from '$app/paths';
	import type { IntermittensState } from '$lib/app/state.svelte';
	import DateInput from '$lib/components/DateInput.svelte';
	import { formatCurrency, formatDate, formatNumber, formatPreciseCurrency } from '$lib/format';
	import {
		buildYearOverview,
		effectiveNet,
		paymentYear,
		royaltyFamily,
		royaltySources,
		sumRoyalties,
		type RoyaltyFamily,
		royaltyYears,
		workTotals
	} from '$lib/royalties';
	import { salaryFollowUp } from '$lib/contractFollowUp';
	import { societyForFormat, workFormats } from '$lib/workFormat';
	import type {
		AuthorWork,
		DeclarationStatus,
		RoyaltyPayment,
		RoyaltyStatus,
		WorkKind
	} from '$lib/types';

	let { state: appState }: { state: IntermittensState } = $props();

	const statuses: RoyaltyStatus[] = ['Attendu', 'Reçu', 'Déclaré'];
	const workKinds: WorkKind[] = ['Musique', 'Spectacle vivant', 'Audiovisuel', 'Texte', 'Autre'];

	const createId = (prefix: string) =>
		`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

	let years = $derived(royaltyYears(appState.appData));
	let selectedYear = $state(String(new Date().getFullYear()));
	let selectedPaymentId = $state('');
	let selectedWorkId = $state('');
	let family = $state<RoyaltyFamily>('auteur');
	const familyLabels: Record<RoyaltyFamily, { title: string; short: string; hint: string }> = {
		auteur: {
			title: 'Droits d’auteur',
			short: 'versés par les producteurs',
			hint: 'Payés par le producteur au titre du contrat de cession (minimum garanti, échéances).'
		},
		diffusion: {
			title: 'Droits de diffusion',
			short: 'SACD, SACEM, SCAM',
			hint: 'Répartis par les sociétés d’auteurs quand tes œuvres sont diffusées ou jouées.'
		}
	};
	const workFamily = (work: AuthorWork) => royaltyFamily(work.society);
	const familyKeys: RoyaltyFamily[] = ['auteur', 'diffusion'];

	let overview = $derived(buildYearOverview(appState.appData, selectedYear));
	let yearPayments = $derived(
		appState.appData.royalties
			.filter((payment) => royaltyFamily(payment.source) === family)
			.filter((payment) => paymentYear(payment) === selectedYear || !payment.paymentDate)
			.sort((a, b) => (b.paymentDate || '9999').localeCompare(a.paymentDate || '9999'))
	);
	let selectedPayment = $derived(
		appState.appData.royalties.find((payment) => payment.id === selectedPaymentId)
	);
	let familyTotals = $derived(
		sumRoyalties(
			appState.appData.royalties.filter(
				(payment) => royaltyFamily(payment.source) === family && paymentYear(payment) === selectedYear
			)
		)
	);
	let familyWorks = $derived(appState.appData.works.filter((work) => workFamily(work) === family));
	let selectedWork = $derived(appState.appData.works.find((work) => work.id === selectedWorkId));
	let selectedWorkTotals = $derived(
		selectedWork ? workTotals(appState.appData, selectedWork.id) : undefined
	);

	/** Promised (cession contract) vs paid (statements received), gross. */
	function workBalance(work: AuthorWork) {
		// Statements paid for this work, plus its lines in multi-work statements (SACD…).
		const fromLines = appState.appData.royalties
			.filter((payment) => payment.status !== 'Attendu' && payment.workId !== work.id)
			.flatMap((payment) => payment.lines ?? [])
			.filter((line) => line.workId === work.id)
			.reduce((total, line) => total + line.amount, 0);
		const paid = Math.round((workTotals(appState.appData, work.id).gross + fromLines) * 100) / 100;
		const promised = work.promisedAmount || 0;
		const state = !promised ? 'unknown' : paid + 0.5 >= promised ? 'ok' : paid > 0 ? 'partial' : 'missing';
		return { paid, promised, gap: Math.round((promised - paid) * 100) / 100, state };
	}
	const balanceLabel: Record<string, string> = {
		ok: 'Tout est payé',
		partial: 'Payé en partie',
		missing: 'Rien reçu',
		unknown: 'Montant promis inconnu'
	};

	const modeLabels: Record<string, string> = {
		DIFF: 'Diffusion TV',
		COPIE_PR: 'Copie privée',
		TVR: 'Replay',
		VAD: 'VOD',
		SVOD: 'VOD abonnement'
	};
	const flagLabels: Record<string, string> = {
		BA: 'bande-annonce',
		EXT: 'extrait',
		CPLT: 'complément',
		SOLDE: 'solde'
	};
	function workBroadcasts(workId: string) {
		return appState.appData.royalties
			.flatMap((payment) =>
				(payment.lines ?? [])
					.filter((line) => line.workId === workId)
					.map((line) => ({ ...line, paymentDate: payment.paymentDate, source: payment.source }))
			)
			.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
	}

	const declarationStatuses: DeclarationStatus[] = ['À déclarer', 'Déclarée', 'Confirmée'];
	const declarationSocieties = ['SACEM', 'SACD', 'SCAM'] as const;
	function declarationState(work: AuthorWork) {
		const list = work.declarations ?? [];
		if (!list.length) return work.format === 'Autre' ? 'other' : 'none';
		if (list.some((item) => item.status === 'À déclarer')) return 'todo';
		if (list.every((item) => item.status === 'Confirmée')) return 'confirmed';
		return 'sent';
	}
	const declarationLabel: Record<string, string> = {
		none: 'Aucune déclaration notée',
		other: 'Autre : pas de déclaration',
		todo: 'À déclarer',
		sent: 'Déclarée, en attente',
		confirmed: 'Déclarée et confirmée'
	};
	/** Changing the type of film moves the declarations not sent yet to the right society. */
	function setFormat(work: AuthorWork, format: AuthorWork['format']) {
		work.format = format;
		const society = societyForFormat(format);
		if (society) {
			const pending = (work.declarations ?? []).filter((item) => item.status === 'À déclarer');
			if (pending.length) for (const item of pending) item.society = society;
			else if (!(work.declarations ?? []).some((item) => item.society === society)) {
				work.declarations = [
					...(work.declarations ?? []),
					{ society, status: 'À déclarer', date: '', reference: '', notes: '' }
				];
			}
		}
		appState.touch();
	}

	function addDeclaration(work: AuthorWork) {
		work.declarations = [
			...(work.declarations ?? []),
			{ society: 'SCAM', status: 'À déclarer', date: '', reference: '', notes: '' }
		];
		appState.touch();
	}
	function removeDeclaration(work: AuthorWork, index: number) {
		work.declarations = work.declarations.filter((_, position) => position !== index);
		appState.touch();
	}
	let declarationsTodo = $derived(
		appState.appData.works.filter((work) => ['todo', 'none'].includes(declarationState(work)))
	);

	function workTitle(workId: string) {
		return appState.appData.works.find((work) => work.id === workId)?.title ?? '';
	}

	function addPayment() {
		const today = new Date().toISOString().slice(0, 10);
		const payment: RoyaltyPayment = {
			id: createId('royalty'),
			source: family === 'auteur' ? 'Droits directs' : 'SACD',
			payerName: '',
			workId: selectedWorkId,
			label: '',
			paymentDate: selectedYear === today.slice(0, 4) ? today : `${selectedYear}-01-01`,
			grossAmount: 0,
			withheldContributions: 0,
			netAmount: 0,
			contributionsWithheld: true,
			status: 'Reçu',
			notes: '',
			fileName: '',
			storedName: '',
			taxableAmount: 0,
			lines: []
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
			kind: 'Audiovisuel',
			society: family === 'auteur' ? 'Droits directs' : 'SACD',
			reference: '',
			coAuthors: '',
			sharePercent: 100,
			depositDate: '',
			notes: '',
			producer: '',
			promisedAmount: 0,
			promisedNotes: '',
			sourceDocumentIds: [],
			projectId: '',
			promisedSalary: 0,
			promisedCachets: 0,
			salaryNotes: '',
			salaryChecked: true,
			declarations: [],
			format: ''
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

<div class="family-switch" role="tablist" aria-label="Type de droits">
	{#each familyKeys as key}
		<button
			type="button"
			role="tab"
			aria-selected={family === key}
			class:active={family === key}
			onclick={() => {
				family = key;
				selectedPaymentId = '';
				selectedWorkId = '';
			}}
		>
			<strong>{familyLabels[key].title}</strong>
			<span>{familyLabels[key].short} · {formatCurrency(overview.byFamily[key].gross)} brut en {selectedYear}</span>
		</button>
	{/each}
</div>
<p class="hint family-hint">{familyLabels[family].hint}</p>

<section class="metrics-grid" aria-label="Droits de l'année">
	<div class="metric">
		<span>{familyLabels[family].title} bruts {selectedYear}</span>
		<strong>{formatCurrency(familyTotals.gross)}</strong>
		<small>{familyTotals.count} versement(s) reçu(s)</small>
	</div>
	<div class="metric">
		<span>Net perçu</span>
		<strong>{formatCurrency(familyTotals.net)}</strong>
		<small>Cotisations précomptées {formatCurrency(familyTotals.withheld)}</small>
	</div>
	<div class="metric">
		<span>À venir</span>
		<strong>{formatCurrency(familyTotals.expected)}</strong>
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
			<h3>{family === 'auteur' ? 'Versements des producteurs' : 'Répartitions des sociétés d’auteurs'}</h3>
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
						{#each royaltySources.filter((source) => royaltyFamily(source) === family || source === selectedPayment?.source) as source}
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
						{#each familyWorks as work}
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
				{#if selectedPayment.storedName}
					<p class="wide royalty-document">
						Document :
						<a href={`${base}/api/royalties/${selectedPayment.id}/document`} target="_blank" rel="noreferrer"
							>{selectedPayment.fileName || 'voir le PDF'} ↗</a
						>
					</p>
				{/if}
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
					<span>Droits d'auteur (producteurs)</span>
					<strong>{formatCurrency(overview.byFamily.auteur.gross)}</strong>
					<small>brut · net {formatCurrency(overview.byFamily.auteur.net)}</small>
				</div>
				<div>
					<span>Droits de diffusion (SACD, SACEM…)</span>
					<strong>{formatCurrency(overview.byFamily.diffusion.gross)}</strong>
					<small>brut · net {formatCurrency(overview.byFamily.diffusion.net)}</small>
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
			<h3>{family === 'auteur' ? 'Œuvres (contrats de cession)' : 'Œuvres diffusées'}</h3>
			<button type="button" title="Ajouter une œuvre" onclick={addWork}>+</button>
		</div>
		{#if declarationsTodo.length}
			<p class="hint declaration-hint">
				{declarationsTodo.length} œuvre{declarationsTodo.length > 1 ? 's' : ''} à déclarer ou sans
				déclaration notée : {declarationsTodo.map((work) => work.title).join(', ')}.
			</p>
		{/if}
		<div class="list compact">
			{#each familyWorks as work (work.id)}
				{@const balance = workBalance(work)}
				<button
					type="button"
					class:selected={work.id === selectedWorkId}
					onclick={() => (selectedWorkId = work.id)}
				>
					<strong class="work-line">
						<span
							class="declaration-badge"
							data-state={declarationState(work)}
							title={`${declarationLabel[declarationState(work)]}${(work.declarations ?? []).length ? ' : ' + work.declarations.map((item) => `${item.society} (${item.status})`).join(', ') : ''}`}
							>{(work.declarations ?? []).map((item) => item.society).join('·') ||
								(work.format === 'Autre' ? 'Autre' : '?')}</span
						>
						{#if family === 'auteur'}
							<span class="balance-dot" data-state={balance.state} title={balanceLabel[balance.state]}></span>
						{/if}
						{work.title}
					</strong>
					<span
						>{work.producer || work.society}{family === 'auteur' && balance.promised
							? ` · reçu ${formatCurrency(balance.paid)} / promis ${formatCurrency(balance.promised)}`
							: ` · reçu ${formatCurrency(balance.paid)}`}</span
					>
				</button>
			{/each}
			{#if familyWorks.length === 0}
				<p class="empty">Aucune œuvre. Ajoutez vos œuvres déposées pour suivre ce que chacune rapporte.</p>
			{/if}
		</div>
	</section>

	<section class="panel">
		{#if selectedWork}
			{@const balance = workBalance(selectedWork)}
			{@const broadcasts = workBroadcasts(selectedWork.id)}
			{@const salary = salaryFollowUp(appState.appData, selectedWork)}
			<div class="panel-heading">
				<h3>{selectedWork.title}</h3>
				{#if selectedWorkTotals}
					<span class="work-total"
						>{formatCurrency(selectedWorkTotals.gross)} brut depuis le début</span
					>
				{/if}
			</div>
			{#if workFamily(selectedWork) === 'auteur'}
			<div class="work-balance" data-state={balance.state}>
				<div><span>Promis au contrat</span><strong>{balance.promised ? formatPreciseCurrency(balance.promised) : '—'}</strong></div>
				<div><span>Reçu (décomptes)</span><strong>{formatPreciseCurrency(balance.paid)}</strong></div>
				<div>
					<span>{balance.gap > 0 ? 'Reste dû' : balance.gap < 0 ? 'Reçu en plus' : 'Écart'}</span>
					<strong>{balance.promised ? formatPreciseCurrency(Math.abs(balance.gap)) : '—'}</strong>
				</div>
			</div>
			{#if selectedWork.promisedNotes}
				<p class="hint">Montant promis lu dans : {selectedWork.promisedNotes}</p>
			{/if}
			{#if salary}
				<h4 class="broadcast-title">Salaire de réalisation (bulletins)</h4>
				<div class="work-balance" data-state={salary.state === 'ok' ? 'ok' : salary.state === 'over' ? 'partial' : 'missing'}>
					<div>
						<span>Prévu au contrat</span>
						<strong>{formatPreciseCurrency(salary.promisedSalary)}</strong>
						{#if salary.promisedCachets}<small>{salary.promisedCachets} cachets</small>{/if}
					</div>
					<div>
						<span>Payé ({salary.contracts} bulletin{salary.contracts > 1 ? 's' : ''})</span>
						<strong>{formatPreciseCurrency(salary.paidSalary)}</strong>
						{#if salary.promisedCachets}<small>{salary.paidCachets} cachets</small>{/if}
					</div>
					<div>
						<span>{salary.state === 'over' ? 'Payé en plus' : salary.state === 'ok' ? 'Écart' : 'Reste à venir'}</span>
						<strong>{formatPreciseCurrency(Math.abs(salary.remainingSalary))}</strong>
						{#if salary.promisedCachets && salary.remainingCachets}<small>{Math.abs(salary.remainingCachets)} cachets</small>{/if}
					</div>
				</div>
			{/if}
			{:else}
				<div class="work-balance" data-state="ok">
					<div><span>Droits perçus</span><strong>{formatPreciseCurrency(balance.paid)}</strong></div>
					<div><span>Lignes de diffusion</span><strong>{broadcasts.length}</strong></div>
					<div>
						<span>Dernière répartition</span>
						<strong>{broadcasts[0] ? formatDate(broadcasts[0].paymentDate) : '—'}</strong>
					</div>
				</div>
			{/if}
			<div class="form-grid tight">
				<label class="wide">
					<span>Titre</span>
					<input bind:value={selectedWork.title} />
				</label>
				<label>
					<span>Producteur</span>
					<input bind:value={selectedWork.producer} />
				</label>
				{#if workFamily(selectedWork) === 'auteur'}
					<label>
						<span>Droits promis au contrat (brut)</span>
						<input type="number" min="0" step="0.01" bind:value={selectedWork.promisedAmount} />
					</label>
				{/if}
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
				<div class="wide declarations">
					<h4 class="broadcast-title">Déclarations aux sociétés d’auteurs</h4>
					<label class="format-select">
						<span>Type de film</span>
						<select
							value={selectedWork.format}
							onchange={(event) => setFormat(selectedWork!, (event.currentTarget as HTMLSelectElement).value as AuthorWork['format'])}
						>
							<option value="">Non précisé</option>
							{#each workFormats as format}
								<option value={format.value}>{format.label}{format.society ? ` → ${format.society}` : ''}</option>
							{/each}
						</select>
					</label>
					{#each selectedWork.declarations ?? [] as declaration, index}
						<div class="declaration-row" data-status={declaration.status}>
							<select bind:value={declaration.society} onchange={() => appState.touch()}>
								{#each declarationSocieties as society}<option value={society}>{society}</option>{/each}
							</select>
							<select bind:value={declaration.status} onchange={() => appState.touch()}>
								{#each declarationStatuses as status}<option value={status}>{status}</option>{/each}
							</select>
							<DateInput bind:value={declaration.date} />
							<input bind:value={declaration.reference} placeholder="N° d’œuvre / référence" oninput={() => appState.touch()} />
							<button type="button" class="danger" title="Retirer" onclick={() => removeDeclaration(selectedWork!, index)}>×</button>
							{#if declaration.notes}<small>{declaration.notes}</small>{/if}
						</div>
					{:else}
						<p class="hint">Aucune déclaration notée pour cette œuvre.</p>
					{/each}
					<button type="button" onclick={() => addDeclaration(selectedWork!)}>+ Déclaration</button>
				</div>
				{#if broadcasts.length}
					<div class="wide">
						<h4 class="broadcast-title">Diffusions ({broadcasts.length})</h4>
						<div class="table-wrap">
							<table class="royalties-table">
								<thead>
									<tr>
										<th>Diffusion</th>
										<th>Chaîne</th>
										<th>Type</th>
										<th class="num">Nb</th>
										<th class="num">Droits</th>
										<th>Versé le</th>
									</tr>
								</thead>
								<tbody>
									{#each broadcasts as line}
										<tr>
											<td>{line.period}</td>
											<td>{line.broadcaster || '—'}{line.country && line.country !== 'FR' ? ` (${line.country})` : ''}</td>
											<td
												>{modeLabels[line.mode] ?? line.mode}{line.flags
													? ` · ${line.flags
															.split(' ')
															.map((flag) => flagLabels[flag] ?? flag)
															.join(', ')}`
													: ''}</td
											>
											<td class="num">{line.count ? formatNumber(line.count, 0) : ''}</td>
											<td class="num">{formatPreciseCurrency(line.amount)}</td>
											<td>{formatDate(line.paymentDate)} · {line.source}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
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

<style>
	.family-switch { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 6px 0 4px; }
	.family-switch button { display: grid; gap: 2px; text-align: left; padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(255, 61, 139, 0.25); background: rgba(255, 255, 255, 0.6); cursor: pointer; }
	.family-switch button.active { background: linear-gradient(135deg, #ff5fa2, #ff3d8b); color: #fff; border-color: transparent; box-shadow: 0 6px 18px rgba(255, 61, 139, 0.25); }
	.family-switch span { font-size: 0.8rem; opacity: 0.85; }
	.family-hint { margin: 0 0 10px; }
	@media (max-width: 640px) { .family-switch { grid-template-columns: 1fr; } }
	.declaration-badge { font-size: 0.68rem; font-weight: 700; padding: 1px 6px; border-radius: 999px; background: #eee3ea; color: #7d5a6d; }
	.declaration-badge[data-state='todo'], .declaration-badge[data-state='none'] { background: rgba(245, 158, 11, 0.2); color: #9a5b00; }
	.declaration-badge[data-state='sent'] { background: rgba(91, 123, 224, 0.18); color: #3550a8; }
	.declaration-badge[data-state='confirmed'] { background: rgba(47, 179, 107, 0.18); color: #1d7a47; }
	.declaration-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
		align-items: center;
		margin-bottom: 8px;
		padding: 8px;
		border-radius: 12px;
		background: rgba(255, 61, 139, 0.06);
		box-sizing: border-box;
		max-width: 100%;
		overflow: hidden;
	}
	.declaration-row > *,
	.declaration-row :global(input),
	.declaration-row select {
		min-width: 0;
		max-width: 100%;
		width: 100%;
		box-sizing: border-box;
	}
	.declaration-row > button { width: auto; justify-self: start; padding-inline: 14px; }
	.declaration-row small { grid-column: 1 / -1; opacity: 0.7; }
	.declaration-hint { margin: 0 0 8px; }
	.format-select { display: grid; gap: 4px; margin-bottom: 8px; }
	.format-select span { font-size: 0.8rem; opacity: 0.75; }
	@media (max-width: 420px) { .declaration-row { grid-template-columns: minmax(0, 1fr); } }
	.broadcast-title { margin: 6px 0 4px; font-size: 0.95rem; }
	.work-line { display: inline-flex; align-items: center; gap: 6px; }
	.balance-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; background: #c9b3c0; }
	.balance-dot[data-state='ok'] { background: #2fb36b; }
	.balance-dot[data-state='partial'] { background: #f59e0b; }
	.balance-dot[data-state='missing'] { background: #e5383b; }
	.work-balance { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
	.work-balance > div { display: grid; gap: 2px; padding: 8px 10px; border-radius: 10px; background: rgba(255, 61, 139, 0.07); }
	.work-balance span { font-size: 0.78rem; opacity: 0.75; }
	.work-balance[data-state='missing'] > div:last-child { background: rgba(229, 56, 59, 0.12); }
	.work-balance[data-state='partial'] > div:last-child { background: rgba(245, 158, 11, 0.14); }
	.work-balance[data-state='ok'] > div:last-child { background: rgba(47, 179, 107, 0.12); }
</style>
