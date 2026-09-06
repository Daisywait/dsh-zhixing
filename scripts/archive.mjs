import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { commit, readArchive, handoff } from './store.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const [command, file] = process.argv.slice(2);
  if (command === 'show') console.log(JSON.stringify(await readArchive(root), null, 2));
  else if (command === 'handoff') console.log(handoff(await readArchive(root)));
  else if (command === 'apply' && file) {
    const a = await commit(root, JSON.parse(await readFile(file, 'utf8')));
    console.log(`Saved revision ${a.revision}`);
  } else throw new Error('Usage: node scripts/archive.mjs show | handoff | apply <operation.json>');
} catch (e) { console.error(e.message); process.exitCode = 1; }
