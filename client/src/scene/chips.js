import * as THREE from 'three';
import { CH, CR, DENOMS, chipGeo, chipMaterials } from './art.js';

const COLUMN_MAX = 12;

// [colour, count] per column, tallest denominations first.
export function chipColumns(amount) {
  const cols = [];
  let rest = Math.max(0, Math.ceil(amount / 10) * 10);
  for (const [c, v] of DENOMS) {
    let n = Math.min(Math.floor(rest / v), COLUMN_MAX * 3);
    rest -= Math.floor(rest / v) * v;
    while (n > 0) { cols.push([c, Math.min(n, COLUMN_MAX)]); n -= COLUMN_MAX; }
  }
  return cols.slice(0, 12);
}

function chip(c, x, y, z, rx = 0, ry = Math.random() * 6, rz = 0) {
  const m = new THREE.Mesh(chipGeo, chipMaterials(c));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Columns laid out in rows of four, like the mockup's seat stacks. Origin is the group centre on the felt.
export function stackGroup(amount) {
  const g = new THREE.Group();
  const cols = chipColumns(amount);
  const rows = Math.ceil(cols.length / 4);
  cols.forEach(([c, n], i) => {
    const r = Math.floor(i / 4);
    const inRow = Math.min(4, cols.length - r * 4);
    const x = ((i % 4) - (inRow - 1) / 2) * CR * 2.1;
    const z = (r - (rows - 1) / 2) * CR * 2.05;
    for (let k = 0; k < n; k++) g.add(chip(c, x + (Math.random() - 0.5) * 0.004, 0.006 + k * CH, z + (Math.random() - 0.5) * 0.004));
  });
  return g;
}

// Loose pile for the pot: deterministic per amount so rebuilds do not reshuffle.
export function pileGroup(amount, spread = 0.16) {
  const g = new THREE.Group();
  const list = chipColumns(amount).flatMap(([c, n]) => Array(n).fill(c)).slice(0, 48);
  let seed = amount + 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  list.forEach((c, i) => {
    const a = rnd() * 6.28;
    const r = Math.sqrt(rnd()) * spread;
    g.add(chip(c, r * Math.cos(a) * 1.3, 0.006 + (i % 3) * CH * 0.9, r * Math.sin(a), (rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3));
  });
  return g;
}
