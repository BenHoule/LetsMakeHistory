<script lang="ts">
  import { onMount } from 'svelte';

  type InlinePart =
    | { type: 'text'; value: string }
    | { type: 'strong'; value: string }
    | { type: 'em'; value: string }
    | { type: 'code'; value: string };

  type GuideBlock =
    | { type: 'h1'; parts: InlinePart[] }
    | { type: 'h2'; parts: InlinePart[] }
    | { type: 'p'; parts: InlinePart[] }
    | { type: 'ul'; items: InlinePart[][] }
    | { type: 'table'; headers: InlinePart[][]; rows: InlinePart[][][] };

  let loading = $state(true);
  let error = $state('');
  let blocks = $state<GuideBlock[]>([]);

  function normalizeGuide(text: string) {
    return text.replace(/\\([^\s])/g, '$1');
  }

  function parseInline(text: string): InlinePart[] {
    const parts: InlinePart[] = [];
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
      }
      const token = match[0];
      if (token.startsWith('**')) parts.push({ type: 'strong', value: token.slice(2, -2) });
      else if (token.startsWith('*')) parts.push({ type: 'em', value: token.slice(1, -1) });
      else parts.push({ type: 'code', value: token.slice(1, -1) });
      lastIndex = match.index + token.length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', value: text.slice(lastIndex) });
    }

    return parts;
  }

  function renderTable(lines: string[]): GuideBlock {
    const rows = lines
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => parseInline(cell.trim())));
    const [header, , ...body] = rows;
    return { type: 'table', headers: header, rows: body };
  }

  function parseMarkdown(text: string): GuideBlock[] {
    const lines = normalizeGuide(text).split(/\r?\n/);
    const nextBlocks: GuideBlock[] = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index].trim();
      if (!line) {
        index += 1;
        continue;
      }

      if (line.startsWith('|')) {
        const tableLines: string[] = [];
        while (index < lines.length && lines[index].trim().startsWith('|')) {
          tableLines.push(lines[index]);
          index += 1;
        }
        nextBlocks.push(renderTable(tableLines));
        continue;
      }

      if (line.startsWith('# ')) {
        nextBlocks.push({ type: 'h1', parts: parseInline(line.slice(2)) });
        index += 1;
        continue;
      }

      if (line.startsWith('## ')) {
        nextBlocks.push({ type: 'h2', parts: parseInline(line.slice(3)) });
        index += 1;
        continue;
      }

      if (line.startsWith('* ')) {
        const items: string[] = [];
        while (index < lines.length && lines[index].trim().startsWith('* ')) {
          items.push(lines[index].trim().slice(2));
          index += 1;
        }
        nextBlocks.push({ type: 'ul', items: items.map(parseInline) });
        continue;
      }

      const paragraph: string[] = [];
      while (index < lines.length) {
        const nextLine = lines[index].trim();
        if (!nextLine || nextLine.startsWith('#') || nextLine.startsWith('* ') || nextLine.startsWith('|')) break;
        paragraph.push(nextLine);
        index += 1;
      }
      nextBlocks.push({ type: 'p', parts: parseInline(paragraph.join(' ')) });
    }

    return nextBlocks;
  }

  onMount(async () => {
    try {
      const response = await fetch('/rules-guide.md');
      if (!response.ok) throw new Error(`Failed to load guide (${response.status})`);
      blocks = parseMarkdown(await response.text());
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load guide.';
    } finally {
      loading = false;
    }
  });
</script>

{#snippet inline(parts: InlinePart[])}
  {#each parts as part, index (`${part.type}-${index}-${part.value}`)}
    {#if part.type === 'strong'}<strong>{part.value}</strong>
    {:else if part.type === 'em'}<em>{part.value}</em>
    {:else if part.type === 'code'}<code style="background:#e8e1cc;padding:1px 4px;border-radius:4px;font-size:0.95em;">{part.value}</code>
    {:else}{part.value}
    {/if}
  {/each}
{/snippet}

{#if loading}
  <p style="font-size:14px;color:#7a7362;">Loading guide…</p>
{:else if error}
  <div style="padding:12px 14px;border:1px solid #a32d2d;border-radius:6px;background:#fbe8e8;color:#8a1f1f;font-size:14px;">
    {error}
  </div>
{:else}
  <div>
    {#each blocks as block, index (`${block.type}-${index}`)}
      {#if block.type === 'h1'}
        <h2 style="font-family:Georgia,serif;font-size:28px;margin:28px 0 12px;">{@render inline(block.parts)}</h2>
      {:else if block.type === 'h2'}
        <h3 style="font-family:Georgia,serif;font-size:20px;margin:24px 0 10px;">{@render inline(block.parts)}</h3>
      {:else if block.type === 'p'}
        <p style="margin:0 0 14px;line-height:1.75;">{@render inline(block.parts)}</p>
      {:else if block.type === 'ul'}
        <ul style="margin:12px 0 16px 20px;padding:0;line-height:1.65;">
          {#each block.items as item, itemIndex (`${index}-${itemIndex}`)}
            <li style="margin:0 0 8px;">{@render inline(item)}</li>
          {/each}
        </ul>
      {:else if block.type === 'table'}
        <div style="overflow:auto;margin:16px 0;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr>
                {#each block.headers as cell, cellIndex (`h-${cellIndex}`)}
                  <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #b8ae8e;background:#e8e1cc;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#7a7362;">{@render inline(cell)}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each block.rows as row, rowIndex (`r-${rowIndex}`)}
                <tr>
                  {#each row as cell, cellIndex (`c-${rowIndex}-${cellIndex}`)}
                    <td style="padding:8px 10px;border-bottom:1px solid #d8d0b8;vertical-align:top;">{@render inline(cell)}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/each}
  </div>
{/if}