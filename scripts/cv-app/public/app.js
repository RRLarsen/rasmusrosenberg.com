// CV Builder and Website Editor: the browser side. Talks to scripts/cv-app/server.ts.
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

// /cv shows the CV sections (A–E) and the inbox; /website shows the website content sections
const MODE = location.pathname.startsWith('/website') ? 'website' : 'cv';
const inMode = (s) => (MODE === 'website') === (s.group === 'Website');

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
  nav.replaceChildren(...(MODE === 'cv' ? [
    el('h2', { text: 'Inbox' }),
    el('button', { type: 'button', 'data-id': 'INBOX', onclick: () => guard(selectInbox) },
      el('span', { text: 'Suggestions' }), el('span', { class: 'inbox-count', id: 'inbox-count', hidden: true })),
  ] : []));
  let group = '';
  for (const s of state.config.sections.filter(inMode)) {
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
  $('#inbox-tools').hidden = true;
  $('#edit-empty').textContent = 'Choose an entry, or add a new one.';
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

/** Open a new, filled-in entry in a section (from quick add or the inbox); nothing is saved yet. */
async function openPrefilled(sectionId, data, message) {
  await selectSection(sectionId);
  state.key = undefined;
  renderList();
  renderForm({ status: 'published', ...(state.section.defaults ?? {}), ...data }, 'new');
  state.dirty = true;
  setStatus(message);
  liveCheck();
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
    case 'praise': return rowsEditor(f, value ?? [], 'praise');
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
      : kind === 'praise'
      ? el('div', { class: 'row praise' },
          el('textarea', { placeholder: 'Quote', 'data-k': 'quote', rows: 3 }, r.quote ?? ''),
          el('input', { type: 'text', placeholder: 'Name', 'data-k': 'name', value: r.name ?? '' }),
          el('input', { type: 'text', placeholder: 'Title and affiliation', 'data-k': 'affiliation', value: r.affiliation ?? '' }),
          el('button', { type: 'button', title: 'Remove', onclick: () => { row.remove(); changed(); } }, '×'))
      : el('div', { class: 'row links' },
          el('input', { type: 'text', placeholder: 'Label', 'data-k': 'label', value: r.label ?? '' }),
          el('input', { type: 'text', placeholder: 'Web address', 'data-k': 'url', value: r.url ?? '' }),
          el('button', { type: 'button', title: 'Remove', onclick: () => { row.remove(); changed(); } }, '×'));
    box.insertBefore(row, box.lastElementChild);
  };
  box.append(el('button', { type: 'button', onclick: () => { addRow(); changed(); } }, { authors: 'Add author', links: 'Add link', praise: 'Add a quote' }[kind]));
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
  // text boxes grow to fit their text (up to a limit), so long texts are readable at a glance
  const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, window.innerHeight * 0.6)}px`; };
  form.querySelectorAll('textarea:not(.yaml)').forEach(grow);
  form.oninput = (e) => { if (e.target.tagName === 'TEXTAREA') grow(e.target); changed(); };
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
      case 'praise':
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
  refreshInboxCount();
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
const loadPdf = () => { $('#pdf').src = `/preview.html?file=${encodeURIComponent(`/pdf/${state.pdf}?t=${Date.now()}`)}`; };

// ---------- unsaved changes

function guard(next) {
  if (state.dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
  state.dirty = false;
  next();
}
window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- quick add

const quick = $('#quick-dialog');
function openQuick() {
  $('#quick-q').value = '';
  quickMsg('');
  quick.showModal();
  $('#quick-q').focus();
}
const quickMsg = (text, kind = '') => { const m = $('#quick-msg'); m.textContent = text; m.className = `quick-msg ${kind}`; };
$('#quick-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#quick-q').value.trim();
  if (!q) return;
  quickMsg('Looking it up…');
  $('#quick-go').disabled = true;
  try {
    const r = await api('lookup', { method: 'POST', body: { q, as: new FormData($('#quick-form')).get('as') } });
    if (!r.ok) { quickMsg(r.error, 'error'); return; }
    if (r.known) {
      quickMsg(`Already in your CV (${r.known.section}): “${r.known.title}”.`, 'error');
      const open = el('button', { type: 'button', onclick: async () => { quick.close(); await selectSection(r.known.section); openEntry(r.known.id); } }, 'Open it');
      $('#quick-msg').append(' ', open);
      return;
    }
    const where = state.config.sections.find((x) => x.id === r.found.section);
    const addNew = async () => {
      quick.close();
      await openPrefilled(r.found.section, r.found.data, `Filled in from ${r.found.source} as a new entry in ${where.id} ${where.title}. Check the fields, then press Add entry.`);
    };
    if (r.similar) {
      // probably the same work, entered earlier without this identifier
      quickMsg(`Found “${r.found.data.title}”. This may already be in your CV as “${r.similar.title}” (${r.similar.section}).\n`);
      const m = $('#quick-msg');
      if (r.found.data.doi && r.similar.collection === 'publications') {
        m.append(el('button', { type: 'button', class: 'primary', onclick: async () => {
          const x = await api('add-doi', { method: 'POST', body: { section: r.similar.section, id: r.similar.id, doi: r.found.data.doi } });
          if (!x.ok) { quickMsg(`Not saved: ${x.error}`, 'error'); return; }
          quick.close();
          await selectSection(r.similar.section);
          openEntry(r.similar.id);
          afterSave(`DOI added to “${r.similar.title}”.`);
        } }, 'Add the DOI to that entry'), ' ');
      } else {
        m.append(el('button', { type: 'button', onclick: async () => { quick.close(); await selectSection(r.similar.section); openEntry(r.similar.id); } }, 'Open that entry'), ' ');
      }
      m.append(el('button', { type: 'button', onclick: addNew }, 'Add as a new entry'));
      return;
    }
    await addNew();
  } catch (err) {
    quickMsg(`Something went wrong: ${err.message}`, 'error');
  } finally {
    $('#quick-go').disabled = false;
  }
});
$('#quick-cancel').addEventListener('click', () => quick.close());

// ---------- suggestions inbox

const kindLabel = { publication: 'Publication', media: 'Media' };

async function refreshInboxCount() {
  if (MODE !== 'cv') return null;
  try {
    const r = await api('inbox');
    const c = $('#inbox-count');
    c.textContent = r.items.length;
    c.hidden = !r.items.length;
    if (r.checking) setTimeout(refreshInboxCount, 15000); // a weekly check is running
    return r;
  } catch { return null; }
}

async function selectInbox(message) {
  state.section = { id: 'INBOX', mode: 'inbox', fields: [] };
  state.key = undefined; state.dirty = false;
  for (const b of document.querySelectorAll('#sections button')) b.setAttribute('aria-current', String(b.dataset.id === 'INBOX'));
  $('#section-title').textContent = 'Suggestions';
  $('#entries-tools').hidden = true;
  $('#inbox-tools').hidden = false;
  showTab('edit');
  showEmpty();
  $('#edit-empty').textContent = 'Choose a suggestion to add it to the CV or dismiss it.';
  const r = await refreshInboxCount();
  state.inbox = r ?? { items: [] };
  const when = r?.checked_at ? new Date(r.checked_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
  const problems = Object.entries(r?.problems ?? {}).map(([k, v]) => `${k}: ${v}`).join('; ');
  $('#section-note').textContent = `New publications (OpenAlex, Crossref, ORCID), videos on your YouTube channel, and media mentions (Google News, Apple Podcasts${r?.feeds ? ', Google Alerts' : ''}). Nothing is added until you approve it. Last checked: ${when}.${r?.checking ? ' Checking now…' : ''}${problems ? ` Could not reach ${problems}.` : ''}`;
  renderInbox();
  if (message) setStatus(message);
}

function renderInbox() {
  const list = $('#entry-list');
  list.replaceChildren();
  for (const x of state.inbox.items) {
    list.append(el('li', {}, el('button', { type: 'button', 'aria-current': String(x.key === state.key), onclick: () => openSuggestion(x.key) },
      el('span', { class: 't', text: x.title }),
      el('span', { class: 'm' }, [kindLabel[x.kind], x.sources.join(', '), x.date].filter(Boolean).join(' · '),
        x.similar ? el('span', { class: 'badge', text: 'may be in CV' }) : null))));
  }
  if (!list.children.length) list.append(el('li', { class: 'empty', style: 'padding:1rem', text: 'No new suggestions.' }));
}

function openSuggestion(key) {
  const x = state.inbox.items.find((i) => i.key === key);
  state.key = key;
  renderInbox();
  const form = $('#form');
  form.replaceChildren();
  form.dataset.mode = 'inbox';
  form.onsubmit = (e) => e.preventDefault();
  form.oninput = form.onchange = null;
  $('#edit-empty').hidden = true;
  form.hidden = false;
  const link = x.doi ? `https://doi.org/${x.doi}` : x.url;
  const box = el('div', { class: 'suggestion' },
    el('h2', { text: x.title }),
    el('p', { class: 'meta' }, [kindLabel[x.kind], x.date, x.detail].filter(Boolean).join(' · '), ' · Found by ', x.sources.join(', '),
      link ? [' · ', el('a', { href: link, target: '_blank', rel: 'noopener' }, x.doi ? `DOI ${x.doi}` : 'Open the page')] : null));
  if (x.similar) {
    const notice = el('div', { class: 'notice' },
      el('p', {}, 'This may already be in your CV as ', el('strong', { text: `“${x.similar.title}”` }), ` (${x.similar.section}).`));
    if (x.doi && x.similar.collection === 'publications') {
      notice.append(el('p', {}, 'If it is the same work, add the DOI to that entry. Then OpenAlex and Crossref can match it from now on.'),
        el('button', { type: 'button', class: 'primary', onclick: () => linkSuggestion(x) }, 'Add the DOI to that entry'));
    } else {
      notice.append(el('button', { type: 'button', onclick: async () => { await selectSection(x.similar.section); openEntry(x.similar.id); } }, 'Open that entry'));
    }
    box.append(notice);
  }
  const actions = el('div', { class: 'actions' });
  if (x.kind === 'publication') actions.append(el('button', { type: 'button', class: x.similar ? '' : 'primary', onclick: () => approve(x, 'media') }, 'Add to CV…'));
  else actions.append(
    el('button', { type: 'button', class: 'primary', onclick: () => approve(x, 'media') }, 'Add as media…'),
    x.sources.some((src) => src === 'YouTube' || src === 'Apple Podcasts') ? null : el('button', { type: 'button', onclick: () => approve(x, 'op-ed') }, 'Add as op-ed by me…'));
  actions.append(el('button', { type: 'button', class: 'danger', onclick: () => dismissSuggestion(x) }, 'Dismiss'));
  box.append(actions, el('p', { class: 'help', text: 'Adding opens a filled-in form; nothing is saved until you press Add entry. Dismissed suggestions do not come back.' }));
  form.append(box);
}

