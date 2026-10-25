// The Brooklyn Heights minimap: the street map drawn once in Google Maps' colours (white streets, grey blocks,
// green parks, blue water, yellow highways), turned so true north is up, with the hero's arrow. Tab opens it
// full screen, where a click picks a spot to go to.
import {
  BOROUGH_HALL, BQE, BRIDGE, CELLS, DESCENTS, EW, FEDERAL_COURT, FURMAN, GRID_TILT, LABELS, LANDING, NS, ONE_BBP,
  PIERS, PLOTS, PROMENADE, SQUIBB, SUPREME_COURT, UPLAND, WAR_MEMORIAL,
} from './heightsmap.js';

const PX = 0.6;                                          // pixels per metre on the drawn map
const AREA = { x0: -620, x1: 940, z0: -920, z1: 680 };
const KIND = { rows: '#ebe8e1', downtown: '#e4e1dc', dumbo: '#e9e2d8', watchtower: '#e4dcd2', squibb: '#c5e6b9',
  cadman: '#c5e6b9', courts: '#e6e2da', borough: '#d5ecc8', bridge: '#e6e2da' };

function drawMap() {
  const c = document.createElement('canvas');
  c.width = (AREA.x1 - AREA.x0) * PX; c.height = (AREA.z1 - AREA.z0) * PX;
  const g = c.getContext('2d');
  const rect = (r, color) => { g.fillStyle = color; g.fillRect((r.x0 - AREA.x0) * PX, (r.z0 - AREA.z0) * PX, (r.x1 - r.x0) * PX, (r.z1 - r.z0) * PX); };
  const at = (x, z) => [(x - AREA.x0) * PX, (z - AREA.z0) * PX];
  rect(AREA, '#a3cdf1');                                                              // the river
  rect({ x0: -130, x1: AREA.x1, z0: AREA.z0, z1: -770 }, '#efece6');                  // DUMBO
  rect({ x0: 0, x1: AREA.x1, z0: AREA.z0, z1: AREA.z1 }, '#efece6');
  rect({ x0: AREA.x0, x1: -830, z0: AREA.z0, z1: 520 }, '#efece6');                   // Manhattan
  rect({ x0: 0, x1: 820, z0: -840, z1: 580 }, '#ffffff');                            // the Heights' streets
  for (const d of DESCENTS) rect({ x0: d.xBottom, x1: d.xTop, z0: d.z0, z1: d.z1 }, '#ffffff');
  for (const k of CELLS) rect({ x0: k.sx0, x1: k.sx1, z0: k.sz0, z1: k.sz1 }, KIND[k.kind] || '#ebe8e1');
  for (const k of CELLS) {
    if (k.kind !== 'rows' && k.kind !== 'downtown') continue;
    // the houses round the edge of each block
    const L = { x0: k.lx0, x1: k.lx1, z0: k.lz0, z1: k.lz1 };
    if (L.x1 - L.x0 < 4 || L.z1 - L.z0 < 4) continue;
    rect(L, '#dedad2');
    if (L.x1 - L.x0 > 30 && L.z1 - L.z0 > 30) rect({ x0: L.x0 + 13, x1: L.x1 - 13, z0: L.z0 + 13, z1: L.z1 - 13 }, '#e3ecd8');
  }
  for (const p of [...PLOTS, BOROUGH_HALL, SUPREME_COURT, FEDERAL_COURT, WAR_MEMORIAL]) rect(p, '#d6d1c7');
  // the waterfront
  rect(UPLAND, '#c5e6b9'); rect(LANDING, '#e6e2da');
  for (const p of PIERS) rect(p, p.name === 'Pier 2' ? '#d9d4c8' : '#c5e6b9');
  rect({ x0: FURMAN.x - FURMAN.r, x1: FURMAN.x + FURMAN.r, z0: FURMAN.z0, z1: FURMAN.z1 }, '#ffffff');
  rect(ONE_BBP, '#d6d1c7');
  rect({ x0: BQE.x0, x1: BQE.x1, z0: BQE.z0, z1: BQE.z1 }, '#f8d26a');
  rect({ x0: PROMENADE.x0, x1: PROMENADE.x0 + 6, z0: PROMENADE.z0, z1: PROMENADE.z1 }, '#9fd48f');
  rect({ x0: SQUIBB.xBottom, x1: SQUIBB.xTop, z0: SQUIBB.z0, z1: SQUIBB.z1 }, '#b49a72');
  rect({ x0: AREA.x0, x1: BRIDGE.xStart, z0: BRIDGE.z - 13, z1: BRIDGE.z + 13 }, '#f8d26a');
  rect({ x0: AREA.x0, x1: BRIDGE.xStart, z0: BRIDGE.z - 2, z1: BRIDGE.z + 2 }, '#fff4cf');
  // street names, along each street
  g.fillStyle = '#5f6368'; g.font = '600 9px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const s of NS) {
    if (s.z1 - s.z0 < 100) continue;
    const [x, y] = at(s.x, (s.z0 + s.z1) / 2);
    g.save(); g.translate(x, y); g.rotate(Math.PI / 2); g.fillText(s.name, 0, 0); g.restore();
  }
  for (const s of EW) {
    const x0 = Math.max(s.x0, 0), [x, y] = at((x0 + s.x1) / 2, s.z);
    g.fillText(s.name, x, y);
  }
  g.save();
  const [fx, fy] = at(FURMAN.x, -300);
  g.translate(fx, fy); g.rotate(Math.PI / 2); g.fillText('Furman St', 0, 0); g.restore();
  for (const l of LABELS) {
    const [x, y] = at(l.x, l.z);
    g.save(); g.translate(x, y); if (l.rot) g.rotate(l.rot * Math.PI / 180);
    g.fillStyle = l.water ? '#3f7fb5' : l.big ? '#80868b' : '#3c7a36';
    g.font = l.big ? '700 15px system-ui, sans-serif' : `${l.water ? 'italic ' : ''}600 10px system-ui, sans-serif`;
    g.fillText(l.name, 0, 0);
    g.restore();
  }
  return c;
}

