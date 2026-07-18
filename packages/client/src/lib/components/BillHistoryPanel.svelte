<script lang="ts">
  import { api } from '$lib/api.js';

  const { sessionId }: { sessionId: string } = $props();

  interface BillEntry {
    id: string; title: string; content: string;
    proposing_party: string; is_amendment: number; is_npc: number;
    player_name: string | null; vote_result: string;
    yea_count: number | null; nay_count: number | null; abstain_count: number | null;
    turn_index: number | null; year: number | null;
  }

  let entries = $state<BillEntry[]>([]);
  let open    = $state(false);
  let loading = $state(false);

  function resultColor(result: string) {
    return result === 'PASSED' || result === 'OVERRIDE_PASSED' ? '#5fa33b' : result === 'VETOED' ? '#c58b2d' : '#c0392b';
  }

  async function load() {
    loading = true;
    entries = await api.get<BillEntry[]>(`/api/v1/sessions/${sessionId}/bill-history`).catch(() => []);
    loading = false;
  }

  function toggle() { open = !open; if (open && entries.length === 0) load(); }
</script>

<section style="background:#1c1a14;border:1px solid #3d3520;border-radius:4px;overflow:hidden;font-family:Georgia,serif;">
  <button onclick={toggle}
    style="width:100%;padding:10px 14px;background:#241f14;border:none;color:#d4b896;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;">
    <span>Bill History</span>
    <span style="font-size:10px;color:#7a6a44;">{open ? '▲ collapse' : '▼ expand'}</span>
  </button>

  {#if open}
    <div style="padding:8px 12px;border-top:1px solid #3d3520;">
      {#if loading}
        <p style="color:#7a6a44;font-size:12px;">Loading…</p>
      {:else if entries.length === 0}
        <p style="color:#7a6a44;font-size:12px;">No bills voted on yet.</p>
      {:else}
        <div style="display:flex;justify-content:flex-end;margin-bottom:6px;">
          <button onclick={load} style="font-size:11px;background:#2d2818;border:1px solid #5a4a2a;color:#c8a86a;padding:3px 10px;border-radius:3px;cursor:pointer;font-family:inherit;">Refresh</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="color:#8a7a55;border-bottom:1px solid #3d3520;">
              {#each ['Turn','Year','Title','Type','Proposer','Yea','Nay','Abstain','Result'] as h (h)}
                <th style="text-align:left;padding:3px 5px;font-size:10px;text-transform:uppercase;white-space:nowrap;">{h}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each entries as b (b.id)}
              <tr style="border-bottom:1px solid #2a2518;color:#c8b99a;">
                <td style="padding:3px 5px;color:#7a6a44;">{b.turn_index != null ? b.turn_index + 1 : '—'}</td>
                <td style="padding:3px 5px;color:#7a6a44;">{b.year ?? '—'}</td>
                <td style="padding:3px 5px;font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title={b.title||b.content}>{b.title || b.content}</td>
                <td style="padding:3px 5px;">{b.is_amendment ? 'Amend.' : 'Bill'}</td>
                <td style="padding:3px 5px;">{b.player_name ?? b.proposing_party}</td>
                <td style="padding:3px 5px;color:#5fa33b;font-weight:600;">{b.yea_count ?? '—'}</td>
                <td style="padding:3px 5px;color:#c0392b;font-weight:600;">{b.nay_count ?? '—'}</td>
                <td style="padding:3px 5px;color:#7a6a44;">{b.abstain_count ?? '—'}</td>
                <td style="padding:3px 5px;font-weight:700;color:{resultColor(b.vote_result)};">{b.vote_result}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</section>
