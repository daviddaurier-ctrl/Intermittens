<script lang="ts">
	import { base } from '$app/paths';

	let { data } = $props();
</script>

<svelte:head>
	<title>Liaison Google Drive · InterMittens</title>
</svelte:head>

<main class="access-page">
	<section class="access-card setup-card">
		<p class="access-eyebrow">Configuration</p>
		<h1>Liaison Google Drive</h1>

		{#if !data.oauthConfigured}
			<p class="access-intro">
				Il manque les variables <code>GOOGLE_CLIENT_ID</code> et <code>GOOGLE_CLIENT_SECRET</code>
				dans les réglages Vercel du projet. Ajoutez-les, redéployez, puis revenez ici.
			</p>
			<p class="access-note">
				URI de redirection à déclarer dans Google Cloud :<br /><code>{data.redirectUri}</code>
			</p>
		{:else}
			{#if data.driveLinked}
				<p class="access-intro">
					Google Drive est déjà relié : vos données sont rangées dans le dossier
					<strong>InterMittens</strong> de votre Drive. Vous pouvez refaire la liaison si besoin.
				</p>
			{:else}
				<p class="access-intro">
					Cliquez ci-dessous, choisissez votre compte Google et acceptez l'accès. L'appli range ses
					données dans un dossier « InterMittens » et peut lire vos dossiers existants pour importer
					vos documents.
				</p>
			{/if}
			<form method="POST" class="access-form">
				<button class="primary" type="submit">Relier mon Google Drive</button>
			</form>
		{/if}

		<p class="access-note"><a href={`${base}/`}>← Retour à l'appli</a></p>
	</section>
</main>
