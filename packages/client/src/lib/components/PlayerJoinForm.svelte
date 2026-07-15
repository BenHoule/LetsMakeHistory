<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api.js';
  import { setPlayerId } from '../../stores/session.js';
  import type { AddPlayerResponse } from '@lmh/types';
  import type { Region, Party } from '@lmh/types';

  let { sessionId, onJoined }: {
    sessionId: string;
    onJoined: (playerId: string) => void;
  } = $props();

  const REGIONS: Region[] = ['Midwest', 'Mountain', 'Northeast', 'South', 'Southwest', 'West'];
  const PARTIES: Party[]  = ['Progressive', 'Unionist', 'Whig', 'Conservative'];
  const CLASSES           = [1, 2, 3] as const;

  let name       = $state('');
  let region     = $state<Region>('Northeast');
  let party      = $state<Party>('Progressive');
  let clss       = $state<1 | 2 | 3>(1);
  let error      = $state('');
  let submitting = $state(false);

  // Available NPC seats: { region -> { class -> npcCount } }
  let seats = $state<Record<string, Record<number, number>>>({});

  async function loadSeats() {
    seats = await api.get<Record<string, Record<number, number>>>(
      `/api/v1/sessions/${sessionId}/available-seats`
    ).catch(() => ({}));
    // Auto-select first available region/class if current selection is full
    if (isFull(region, clss)) {
      for (const r of REGIONS) {
        for (const c of CLASSES) {
          if (!isFull(r, c)) { region = r; clss = c; return; }
        }
      }
    }
  }

  onMount(loadSeats);

  function isFull(r: Region | string, c: number): boolean {
    return (seats[r]?.[c] ?? 0) === 0;
  }

  function availableClasses(r: Region | string): Array<1 | 2 | 3> {
    return CLASSES.filter(c => !isFull(r, c));
  }

  // When region changes, auto-pick the first available class
  $effect(() => {
    if (Object.keys(seats).length > 0 && isFull(region, clss)) {
      const first = availableClasses(region)[0];
      if (first !== undefined) clss = first;
    }
  });

  async function joinSession() {
    error = '';
    submitting = true;
    // Refresh seats right before submitting to catch races
    await loadSeats();
    if (isFull(region, clss)) {
      error = `Region ${region} Class ${clss} is full — please choose another.`;
      submitting = false;
      return;
    }
    try {
      const res = await api.post<AddPlayerResponse>(`/api/v1/sessions/${sessionId}/players`,
        { name, region, party, class: clss },
      );
      sessionStorage.setItem(`lmh:player:${sessionId}`, res.playerId);
      localStorage.setItem(`lmh:player:${sessionId}`, res.playerId); // fallback for same-tab refresh
      setPlayerId(res.playerId);
      onJoined(res.playerId);
    } catch (e: any) {
      // Server returned 409 (seat taken by race) — reload seats and show error
      await loadSeats();
      error = e?.message ?? 'That seat is no longer available. Please choose another.';
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={(e) => { e.preventDefault(); joinSession(); }} class="space-y-3">
  <input class="border p-2 w-full" bind:value={name} placeholder="Player name" required />

  <select class="border p-2 w-full" bind:value={region}>
    {#each REGIONS as r}
      {@const allFull = availableClasses(r).length === 0}
      <option value={r} disabled={allFull}>{r}{allFull ? ' (full)' : ''}</option>
    {/each}
  </select>

  <select class="border p-2 w-full" bind:value={party}>
    {#each PARTIES as p}
      <option value={p}>{p}</option>
    {/each}
  </select>

  <select class="border p-2 w-full" bind:value={clss}>
    {#each CLASSES as c}
      <option value={c} disabled={isFull(region, c)}>Class {c}{isFull(region, c) ? ' (taken)' : ''}</option>
    {/each}
  </select>

  {#if error}
    <p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
  {/if}

  <button type="submit" disabled={submitting || availableClasses(region).length === 0}
    class="bg-green-700 text-white px-4 py-2 rounded w-full disabled:opacity-50">
    {submitting ? 'Joining…' : 'Join as Senator'}
  </button>
</form>
