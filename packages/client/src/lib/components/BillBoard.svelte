<script lang="ts">
  import { bills } from '../../stores/session.js';
  import { socket } from '$lib/socket.js';
  import type { VoteOption } from '@lmh/types';

  let { sessionId } = $props();

  function vote(billId: string, v: VoteOption) {
    socket.emit('submit_vote', {billId, vote: v });
  }
</script>

{#if $bills.length}
  <div class="space-y-3">
    <h3 class="font-semibold">Bills on the Floor</h3>
    {#each $bills as bill}
      <div class="border rounded p-3 space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-xs px-2 py-0.5 bg-gray-100 rounded">{bill.proposingParty}</span>
          {#if bill.isNpc}
            <span class="text-xs text-gray-400">NPC</span>
          {/if}
          <span class="text-xs ml-auto font-medium">{bill.voteResult}</span>
        </div>
        <p class="text-sm">{bill.content}</p>
        {#if bill.voteResult === 'PENDING'}
          <div class="flex gap-2">
            <button
            onclick={() => vote(bill.id, 'YEA')}
            disabled={bill.playerVote !== null}
            class="px-3 py-1  text-sm rounded {
              bill.playerVote === 'YEA'
              ? 'bg-green-600 text-white'
              : 'border border-green-600 text-green-700 hover:bg-red-50'
            }">
              YEA
            </button>
            <button
            onclick={() => vote(bill.id, 'NAY')}
            disabled={bill.playerVote !== null}
            class="px-3 py-1 text-sm rounded {
              bill.playerVote === 'NAY'
              ? 'bg-red-600 text-white'
              : 'border border-red-600 text-red-700 hover:bg-red-50'
            }">
              NAY
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
