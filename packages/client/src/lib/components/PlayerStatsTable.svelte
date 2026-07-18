<script lang="ts">
  import { players } from '../../stores/session.js';
</script>

<div class="border rounded p-4 space-y-3">
  <h2 class="font-semibold">Player Stats</h2>
  {#if $players.length === 0}
    <p class="text-sm text-gray-400 italic">No players have joined yet.</p>
  {:else}
    <table class="w-full text-xs border-collapse">
      <thead>
        <tr class="text-left text-gray-500">
          <th class="pb-1 pr-3">Name</th>
          <th class="pb-1 pr-3">Party</th>
          <th class="pb-1 pr-3">Region</th>
          <th class="pb-1 pr-2 text-right">Appr.</th>
          <th class="pb-1 pr-2 text-right">Recog.</th>
          <th class="pb-1 text-right">Rizz</th>
        </tr>
      </thead>
      <tbody>
        {#each $players as p (p.id ?? p.name)}
          <tr class="border-t">
            <td class="py-1 pr-3 font-medium">{p.name}</td>
            <td class="py-1 pr-3 text-gray-600">{p.party}</td>
            <td class="py-1 pr-3 text-gray-600">{p.region}</td>
            <td class="py-1 pr-2 text-right">{p.approval.toFixed(1)}</td>
            <td class="py-1 pr-2 text-right">{p.recognition.toFixed(0)}</td>
            <td class="py-1 text-right">{p.rizz.toFixed(0)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
