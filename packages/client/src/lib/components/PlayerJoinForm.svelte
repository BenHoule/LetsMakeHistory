<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { api } from '$lib/api.js';
  import { socket } from '$lib/socket.js';
  import { setPlayerId } from '../../stores/session.js';
  import type { AddPlayerResponse, PlayerState, SessionStateResponse } from '@lmh/types';
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
  let seatNotice = $state('');

  // Available NPC seats: { region -> { class -> npcCount } }
  let seats = $state<Record<string, Record<number, number>>>({});
  let activePlayers = $state<PlayerState[]>([]);

  const PARTY_COLORS: Record<Party, string> = {
    Progressive: '#1f3a5f',
    Unionist: '#3b6d11',
    Whig: '#8a4b08',
    Conservative: '#7a2222',
  };

  async function loadSeats() {
    seats = await api.get<Record<string, Record<number, number>>>(
      `/api/v1/sessions/${sessionId}/available-seats`
    ).catch(() => ({}));
    seatNotice = isFull(region, clss)
      ? `Your selected seat (${region} Class ${clss}) was just taken. Please pick another seat.`
      : '';
  }

  async function loadActivePlayers() {
    const state = await api.get<SessionStateResponse>(`/api/v1/sessions/${sessionId}`).catch(() => null);
    activePlayers = state?.players ?? [];
  }

  function watchLobbySeats() {
    const joinAsObserver = () => {
      socket.emit('join_session', { sessionId, playerId: 'observer' });
      loadSeats().catch(() => {});
    };

    const onPlayersUpdated = (event: { players?: PlayerState[] }) => {
      activePlayers = event?.players ?? activePlayers;
      loadSeats().catch(() => {});
    };

    joinAsObserver();
    socket.on('connect', joinAsObserver);
    socket.on('players_updated', onPlayersUpdated);

    return () => {
      socket.off('connect', joinAsObserver);
      socket.off('players_updated', onPlayersUpdated);
    };
  }

  let stopWatching: (() => void) | null = null;

  onMount(() => {
    loadSeats();
    loadActivePlayers();
    stopWatching = watchLobbySeats();
  });

  onDestroy(() => {
    stopWatching?.();
    stopWatching = null;
  });

  function isFull(r: Region | string, c: number): boolean {
    return (seats[r]?.[c] ?? 0) === 0;
  }

  function availableClasses(r: Region | string): Array<1 | 2 | 3> {
    return CLASSES.filter(c => !isFull(r, c));
  }

  async function joinSession() {
    error = '';
    seatNotice = '';
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

  let joinDisabled = $derived(
    submitting || !name.trim() || isFull(region, clss) || availableClasses(region).length === 0,
  );

  let sortedActivePlayers = $derived(
    [...activePlayers].sort((a, b) =>
      a.region.localeCompare(b.region) || a.class - b.class || a.name.localeCompare(b.name)
    ),
  );
</script>

<form onsubmit={(e) => { e.preventDefault(); joinSession(); }} class="space-y-3">
  <input class="border p-2 w-full" bind:value={name} placeholder="Player name" required />

  <select class="border p-2 w-full" bind:value={region}>
    {#each REGIONS as r (r)}
      {@const allFull = availableClasses(r).length === 0}
      <option value={r} disabled={allFull}>{r}{allFull ? ' (full)' : ''}</option>
    {/each}
  </select>

  <select class="border p-2 w-full" bind:value={party}>
    {#each PARTIES as p (p)}
      <option value={p}>{p}</option>
    {/each}
  </select>

  <select class="border p-2 w-full" bind:value={clss}>
    {#each CLASSES as c (c)}
      <option value={c} disabled={isFull(region, c)}>Class {c}{isFull(region, c) ? ' (taken)' : ''}</option>
    {/each}
  </select>

  {#if seatNotice}
    <p class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">{seatNotice}</p>
  {/if}

  {#if error}
    <p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
  {/if}

  <button type="submit" disabled={joinDisabled}
    class="bg-green-700 text-white px-4 py-2 rounded w-full disabled:opacity-50">
    {submitting ? 'Joining…' : 'Join as Senator'}
  </button>

  <section class="border rounded p-3 bg-gray-50 space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-800">Active Player Senators</h3>
      <span class="text-xs text-gray-500">{sortedActivePlayers.length} joined</span>
    </div>

    {#if sortedActivePlayers.length === 0}
      <p class="text-xs text-gray-500 italic">No active player senators yet.</p>
    {:else}
      <div class="max-h-44 overflow-auto border rounded bg-white">
        <table class="w-full text-xs border-collapse">
          <thead>
            <tr class="text-left text-gray-500 border-b bg-gray-50">
              <th class="py-1 px-2">Name</th>
              <th class="py-1 px-2">Party</th>
              <th class="py-1 px-2">Region</th>
              <th class="py-1 px-2 text-right">Class</th>
            </tr>
          </thead>
          <tbody>
            {#each sortedActivePlayers as p (p.id)}
              <tr class="border-b last:border-b-0">
                <td class="py-1 px-2 font-medium">{p.name}</td>
                <td class="py-1 px-2 font-semibold" style="color:{PARTY_COLORS[p.party as Party] ?? '#555'};">{p.party}</td>
                <td class="py-1 px-2 text-gray-700">{p.region}</td>
                <td class="py-1 px-2 text-right text-gray-700">{p.class}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</form>
