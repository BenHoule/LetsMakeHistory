<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import RulesGuideContent from '$lib/components/RulesGuideContent.svelte';
	import { onMount } from 'svelte';
	import { setRuntimeConfig } from '$lib/runtime.js';
	import '../app.css';

	let { children } = $props();
	let guideOpen = $state(false);

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

	<button
		onclick={() => guideOpen = true}
		style="position:fixed;left:16px;bottom:16px;z-index:140;padding:8px 12px;border-radius:999px;background:rgba(35,32,25,0.92);color:#faf7f0;border:none;cursor:pointer;font-size:12px;font-weight:700;letter-spacing:0.02em;box-shadow:0 2px 10px rgba(0,0,0,0.2);">
		Rules Guide
	</button>

{#if guideOpen}
	<div
		role="button"
		tabindex="0"
		aria-label="Close rules guide"
		style="position:fixed;inset:0;z-index:300;background:rgba(17,14,10,0.52);display:flex;align-items:center;justify-content:center;padding:20px;"
		onclick={() => guideOpen = false}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') guideOpen = false; }}>
		<div
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-label="Rules Guide"
			style="width:min(980px,100%);max-height:min(86vh,900px);background:#faf7f0;color:#232019;border:1px solid #d8d0b8;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,0.28);display:flex;flex-direction:column;overflow:hidden;"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}>
			<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #d8d0b8;background:#f1ecdf;">
				<div>
					<h2 style="font-family:Georgia,serif;font-size:22px;margin:0;">Rules Guide</h2>
					<p style="margin:4px 0 0;color:#7a7362;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">Guide v2.1</p>
				</div>
				<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
					<button onclick={() => window.open('/rules-guide.md', '_blank', 'noopener,noreferrer')} style="padding:7px 11px;background:#1f3a5f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Open Raw</button>
					<button onclick={() => guideOpen = false} style="padding:7px 11px;background:#faf7f0;border:1px solid #232019;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Close</button>
				</div>
			</div>
			<div style="overflow:auto;padding:18px 20px 24px;">
				<RulesGuideContent />
			</div>
		</div>
	</div>
{/if}
