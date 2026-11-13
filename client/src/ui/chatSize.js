// Chat size marks (CONTRACTS 6): '#' = 2, '*' = 1, '**' = 2, '***' = 3. Nothing after the mark -> plain (0).
// Pure (no DOM, no CSS import) so tests can load it.
// Only marks/spaces after the mark (`#*`, `* *`) = no text: same rule as liar plainChat / server stripSizeMark.
const real = (s) => /[^\s#*]/u.test(s);

export function chatSize(raw) {
  const t = String(raw).trim();
  if (t.startsWith('#')) {
    const rest = t.slice(1).trimStart();
    return real(rest) ? { size: 2, text: rest } : { size: 0, text: t };
  }
  const stars = /^\*{1,3}/.exec(t)?.[0];
  if (!stars) return { size: 0, text: t };
  const rest = t.slice(stars.length).trimStart();
  return real(rest) ? { size: stars.length, text: rest } : { size: 0, text: t };
}
