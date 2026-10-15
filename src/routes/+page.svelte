<script lang="ts">
	import { createIntermittensState } from '$lib/app/state.svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import MetricsGrid from '$lib/components/MetricsGrid.svelte';
	import CalendarView from '$lib/components/views/CalendarView.svelte';
	import ContractsView from '$lib/components/views/ContractsView.svelte';
	import IntermittenceView from '$lib/components/views/IntermittenceView.svelte';
	import PilotageView from '$lib/components/views/PilotageView.svelte';
	import RoyaltiesView from '$lib/components/views/RoyaltiesView.svelte';
	import StatsView from '$lib/components/views/StatsView.svelte';
	import StructuresView from '$lib/components/views/StructuresView.svelte';
	import type { AppData } from '$lib/types';

	type PageProps = { data: { appData: AppData } };

	let { data: pageData }: PageProps = $props();

	function getInitialData() {
		return pageData.appData;
	}

	const state = createIntermittensState(getInitialData());
</script>

<svelte:head>
	<title>InterMittens</title>
</svelte:head>

<AppShell {state}>
	{#if state.activeTab !== 'droits'}
		<MetricsGrid {state} />
	{/if}

	{#if state.activeTab === 'pilotage'}
		<PilotageView {state} />
	{:else if state.activeTab === 'calendrier'}
		<CalendarView {state} />
	{:else if state.activeTab === 'contrats'}
		<ContractsView {state} />
	{:else if state.activeTab === 'structures'}
		<StructuresView {state} />
	{:else if state.activeTab === 'stats'}
		<StatsView {state} />
	{:else if state.activeTab === 'intermittence'}
		<IntermittenceView {state} />
	{:else if state.activeTab === 'droits'}
		<RoyaltiesView {state} />
	{/if}
</AppShell>
