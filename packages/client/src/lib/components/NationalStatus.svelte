<script lang="ts">
	import { sessionStore } from '../../stores/session.js';
	const ns = $derived($sessionStore.currentTurn?.nationalStatus);
</script>

{#if ns}
	<div class="flex gap-3 text-sm">
		{#each [['Financial', ns.financial], ['Social', ns.social], ['Foreign', ns.foreign]] as [label, value] (label)}
			<div class="flex-1 border rounded p-2">
				<p class="text-xs text-gray-500">{label}</p>
				<p>{value}</p>
			</div>
		{/each}
	</div>
{/if}
