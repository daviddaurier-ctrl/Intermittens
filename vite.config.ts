import nodeAdapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const packageMetadata = JSON.parse(
	readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
) as { version: string };
const deployedAt = process.env.APP_DEPLOYED_AT ?? new Date().toISOString();

const basePath =
	process.env.BASE_PATH && process.env.BASE_PATH !== '/'
		? (process.env.BASE_PATH as `/${string}`)
		: '';

// On Vercel (VERCEL=1 during its build) use the Vercel adapter; everywhere else keep Node.
const adapter = process.env.VERCEL
	? (await import('@sveltejs/adapter-vercel')).default({
			runtime: 'nodejs22.x',
			maxDuration: 300
		})
	: nodeAdapter();

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(packageMetadata.version),
		__DEPLOYED_AT__: JSON.stringify(deployedAt)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Set BASE_PATH=/intermittens on the hosted server.
			adapter,
			paths: {
				base: basePath
			}
		})
	]
});
