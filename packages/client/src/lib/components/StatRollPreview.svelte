<script lang="ts">
	import { socket } from '$lib/socket.js';
	import { players } from '../../stores/session.js';
	import { pendingStatRolls, updateStatRoll, removeStatRoll } from '../../stores/gm.js';
	import type { StatRollRecord } from '../../stores/gm.js';
	import { DELTA_TABLE } from '@lmh/types';
	import type { SizeCategory, StatName } from '@lmh/types';

	let { sessionId }: { sessionId: string } = $props();

	const STAT_OPTS = ['Approval', 'Recognition', 'Rizz', 'Party', 'Region'] as const;
	const ALL_PARTIES = ['Progressive', 'Unionist', 'Whig', 'Conservative'] as const;
	const ALL_REGIONS = ['Midwest', 'Mountain', 'Northeast', 'South', 'Southwest', 'West'] as const;

	// Per-roll region+party state for Region stat targets
	let regionSelects = $state<Record<string, string>>({});
	let partySelects = $state<Record<string, string>>({});

	function composedTarget(roll: StatRollRecord) {
		if (roll.stat === 'Region') {
			const r = regionSelects[roll.actionId] ?? 'Midwest';
			const p = partySelects[roll.actionId] ?? 'Progressive';
			return `${r}:${p}`;
		}
		return roll.target;
	}

	function confirm(actionId: string) {
		const roll = $pendingStatRolls.find((r) => r.actionId === actionId);
		if (!roll) return;
		const target = roll.stat === 'Region' ? composedTarget(roll) : roll.target;
		if (!target || !roll.stat || !roll.reason.trim()) return;

		const idx = roll.sizeCategory === 'Small' ? 0 : roll.sizeCategory === 'Medium' ? 1 : 2;
		const magnitude = DELTA_TABLE[roll.stat][idx];
		const delta = magnitude * roll.directionHint;

		socket.emit('gm_confirm_stat_roll', {
			sessionId,
			actionId,
			stat: roll.stat,
			target,
			delta,
			reason: roll.reason
		});
		removeStatRoll(actionId);
	}
</script>

