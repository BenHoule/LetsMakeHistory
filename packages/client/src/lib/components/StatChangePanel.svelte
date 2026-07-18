<script lang="ts">
  import { api } from '$lib/api.js';
  import { players } from '../../stores/session.js';
  import { DELTA_TABLE, BOUNDS } from '@lmh/types';
  import type { StatName } from '@lmh/types';

  let { sessionId }: { sessionId: string } = $props();

  const STAT_OPTS = ['Approval','Recognition','Rizz','Party','Region'] as const;
  const ALL_PARTIES = ['Progressive','Unionist','Whig','Conservative'] as const;
  const ALL_REGIONS = ['Midwest','Mountain','Northeast','South','Southwest','West'] as const;

  // ── form state ────────────────────────────────────────────────────────────
  let stat      = $state<StatName>('Approval');
  let pTarget   = $state('');    // player name  (Approval/Recognition/Rizz)
  let party     = $state<string>('Progressive');  // party name (Party)
  let region    = $state<string>('Midwest');       // region    (Region)
  let regParty  = $state<string>('Progressive');   // party     (Region)
  let delta     = $state<number>(0);
  let reason    = $state('');
  let error     = $state('');
  let applying  = $state(false);
  let lastApplied = $state('');

  // ── derived helpers ───────────────────────────────────────────────────────
  const isPlayerStat  = $derived(stat === 'Approval' || stat === 'Recognition' || stat === 'Rizz');
  const isParty       = $derived(stat === 'Party');
  const isRegion      = $derived(stat === 'Region');
  const isRizz        = $derived(stat === 'Rizz');

  const composedTarget = $derived(
    isPlayerStat ? pTarget :
    isParty      ? party :
                   `${region}:${regParty}`
  );

  const deltas = $derived(DELTA_TABLE[stat]);
  const bounds = $derived(BOUNDS[stat]);
  const ceilLabel = $derived(bounds[1] === Infinity ? '&infin;' : String(bounds[1]));

  // Seed default player target when players load
  $effect(() => {
    if (isPlayerStat && !pTarget && $players.length > 0) {
      pTarget = $players[0].name;
    }
  });

  // ── handlers ──────────────────────────────────────────────────────────────
  async function applyChange() {
    if (!composedTarget)   { error = 'Select a target.'; return; }
    if (!reason.trim())    { error = 'Reason is required.'; return; }
    if (isRizz && delta < 0) { error = 'Rizz is gain-only — use a positive delta.'; return; }
    error = '';
    applying = true;
    const gmToken = localStorage.getItem(`lmh:gm:${sessionId}`) ?? '';
    try {
      await api.gmPost(`/api/v1/gm/sessions/${sessionId}/override`, gmToken, {
        stat, target: composedTarget, delta, reason,
      });
      lastApplied = `${stat} | ${composedTarget} | ${delta >= 0 ? '+' : ''}${delta}`;
      delta  = 0;
      reason = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to apply stat change.';
    } finally {
      applying = false;
    }
  }

</script>

<!-- ── main panel ──────────────────────────────────────────────────────────── -->
<div class="border rounded p-4 space-y-3">
  <h2 class="font-semibold">Apply Stat Change</h2>

  <!-- Stat type -->
  <div class="space-y-1">
    <label class="text-xs font-medium text-gray-600" for="sc-stat">Stat</label>
    <select id="sc-stat" class="border rounded w-full px-2 py-1 text-sm" bind:value={stat}>
      {#each STAT_OPTS as s (s)}<option value={s}>{s}</option>{/each}
    </select>
    <p class="text-xs text-gray-400">
      Small &plusmn;{deltas[0]} &nbsp;&bull;&nbsp; Medium &plusmn;{deltas[1]} &nbsp;&bull;&nbsp;
      Large &plusmn;{deltas[2]}&nbsp;
      &nbsp;|&nbsp; Floor: {bounds[0]} &nbsp; Ceiling: {#if bounds[1] === Infinity}&infin;{:else}{bounds[1]}{/if}
      {#if isRizz}<span class="text-amber-600 ml-1">(gain-only)</span>{/if}
    </p>
  </div>

  <!-- Target (dynamic) -->
  <div class="space-y-1">
    <label class="text-xs font-medium text-gray-600" for="sc-target">Target</label>
    {#if isPlayerStat}
      <select id="sc-target" class="border rounded w-full px-2 py-1 text-sm" bind:value={pTarget}>
        {#if $players.length === 0}
          <option value="">No players yet</option>
        {:else}
          {#each $players as p (p.id ?? p.name)}<option value={p.name}>{p.name} ({p.party})</option>{/each}
        {/if}
      </select>
    {:else if isParty}
      <select id="sc-target" class="border rounded w-full px-2 py-1 text-sm" bind:value={party}>
        {#each ALL_PARTIES as p (p)}<option value={p}>{p}</option>{/each}
      </select>
    {:else}
      <div class="flex gap-2">
        <select class="border rounded flex-1 px-2 py-1 text-sm" bind:value={region}>
          {#each ALL_REGIONS as r (r)}<option value={r}>{r}</option>{/each}
        </select>
        <select class="border rounded flex-1 px-2 py-1 text-sm" bind:value={regParty}>
          {#each ALL_PARTIES as p (p)}<option value={p}>{p}</option>{/each}
        </select>
      </div>
      <p class="text-xs text-gray-400">Target will be: <code>{composedTarget}</code></p>
    {/if}
  </div>

  <!-- Delta -->
  <div class="space-y-1">
    <label class="text-xs font-medium text-gray-600" for="sc-delta">
      Delta {#if isRizz}<span class="text-amber-600">(positive only)</span>{/if}
    </label>
    <input
      id="sc-delta"
      type="number" step="0.05"
      min={isRizz ? 0 : undefined}
      class="border rounded w-full px-2 py-1 text-sm font-mono"
      bind:value={delta} />
  </div>

  <!-- Reason -->
  <div class="space-y-1">
    <label class="text-xs font-medium text-gray-600" for="sc-reason">Reason</label>
    <input
      id="sc-reason"
      type="text" placeholder="One-line in-world justification"
      class="border rounded w-full px-2 py-1 text-sm"
      bind:value={reason} />
  </div>

  {#if error}<p class="text-xs text-red-600">{error}</p>{/if}
  {#if lastApplied}<p class="text-xs text-teal-700">Applied: {lastApplied}</p>{/if}

  <button
    onclick={applyChange}
    disabled={applying}
    class="w-full bg-blue-700 text-white px-3 py-2 rounded text-sm hover:bg-blue-800 disabled:opacity-50">
    {applying ? 'Applying…' : 'Apply Stat Change'}
  </button>

</div>
