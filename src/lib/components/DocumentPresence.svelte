<script lang="ts">
	import {
		contractHealth,
		hasRequiredDocument,
		requiredContractDocuments,
		type RequiredContractDocumentKind
	} from '$lib/documentPresence';
	import type { Contract, ContractDocument } from '$lib/types';

	let {
		documents,
		contract
	}: {
		documents: readonly Pick<ContractDocument, 'kind'>[];
		contract?: Pick<Contract, 'startDate' | 'endDate'>;
	} = $props();

	let health = $derived(contract ? contractHealth(contract, documents) : null);
	const healthLabel = { ok: 'Dossier complet', partial: 'Documents manquants', missing: 'Contrat signé manquant' };

	function isPresent(kind: RequiredContractDocumentKind) {
		return hasRequiredDocument(documents, kind);
	}
</script>

<div class="document-presence" aria-label="Présence des documents du contrat">
	{#if health}
		<span
			class="health-dot"
			data-health={health.health}
			role="img"
			aria-label={healthLabel[health.health]}
			title={health.missing.length
				? `${healthLabel[health.health]} : ${health.missing.join(', ')}`
				: healthLabel[health.health]}
		></span>
	{/if}
	{#each requiredContractDocuments as document}
		{@const present = isPresent(document.kind)}
		<span
			class="document-presence-icon"
			class:present
			data-kind={document.kind}
			role="img"
			aria-label={`${document.label} ${present ? 'présent' : 'manquant'}`}
			title={`${document.label} : ${present ? 'présent' : 'manquant'}`}
		>
			{#if document.kind === 'Contrat'}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M6.5 3.5h7l4 4v13h-11z" />
					<path d="M13.5 3.5v4h4M9 12h6M9 16h6" />
				</svg>
			{:else if document.kind === 'AEM'}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M8 5.5h8M9.5 3.5h5v4h-5zM6 5.5h12v15H6z" />
					<path d="m9 14 2 2 4-5" />
				</svg>
			{:else if document.kind === 'Fiche de paie'}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M6.5 3.5h11v17l-2-1.5-2 1.5-2-1.5-2 1.5-3-2z" />
					<path d="M14.5 9.5a3 3 0 1 0 0 5M9 11h5M9 13h5" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M4 11a8 8 0 0 1 16 0M4 11c1.3-1.3 2.7-1.3 4 0 1.3-1.3 2.7-1.3 4 0 1.3-1.3 2.7-1.3 4 0 1.3-1.3 2.7-1.3 4 0M12 11v6.5a3 3 0 0 0 6 0"
					/>
				</svg>
			{/if}
		</span>
	{/each}
</div>

<style>
	.document-presence {
		display: inline-flex;
		flex: 0 0 auto;
		gap: 4px;
		align-items: center;
	}

	.health-dot {
		width: 11px;
		height: 11px;
		margin-right: 3px;
		border-radius: 50%;
		flex: 0 0 auto;
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85);
	}

	.health-dot[data-health='ok'] {
		background: #2fb36b;
	}

	.health-dot[data-health='partial'] {
		background: #f59e0b;
	}

	.health-dot[data-health='missing'] {
		background: #e5383b;
	}

	.document-presence-icon {
		--document-color: #b0789a;

		display: inline-grid;
		width: 23px;
		height: 23px;
		place-items: center;
		border: 1px solid rgba(176, 112, 144, 0.2);
		border-radius: 6px;
		background: rgba(176, 112, 144, 0.08);
		color: #b0789a;
		opacity: 0.62;
	}

	.document-presence-icon[data-kind='Contrat'] {
		--document-color: #ff3d8b;
	}

	.document-presence-icon[data-kind='AEM'] {
		--document-color: #ff8fb8;
	}

	.document-presence-icon[data-kind='Fiche de paie'] {
		--document-color: #5b7be0;
	}

	.document-presence-icon[data-kind='Congé Spectacle'] {
		--document-color: #b04fd0;
	}

	.document-presence-icon.present {
		border-color: color-mix(in srgb, var(--document-color) 48%, transparent);
		background: color-mix(in srgb, var(--document-color) 15%, transparent);
		box-shadow: inset 0 0 8px color-mix(in srgb, var(--document-color) 7%, transparent);
		color: var(--document-color);
		opacity: 1;
	}

	svg {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.7;
	}
</style>
