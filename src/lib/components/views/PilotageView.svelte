<script lang="ts">
	import type { IntermittensState } from '$lib/app/state.svelte';
	import Calendar from '$lib/components/Calendar.svelte';
	import DocumentPresence from '$lib/components/DocumentPresence.svelte';
	import { formatCurrency, formatDate, formatNumber } from '$lib/format';
	import DriveImport from '$lib/components/DriveImport.svelte';
	import ImportFeedback from '$lib/components/ImportFeedback.svelte';
	import { buildHoursOutlook, buildMonthlyContractBreakdown, contractRecognizedHours, monthLabel } from '$lib/stats';
	import { remainingContractWork } from '$lib/contractFollowUp';
	import { contractNet, netIsEstimated } from '$lib/netEstimate';
	import type { Contract } from '$lib/types';

	let { state: appState }: { state: IntermittensState } = $props();

	let outlook = $derived(buildHoursOutlook(appState.appData));
	let remainingWork = $derived(remainingContractWork(appState.appData));
	let remainingWorkHours = $derived(remainingWork.reduce((total, item) => total + item.hours, 0));
	const outlookText: Record<string, string> = {
		reached: 'Objectif atteint avec les contrats connus',
		'on-track': 'Au rythme actuel, tu y arrives largement',
		tight: 'Au rythme actuel, ça passe juste',
		late: 'Au rythme actuel, il manquera des heures',
		unknown: 'Renseigne ta période ARE (onglet Intermittence)'
	};

	const declarationDayFormatter = new Intl.DateTimeFormat('fr-FR', {
		weekday: 'long',
		day: 'numeric'
	});

	/**
	 * Month to declare: before the 15th, the previous month (monthly update for France Travail);
	 * from the 15th on, the current month.
	 */
	function computeDeclarationMonth(today = new Date()) {
		const date = new Date(today.getFullYear(), today.getMonth() - (today.getDate() >= 15 ? 0 : 1), 1);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	}

	const defaultDeclarationMonth = computeDeclarationMonth();
	let declarationMonth = $state(defaultDeclarationMonth);

	function shiftDeclarationMonth(delta: number) {
		const [year, month] = declarationMonth.split('-').map(Number);
		const date = new Date(year, month - 1 + delta, 1);
		declarationMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	}

	const monthNameFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

	function monthName(month: string) {
		const [year, monthNumber] = month.split('-').map(Number);
		return monthNameFormatter.format(new Date(year, monthNumber - 1, 1));
	}

	function monthPreposition(month: string) {
		return /^(?:avril|août|octobre)/.test(monthName(month)) ? "d'" : 'de ';
	}

	let declarationContracts = $derived.by(() =>
		buildMonthlyContractBreakdown(appState.appData, declarationMonth)
			.map((detail) => {
				const period = declarationPeriod(detail.contract, declarationMonth);
				const hasCachets = detail.cachets > 0;

				return {
					...detail,
					declaredHours: hasCachets ? 0 : detail.hours,
					declaredCachets: detail.cachets,
					periodStart: period.start,
					periodEnd: period.end
				};
			})
			.filter(
				(detail) => detail.declaredHours > 0 || detail.declaredCachets > 0 || detail.grossSalary > 0
			)
	);

	function parseDate(value: string) {
		const date = new Date(`${value}T00:00:00`);
		return Number.isNaN(date.getTime()) ? undefined : date;
	}

	function isoDate(date: Date) {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
			date.getDate()
		).padStart(2, '0')}`;
	}

	function monthBounds(month: string) {
		const [year, monthNumber] = month.split('-').map(Number);
		if (!year || !monthNumber) return undefined;

		return {
			start: new Date(year, monthNumber - 1, 1),
			end: new Date(year, monthNumber, 0)
		};
	}

	function declarationPeriod(contract: Contract, month: string) {
		const contractStart = parseDate(contract.startDate);
		const contractEnd = parseDate(contract.endDate) ?? contractStart;
		const bounds = monthBounds(month);

		if (!contractStart || !contractEnd || !bounds) {
			return {
				start: contract.startDate,
				end: contract.endDate || contract.startDate
			};
		}

		const normalizedEnd = contractEnd < contractStart ? contractStart : contractEnd;
		const start = contractStart < bounds.start ? bounds.start : contractStart;
		const end = normalizedEnd > bounds.end ? bounds.end : normalizedEnd;

		return {
			start: isoDate(start),
			end: isoDate(end)
		};
	}

	function formatDeclarationDay(value: string) {
		const date = parseDate(value);
		return date ? declarationDayFormatter.format(date) : '-';
	}

	function quantityDigits(value: number) {
		return Math.abs(value - Math.round(value)) > 0.01 ? 1 : 0;
	}

	function selectCalendarMonth(month: string) {
		appState.selectMonth(month);
	}

	function openContract(contract: Contract) {
		appState.selectedContractId = contract.id;
		appState.activeTab = 'contrats';
	}
</script>

<section class="view-grid two-columns">
	<section class="panel declaration-panel declaration-first">
		<div class="panel-heading">
			<h3>À déclarer pour le mois {monthPreposition(declarationMonth)}{monthName(declarationMonth)}</h3>
			<div class="button-row declaration-nav">
				<button type="button" title="Mois précédent" onclick={() => shiftDeclarationMonth(-1)}>‹</button>
				{#if declarationMonth !== defaultDeclarationMonth}
					<button type="button" onclick={() => (declarationMonth = defaultDeclarationMonth)}
						>{monthName(defaultDeclarationMonth)}</button
					>
				{/if}
				<button type="button" title="Mois suivant" onclick={() => shiftDeclarationMonth(1)}>›</button>
			</div>
		</div>

		{#if declarationContracts.length}
			<div class="declaration-list">
				<div class="declaration-header">
					<span>Structure</span>
					<span>Période</span>
					<span>Heures</span>
					<span>Cachets</span>
					<span>Salaire brut</span>
				</div>
				{#each declarationContracts as detail}
					<button
						type="button"
						class="declaration-row"
						onclick={() => openContract(detail.contract)}
					>
						<span class="company-list-title">
							<span
								class="company-swatch"
								style={`--company-color: ${appState.companyColor(detail.contract.companyId)}`}
								aria-hidden="true"
							></span>
							<strong>{appState.companyName(detail.contract.companyId)}</strong>
						</span>
						<span>
							{formatDeclarationDay(detail.periodStart)} /
							{formatDeclarationDay(detail.periodEnd)}
						</span>
						<span class="declaration-number">
							{detail.declaredHours > 0
								? `${formatNumber(detail.declaredHours, quantityDigits(detail.declaredHours))} h`
								: '-'}
						</span>
						<span class="declaration-number">
							{detail.declaredCachets > 0
								? formatNumber(detail.declaredCachets, quantityDigits(detail.declaredCachets))
								: '-'}
						</span>
						<strong class="declaration-number">{formatCurrency(detail.grossSalary)}</strong>
					</button>
				{/each}
			</div>
		{:else}
			<p class="empty">Aucun contrat à déclarer sur {monthLabel(declarationMonth)}.</p>
		{/if}
	</section>
	<section class="panel hours-outlook" data-status={outlook.status}>
		<div class="panel-heading">
			<h3>Objectif {outlook.target} h</h3>
			{#if outlook.anniversary}<span class="outlook-date">date anniversaire {formatDate(outlook.anniversary)}</span>{/if}
		</div>
		<div class="outlook-bar" aria-hidden="true">
			<span class="worked" style={`width: ${Math.min(100, (outlook.workedHours / outlook.target) * 100)}%`}></span>
			<span class="planned" style={`width: ${Math.min(100 - Math.min(100, (outlook.workedHours / outlook.target) * 100), (outlook.plannedHours / outlook.target) * 100)}%`}></span>
		</div>
		<p class="outlook-status"><span class="outlook-dot"></span>{outlookText[outlook.status]}</p>
		<div class="outlook-grid">
			<div><span>Faites</span><strong>{formatNumber(outlook.workedHours, 0)} h</strong></div>
			<div><span>Prévues</span><strong>{formatNumber(outlook.plannedHours, 0)} h</strong></div>
			<div><span>Reste à trouver</span><strong>{formatNumber(outlook.remainingHours, 0)} h</strong><small>≈ {formatNumber(Math.ceil(outlook.remainingHours / 12), 0)} cachets</small></div>
			<div><span>Temps restant</span><strong>{formatNumber(outlook.monthsLeft, 1)} mois</strong><small>{outlook.daysLeft} jours</small></div>
			<div><span>Rythme nécessaire</span><strong>{formatNumber(outlook.neededPerMonth, 0)} h / mois</strong></div>
			<div><span>Ton rythme</span><strong>{formatNumber(outlook.pacePerMonth, 0)} h / mois</strong><small>projection {formatNumber(outlook.projectedHours, 0)} h</small></div>
		</div>
		{#if remainingWork.length}
			<div class="remaining-work">
				<strong>Encore à faire d'après tes contrats</strong>
				<ul>
					{#each remainingWork as item}
						<li>
							Il te reste <strong>{item.cachets} cachet{item.cachets > 1 ? 's' : ''}</strong>
							(≈ {item.hours} h) à faire avec {item.producer || 'le producteur'} pour
							<em>{item.title}</em>
						</li>
					{/each}
				</ul>
				<small
					>Soit ≈ {remainingWorkHours} h de plus, à compter si elles tombent avant le
					{formatDate(outlook.anniversary)}{outlook.workedHours + outlook.plannedHours + remainingWorkHours >= outlook.target
						? ` : avec elles, tu atteins ${outlook.target} h.`
						: '.'}</small
				>
			</div>
		{/if}
	</section>
	<section class="panel">
		<div class="panel-heading">
			<h3>Contrats récents</h3>
			<div class="button-row">
				<label class="file-button" title="Importer et ranger automatiquement des documents">
					Importer
					<input
						type="file"
						multiple
						accept=".pdf,.txt,.csv,.md,.xlsx,.xls,.ods,application/pdf,text/*"
						onchange={(event) => {
							event.stopPropagation();
							appState.createContractFromDocument(event);
						}}
					/>
				</label>
				<button type="button" title="Ajouter un contrat" onclick={() => appState.addContract()}
					>+</button
				>
			</div>
		</div>
		<DriveImport state={appState} />
		<ImportFeedback state={appState} />
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Contrat</th>
						<th>Projet</th>
						<th>Période</th>
						<th>Heures</th>
						<th>Net</th>
						<th>Statut</th>
						<th>Documents</th>
					</tr>
				</thead>
				<tbody>
					{#each appState.recentContracts as contract}
						<tr class:clickable={true} onclick={() => openContract(contract)}>
							<td>
								<span class="company-list-title">
									<span
										class="company-swatch"
										style={`--company-color: ${appState.companyColor(contract.companyId)}`}
										aria-hidden="true"
									></span>
									{contract.title}
								</span>
							</td>
							<td>{appState.projectName(contract.projectId)}</td>
							<td>{formatDate(contract.startDate)} - {formatDate(contract.endDate)}</td>
							<td>{formatNumber(contractRecognizedHours(contract), 0)}</td>
							<td>{netIsEstimated(contract) ? '≈ ' : ''}{formatCurrency(contractNet(contract))}</td>
							<td><span class="status" data-status={contract.status}>{contract.status}</span></td>
							<td><DocumentPresence documents={appState.documentsFor(contract)} {contract} /></td>
						</tr>
					{/each}
					{#if appState.recentContracts.length === 0}
						<tr>
							<td colspan="7" class="empty">Aucun contrat pour le moment.</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</section>

	<section class="panel">
		<div class="panel-heading">
			<h3>Mois sélectionné</h3>
			<select
				value={appState.selectedMonth}
				onchange={(event) => selectCalendarMonth(event.currentTarget.value)}
			>
				{#each appState.timelineMonths as month}
					<option value={month}>{monthLabel(month)}</option>
				{/each}
			</select>
		</div>

		{#if appState.selectedMonthStats}
			<div class="month-focus">
				<div>
					<span>Heures</span>
					<strong>{formatNumber(appState.selectedMonthStats.hours, 0)} h</strong>
				</div>
				<div>
					<span>Salaire net</span>
					<strong>{formatCurrency(appState.selectedMonthStats.netSalary)}</strong>
				</div>
				<div>
					<span>Indemnité estimée</span>
					<strong>{formatCurrency(appState.selectedMonthStats.estimatedIndemnity)}</strong>
				</div>
				<div>
					<span>Réel saisi</span>
					<strong>{formatCurrency(appState.selectedMonthStats.realIndemnity)}</strong>
				</div>
			</div>
		{/if}

		{#if appState.selectedMonthInfo}
			<div class="compact-form">
				<label>
					<span>Indemnisation réelle</span>
					<input
						type="number"
						min="0"
						step="0.01"
						bind:value={appState.selectedMonthInfo.realIndemnity}
					/>
				</label>
				<label>
					<span>Congé spectacle</span>
					<input
						type="number"
						min="0"
						step="0.01"
						bind:value={appState.selectedMonthInfo.congeSpectacle}
					/>
				</label>
				<label>
					<span>AJ réelle / notifiée</span>
					<input
						type="number"
						min="0"
						step="0.01"
						bind:value={appState.selectedMonthInfo.dailyIndemnity}
					/>
				</label>
				<label class="wide">
					<span>Notes</span>
					<textarea rows="3" bind:value={appState.selectedMonthInfo.notes}></textarea>
				</label>
			</div>
		{/if}
	</section>


	<Calendar state={appState} panelClass="dashboard-calendar-panel" />
</section>

<style>
	.hours-outlook .outlook-date { font-size: 0.82rem; opacity: 0.75; }
	.outlook-bar { display: flex; height: 12px; border-radius: 999px; overflow: hidden; background: rgba(255, 61, 139, 0.1); margin: 4px 0 8px; }
	.outlook-bar .worked { background: linear-gradient(90deg, #ff5fa2, #ff3d8b); }
	.outlook-bar .planned { background: repeating-linear-gradient(45deg, rgba(255, 61, 139, 0.45) 0 6px, rgba(255, 61, 139, 0.2) 6px 12px); }
	.outlook-status { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-weight: 600; }
	.outlook-dot { width: 10px; height: 10px; border-radius: 50%; background: #c9b3c0; }
	.hours-outlook[data-status='reached'] .outlook-dot, .hours-outlook[data-status='on-track'] .outlook-dot { background: #2fb36b; }
	.hours-outlook[data-status='tight'] .outlook-dot { background: #f59e0b; }
	.hours-outlook[data-status='late'] .outlook-dot { background: #e5383b; }
	.remaining-work { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(91, 123, 224, 0.1); }
	.remaining-work ul { margin: 6px 0; padding-left: 18px; }
	.remaining-work li { margin: 3px 0; }
	.remaining-work small { opacity: 0.8; }
	.outlook-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
	.outlook-grid > div { display: grid; gap: 2px; padding: 8px 10px; border-radius: 10px; background: rgba(255, 61, 139, 0.07); }
	.outlook-grid span, .outlook-grid small { font-size: 0.78rem; opacity: 0.75; }
	@media (max-width: 640px) { .outlook-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
