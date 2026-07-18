<script lang="ts">
	import { socket } from '$lib/socket.js';
	import { sessionStore, phase } from '../../stores/session.js';

	let { sessionId }: { sessionId: string } = $props();

	const PHASE_LABELS: Record<string, string> = {
		LOBBY: 'Lobby',
		GENERATING: 'Generating\u2026',
		VOTING: 'Voting',
		PLAYER_ACTIONS: 'Player Actions',
		FINALIZING: 'Finalizing',
		TURN_COMPLETE: 'Complete',
		ELECTION: 'Election'
	};

	function advance() {
		socket.emit('gm_advance_phase', { sessionId });
	}
</script>

<div class="border rounded p-4 space-y-3">
	<div class="flex items-center justify-between">
		<h2 class="font-semibold">Phase Controls</h2>
		<span class="text-sm px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono">
			{PHASE_LABELS[$phase] ?? $phase}
		</span>
	</div>
	<p class="text-xs text-gray-500">
		Turn {($sessionStore.session?.turnIndex ?? 0) + 1} &middot; {$sessionStore.session?.year ??
			1901}
	</p>
	<button
		onclick={advance}
		class="w-full bg-indigo-700 text-white px-4 py-2 rounded hover:bg-indigo-800"
	>
		Advance Phase &rarr;
	</button>
</div>
