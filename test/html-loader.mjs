// Node loads the actual Worker fetch handler; only Wrangler's HTML import is adapted.
import { readFile } from 'node:fs/promises';
export async function load(url, context, nextLoad) {
  if (url.endsWith('/home.html')) {
    return { format: 'module', shortCircuit: true,
      source: `export default ${JSON.stringify(await readFile(new URL(url), 'utf8'))};` };
  }
  return nextLoad(url, context);
}
