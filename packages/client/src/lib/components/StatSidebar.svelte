<script lang="ts">
  import { players } from '../../stores/session.js';
</script>

<div class="space-y-3">
  <h3 class="font-semibold text-sm">Senators</h3>
  {#each $players as p}
  <div class="border rounded p-2 text-xs space-y-1">
    <p class="font-medium">{p.name}</p>
    <p class="text-gray-500">{p.party} · {p.region}</p>
    <div class="grid grid-cols-3 gap-1 pt-1">
      <div>
        <p class="text-gray-400">Appr.</p>
        <p>{p.approval.toFixed(1)}</p>
      </div>
      <div>
        <p class="text-gray-400">Recog.</p>
        <p>{p.recognition.toFixed(0)}</p>
      </div>
      <div>
        <p class="text-gray-400">Rizz</p>
        <p>{p.rizz.toFixed(0)}</p>
      </div>
    </div>
  </div>
  {/each}
</div>
