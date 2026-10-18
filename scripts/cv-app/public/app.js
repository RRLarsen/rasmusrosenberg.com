// CV builder: the browser side. Talks to scripts/cv-app/server.ts.
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

const state = { config: null, section: null, entries: [], key: undefined, dirty: false, pdf: 'public' };

function setStatus(text, kind = '') {
  const s = $('#status');
  s.textContent = text;
  s.className = `status ${kind}`;
}

// ---------- sections

async function loadConfig() {
  state.config = await api('config');
  const nav = $('#sections');
  nav.replaceChildren();
  let group = '';
  for (const s of state.config.sections) {
    if (s.group !== group) { group = s.group; nav.append(el('h2', { text: group })); }
    const count = state.config.counts[s.id];
    nav.append(el('button', { type: 'button', 'data-id': s.id, onclick: () => guard(() => selectSection(s.id)) },
      el('span', { text: `${s.id.startsWith('W') ? '' : `${s.id} `}${s.title}` }),
      count !== undefined ? el('span', { class: 'count', text: count }) : null));
  }
}

async function selectSection(id) {
  const s = state.config.sections.find((x) => x.id === id);
  state.section = s; state.key = undefined; state.dirty = false;
  for (const b of document.querySelectorAll('#sections button')) b.setAttribute('aria-current', String(b.dataset.id === id));
  $('#section-title').textContent = `${s.id.startsWith('W') ? '' : `${s.id} `}${s.title}`;
  $('#section-note').textContent = s.note ?? (s.mode === 'list' ? '' : 'One set of fields; edit and save.');
  $('#entries-tools').hidden = s.mode !== 'list';
  $('#search').value = '';
  $('#entry-list').replaceChildren();
  showTab('edit');
  if (s.mode === 'list') {
    await loadEntries();
    showEmpty();
  } else if (s.mode === 'object') {
    const { data } = await api(`section/${s.id}`);
    renderForm(data, 'object');
  } else {
    const { text } = await api(`section/${s.id}`);
    renderYaml(text);
  }
}

async function loadEntries() {
  const { entries } = await api(`section/${state.section.id}`);
  state.entries = entries;
  renderList();
}

function summary(data) {
  const s = state.section.summary ?? { title: 'title', meta: [] };
  const title = String(data[s.title] ?? '(untitled)');
  const meta = s.meta.map((m) => data[m]).filter((v) => v !== undefined && v !== '').map((v) => (typeof v === 'number' && s.meta.includes('amount') ? `$${v.toLocaleString()}` : v)).join(' · ');
  return { title, meta };
}

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const list = $('#entry-list');
  list.replaceChildren();
  for (const e of state.entries) {
    const { title, meta } = summary(e.data);
    if (q && !JSON.stringify(e.data).toLowerCase().includes(q)) continue;
    list.append(el('li', {}, el('button', { type: 'button', 'aria-current': String(e.key === state.key), onclick: () => guard(() => openEntry(e.key)) },
      el('span', { class: 't', text: title }),
      el('span', { class: 'm' }, meta,
        e.data.status && e.data.status !== 'published' ? el('span', { class: 'badge', text: e.data.status }) : null,
        e.data.on_website === false ? el('span', { class: 'badge', text: 'CV only' }) : null))));
  }
  if (!list.children.length) list.append(el('li', { class: 'empty', style: 'padding:1rem', text: q ? 'No matches.' : 'No entries yet.' }));
}

// ---------- form

function showEmpty() {
  $('#form').hidden = true;
  $('#edit-empty').hidden = false;
}

function openEntry(key) {
  const e = state.entries.find((x) => x.key === key);
  state.key = key;
  renderList();
  renderForm(e.data, 'edit');
}

function newEntry() {
  state.key = undefined;
  renderList();
  const defaults = { status: 'published', ...(state.section.defaults ?? {}) };
  renderForm(structuredClone(defaults), 'new');
}

