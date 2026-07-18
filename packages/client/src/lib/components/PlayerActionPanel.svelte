<script lang="ts">
	import { socket } from '$lib/socket.js';
	import type { ActionType } from '@lmh/types';

	let type = $state<ActionType>('LEGISLATION');
	let content = $state('');
	let billTitle = $state('');
	let isAmendment = $state(false);

	function submitAction() {
		if (!content.trim()) return;
		if (type === 'LEGISLATION' && !billTitle.trim()) return;
		socket.emit('submit_action', {
			type,
			content: type === 'LEGISLATION' ? `${billTitle}: ${content}` : content
		});
		content = '';
		billTitle = '';
		isAmendment = false;
	}
</script>

<div class="border rounded p-4 space-y-3">
	<h3 class="font-semibold">Your Action</h3>
	<div class="flex gap-4 text-sm">
		<label class="flex items-center gap-1 cursor-pointer">
			<input type="radio" bind:group={type} value="LEGISLATION" /> Legislation
		</label>
		<label class="flex items-center gap-1 cursor-pointer">
			<input type="radio" bind:group={type} value="CAMPAIGN" /> Campaign
		</label>
		<label class="flex items-center gap-1 cursor-pointer">
			<input type="radio" bind:group={type} value="OTHER" /> Other
		</label>
	</div>

	{#if type === 'LEGISLATION'}
		<div class="space-y-2">
			<input
				bind:value={billTitle}
				class="border w-full p-2 text-sm rounded"
				placeholder="Bill title (required)"
				required
			/>
			<label class="flex items-center gap-2 text-sm cursor-pointer">
				<input type="checkbox" bind:checked={isAmendment} />
				Constitutional Amendment
			</label>
			<textarea
				bind:value={content}
				class="border w-full p-2 text-sm rounded"
				rows="3"
				placeholder="Describe the bill's contents and intent..."></textarea>
		</div>
	{:else}
		<textarea
			bind:value={content}
			class="border w-full p-2 text-sm rounded"
			rows="3"
			placeholder="Describe your action..."></textarea>
	{/if}

	<button
		onclick={submitAction}
		disabled={!content.trim() || (type === 'LEGISLATION' && !billTitle.trim())}
		class="bg-blue-700 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
	>
		Submit
	</button>
</div>
