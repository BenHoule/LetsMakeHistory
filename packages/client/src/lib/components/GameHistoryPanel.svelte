<script lang="ts">
  import { api } from '$lib/api.js';

  const { sessionId }: { sessionId: string } = $props();

  interface HistoryEntry {
    id: string;
    type: 'ACTION' | 'BILL_VOTE' | 'ELECTION' | 'STAT_CHANGE' | 'EVENT' | 'PHASE';
    turnIndex: number | null;
    year: number | null;
    actor: string | null;
    content: string;
    outcome: string | null;
    positive: boolean | null;
    occurredAt: string;
  }

  let entries: HistoryEntry[] = $state([]);
  let loading = $state(false);
  let open = $state(false);

  async function load() {
    loading = true;
    const data = await api.get<HistoryEntry[]>(`/api/v1/sessions/${sessionId}/game-history`).catch(() => []);
    entries = data;
    loading = false;
  }

  function toggle() {
    open = !open;
    if (open && entries.length === 0) load();
  }

  // Colour-code by type
  function typeColor(type: string) {
    switch (type) {
      case 'ACTION':      return '#1f3a5f';
      case 'BILL_VOTE':   return '#854f0b';
      case 'ELECTION':    return '#3b6d11';
      case 'STAT_CHANGE': return '#5a3a7a';
      case 'EVENT':       return '#7a2222';
      default:            return '#4a4030';
    }
  }

  function typeLabel(type: string) {
    switch (type) {
      case 'ACTION':      return 'Action';
      case 'BILL_VOTE':   return 'Vote';
      case 'ELECTION':    return 'Election';
      case 'STAT_CHANGE': return 'Stat';
      case 'EVENT':       return 'Event';
      default:            return type;
    }
  }

  function outcomeStyle(positive: boolean | null) {
    if (positive === null) return 'color:#a89060;';
    return positive ? 'color:#5fa33b;' : 'color:#c0392b;';
  }
</script>

<section style="background:#1c1a14;border:1px solid #3d3520;border-radius:4px;overflow:hidden;font-family:Georgia,serif;">
  <button
    onclick={toggle}
    style="width:100%;padding:10px 14px;background:#241f14;border:none;color:#d4b896;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;"
  >
    <span>Session History</span>
    <span style="font-size:10px;color:#7a6a44;">{open ? '▲ collapse' : '▼ expand'}</span>
  </button>

  {#if open}
    <div style="padding:8px 12px;border-top:1px solid #3d3520;">
      {#if loading}
        <p style="color:#7a6a44;font-size:12px;">Loading…</p>
      {:else if entries.length === 0}
        <p style="color:#7a6a44;font-size:12px;">No history yet.</p>
      {:else}
        <!-- Reload button -->
        <div style="display:flex;justify-content:flex-end;margin-bottom:6px;">
          <button
            onclick={load}
            style="font-size:11px;background:#2d2818;border:1px solid #5a4a2a;color:#c8a86a;padding:3px 10px;border-radius:3px;cursor:pointer;font-family:inherit;"
          >Refresh</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="color:#8a7a55;border-bottom:1px solid #3d3520;">
              <th style="text-align:left;padding:3px 6px;width:60px;">Turn</th>
              <th style="text-align:left;padding:3px 6px;width:64px;">Type</th>
              <th style="text-align:left;padding:3px 6px;width:110px;">Actor</th>
              <th style="text-align:left;padding:3px 6px;">Detail</th>
              <th style="text-align:left;padding:3px 6px;width:120px;">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {#each entries as e (e.id)}
              <tr style="border-bottom:1px solid #2a2518;color:#c8b99a;">
                <td style="padding:4px 6px;color:#7a6a44;">
                  {e.turnIndex != null ? `T${e.turnIndex + 1}` : '—'}
                  {e.year ? ` (${e.year})` : ''}
                </td>
                <td style="padding:4px 6px;">
                  <span style="background:{typeColor(e.type)};color:#f0e8d0;padding:1px 5px;border-radius:3px;font-size:10px;">
                    {typeLabel(e.type)}
                  </span>
                </td>
                <td style="padding:4px 6px;color:#a89060;">{e.actor ?? '—'}</td>
                <td style="padding:4px 6px;">{e.content}</td>
                <td style="padding:4px 6px;{outcomeStyle(e.positive)}">
                  {e.outcome ?? '—'}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</section>
