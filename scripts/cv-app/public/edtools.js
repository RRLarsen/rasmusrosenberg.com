// Educational Tools: the list of tools, and a page per tool with preview, settings and publish.
import { drawWordmark } from '/wordmark.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== undefined && c !== null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
};
const api = async (path, opts = {}) => {
  const r = await fetch(`/api/${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j;
};
const setStatus = (text, kind = '') => { $('#status').textContent = text; $('#status').className = `status ${kind}`; };
const blurbs = {
  'exam-timer': 'A countdown clock for exams and teaching, with a large message field for announcements.',
  'psychopathy-and-crime': 'Slides and syllabus for the open course (CC BY 4.0), downloadable from the course page on the website.',
};
const stateText = (t) => (!t.installed ? 'No local copy found.' : t.kind === 'course' && !t.published ? 'Not yet published.' : t.changed || t.ahead ? 'Changes not yet published.' : 'Up to date online.');
const stateLabel = { new: 'New', changed: 'Changed', removed: 'Removed', published: 'Published' };

/** a course's page: its files, which ones changed since the last release, and Publish */
function coursePage(tool) {
  const published = tool.published ? `Last published ${new Date(tool.published).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })} (release ${tool.release}).` : 'Not yet published.';
  return el('section', { class: 'tool-page' },
    el('h1', { text: tool.name }),
    el('p', { class: 'meta', text: `${blurbs[tool.id] ?? ''} ${published}` }),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'ghost', onclick: () => api(`tools/${tool.id}/open`, { method: 'POST' }) }, 'Open folder'),
      el('a', { class: 'ghost button', href: tool.live, target: '_blank', rel: 'noopener' }, 'Open course page'),
      el('button', { type: 'button', class: 'primary', disabled: !(tool.changed || tool.ahead || !tool.published), onclick: async (e) => {
        const message = prompt(`Describe this release of the course materials:`, `Course materials, ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long' })}`);
        if (message === null) return;
        e.target.disabled = true;
        setStatus('Publishing: shrinking the pictures and uploading the files. This takes a few minutes…');
        const r = await api(`tools/${tool.id}/publish`, { method: 'POST', body: { message } });
        setStatus(r.message, r.ok ? '' : 'error');
        render();
      } }, 'Publish')),
    el('h2', { text: 'Files' }),
    el('ul', { class: 'course-files' }, tool.files.map((f) => el('li', { class: f.state },
      el('span', { text: f.path.replace(/^slides\//, '').replace(/^syllabus\//, 'Syllabus: ') }),
      el('span', { class: 'state', text: stateLabel[f.state] })))),
    el('p', { class: 'help', text: 'To update a deck, replace its file in the slides folder, keeping "Module <number>" at the start of the name. Keep the syllabus in the syllabus folder as a Word file and a PDF (in Word: File › Save As › PDF). Publish shrinks the pictures and uploads each deck, the syllabus and one zip with everything as a new release; the download links on the website stay the same.' }));
}

function crumbs(tool) {
  const c = $('#crumbs');
  const parts = [el('a', { href: '/' }, 'Dashboard'), el('span', { class: 'sep', 'aria-hidden': 'true' }, '›'),
    tool ? el('a', { href: '/edtools' }, 'Educational Tools') : el('span', { class: 'brand', 'aria-current': 'page' }, 'Educational Tools')];
  if (tool) parts.push(el('span', { class: 'sep', 'aria-hidden': 'true' }, '›'), el('span', { class: 'brand', 'aria-current': 'page' }, tool.name));
  c.replaceChildren(...parts);
  document.title = tool ? `${tool.name}: Educational Tools` : 'Educational Tools';
}

async function render() {
  const { tools, fields } = await api('tools');
  const tool = tools.find((t) => t.id === location.hash.slice(1));
  crumbs(tool);
  const main = $('#main');
  if (!tool) {
    main.replaceChildren(
      el('p', { class: 'ed-intro', text: 'Choose a tool to open it, change its settings, or publish it. Each tool lives in its own GitHub repository and has its own web address.' }),
      el('div', { class: 'tool-cards' }, tools.map((t) => el('a', { class: 'tool-card', href: `#${t.id}` },
        el('h2', { text: t.name }), el('p', { text: blurbs[t.id] ?? '' }), el('p', { class: 'meta', text: stateText(t) })))));
    return;
  }
  if (tool.kind === 'course') { main.replaceChildren(coursePage(tool)); return; }
  const { settings } = await api(`tools/${tool.id}/settings`);
  const msg = el('p', { class: 'form-msg' });
  const form = el('form', { class: 'tool-form' },
    fields[tool.id].map((f) => el('label', { class: f.type === 'checkbox' ? 'check' : 'field' },
      f.type === 'checkbox' ? null : el('span', { text: f.label }),
      el('input', { name: f.name, type: f.type, value: f.type === 'checkbox' ? undefined : settings[f.name] ?? '', checked: f.type === 'checkbox' ? settings[f.name] !== false : undefined, step: f.step, min: f.min, max: f.max }),
      f.type === 'checkbox' ? f.label : null,
      f.help ? el('small', { text: f.help }) : null)),
    el('div', { class: 'actions' }, el('button', { type: 'submit', class: 'primary' }, 'Save settings')),
    msg);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = {};
    for (const f of fields[tool.id]) { const i = form.elements[f.name]; data[f.name] = f.type === 'checkbox' ? i.checked : i.value; }
    const r = await api(`tools/${tool.id}/settings`, { method: 'PUT', body: { settings: data } });
    msg.textContent = r.ok ? 'Saved. Open the local copy to check it, then Publish.' : r.error;
    if (r.ok) render();
  };
  main.replaceChildren(el('section', { class: 'tool-page' },
    el('h1', { text: tool.name }),
    el('p', { class: 'meta', text: `${blurbs[tool.id] ?? ''} ${stateText(tool)}` }),
    el('div', { class: 'actions' },
      el('a', { class: 'ghost button', href: `/tools/${tool.id}/`, target: '_blank', rel: 'noopener' }, 'Open (local copy)'),
      el('a', { class: 'ghost button', href: tool.live, target: '_blank', rel: 'noopener' }, 'Open live'),
      el('button', { type: 'button', class: 'primary', disabled: !(tool.changed || tool.ahead), onclick: async () => {
        const message = prompt(`Describe the change to ${tool.name}:`, `Update ${tool.name}`);
        if (message === null) return;
        setStatus(`Publishing ${tool.name}…`);
        const r = await api(`tools/${tool.id}/publish`, { method: 'POST', body: { message } });
        setStatus(r.message, r.ok ? '' : 'error');
        render();
      } }, 'Publish')),
    el('h2', { text: 'Settings' }),
    form));
}

window.addEventListener('hashchange', render);
drawWordmark();
render().catch((err) => setStatus(`Could not load: ${err.message}`, 'error'));
