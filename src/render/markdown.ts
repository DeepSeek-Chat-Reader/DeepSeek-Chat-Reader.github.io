/**
 * Markdown rendering via marked (GFM) + a math extension.
 *
 * The math extension tokenizes `$...$` / `$$...$$` BEFORE marked's emphasis
 * pass, so underscores/asterisks inside LaTeX (e.g. `x_i`, `\prod_{j=1}^{N}`)
 * cannot corrupt the formula. The delimiters are preserved inside the output
 * span so MathJax can find and typeset them afterwards.
 */
import { marked } from 'marked';

const mathExtension: marked.TokenizerAndRendererExtension = {
  name: 'math',
  level: 'inline',
  start(src: string): number | undefined {
    return src.indexOf('$');
  },
  tokenizer(src: string) {
    if (src.startsWith('$$')) {
      const m = src.match(/^\$\$([\s\S]+?)\$\$/);
      if (m) {
        return { type: 'math', raw: m[0], text: m[0] } as unknown as marked.Token;
      }
    }
    const m = src.match(/^\$([^\$\n]+)\$/);
    if (m) {
      return { type: 'math', raw: m[0], text: m[0] } as unknown as marked.Token;
    }
    return undefined;
  },
  renderer(token: marked.Tokens.Generic): string {
    const raw = token.text as string;
    if (raw.startsWith('$$')) {
      return `<div class="math-display">${raw}</div>`;
    }
    return `<span class="math-inline">${raw}</span>`;
  },
};

marked.use({ extensions: [mathExtension] });
marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}
