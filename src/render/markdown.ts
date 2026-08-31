/**
 * Markdown rendering via marked (GFM). Code highlighting is done in the DOM
 * afterwards (enhanceCodeBlocks) so we don't need the marked-highlight plugin.
 */
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}
