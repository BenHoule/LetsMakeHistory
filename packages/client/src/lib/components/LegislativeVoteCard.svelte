<script lang="ts">
	import { socket } from '$lib/socket.js';
	import { pendingActionVotes, voteResults, recordMyActionVote } from '../../stores/votes.js';
	import type { VoteOption } from '@lmh/types';
</script>

{#if $pendingActionVotes.length > 0}
	<div class="space-y-3">
		{#each $pendingActionVotes as vote (vote.actionId)}
			{@const tally = Object.values(vote.playerVotes).reduce(
				(acc, v) => {
					acc[v as VoteOption] = (acc[v as VoteOption] ?? 0) + 1;
					return acc;
				},
				{ YEA: 0, NAY: 0 } as Record<string, number>
			)}
			<div
				style="border:2px solid #2d5a8a;border-radius:6px;padding:14px;background:#101820;font-family:Georgia,serif;"
			>
				<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
					<span style="font-weight:700;color:#6ab4f0;font-size:13px;">Legislative Vote</span>
					<span style="color:#7a9ab8;font-size:12px;"
						>proposed by {vote.playerName} ({vote.party})</span
					>
				</div>
				<p style="color:#c8d8e8;font-size:13px;margin-bottom:10px;">{vote.content}</p>

				{#if vote.myVote === null}
					<div style="display:flex;gap:8px;margin-bottom:10px;">
						<button
							onclick={() => {
								socket.emit('submit_action_vote', { actionId: vote.actionId, vote: 'YEA' });
								recordMyActionVote(vote.actionId, 'YEA');
							}}
							style="flex:1;background:#1e5c2a;color:#fff;padding:6px 0;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;"
						>
							YEA
						</button>
						<button
							onclick={() => {
								socket.emit('submit_action_vote', { actionId: vote.actionId, vote: 'NAY' });
								recordMyActionVote(vote.actionId, 'NAY');
							}}
							style="flex:1;background:#6b1a1a;color:#fff;padding:6px 0;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;"
						>
							NAY
						</button>
					</div>
				{:else}
					<p
						style="font-size:12px;font-weight:700;color:{vote.myVote === 'YEA'
							? '#5fa33b'
							: '#c0392b'};margin-bottom:10px;"
					>
						You voted {vote.myVote} — waiting for GM to close voting.
					</p>
				{/if}

				<!-- Live tally & who voted what -->
				{#if Object.keys(vote.playerVotes).length > 0}
					<div style="border-top:1px solid #2d4a6a;padding-top:8px;">
						<div style="font-size:11px;color:#8aaccc;margin-bottom:4px;">
							Live tally — Yea: <span style="color:#5fa33b;font-weight:700;">{tally.YEA}</span>
							&nbsp;Nay: <span style="color:#c0392b;font-weight:700;">{tally.NAY}</span>
						</div>
						<div style="display:flex;flex-wrap:wrap;gap:4px;">
							{#each Object.entries(vote.playerVotes) as [name, v] (name)}
								<span
									style="font-size:10px;background:{v === 'YEA'
										? '#1e3d1a'
										: '#3d1a1a'};color:{v === 'YEA'
										? '#7de87d'
										: '#e87d7d'};padding:1px 6px;border-radius:3px;"
								>
									{name}: {v}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<!-- Recent vote results -->
{#if $voteResults.length > 0}
	<div
		style="border:1px solid #3d3520;border-radius:4px;padding:10px 12px;background:#1c1a14;font-family:Georgia,serif;font-size:12px;margin-top:4px;"
	>
		<div
			style="color:#a89060;font-size:11px;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;"
		>
			Recent Vote Results
		</div>
		{#each $voteResults.slice(0, 5) as r (r.actionId + r.resolvedAt)}
			<div
				style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #2a2518;color:#c8b99a;"
			>
				<span style="font-weight:700;color:{r.passed ? '#5fa33b' : '#c0392b'};"
					>{r.passed ? 'PASSED' : 'FAILED'}</span
				>
				<span style="color:#8a7a55;">Yea {r.yeas} · Nay {r.nays} · Abstain {r.abstains}</span>
			</div>
		{/each}
	</div>
{/if}
