<script lang="ts">
	import { base } from '$app/paths';

	let { data } = $props();
	let copied = $state(false);
	let token = $derived(data.ok ? data.refreshToken : '');

	async function copy(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
		} catch {
			copied = false;
		}
	}
</script>

<svelte:head>
	<title>Liaison Google Drive · InterMittens</title>
</svelte:head>

<main class="access-page">
	<section class="access-card setup-card">
		<p class="access-eyebrow">Configuration</p>
		{#if data.ok}
			<h1>Presque fini !</h1>
			<p class="access-intro">
				Copiez cette clé, puis dans Vercel ouvrez le projet → <em>Settings → Environment Variables</em>,
				ajoutez une variable <code>GOOGLE_REFRESH_TOKEN</code> avec cette valeur, enregistrez et
				redéployez.
			</p>
			<textarea class="token-box" readonly rows="4" value={token}></textarea>
			<div class="access-form">
				<button class="primary" type="button" onclick={() => copy(token)}>
					{copied ? 'Copiée ✓' : 'Copier la clé'}
				</button>
			</div>
			<p class="access-note">
				Gardez cette clé secrète : elle donne accès aux fichiers de l'appli dans votre Drive.
			</p>
		{:else}
			<h1>La liaison n'a pas abouti</h1>
			<p class="access-intro">{data.message}</p>
			<p class="access-note"><a href={`${base}/setup-google`}>Réessayer</a></p>
		{/if}
	</section>
</main>
