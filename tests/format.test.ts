/**
 * Regression tests against the real export files:
 *  - conversations.json        (new 2026-08 export, 12 conversations)
 *  - ExampleConversations.json (old 2025-09 sample)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeExport } from '../src/parser';
import { collectSearchResults, walkBranch } from '../src/model';
import { collectCitations, maskCitations, restoreCitations } from '../src/citation';
import { renderMarkdown } from '../src/render/markdown';
import { serializeConversations } from '../src/storage';

const NEW = readFileSync(resolve(__dirname, '../conversations.json'), 'utf-8');
const OLD = readFileSync(resolve(__dirname, '../ExampleConversations.json'), 'utf-8');

describe('parser: new export (conversations.json)', () => {
  const convs = normalizeExport(JSON.parse(NEW));

  it('parses all 12 conversations', () => {
    expect(convs).toHaveLength(12);
  });

  it('includes the two test conversations', () => {
    const ids = convs.map((c) => c.id);
    expect(ids).toContain('1fb61f51-ab6e-456e-bd98-77d2f1ddea12');
    expect(ids).toContain('c9429075-9fd0-4e20-876f-054596f10947');
  });

  it('recognizes the full fragment type set', () => {
    const types = new Set<string>();
    for (const c of convs) {
      for (const n of c.nodes.values()) {
        for (const f of n.message?.fragments ?? []) types.add(f.type);
      }
    }
    expect([...types].sort()).toEqual(
      ['FILE', 'REQUEST', 'RESPONSE', 'SEARCH', 'THINK', 'TOOL_OPEN', 'TOOL_SEARCH'].sort(),
    );
  });

  it('FILE fragments carry file_id/file_name/file_size', () => {
    const testConv = convs.find((c) => c.id === '1fb61f51-ab6e-456e-bd98-77d2f1ddea12')!;
    const files = [...testConv.nodes.values()]
      .flatMap((n) => n.message?.fragments ?? [])
      .filter((f) => f.kind === 'file');
    expect(files.length).toBeGreaterThanOrEqual(3);
    const first = files[0];
    expect(first).toMatchObject({ kind: 'file', type: 'FILE' });
    if (first.kind === 'file') {
      expect(first.files[0].fileId).toBeTruthy();
      expect(first.files[0].fileName).toBe('坍缩.txt');
      expect(first.files[0].fileSize).toBe(12557);
    }
  });

  it('auto-attachment message is FILE-only (no REQUEST)', () => {
    const testConv = convs.find((c) => c.id === '1fb61f51-ab6e-456e-bd98-77d2f1ddea12')!;
    const node11 = testConv.nodes.get('11')!;
    const types = node11.message!.fragments.map((f) => f.type);
    expect(types).toEqual(['FILE']);
  });

  it('maps branch children (node 3 has two children)', () => {
    const testConv = convs.find((c) => c.id === '1fb61f51-ab6e-456e-bd98-77d2f1ddea12')!;
    expect(testConv.nodes.get('3')!.childrenIds).toHaveLength(2);
    expect(testConv.nodes.get('5')!.childrenIds).toHaveLength(2);
    expect(testConv.nodes.get('8')!.childrenIds).toHaveLength(2);
  });
});

describe('parser: old export (ExampleConversations.json)', () => {
  const convs = normalizeExport(JSON.parse(OLD));

  it('still parses (backward compatibility)', () => {
    expect(convs.length).toBeGreaterThan(0);
    const first = convs[0];
    expect(first.id).toBe('0ca33d28-44ac-4afb-a48d-93c0f6b01d94');
    expect(first.nodes.has('root')).toBe(true);
  });

  it('handles old fragment types (REQUEST/RESPONSE/THINK)', () => {
    const first = convs[0];
    const node1 = first.nodes.get('1')!;
    expect(node1.message!.fragments.map((f) => f.type)).toContain('REQUEST');
  });
});

describe('citations (verified indexing rules)', () => {
  const convs = normalizeExport(JSON.parse(NEW));

  it('[reference:N] resolves 0-based into merged TOOL_SEARCH results', () => {
    const testConv = convs.find((c) => c.id === '1fb61f51-ab6e-456e-bd98-77d2f1ddea12')!;
    // node 4: single TOOL_SEARCH with 53 results
    const node4 = testConv.nodes.get('4')!;
    const results = collectSearchResults(node4);
    expect(results).toHaveLength(53);
    const resp = node4.message!.fragments.find((f) => f.type === 'RESPONSE')!;
    if (resp.kind !== 'text') throw new Error('unexpected');
    const cites = collectCitations(resp.content, node4);
    const ref1 = cites.find((c) => c.kind === 'reference' && c.index === 1)!;
    expect(ref1.url).toBe('https://www.163.com/dy/article/L5390ATB053469RG.html');
    expect(ref1.badge).toBe('2');
    // node 5: two TOOL_SEARCH merged -> 108 results
    const node5 = testConv.nodes.get('5')!;
    expect(collectSearchResults(node5)).toHaveLength(108);
  });

  it('[citation:N] resolves 1-based into SEARCH results (old format)', () => {
    const oldConv = convs.find((c) => c.id === 'dd806560-b7c3-4a33-bafb-4c0cfcad810b')!;
    const node2 = oldConv.nodes.get('2')!;
    const results = collectSearchResults(node2);
    expect(results).toHaveLength(10);
    const resp = node2.message!.fragments.find((f) => f.type === 'RESPONSE')!;
    if (resp.kind !== 'text') throw new Error('unexpected');
    const cites = collectCitations(resp.content, node2);
    const c1 = cites.find((c) => c.kind === 'citation' && c.index === 1)!;
    expect(c1.url).toBe('https://browse-export.arxiv.org/abs/2601.13859');
    expect(c1.badge).toBe('1');
    const c10 = cites.find((c) => c.kind === 'citation' && c.index === 10)!;
    expect(c10.url).toBe('https://wap.sciencenet.cn/mobile.php?type=detail&cat=yaowen&id=558922&mobile=1');
  });

  it('out-of-range citations yield url null (graceful)', () => {
    const testConv = convs.find((c) => c.id === '1fb61f51-ab6e-456e-bd98-77d2f1ddea12')!;
    const node4 = testConv.nodes.get('4')!;
    const resp = node4.message!.fragments.find((f) => f.type === 'RESPONSE')!;
    if (resp.kind !== 'text') throw new Error('unexpected');
    const cites = collectCitations(resp.content, node4);
    for (const c of cites) {
      if (c.kind === 'reference' && c.index >= 53) expect(c.url).toBeNull();
    }
  });

  it('mask -> markdown -> restore pipeline produces anchors', () => {
    const testConv = convs.find((c) => c.id === '1fb61f51-ab6e-456e-bd98-77d2f1ddea12')!;
    const node4 = testConv.nodes.get('4')!;
    const resp = node4.message!.fragments.find((f) => f.type === 'RESPONSE')!;
    if (resp.kind !== 'text') throw new Error('unexpected');
    const masked = maskCitations(resp.content);
    expect(masked).not.toContain('[reference:');
    const html = renderMarkdown(masked);
    const restored = restoreCitations(html, node4);
    expect(restored).toContain('class="citation-link"');
    expect(restored).toContain('https://www.163.com/dy/article/L5390ATB053469RG.html');
    expect(restored).not.toContain('data-citref');
    // markers directly after a URL must not be absorbed into the autolink href
    const hrefs = [...restored.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.every((h) => !h.includes('data-citref') && !h.includes('§'))).toBe(true);
  });

  it('serialize -> parse round-trip preserves structure', () => {
    const convs2 = normalizeExport(serializeConversations(convs) as never);
    expect(convs2).toHaveLength(convs.length);
    for (let i = 0; i < convs.length; i++) {
      const a = convs[i];
      const b = convs2[i];
      expect(b.id).toBe(a.id);
      expect(b.title).toBe(a.title);
      expect([...b.nodes.keys()].sort()).toEqual([...a.nodes.keys()].sort());
      // spot check the FILE fragment survived with snake_case restored
      const a11 = a.nodes.get('11');
      const b11 = b.nodes.get('11');
      if (a11?.message && b11?.message) {
        const fa = a11.message.fragments.find((f) => f.kind === 'file');
        const fb = b11.message.fragments.find((f) => f.kind === 'file');
        if (fa?.kind === 'file' && fb?.kind === 'file') {
          expect(fb.files[0].fileName).toBe(fa.files[0].fileName);
          expect(fb.files[0].fileSize).toBe(fa.files[0].fileSize);
        }
      }
    }
  });
});

describe('model: branch walking', () => {
  const convs = normalizeExport(JSON.parse(NEW));
  const testConv = convs.find((c) => c.id === '1fb61f51-ab6e-456e-bd98-77d2f1ddea12')!;

  it('walks the default (first) branch chain root -> 4 (first branch leaf)', () => {
    const chain = walkBranch(testConv, testConv.root, new Map(), 'first');
    const ids = chain.map((n) => n.id);
    expect(ids[ids.length - 1]).toBe('4');
    expect(ids).toEqual(['root', '1', '2', '3', '4']);
  });

  it('follows explicit branch choices', () => {
    const path = new Map<string, number>([
      ['3', 1], // branch 2 of the search question
      ['5', 1], // branch 2 of the attachment question
      ['8', 1], // branch 2 of the edited attachment
    ]);
    const chain = walkBranch(testConv, testConv.root, path, 'first');
    const ids = chain.map((n) => n.id);
    expect(ids).toContain('10');
    expect(ids).toContain('11');
    expect(ids).toContain('14');
  });
});