const inputFor = (f, value) => {
  const id = `f-${f.name}`;
  switch (f.type) {
    case 'textarea': return el('textarea', { id, name: f.name }, value ?? '');
    case 'number': return el('input', { id, name: f.name, type: 'number', step: 'any', value: value ?? '' });
    case 'checkbox': return el('label', { class: 'check' }, el('input', { id, name: f.name, type: 'checkbox', checked: value ?? f.default ?? false }), f.label);
    case 'select': {
      const opts = f.options.includes(value ?? '') || value === undefined ? f.options : [...f.options, value];
      return el('select', { id, name: f.name }, opts.map((o) => el('option', { value: o, selected: (value ?? (f.required ? opts[0] : '')) === o }, o || '—')));
    }
    case 'lines': return el('textarea', { id, name: f.name, rows: Math.max(3, (value ?? []).length + 1) }, (value ?? []).join('\n'));
    case 'tags': return el('div', { class: 'tagset', id }, state.config.tags.map((t) =>
      el('label', { class: 'check' }, el('input', { type: 'checkbox', name: f.name, value: t.id, checked: (value ?? []).includes(t.id) }), t.label)));
    case 'publication': return el('select', { id, name: f.name }, el('option', { value: '' }, '—'),
      state.config.publications.map((p) => el('option', { value: p.id, selected: value === p.id }, p.label)));
    case 'authors': return rowsEditor(f, value ?? [], 'authors');
    case 'links': return rowsEditor(f, value ?? [], 'links');
    default: return el('input', { id, name: f.name, type: 'text', value: value ?? '' });
  }
};

function rowsEditor(f, rows, kind) {
  const box = el('div', { class: 'rows', id: `f-${f.name}`, 'data-rows': kind });
  const addRow = (r = {}) => {
    const row = kind === 'authors'
      ? el('div', { class: 'row' },
          el('input', { type: 'text', placeholder: 'Family name', 'data-k': 'family', value: r.family ?? '' }),
          el('input', { type: 'text', placeholder: 'Given name or initials', 'data-k': 'given', value: r.given ?? '' }),
          el('label', {}, el('input', { type: 'checkbox', 'data-k': 'me', checked: !!r.me }), 'me'),
          el('button', { type: 'button', title: 'Remove', onclick: () => { row.remove(); changed(); } }, '×'))
      : el('div', { class: 'row links' },
          el('input', { type: 'text', placeholder: 'Label', 'data-k': 'label', value: r.label ?? '' }),
          el('input', { type: 'text', placeholder: 'Web address', 'data-k': 'url', value: r.url ?? '' }),
          el('button', { type: 'button', title: 'Remove', onclick: () => { row.remove(); changed(); } }, '×'));
    box.insertBefore(row, box.lastElementChild);
  };
  box.append(el('button', { type: 'button', onclick: () => { addRow(); changed(); } }, kind === 'authors' ? 'Add author' : 'Add link'));
  for (const r of rows) addRow(r);
  return box;
}

function renderForm(data, mode) {
  const s = state.section;
  const form = $('#form');
  form.replaceChildren();
  form.dataset.mode = mode;
  $('#edit-empty').hidden = true;
  form.hidden = false;
  if (mode === 'edit' && state.key && !state.key.startsWith('#')) form.append(el('p', { class: 'key', text: `id: ${state.key}` }));
  if (mode === 'new') form.append(el('p', { class: 'key', text: 'New entry. An id is created when you save.' }));
  for (const f of s.fields) {
    const wrap = el('div', { class: 'field', 'data-field': f.name });
    if (f.type !== 'checkbox') wrap.append(el('label', { class: 'lbl', for: `f-${f.name}` }, f.label, f.required ? el('span', { class: 'req', text: '*' }) : null));
    wrap.append(inputFor(f, data[f.name]));
    if (f.help) wrap.append(el('p', { class: 'help', text: f.help }));
    wrap.append(el('p', { class: 'err', hidden: true }));
    form.append(wrap);
  }
  form.append(el('p', { class: 'form-error', id: 'form-error' }));
  form.append(el('div', { class: 'actions' },
    el('button', { type: 'submit', class: 'primary' }, mode === 'new' ? 'Add entry' : 'Save'),
    mode === 'edit' && s.mode === 'list' ? el('button', { type: 'button', class: 'danger', onclick: removeEntry }, 'Delete') : null,
    el('span', { class: 'spacer' }),
    mode !== 'object' ? el('button', { type: 'button', onclick: () => guard(() => { state.key = undefined; renderList(); showEmpty(); }) }, 'Close') : null));
  state.dirty = false;
  form.oninput = changed;
  form.onchange = changed;
  form.onsubmit = (e) => { e.preventDefault(); saveEntry(); };
}

