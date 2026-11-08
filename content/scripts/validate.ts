import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIND_DIRS, SCHEMA_BY_KIND, type ContentKind } from '../schema/schema';

function collectImageSrcs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => collectImageSrcs(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'src' && typeof v === 'string') out.push(v);
      else collectImageSrcs(v, out);
    }
  }
  return out;
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function validateRepo(rootDir: string): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  const orderSeen = new Map<string, string>();
  let lessonFiles = 0;

  for (const kind of Object.keys(KIND_DIRS) as ContentKind[]) {
    const dir = path.join(rootDir, KIND_DIRS[kind]);
    let names: string[];
    try {
      names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')).sort();
    } catch {
      continue; // directory absent: nothing to validate
    }
    if (kind === 'lesson') lessonFiles = names.length;
    for (const name of names) {
      const rel = `${KIND_DIRS[kind]}/${name}`;
      let data: any;
      try {
        data = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
      } catch (e) {
        errors.push(`${rel}: invalid JSON (${(e as Error).message})`);
        continue;
      }
      const parsed = SCHEMA_BY_KIND[kind].safeParse(data);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push(`${rel}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
        }
        continue;
      }
      const base = name.replace(/\.json$/, '');
      if (data.id !== base) errors.push(`${rel}: id "${data.id}" must equal file name "${base}"`);
      if (kind === 'lesson') {
        const key = `${data.track}/${data.order}`;
        const prev = orderSeen.get(key);
        if (prev) errors.push(`${rel}: duplicate order ${data.order} in track ${data.track} (also ${prev})`);
        else orderSeen.set(key, rel);
      }
      for (const src of collectImageSrcs(data)) {
        if (!(await exists(path.join(rootDir, src)))) errors.push(`${rel}: image not found: ${src}`);
      }
    }
  }
  // Guard against a mass deletion publishing an empty tree to every installed app.
  if (lessonFiles === 0) errors.push('lessons/: directory is missing or contains no lesson files');
  return { errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors } = await validateRepo(process.cwd());
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
}
