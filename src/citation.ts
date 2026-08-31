/**
 * Citation resolution.
 *
 * Verified against a real export:
 *  - New format (2026-08+): `[reference:N]` — 0-based index into the message's
 *    merged search-result list (all SEARCH + TOOL_SEARCH fragments, in order).
 *  - Old format:             `[citation:N]` — 1-based index into the same list.
 *
 * The web UI renders the badge as "N+1" (reference) / "N" (citation).
 */
import type { Node } from './types';
import { collectSearchResults } from './model';

const REFERENCE_RE = /\[reference:(\d+)\]/g;
const CITATION_RE = /\[citation:(\d+)\]/g;

export interface CitationLink {
  kind: 'reference' | 'citation';
  index: number; // as written in the source
  url: string | null;
  title: string;
  badge: string;
}

/** Resolve one marker against the message's merged search results. */
function resolve(
  kind: 'reference' | 'citation',
  index: number,
  node: Node | null,
): CitationLink {
  const results = node ? collectSearchResults(node) : [];
  const listIndex = kind === 'reference' ? index : index - 1;
  const r = results[listIndex];
  return {
    kind,
    index,
    url: r ? r.url : null,
    title: r ? r.title : '',
    badge: kind === 'reference' ? String(index + 1) : String(index),
  };
}

/** Collect all citation markers present in a markdown source, resolved. */
export function collectCitations(content: string, node: Node | null): CitationLink[] {
  const links: CitationLink[] = [];
  for (const m of content.matchAll(REFERENCE_RE)) {
    links.push(resolve('reference', Number(m[1]), node));
  }
  for (const m of content.matchAll(CITATION_RE)) {
    links.push(resolve('citation', Number(m[1]), node));
  }
  return links;
}

/**
 * Replace citation markers with HTML placeholder spans. Using spans instead
 * of plain text tokens is important: marked preserves raw inline HTML and URL
 * autolinking stops at '<', so the marker can never be absorbed into a URL.
 */
export function maskCitations(content: string): string {
  return content
    .replace(REFERENCE_RE, '<span data-citref="$1"></span>')
    .replace(CITATION_RE, '<span data-citcit="$1"></span>');
}

/** Swap placeholder spans back into citation anchor links. */
export function restoreCitations(html: string, node: Node | null): string {
  return html
    .replace(/<span data-citref="(\d+)"><\/span>/g, (_s, n: string) =>
      renderAnchor(resolve('reference', Number(n), node)),
    )
    .replace(/<span data-citcit="(\d+)"><\/span>/g, (_s, n: string) =>
      renderAnchor(resolve('citation', Number(n), node)),
    );
}

export function renderAnchor(l: CitationLink): string {
  const cls = 'citation-link';
  const title = escapeHtml(l.title || (l.url ?? ''));
  if (!l.url) {
    return `<span class="${cls} citation-missing" title="${title}">${l.badge}</span>`;
  }
  return `<a class="${cls}" href="${escapeHtml(l.url)}" target="_blank" rel="noopener" title="${title}">${l.badge}</a>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
