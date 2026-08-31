/**
 * MathJax (tex-svg) integration.
 *
 * The MathJax es5 bundle is imported as a raw string and injected as a
 * <script> tag, so it gets inlined into the single-file build and works fully
 * offline. SVG output embeds glyphs as paths — no webfonts required.
 */
import mathjaxBundle from 'mathjax/es5/tex-svg.js?raw';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    MathJax?: any;
  }
}

let readyPromise: Promise<void> | null = null;

export function initMathJax(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise<void>((resolve) => {
    try {
      window.MathJax = {
        tex: {
          inlineMath: [
            ['$', '$'],
            ['\\(', '\\)'],
          ],
          displayMath: [
            ['$$', '$$'],
            ['\\[', '\\]'],
          ],
        },
        svg: { fontCache: 'global' },
        options: {
          skipHtmlTags: [
            'script', 'noscript', 'style', 'textarea', 'pre', 'code',
            'annotation', 'annotation-xml',
          ],
        },
        startup: {
          typeset: false,
          ready: () => {
            window.MathJax.startup.defaultReady();
            resolve();
          },
        },
      };
      const script = document.createElement('script');
      script.textContent = mathjaxBundle;
      document.head.appendChild(script);
    } catch (e) {
      console.warn('MathJax init failed', e);
      resolve();
    }
  });
  return readyPromise;
}

/** Typeset math inside a container element (async). */
export async function typesetMath(container: HTMLElement): Promise<void> {
  try {
    await initMathJax();
    if (window.MathJax?.typesetPromise) {
      await window.MathJax.typesetPromise([container]);
    }
  } catch (e) {
    console.warn('MathJax typeset failed', e);
  }
}
