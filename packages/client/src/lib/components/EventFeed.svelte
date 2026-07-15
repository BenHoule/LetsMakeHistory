<script lang="ts">
  import { sessionStore } from '../../stores/session.js';
  const events = $derived($sessionStore.currentTurn?.events ?? []);
</script>

<div class="space-y-2">
  {#each events as e}
    <div class="border-l-4 pl-3 py-1 text-sm
    {e.sourceType === 'COURT' ? 'border-purple-400' : 'border-blue-400'}">
      <span class="text-xs font-medium text-gray-500 mr-2">
        {e.sourceType === 'COURT' ? 'Supreme Court' : `Event ${e.sequence}`}
      </span>
      {e.content}
    </div>
  {/each}
</div>