function renderYaml(text) {
  const form = $('#form');
  form.replaceChildren(
    el('label', { class: 'lbl', for: 'yaml' }, `data/${state.section.collection}.yaml`),
    el('textarea', { id: 'yaml', class: 'yaml', spellcheck: 'false' }, text),
    el('p', { class: 'form-error', id: 'form-error' }),
    el('div', { class: 'actions' }, el('button', { type: 'submit', class: 'primary' }, 'Save')),
  );
  form.dataset.mode = 'yaml';
  $('#edit-empty').hidden = true;
  form.hidden = false;
  state.dirty = false;
  form.oninput = () => { state.dirty = true; };
  form.onchange = null;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const r = await api(`section/${state.section.id}`, { method: 'PUT', body: { text: $('#yaml').value } });
    if (!r.ok) { $('#form-error').textContent = r.errors._; setStatus('Not saved: see the message below the editor.', 'error'); return; }
    $('#form-error').textContent = '';
    state.dirty = false;
    afterSave('Saved.');
  };
}

function collect() {
  const data = {};
  for (const f of state.section.fields) {
    const box = document.getElementById(`f-${f.name}`);
    if (!box) continue;
    switch (f.type) {
      case 'checkbox': data[f.name] = box.checked; break;
      case 'number': data[f.name] = box.value === '' ? undefined : Number(box.value); break;
      case 'lines': data[f.name] = box.value.split('\n').map((x) => x.trim()).filter(Boolean); break;
      case 'tags': data[f.name] = [...box.querySelectorAll('input:checked')].map((i) => i.value); break;
      case 'authors':
      case 'links':
        data[f.name] = [...box.querySelectorAll('.row')].map((row) => {
          const o = {};
          for (const i of row.querySelectorAll('[data-k]')) {
            if (i.type === 'checkbox') { if (i.checked) o[i.dataset.k] = true; } else if (i.value.trim()) o[i.dataset.k] = i.value.trim();
          }
          return o;
        }).filter((o) => Object.keys(o).length);
        break;
      default: data[f.name] = box.value.trim() || undefined;
    }
  }
  // keep fields the form does not show (e.g. openalex_id), so saving never drops them
  if (state.key) {
    const original = state.entries.find((x) => x.key === state.key)?.data ?? {};
    for (const [k, v] of Object.entries(original)) if (!(k in data) && k !== 'id') data[k] = v;
  }
  return data;
}

let checkTimer;
function changed() {
  state.dirty = true;
  clearTimeout(checkTimer);
  checkTimer = setTimeout(liveCheck, 400);
}

function showErrors(errors) {
  for (const wrap of document.querySelectorAll('#form .field')) {
    const msg = errors[wrap.dataset.field];
    const p = wrap.querySelector('.err');
    p.hidden = !msg;
    p.textContent = msg ?? '';
    wrap.classList.toggle('invalid', !!msg);
  }
  const fieldNames = new Set(state.section.fields.map((f) => f.name));
  const other = Object.entries(errors).filter(([k]) => !fieldNames.has(k)).map(([k, v]) => (k === '_' ? v : `${k}: ${v}`));
  $('#form-error').textContent = other.join('\n');
}

