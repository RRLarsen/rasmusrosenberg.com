// Educational tools, each kept in its own GitHub repository next to this project:
// - page tools: small web tools (e.g. ~/Projects/Exam-Timer, published at
//   rrlarsen.github.io/Exam-Timer). The dashboard previews them, edits the settings block at
//   the top of the page, and publishes them (commit and push in the tool's repository).
// - course materials: slides and a syllabus kept in a folder that git ignores (e.g.
//   ~/Projects/Course-Psychopathy-and-Crime/slides). Publishing runs the folder's build.py and
//   uploads the results as a GitHub release; the website links to the latest release's files.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';

export interface ToolField { name: string; label: string; type: 'number' | 'checkbox' | 'text'; help?: string; step?: number; min?: number; max?: number }
export interface Tool { id: string; name: string; kind: 'page' | 'course'; dir: string; file: string; live: string; repo: string; fields: ToolField[] }

export const tools: Tool[] = [{
  id: 'exam-timer',
  kind: 'page',
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
}, {
  id: 'psychopathy-and-crime',
  kind: 'course',
  name: 'Psychopathy and Crime: course materials',
  dir: join(homedir(), 'Projects', 'Course-Psychopathy-and-Crime'),
  file: 'build.py',
  live: 'https://www.rasmusrosenberg.com/teaching/psychopathy-and-crime/',
  repo: 'RRLarsen/Course-Psychopathy-and-Crime',
  fields: [],
}];

// the course folders whose files are published (everything else in the repository is in git)
const SOURCES = ['slides', 'syllabus'];
const MANIFEST = '.published.json';

export const toolById = (id: string) => tools.find((t) => t.id === id);
const SETTINGS = /(<script id="settings" type="application\/json">\s*)([\s\S]*?)(\s*<\/script>)/;

const run = (cmd: string, dir: string, args: string[]) => new Promise<string>((resolve, reject) =>
  execFile(cmd, args, { cwd: dir, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => (err ? reject(new Error((errOut || out || err.message).trim())) : resolve(out))));
const git = (dir: string, args: string[]) => run('git', dir, args);

/** the course's source files, each with a fingerprint (size and modification time) */
function sourceFiles(t: Tool) {
  const files: Record<string, string> = {};
  for (const folder of SOURCES) {
    const d = join(t.dir, folder);
    if (!existsSync(d)) continue;
    for (const name of readdirSync(d).filter((n) => !n.startsWith('.') && !n.startsWith('~$')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
      const st = statSync(join(d, name));
      if (st.isFile()) files[`${folder}/${name}`] = `${st.size}:${Math.round(st.mtimeMs)}`;
    }
  }
  return files;
}
const readManifest = (t: Tool): { at?: string; tag?: string; files: Record<string, string> } =>
  existsSync(join(t.dir, MANIFEST)) ? JSON.parse(readFileSync(join(t.dir, MANIFEST), 'utf8')) : { files: {} };

export async function status(t: Tool) {
  const base = { id: t.id, kind: t.kind, name: t.name, live: t.live };
  if (!existsSync(join(t.dir, t.file))) return { ...base, installed: false, changed: 0, ahead: 0 };
  const changed = (await git(t.dir, ['status', '--porcelain'])).trim().split('\n').filter(Boolean).length;
  const ahead = Number((await git(t.dir, ['rev-list', '--count', '@{u}..HEAD']).catch(() => '0')).trim());
  if (t.kind === 'page') return { ...base, installed: true, changed, ahead };
  // course materials: which source files differ from the last published release
  const now = sourceFiles(t);
  const before = readManifest(t);
  const files = [...new Set([...Object.keys(now), ...Object.keys(before.files)])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((path) => ({
    path, state: !(path in now) ? 'removed' : !(path in before.files) ? 'new' : now[path] !== before.files[path] ? 'changed' : 'published',
  }));
  return { ...base, installed: true, changed: changed + files.filter((f) => f.state !== 'published').length, ahead, files, published: before.at ?? null, release: before.tag ?? null, dir: t.dir };
}

/** opens the tool's folder in Finder */
export const openFolder = (t: Tool) => run('open', t.dir, [t.dir]);

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
  if (t.kind === 'course') return publishCourse(t, message);
  const changed = (await git(t.dir, ['status', '--porcelain'])).trim();
  if (changed) { await git(t.dir, ['add', '-A']); await git(t.dir, ['commit', '-m', message.slice(0, 200)]); }
  const ahead = Number((await git(t.dir, ['rev-list', '--count', '@{u}..HEAD']).catch(() => '1')).trim());
  if (!ahead) return { ok: true, message: `${t.name} is already up to date online.` };
  await git(t.dir, ['push']);
  return { ok: true, message: `${t.name} published. The live version updates in a minute or two.` };
}

/**
 * Course materials: build the downloads, make sure the GitHub repository exists and has the
 * latest README and build script, then upload the downloads as a new release. The website links
 * to /releases/latest/download/<file>, so the addresses stay the same from release to release.
 */
async function publishCourse(t: Tool, message: string) {
  await run('python3', t.dir, ['-I', 'build.py']);
  const changed = (await git(t.dir, ['status', '--porcelain'])).trim();
  if (changed) { await git(t.dir, ['add', '-A']); await git(t.dir, ['commit', '-m', message.slice(0, 200)]); }
  const exists = await run('gh', t.dir, ['repo', 'view', t.repo, '--json', 'name']).then(() => true, () => false);
  if (!exists) {
    await run('gh', t.dir, ['repo', 'create', t.repo, '--public', '--source', '.', '--remote', 'origin', '--push',
      '--description', `${t.name.split(':')[0]}: open course materials (CC BY 4.0) by Rasmus Rosenberg Larsen`, '--homepage', t.live]);
  } else {
    if (!(await git(t.dir, ['remote']).then((r) => r.includes('origin')))) await git(t.dir, ['remote', 'add', 'origin', `https://github.com/${t.repo}.git`]);
    await git(t.dir, ['push', '-u', 'origin', 'HEAD']);
  }
  const tags = (await run('gh', t.dir, ['release', 'list', '--repo', t.repo, '--json', 'tagName', '--jq', '.[].tagName'])).split('\n');
  const day = new Date().toLocaleDateString('en-CA');
  let tag = `v${day}`;
  for (let n = 2; tags.includes(tag); n++) tag = `v${day}-${n}`;
  const dist = join(t.dir, 'dist');
  const assets = readdirSync(dist).filter((n) => !n.startsWith('.')).map((n) => join(dist, n));
  await run('gh', t.dir, ['release', 'create', tag, ...assets, '--repo', t.repo, '--title', message.slice(0, 200), '--notes',
    'Slides (one PowerPoint file per module), the syllabus (PDF and Word), and everything together in one zip. Licensed under CC BY 4.0.', '--latest']);
  writeFileSync(join(t.dir, MANIFEST), JSON.stringify({ at: new Date().toISOString(), tag, files: sourceFiles(t) }, null, 2));
  return { ok: true, message: `${t.name.split(':')[0]} published as release ${tag}. The download links on the website now give these files.` };
}