async function approve(x, as) {
  setStatus('Fetching the details…');
  const r = await api('inbox/prepare', { method: 'POST', body: { key: x.key, as } });
  if (!r.ok) { setStatus(`Could not fetch the details: ${r.error}`, 'error'); return; }
  const where = state.config.sections.find((s) => s.id === r.found.section);
  await openPrefilled(r.found.section, r.found.data, `Filled in from ${r.found.source} as a new entry in ${where.id} ${where.title}. Check the fields, then press Add entry; it then leaves the inbox.`);
}

async function dismissSuggestion(x) {
  await api('inbox/dismiss', { method: 'POST', body: { key: x.key } });
  state.inbox.items = state.inbox.items.filter((i) => i.key !== x.key);
  state.key = undefined;
  renderInbox();
  showEmpty();
  refreshInboxCount();
  setStatus('Dismissed. It will not be suggested again.');
}

async function linkSuggestion(x) {
  const r = await api('inbox/link', { method: 'POST', body: { key: x.key } });
  if (!r.ok) { setStatus(`Not saved: ${r.error}`, 'error'); return; }
  state.inbox.items = state.inbox.items.filter((i) => i.key !== x.key);
  state.key = undefined;
  renderInbox();
  showEmpty();
  refreshInboxCount();
  afterSave(`DOI added to “${x.similar.title}”.`);
}