async function liveCheck() {
  if (!state.section || $('#form').hidden || $('#form').dataset.mode === 'yaml') return;
  const { errors } = await api(`section/${state.section.id}/check`, { method: 'POST', body: { key: state.key, data: collect() } });
  showErrors(errors);
}

async function saveEntry() {
  const r = await api(`section/${state.section.id}`, { method: 'PUT', body: { key: state.section.mode === 'object' ? undefined : state.key, data: collect() } });
  if (!r.ok) { showErrors(r.errors); setStatus('Not saved: please fix the marked fields.', 'error'); return; }
  showErrors({});
  state.dirty = false;
  if (state.section.mode === 'list') {
    state.key = r.key;
    await loadEntries();
    openEntry(r.key);
  }
  afterSave('Saved.');
}

async function removeEntry() {
  const e = state.entries.find((x) => x.key === state.key);
  if (!confirm(`Delete “${summary(e.data).title}”? This removes it from the CV and the website.`)) return;
  await api(`section/${state.section.id}/${encodeURIComponent(state.key)}`, { method: 'DELETE' });
  state.key = undefined; state.dirty = false;
  await loadEntries();
  showEmpty();
  afterSave('Deleted.');
}

// ---------- after saving: counts, PDF rebuild

async function afterSave(message) {
  const cfg = await api('config');
  state.config.counts = cfg.counts;
  state.config.publications = cfg.publications;
  for (const b of document.querySelectorAll('#sections button')) {
    const c = b.querySelector('.count');
    if (c) c.textContent = cfg.counts[b.dataset.id];
  }
  setStatus(`${message} Updating the PDF and website…`);
  watchBuild();
}

let buildTimer;
async function watchBuild() {
  clearTimeout(buildTimer);
  const b = await api('build');
  if (b.building) { buildTimer = setTimeout(watchBuild, 800); return; }
  if (!b.ok) { setStatus(`The build reported a problem: ${b.log || 'see the terminal'}`, 'error'); return; }
  setStatus(`All changes saved. PDF updated at ${new Date(b.at).toLocaleTimeString()}.`);
  if (!$('#panel-pdf').hidden) loadPdf();
}

// ---------- tabs and PDF

function showTab(which) {
  $('#tab-edit').setAttribute('aria-selected', String(which === 'edit'));
  $('#tab-pdf').setAttribute('aria-selected', String(which === 'pdf'));
  $('#panel-edit').hidden = which !== 'edit';
  $('#panel-pdf').hidden = which !== 'pdf';
  $('#pdf-version').hidden = which !== 'pdf';
  if (which === 'pdf') loadPdf();
}
const loadPdf = () => { $('#pdf').src = `/pdf/${state.pdf}?t=${Date.now()}#view=FitH`; };

// ---------- unsaved changes

function guard(next) {
  if (state.dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
  state.dirty = false;
  next();
}
window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- wiring

$('#add').addEventListener('click', () => guard(newEntry));
$('#search').addEventListener('input', renderList);
$('#tab-edit').addEventListener('click', () => showTab('edit'));
$('#tab-pdf').addEventListener('click', () => showTab('pdf'));
$('#pdf-which').addEventListener('change', (e) => { state.pdf = e.target.value; loadPdf(); });
$('#checkpoint').addEventListener('click', async () => {
  const message = prompt('Describe this checkpoint (e.g. "Added CBC Ideas interview"):', 'Update CV');
  if (message === null) return;
  try { const r = await api('checkpoint', { method: 'POST', body: { message } }); setStatus(r.message); }
  catch (err) { setStatus(`Checkpoint failed: ${err.message}`, 'error'); }
});

loadConfig().then(() => { setStatus('Ready. Changes are saved straight into data/.'); selectSection('C.2'); })
  .catch((err) => setStatus(`Could not load: ${err.message}`, 'error'));
