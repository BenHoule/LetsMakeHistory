<script lang="ts">
  import { socket } from '$lib/socket.js';

  let { sessionId }: { sessionId: string } = $props();

  let financial = $state('');
  let social    = $state('');
  let foreign   = $state('');
  let saved     = $state(false);

  function save() {
    socket.emit('gm_set_national_status', { sessionId, financial, social, foreign });
    saved = true;
    setTimeout(() => (saved = false), 1500);
  }
</script>

<div class="border rounded p-4 space-y-3">
  <h2 class="font-semibold">National Status</h2>
  <p class="text-xs text-gray-500">Set before advancing to Voting. Broadcast to all players and used in player-action prompts.</p>
  {#each [['Financial', 'financial'] as const, ['Social', 'social'] as const, ['Foreign', 'foreign'] as const] as [label, key] (key)}
    <div class="space-y-1">
      <label class="text-xs font-medium text-gray-600" for={`national-status-${key}`}>{label}</label>
      {#if key === 'financial'}
        <input id="national-status-financial" class="border rounded w-full px-2 py-1 text-sm" bind:value={financial} placeholder="e.g. Industrial expansion outpaces wages" />
      {:else if key === 'social'}
        <input id="national-status-social" class="border rounded w-full px-2 py-1 text-sm" bind:value={social} placeholder="e.g. Urban labour tensions rising" />
      {:else}
        <input id="national-status-foreign" class="border rounded w-full px-2 py-1 text-sm" bind:value={foreign} placeholder="e.g. Naval competition with Europe" />
      {/if}
    </div>
  {/each}
  <button
    onclick={save}
    class="w-full bg-teal-700 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-800">
    {saved ? 'Saved ✓' : 'Set & Broadcast'}
  </button>
</div>
