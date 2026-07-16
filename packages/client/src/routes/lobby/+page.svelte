<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { api } from '$lib/api.js';
  import { runtimeConfig } from '$lib/runtime.js';
  import PlayerJoinForm from '$lib/components/PlayerJoinForm.svelte';
  import type { CreateSessionResponse } from '@lmh/types';

  let sessionId  = $state('');
  let gmToken    = $state('');
  let sessionName = $state('');
  let joinId     = $state('');   // manual "join by ID" input
  let error      = $state('');
  let creating   = $state(false);

  let removed = $state(false);
  const sharePlayerBaseUrl = $derived($runtimeConfig.sharePlayerBaseUrl ?? page.url.origin);

  function getSharePlayerLink() {
    return `${sharePlayerBaseUrl}/lobby?session=${sessionId}`;
  }

  // If the URL has ?session=<id>, jump straight to the join form.
  onMount(() => {
    const fromUrl = page.url.searchParams.get('session');
    if (fromUrl) sessionId = fromUrl;
    if (page.url.searchParams.get('removed') === '1') removed = true;
  });

  async function createSession() {
    if (!sessionName.trim()) { error = 'Session name is required.'; return; }
    error = '';
    creating = true;
    try {
      const res = await api.post<CreateSessionResponse>('/api/v1/sessions', { name: sessionName });
      sessionId = res.id;
      gmToken = res.gmToken;
      localStorage.setItem(`lmh:gm:${res.id}`, res.gmToken);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create session.';
    } finally {
      creating = false;
    }
  }

  function joinExisting() {
    if (!joinId.trim()) return;
    sessionId = joinId.trim();
  }

  function onJoined(playerId: string) {
    goto(`/session/${sessionId}?player=${encodeURIComponent(playerId)}`);
  }
</script>

<main class="max-w-lg mx-auto p-8 space-y-6">
  <h1 class="text-2xl font-bold">Let's Make History</h1>

  {#if removed}
    <div class="border border-amber-400 bg-amber-50 rounded p-3 text-sm text-amber-800">
      Your senator was removed from the game by the GM. You can re-join below as a new senator.
    </div>
  {/if}

  {#if !sessionId}
    <section class="border rounded p-4 space-y-2">
      <h2 class="font-semibold">Create a new session <span class="text-xs text-gray-400 font-normal">(GM)</span></h2>
      <input class="border p-2 w-full rounded" bind:value={sessionName} placeholder="Session name" />
      {#if error}<p class="text-sm text-red-600">{error}</p>{/if}
      <button
        class="bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50 w-full"
        onclick={createSession}
        disabled={creating}>
        {creating ? 'Creating\u2026' : 'Create Session'}
      </button>
    </section>

    <section class="border rounded p-4 space-y-2">
      <h2 class="font-semibold">Join an existing session <span class="text-xs text-gray-400 font-normal">(Player)</span></h2>
      <p class="text-xs text-gray-500">Ask your GM for the session ID, or use the share link they sent you.</p>
      <input class="border p-2 w-full rounded font-mono text-sm" bind:value={joinId} placeholder="Session ID" />
      <button
        class="bg-green-700 text-white px-4 py-2 rounded w-full disabled:opacity-50"
        onclick={joinExisting}
        disabled={!joinId.trim()}>
        Join Session
      </button>
    </section>
  {:else}
    <div class="border rounded p-4 space-y-1 bg-gray-50">
      <p class="text-xs text-gray-500">Session ID</p>
      <code class="text-sm break-all">{sessionId}</code>
      {#if gmToken}
        <div class="flex items-center gap-2 mt-2">
          <p class="text-xs text-gray-400">Share player link:</p>
          <code class="bg-white border rounded px-1 text-xs break-all">
            {getSharePlayerLink()}
          </code>
          <button
            onclick={() => navigator.clipboard.writeText(getSharePlayerLink())}
            class="shrink-0 text-xs bg-green-700 text-white px-2 py-0.5 rounded hover:bg-green-800">
            Copy
          </button>
        </div>
        <p class="text-xs text-gray-400">
          GM dashboard: <a href="/gm/{sessionId}" class="underline text-blue-600">/gm/{sessionId}</a>
        </p>
      {/if}
    </div>

    <PlayerJoinForm {sessionId} onJoined={onJoined} />
  {/if}
</main>