$('#inbox-check').addEventListener('click', async () => {
  $('#inbox-check').disabled = true;
  setStatus('Checking OpenAlex, Crossref, ORCID, YouTube, Google News, Apple Podcasts and your alerts… (this can take a minute)');
  try { await api('inbox/check', { method: 'POST' }); await selectInbox('Inbox checked.'); }
  catch (err) { setStatus(`Check failed: ${err.message}`, 'error'); }
  finally { $('#inbox-check').disabled = false; }
});

$('#inbox-sources').addEventListener('click', async () => {
  const [{ feeds }, { searches }] = await Promise.all([api('inbox/feeds'), api('inbox/searches')]);
  state.key = undefined;
  renderInbox();
  const form = $('#form');
  form.dataset.mode = 'inbox';
  form.oninput = form.onchange = null;
  $('#edit-empty').hidden = true;
  form.hidden = false;
  const qs = el('textarea', { id: 'searches', spellcheck: 'false' }, searches.join('\n'));
  const ta = el('textarea', { id: 'feeds', spellcheck: 'false' }, feeds.join('\n'));
  const msg = el('p', { class: 'form-error' });
  form.replaceChildren(el('div', { class: 'feeds suggestion' },
    el('h2', { text: 'Sources for media mentions' }),
    el('p', { class: 'meta', text: 'Publications come from OpenAlex, Crossref and ORCID, and videos from your YouTube channel, without any setup. Media mentions come from the searches and alerts below.' }),

    el('label', { class: 'lbl', for: 'searches' }, 'Searches (Google News and Apple Podcasts)'), qs,
    el('p', { class: 'help', text: 'One search per line. Put a name or title in quotation marks to search for the exact phrase, e.g. "Rasmus Rosenberg Larsen" or "Psychopathy Unmasked" Larsen. Podcast episodes are kept only if their title, show or description contains every phrase and word.' }),

    el('label', { class: 'lbl', for: 'feeds', style: 'margin-top:1.25rem' }, 'Google Alerts feed addresses'), ta,
    el('ol', {},
      el('li', {}, 'Go to ', el('a', { href: 'https://www.google.com/alerts', target: '_blank', rel: 'noopener' }, 'google.com/alerts'), ' and create an alert, e.g. "Rasmus Rosenberg Larsen".'),
      el('li', {}, 'Under "Show options", set "Deliver to" to RSS feed.'),
      el('li', {}, 'Right-click the RSS icon next to the alert, copy the link, and paste it above (one per line). These addresses stay in private/, never uploaded.')),
    msg,
    el('div', { class: 'actions' }, el('button', { type: 'button', class: 'primary', onclick: async () => {
      const a = await api('inbox/searches', { method: 'PUT', body: { searches: qs.value.split('\n') } });
      if (!a.ok) { msg.textContent = a.error; return; }
      const b = await api('inbox/feeds', { method: 'PUT', body: { feeds: ta.value.split('\n') } });
      if (!b.ok) { msg.textContent = b.error; return; }
      msg.textContent = '';
      setStatus('Sources saved. Press Check now to search them.');
    } }, 'Save'))));
  form.onsubmit = (e) => e.preventDefault();
});

