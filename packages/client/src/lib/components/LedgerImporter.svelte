<script lang="ts">
	import { api } from '$lib/api.js';

	let { sessionId, gmToken }: { sessionId: string; gmToken: string } = $props();

	let block = $state('');
	let status = $state('');
	let submitting = $state(false);

	async function importLedger() {
		if (!block.trim()) {
			status = 'Paste a Turn Ledger block first.';
			return;
		}
		submitting = true;
		status = '';
		try {
			const response = await api.gmPost<{ deltas: Array<unknown> }>(
				`/api/v1/gm/sessions/${sessionId}/ledger/import`,
				gmToken,
				{ ledgerBlock: block }
			);
			status = `Applied ${response.deltas.length} ledger row${response.deltas.length === 1 ? '' : 's'}.`;
			block = '';
		} catch (err) {
			status = err instanceof Error ? err.message : 'Failed to import ledger.';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="border rounded p-4 space-y-3">
	<h2 class="font-semibold">Turn Ledger Import</h2>
	<p class="text-xs text-gray-500">
		Paste Claude's fenced Turn Ledger block here. The server parses it and broadcasts <code
			>ledger_finalized</code
		> to all clients.
	</p>
	<textarea
		bind:value={block}
		rows="6"
		placeholder="TURN LEDGER --- Turn N, YYYY&#10;Approval | Player | +1 | reason"
		class="w-full border rounded p-2 font-mono text-xs resize-y"></textarea>
	{#if status}<p class="text-xs text-teal-700">{status}</p>{/if}
	<button
		onclick={importLedger}
		disabled={submitting}
		class="w-full bg-amber-700 text-white px-3 py-1.5 rounded text-sm hover:bg-amber-800 disabled:opacity-50"
	>
		{submitting ? 'Applying…' : 'Parse & Apply Ledger'}
	</button>
</div>
