<script lang="ts">
	let { form }: { form?: { error?: string } } = $props();
</script>

<svelte:head>
	<title>Intermimi ♥ · Connexion</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="access-page">
	<section class="access-card" aria-labelledby="access-title">
		<div class="access-brand" aria-hidden="true">♥</div>
		<p class="access-eyebrow">Espace privé ♥</p>
		<h1 id="access-title">Bienvenue sur Intermimi</h1>
		<p class="access-intro">
			Saisissez le mot de passe pour accéder à votre espace. Cet appareil sera ensuite reconnu
			pendant 6 mois.
		</p>

		<form method="POST" class="access-form">
			<label for="password">Mot de passe</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
				aria-invalid={form?.error ? 'true' : undefined}
				aria-describedby={form?.error ? 'access-error' : undefined}
			/>

			{#if form?.error}
				<p id="access-error" class="access-error" role="alert">{form.error}</p>
			{/if}

			<button class="primary" type="submit">Entrer dans Intermimi ♥</button>
		</form>

		<p class="access-note">Connexion mémorisée uniquement sur ce navigateur.</p>
	</section>
</main>
