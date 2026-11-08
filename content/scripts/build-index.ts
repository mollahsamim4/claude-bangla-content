import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT_VERSION, KIND_DIRS, type ContentIndex, type ContentKind } from '../schema/schema';

export function hashFile(contents: Buffer): string {
  const normalized = Buffer.from(contents.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export async function buildIndex(rootDir: string, commit: string, now: Date = new Date()): Promise<ContentIndex> {
  const files: ContentIndex['files'] = [];
  for (const kind of Object.keys(KIND_DIRS) as ContentKind[]) {
    const dir = path.join(rootDir, KIND_DIRS[kind]);
    let names: string[];
    try {
      names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'));
    } catch {
      continue;
    }
    for (const name of names) {
      files.push({
        path: `${KIND_DIRS[kind]}/${name}`,
        hash: hashFile(await fs.readFile(path.join(dir, name))),
        kind,
      });
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { formatVersion: FORMAT_VERSION, commit, generatedAt: now.toISOString(), files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const commit = process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD').toString().trim();
  const index = await buildIndex(process.cwd(), commit);
  await fs.writeFile(path.join(process.cwd(), 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`index.json: ${index.files.length} files @ ${commit.slice(0, 7)}`);
}