export function createMinimap(mini, big, onPick) {
  const map = drawMap();
  const mg = mini.getContext('2d'), bg = big.getContext('2d');
  let open = false, fit = null;
  const arrow = (g, x, y, a, s) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = '#1a73e8'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(9 * s, 0); g.lineTo(-6 * s, -6 * s); g.lineTo(-3 * s, 0); g.lineTo(-6 * s, 6 * s); g.closePath();
    g.fill(); g.stroke(); g.restore();
  };
  // the map's pixel for a world point, and the screen transform for the big map
  const mx = x => (x - AREA.x0) * PX, mz = z => (z - AREA.z0) * PX;
  function layout() {
    big.width = innerWidth; big.height = innerHeight;
    const w = map.width, h = map.height, c = Math.cos(GRID_TILT), s = Math.sin(GRID_TILT);
    const k = Math.min(big.width / (w * c + h * s), big.height / (w * s + h * c)) * 0.96;
    fit = { k, cx: big.width / 2, cy: big.height / 2 };
  }
  // the next turf: a red map pin with its point on the spot
  const pin = (g, x, y, s) => {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = '#ea4335'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-3, -6, -8, -9, -8, -15); g.arc(0, -15, 8, Math.PI, 0); g.bezierCurveTo(8, -9, 3, -6, 0, 0);
    g.fill(); g.stroke();
    g.fillStyle = '#a50e0e'; g.beginPath(); g.arc(0, -15, 3, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  let target = null;
  function drawBig(hero) {
    if (!fit) layout();
    const { k, cx, cy } = fit;
    bg.fillStyle = '#000c'; bg.fillRect(0, 0, big.width, big.height);
    bg.save(); bg.translate(cx, cy); bg.rotate(GRID_TILT); bg.scale(k, k);
    bg.drawImage(map, -map.width / 2, -map.height / 2);
    bg.restore();
    if (target) pin(bg, ...toScreen(target.x, target.z), 1.3);
    const [hx, hy] = toScreen(hero.x, hero.z);
    arrow(bg, hx, hy, GRID_TILT + hero.heading, 1.4);
    bg.fillStyle = '#fff'; bg.font = '600 14px system-ui, sans-serif'; bg.textAlign = 'center';
    bg.fillText('Click anywhere on land to go there · Tab or Esc to close', big.width / 2, big.height - 18);
  }
  function toScreen(x, z) {
    const { k, cx, cy } = fit, px = (mx(x) - map.width / 2) * k, py = (mz(z) - map.height / 2) * k;
    const c = Math.cos(GRID_TILT), s = Math.sin(GRID_TILT);
    return [cx + px * c - py * s, cy + px * s + py * c];
  }
  function toWorld(sx, sy) {
    const { k, cx, cy } = fit, c = Math.cos(GRID_TILT), s = Math.sin(GRID_TILT);
    const dx = sx - cx, dy = sy - cy, px = (dx * c + dy * s) / k, py = (-dx * s + dy * c) / k;
    return [(px + map.width / 2) / PX + AREA.x0, (py + map.height / 2) / PX + AREA.z0];
  }
  big.addEventListener('click', e => {
    const [x, z] = toWorld(e.clientX, e.clientY);
    if (onPick(x, z)) toggle(false);
  });
  addEventListener('resize', () => { fit = null; });
  function toggle(v = !open) { open = v; big.style.display = open ? 'block' : 'none'; }

  return {
    get open() { return open; },
    toggle,
    // goal: the next turf's spot, or null; foes: the gangsters, shown as red dots
    draw(hero, goal = null, foes = []) {
      target = goal;
      const w = mini.width, h = mini.height, c = Math.cos(GRID_TILT), s = Math.sin(GRID_TILT);
      // a world point on the minimap, kept to its edge when it's further away
      const onMini = (x, z, edge) => {
        const dx = (x - hero.x) * PX, dz = (z - hero.z) * PX;
        let px = dx * c - dz * s, py = dx * s + dz * c;
        const r = Math.hypot(px, py), max = w / 2 - edge;
        if (r > max) { px *= max / r; py *= max / r; }
        return [w / 2 + px, h / 2 + py];
      };
      mg.clearRect(0, 0, w, h);
      mg.save();
      mg.beginPath(); mg.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); mg.clip();
      mg.fillStyle = '#a3cdf1'; mg.fillRect(0, 0, w, h);
      mg.translate(w / 2, h / 2); mg.rotate(GRID_TILT);
      mg.drawImage(map, -mx(hero.x), -mz(hero.z));
      mg.restore();
      mg.fillStyle = '#d93025';
      for (const f of foes) {
        if (!f.alive) continue;
        const [fx, fy] = onMini(f.x, f.z, 6);
        mg.beginPath(); mg.arc(fx, fy, 3.5, 0, Math.PI * 2); mg.fill();
      }
      if (goal) pin(mg, ...onMini(goal.x, goal.z, 4), 0.9);
      arrow(mg, w / 2, h / 2, GRID_TILT + hero.heading, 1);
      mg.fillStyle = '#202124'; mg.font = '700 11px system-ui, sans-serif'; mg.textAlign = 'center';
      mg.fillText('N', w / 2, 14);
      if (open) drawBig(hero);
    },
  };
}
