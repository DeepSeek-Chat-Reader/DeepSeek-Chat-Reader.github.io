// Copies the single-file build output to ./index.html (the deploy artifact).
import { copyFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

function findHtml(dir, depth = 0) {
  if (!existsSync(dir) || depth > 3) return null;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name.endsWith('.html')) return p;
    try {
      const sub = findHtml(p, depth + 1);
      if (sub) return sub;
    } catch {
      /* not a dir */
    }
  }
  return null;
}

mkdirSync('dist', { recursive: true });
const built = findHtml(resolve('dist'));
if (!built) {
  console.error('[finalize] no built html found under dist/');
  process.exit(1);
}
copyFileSync(built, 'index.html');
console.log(`[finalize] ${built} -> index.html`);
