import { writable } from 'svelte/store';

export type RuntimeConfig = {
  sharePlayerBaseUrl: string | null;
  internetInviteSource: string;
};

const { subscribe, set } = writable<RuntimeConfig>({
  sharePlayerBaseUrl: null,
  internetInviteSource: 'unknown',
});

export const runtimeConfig = { subscribe };

export function setRuntimeConfig(config: Partial<RuntimeConfig>) {
  set({
    sharePlayerBaseUrl: config.sharePlayerBaseUrl?.trim() || null,
    internetInviteSource: config.internetInviteSource?.trim() || 'unknown',
  });
}