// The dashboard home: shows the state of each tool and runs the few actions that live here.
const $ = (sel) => document.querySelector(sel);
const api = async (path, opts = {}) => {
  const r = await fetch(`/api/${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j;
};
const setStatus = (text, kind = '') => { $('#status').textContent = text; $('#status').className = `status ${kind}`; };
const ago = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
};

let st;
async function refresh() {
  try { st = await api('status'); } catch (err) { setStatus(`Could not load the status: ${err.message}`, 'error'); return; }
  const cvCount = Object.entries(st.counts).filter(([id]) => /^[A-E]/.test(id)).reduce((n, [, c]) => n + c, 0);
  $('#cv-meta').textContent = `${cvCount} entries.`;

  $('#inbox-count').textContent = st.inbox.count;
  $('#inbox-count').hidden = !st.inbox.count;
  $('#inbox-meta').textContent = `${st.inbox.count ? `${st.inbox.count} new.` : 'Nothing new.'} Last checked ${ago(st.inbox.checked_at)}.`;

  const on = st.preview.running;
  $('#preview-dot').classList.toggle('on', on);
  $('#preview-meta').textContent = on ? `Running at ${st.preview.url}` : st.preview.starting ? 'Starting…' : 'Not running.';
  $('#preview-start').hidden = on;
  $('#preview-start').disabled = st.preview.starting;
  $('#preview-open').hidden = !on;

  const b = st.build;
  $('#build-meta').textContent = b.building ? 'Updating…' : b.at ? `${b.ok ? 'Last updated' : 'The last update failed'} ${ago(b.at)}.` : 'Not rebuilt since the dashboard started.';

  const g = st.git;
  $('#git-meta').textContent = g.changed
    ? `${g.changed} changed file${g.changed > 1 ? 's' : ''} in data/ since the last checkpoint.`
    : 'All changes are saved in a checkpoint.';
  $('#publish-meta').textContent = `Last checkpoint: ${g.last ? `“${g.last.message}”, ${ago(g.last.when)}` : 'none'}. ${g.remote ? 'Publish uploads your checkpoints to GitHub, which updates the live site.' : 'Publishing starts working once the site is on GitHub.'}`;
  $('#checkpoint').disabled = !g.changed;
  $('#publish').disabled = !g.remote;
}

$('#preview-start').addEventListener('click', async () => {
  $('#preview-start').disabled = true;
  await api('preview/start', { method: 'POST' });
  setStatus('Starting the local website…');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    await refresh();
    if (st?.preview.running) { setStatus('The local website is running.'); return; }
  }
  setStatus('The local website did not start. Try `npm run dev` in a terminal to see why.', 'error');
});

$('#checkpoint').addEventListener('click', async () => {
  const message = prompt('Describe this checkpoint (e.g. "Added CBC Ideas interview"):', 'Update CV');
  if (message === null) return;
  try { const r = await api('checkpoint', { method: 'POST', body: { message } }); setStatus(r.message); }
  catch (err) { setStatus(`Checkpoint failed: ${err.message}`, 'error'); }
  refresh();
});

$('#publish').addEventListener('click', async () => {
  const s = await api('publish');
  if (!s.changed && !s.ahead) { setStatus('Nothing new to publish: the live website is up to date.'); return; }
  let message = 'Update CV data';
  if (s.changed) {
    message = prompt(`Describe the changes for the checkpoint made before publishing (${s.changed} changed file(s) in data/):`, 'Update CV');
    if (message === null) return;
  }
  if (!confirm('Publish to the live website? Your checkpoints are uploaded to GitHub, which rebuilds the site.')) return;
  setStatus('Publishing…');
  try { const r = await api('publish', { method: 'POST', body: { message } }); setStatus(r.message, r.ok ? '' : 'error'); }
  catch (err) { setStatus(`Publishing failed: ${err.message}`, 'error'); }
  refresh();
});

setStatus('Ready.');
refresh();
setInterval(refresh, 10000);
