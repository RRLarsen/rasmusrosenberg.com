// Fills every .wordmark element with the name (from data/profile.yaml via /api/status).
export async function drawWordmark(name) {
  if (!name) name = (await fetch('/api/status').then((r) => r.json()).catch(() => ({}))).name ?? '';
  for (const el of document.querySelectorAll('.wordmark')) {
    el.setAttribute('aria-label', `${name}: dashboard`);
    el.innerHTML = '';
    const letters = document.createElement('span');
    letters.setAttribute('aria-hidden', 'true');
    name.split(' ').forEach((w, i, all) => {
      const cap = document.createElement('span'); cap.className = 'cap'; cap.textContent = w[0];
      const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = w.slice(1);
      letters.append(cap, sc, i < all.length - 1 ? ' ' : '');
    });
    el.append(letters);
  }
}
