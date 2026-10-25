// Brooklyn Heights as a street map, the one both the 3D page (heights.js) and its minimap are drawn from:
// the streets, the blocks between them, the bluff, the waterfront and the piers. Plain data, no Three.js.

// x runs grid-east (towards Cadman Plaza), z grid-south (towards Atlantic Ave), in metres
export const TOP = 16;          // the Heights' road level, up on the bluff
export const WF = 2;            // the waterfront's: Furman St, Brooklyn Bridge Park, the piers
export const CURB = 0.15;       // sidewalks stand this far above the road
export const WALK = 5;          // sidewalk width, curb to building line
export const BLUFF = -16;       // the bluff's edge: the Promenade's railing, the drop to Furman St
// the grid's tilt from true north (Henry St runs about 21° east of north); the minimap turns by it
export const GRID_TILT = 21 * Math.PI / 180;
// the playable map
export const BOUNDS = { x0: -360, x1: 820, z0: -840, z1: 580 };

// streets running grid north–south (constant x) and east–west (constant z): centre line, half the road's
// width, and how far they run. They all start and end on another street (or the map's edge).
export const NS = [
  { name: 'Columbia Heights', x: 70, r: 5, z0: -760, z1: -110 },
  { name: 'Pierrepont Pl', x: 70, r: 4.5, z0: -110, z1: 0 },
  { name: 'Montague Ter', x: 70, r: 4.5, z0: 0, z1: 110 },
  { name: 'Willow St', x: 160, r: 4.5, z0: -610, z1: -110 },
  { name: 'Columbia Pl', x: 70, r: 4, z0: 260, z1: 400 },
  { name: 'Willow Pl', x: 160, r: 4, z0: 260, z1: 400 },
  { name: 'Hicks St', x: 250, r: 5, z0: -760, z1: 580 },
  { name: 'Garden Pl', x: 300, r: 4, z0: 260, z1: 400 },
  { name: 'Henry St', x: 350, r: 5.5, z0: -760, z1: 580 },
  { name: 'Monroe Pl', x: 410, r: 4.5, z0: -230, z1: -110 },
  { name: 'Clinton St', x: 470, r: 5, z0: -110, z1: 580 },
  { name: 'Sidney Pl', x: 515, r: 4, z0: 260, z1: 400 },
  { name: 'Cadman Plaza W', x: 560, r: 7.5, z0: -760, z1: 0 },
  { name: 'Court St', x: 560, r: 7.5, z0: 0, z1: 580 },
  { name: 'Cadman Plaza E', x: 760, r: 8, z0: -760, z1: -260 },
  { name: 'Adams St', x: 760, r: 9, z0: -260, z1: 260 },
  { name: 'Boerum Pl', x: 760, r: 8, z0: 260, z1: 580 },
];
export const EW = [
  { name: 'Old Fulton St', z: -760, r: 7, x0: -19, x1: 760 },
  { name: 'Poplar St', z: -685, r: 4, x0: 70, x1: 350 },
  { name: 'Middagh St', z: -610, r: 4, x0: 70, x1: 560 },
  { name: 'Cranberry St', z: -530, r: 4, x0: 70, x1: 560 },
  { name: 'Orange St', z: -435, r: 4, x0: 0, x1: 560 },
  { name: 'Pineapple St', z: -335, r: 4, x0: 70, x1: 560 },
  { name: 'Tillary St', z: -260, r: 9, x0: 560, x1: 820 },
  { name: 'Clark St', z: -230, r: 4.5, x0: 0, x1: 560 },
  { name: 'Pierrepont St', z: -110, r: 4.5, x0: 0, x1: 560 },
  { name: 'Montague St', z: 0, r: 5.5, x0: 0, x1: 560 },
  { name: 'Remsen St', z: 110, r: 4.5, x0: 0, x1: 560 },
  { name: 'Joralemon St', z: 260, r: 5, x0: -19, x1: 820 },
  { name: 'State St', z: 400, r: 4.5, x0: 70, x1: 820 },
  { name: 'Atlantic Ave', z: 510, r: 10, x0: -19, x1: 820 },
];
// streets that run down off the bluff to Furman St: steep, cobbled, no houses alongside up top
export const DESCENTS = [
  { name: 'Old Fulton St', z0: -767, z1: -753, xTop: 70, xBottom: -19 },
  { name: 'Joralemon St', z0: 255, z1: 265, xTop: 70, xBottom: -19 },
  { name: 'Atlantic Ave', z0: 500, z1: 520, xTop: 70, xBottom: -19 },
];
// height of the road on a descent at x
export function descentY(d, x) {
  const k = Math.max(0, Math.min(1, (x - d.xBottom) / (d.xTop - d.xBottom)));
  return WF + (TOP - WF) * k;
}

