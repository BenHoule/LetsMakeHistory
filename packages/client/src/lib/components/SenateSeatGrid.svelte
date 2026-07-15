<script lang="ts">
  import { sessionStore } from '../../stores/session.js';
  const REGIONS = ['Midwest', 'Mountain', 'Northeast', 'South', 'Southwest', 'West'];
  const CLASSES = [1, 2, 3] as const;
</script>

<div class="overflow-x-auto">
  <table class="text-xs w-full border-collapse">
    <thead>
      <tr>
        <th class="border px-2 py-1 text-left">Region</th>
        {#each CLASSES as c}
          <th class="border px-2 py-1">Class {c}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each REGIONS as region}
        <tr>
          <td class="border px-2 py-1">{region}</td>
          {#each CLASSES as c}
            {@const seat = $sessionStore.players.find(
              p => p.region === region && p.class === c
            )}
            <td class="border px-2 py-1 text-center">
              {#if seat}
                <span class="font-medium">{seat.name}</span>
                <br/>
                <span class="text-gray-500">{seat.party}</span>
              {:else}
                <span class="text-gray-300">NPC</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
