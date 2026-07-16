<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { setRuntimeConfig } from '$lib/runtime.js';
	import '../app.css';

	let { children } = $props();

	onMount(async () => {
		try {
			const response = await fetch('/api/v1/runtime-config');
			if (response.ok) {
				setRuntimeConfig(await response.json());
			}
		} catch {
			setRuntimeConfig({ sharePlayerBaseUrl: null, internetInviteSource: 'unknown' });
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
