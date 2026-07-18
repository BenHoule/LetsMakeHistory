<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import type { Socket } from 'socket.io-client';
  import { page } from '$app/state';
  import { socket } from '$lib/socket.js';
  import { api } from '$lib/api.js';
  import { runtimeConfig } from '$lib/runtime.js';
  import { sessionStore, phase, setSession, setPlayers, players } from '../../../stores/session.js';
  import { addPlayerAction, pendingActions, pendingStatRolls, visibilitySettings, setVisibility } from '../../../stores/gm.js';
  import { pendingActionVotes } from '../../../stores/votes.js';
  import type { ActionVoteResultEvent, ClientToServerEvents, Party, PlayerState, ServerToClientEvents, SessionStateResponse } from '@lmh/types';
  import NationalStatusEditor from '$lib/components/NationalStatusEditor.svelte';
  import ActionQueue          from '$lib/components/ActionQueue.svelte';
  import StatRollPreview      from '$lib/components/StatRollPreview.svelte';
  import StatChangePanel      from '$lib/components/StatChangePanel.svelte';
  import PlayerStatsTable     from '$lib/components/PlayerStatsTable.svelte';
  import LedgerImporter       from '$lib/components/LedgerImporter.svelte';
  import GameHistoryPanel     from '$lib/components/GameHistoryPanel.svelte';

  type GmTurnContentType = 'EVENT' | 'COURT' | 'NPC_BILL' | 'AP_HEADLINE' | 'AMST_HEADLINE';

  interface GmElectionData {
    presidentName?: string;
    presidentParty?: Party;
    presidentElectedYear?: number;
    presidentIsPlayer?: boolean;
    nextSenateClass?: 1 | 2 | 3;
    crossoverWeight?: number;
    leftLeanBias?: number;
    pendingNominees?: GmPendingNominees | null;
    npcCandidates?: GmNpcCandidate[];
  }

  interface GmNomineeSlot {
    party: Party;
    name: string;
  }

  interface GmPendingNominees {
    slots: GmNomineeSlot[];
    year: number;
  }

  interface GmNpcCandidate {
    year: number;
    party: Party;
    name: string;
  }

  interface GmSenatorRow {
    id: string;
    region: string;
    class: 1 | 2 | 3;
    party: Party;
    is_player: boolean;
    player_id: string | null;
    player_name: string | null;
  }

  interface GmPartyApprovalRow {
    party: Party;
    approval: number;
  }

  interface GmRegionalModifierRow {
    region: string;
    party: Party;
    modifier: number;
  }

  interface GmStatHistoryRow {
    stat: string;
    target: string;
    delta: number;
    reason: string;
  }

  interface GmPlayerUpdateResponse {
    players?: PlayerState[];
    senators?: GmSenatorRow[];
  }

  interface GmBillQueueRow {
    id: string;
    title: string | null;
    content: string;
    proposing_party: Party;
    is_amendment: boolean;
    is_npc: boolean;
    queued_at: string;
    vote_result: 'PENDING';
    source_player_id: string | null;
    trigger_weight: number | null;
    direction_bias: number | null;
    stat_hint: string | null;
    target_hint: string | null;
    player_name: string | null;
  }

  interface GmBillHistoryRow {
    id: string;
    title: string | null;
    content: string;
    proposing_party: Party;
    is_amendment: boolean;
    is_npc: boolean;
    vote_result: 'PASSED' | 'FAILED' | 'VETOED' | 'OVERRIDE_PASSED';
    voted_at: string | null;
    yea_count: number | null;
    nay_count: number | null;
    abstain_count: number | null;
    turn_index: number | null;
    year: number | null;
    player_name: string | null;
  }

  interface GmTurnContentRow {
    id: string;
    type: GmTurnContentType;
    content: string;
    party: Party | null;
    title: string | null;
    trigger_weight: number | null;
    direction_bias: number | null;
    stat_hint: string | null;
    target_hint: string | null;
    created_at: string;
  }

  type GmTurnContentPayload = {
    type: GmTurnContentType;
    content: string;
    party: Party | null;
    title: string | null;
    triggerWeight?: number;
    directionBias?: number;
    statHint?: string;
    targetHint?: string;
  };

  interface GmVoteProgressEvent {
    actionId: string;
    votedCount: number;
    totalPlayers: number;
    allVoted: boolean;
  }

  interface GmPlayerActionVotedEvent {
    actionId: string;
    playerName: string;
    vote: 'YEA' | 'NAY';
  }

  interface GmBillVoteSeatResult {
    id: string;
    region: string;
    class: 1 | 2 | 3;
    party: Party;
    player_name: string | null;
    is_player: boolean;
    vote: 'PLAYER' | 'YEA' | 'NAY';
  }

  interface GmSenateResultRow {
    region: string;
    cls: 1 | 2 | 3;
    winnerParty: Party;
    top: Party;
    second: Party;
    prevParty: Party;
    prevOccupant: string;
    flipped: boolean;
    note: string;
  }

  interface GmPresidentialResult {
    nominees: GmNomineeSlot[];
    electors: Record<string, number>;
    breakdown: Array<{ region: string; aVal: number; bVal: number; winner: Party }>;
    winnerSlot: GmNomineeSlot;
    tie: boolean;
    popularVote: { a: number; b: number } | null;
    overridden: boolean;
  }

  interface GmSpecialElectionSuggestion {
    region: string;
    cls: 1 | 2 | 3;
    party: Party;
    ranked: Party[];
  }

  interface GmBillResult {
    yea: number;
    nay: number;
    yeaShare: number;
    senatePasses: boolean;
    regionsOK: boolean;
    regionsMaj: number;
    presSigns: boolean;
    passes: boolean;
    seatResults: GmBillVoteSeatResult[];
    regionTally: Record<string, { yea: number; nay: number }>;
  }

  interface GmServerToClientEvents extends ServerToClientEvents {
    action_vote_progress: (e: GmVoteProgressEvent) => void;
    bill_queued: () => void;
    bill_queue_updated: () => void;
    player_action_voted: (e: GmPlayerActionVotedEvent) => void;
    player_removed: (e: { playerId: string }) => void;
  }

  interface GmClientToServerEvents extends ClientToServerEvents {
    gm_start_bill_vote: (payload: { sessionId: string; billId: string }) => void;
  }

  const gmSocket = socket as Socket<GmServerToClientEvents, GmClientToServerEvents>;

  const sessionId = page.params.id!;
  let gmToken = $state('');

  type Tab = 'dashboard'|'actions'|'parties'|'roster'|'bills'|'elections'|'ledger';
  let activeTab = $state<Tab>('actions');

  let partyApprovals = $state<Record<string,number>>({});
  let regionalMods   = $state<Record<string,Record<string,number>>>({});
  let senators       = $state<GmSenatorRow[]>([]);
  let statHistory    = $state<GmStatHistoryRow[]>([]);
  let syncArmed      = $state(false);

  // Constants used throughout (declared here so election state can reference them)
  const PARTIES  = ['Progressive','Unionist','Whig','Conservative'] as const;
  const REGIONS  = ['Midwest','Mountain','Northeast','South','Southwest','West'] as const;
  const SPECTRUM: Record<string,number> = { Progressive:0, Unionist:1, Whig:2, Conservative:3 };
  const LEAN_CATS = [
    { label:'strongly against', prob:0.10 },
    { label:'lean against',     prob:0.30 },
    { label:'toss-up',          prob:0.50 },
    { label:'lean for',         prob:0.70 },
    { label:'strongly for',     prob:0.90 },
  ];

  // ── Election timing helpers ────────────────────────────────────────────────
  const gmCurrentTurn   = $derived(($sessionStore.session?.turnIndex ?? 0) + 1);
  const gmNextSenCls    = $derived($sessionStore.session?.classCycle ?? 1);

  function gmTurnsUntilSenate(cls: number): number {
    const nextElecTurn = Math.ceil(gmCurrentTurn / 4) * 4;
    const slotsAway = ((cls - gmNextSenCls + 3) % 3);
    return (nextElecTurn - gmCurrentTurn) + slotsAway * 4;
  }

  const gmElectionAlerts = $derived(() => {
    const alerts: string[] = [];
    const presCnt = Math.ceil(gmCurrentTurn / 8) * 8 - gmCurrentTurn;
    if (presCnt <= 2) alerts.push(`Presidential in ${presCnt}t`);
    for (const cls of [1, 2, 3] as const) {
      const cnt = gmTurnsUntilSenate(cls);
      if (cnt <= 2) alerts.push(`Class ${cls} Senate in ${cnt}t`);
    }
    return alerts;
  });

  // ── Election state ────────────────────────────────────────────────────────
  // nationalStandings must be declared before presEligible uses it
  // (It depends on partyApprovals which is a $state; declared later but
  //  TypeScript needs lexical order. We declare a reactive stub here and
  //  reassign via $derived after partyApprovals is in scope.)
  let ed          = $state<GmElectionData | null>(null);   // getElectionData response
  let presRunning = $state(true);
  let playerRunId = $state('');
  let presResult  = $state<GmPresidentialResult | null>(null);
  let senResult   = $state<GmSenateResultRow[]>([]);
  let senClassPick = $state<1 | 2 | 3>(1);
  let spRegion    = $state('Midwest');
  let spClass     = $state<1 | 2 | 3>(1);
  let spResult    = $state<GmSpecialElectionSuggestion | null>(null);
  let newNpcYear  = $state(1904);
  let newNpcNames = $state<Record<string,string>>({ Progressive:'', Unionist:'', Whig:'', Conservative:'' });
  const sharePlayerBaseUrl = $derived($runtimeConfig.sharePlayerBaseUrl ?? page.url.origin);

  function getSharePlayerLink() {
    return `${sharePlayerBaseUrl}/lobby?session=${sessionId}`;
  }

  // Eligible presidential candidates: recognition >= 50 AND in top-2 nationally
  const presEligible = $derived(
    (() => {
      const top2 = [...PARTIES as unknown as string[]].sort((a,b)=>(partyApprovals[b]??0)-(partyApprovals[a]??0)).slice(0,2);
      return $players.filter(p => p.recognition >= 50 && top2.includes(p.party));
    })()
  );

  // ── Client-side election calculations ────────────────────────────────────

  function candidateSupport(region: string, candParty: string, otherParty: string): number {
    const cw = ed?.crossoverWeight ?? 0.4;
    const lb = ed?.leftLeanBias   ?? 0.3;
    let total = regionApproval[region]?.[candParty] ?? 0;
    const idxC = SPECTRUM[candParty], idxO = SPECTRUM[otherParty];
    for (const p of PARTIES) {
      if (p === candParty || p === otherParty) continue;
      const idxP = SPECTRUM[p];
      const dC = Math.abs(idxP - idxC), dO = Math.abs(idxP - idxO), dSum = dC + dO;
      if (dSum === 0) continue;
      let share = dO / dSum;          // closer to candidate → more votes
      if (dC === dO) {
        share = idxC < idxO ? 0.5 + lb : 0.5 - lb;  // left-lean tiebreak
      } else {
        // Additional directional bias
        const bias = lb * (1 - Math.abs(share - 0.5) * 2);
        if (idxC < idxO) share = Math.min(1, share + bias);
        else             share = Math.max(0, share - bias);
      }
      total += (regionApproval[region]?.[p] ?? 0) * cw * share;
    }
    return total;
  }

  function resolveNominees() {
    const nat = [...PARTIES] as Party[];
    nat.sort((a,b)=>(partyApprovals[b]??0)-(partyApprovals[a]??0));
    const yr  = 1901 + Math.floor(($sessionStore.session?.turnIndex ?? 0) / 2);
    const nextElecYear = yr + (4 - (yr - 1901) % 4) % 4;
    let slots: GmNomineeSlot[];

    if (presRunning) {
      const presParty: Party = ed?.presidentParty ?? 'Progressive';
      const challenger: Party = nat.find(p => p !== presParty) ?? nat[1];
      slots = [
        { party: presParty, name: ed?.presidentName ?? 'Theodore Roosevelt' },
        { party: challenger, name: '' },
      ];
    } else {
      slots = nat.slice(0,2).map(p => ({ party: p, name: '' }));
    }

    // Apply player running override
    if (playerRunId) {
      const pl = $players.find(p => p.id === playerRunId);
      if (pl) {
        const idx = slots.findIndex(s => s.party === pl.party);
        if (idx >= 0) slots[idx] = { party: pl.party, name: pl.name };
      }
    }

    // Fill names from NPC candidate pool
    for (const slot of slots) {
      if (!slot.name) {
        const cyc = ed?.npcCandidates?.find(c => c.year === nextElecYear && c.party === slot.party);
        slot.name = cyc?.name || '(add NPC pool entry)';
      }
    }
    return { slots, year: nextElecYear };
  }

  async function lockNominees() {
    const nom = resolveNominees();
    await api.gmPost(`/api/v1/gm/sessions/${sessionId}/pending-nominees`, gmToken, { nominees: nom });
    if (ed) ed = { ...ed, pendingNominees: nom };
  }

  function runPresidentialElection() {
    const nominees = ed?.pendingNominees?.slots ?? resolveNominees().slots;
    if (nominees.length < 2) return;
    const [A, B] = nominees;
    const electors: Record<string,number> = { [A.party]: 0, [B.party]: 0 };
    const breakdown = REGIONS.map(r => {
      const aV = candidateSupport(r, A.party, B.party);
      const bV = candidateSupport(r, B.party, A.party);
      const winner = aV >= bV ? A : B;
      electors[winner.party]++;
      return { region: r, aVal: aV, bVal: bV, winner: winner.party };
    });
    let winnerSlot, tie = false, popularVote = null;
    if (electors[A.party] > electors[B.party]) winnerSlot = A;
    else if (electors[B.party] > electors[A.party]) winnerSlot = B;
    else {
      tie = true;
      const aSum = REGIONS.reduce((s, r) => s + candidateSupport(r, A.party, B.party), 0);
      const bSum = REGIONS.reduce((s, r) => s + candidateSupport(r, B.party, A.party), 0);
      popularVote = { a: aSum, b: bSum };
      winnerSlot = aSum >= bSum ? A : B;
    }
    presResult = { nominees, electors, breakdown, winnerSlot, tie, popularVote, overridden: false };
  }

  async function applyPresResult() {
    if (!presResult) return;
    const w = presResult.winnerSlot;
    const year = ed?.pendingNominees?.year ?? ($sessionStore.session?.year ?? 1901);
    await api.gmPost(`/api/v1/gm/sessions/${sessionId}/president`, gmToken,
      { name: w.name, party: w.party, year, isPlayer: false });
    await api.gmPost(`/api/v1/gm/sessions/${sessionId}/pending-nominees`, gmToken, { nominees: null });
    if (ed) ed = { ...ed, presidentName: w.name, presidentParty: w.party, presidentElectedYear: year, pendingNominees: null };
    presResult = null;
  }

  function runSenateElection() {
    const cls = senClassPick;
    senResult = REGIONS.map(region => {
      const sorted = [...PARTIES].sort((a, b) =>
        (regionApproval[region]?.[b] ?? 0) - (regionApproval[region]?.[a] ?? 0)
      );
      const top = sorted[0], second = sorted[1];
      const prevSeat = senators.find(s => s.region === region && s.class === cls);
      const prevParty = prevSeat?.party ?? top;
      const prevOccupant = prevSeat?.player_name ?? 'NPC';

      // Underdog exception
      let winnerParty = top;
      if (prevSeat?.is_player) {
        const pl = $players.find(p => p.id === prevSeat.player_id || p.name === prevOccupant);
        if (pl && prevParty === second) {
          const gap = (regionApproval[region]?.[top] ?? 0) - (regionApproval[region]?.[second] ?? 0);
          const buffer = 5 + (pl.approval - 50);
          if (buffer > gap) winnerParty = second;
        }
      }
      return {
        region, cls, winnerParty, top, second,
        prevParty, prevOccupant,
        flipped: winnerParty !== prevParty,
        note: winnerParty === second ? 'Underdog hold' : '',
      };
    });
  }

  async function syncNpcSeats() {
    const resp = await api.gmPost<{ senators: GmSenatorRow[] }>(`/api/v1/gm/sessions/${sessionId}/sync-npc-seats`, gmToken, {});
    if (resp?.senators) senators = resp.senators;
  }

  async function applySenateResults() {
    if (!senResult.length) return;
    const results = senResult.map(r => ({ region: r.region, cls: r.cls, party: r.winnerParty }));
    const resp = await api.gmPost<{ senators: GmSenatorRow[] }>(`/api/v1/gm/sessions/${sessionId}/apply-senate-results`, gmToken, { results });
    if (resp?.senators) senators = resp.senators;
    senClassPick = ((senClassPick % 3) + 1);
    if (ed) ed = { ...ed, nextSenateClass: senClassPick as 1 | 2 | 3 };
    senResult = [];
  }

  function suggestSpecial() {
    const ranked = [...PARTIES].sort((a, b) =>
      (regionApproval[spRegion]?.[b] ?? 0) - (regionApproval[spRegion]?.[a] ?? 0)
    );
    spResult = { region: spRegion, cls: spClass, party: ranked[0], ranked };
  }

  async function applySpecial() {
    if (!spResult) return;
    await api.gmPost(`/api/v1/gm/sessions/${sessionId}/apply-senate-results`, gmToken,
      { results: [{ region: spResult.region, cls: spResult.cls, party: spResult.party }] });
    const updSen = await api.get<GmSenatorRow[]>(`/api/v1/sessions/${sessionId}/senators`);
    senators = updSen;
    spResult = null;
  }

  async function addNpcCandidate() {
    const entries = Object.entries(newNpcNames).filter(([,v]) => v.trim());
    for (const [party, name] of entries) {
      await api.gmPost(`/api/v1/gm/sessions/${sessionId}/npc-candidates`, gmToken,
        { year: newNpcYear, party, name: name.trim() });
    }
    const npc = await api.get<GmElectionData>(`/api/v1/sessions/${sessionId}/election-data`).then(d => d.npcCandidates ?? []);
    if (ed) ed = { ...ed, npcCandidates: npc };
    newNpcNames = { Progressive:'', Unionist:'', Whig:'', Conservative:'' };
  }

  async function removeNpcCandidate(year: number, party: string) {
    await fetch(`${import.meta.env.PUBLIC_API_URL}/api/v1/gm/sessions/${sessionId}/npc-candidates/${year}/${party}`, {
      method: 'DELETE', headers: { 'x-gm-token': gmToken },
    });
    if (ed) ed = { ...ed, npcCandidates: (ed.npcCandidates ?? []).filter(c => !(c.year === year && c.party === party)) };
  }
  let billLean       = $state<Record<string,number>>({});
  let billRizzBoost  = $state<Record<string,boolean>>({});
  let billProposer   = $state<Party>('Progressive');
  let billTitle      = $state('');
  let billDesc       = $state('');
  let billType       = $state<'bill'|'amendment'>('bill');
  let billResult     = $state<GmBillResult | null>(null);
  let billQueue      = $state<GmBillQueueRow[]>([]);
  let billHistory    = $state<GmBillHistoryRow[]>([]);
  let latestVoteResult = $state<ActionVoteResultEvent | null>(null);
  let loading        = $state(true);
  let savingPlayerId = $state<string | null>(null);
  let rosterNotice   = $state<{ kind: 'success' | 'error'; text: string } | null>(null);
  let rosterNoticeTimer: number | null = null;
  let gmFlags        = $state<string[]>([]);
  let newFlagText    = $state('');

  // Per-vote lean overrides keyed by actionId → { party → { leanIdx, rizzBoosted } }
  let voteLeans = $state<Record<string, Record<string, {leanIdx:number;rizzBoosted:boolean}>>>({});

  // Turn content queue (events / SC / NPC bills for next turn)
  let turnContent    = $state<GmTurnContentRow[]>([]);
  let tcType         = $state<'EVENT'|'COURT'|'NPC_BILL'|'AP_HEADLINE'|'AMST_HEADLINE'>('EVENT');
  let tcContent      = $state('');
  let tcParty        = $state<Party>('Progressive');
  let tcTitle        = $state('');  // for NPC_BILL
  let tcShowWeights  = $state(false);
  let tcTriggerWt    = $state<number|null>(null);  // null = use default
  let tcDirBias      = $state(0.50);              // 0–1 probability of positive; default 50/50
  let tcStatHint     = $state('');
  let tcTargetHint   = $state('');
  // Reset weights when type changes
  $effect(() => { if (tcType) { tcShowWeights = false; tcTriggerWt = null; tcDirBias = 0.50; tcStatHint = ''; tcTargetHint = ''; } });

  const STAT_NAMES = ['Approval','Recognition','Rizz','Party','Region'];

  const tcEventCount   = $derived(turnContent.filter(t=>t.type==='EVENT').length);
  const tcCourtCount   = $derived(turnContent.filter(t=>t.type==='COURT').length);
  const tcNpcBillCount = $derived(turnContent.filter(t=>t.type==='NPC_BILL').length);
  const tcApCount      = $derived(turnContent.filter(t=>t.type==='AP_HEADLINE').length);
  const tcAmStCount    = $derived(turnContent.filter(t=>t.type==='AMST_HEADLINE').length);
  const tcReady        = $derived(
    tcEventCount>=3 && tcCourtCount>=1 && tcNpcBillCount>=3 && tcApCount>=1 && tcAmStCount>=1
  );
  const dashboardFlags = $derived([...gmElectionAlerts(), ...gmFlags]);

  // Vote progress (updated server-side as each player votes)
  let voteProgress = $state<Record<string, {votedCount:number;totalPlayers:number;allVoted:boolean}>>({});
  // Stat change modal for ledger tab
  let statChangeOpen = $state(false);

  // Party colour scheme matching the companion HTML
  const PARTY_COLORS: Record<string,string> = {
    Progressive:'#3b6d11', Unionist:'#1f3a5f', Whig:'#854f0b', Conservative:'#7a2222',
  };
  function pc(party: string): string { return PARTY_COLORS[party] ?? '#555'; }

  function billResultColor(result: GmBillHistoryRow['vote_result'] | ActionVoteResultEvent['voteResult']) {
    return result === 'PASSED' || result === 'OVERRIDE_PASSED' ? '#3b6d11' : result === 'VETOED' ? '#854f0b' : '#a32d2d';
  }

  async function saveGMFlags(flags: string[]) {
    const normalized = flags.map(flag => flag.trim()).filter(Boolean);
    const response = await api.gmPut<{ flags: string[] }>(`/api/v1/gm/sessions/${sessionId}/flags`, gmToken, { flags: normalized });
    gmFlags = response.flags;
  }

  async function addGMFlag() {
    if (!newFlagText.trim()) return;
    await saveGMFlags([...gmFlags, newFlagText]);
    newFlagText = '';
  }

  async function clearGMFlags() {
    await saveGMFlags([]);
  }

  function setRosterNotice(kind: 'success' | 'error', text: string) {
    rosterNotice = { kind, text };
    if (typeof window === 'undefined') return;
    if (rosterNoticeTimer) window.clearTimeout(rosterNoticeTimer);
    rosterNoticeTimer = window.setTimeout(() => {
      rosterNotice = null;
      rosterNoticeTimer = null;
    }, 3000);
  }

  // Turn packet / export / import / reset
  let packetOpen  = $state(false);
  let packetText  = $state('');
  let resetArmed  = $state(false);
  async function refreshGmState() {
    await loadData();
    await Promise.all([loadBillQueue(), loadBillHistory(), loadTurnContent()]);
    packetOpen = false;
    billResult = null;
    presResult = null;
    senResult = [];
    spResult = null;
  }

  function buildTurnPacket() {
    const turn = (get(sessionStore).session?.turnIndex ?? 0) + 1;
    const year = get(sessionStore).session?.year ?? 1901;
    let out = `GM COMPANION \u2014 TURN PACKET\nTurn ${turn}, ${year}\n\n`;
    out += `NATIONAL PARTY APPROVAL:\n`;
    for (const p of PARTIES) out += `  ${p}: ${(partyApprovals[p]??0).toFixed(1)}\n`;
    out += `\nREGIONAL APPROVAL (approval \u00d7 modifier):\n`;
    for (const r of REGIONS) out += `  ${r}: ` + PARTIES.map(p=>`${p} ${(regionApproval[r]?.[p]??0).toFixed(1)}`).join(', ') + '\n';
    out += `\nPLAYERS:\n`;
    for (const pl of get(players)) out += `  ${pl.name} \u2014 ${pl.region}, ${pl.party}, Class ${pl.class} \u2014 Approval ${pl.approval}, Recognition ${pl.recognition}, Rizz ${pl.rizz}\n`;
    out += `\nSENATE ROSTER:\n`;
    for (const s of senators) out += `  ${s.region} Class ${s.class}: ${s.player_name ? s.player_name+' (player, '+s.party+')' : 'NPC ('+s.party+')'}\n`;
    out += `\nGenerate this turn now.`;
    packetText = out; packetOpen = !packetOpen;
  }

  async function exportState() {
    const data = await api.gmGet<Record<string, unknown>>(`/api/v1/gm/sessions/${sessionId}/full-state`, gmToken);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    a.download = `lmh-T${($sessionStore.session?.turnIndex??0)+1}-${sessionId.slice(0,8)}.json`;
    a.click();
  }

  async function importState(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    await api.gmPut(`/api/v1/gm/sessions/${sessionId}/full-state`, gmToken, data);
    await refreshGmState();
    (e.target as HTMLInputElement).value = '';
  }

  async function resetSessionState() {
    await api.gmPost(`/api/v1/gm/sessions/${sessionId}/reset`, gmToken, {});
    resetArmed = false;
    await refreshGmState();
  }

  function startNewSession() {
    window.location.href = '/lobby';
  }

  function partyDist(a: string, b: string) { return Math.abs(SPECTRUM[a]-SPECTRUM[b]); }
  function defaultLeanIdx(voter: string, proposer: string): number {
    return [4,3,1,0][partyDist(voter,proposer)] ?? 0;
  }

  const regionApproval = $derived(
    Object.fromEntries(REGIONS.map(r=>[r,
      Object.fromEntries(PARTIES.map(p=>[p,(partyApprovals[p]??0)*(regionalMods[r]?.[p]??1)]))
    ]))
  );
  const regionStandings = $derived(
    Object.fromEntries(REGIONS.map(r=>[r,[...PARTIES].sort((a,b)=>(regionApproval[r]?.[b]??0)-(regionApproval[r]?.[a]??0))]))
  );
  const nationalStandings = $derived([...PARTIES].sort((a,b)=>(partyApprovals[b]??0)-(partyApprovals[a]??0)));

  async function loadData() {
    loading = true;
    try {
      const [st,pa,rm,sen,hist,edRaw,flagResp] = await Promise.all([
        api.get<SessionStateResponse>(`/api/v1/sessions/${sessionId}`),
        api.get<GmPartyApprovalRow[]>(`/api/v1/sessions/${sessionId}/party-approvals`),
        api.get<GmRegionalModifierRow[]>(`/api/v1/sessions/${sessionId}/regional-modifiers`),
        api.get<GmSenatorRow[]>(`/api/v1/sessions/${sessionId}/senators`),
        api.get<GmStatHistoryRow[]>(`/api/v1/sessions/${sessionId}/stat-history`),
        api.get<GmElectionData>(`/api/v1/sessions/${sessionId}/election-data`),
        api.gmGet<{ flags: string[] }>(`/api/v1/gm/sessions/${sessionId}/flags`, gmToken),
      ]);
      setSession(st.session); setPlayers(st.players);
      partyApprovals = Object.fromEntries(pa.map(r => [r.party, r.approval])) as Record<string, number>;
      const rm2: Record<string,Record<string,number>> = {};
      for (const {region,party,modifier} of rm) { (rm2[region]??={})[party]=modifier; }
      regionalMods = rm2;
      senators = sen;
      statHistory = hist;
      ed = edRaw;
      gmFlags = flagResp.flags;
      if (ed?.nextSenateClass) senClassPick = ed.nextSenateClass;
    } finally { loading = false; }
  }

  async function savePlayerEdits(playerId: string, patch: Partial<Pick<PlayerState, 'party' | 'region' | 'class' | 'approval' | 'recognition' | 'rizz'>>) {
    savingPlayerId = playerId;
    rosterNotice = null;
    try {
      const player = get(players).find(p => p.id === playerId);
      const response = await api.gmPost<GmPlayerUpdateResponse>(`/api/v1/gm/sessions/${sessionId}/players/${playerId}`, gmToken, patch);
      if (response.players) setPlayers(response.players);
      if (response.senators) senators = response.senators;
      setRosterNotice('success', `Saved ${player?.name ?? 'player'} updates.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save player changes.';
      setRosterNotice('error', message);
    } finally {
      savingPlayerId = null;
    }
  }

  onMount(async () => {
    gmToken = localStorage.getItem(`lmh:gm:${sessionId}`) ?? '';
    await refreshGmState();
    gmSocket.on('stat_delta', () => {
      api.get<GmPartyApprovalRow[]>(`/api/v1/sessions/${sessionId}/party-approvals`).then(pa => { partyApprovals = Object.fromEntries(pa.map(r => [r.party, r.approval])) as Record<string, number>; });
      api.get<GmStatHistoryRow[]>(`/api/v1/sessions/${sessionId}/stat-history`).then(h => { statHistory = h; });
    });
    if (gmToken) {
      const saved = await api.gmGet<Array<Parameters<typeof addPlayerAction>[0]>>(`/api/v1/gm/sessions/${sessionId}/actions`, gmToken).catch(() => []);
      for (const a of saved) addPlayerAction(a);
    }
    gmSocket.emit('join_session', { sessionId, playerId: 'gm', gmToken });
    gmSocket.on('action_vote_progress', (e: GmVoteProgressEvent) => {
      voteProgress = { ...voteProgress, [e.actionId]: e };
    });
    gmSocket.on('bill_queued', () => { loadBillQueue(); });
    gmSocket.on('bill_queue_updated', () => { loadBillQueue(); });
    // Refresh bill history after each vote closes
    gmSocket.on('action_vote_result', (e) => { latestVoteResult = e; loadBillHistory(); loadBillQueue(); });
    // Initialise per-vote lean table when a vote opens
    gmSocket.on('legislative_vote_requested', e => {
      getVoteLean(e.actionId, e.party);
    });
  });

  async function savePartyApproval(party: string, raw: string) {
    const val = parseFloat(raw); if(isNaN(val)) return;
    partyApprovals = {...partyApprovals,[party]:val};
    await api.gmPost(`/api/v1/gm/sessions/${sessionId}/party-approvals`,gmToken,{[party]:val});
  }
  async function saveRegionalModifier(region: string, party: string, raw: string) {
    const val = parseFloat(raw); if(isNaN(val)) return;
    regionalMods = {...regionalMods,[region]:{...(regionalMods[region]??{}),[party]:val}};
    await api.gmPost(`/api/v1/gm/sessions/${sessionId}/regional-modifiers`,gmToken,{[region]:{[party]:val}});
  }

  $effect(() => {
    const lean: Record<string,number> = {};
    for (const p of PARTIES) lean[p] = defaultLeanIdx(p,billProposer);
    billLean = lean;
    billRizzBoost = {};
  });

  async function loadBillQueue() {
    billQueue = await api.get<GmBillQueueRow[]>(`/api/v1/sessions/${sessionId}/bill-queue`).catch(() => []);
  }

  async function loadBillHistory() {
    billHistory = await api.get<GmBillHistoryRow[]>(`/api/v1/sessions/${sessionId}/bill-history`).catch(() => []);
  }

  async function addBillToQueue() {
    if (!billTitle.trim()) return;
    await api.gmPost(`/api/v1/gm/sessions/${sessionId}/bill-queue`, gmToken, {
      title: billTitle.trim(), content: billDesc.trim() || billTitle.trim(),
      proposingParty: billProposer, isAmendment: billType === 'amendment',
    });
    billTitle = ''; billDesc = '';
    await loadBillQueue();
  }

  /** Returns (initialising if needed) the lean map for a specific vote. */
  function getVoteLean(actionId: string, proposerParty: string): Record<string, {leanIdx:number;rizzBoosted:boolean}> {
    if (!voteLeans[actionId]) {
      const init: Record<string, {leanIdx:number;rizzBoosted:boolean}> = {};
      for (const p of PARTIES) init[p] = { leanIdx: defaultLeanIdx(p, proposerParty), rizzBoosted: false };
      const presParty = ed?.presidentParty ?? 'Progressive';
      init['__president__'] = { leanIdx: defaultLeanIdx(presParty, proposerParty), rizzBoosted: false };
      voteLeans = { ...voteLeans, [actionId]: init };
    }
    return voteLeans[actionId];
  }

  function setVoteLean(actionId: string, key: string, leanIdx: number) {
    voteLeans = { ...voteLeans, [actionId]: { ...voteLeans[actionId], [key]: { ...voteLeans[actionId]?.[key], leanIdx } } };
  }
  function toggleVoteRizz(actionId: string, key: string) {
    const cur = voteLeans[actionId]?.[key];
    if (!cur) return;
    voteLeans = { ...voteLeans, [actionId]: { ...voteLeans[actionId], [key]: { ...cur, rizzBoosted: !cur.rizzBoosted } } };
  }

  function closeVoteWithLeans(actionId: string) {
    gmSocket.emit('gm_close_action_vote', { sessionId, actionId, leanOverrides: voteLeans[actionId] });
    const rest = { ...voteLeans };
    delete rest[actionId];
    voteLeans = rest;
  }

  async function loadTurnContent() {
    turnContent = await api.get<GmTurnContentRow[]>(`/api/v1/sessions/${sessionId}/turn-content`).catch(() => []);
  }

  async function addTurnContentItem() {
    if (!tcContent.trim()) return;
    if (tcType==='NPC_BILL' && tcNpcBillCount>=3) return;
    if (tcType==='COURT'    && tcCourtCount>=1)   return;
    if (tcType==='EVENT'    && tcEventCount>=3)   return;
    if (tcType==='AP_HEADLINE'   && tcApCount>=1)   return;
    if (tcType==='AMST_HEADLINE' && tcAmStCount>=1) return;
    if (tcType==='NPC_BILL' && !tcTitle.trim()) return;
    const payload: GmTurnContentPayload = {
      type: tcType,
      content: tcContent.trim(),
      party: tcType==='NPC_BILL' ? tcParty : null,
      title: tcType==='NPC_BILL' ? tcTitle.trim() : null,
    };
    if (tcTriggerWt !== null)    payload.triggerWeight  = tcTriggerWt;
    if (tcShowWeights)           payload.directionBias  = tcDirBias;
    if (tcStatHint.trim())       payload.statHint       = tcStatHint.trim();
    if (tcTargetHint.trim())     payload.targetHint     = tcTargetHint.trim();
    await api.gmPost(`/api/v1/gm/sessions/${sessionId}/turn-content`, gmToken, payload);
    tcContent = ''; tcTitle = '';
    await loadTurnContent();
  }

  async function removeTurnContentItem(id: string) {
    await api.gmDelete(`/api/v1/gm/sessions/${sessionId}/turn-content/${id}`, gmToken);
    turnContent = turnContent.filter(t => t.id !== id);
  }

  async function removeBillFromQueue(billId: string) {
    await api.gmDelete(`/api/v1/gm/sessions/${sessionId}/bill-queue/${billId}`, gmToken);
    billQueue = billQueue.filter(b => b.id !== billId);
  }

  function startVoteOnBill(bill: GmBillQueueRow) {
    // Pre-fill the lean table from the bill's proposing party
    billProposer = bill.proposing_party;
    billTitle    = bill.title || bill.content;
    billType     = bill.is_amendment ? 'amendment' : 'bill';
    // Start the vote via socket
    gmSocket.emit('gm_start_bill_vote', { sessionId, billId: bill.id });
    // Remove from local queue display
    billQueue = billQueue.filter(b => b.id !== bill.id);
  }

  function rollBillVotes() {
    let yea=0, nay=0;
    const seatResults: GmBillVoteSeatResult[] = [];
    const regionTally: Record<string,{yea:number;nay:number}> = {};
    for (const s of senators) {
      if (s.is_player) { seatResults.push({...s,vote:'PLAYER'}); continue; }
      const leanIdx = billLean[s.party] ?? defaultLeanIdx(s.party,billProposer);
      // Rizz boost: bumps one notch toward "for" (index +1), capped at index 4 (strongly for = 90%)
      const boostedIdx = billRizzBoost[s.party] ? Math.min(4, leanIdx + 1) : leanIdx;
      const prob = LEAN_CATS[boostedIdx].prob;
      const vote = Math.random() < prob ? 'YEA' : 'NAY';
      seatResults.push({...s,vote});
      if(vote==='YEA') yea++; else nay++;
      const r=(regionTally[s.region]??={yea:0,nay:0});
      if(vote==='YEA') r.yea++; else r.nay++;
    }
    const cast=yea+nay, yeaShare=cast?yea/cast:0;
    const threshold=billType==='amendment'?0.75:0.5;
    const senatePasses=yeaShare>threshold;
    const regionsMaj=Object.values(regionTally).filter(r=>r.yea>r.nay).length;
    const regionsOK=billType==='amendment'?regionsMaj>=4:true;
    // President uses their own party's distance from the proposer, per the rules
    const presParty = ed?.presidentParty ?? 'Progressive';
    const presDefaultIdx = defaultLeanIdx(presParty, billProposer);
    const presOverrideIdx = billLean['__president__'] ?? presDefaultIdx;
    const presBoostedIdx = billRizzBoost['__president__'] ? Math.min(4, presOverrideIdx + 1) : presOverrideIdx;
    const presSigns=(senatePasses&&regionsOK)?Math.random()<LEAN_CATS[presBoostedIdx].prob:false;
    const passes=senatePasses&&regionsOK&&(billType==='amendment'||presSigns);
    billResult={yea,nay,yeaShare,senatePasses,regionsOK,regionsMaj,presSigns,passes,seatResults,regionTally};
  }
</script>

<div style="background:#faf7f0; border-bottom:2px solid #232019; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
  <div>
    <h1 style="font-family:Georgia,serif; font-size:20px; margin:0;">Let's Make History</h1>
    <div style="font-size:11px; color:#7a7362; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
      GM Companion &mdash; <span style="font-family:monospace; text-transform:none; letter-spacing:0;">{sessionId}</span>
      <button
        onclick={() => navigator.clipboard.writeText(getSharePlayerLink())}
        title="Copy player join link"
        style="font-size:10px; background:#3b6d11; color:#fff; border:none; border-radius:3px; padding:2px 7px; cursor:pointer; text-transform:none; letter-spacing:0; line-height:1.6;">Copy Player Link</button>
    </div>
  </div>
  <div style="display:flex; gap:18px; font-size:13px; flex-wrap:wrap; align-items:center;">
    <span>Turn <strong>{($sessionStore.session?.turnIndex??0)+1}</strong></span>
    <span>Year <strong>{$sessionStore.session?.year??1901}</strong></span>
    <span style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#7a7362;">Phase</span>
    <strong style="color:#7a2222;">{$phase}</strong>
    {#each nationalStandings as p (p)}
      <span style="color:{pc(p)}; font-weight:600;">{p} {(partyApprovals[p]??0).toFixed(1)}</span>
    {/each}
    <button
      onclick={() => socket.emit('gm_advance_phase',{sessionId})}
      style="padding:6px 14px; background:#7a2222; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit; white-space:nowrap;">
      Advance Phase &rarr;
    </button>
  </div>
</div>

<!-- Top actions bar -->
<div style="display:flex; gap:8px; padding:8px 20px; background:#f1ecdf; border-bottom:1px solid #d8d0b8; flex-wrap:wrap; align-items:center;">
  <button onclick={buildTurnPacket}
    style="padding:6px 12px; background:#1f3a5f; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:600; font-family:inherit;">
    {packetOpen ? 'Hide Turn Packet' : 'Generate Turn Packet \u2197'}
  </button>
  <button onclick={exportState}
    style="padding:6px 12px; background:#faf7f0; border:1px solid #232019; border-radius:4px; cursor:pointer; font-size:13px; font-weight:600; font-family:inherit;">
    Export State (JSON)
  </button>
  <label style="padding:6px 12px; background:#faf7f0; border:1px solid #232019; border-radius:4px; cursor:pointer; font-size:13px; font-weight:600; display:inline-block; margin:0;">
    Import State (JSON)
    <input type="file" accept="application/json" onchange={importState} style="display:none;" />
  </label>
  <button
    onclick={() => { if(!resetArmed){resetArmed=true;setTimeout(()=>resetArmed=false,3000);} else { resetSessionState(); } }}
    style="padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px; font-weight:600; font-family:inherit;
           background:{resetArmed?'#a32d2d':'#faf7f0'}; color:{resetArmed?'#fff':'#a32d2d'}; border:1px solid #a32d2d;">
    {resetArmed ? 'Click again to confirm' : 'Reset to Game Start'}
  </button>
  <button onclick={startNewSession}
    style="padding:6px 12px; background:#faf7f0; border:1px solid #232019; border-radius:4px; cursor:pointer; font-size:13px; font-weight:600; font-family:inherit;">
    New Session
  </button>
  {#if $pendingActionVotes.length > 0}
    <span style="font-size:12px; color:#854f0b; font-weight:700;">
      &#9888; {$pendingActionVotes.length} open vote{$pendingActionVotes.length>1?'s':''}
    </span>
  {/if}
  <span style="font-size:12px;color:#7a7362;margin-left:4px;">Visibility:</span>
  {#each [['ownRolls','Own rolls'],['allRolls','All rolls'],['npcVoteRolls','NPC votes']] as [field, label] (field)}
    <label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:3px;">
      <input type="checkbox" checked={$visibilitySettings[field as keyof typeof $visibilitySettings]}
        onchange={() => {
          const upd = { ...$visibilitySettings, [field]: !$visibilitySettings[field as keyof typeof $visibilitySettings] };
          setVisibility(upd);
          socket.emit('gm_set_visibility', { sessionId, settings: upd });
        }} />
      {label}
    </label>
  {/each}
</div>

<!-- Turn packet output -->
{#if packetOpen}
  <div style="padding:10px 20px; background:#f1ecdf; border-bottom:1px solid #d8d0b8;">
    <div style="display:flex;justify-content:flex-start;margin-bottom:6px;">
      <button
        onclick={() => navigator.clipboard.writeText(packetText)}
        style="font-size:11px;background:#1f3a5f;color:#fff;border:none;border-radius:3px;padding:3px 10px;cursor:pointer;font-family:inherit;">
        Copy to Clipboard
      </button>
    </div>
    <pre style="background:#e8e1cc; border:1px solid #b8ae8e; border-radius:4px; padding:10px; font-size:12px; white-space:pre-wrap; max-height:260px; overflow:auto; margin:0;">{packetText}</pre>
  </div>
{/if}

<!-- Stat roll previews are shown above the tabs so the GM sees them regardless of which tab is active -->
{#if $pendingStatRolls.length > 0}
  <div style="padding:10px 20px; background:#fff8f0; border-bottom:2px solid #854f0b;">
    <StatRollPreview {sessionId} />
  </div>
{/if}

<nav style="display:flex; gap:2px; padding:0 20px; background:#f1ecdf; border-bottom:2px solid #232019; flex-wrap:wrap;">
  {#each (['dashboard','actions','parties','roster','bills','elections','ledger'] as Tab[]) as tab (tab)}
    <button onclick={() => activeTab=tab}
      style="padding:10px 14px; background:none; border:none; cursor:pointer; font-size:13px; font-weight:600;
             color:{activeTab===tab?'#232019':'#7a7362'}; border-bottom:{activeTab===tab?'3px solid #7a2222':'3px solid transparent'};
             font-family:inherit;">
      {tab.charAt(0).toUpperCase()+tab.slice(1)}{#if tab==='actions'&&($pendingActions.length>0||$pendingStatRolls.length>0)}&nbsp;<span style="background:#a32d2d;color:#fff;border-radius:8px;padding:0 5px;font-size:10px;">{$pendingActions.length+$pendingStatRolls.length}</span>{/if}{#if tab==='bills'&&($pendingActionVotes.length>0||billQueue.length>0)}&nbsp;<span style="background:#854f0b;color:#fff;border-radius:8px;padding:0 5px;font-size:10px;">{$pendingActionVotes.length+billQueue.length}</span>{/if}{#if tab==='elections'&&gmElectionAlerts().length>0}&nbsp;<span style="background:#7a2222;color:#fff;border-radius:8px;padding:0 5px;font-size:10px;">⚑{gmElectionAlerts().length}</span>{/if}
    </button>
  {/each}
</nav>

<div style="padding:16px 20px 60px; max-width:1100px; margin:0 auto;">
{#if loading}
  <p style="color:#7a7362;font-style:italic;">Loading&hellip;</p>
{:else}

{#if activeTab==='dashboard'}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
    <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">National Party Approval</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr>{#each PARTIES as p (p)}<th style="text-align:left;padding:4px 6px;font-size:11px;color:{pc(p)};text-transform:uppercase;font-weight:700;">{p}</th>{/each}</tr></thead>
        <tbody><tr>{#each PARTIES as p (p)}<td style="padding:4px 6px;font-weight:700;font-size:18px;">{(partyApprovals[p]??0).toFixed(1)}</td>{/each}</tr></tbody>
      </table>
    </div>
    <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">Region Standings</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr><th style="text-align:left;padding:3px 4px;font-size:10px;color:#7a7362;background:#e8e1cc;">Region</th>{#each [1,2,3,4] as n (n)}<th style="padding:3px 4px;font-size:10px;color:#7a7362;background:#e8e1cc;">{n}</th>{/each}</tr></thead>
        <tbody>
        {#each REGIONS as r (r)}
          {@const abbrev = (p: string) => p === 'Progressive' ? 'Prog' : p === 'Unionist' ? 'Union' : p === 'Conservative' ? 'Cons' : p}
          <tr><td style="padding:3px 4px;font-weight:600;white-space:nowrap;">{r}</td>{#each regionStandings[r] as p (p)}<td style="padding:3px 4px;color:{pc(p)};font-weight:600;white-space:nowrap;">{abbrev(p)} <span style="color:#888;font-weight:400;">({(regionApproval[r]?.[p]??0).toFixed(1)})</span></td>{/each}</tr>
        {/each}
        </tbody>
      </table>
    </div>
  </div>
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0;">Flags for the GM</h2>
      <button onclick={clearGMFlags} disabled={gmFlags.length===0}
        style="padding:4px 10px;background:#faf7f0;border:1px solid #a32d2d;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;color:#a32d2d;opacity:{gmFlags.length===0?'.5':'1'};">
        Clear Manual Flags
      </button>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;">
      <div style="flex:1;min-width:240px;">
        <label for="gm-flag-input" style="font-size:12px;color:#7a7362;display:block;margin-bottom:3px;">Add manual flag</label>
        <input id="gm-flag-input" type="text" bind:value={newFlagText} placeholder="Reminder or follow-up for the GM"
          onkeydown={(e) => { if (e.key === 'Enter') addGMFlag(); }}
          style="width:100%;font-size:13px;padding:5px 8px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;" />
      </div>
      <button onclick={addGMFlag} disabled={!newFlagText.trim()}
        style="padding:7px 14px;background:#1f3a5f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;opacity:{newFlagText.trim()?'1':'.5'};">
        Add Flag
      </button>
    </div>
    {#if dashboardFlags.length === 0}
      <p style="color:#7a7362;font-style:italic;font-size:13px;">No open flags.</p>
    {:else}
      <div style="display:grid;gap:8px;">
        {#each gmElectionAlerts() as flag (flag)}
          <div style="background:#fff8f0;border-left:3px solid #854f0b;border-radius:4px;padding:8px 10px;font-size:13px;display:flex;justify-content:space-between;gap:12px;align-items:center;">
            <span>{flag}</span>
            <span style="font-size:10px;color:#854f0b;font-weight:700;text-transform:uppercase;">Auto</span>
          </div>
        {/each}
        {#each gmFlags as flag, idx (`${idx}-${flag}`)}
          <div style="background:#faf7f0;border-left:3px solid #7a2222;border-radius:4px;padding:8px 10px;font-size:13px;display:flex;justify-content:space-between;gap:12px;align-items:center;">
            <span>{flag}</span>
            <span style="font-size:10px;color:#7a2222;font-weight:700;text-transform:uppercase;">Manual</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;margin-top:14px;">
    <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">National Status</h2>
    <NationalStatusEditor {sessionId} />
  </div>
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
    <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">Recent Stat Changes</h2>
    {#if statHistory.length===0}<p style="color:#7a7362;font-style:italic;font-size:13px;">None yet.</p>
    {:else}
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>{#each ['Stat','Target','Delta','Reason'] as h (h)}<th style="text-align:left;padding:4px 6px;font-size:11px;color:#7a7362;text-transform:uppercase;background:#e8e1cc;">{h}</th>{/each}</tr></thead>
        <tbody>
        {#each statHistory.slice(0,20) as h (h.stat)}
          <tr><td style="padding:4px 6px;">{h.stat}</td><td style="padding:4px 6px;">{h.target}</td><td style="padding:4px 6px;font-weight:700;color:{h.delta>0?'#3b6d11':'#a32d2d'};">{h.delta>0?'+':''}{h.delta}</td><td style="padding:4px 6px;color:#555;">{h.reason}</td></tr>
        {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- Turn content queue -->
  <div style="background:#f1ecdf;border:1px solid {tcReady?'#3b6d11':'#854f0b'};border-radius:6px;padding:14px;margin-top:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0;">
        Next Turn Content Queue
        {#if tcReady}
          <span style="background:#3b6d11;color:#fff;font-size:10px;padding:2px 7px;border-radius:3px;margin-left:8px;">READY</span>
        {:else}
          <span style="background:#854f0b;color:#fff;font-size:10px;padding:2px 7px;border-radius:3px;margin-left:8px;">
            {tcEventCount}/3 events · {tcCourtCount}/1 SC · {tcNpcBillCount}/3 NPC bills · {tcApCount}/1 AP · {tcAmStCount}/1 AmStd
          </span>
        {/if}
      </h2>
      <button onclick={loadTurnContent} style="font-size:11px;background:#2d2818;border:1px solid #5a4a2a;color:#c8a86a;padding:3px 8px;border-radius:3px;cursor:pointer;font-family:inherit;">Refresh</button>
    </div>
    <p style="font-size:12px;color:#7a7362;margin:0 0 10px;">Queue 3 events, 1 SC decision, 3 NPC bills, and 2 headlines before advancing past Turn Complete.</p>

    <!-- Add item form -->
    <div style="display:grid;gap:8px;margin-bottom:10px;">
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
        <div>
          <label for="turn-content-type" style="font-size:11px;color:#7a7362;">Type</label>
          <select id="turn-content-type" bind:value={tcType} style="font-size:12px;padding:4px 6px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;display:block;margin-top:2px;">
            <option value="EVENT">Event {tcEventCount}/3</option>
            <option value="COURT">SC Decision {tcCourtCount}/1</option>
            <option value="NPC_BILL">NPC Bill {tcNpcBillCount}/3</option>
            <option value="AP_HEADLINE">AP Headline {tcApCount}/1</option>
            <option value="AMST_HEADLINE">American Standard Headline {tcAmStCount}/1</option>
          </select>
        </div>
        {#if tcType === 'NPC_BILL'}
          <div>
            <label for="turn-content-party" style="font-size:11px;color:#7a7362;">Party</label>
            <select id="turn-content-party" bind:value={tcParty} style="font-size:12px;padding:4px 6px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;display:block;margin-top:2px;">
              {#each PARTIES as p (p)}<option value={p}>{p}</option>{/each}
            </select>
          </div>
          <div style="min-width:150px;">
            <label for="turn-content-title" style="font-size:11px;color:#7a7362;">Bill Title <span style="color:#7a2222;">*</span></label>
            <input id="turn-content-title" bind:value={tcTitle} placeholder="Short title…"
              style="width:100%;font-size:12px;padding:4px 6px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;display:block;margin-top:2px;" />
          </div>
        {/if}
        <div style="flex:1;min-width:200px;">
          <label for="turn-content-body" style="font-size:11px;color:#7a7362;">
            {tcType==='AP_HEADLINE'?'AP Headline text':tcType==='AMST_HEADLINE'?'American Standard headline text':tcType==='NPC_BILL'?'Bill description':'Narrative content'}
          </label>
          <input id="turn-content-body" bind:value={tcContent}
            placeholder={tcType==='NPC_BILL'?'Brief description of the bill…':'Narrative content…'}
            style="width:100%;font-size:12px;padding:4px 6px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;display:block;margin-top:2px;" />
        </div>
        <button onclick={addTurnContentItem}
          disabled={!tcContent.trim() || (tcType==='NPC_BILL'&&!tcTitle.trim()) || (tcType==='EVENT'&&tcEventCount>=3) || (tcType==='COURT'&&tcCourtCount>=1) || (tcType==='NPC_BILL'&&tcNpcBillCount>=3) || (tcType==='AP_HEADLINE'&&tcApCount>=1) || (tcType==='AMST_HEADLINE'&&tcAmStCount>=1)}
          style="padding:5px 12px;background:#1f3a5f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;white-space:nowrap;opacity:{!tcContent.trim()?'.5':'1'};">
          + Add
        </button>
      </div>

      <!-- Roll weights (only for EVENT, COURT, NPC_BILL) -->
      {#if tcType==='EVENT' || tcType==='COURT' || tcType==='NPC_BILL'}
        <div>
          <button onclick={() => tcShowWeights=!tcShowWeights}
            style="font-size:11px;color:#1f3a5f;background:none;border:none;cursor:pointer;padding:0;font-family:inherit;">
            {tcShowWeights?'▲':'▼'} Roll Weights (optional)
          </button>
          {#if tcShowWeights}
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px;padding:8px;background:#e8e1cc;border-radius:4px;">
              <div>
                <label for="turn-content-trigger" style="font-size:10px;color:#7a7362;">Trigger % override</label>
                <input type="number" min="0" max="100" step="5"
                  id="turn-content-trigger"
                  placeholder={tcType==='COURT'?'default 20%':'default 30%'}
                  value={tcTriggerWt !== null ? Math.round(tcTriggerWt*100) : ''}
                  onchange={(e)=>{ const v=parseFloat((e.target as HTMLInputElement).value); tcTriggerWt=isNaN(v)?null:v/100; }}
                  style="width:100%;font-size:11px;padding:3px 5px;border:1px solid #b8ae8e;border-radius:3px;background:#faf7f0;margin-top:2px;" />
              </div>
              <div>
                <label for="turn-content-direction" style="font-size:10px;color:#7a7362;">Direction (positive chance)</label>
                <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
                  <input id="turn-content-direction" type="range" min="0" max="1" step="0.05" bind:value={tcDirBias}
                    style="flex:1;" />
                  <span style="font-size:11px;color:#232019;font-weight:600;min-width:36px;text-align:right;">{Math.round(tcDirBias*100)}%</span>
                </div>
                {#if tcDirBias < 0.45}
                  <div style="font-size:10px;color:#7a2222;margin-top:2px;">Biased negative</div>
                {:else if tcDirBias > 0.55}
                  <div style="font-size:10px;color:#3b6d11;margin-top:2px;">Biased positive</div>
                {:else}
                  <div style="font-size:10px;color:#7a7362;margin-top:2px;">~50/50</div>
                {/if}
              </div>
              <div>
                <label for="turn-content-stathint" style="font-size:10px;color:#7a7362;">Stat hint</label>
                <select id="turn-content-stathint" bind:value={tcStatHint} style="width:100%;font-size:11px;padding:3px 5px;border:1px solid #b8ae8e;border-radius:3px;background:#faf7f0;margin-top:2px;">
                  <option value="">No hint</option>
                  {#each STAT_NAMES as s (s)}<option value={s}>{s}</option>{/each}
                </select>
              </div>
              <div>
                <label for="turn-content-targethint" style="font-size:10px;color:#7a7362;">Target hint</label>
                <input id="turn-content-targethint" bind:value={tcTargetHint} placeholder="Player / Party / Region…"
                  style="width:100%;font-size:11px;padding:3px 5px;border:1px solid #b8ae8e;border-radius:3px;background:#faf7f0;margin-top:2px;" />
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Current queue -->
    {#if turnContent.length > 0}
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>
          <th style="text-align:left;padding:3px 5px;background:#e8e1cc;font-size:10px;">Type</th>
          <th style="text-align:left;padding:3px 5px;background:#e8e1cc;font-size:10px;">Party/Title</th>
          <th style="text-align:left;padding:3px 5px;background:#e8e1cc;font-size:10px;">Content</th>
          <th style="text-align:left;padding:3px 5px;background:#e8e1cc;font-size:10px;">Weights</th>
          <th style="padding:3px 5px;background:#e8e1cc;"></th>
        </tr></thead>
        <tbody>
        {#each turnContent as tc (tc.id)}
          <tr style="border-bottom:1px solid #e0d8c0;">
            <td style="padding:3px 5px;font-weight:600;color:{tc.type==='EVENT'?'#1f3a5f':tc.type==='COURT'?'#5a3a7a':tc.type==='NPC_BILL'?'#854f0b':'#3b6d11'};">
              {tc.type==='AP_HEADLINE'?'AP':tc.type==='AMST_HEADLINE'?'AmStd':tc.type}
            </td>
            <td style="padding:3px 5px;color:{pc(tc.party??'')};">{tc.title ? `${tc.title}` : (tc.party ?? '—')}</td>
            <td style="padding:3px 5px;">{tc.content}</td>
            <td style="padding:3px 5px;font-size:10px;color:#7a7362;">
              {#if tc.trigger_weight !== null}trig:{Math.round((tc.trigger_weight??0)*100)}%{/if}
              {#if tc.direction_bias !== null && tc.direction_bias !== undefined} {Math.round(tc.direction_bias*100)}%+{/if}
              {#if tc.stat_hint} {tc.stat_hint}{/if}
              {#if tc.target_hint} → {tc.target_hint}{/if}
            </td>
            <td style="padding:3px 5px;"><button onclick={() => removeTurnContentItem(tc.id)} style="font-size:10px;background:#7a2222;color:#fff;border:none;border-radius:2px;padding:2px 6px;cursor:pointer;">✕</button></td>
          </tr>
        {/each}
        </tbody>
      </table>
    {:else}
      <p style="color:#7a7362;font-style:italic;font-size:12px;margin:0;">Queue is empty.</p>
    {/if}
  </div>

{:else if activeTab==='actions'}
  <ActionQueue {sessionId} />
  <div style="margin-top:16px;">
    <GameHistoryPanel {sessionId} />
  </div>

{:else if activeTab==='parties'}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
    <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">National Party Approval</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr><th style="text-align:left;padding:4px 6px;font-size:11px;color:#7a7362;background:#e8e1cc;">Party</th><th style="text-align:left;padding:4px 6px;font-size:11px;color:#7a7362;background:#e8e1cc;">Approval (0–100)</th></tr></thead>
        <tbody>
        {#each PARTIES as p (p)}
          <tr><td style="padding:4px 6px;font-weight:700;color:{pc(p)};">{p}</td><td style="padding:4px 6px;"><input type="number" step="0.5" min="0" max="100" value={(partyApprovals[p]??0).toFixed(1)} onchange={(e)=>savePartyApproval(p,(e.target as HTMLInputElement).value)} style="width:80px;font-size:13px;padding:3px 6px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;" /></td></tr>
        {/each}
        </tbody>
      </table>
    </div>
    <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">Weighted Regional Approval</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr><th style="padding:3px 5px;background:#e8e1cc;font-size:11px;text-align:left;">Region</th>{#each PARTIES as p (p)}<th style="padding:3px 5px;background:#e8e1cc;font-size:11px;">{p}</th>{/each}</tr></thead>
        <tbody>{#each REGIONS as r (r)}<tr><td style="padding:3px 5px;font-weight:600;">{r}</td>{#each PARTIES as p (p)}<td style="padding:3px 5px;text-align:center;">{(regionApproval[r]?.[p]??0).toFixed(2)}</td>{/each}</tr>{/each}</tbody>
      </table>
    </div>
  </div>
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
    <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">Regional Modifiers</h2>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr><th style="text-align:left;padding:4px 6px;background:#e8e1cc;font-size:11px;">Region</th>{#each PARTIES as p (p)}<th style="padding:4px 6px;background:#e8e1cc;font-size:11px;">{p}</th>{/each}</tr></thead>
      <tbody>
      {#each REGIONS as r (r)}
        <tr><td style="padding:4px 6px;font-weight:600;">{r}</td>{#each PARTIES as p (p)}<td style="padding:4px 6px;text-align:center;"><input type="number" step="0.05" min="0" value={(regionalMods[r]?.[p]??1).toFixed(2)} onchange={(e)=>saveRegionalModifier(r,p,(e.target as HTMLInputElement).value)} style="width:65px;font-size:12px;padding:2px 4px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;text-align:center;" /></td>{/each}</tr>
      {/each}
      </tbody>
    </table>
  </div>

{:else if activeTab==='roster'}
  {#if rosterNotice}
    <div style="margin-bottom:10px;padding:10px 12px;border-radius:6px;border:1px solid {rosterNotice.kind==='success' ? '#3b6d11' : '#a32d2d'};background:{rosterNotice.kind==='success' ? '#eef6df' : '#fbe8e8'};color:{rosterNotice.kind==='success' ? '#2f5b0b' : '#8a1f1f'};font-size:13px;font-weight:600;">
      {rosterNotice.text}
    </div>
  {/if}
  <div style="margin-bottom:14px;"><PlayerStatsTable editable={true} {savingPlayerId} onSavePlayer={savePlayerEdits} /></div>
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0;">Senate Roster</h2>
      {#if syncArmed}
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="font-size:12px;color:#7a2222;font-style:italic;">This will set every NPC seat's party from current standings (Class 1 &amp; 3 → top party, Class 2 → second). Cannot be undone.</span>
          <button
            onclick={async () => { syncArmed = false; await syncNpcSeats(); }}
            style="padding:5px 12px;background:#7a2222;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;">
            Confirm Sync
          </button>
          <button
            onclick={() => syncArmed = false}
            style="padding:5px 10px;background:none;border:1px solid #b8ae8e;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;">
            Cancel
          </button>
        </div>
      {:else}
        <button
          onclick={() => syncArmed = true}
          style="padding:5px 12px;background:#3d2e10;color:#e8d8a0;border:1px solid #7a6030;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;">
          Sync NPC Seats to Current Standings&hellip;
        </button>
      {/if}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>{#each ['Region','Class','Party','Occupant',''] as h (h)}<th style="text-align:left;padding:4px 8px;font-size:11px;text-transform:uppercase;color:#7a7362;background:#e8e1cc;">{h}</th>{/each}</tr></thead>
      <tbody>
      {#each senators as s (s.id)}
        <tr>
          <td style="padding:4px 8px;">{s.region}</td>
          <td style="padding:4px 8px;text-align:center;">{s.class}</td>
          <td style="padding:4px 8px;font-weight:600;color:{pc(s.party)};">{s.party}</td>
          <td style="padding:4px 8px;color:{s.is_player?'#1f3a5f':'#7a7362'};"><strong>{s.player_name?s.player_name+' (player)':'NPC'}</strong></td>
          <td style="padding:4px 8px;">
            {#if s.is_player && s.player_id}
              <button
                onclick={async () => {
                  if (!confirm(`Remove ${s.player_name} from the game? Their seat returns to NPC.`)) return;
                  await api.gmDelete(`/api/v1/gm/sessions/${sessionId}/players/${s.player_id}`, gmToken);
                  senators = await api.get<GmSenatorRow[]>(`/api/v1/sessions/${sessionId}/senators`);
                }}
                style="font-size:11px;background:#7a2222;color:#fff;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;font-family:inherit;">
                Remove
              </button>
            {/if}
          </td>
        </tr>
      {/each}
      </tbody>
    </table>
  </div>

{:else if activeTab==='bills'}

  <!-- ── Open Votes (each has its own lean table) ── -->
  {#each $pendingActionVotes as v (v.actionId)}
    {@const prog = voteProgress[v.actionId]}
    {@const vl = getVoteLean(v.actionId, v.party)}
    <div style="border:2px solid #854f0b;border-radius:6px;padding:14px;background:#fffbf2;margin-bottom:14px;font-family:Georgia,serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div>
          <span style="font-size:14px;color:#854f0b;font-weight:700;">&#9888; Open Vote:</span>
          <span style="font-size:13px;margin-left:6px;"><strong>{v.playerName}</strong> ({v.party}) &mdash; &ldquo;{v.content}&rdquo;</span>
          {#if prog}
            <span style="font-size:11px;color:{prog.allVoted?'#3b6d11':'#854f0b'};font-weight:600;margin-left:10px;">
              {prog.votedCount}/{prog.totalPlayers} players voted{prog.allVoted?' — all in!':''}
            </span>
          {/if}
          <!-- live player votes -->
          {#if Object.keys(v.playerVotes).length > 0}
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
              {#each Object.entries(v.playerVotes) as [pname, pv] (pname)}
                <span style="font-size:10px;background:{pv==='YEA'?'#1e3d1a':'#3d1a1a'};color:{pv==='YEA'?'#7de87d':'#e87d7d'};padding:1px 6px;border-radius:3px;">{pname}: {pv}</span>
              {/each}
            </div>
          {/if}
        </div>
        <button onclick={() => closeVoteWithLeans(v.actionId)}
          style="padding:7px 14px;background:#7a2222;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;white-space:nowrap;">
          Resolve Vote
        </button>
      </div>
      <!-- Per-vote lean table -->
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr>
          <th style="text-align:left;padding:3px 5px;background:#efe5cc;font-size:10px;">Party / President</th>
          <th style="padding:3px 5px;background:#efe5cc;font-size:10px;">Default</th>
          <th style="padding:3px 5px;background:#efe5cc;font-size:10px;">Override</th>
          <th style="padding:3px 5px;background:#efe5cc;font-size:10px;">Rizz</th>
        </tr></thead>
        <tbody>
        {#each PARTIES as p (p)}
          {@const def = defaultLeanIdx(p, v.party)}
          {@const cur = vl[p] ?? {leanIdx: def, rizzBoosted: false}}
          <tr>
            <td style="padding:3px 5px;font-weight:700;color:{pc(p)};">{p}</td>
            <td style="padding:3px 5px;color:#7a7362;font-size:10px;">{LEAN_CATS[def].label}</td>
            <td style="padding:3px 5px;">
              <select value={cur.leanIdx} onchange={(e)=>setVoteLean(v.actionId,p,Number((e.target as HTMLSelectElement).value))}
                style="font-size:10px;padding:2px 4px;border:1px solid #b8ae8e;border-radius:3px;background:#faf7f0;">
                {#each LEAN_CATS as cat,i (i)}<option value={i}>{cat.label} ({(cat.prob*100).toFixed(0)}%)</option>{/each}
              </select>
            </td>
            <td style="padding:3px 5px;text-align:center;">
              <input type="checkbox" checked={cur.rizzBoosted} onchange={()=>toggleVoteRizz(v.actionId,p)} title="Bump one notch toward for" />
            </td>
          </tr>
        {/each}
        {#if ed}
          {@const presParty = ed.presidentParty ?? 'Progressive'}
          {@const def = defaultLeanIdx(presParty, v.party)}
          {@const cur = vl['__president__'] ?? {leanIdx: def, rizzBoosted: false}}
          <tr style="border-top:1px solid #b8ae8e;">
            <td style="padding:3px 5px;font-weight:700;color:{pc(presParty)};font-style:italic;">President ({presParty})</td>
            <td style="padding:3px 5px;color:#7a7362;font-size:10px;">{LEAN_CATS[def].label}</td>
            <td style="padding:3px 5px;">
              <select value={cur.leanIdx} onchange={(e)=>setVoteLean(v.actionId,'__president__',Number((e.target as HTMLSelectElement).value))}
                style="font-size:10px;padding:2px 4px;border:1px solid #b8ae8e;border-radius:3px;background:#faf7f0;">
                {#each LEAN_CATS as cat,i (i)}<option value={i}>{cat.label} ({(cat.prob*100).toFixed(0)}%)</option>{/each}
              </select>
            </td>
            <td style="padding:3px 5px;text-align:center;">
              <input type="checkbox" checked={cur.rizzBoosted} onchange={()=>toggleVoteRizz(v.actionId,'__president__')} title="Bump President one notch toward for" />
            </td>
          </tr>
        {/if}
        </tbody>
      </table>
    </div>
  {/each}

  <!-- ── Bill Queue ── -->
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0;">Bill Queue</h2>
      <button onclick={loadBillQueue} style="font-size:11px;background:#2d2818;border:1px solid #5a4a2a;color:#c8a86a;padding:3px 8px;border-radius:3px;cursor:pointer;font-family:inherit;">Refresh</button>
    </div>
    {#if billQueue.length === 0}
      <p style="color:#7a7362;font-style:italic;font-size:13px;">No bills queued.</p>
    {:else}
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>{#each ['Title','Proposer','Type','From',''] as h (h)}<th style="text-align:left;padding:4px 6px;font-size:10px;text-transform:uppercase;color:#7a7362;background:#e8e1cc;">{h}</th>{/each}</tr></thead>
        <tbody>
        {#each billQueue as bill (bill.id)}
          <tr style="border-bottom:1px solid #e0d8c0;">
            <td style="padding:4px 6px;font-weight:600;">{bill.title || bill.content}</td>
            <td style="padding:4px 6px;font-weight:700;color:{pc(bill.proposing_party)};">{bill.proposing_party}</td>
            <td style="padding:4px 6px;">{bill.is_amendment ? 'Amendment' : 'Bill'}</td>
            <td style="padding:4px 6px;color:{bill.is_npc?'#7a7362':'#1f3a5f'};">{bill.player_name ?? 'NPC'}</td>
            <td style="padding:4px 6px;display:flex;gap:6px;">
              <button onclick={() => startVoteOnBill(bill)} style="font-size:11px;background:#1f3a5f;color:#fff;border:none;border-radius:3px;padding:3px 8px;cursor:pointer;font-family:inherit;">Start Vote</button>
              <button onclick={() => removeBillFromQueue(bill.id)} style="font-size:11px;background:#7a2222;color:#fff;border:none;border-radius:3px;padding:3px 8px;cursor:pointer;font-family:inherit;">Remove</button>
            </td>
          </tr>
        {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- ── Add Bill to Queue ── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
    <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">Add Bill to Queue</h2>
      <div style="display:grid;gap:8px;">
        <div><label for="bill-title" style="font-size:12px;color:#7a7362;">Title</label><input id="bill-title" type="text" bind:value={billTitle} placeholder="Bill title" style="width:100%;font-size:13px;padding:5px 8px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;margin-top:2px;" /></div>
        <div><label for="bill-desc" style="font-size:12px;color:#7a7362;">Description (optional)</label><input id="bill-desc" type="text" bind:value={billDesc} placeholder="Brief description…" style="width:100%;font-size:13px;padding:5px 8px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;margin-top:2px;" /></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><label for="bill-proposer" style="font-size:12px;color:#7a7362;">Proposer</label><select id="bill-proposer" bind:value={billProposer} style="width:100%;font-size:13px;padding:5px 8px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;margin-top:2px;">{#each PARTIES as p (p)}<option value={p}>{p}</option>{/each}</select></div>
          <div><label for="bill-type" style="font-size:12px;color:#7a7362;">Type</label><select id="bill-type" bind:value={billType} style="width:100%;font-size:13px;padding:5px 8px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;margin-top:2px;"><option value="bill">Bill</option><option value="amendment">Amendment</option></select></div>
        </div>
        <button onclick={addBillToQueue} disabled={!billTitle.trim()} style="padding:8px;background:#1f3a5f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:700;font-size:13px;font-family:inherit;opacity:{billTitle.trim()?'1':'.5'};">Add to Queue</button>
      </div>
    </div>

    <!-- ── Bulk Lean Table (applies to NPC vote roller & sets default leans for queued bills) ── -->
    <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 4px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">Lean Table</h2>
      <p style="font-size:11px;color:#7a7362;margin:0 0 8px;">Sets leans for the NPC vote roller below, and pre-fills new votes started from the queue.</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>
          <th style="text-align:left;padding:3px 5px;background:#e8e1cc;font-size:11px;">Party</th>
          <th style="padding:3px 5px;background:#e8e1cc;font-size:11px;">Default</th>
          <th style="padding:3px 5px;background:#e8e1cc;font-size:11px;">Override</th>
          <th style="padding:3px 5px;background:#e8e1cc;font-size:11px;" title="Bump one notch toward for (capped 90%)">Rizz</th>
        </tr></thead>
        <tbody>
        {#each PARTIES as p (p)}
          {@const di=defaultLeanIdx(p,billProposer)}
          <tr>
            <td style="padding:3px 5px;font-weight:700;color:{pc(p)};">{p}</td>
            <td style="padding:3px 5px;color:#7a7362;font-size:11px;">{LEAN_CATS[di].label}</td>
            <td style="padding:3px 5px;"><select value={billLean[p]??di} onchange={(e)=>{ billLean={...billLean,[p]:Number((e.target as HTMLSelectElement).value)}; }} style="font-size:11px;padding:2px 4px;border:1px solid #b8ae8e;border-radius:3px;background:#faf7f0;">{#each LEAN_CATS as cat,i (i)}<option value={i}>{cat.label} ({(cat.prob*100).toFixed(0)}%)</option>{/each}</select></td>
            <td style="padding:3px 5px;text-align:center;"><input type="checkbox" checked={!!billRizzBoost[p]} onchange={(e)=>{ billRizzBoost={...billRizzBoost,[p]:(e.target as HTMLInputElement).checked}; }} title="Bump one notch toward for (capped at 90%)" /></td>
          </tr>
        {/each}
        {#if ed}
          {@const presParty = ed.presidentParty ?? 'Progressive'}
          {@const prDi = defaultLeanIdx(presParty, billProposer)}
          <tr style="border-top:2px solid #b8ae8e;">
            <td style="padding:3px 5px;font-weight:700;color:{pc(presParty)};font-style:italic;">President ({ed.presidentName}, {presParty})</td>
            <td style="padding:3px 5px;color:#7a7362;font-size:11px;">{LEAN_CATS[prDi].label}</td>
            <td style="padding:3px 5px;"><select value={billLean['__president__']??prDi} onchange={(e)=>{ billLean={...billLean,'__president__':Number((e.target as HTMLSelectElement).value)}; }} style="font-size:11px;padding:2px 4px;border:1px solid #b8ae8e;border-radius:3px;background:#faf7f0;">{#each LEAN_CATS as cat,i (i)}<option value={i}>{cat.label} ({(cat.prob*100).toFixed(0)}%)</option>{/each}</select></td>
            <td style="padding:3px 5px;text-align:center;"><input type="checkbox" checked={!!billRizzBoost['__president__']} onchange={(e)=>{ billRizzBoost={...billRizzBoost,'__president__':(e.target as HTMLInputElement).checked}; }} title="Bump President one notch toward for (capped at 90%)" /></td>
          </tr>
        {/if}
        </tbody>
      </table>
      {#if Object.values(billRizzBoost).some(Boolean)}
        <p style="font-size:11px;color:#854f0b;margin:4px 0 0;">Rizz boost active: bumps checked party/President one notch toward &ldquo;for&rdquo; (capped at 90%).</p>
      {/if}
      <button onclick={rollBillVotes} style="margin-top:10px;width:100%;padding:8px;background:#7a2222;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:700;font-size:13px;font-family:inherit;">Roll NPC Votes (Simulation)</button>
    </div>
  </div>

  <!-- ── NPC Vote Roller Result ── -->
  {#if billResult}
    <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;margin-bottom:14px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 8px;">&ldquo;{billTitle||'Untitled'}&rdquo;</h2>
      <p style="font-size:13px;margin:0 0 4px;">YEA {billResult.yea} &nbsp; NAY {billResult.nay} &nbsp; ({(billResult.yeaShare*100).toFixed(1)}% of votes cast) &nbsp; Senate: {billResult.senatePasses?'passes':'fails'} &nbsp; President: {billResult.presSigns?'signs':'vetoes'}</p>
      <p style="font-size:16px;font-weight:700;color:{billResult.passes?'#3b6d11':'#a32d2d'};margin:4px 0 8px;">{billResult.passes?'PASSES':'FAILS'}</p>
      <details style="font-size:12px;"><summary style="cursor:pointer;color:#7a7362;">Per-seat breakdown</summary>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px;">
          <thead><tr>{#each ['Region','Cls','Party','Occupant','Vote'] as h (h)}<th style="text-align:left;padding:3px 5px;background:#e8e1cc;font-size:10px;">{h}</th>{/each}</tr></thead>
          <tbody>{#each billResult.seatResults as s (s.region)}<tr><td style="padding:3px 5px;">{s.region}</td><td style="padding:3px 5px;text-align:center;">{s.class}</td><td style="padding:3px 5px;">{s.party}</td><td style="padding:3px 5px;color:{s.is_player?'#1f3a5f':'#888'};">{s.player_name??'NPC'}</td><td style="padding:3px 5px;font-weight:700;color:{s.vote==='YEA'?'#3b6d11':s.vote==='NAY'?'#a32d2d':'#888'};">{s.vote}</td></tr>{/each}</tbody>
        </table>
      </details>
    </div>
  {/if}

  {#if latestVoteResult}
    <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;margin-bottom:14px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 8px;">Last Resolved Vote</h2>
      <p style="font-size:13px;margin:0 0 4px;">YEA {latestVoteResult.yeas} &nbsp; NAY {latestVoteResult.nays} &nbsp; ABSTAIN {latestVoteResult.abstains} &nbsp; ({(latestVoteResult.yeaShare*100).toFixed(1)}% of votes cast)</p>
      <p style="font-size:13px;margin:0 0 4px;">Senate: {latestVoteResult.senatePasses?'passes':'fails'} &nbsp; Regions: {latestVoteResult.regionsMajority}/6 {latestVoteResult.isAmendment?'(needs 4)':''} &nbsp; President: {latestVoteResult.presidentSigns===null?'not reached':latestVoteResult.presidentSigns?'signs':'vetoes'}</p>
      {#if latestVoteResult.overridePassed !== null}
        <p style="font-size:12px;margin:0 0 4px;color:#7a7362;">Override attempt: {latestVoteResult.overridePassed ? 'succeeds' : 'fails'}</p>
      {/if}
      <p style="font-size:16px;font-weight:700;color:{billResultColor(latestVoteResult.voteResult)};margin:4px 0 8px;">{latestVoteResult.voteResult}</p>
      <details style="font-size:12px;"><summary style="cursor:pointer;color:#7a7362;">Per-seat breakdown</summary>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px;">
          <thead><tr>{#each ['Region','Cls','Party','Occupant','Vote'] as h (h)}<th style="text-align:left;padding:3px 5px;background:#e8e1cc;font-size:10px;">{h}</th>{/each}</tr></thead>
          <tbody>{#each latestVoteResult.seatResults as s (s.id)}<tr><td style="padding:3px 5px;">{s.region}</td><td style="padding:3px 5px;text-align:center;">{s.class}</td><td style="padding:3px 5px;">{s.party}</td><td style="padding:3px 5px;color:{s.isPlayer?'#1f3a5f':'#888'};">{s.playerName??'NPC'}</td><td style="padding:3px 5px;font-weight:700;color:{s.vote==='YEA'?'#3b6d11':s.vote==='NAY'?'#a32d2d':'#7a7362'};">{s.vote}</td></tr>{/each}</tbody>
        </table>
      </details>
    </div>
  {/if}

  <!-- ── Bill History ── -->
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;margin-top:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0;">Bill History</h2>
      <button onclick={loadBillHistory} style="font-size:11px;background:#2d2818;border:1px solid #5a4a2a;color:#c8a86a;padding:3px 8px;border-radius:3px;cursor:pointer;font-family:inherit;">Refresh</button>
    </div>
    {#if billHistory.length === 0}
      <p style="color:#7a7362;font-style:italic;font-size:13px;">No bills voted on yet.</p>
    {:else}
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#e8e1cc;">
            {#each ['Turn','Year','Title','Type','Proposer','Yea','Nay','Abstain','Result'] as h (h)}
              <th style="text-align:left;padding:4px 6px;font-size:10px;text-transform:uppercase;color:#7a7362;white-space:nowrap;">{h}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each billHistory as b (b.id)}
            <tr style="border-bottom:1px solid #e0d8c0;">
              <td style="padding:4px 6px;">{b.turn_index != null ? b.turn_index + 1 : '—'}</td>
              <td style="padding:4px 6px;">{b.year ?? '—'}</td>
              <td style="padding:4px 6px;font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title={b.title||b.content}>{b.title || b.content}</td>
              <td style="padding:4px 6px;">{b.is_amendment ? 'Amendment' : 'Bill'}</td>
              <td style="padding:4px 6px;font-weight:700;color:{pc(b.proposing_party)};">
                {b.player_name ? `${b.player_name} (${b.proposing_party})` : b.proposing_party}
              </td>
              <td style="padding:4px 6px;color:#3b6d11;font-weight:600;">{b.yea_count ?? '—'}</td>
              <td style="padding:4px 6px;color:#a32d2d;font-weight:600;">{b.nay_count ?? '—'}</td>
              <td style="padding:4px 6px;color:#7a7362;">{b.abstain_count ?? '—'}</td>
              <td style="padding:4px 6px;font-weight:700;color:{billResultColor(b.vote_result)};">{b.vote_result}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

{:else if activeTab==='elections'}

  <!-- Election countdown overview -->
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:12px 14px;margin-bottom:14px;display:flex;gap:18px;align-items:center;flex-wrap:wrap;font-family:Georgia,serif;font-size:13px;">
    <span style="font-weight:700;color:#7a7362;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Until next election</span>
    {#each (['pres',1,2,3] as const) as slot (slot)}
      {#if slot === 'pres'}
        {@const cnt = Math.ceil(gmCurrentTurn / 8) * 8 - gmCurrentTurn}
        <span style="color:{cnt<=2?'#7a2222':'#232019'};font-weight:{cnt<=2?'700':'400'};">
          Presidential: <strong>{cnt}</strong> turn{cnt===1?'':'s'}
          {#if cnt<=2}<span style="background:#7a2222;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;margin-left:4px;">SOON</span>{/if}
        </span>
      {:else}
        {@const cnt = gmTurnsUntilSenate(slot)}
        <span style="color:{cnt<=2?'#7a2222':'#232019'};font-weight:{cnt<=2?'700':'400'};">
          Class {slot}: <strong>{cnt}</strong> turn{cnt===1?'':'s'}
          {#if cnt<=2}<span style="background:#7a2222;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;margin-left:4px;">SOON</span>{/if}
        </span>
      {/if}
    {/each}
  </div>

  <!-- Presidential election -->
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;margin-bottom:14px;">
    <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">Presidential Election</h2>
    {#if ed}
      <p style="font-size:13px;margin:0 0 8px;">
        Current president: <strong style="color:{pc(ed.presidentParty ?? 'Progressive')};">{ed.presidentName ?? '—'}</strong>
        ({ed.presidentParty ?? 'Progressive'}, elected {ed.presidentElectedYear ?? '—'})
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:10px;">
        <label style="font-size:12px;color:#7a7362;">
          <input type="checkbox" bind:checked={presRunning} /> Incumbent is running
        </label>
        <div>
          <span style="font-size:12px;color:#7a7362;">Player running (if eligible)</span>
          <select bind:value={playerRunId} style="width:100%;font-size:12px;padding:3px 6px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;margin-top:2px;">
            <option value="">— none —</option>
            {#each presEligible as pl (pl.id)}<option value={pl.id}>{pl.name} ({pl.party})</option>{/each}
          </select>
        </div>
        <div style="display:flex;gap:8px;">
          <div>
            <span style="font-size:12px;color:#7a7362;">Crossover weight %</span>
            <input type="number" min="0" max="100" value={Math.round((ed.crossoverWeight??0.4)*100)}
              onchange={(e)=>{ const v=Number((e.target as HTMLInputElement).value)/100; ed={...ed,crossoverWeight:v}; api.gmPost(`/api/v1/gm/sessions/${sessionId}/election-settings`,gmToken,{crossover_weight:v}); }}
              style="width:60px;font-size:12px;padding:3px 6px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;margin-top:2px;" />
          </div>
          <div>
            <span style="font-size:12px;color:#7a7362;">Left-lean bias %</span>
            <input type="number" min="0" max="100" value={Math.round((ed.leftLeanBias??0.3)*100)}
              onchange={(e)=>{ const v=Number((e.target as HTMLInputElement).value)/100; ed={...ed,leftLeanBias:v}; api.gmPost(`/api/v1/gm/sessions/${sessionId}/election-settings`,gmToken,{left_lean_bias:v}); }}
              style="width:60px;font-size:12px;padding:3px 6px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;margin-top:2px;" />
          </div>
        </div>
      </div>

      <!-- Pending nominees box -->
      {#if ed.pendingNominees}
        <div style="background:#e8e1cc;border:1px solid #b8ae8e;border-radius:4px;padding:10px;margin-bottom:10px;font-size:13px;">
          <strong>Nominees for {ed.pendingNominees.year}:</strong>
            {#each ed.pendingNominees.slots as s (s.party)}
            <span style="margin-left:12px;color:{pc(s.party)};font-weight:600;">{s.party}: {s.name || '?'}</span>
          {/each}
          <button onclick={() => { if (ed) ed={...ed,pendingNominees:null}; api.gmPost(`/api/v1/gm/sessions/${sessionId}/pending-nominees`,gmToken,{nominees:null}); }}
            style="margin-left:10px;font-size:11px;padding:2px 8px;border:1px solid #7a7362;border-radius:3px;cursor:pointer;background:#faf7f0;">Clear</button>
        </div>
      {/if}

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <button onclick={lockNominees} style="padding:7px 14px;background:#854f0b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;font-weight:600;">Lock In Nominees</button>
        <button onclick={runPresidentialElection} style="padding:7px 14px;background:#1f3a5f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;font-weight:700;">Run Presidential Election</button>
      </div>

      {#if presResult}
        <div style="background:#faf7f0;border:1px solid #b8ae8e;border-radius:4px;padding:12px;font-size:13px;">
          <p style="margin:0 0 6px;font-size:11px;color:#7a7362;">
            Crossover model: each nominee's regional approval + {Math.round((ed.crossoverWeight??0.4)*100)}% of non-participant approvals split by spectrum distance, {Math.round((ed.leftLeanBias??0.3)*100)}% left-lean bias.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;">
            <thead><tr>
              <th style="text-align:left;padding:3px 6px;background:#e8e1cc;font-size:11px;">Region</th>
              <th style="padding:3px 6px;background:#e8e1cc;font-size:11px;color:{pc(presResult.nominees[0].party)};">{presResult.nominees[0].party} ({presResult.nominees[0].name})</th>
              <th style="padding:3px 6px;background:#e8e1cc;font-size:11px;color:{pc(presResult.nominees[1].party)};">{presResult.nominees[1].party} ({presResult.nominees[1].name})</th>
              <th style="padding:3px 6px;background:#e8e1cc;font-size:11px;">Elector</th>
            </tr></thead>
            <tbody>
              {#each presResult.breakdown as b (b.region)}
                <tr>
                  <td style="padding:3px 6px;">{b.region}</td>
                  <td style="padding:3px 6px;text-align:center;">{b.aVal.toFixed(2)}</td>
                  <td style="padding:3px 6px;text-align:center;">{b.bVal.toFixed(2)}</td>
                  <td style="padding:3px 6px;font-weight:700;color:{pc(b.winner)};">{b.winner}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p style="margin:0 0 4px;">
            <strong>Electors:</strong>
            {#each presResult.nominees as n (n.party)}<span style="margin-right:12px;color:{pc(n.party)};font-weight:600;">{n.party}: {presResult.electors[n.party]}</span>{/each}
          </p>
          {#if presResult.tie}
            <p style="margin:0 0 4px;color:#854f0b;"><strong>Tie!</strong> Popular vote tiebreak: {presResult.nominees[0].party} {presResult.popularVote?.a.toFixed(2)} vs {presResult.nominees[1].party} {presResult.popularVote?.b.toFixed(2)}</p>
          {/if}
          <p style="font-size:15px;font-weight:700;margin:6px 0;">
            Winner: <span style="color:{pc(presResult.winnerSlot.party)};">{presResult.winnerSlot.name} ({presResult.winnerSlot.party})</span>
            {#if presResult.overridden}<span style="font-size:11px;color:#7a7362;"> (GM override)</span>{/if}
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            {#each presResult.nominees as n (n.party)}
              <button onclick={() => { if (presResult) presResult={...presResult, winnerSlot:n, overridden:true}; }}
                style="padding:4px 10px;font-size:12px;border:1px solid #232019;border-radius:3px;cursor:pointer;background:#faf7f0;font-family:inherit;">
                Override: {n.name} wins
              </button>
            {/each}
            <button onclick={applyPresResult}
              style="padding:6px 14px;background:#7a2222;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;font-weight:700;margin-left:auto;">
              Apply Result
            </button>
          </div>
        </div>
      {/if}
    {:else}
      <p style="font-size:13px;color:#7a7362;">Loading election data&hellip;</p>
    {/if}
  </div>

  <!-- Senate class election -->
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;margin-bottom:14px;">
    <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">Senate Class Election</h2>
    <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;">
      <div>
        <label for="sen-class-pick" style="font-size:12px;color:#7a7362;display:block;margin-bottom:3px;">Class up for election</label>
        <select id="sen-class-pick" bind:value={senClassPick} style="font-size:13px;padding:5px 8px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;">
          <option value={1}>Class 1</option><option value={2}>Class 2</option><option value={3}>Class 3</option>
        </select>
      </div>
      <button onclick={runSenateElection}
        style="padding:7px 14px;background:#1f3a5f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;font-weight:700;">
        Run Class {senClassPick} Election
      </button>
    </div>
    {#if senResult.length > 0}
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px;">
        <thead><tr>
          {#each ['Region','Prev. holder','Top party','2nd party','Result','Flipped?','Note'] as h (h)}
            <th style="text-align:left;padding:4px 6px;font-size:11px;text-transform:uppercase;color:#7a7362;background:#e8e1cc;">{h}</th>
          {/each}
        </tr></thead>
        <tbody>
          {#each senResult as r (r.region)}
            <tr>
              <td style="padding:4px 6px;">{r.region}</td>
              <td style="padding:4px 6px;color:{pc(r.prevParty)};">{r.prevOccupant} ({r.prevParty})</td>
              <td style="padding:4px 6px;font-weight:600;color:{pc(r.top)};">{r.top} ({(regionApproval[r.region]?.[r.top]??0).toFixed(1)})</td>
              <td style="padding:4px 6px;color:{pc(r.second)};">{r.second} ({(regionApproval[r.region]?.[r.second]??0).toFixed(1)})</td>
              <td style="padding:4px 6px;font-weight:600;color:{pc(r.winnerParty)};">{r.winnerParty}</td>
              <td style="padding:4px 6px;color:{r.flipped?'#a32d2d':'#3b6d11'};">{r.flipped?'Yes':'No'}</td>
              <td style="padding:4px 6px;color:#7a7362;">{r.note}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button onclick={applySenateResults}
        style="padding:7px 14px;background:#7a2222;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;font-weight:700;">
        Apply Results &amp; Advance Class Cycle
      </button>
    {/if}
  </div>

  <!-- Special election -->
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;margin-bottom:14px;">
    <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">Special Election (Vacancy)</h2>
    <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;">
      <div>
        <label for="special-region" style="font-size:12px;color:#7a7362;display:block;margin-bottom:3px;">Region</label>
        <select id="special-region" bind:value={spRegion} style="font-size:13px;padding:5px 8px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;">
          {#each REGIONS as r (r)}<option value={r}>{r}</option>{/each}
        </select>
      </div>
      <div>
        <label for="special-class" style="font-size:12px;color:#7a7362;display:block;margin-bottom:3px;">Class</label>
        <select id="special-class" bind:value={spClass} style="font-size:13px;padding:5px 8px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;">
          <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
        </select>
      </div>
      <button onclick={suggestSpecial} style="padding:7px 14px;background:#1f3a5f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;font-weight:600;">Suggest Replacement</button>
    </div>
    {#if spResult}
      <p style="font-size:13px;margin:0 0 8px;">
        Suggested: <strong style="color:{pc(spResult.party)};">{spResult.party}</strong> fills {spResult.region} Class {spResult.cls}
        <span style="color:#7a7362;"> ({(spResult?.ranked ?? []).map((p:string)=>p+' '+(regionApproval[spResult?.region ?? '']?.[p]??0).toFixed(1)).join(', ')})</span>
      </p>
      <button onclick={applySpecial} style="padding:6px 12px;background:#7a2222;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;font-weight:700;">Apply — Fill with NPC</button>
    {/if}
  </div>

  <!-- NPC candidate pool -->
  <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
    <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">NPC Candidate Pool</h2>
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;">
      <div>
        <label for="npc-year" style="font-size:12px;color:#7a7362;display:block;margin-bottom:3px;">Election year</label>
        <input id="npc-year" type="number" bind:value={newNpcYear} step="4" min="1904" style="width:80px;font-size:13px;padding:5px 8px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;" />
      </div>
      {#each PARTIES as p (p)}
        <div>
          <label for={`npc-name-${p}`} style="font-size:12px;color:{pc(p)};font-weight:700;display:block;margin-bottom:3px;">{p}</label>
          <input id={`npc-name-${p}`} type="text" placeholder="Candidate name"
            value={newNpcNames[p]}
            oninput={(e) => { newNpcNames = {...newNpcNames, [p]: (e.target as HTMLInputElement).value}; }}
            style="font-size:12px;padding:4px 6px;border:1px solid #b8ae8e;border-radius:4px;background:#faf7f0;width:130px;" />
        </div>
      {/each}
      <button onclick={addNpcCandidate} style="padding:7px 14px;background:#232019;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;font-weight:600;">Add to Pool</button>
    </div>
    {#if (ed?.npcCandidates ?? []).length > 0}
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>
          <th style="text-align:left;padding:4px 6px;font-size:11px;text-transform:uppercase;color:#7a7362;background:#e8e1cc;">Year</th>
          {#each PARTIES as p (p)}<th style="padding:4px 6px;font-size:11px;color:{pc(p)};background:#e8e1cc;">{p}</th>{/each}
          <th style="padding:4px 6px;background:#e8e1cc;"></th>
        </tr></thead>
        <tbody>
          {#each [...new Set((ed?.npcCandidates ?? []).map(c => c.year))].sort() as yrRaw (yrRaw)}
            {@const yr = yrRaw as number}
            <tr>
              <td style="padding:4px 6px;font-weight:600;">{yr}</td>
              {#each PARTIES as p (p)}
                {@const cand = (ed?.npcCandidates ?? []).find(c => c.year===yr&&c.party===p)}
                <td style="padding:4px 6px;">{cand?.name ?? '—'}</td>
              {/each}
              <td style="padding:4px 6px;">
                <button onclick={() => { for(const p of PARTIES) { const c=(ed?.npcCandidates ?? []).find(c => c.year===yr&&c.party===p); if(c) removeNpcCandidate(yr,p); } }}
                  style="font-size:11px;padding:2px 8px;border:1px solid #a32d2d;color:#a32d2d;border-radius:3px;cursor:pointer;background:#faf7f0;">&times; Remove Year</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p style="font-size:13px;color:#7a7362;font-style:italic;">No candidates in pool yet. Add them above for the pre-set nominees feature.</p>
    {/if}
  </div>

{:else if activeTab==='ledger'}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
    <div>
      <LedgerImporter {sessionId} {gmToken} />
      <div style="margin-top:10px;">
        <button onclick={() => statChangeOpen = !statChangeOpen}
          style="width:100%;padding:8px;background:#faf7f0;border:1px solid #232019;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;">
          {statChangeOpen ? 'Hide Stat Change Form' : 'Apply Stat Change...'}
        </button>
      </div>
    </div>
    <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:6px;padding:14px;">
      <h2 style="font-family:Georgia,serif;font-size:15px;margin:0 0 10px;border-bottom:1px solid #b8ae8e;padding-bottom:6px;">Stat Change History</h2>
      {#if statHistory.length===0}<p style="font-size:13px;color:#7a7362;font-style:italic;">None yet.</p>
      {:else}
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr>{#each ['Stat','Target','Delta','Reason'] as h (h)}<th style="text-align:left;padding:4px 6px;font-size:11px;text-transform:uppercase;color:#7a7362;background:#e8e1cc;">{h}</th>{/each}</tr></thead>
          <tbody>{#each statHistory as h (h.stat)}<tr><td style="padding:4px 6px;">{h.stat}</td><td style="padding:4px 6px;">{h.target}</td><td style="padding:4px 6px;font-weight:700;color:{h.delta>0?'#3b6d11':'#a32d2d'};">{h.delta>0?'+':''}{h.delta}</td><td style="padding:4px 6px;color:#555;">{h.reason}</td></tr>{/each}</tbody>
        </table>
      {/if}
    </div>
  </div>

  {#if statChangeOpen}
    <div role="button" tabindex="0" aria-label="Close stat change dialog" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:50;"
      onclick={() => statChangeOpen = false}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') statChangeOpen = false; }}>
      <div role="dialog" tabindex="-1" aria-modal="true" style="background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);width:100%;max-width:480px;margin:0 16px;"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}>
        <div style="padding:4px;"><StatChangePanel {sessionId} /></div>
        <div style="padding:8px 12px;border-top:1px solid #e8e1cc;text-align:right;">
          <button onclick={() => statChangeOpen = false}
            style="font-size:12px;border:1px solid #b8ae8e;border-radius:4px;padding:4px 12px;cursor:pointer;background:#faf7f0;font-family:inherit;">Close</button>
        </div>
      </div>
    </div>
  {/if}
{/if}

{/if}
</div>
