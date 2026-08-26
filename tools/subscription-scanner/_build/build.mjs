/* Assemble a single self-contained index.html:
 *   head.html  +  <script type="module"> parse.mjs + subscan.mjs (import/export
 *   stripped) + app.js </script> </body></html>
 * The engine is inlined VERBATIM apart from the import/export keywords, so the
 * shipped page and the tested src can never drift. Run: node _build/build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, '..');

function stripExports(src) {
  const lines = src.split('\n');
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (skipping) {
      if (line.trim() === '};') skipping = false;
      continue;
    }
    if (/^export default \{.*\};\s*$/.test(line)) continue; // single-line re-export
    if (/^export default \{\s*$/.test(line)) {
      skipping = true;
      continue;
    }
    // Drop a leading `import ... ;` line (none expected, but be safe).
    if (/^import\s.*;\s*$/.test(line)) continue;
    out.push(line.replace(/^export\s+/, ''));
  }
  return out.join('\n');
}

const head = readFileSync(join(tool, '_build/head.html'), 'utf8');
const app = readFileSync(join(tool, '_build/app.js'), 'utf8');
const parse = stripExports(readFileSync(join(tool, 'src/parse.mjs'), 'utf8'));
const subscan = stripExports(readFileSync(join(tool, 'src/subscan.mjs'), 'utf8'));

const html =
  head +
  '\n<script type="module">\n' +
  '/* ENGINE — inlined verbatim from src/parse.mjs + src/subscan.mjs\n' +
  ' * (pure, dependency-free; only import/export keywords are removed for inlining). */\n' +
  parse +
  '\n' +
  subscan +
  '\n\n' +
  app +
  '\n</script>\n</body>\n</html>\n';

writeFileSync(join(tool, 'index.html'), html);
console.log('wrote index.html', html.length, 'bytes');