// the street (if any) on a line, covering the point `at` along it
export function streetAt(list, line, at) {
  const key = list === NS ? 'x' : 'z', lo = list === NS ? 'z0' : 'x0', hi = list === NS ? 'z1' : 'x1';
  return list.find(s => s[key] === line && s[lo] <= at && s[hi] >= at) || null;
}
// is (x, z) on a road (Heights or Furman St)?
export function onRoad(x, z) {
  return NS.some(s => Math.abs(x - s.x) <= s.r && z >= s.z0 - 1 && z <= s.z1 + 1)
    || EW.some(s => Math.abs(z - s.z) <= s.r && x >= s.x0 - 1 && x <= s.x1 + 1)
    || (Math.abs(x - FURMAN.x) <= FURMAN.r && z >= FURMAN.z0 && z <= FURMAN.z1);
}
export function descentAt(x, z) {
  return DESCENTS.find(d => z >= d.z0 && z <= d.z1 && x >= d.xBottom - 1 && x <= d.xTop) || null;
}

// ---------- Blocks ----------
// The Heights are cut into cells by every street line. Each cell gets a sidewalk slab out to the curb on the
// sides that have a street and out to the line itself where there isn't one (so neighbouring cells with no
// street between them join up), and building lots inside the sidewalks.
const uniq = a => [...new Set(a)].sort((p, q) => p - q);
export const X_LINES = uniq([0, BOUNDS.x1, ...NS.map(s => s.x)]);
export const Z_LINES = uniq([BOUNDS.z0, BOUNDS.z1, ...EW.map(s => s.z)]);

function cellKind(x0, x1, z0, z1) {
  if (z1 <= -760) return x0 >= 760 ? 'bridge' : 'dumbo';
  if (x0 >= 760) return 'downtown';
  if (x0 >= 560) return z1 <= -260 ? 'cadman' : z1 <= 0 ? 'courts' : z1 <= 260 ? 'borough' : 'downtown';
  if (x0 === 0 && z0 === -760) return 'watchtower';
  if (x0 === 0 && z0 === -685) return 'squibb';
  return 'rows';
}

export const CELLS = [];
for (let i = 0; i < X_LINES.length - 1; i++) {
  for (let j = 0; j < Z_LINES.length - 1; j++) {
    const x0 = X_LINES[i], x1 = X_LINES[i + 1], z0 = Z_LINES[j], z1 = Z_LINES[j + 1];
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const st = { w: streetAt(NS, x0, mz), e: streetAt(NS, x1, mz), n: streetAt(EW, z0, mx), s: streetAt(EW, z1, mx) };
    const c = { x0, x1, z0, z1, st, kind: cellKind(x0, x1, z0, z1) };
    c.sx0 = x0 + (st.w ? st.w.r : 0); c.sx1 = x1 - (st.e ? st.e.r : 0);
    c.sz0 = z0 + (st.n ? st.n.r : 0); c.sz1 = z1 - (st.s ? st.s.r : 0);
    c.lx0 = c.sx0 + (st.w ? WALK : 0); c.lx1 = c.sx1 - (st.e ? WALK : 0);
    c.lz0 = c.sz0 + (st.n ? WALK : 0); c.lz1 = c.sz1 - (st.s ? WALK : 0);
    // which sides front a street that houses can face (not the descents, which are below them)
    c.front = {};
    for (const side of ['w', 'e', 'n', 's']) {
      const s = st[side];
      if (!s) continue;
      const px = side === 'w' ? c.sx0 - 1 : side === 'e' ? c.sx1 + 1 : mx;
      const pz = side === 'n' ? c.sz0 - 1 : side === 's' ? c.sz1 + 1 : mz;
      if (!descentAt(px, pz)) c.front[side] = s;
    }
    CELLS.push(c);
  }
}

