<script lang="ts">
	import { socket } from '$lib/socket.js';
	import { visibilitySettings } from '../../stores/gm.js';
	import type { VisibilitySettings } from '@lmh/types';

	let { sessionId }: { sessionId: string } = $props();

	function toggle(field: keyof VisibilitySettings) {
		const current = $visibilitySettings;
		const updated = { ...current, [field]: !current[field] };
		socket.emit('gm_set_visibility', { sessionId, settings: updated });
	}
</script>

<div class="border rounded p-4 space-y-3">
	<h2 class="font-semibold">Player Visibility</h2>
	<p class="text-xs text-gray-500">Control what roll results players can see.</p>
	{#each [['ownRolls', 'Players see their own stat rolls'], ['allRolls', "Players see ALL players' stat rolls"], ['npcVoteRolls', 'Players see NPC vote roll results']] as [field, label] (field)}
		<label class="flex items-center gap-2 text-sm cursor-pointer">
			<input
				type="checkbox"
				checked={$visibilitySettings[field as keyof VisibilitySettings]}
				onchange={() => toggle(field as keyof VisibilitySettings)}
				class="rounded"
			/>
			{label}
		</label>
	{/each}
</div>
