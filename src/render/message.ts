/**
 * Message rendering: turns one mapping node (message) into DOM.
 * Fragment order is significant: THINK can interleave with tool fragments.
 */
import hljs from 'highlight.js';
import type { Node, ParsedFragment } from '../types';
import { isFile, isSearch, isText, isToolOpen } from '../types';
import { escapeHtml, maskCitations, restoreCitations } from '../citation';
import { renderMarkdown } from './markdown';
import { typesetMath } from './math';
import { renderMermaid } from './mermaid';
import { t } from '../i18n';
import { formatDateTime } from '../parser';

/** Human-readable fragment type label for headers. */
function fragmentTypeLabel(f: ParsedFragment): string {
  switch (f.type) {
    case 'REQUEST': return t('request');
    case 'RESPONSE': return t('response');
    case 'THINK': return t('thinking');
    case 'SEARCH':
    case 'TOOL_SEARCH': return t('search');
    case 'FILE': return t('fileAttachments');
    case 'TOOL_OPEN': return t('browsedPages');
    default: return f.type;
  }
}

function uniqueTypes(node: Node): string[] {
  if (!node.message) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of node.message.fragments) {
    if (!seen.has(f.type)) {
      seen.add(f.type);
      out.push(f.type);
    }
  }
  return out;
}

/** Build the full message element for a node. */
export function renderMessage(node: Node): HTMLElement {
  const msg = node.message;
  const el = document.createElement('div');
  el.className = 'message';
  if (!msg) return el;

  // Header
  const header = document.createElement('div');
  header.className = 'message-header';
  const typeText = uniqueTypes(node).join(' + ') || t('unknownType');
  const isReasoner = msg.model === 'deepseek-reasoner';
  header.innerHTML = `
    <div>
      <span class="message-type">${escapeHtml(typeText)}</span>
      <span class="model-tag ${isReasoner ? 'reasoner' : 'chat'}">${escapeHtml(msg.model)}</span>
    </div>
    <div class="timestamp">${escapeHtml(formatDateTime(msg.insertedAt))}</div>
  `;
  el.appendChild(header);

  // Content: fragments in order
  const content = document.createElement('div');
  content.className = 'message-content';
  let first = true;
  for (const f of msg.fragments) {
    const fragEl = renderFragment(f, node);
    if (!first) {
      const divider = document.createElement('div');
      divider.className = 'fragment-divider';
      content.appendChild(divider);
    }
    first = false;
    content.appendChild(fragEl);
  }
  el.appendChild(content);
  return el;
}