// ---------- The bluff and the waterfront ----------
export const PROMENADE = { x0: BLUFF, x1: 0, z0: -439, z1: 114.5 };
// the BQE's triple cantilever under the Promenade: two decks of highway, in and out of tunnels in the bluff
export const BQE = { x0: BLUFF, x1: 0, z0: -520, z1: 230, decks: [7, 11.5] };
export const FURMAN = { name: 'Furman St', x: -24, r: 5, z0: -830, z1: 520 };
// land down at the waterfront: the park's upland strip along Furman St, Fulton Ferry Landing and the piers
export const UPLAND = { x0: -110, x1: BLUFF, z0: -770, z1: 520 };
export const LANDING = { name: 'Fulton Ferry Landing', x0: -130, x1: BLUFF, z0: -830, z1: -770 };
export const PIERS = [
  { name: 'Pier 1', x0: -230, x1: -110, z0: -745, z1: -560 },
  { name: 'Pier 2', x0: -320, x1: -110, z0: -470, z1: -385 },
  { name: 'Pier 3', x0: -320, x1: -110, z0: -300, z1: -215 },
  { name: 'Pier 5', x0: -340, x1: -110, z0: 110, z1: 215 },
  { name: 'Pier 6', x0: -270, x1: -110, z0: 395, z1: 500 },
];
export const ONE_BBP = { name: 'One Brooklyn Bridge Park', x0: -98, x1: -38, z0: 190, z1: 330, h: 40 };
// the Squibb Park footbridge, from the bluff by Columbia Heights down to Pier 1
export const SQUIBB = { z0: -642, z1: -638, xTop: BLUFF, xBottom: -140 };
export const squibbY = x => WF + CURB + (TOP - WF) * Math.max(0, Math.min(1, (x - SQUIBB.xBottom) / (SQUIBB.xTop - SQUIBB.xBottom)));

// ---------- The Brooklyn Bridge ----------
// straight along the grid's west (it really heads off a touch north of that), its walkway climbing from
// Cadman Plaza East to the Brooklyn tower, then level across the river to the Manhattan tower
// (the climb ends at xRamp, where the walkway widens into the platform round the Brooklyn tower)
export const BRIDGE = { z: -800, xStart: 800, xRamp: -176, xTower: -200, xTower2: -686, deck: 41, walk: 3 };
export function bridgeY(x) {
  if (x >= BRIDGE.xStart) return TOP;
  if (x >= BRIDGE.xRamp) return TOP + (BRIDGE.deck - TOP) * (BRIDGE.xStart - x) / (BRIDGE.xStart - BRIDGE.xRamp);
  if (x >= BRIDGE.xTower2) return BRIDGE.deck;
  return BRIDGE.deck - (BRIDGE.xTower2 - x) * 0.06;   // down into Manhattan
}

// ---------- Civic centre ----------
export const BOROUGH_HALL = { name: 'Borough Hall', x0: 625, x1: 665, z0: 190, z1: 248 };
export const SUPREME_COURT = { name: 'Supreme Court', x0: 600, x1: 680, z0: -170, z1: -100 };
export const FEDERAL_COURT = { name: 'Federal Courthouse', x0: 695, x1: 748, z0: -240, z1: -165 };
export const WAR_MEMORIAL = { name: 'War Memorial', x0: 610, x1: 710, z0: -700, z1: -684 };
export const MUNICIPAL = { name: 'Municipal Building', x0: 573, x1: 640, z0: 270, z1: 330 };

// buildings that take over part of a block, in place of the houses there
export const PLOTS = [
  { name: 'Plymouth Church', kind: 'church', x0: 282, x1: 318, z0: -490, z1: -444, front: 's' },
  { name: 'St. Ann & the Holy Trinity', kind: 'church', x0: 424, x1: 460, z0: 10.5, z1: 62, front: 'n', tower: true },
  { name: 'Hotel St. George', kind: 'tower', x0: 361, x1: 420, z0: -292, z1: -239.5, h: 92, color: 'brick' },
  { name: '16 Court St', kind: 'tower', x0: 510, x1: 547.5, z0: 11, z1: 48, h: 138, color: 'lime' },
  { name: '26 Court St', kind: 'tower', x0: 516, x1: 547.5, z0: 66, z1: 99.5, h: 96, color: 'lime' },
  { name: 'Municipal Building', kind: 'tower', ...MUNICIPAL, h: 92, color: 'lime' },
  { name: 'Cadman Towers', kind: 'tower', x0: 480, x1: 547.5, z0: -592, z1: -545, h: 96, color: 'brick' },
  { name: 'One Pierrepont Plaza', kind: 'tower', x0: 480, x1: 530, z0: -100, z1: -54, h: 80, color: 'glass' },
];

// names for the minimap
export const LABELS = [
  { name: 'Brooklyn Heights Promenade', x: -8, z: -160, rot: 90 },
  { name: 'Brooklyn Bridge', x: -60, z: -812 },
  { name: 'Brooklyn Bridge Park', x: -70, z: 40, rot: 90 },
  { name: 'Cadman Plaza Park', x: 660, z: -500 },
  { name: 'Borough Hall', x: 645, z: 170 },
  { name: 'Columbus Park', x: 655, z: 60 },
  { name: 'East River', x: -330, z: -100, rot: 90, water: true },
  { name: 'BROOKLYN HEIGHTS', x: 300, z: -60, big: true },
  { name: 'DUMBO', x: 400, z: -815 },
  ...PIERS.map(p => ({ name: p.name, x: (p.x0 + p.x1) / 2 - 30, z: (p.z0 + p.z1) / 2 })),
];
