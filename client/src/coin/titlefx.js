// SPEC 22-17: title badge motion effects. applyFx(badgeEl, fx) adds classes and tiny decoration
// elements (DOM APIs only; the badge's own text is moved, never re-parsed). Idempotent; unknown fx = no-op.
const DECO = {
  lacquer: 3, wall: 1, gag: 1, exile: 4, gravity: 1, vault: 4, trash: 3,
};
const KNOWN = new Set([
  'fire', 'cell', 'flag', 'lacquer', 'megaphone', 'wall', 'martial', 'wire', 'gag', 'plaza', 'exile',
  'bars', 'subtitle', 'gravity', 'rip', 'rainbow', 'forsaken', 'godhand', 'sucker', 'vault', 'trash',
]);

function span(cls) {
  const s = document.createElement('span');
  s.className = cls;
  s.setAttribute('aria-hidden', 'true');
  return s;
}

export function applyFx(badgeEl, fx) {
  if (!badgeEl || typeof fx !== 'string' || !KNOWN.has(fx)) return;
  if (badgeEl.dataset && badgeEl.dataset.tfx) return; // already applied
  badgeEl.dataset.tfx = fx;
  badgeEl.classList.add('tfx', 'tfx-' + fx);

  // keep the text in one wrapper so decorations can sit under/over it
  const t = document.createElement('span');
  t.className = 'tfx-t';
  while (badgeEl.firstChild) t.appendChild(badgeEl.firstChild);
  badgeEl.appendChild(t);

  if (fx === 'subtitle') {
    const text = t.textContent; // copied as text, never as markup
    const a = document.createElement('span');
    a.className = 'tfx-sa';
    a.textContent = text;
    const b = document.createElement('span');
    b.className = 'tfx-sb';
    b.textContent = text;
    b.setAttribute('aria-hidden', 'true');
    t.textContent = '';
    t.append(a, b);
  }

  const n = DECO[fx] || 0;
  for (let i = 0; i < n; i++) badgeEl.appendChild(span('tfx-d tfx-d' + (i + 1)));
}
