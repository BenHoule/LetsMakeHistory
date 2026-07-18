import { writable } from 'svelte/store';

export interface StatNotification {
	id: string;
	text: string;
	positive: boolean;
}

const { subscribe, update } = writable<StatNotification[]>([]);
export const statNotifications = { subscribe };

export function pushNotification(text: string, positive: boolean) {
	const id = Math.random().toString(36).slice(2);
	update((n) => [...n, { id, text, positive }]);
	setTimeout(() => update((n) => n.filter((x) => x.id !== id)), 6000);
}
