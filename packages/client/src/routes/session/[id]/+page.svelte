<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { socket } from '$lib/socket.js';
  import { api } from '$lib/api.js';
  import { sessionStore, phase, setSession, setPlayers, setCurrentTurnOnly, setNationalStatus, setPlayerId } from '../../../stores/session.js';
  import TurnHeader from '$lib/components/TurnHeader.svelte';
  import NewsPanel from '$lib/components/NewsPanel.svelte';
  import NationalStatus from '$lib/components/NationalStatus.svelte';
  import EventFeed from '$lib/components/EventFeed.svelte';
  import BillBoard from '$lib/components/BillBoard.svelte';
  import PlayerActionPanel from '$lib/components/PlayerActionPanel.svelte';
  import StatSidebar from '$lib/components/StatSidebar.svelte';
  import LegislativeVoteCard from '$lib/components/LegislativeVoteCard.svelte';
  import GameHistoryPanel from '$lib/components/GameHistoryPanel.svelte';
  import BillHistoryPanel from '$lib/components/BillHistoryPanel.svelte';
  import type { SessionStateResponse } from '@lmh/types';
  import { statNotifications } from '../../../stores/notifications.js';

  const sessionId = page.params.id!;

  // Derived: find this player's senator info
  let myPlayer = $derived($sessionStore.players?.find(p => p.id === ($sessionStore as any)._playerId));

  // Election timing helpers
  // turnIndex is 0-based; 1-based turn = turnIndex + 1
  let currentTurn = $derived(($sessionStore.session?.turnIndex ?? 0) + 1);
  let nextSenateClass = $derived(($sessionStore.session as any)?.next_senate_class ?? 1);

  /** Returns how many 1-based turns until the senate election for the given class. */
  function turnsUntilSenateElection(cls: number, turn: number, nextCls: number): number {
    // Next election is at the next multiple-of-4 turn (1-indexed)
    const nextElecTurn = Math.ceil(turn / 4) * 4;
    // Distance in "slots" between nextCls and cls on the 1→2→3 cycle
    const slotsAway = ((cls - nextCls + 3) % 3);
    return (nextElecTurn - turn) + slotsAway * 4;
  }

  let mySenateCountdown = $derived(
    myPlayer ? turnsUntilSenateElection(myPlayer.class, currentTurn, nextSenateClass) : null
  );

  // Presidential election: every 8 turns
  let turnsUntilPresElection = $derived(() => {
    const next = Math.ceil(currentTurn / 8) * 8;
    return next - currentTurn;
  });

  // Alert if any election ≤ 2 turns away
  let electionAlert = $derived(() => {
    const alerts: string[] = [];
    const presCountdown = Math.ceil(currentTurn / 8) * 8 - currentTurn;
    if (presCountdown <= 2) alerts.push(`Presidential election in ${presCountdown} turn${presCountdown === 1 ? '' : 's'}`);
    // Check all senate classes
    for (const cls of [1, 2, 3] as const) {
      const cnt = turnsUntilSenateElection(cls, currentTurn, nextSenateClass);
      if (cnt <= 2) alerts.push(`Class ${cls} senate election in ${cnt} turn${cnt === 1 ? '' : 's'}`);
    }
    return alerts;
  });

  onMount(async () => {
    // sessionStorage is per-tab (survives refresh, not shared across tabs).
    // Fall back to localStorage only when sessionStorage is empty (e.g. first load after hard-nav).
    const playerId =
      sessionStorage.getItem(`lmh:player:${sessionId}`) ??
      localStorage.getItem(`lmh:player:${sessionId}`) ??
      'observer';
    // Keep sessionStorage in sync so future refreshes don't need localStorage.
    if (playerId !== 'observer') sessionStorage.setItem(`lmh:player:${sessionId}`, playerId);

    // Restore player identity into the store so the senator banner renders on refresh.
    if (playerId !== 'observer') setPlayerId(playerId);

    // Populate store with current session state before joining the socket room.
    const state = await api.get<SessionStateResponse>(`/api/v1/sessions/${sessionId}`);
    setSession(state.session);
    setPlayers(state.players);

    // Restore current turn so players don't lose news/events on refresh
    const turn = await api.get<any>(`/api/v1/sessions/${sessionId}/turns/current`).catch(() => null);
    if (turn) setCurrentTurnOnly(turn);

    // Restore national status
    if ((state.session as any).national_status) {
      try {
        const ns = typeof (state.session as any).national_status === 'string'
          ? JSON.parse((state.session as any).national_status)
          : (state.session as any).national_status;
        setNationalStatus(ns.financial ?? '', ns.social ?? '', ns.foreign ?? '');
      } catch {}
    }

    socket.emit('join_session', { sessionId, playerId });
  });
</script>

{#if myPlayer}
  <div style="background:#1c1a14;border-bottom:1px solid #3d3520;padding:8px 16px;font-family:Georgia,serif;font-size:13px;color:#d4b896;display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
    <span style="font-weight:700;color:#f5e9d0;">Senator {myPlayer.name}</span>
    <span style="color:#a89060;">{myPlayer.party}</span>
    <span style="color:#8a7a55;">&mdash; {myPlayer.region}, Class {myPlayer.class}</span>
    {#if mySenateCountdown !== null}
      <span style="color:#7a6a44;font-size:11px;">
        {mySenateCountdown === 0
          ? 'Up for reelection this turn!'
          : `Reelection in ${mySenateCountdown} turn${mySenateCountdown === 1 ? '' : 's'}`}
      </span>
    {/if}
    {#each electionAlert() as alert}
      <span style="background:#7a2222;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;letter-spacing:.03em;">
        ⚑ {alert}
      </span>
    {/each}
  </div>
{:else}
  <!-- Show election alerts even for observers / before joining -->
  {#if electionAlert().length > 0}
    <div style="background:#1c1a14;border-bottom:1px solid #3d3520;padding:6px 16px;display:flex;gap:8px;flex-wrap:wrap;">
      {#each electionAlert() as alert}
        <span style="background:#7a2222;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;">⚑ {alert}</span>
      {/each}
    </div>
  {/if}
{/if}

<div class="flex gap-4 p-4">
  <main class="flex-1 space-y-4 min-w-0">
    <TurnHeader />
    <NewsPanel />
    <NationalStatus />
    <EventFeed />
    <BillBoard {sessionId} />
    <LegislativeVoteCard />
    {#if $phase === 'PLAYER_ACTIONS'}
      <PlayerActionPanel {sessionId} />
    {/if}
    <!-- History: always visible below main content -->
    <GameHistoryPanel {sessionId} />
    <BillHistoryPanel {sessionId} />
  </main>
  <aside class="w-56 shrink-0">
    <StatSidebar />
  </aside>
</div>

<!-- Stat roll toast notifications (shown when GM grants visibility) -->
{#if $statNotifications.length > 0}
  <div style="position:fixed;bottom:16px;right:16px;z-index:200;display:flex;flex-direction:column-reverse;gap:8px;max-width:340px;pointer-events:none;">
    {#each $statNotifications as n (n.id)}
      <div style="background:#232019;color:#faf7f0;border-left:4px solid {n.positive?'#3b6d11':'#a32d2d'};border-radius:4px;padding:10px 14px;font-size:12px;font-family:Georgia,serif;box-shadow:0 2px 8px rgba(0,0,0,0.4);">
        {n.text}
      </div>
    {/each}
  </div>
{/if}

