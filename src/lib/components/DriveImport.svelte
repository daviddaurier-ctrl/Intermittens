<script lang="ts">
	import type { IntermittensState } from '$lib/app/state.svelte';

	let { state: appState }: { state: IntermittensState } = $props();
</script>

<div class="drive-import">
	<label>
		<span>Dossier Google Drive</span>
		<input bind:value={appState.appData.settings.driveImportFolder} placeholder="salaire" />
	</label>
	<button
		type="button"
		class="primary"
		disabled={appState.driveImportState.running}
		onclick={() => appState.importFromDrive(appState.appData.settings.driveImportFolder)}
	>
		{appState.driveImportState.running ? 'Import en cours…' : 'Importer depuis Drive'}
	</button>
	{#if appState.driveImportState.message}
		<p class="drive-import-status">{appState.driveImportState.message}</p>
	{/if}
</div>
