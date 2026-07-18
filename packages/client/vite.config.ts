import adapterAuto from '@sveltejs/adapter-auto';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
	resolve: {
		tsconfigPaths: true
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Production: static site served by Express.
			// Development: adapter-auto (Vite dev server).
			adapter: isProd ? adapterStatic({ fallback: 'index.html', strict: false }) : adapterAuto()
		})
	]
});
