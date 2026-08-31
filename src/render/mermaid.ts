/**
 * Mermaid diagram rendering. Mermaid is bundled by Vite and inlined into the
 * single-file build; the diagrams are rendered client-side to SVG.
 */
import mermaid from 'mermaid';

let initialized = false;

export function initMermaid(): void {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'default',
    fontFamily: 'inherit',
  });
  initialized = true;
}

/** Render mermaid source to an SVG string; returns null on failure. */
export async function renderMermaid(code: string): Promise<string | null> {
  initMermaid();
  try {
    const id = `mmd-${Math.random().toString(36).slice(2, 10)}`;
    const { svg } = await mermaid.render(id, code);
    return svg;
  } catch (e) {
    console.warn('mermaid render failed:', e);
    return null;
  }
}
