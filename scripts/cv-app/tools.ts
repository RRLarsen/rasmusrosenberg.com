// Educational tools: small web tools kept in their own GitHub repositories next to this
// project (e.g. ~/Projects/Exam-Timer, published at rrlarsen.github.io/Exam-Timer). The
// dashboard previews them, edits the settings block at the top of each tool's page, and
// publishes them (commit and push in the tool's own repository).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';

export interface ToolField { name: string; label: string; type: 'number' | 'checkbox' | 'text'; help?: string; step?: number; min?: number; max?: number }
export interface Tool { id: string; name: string; dir: string; file: string; live: string; repo: string; fields: ToolField[] }

export const tools: Tool[] = [{
  id: 'exam-timer',
  name: 'Exam Timer',
  dir: join(homedir(), 'Projects', 'Exam-Timer'),
  file: 'index.html',
  live: 'https://rrlarsen.github.io/Exam-Timer/',
  repo: 'https://github.com/RRLarsen/Exam-Timer.git',
  fields: [
    { name: 'title', label: 'Heading above the clock', type: 'text', help: 'e.g. FSC335 midterm. Leave empty for none.' },
    { name: 'messageSize', label: 'Message text size (rem)', type: 'number', step: 0.1, min: 1, max: 6, help: '1 rem ≈ 16 px. 2.6 reads well from the back of a lecture room.' },
    { name: 'messageBold', label: 'Message text in bold', type: 'checkbox' },
    { name: 'hours', label: 'Default hours', type: 'number', min: 0, max: 23 },
    { name: 'minutes', label: 'Default minutes', type: 'number', min: 0, max: 59 },
    { name: 'seconds', label: 'Default seconds', type: 'number', min: 0, max: 59 },
    { name: 'endAlert', label: 'End alert (minutes before the end)', type: 'number', min: 1, max: 60, help: 'The clock turns amber then, and red in the last minute.' },
  ],
}];

export const toolById = (id: string) => tools.find((t) => t.id === id);
const SETTINGS = /(<script id="settings" type="application\/json">\s*)([\s\S]*?)(\s*<\/script>)/;

const git = (dir: string, args: string[]) => new Promise<string>((resolve, reject) =>
  execFile('git', args, { cwd: dir }, (err, out, errOut) => (err ? reject(new Error((errOut || out || err.message).trim())) : resolve(out))));

export async function status(t: Tool) {
  if (!existsSync(join(t.dir, t.file))) return { id: t.id, name: t.name, live: t.live, installed: false, changed: 0, ahead: 0 };
  const changed = (await git(t.dir, ['status', '--porcelain'])).trim().split('\n').filter(Boolean).length;
  const ahead = Number((await git(t.dir, ['rev-list', '--count', '@{u}..HEAD']).catch(() => '0')).trim());
  return { id: t.id, name: t.name, live: t.live, installed: true, changed, ahead };
}

export function readSettings(t: Tool): Record<string, unknown> {
  const m = readFileSync(join(t.dir, t.file), 'utf8').match(SETTINGS);
  if (!m) throw new Error(`${t.name} has no settings block.`);
  return JSON.parse(m[2]);
}

export function writeSettings(t: Tool, input: Record<string, unknown>) {
  const clean: Record<string, unknown> = { ...readSettings(t) };
  for (const f of t.fields) {
    const v = input[f.name];
    if (f.type === 'checkbox') clean[f.name] = v === true;
    else if (f.type === 'text') clean[f.name] = String(v ?? '').slice(0, 120);
    else {
      const n = Number(v);
      if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) throw new Error(`${f.label}: use a number from ${f.min} to ${f.max}.`);
      clean[f.name] = n;
    }
  }
  const path = join(t.dir, t.file);
  writeFileSync(path, readFileSync(path, 'utf8').replace(SETTINGS, (_, a, _b, c) => `${a}${JSON.stringify(clean).replace(/,"/g, ', "').replace(/":/g, '": ')}${c}`));
  return clean;
}

/** commit any changes in the tool's repository and push them (GitHub Pages then updates the live tool) */
export async function publish(t: Tool, message: string) {
  const changed = (await git(t.dir, ['status', '--porcelain'])).trim();
  if (changed) { await git(t.dir, ['add', '-A']); await git(t.dir, ['commit', '-m', message.slice(0, 200)]); }
  const ahead = Number((await git(t.dir, ['rev-list', '--count', '@{u}..HEAD']).catch(() => '1')).trim());
  if (!ahead) return { ok: true, message: `${t.name} is already up to date online.` };
  await git(t.dir, ['push']);
  return { ok: true, message: `${t.name} published. The live version updates in a minute or two.` };
}
