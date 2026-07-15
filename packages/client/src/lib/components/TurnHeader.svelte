<script lang="ts">
  import { sessionStore, phase } from '../../stores/session.js';
  const PHASE_LABELS: Record<string, string> = {
    LOBBY: 'Lobby', GENERATING: 'Generating...', VOTING: 'Voting',
    PLAYER_ACTIONS: 'Player Actions', FINALIZING: 'Finalizing...',
    TURN_COMPLETE: 'Complete', ELECTION: 'Election',
  };
  const PHASE_COLOR: Record<string, string> = {
    LOBBY: 'bg-gray-200', GENERATING: 'bg-yellow-200', VOTING: 'bg-blue-200',
    PLAYER_ACTIONS: 'bg-green-200', FINALIZING: 'bg-orange-200',
    TURN_COMPLETE: 'bg-gray-100', ELECTION: 'bg-purple-200',
  };
</script>

<div class="flex items-center gap-3 border-b pb-2">
  <span class="font-bold text-lg">
    Turn {($sessionStore.session?.turnIndex ?? 0) + 1}
    · {$sessionStore.session?.year ?? 1901}
  </span>
  <span class="text-sm px-2 py-0.5 rounded {PHASE_COLOR[$phase] ?? ''}">
    {PHASE_LABELS[$phase] ?? $phase}
  </span>
</div>