function renderFragment(f: ParsedFragment, node: Node): HTMLElement {
  const frag = document.createElement('div');
  frag.className = `fragment ${f.type.toLowerCase()}`;

  const header = document.createElement('div');
  header.className = 'fragment-header';
  header.innerHTML = `<span>${escapeHtml(fragmentTypeLabel(f))}</span>`;
  frag.appendChild(header);

  const body = document.createElement('div');
  body.className = 'fragment-body';

  if (isText(f)) {
    if (f.type === 'REQUEST') {
      // Plain text, escaped (never trust user input as HTML)
      const pre = document.createElement('div');
      pre.className = 'request-text';
      pre.textContent = f.content;
      body.appendChild(pre);
    } else if (f.type === 'THINK') {
      // Collapsible thinking block
      const details = document.createElement('details');
      details.className = 'think-block';
      const summary = document.createElement('summary');
      summary.textContent = t('thinking');
      details.appendChild(summary);
      const inner = document.createElement('div');
      inner.innerHTML = renderMarkdown(f.content);
      details.appendChild(inner);
      body.appendChild(details);
    } else {
      // RESPONSE: markdown + citations
      const masked = maskCitations(f.content);
      const html = renderMarkdown(masked);
      const withCites = restoreCitations(html, node);
      const div = document.createElement('div');
      div.innerHTML = withCites;
      body.appendChild(div);
    }
  } else if (isFile(f)) {
    const list = document.createElement('div');
    list.className = 'file-list';
    for (const file of f.files) {
      const chip = document.createElement('div');
      chip.className = 'file-chip';
      chip.innerHTML = `
        <i class="fa-regular fa-file-lines"></i>
        <span class="file-name">${escapeHtml(file.fileName)}</span>
        <span class="file-size">${formatFileSize(file.fileSize)}</span>
      `;
      list.appendChild(chip);
    }
    body.appendChild(list);
  } else if (isSearch(f)) {
    const details = document.createElement('details');
    details.className = 'search-block';
    details.open = false;
    const summary = document.createElement('summary');
    summary.textContent = `${t('searchResultsTitle')} (${f.results.length})`;
    details.appendChild(summary);
    const list = document.createElement('div');
    list.className = 'search-list';
    for (const r of f.results) {
      const item = document.createElement('div');
      item.className = 'search-result';
      item.innerHTML = `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title || r.url)}</a>`;
      list.appendChild(item);
    }
    details.appendChild(list);
    body.appendChild(details);
  } else if (isToolOpen(f)) {
    const chip = document.createElement('span');
    chip.className = 'tool-open-chip';
    chip.innerHTML = `<i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(t('browsedPages'))}`;
    body.appendChild(chip);
  } else {
    // Unknown fragment type: dump raw JSON for debugging
    const pre = document.createElement('pre');
    pre.className = 'unknown-fragment';
    pre.textContent = JSON.stringify(f, null, 2);
    body.appendChild(pre);
  }

  frag.appendChild(body);
  return frag;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Post-process a rendered message container:
 *  - wrap code blocks with language header + copy/download actions
 *  - highlight code (highlight.js)
 *  - convert ```mermaid blocks to SVG diagrams
 *  - typeset math (MathJax)
 */
export async function postProcessMessage(container: HTMLElement): Promise<void> {
  enhanceCodeBlocks(container);
  await renderMermaidBlocks(container);
  // MathJax: only typeset math in assistant content (response / think), not user input
  const targets = container.querySelectorAll<HTMLElement>(
    '.fragment.response .fragment-body, .fragment.think .fragment-body',
  );
  for (const t of targets) {
    await typesetMath(t);
  }
}

function enhanceCodeBlocks(container: HTMLElement): void {
  container.querySelectorAll('pre code').forEach((codeEl) => {
    const code = codeEl as HTMLElement;
    const pre = code.parentElement as HTMLElement;
    if (!pre || pre.classList.contains('code-block') || pre.closest('.code-block')) return;
    // mermaid blocks are replaced entirely by renderMermaidBlocks
    if (code.classList.contains('language-mermaid')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';

    let lang = getLanguageClass(code.className);
    if (lang === 'txt') {
      lang = detectLanguage(code.textContent ?? '');
      code.className = `language-${lang}`;
    }
    try {
      hljs.highlightElement(code);
    } catch {
      /* ignore highlight failures */
    }

    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `
      <span class="code-lang">${escapeHtml(lang.toUpperCase())}</span>
      <div class="code-actions">
        <button class="code-btn copy-code">${escapeHtml(t('copyCode'))}</button>
        <button class="code-btn download-code">${escapeHtml(t('downloadCode'))}</button>
      </div>
    `;
    (header.querySelector('.copy-code') as HTMLButtonElement).addEventListener('click', () => {
      const text = code.innerText;
      navigator.clipboard?.writeText(text).then(() => {
        const btn = header.querySelector('.copy-code') as HTMLButtonElement;
        btn.textContent = t('copied');
        setTimeout(() => (btn.textContent = t('copyCode')), 2000);
      });
    });
    (header.querySelector('.download-code') as HTMLButtonElement).addEventListener('click', () => {
      const blob = new Blob([code.innerText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `code.${extForLang(lang)}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    pre.parentElement?.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });
}

async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const blocks = [...container.querySelectorAll('pre code.language-mermaid')];
  for (const codeEl of blocks) {
    const code = codeEl as HTMLElement;
    const pre = code.parentElement as HTMLElement;
    const svg = await renderMermaid(code.textContent ?? '');
    if (!svg) continue; // keep the code block as-is on failure
    const holder = document.createElement('div');
    holder.className = 'mermaid';
    holder.innerHTML = svg;
    // Keep a heading + its diagram together when printing: wrap both in an
    // unsplittable container (break-after:avoid on headings is unreliable in
    // Chromium, which orphaning the "Mermaid" heading on its own page).
    const prev = pre.previousElementSibling;
    const wrap = document.createElement('div');
    wrap.className = 'print-keep';
    if (prev && /^H[1-6]$/.test(prev.tagName)) {
      prev.replaceWith(wrap);
      wrap.appendChild(prev);
      pre.remove(); // the diagram replaces the source <pre>
    } else {
      pre.replaceWith(wrap);
    }
    wrap.appendChild(holder);
  }
}

function getLanguageClass(className: string): string {
  const m = className.match(/language-([\w-]+)/);
  return m ? m[1] : 'txt';
}

function detectLanguage(code: string): string {
  if (code.includes('def ') && code.includes(':')) return 'python';
  if (code.includes('function') && code.includes('{')) return 'javascript';
  if (/^#!\/bin\/(ba)?sh/.test(code) || code.includes('$(')) return 'bash';
  if (code.includes('SELECT') && code.includes('FROM')) return 'sql';
  if (code.includes('<!DOCTYPE') || code.includes('<html')) return 'html';
  if (code.includes('#include')) return 'cpp';
  if (code.includes('package ') && code.includes('import ')) return 'go';
  if (code.includes('fn ') && code.includes('let ')) return 'rust';
  return 'txt';
}

function extForLang(lang: string): string {
  const map: Record<string, string> = {
    javascript: 'js', typescript: 'ts', python: 'py', csharp: 'cs',
    bash: 'sh', shell: 'sh', sql: 'sql', html: 'html', css: 'css',
    json: 'json', markdown: 'md', txt: 'txt', java: 'java', cpp: 'cpp',
    go: 'go', rust: 'rs', php: 'php', ruby: 'rb', yaml: 'yaml', xml: 'xml',
  };
  return map[lang] ?? lang;
}
