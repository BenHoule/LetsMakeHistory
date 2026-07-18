<script lang="ts">
  import { sessionStore } from '../../stores/session.js';
  const headlines = $derived($sessionStore.currentTurn?.headlines ?? []);
</script>

{#if headlines.length}
  <div class="grid grid-cols-2 gap-3">
    {#each headlines as h (`${h.outlet}-${h.headline}`)}
      <div class="border rounded p-3 text-sm">
        <p class='text-xs text-gray-500 mb-1'>
          {h.outlet === 'AP' ? 'Associated Press' : 'The American Standard'}
        </p>
        <p class="font-semibold">{h.headline}</p>
        {#if h.summary}
          <p class="text-gray-600 mt-1">{h.summary}</p>
        {/if}
      </div>
    {/each}
  </div>
{/if}