{#if $pendingStatRolls.length > 0}
	<div class="border rounded p-4 space-y-4">
		<h2 class="font-semibold text-orange-800">Pending Stat Rolls</h2>

		{#each $pendingStatRolls as roll (roll.actionId)}
			<div class="border border-orange-200 rounded p-3 space-y-2 bg-orange-50">
				<div class="text-sm font-medium">{roll.playerName}</div>
				<p class="text-xs text-gray-600 italic">"{roll.actionContent}"</p>

				<div class="grid grid-cols-2 gap-2 text-xs">
					<div>
						<span class="text-gray-500">Rolled size:</span>
						<span class="font-mono font-medium ml-1">{roll.sizeCategory}</span>
					</div>
					<div>
						<span class="text-gray-500">Direction hint:</span>
						<span class="font-mono font-medium ml-1">{roll.directionHint > 0 ? '+' : '−'}</span>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<!-- Stat selector -->
					<div class="space-y-0.5">
						<label class="text-xs text-gray-500" for={`stat-roll-stat-${roll.actionId}`}>Stat</label
						>
						<select
							class="border rounded w-full px-1 py-0.5 text-sm"
							id={`stat-roll-stat-${roll.actionId}`}
							value={roll.stat}
							onchange={(e) =>
								updateStatRoll(roll.actionId, {
									stat: (e.target as HTMLSelectElement).value as StatName
								})}
						>
							{#each STAT_OPTS as s (s)}<option value={s}>{s}</option>{/each}
						</select>
					</div>

					<!-- Size override -->
					<div class="space-y-0.5">
						<label class="text-xs text-gray-500" for={`stat-roll-size-${roll.actionId}`}
							>Size (override)</label
						>
						<select
							class="border rounded w-full px-1 py-0.5 text-sm"
							id={`stat-roll-size-${roll.actionId}`}
							value={roll.sizeCategory}
							onchange={(e) =>
								updateStatRoll(roll.actionId, {
									sizeCategory: (e.target as HTMLSelectElement).value as SizeCategory
								})}
						>
							<option value="Small">Small (±{DELTA_TABLE[roll.stat][0]})</option>
							<option value="Medium">Medium (±{DELTA_TABLE[roll.stat][1]})</option>
							<option value="Large">Large (±{DELTA_TABLE[roll.stat][2]})</option>
						</select>
					</div>
				</div>

				<!-- Target -->
				{#if roll.stat === 'Approval' || roll.stat === 'Recognition' || roll.stat === 'Rizz'}
					<div class="space-y-0.5">
						<label class="text-xs text-gray-500" for={`stat-roll-target-${roll.actionId}`}
							>Player</label
						>
						<select
							class="border rounded w-full px-1 py-0.5 text-sm"
							id={`stat-roll-target-${roll.actionId}`}
							value={roll.target}
							onchange={(e) =>
								updateStatRoll(roll.actionId, { target: (e.target as HTMLSelectElement).value })}
						>
							{#each $players as p (p.id ?? p.name)}<option value={p.name}>{p.name}</option>{/each}
						</select>
					</div>
				{:else if roll.stat === 'Party'}
					<div class="space-y-0.5">
						<label class="text-xs text-gray-500" for={`stat-roll-target-${roll.actionId}`}
							>Party</label
						>
						<select
							class="border rounded w-full px-1 py-0.5 text-sm"
							id={`stat-roll-target-${roll.actionId}`}
							value={roll.target}
							onchange={(e) =>
								updateStatRoll(roll.actionId, { target: (e.target as HTMLSelectElement).value })}
						>
							{#each ALL_PARTIES as p (p)}<option value={p}>{p}</option>{/each}
						</select>
					</div>
				{:else}
					<div class="flex gap-1">
						<select
							class="border rounded flex-1 px-1 py-0.5 text-sm"
							bind:value={regionSelects[roll.actionId]}
						>
							{#each ALL_REGIONS as r (r)}<option value={r}>{r}</option>{/each}
						</select>
						<select
							class="border rounded flex-1 px-1 py-0.5 text-sm"
							bind:value={partySelects[roll.actionId]}
						>
							{#each ALL_PARTIES as p (p)}<option value={p}>{p}</option>{/each}
						</select>
					</div>
				{/if}

				<!-- Direction override -->
				<div class="flex items-center gap-3 text-xs">
					<span class="text-gray-500">Direction:</span>
					<label class="flex items-center gap-1">
						<input
							type="radio"
							value={1}
							checked={roll.directionHint === 1}
							onchange={() => updateStatRoll(roll.actionId, { directionHint: 1 })}
						/>
						Positive
					</label>
					<label class="flex items-center gap-1">
						<input
							type="radio"
							value={-1}
							checked={roll.directionHint === -1}
							onchange={() => updateStatRoll(roll.actionId, { directionHint: -1 })}
						/>
						Negative
					</label>
				</div>

				<!-- Reason -->
				<div class="space-y-0.5">
					<label class="text-xs text-gray-500" for={`stat-roll-reason-${roll.actionId}`}
						>Reason (required for positive)</label
					>
					<input
						type="text"
						placeholder="One-line in-world justification"
						id={`stat-roll-reason-${roll.actionId}`}
						class="border rounded w-full px-2 py-1 text-sm"
						value={roll.reason}
						oninput={(e) =>
							updateStatRoll(roll.actionId, { reason: (e.target as HTMLInputElement).value })}
					/>
				</div>

				<div class="flex gap-2">
					<button
						onclick={() => confirm(roll.actionId)}
						class="flex-1 bg-orange-700 text-white px-3 py-1.5 rounded text-sm hover:bg-orange-800"
					>
						Confirm & Apply
					</button>
					<button
						onclick={() => removeStatRoll(roll.actionId)}
						class="px-3 py-1.5 rounded border text-sm text-gray-500 hover:bg-gray-50"
					>
						Skip
					</button>
				</div>
			</div>
		{/each}
	</div>
{/if}
