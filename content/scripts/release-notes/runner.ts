import { spawn } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export interface RunOptions {
  input?: string;
  cwd?: string;
  /** Full child environment (replaces the inherited one). Omit to inherit. */
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}
/** Runs an external command. Injected everywhere so tests never touch a real CLI. */
export type Runner = (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>;

/** Copy of `base` without variables whose name matches any pattern. */
export function envWithout(base: NodeJS.ProcessEnv, patterns: RegExp[]): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(base).filter(([k]) => !patterns.some((p) => p.test(k))));
}

/** Real runner. Arguments are passed as an array (no shell), so item text can never be interpreted by a shell. */
export const spawnRunner: Runner = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    // On Windows `claude`/`gh`/`git` may be .cmd/.exe shims; shell stays off on Linux (CI), which is what matters.
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      timeout: opts.timeoutMs,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(opts.input ?? '');
  });
