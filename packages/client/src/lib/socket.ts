import { io, type Socket } from 'socket.io-client';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import type {
	ClientToServerEvents,
	PlayerActionVotedEvent,
	PlayerRemovedEvent,
	PlayerState,
	ServerToClientEvents,
	SessionStore
} from '@lmh/types';
import {
	sessionStore,
	setPhase,
	setTurn,
	appendDelta,
	setLedger,
	recordBillVote,
	setNationalStatus,
	setPlayers,
	updatePlayerStat
} from '../stores/session.js';
import { addPlayerAction, addStatRoll, setVisibility, visibilitySettings } from '../stores/gm.js';
import {
	addActionVote,
	removeActionVote,
	recordPlayerVote,
	addVoteResult
} from '../stores/votes.js';
import { pushNotification } from '../stores/notifications.js';

type SessionStoreWithPlayer = SessionStore & { _playerId?: string };

// Initialised at module load time so it is always defined before any
// component effect or event handler tries to call socket.emit().
// The `browser` guard prevents this running during SSR.
export let socket: Socket<ServerToClientEvents, ClientToServerEvents> = undefined!;

if (browser) {
	// In production, sentinel/empty means connect to the same origin as the page.
	const wsUrl =
		publicEnv.PUBLIC_WS_URL && publicEnv.PUBLIC_WS_URL !== '__SAME_ORIGIN__'
			? publicEnv.PUBLIC_WS_URL
			: window.location.origin;
	socket = io(wsUrl, { transports: ['websocket', 'polling'] });

	socket.on('error', (e) => console.error('WS error:', e.code, e.message));
	socket.on('phase_changed', (e) => setPhase(e.phase));
	socket.on('turn_generated', (e) => setTurn(e.turn, e.bills));
	socket.on('stat_delta', (delta) => {
		appendDelta(delta);
		// Patch the live players array so StatSidebar updates without a refresh.
		if (delta.stat === 'Approval' || delta.stat === 'Recognition' || delta.stat === 'Rizz') {
			updatePlayerStat(delta.target, delta.stat, delta.delta);
		}
		// Show a toast notification to players based on the GM visibility settings.
		const vis = get(visibilitySettings);
		if (vis.allRolls || vis.ownRolls) {
			const store = get(sessionStore) as SessionStoreWithPlayer;
			const myPlayer = store.players?.find((p: PlayerState) => p.id === store._playerId);
			const isOwn = myPlayer && delta.target === myPlayer.name;
			if (vis.allRolls || (vis.ownRolls && isOwn)) {
				const sign = delta.delta >= 0 ? '+' : '';
				pushNotification(
					`${delta.stat} (${delta.target}): ${sign}${delta.delta} \u2014 ${delta.reason}`,
					delta.delta >= 0
				);
			}
		}
	});
	socket.on('ledger_finalized', (e) => setLedger(e.ledger, e.turnIndex, e.year));
	socket.on('vote_recorded', (e) => {
		const playerId = (get(sessionStore) as SessionStoreWithPlayer)._playerId;
		if (playerId === e.playerId) {
			recordBillVote(e.billId, e.vote);
		}
	});
	socket.on('national_status_updated', (e) => {
		setNationalStatus(e.financial, e.social, e.foreign);
	});
	socket.on('players_updated', (e) => {
		setPlayers(e.players);
	});
	socket.on('player_action_submitted', (e) => {
		addPlayerAction({
			actionId: e.actionId,
			turnIndex: e.turnIndex,
			year: e.year,
			playerName: e.playerName,
			party: e.party,
			region: e.region,
			type: e.type,
			content: e.content,
			prompt: e.prompt,
			receivedAt: new Date().toISOString()
		});
	});
	socket.on('action_stat_roll', (e) => {
		addStatRoll({
			actionId: e.actionId,
			playerName: e.playerName,
			actionContent: e.actionContent,
			sizeCategory: e.sizeCategory,
			directionHint: e.directionHint
		});
	});
	socket.on('legislative_vote_requested', (e) => {
		addActionVote({
			actionId: e.actionId,
			playerName: e.playerName,
			party: e.party,
			content: e.content
		});
	});
	// Player votes are broadcast to all — update live tally in vote card
	socket.on('player_action_voted', (e: PlayerActionVotedEvent) => {
		recordPlayerVote(e.actionId, e.playerName, e.vote);
	});
	// If the GM removes this player, redirect them back to lobby
	socket.on('player_removed', (e: PlayerRemovedEvent) => {
		const store = get(sessionStore) as SessionStoreWithPlayer;
		if (e.playerId === store._playerId) {
			// Clear stored identity so they can re-join as a new senator
			const sid = store.session?.id ?? '';
			sessionStorage.removeItem(`lmh:player:${sid}`);
			localStorage.removeItem(`lmh:player:${sid}`);
			window.location.href = `/lobby?session=${sid}&removed=1`;
		}
	});
	socket.on('action_vote_result', (e) => {
		removeActionVote(e.actionId);
		addVoteResult({
			actionId: e.actionId,
			playerName: '',
			content: '',
			yeas: e.yeas,
			nays: e.nays,
			abstains: e.abstains,
			passed: e.passed,
			resolvedAt: new Date().toISOString()
		});
		pushNotification(
			`Legislative vote: ${e.voteResult} (Yea ${e.yeas}, Nay ${e.nays}, Abstain ${e.abstains})`,
			e.passed
		);
	});
	socket.on('visibility_updated', (e) => {
		setVisibility(e.settings);
	});
}