// ---------- publish

$('#publish').addEventListener('click', async () => {
  const st = await api('publish');
  if (!st.remote) { setStatus('Not connected to GitHub yet. Publishing starts working once the site has a GitHub repository.', 'error'); return; }
  if (!st.changed && !st.ahead) { setStatus('Nothing new to publish: the live website is up to date.'); return; }
  let message = 'Update CV data';
  if (st.changed) {
    message = prompt(`Describe the changes for the checkpoint made before publishing (${st.changed} changed file(s) in data/):`, 'Update CV');
    if (message === null) return;
  }
  if (!confirm('Publish to the live website? Your checkpoints are uploaded to GitHub, which rebuilds the site.')) return;
  setStatus('Publishing…');
  try { const r = await api('publish', { method: 'POST', body: { message } }); setStatus(r.message, r.ok ? '' : 'error'); }
  catch (err) { setStatus(`Publishing failed: ${err.message}`, 'error'); }
});

// ---------- wiring

$('#add').addEventListener('click', () => guard(newEntry));
$('#quick').addEventListener('click', () => guard(openQuick));
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

document.title = MODE === 'website' ? 'Website Editor' : 'CV Builder';
drawWordmark();
if (MODE === 'website') $('#open-site').href = 'http://localhost:4321/';
// Open Website starts the local preview first if it is not running
$('#open-site').addEventListener('click', async (e) => {
  e.preventDefault();
  const tab = window.open('about:blank', '_blank'); // opened now, so the browser does not block it
  if ((await api('status')).preview.running) { if (tab) tab.location = $('#open-site').href; return; }
  await api('preview/start', { method: 'POST' });
  setStatus('Starting the local website…');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if ((await api('status')).preview.running) { setStatus('The local website is running.'); if (tab) tab.location = $('#open-site').href; return; }
  }
  tab?.close();
  setStatus('The local website did not start. Try `npm run dev` in a terminal to see why.', 'error');
});
$('.brand').textContent = document.title;
$('#quick').hidden = MODE !== 'cv';
$('#tab-pdf').hidden = MODE !== 'cv'; // the website editor has "Open website" instead
loadConfig().then(async () => {
  setStatus('Ready.');
  if (MODE === 'cv' && location.hash.startsWith('#inbox')) {
    // #inbox opens the inbox; #inbox:<key> also opens that suggestion (from a dashboard notification)
    await selectInbox();
    const key = decodeURIComponent(location.hash.slice('#inbox:'.length));
    if (key && state.inbox.items.some((x) => x.key === key)) openSuggestion(key);
  }
  else await selectSection(MODE === 'website' ? 'W.1' : 'C.2');
  refreshInboxCount();
})
  .catch((err) => setStatus(`Could not load: ${err.message}`, 'error'));
