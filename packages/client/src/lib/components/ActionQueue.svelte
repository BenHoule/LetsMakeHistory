<script lang="ts">
	import { socket } from '$lib/socket.js';
	import { api } from '$lib/api.js';
	import { pendingActions, updateActionEdit, removeAction } from '../../stores/gm.js';
	import type { ActionType } from '@lmh/types';

	let { sessionId }: { sessionId: string } = $props();

	const ACTION_TYPES: ActionType[] = ['LEGISLATION', 'CAMPAIGN', 'OTHER'];

	// History modal
	let historyOpen = $state(false);
	let historyRecords = $state<Array<Record<string, unknown>>>([]);
	let historyLoading = $state(false);

	async function loadHistory() {
		historyLoading = true;
		const gmToken = localStorage.getItem(`lmh:gm:${sessionId}`) ?? '';
		try {
			historyRecords = await api.gmGet<Array<Record<string, unknown>>>(
				`/api/v1/gm/sessions/${sessionId}/actions`,
				gmToken
			);
		} catch {
			historyRecords = [];
		} finally {
			historyLoading = false;
		}
	}

	function openHistory() {
		historyOpen = true;
		loadHistory();
	}

	function accept(actionId: string, type: ActionType, content: string) {
		socket.emit('gm_accept_action', { sessionId, actionId, type, content });
		removeAction(actionId);
	}

	function dismiss(actionId: string) {
		socket.emit('gm_dismiss_action', { sessionId, actionId });
		removeAction(actionId);
	}

	let copiedId = $state<string | null>(null);
	function copy(actionId: string, prompt: string) {
		navigator.clipboard.writeText(prompt);
		copiedId = actionId;
		setTimeout(() => (copiedId = null), 1500);
	}
</script>

<div class="border rounded p-4 space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="font-semibold">Player Action Queue</h2>
		<div class="flex items-center gap-2">
			<span class="text-xs text-gray-400">{$pendingActions.length} pending</span>
			<button onclick={openHistory} class="text-xs text-blue-600 hover:underline">
				View History
			</button>
		</div>
	</div>

	{#if $pendingActions.length === 0}
		<p class="text-sm text-gray-400 italic">No player actions pending review.</p>
	{:else}
		{#each $pendingActions as action (action.actionId)}
			<div class="border rounded p-3 space-y-2 bg-gray-50">
				<!-- Header: player info + turn + type badge -->
				<div class="flex items-center gap-2 text-sm">
					<span class="font-medium">{action.playerName}</span>
					<span class="text-gray-400">&bull;</span>
					<span class="text-gray-600">{action.party}</span>
					<span class="text-gray-400">&bull;</span>
					<span class="text-gray-600">{action.region}</span>
					<span class="ml-auto flex items-center gap-1.5">
						<span class="text-xs text-gray-400"
							>Turn {action.turnIndex + 1} &middot; {action.year}</span
						>
					</span>
				</div>

				<!-- Editable type -->
				<div class="flex items-center gap-2">
					<label class="text-xs text-gray-500 w-10" for={`action-type-${action.actionId}`}
						>Type</label
					>
					<select
						id={`action-type-${action.actionId}`}
						class="border rounded text-xs px-1 py-0.5"
						value={action.editedType}
						onchange={(e) =>
							updateActionEdit(
								action.actionId,
								'editedType',
								(e.target as HTMLSelectElement).value
							)}
					>
						{#each ACTION_TYPES as t (t)}<option value={t}>{t}</option>{/each}
					</select>
				</div>

				<!-- Editable content -->
				<div class="space-y-0.5">
					<label class="text-xs text-gray-500" for={`action-content-${action.actionId}`}
						>Description</label
					>
					<textarea
						id={`action-content-${action.actionId}`}
						rows="2"
						class="border rounded w-full px-2 py-1 text-sm resize-y"
						value={action.editedContent}
						oninput={(e) =>
							updateActionEdit(
								action.actionId,
								'editedContent',
								(e.target as HTMLTextAreaElement).value
							)}></textarea>
				</div>

				<!-- Claude prompt (collapsible) -->
				<details class="text-xs">
					<summary class="cursor-pointer text-gray-500 hover:text-gray-700"
						>Claude narrative prompt</summary
					>
					<pre
						class="mt-2 p-2 bg-white border rounded whitespace-pre-wrap font-mono text-xs leading-relaxed">{action.prompt}</pre>
				</details>

				<!-- Actions row -->
				<div class="flex gap-2">
					<button
						onclick={() => accept(action.actionId, action.editedType, action.editedContent)}
						class="flex-1 text-xs px-3 py-1.5 rounded bg-green-700 text-white hover:bg-green-800"
					>
						{action.editedType === 'LEGISLATION' ? 'Accept & Create Bill' : 'Accept & Roll Stat'}
					</button>
					<button
						onclick={() => copy(action.actionId, action.prompt)}
						class="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100"
					>
						{copiedId === action.actionId ? 'Copied!' : 'Copy Prompt'}
					</button>
					<button
						onclick={() => dismiss(action.actionId)}
						class="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
					>
						Dismiss
					</button>
				</div>
			</div>
		{/each}
	{/if}
</div>

<!-- ── History modal ──────────────────────────────────────────────────────── -->
{#if historyOpen}
	<div class="fixed inset-0 flex items-center justify-center z-50">
		<button
			type="button"
			class="absolute inset-0 bg-black/40"
			aria-label="Close action history"
			onclick={() => (historyOpen = false)}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Accepted actions history"
			class="relative z-10 bg-white rounded-lg p-6 w-full max-w-lg mx-4 space-y-3 shadow-xl max-h-[80vh] flex flex-col"
		>
			<h3 class="font-semibold">Accepted Actions</h3>
			<div class="overflow-y-auto flex-1 space-y-2">
				{#if historyLoading}
					<p class="text-sm text-gray-400">Loading&hellip;</p>
				{:else if historyRecords.length === 0}
					<p class="text-sm text-gray-400 italic">No accepted actions yet.</p>
				{:else}
					{#each historyRecords as r (`${r.actionId ?? ''}-${r.turnIndex ?? ''}-${r.year ?? ''}-${r.playerName ?? ''}`)}
						<div class="border rounded p-2 text-xs space-y-0.5">
							<div class="flex gap-2 font-medium">
								<span>{String(r.playerName)}</span>
								<span class="text-gray-400">&bull;</span>
								<span>{String(r.type)}</span>
								<span class="ml-auto text-gray-400"
									>T{Number(r.turnIndex ?? 0) + 1} &middot; {r.year}</span
								>
							</div>
							<p class="text-gray-700">{String(r.content)}</p>
						</div>
					{/each}
				{/if}
			</div>
			<button
				onclick={() => (historyOpen = false)}
				class="w-full border rounded px-3 py-1.5 text-sm hover:bg-gray-50"
			>
				Close
			</button>
		</div>
	</div>
{/if}
