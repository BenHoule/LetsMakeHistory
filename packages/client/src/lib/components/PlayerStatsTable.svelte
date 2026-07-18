<script lang="ts">
  import type { PlayerState } from '@lmh/types';
  import { players } from '../../stores/session.js';

  const PARTIES = ['Progressive', 'Unionist', 'Whig', 'Conservative'] as const;
  const REGIONS = ['Midwest', 'Mountain', 'Northeast', 'South', 'Southwest', 'West'] as const;
  const CLASSES = [1, 2, 3] as const;

  type EditablePlayerPatch = Partial<Pick<PlayerState, 'party' | 'region' | 'class' | 'approval' | 'recognition' | 'rizz'>>;

  let {
    editable = false,
    savingPlayerId = null,
    onSavePlayer = async (_playerId: string, _patch: EditablePlayerPatch) => {},
  }: {
    editable?: boolean;
    savingPlayerId?: string | null;
    onSavePlayer?: (playerId: string, patch: EditablePlayerPatch) => Promise<void> | void;
  } = $props();

  async function saveNumberField(
    player: PlayerState,
    field: 'approval' | 'recognition' | 'rizz' | 'class',
    rawValue: string,
  ) {
    const nextValue = Number(rawValue);
    if (Number.isNaN(nextValue) || nextValue === player[field]) return;
    await onSavePlayer(player.id, { [field]: nextValue });
  }

  async function saveTextField(player: PlayerState, field: 'party' | 'region', rawValue: string) {
    if (!rawValue || rawValue === player[field]) return;
    await onSavePlayer(player.id, { [field]: rawValue });
  }
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
          <th class="pb-1 pr-3 text-right">Class</th>
          <th class="pb-1 pr-2 text-right">Appr.</th>
          <th class="pb-1 pr-2 text-right">Recog.</th>
          <th class="pb-1 text-right">Rizz</th>
        </tr>
      </thead>
      <tbody>
        {#each $players as p (p.id ?? p.name)}
          <tr class="border-t">
            <td class="py-1 pr-3 font-medium">{p.name}</td>
            <td class="py-1 pr-3 text-gray-600">
              {#if editable}
                <select
                  value={p.party}
                  disabled={savingPlayerId === p.id}
                  onchange={(e) => saveTextField(p, 'party', (e.target as HTMLSelectElement).value)}
                  class="w-full rounded border px-1 py-0.5 disabled:bg-gray-100 disabled:text-gray-400">
                  {#each PARTIES as party (party)}<option value={party}>{party}</option>{/each}
                </select>
              {:else}
                {p.party}
              {/if}
            </td>
            <td class="py-1 pr-3 text-gray-600">
              {#if editable}
                <select
                  value={p.region}
                  disabled={savingPlayerId === p.id}
                  onchange={(e) => saveTextField(p, 'region', (e.target as HTMLSelectElement).value)}
                  class="w-full rounded border px-1 py-0.5 disabled:bg-gray-100 disabled:text-gray-400">
                  {#each REGIONS as region (region)}<option value={region}>{region}</option>{/each}
                </select>
              {:else}
                {p.region}
              {/if}
            </td>
            <td class="py-1 pr-3 text-right">
              {#if editable}
                <select
                  value={String(p.class)}
                  disabled={savingPlayerId === p.id}
                  onchange={(e) => saveNumberField(p, 'class', (e.target as HTMLSelectElement).value)}
                  class="w-14 rounded border px-1 py-0.5 text-right disabled:bg-gray-100 disabled:text-gray-400">
                  {#each CLASSES as cls (cls)}<option value={cls}>{cls}</option>{/each}
                </select>
              {:else}
                {p.class}
              {/if}
            </td>
            <td class="py-1 pr-2 text-right">
              {#if editable}
                <input
                  type="number"
                  min="25"
                  max="70"
                  step="0.5"
                  value={p.approval.toFixed(1)}
                  disabled={savingPlayerId === p.id}
                  onchange={(e) => saveNumberField(p, 'approval', (e.target as HTMLInputElement).value)}
                  class="w-16 rounded border px-1 py-0.5 text-right disabled:bg-gray-100 disabled:text-gray-400" />
              {:else}
                {p.approval.toFixed(1)}
              {/if}
            </td>
            <td class="py-1 pr-2 text-right">
              {#if editable}
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={p.recognition.toFixed(0)}
                  disabled={savingPlayerId === p.id}
                  onchange={(e) => saveNumberField(p, 'recognition', (e.target as HTMLInputElement).value)}
                  class="w-16 rounded border px-1 py-0.5 text-right disabled:bg-gray-100 disabled:text-gray-400" />
              {:else}
                {p.recognition.toFixed(0)}
              {/if}
            </td>
            <td class="py-1 pr-2 text-right">
              {#if editable}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={p.rizz.toFixed(0)}
                  disabled={savingPlayerId === p.id}
                  onchange={(e) => saveNumberField(p, 'rizz', (e.target as HTMLInputElement).value)}
                  class="w-16 rounded border px-1 py-0.5 text-right disabled:bg-gray-100 disabled:text-gray-400" />
              {:else}
                {p.rizz.toFixed(0)}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
