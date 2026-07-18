<script lang="ts">
  import RulesGuideContent from '$lib/components/RulesGuideContent.svelte';

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/lobby';
  }
</script>

<svelte:head>
  <title>Rules Guide | Let's Make History</title>
</svelte:head>

<main style="min-height:100vh;background:#faf7f0;color:#232019;padding:24px 20px 56px;">
  <div style="max-width:980px;margin:0 auto;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:20px;border-bottom:2px solid #232019;padding-bottom:12px;">
      <div>
        <h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 6px;">Let's Make History</h1>
        <p style="margin:0;color:#7a7362;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;">Rules Guide</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button onclick={goBack}
          style="padding:8px 12px;background:#faf7f0;color:#232019;border:1px solid #232019;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;">
          Back
        </button>
        <button onclick={() => window.open('/rules-guide.md', '_blank', 'noopener,noreferrer')}
          style="padding:8px 12px;background:#1f3a5f;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;">
          Open Raw Markdown
        </button>
      </div>
    </div>

    <div style="background:#f1ecdf;border:1px solid #d8d0b8;border-radius:8px;padding:18px 20px;">
      <RulesGuideContent />
    </div>
  </div>
</main>
