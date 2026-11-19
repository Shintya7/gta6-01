// Solmar, the game's city: a 10x10 grid of blocks split by roads, with districts,
// landmarks, a harbour basin and a central park. Everything is built from a seed, so the
// same seed always builds the same city. Collision is circle-vs-building, resolved through
// the block the circle stands in (and its neighbours), so it stays cheap at any speed.

import { DISTRICT_COLOURS, WORLD } from './config.js';

const { size, pitch, road, block, blocks, roadCenters } = WORLD;

function blockOrigin(i) {
  return i * pitch + road;
}

function districtOf(bx, by) {
  if (bx === 4 && by === 5) return 'park';
  if (bx === 9 && by === 9) return 'harbour';
  if (bx >= 3 && bx <= 6 && by >= 3 && by <= 6) return 'downtown';
  if (by >= 8) return 'marina';
  if (bx <= 2 && by <= 7) return 'barrio';
  if (bx >= 7 && by <= 2) return 'industrial';
  return 'uptown';
}

function buildBlock(rng, bx, by) {
  const district = districtOf(bx, by);
  const x0 = blockOrigin(bx);
  const y0 = blockOrigin(by);
  const colours = DISTRICT_COLOURS[district] || DISTRICT_COLOURS.barrio;
  const buildings = [];
  const trees = [];
  if (district === 'park') {
    for (let t = 0; t < 14; t += 1) {
      trees.push({ x: x0 + rng.range(16, block - 16), y: y0 + rng.range(16, block - 16), r: rng.range(9, 15) });
    }
    return { district, buildings, trees, park: true };
  }
  if (district === 'harbour') {
    return { district, buildings, trees, harbour: true };
  }
  if (district === 'downtown') {
    const w = rng.range(150, 190);
    const h = rng.range(150, 190);
    buildings.push({
      x: x0 + (block - w) / 2, y: y0 + (block - h) / 2, w, h,
      color: rng.pick(colours), roof: '#3a3f4a', tall: true, district,
    });
  } else if (district === 'industrial') {
    buildings.push({
      x: x0 + 10, y: y0 + 30, w: 200, h: 120,
      color: rng.pick(colours), roof: '#4a4a4a', tall: false, district,
    });
    buildings.push({
      x: x0 + 20, y: y0 + 168, w: 70, h: 40,
      color: rng.pick(colours), roof: '#333333', tall: false, district,
    });
  } else {
    // barrio / marina / uptown: four small houses with an alley cross between them.
    const hw = rng.range(82, 96);
    const hh = rng.range(82, 96);
    const gap = 14;
    const positions = [
      [x0 + 8, y0 + 8], [x0 + block - hw - 8, y0 + 8],
      [x0 + 8, y0 + block - hh - 8], [x0 + block - hw - 8, y0 + block - hh - 8],
    ];
    for (const [x, y] of positions) {
      if (rng.chance(0.85)) {
        buildings.push({ x, y, w: hw, h: hh, color: rng.pick(colours), roof: '#7a4a2b', tall: false, district });
      }
    }
    if (rng.chance(0.5)) {
      trees.push({ x: x0 + block / 2, y: y0 + block / 2, r: 12 });
    }
  }
  return { district, buildings, trees, park: false };
}

export function createCity(rng) {
  const grid = [];
  for (let by = 0; by < blocks; by += 1) {
    const row = [];
    for (let bx = 0; bx < blocks; bx += 1) row.push(buildBlock(rng, bx, by));
    grid.push(row);
  }
  const buildings = [];
  const trees = [];
  for (const row of grid) {
    for (const cell of row) {
      buildings.push(...cell.buildings);
      trees.push(...cell.trees);
    }
  }
  // The harbour basin: open water in the south-east corner block, with a dock edge.
  const harbour = { x: blockOrigin(9), y: blockOrigin(9), w: block, h: block };
  const landmarks = {
    safehouse: { x: roadCenters[2], y: 742, label: "Mara's Garage", block: [2, 2] },
    paintShop: { x: roadCenters[7], y: 1026, label: 'Coral Paint & Body', block: [7, 3] },
    docks: { x: roadCenters[9], y: 2730, label: 'Solmar Docks', block: [9, 9] },
    bank: { x: 1878, y: roadCenters[5], label: 'Solmar Trust Bank', block: [6, 4] },
    hospital: { x: roadCenters[2], y: 2162, label: 'St. Lumen Hospital', block: [1, 7] },
    policeStation: { x: roadCenters[8], y: 458, label: 'Solmar PD', block: [8, 1] },
  };
  // Ten hidden cash stashes: park corners, barrio alleys, the harbour edge.
  const stashes = [
    { x: blockOrigin(4) + 24, y: blockOrigin(5) + 24 },
    { x: blockOrigin(4) + block - 24, y: blockOrigin(5) + block - 24 },
    { x: blockOrigin(4) + block - 24, y: blockOrigin(5) + 24 },
    { x: blockOrigin(0) + 110, y: blockOrigin(0) + 110 },
    { x: blockOrigin(1) + 110, y: blockOrigin(3) + 110 },
    { x: blockOrigin(2) + 110, y: blockOrigin(6) + 110 },
    { x: blockOrigin(7) + 110, y: blockOrigin(6) + 110 },
    { x: blockOrigin(8) + 110, y: blockOrigin(4) + 110 },
    { x: blockOrigin(9) + 110, y: blockOrigin(7) + 110 },
    { x: blockOrigin(9) + 30, y: blockOrigin(9) - 40 },
  ];
  return { grid, buildings, trees, harbour, landmarks, stashes, size };
}

/** Block indices for a point, or -1 when the point is on a road in that axis. */
export function blockIndexAt(value) {
  const local = value - road;
  if (local < 0) return -1;
  const index = Math.floor(local / pitch);
  const within = local - index * pitch;
  if (index >= blocks || within >= block) return -1;
  return index;
}

function buildingsNear(city, x, y) {
  const bx = blockIndexAt(x);
  const by = blockIndexAt(y);
  const found = [];
  for (let j = Math.max(0, by - 1); j <= Math.min(blocks - 1, by + 1); j += 1) {
    for (let i = Math.max(0, bx - 1); i <= Math.min(blocks - 1, bx + 1); i += 1) {
      found.push(...city.grid[j][i].buildings);
    }
  }
  return found;
}

/** True when the circle at (x, y) with radius r touches a building, the harbour, or the edge. */
export function solidAt(city, x, y, r) {
  if (x < r || y < r || x > size - r || y > size - r) return true;
  const h = city.harbour;
  if (x > h.x - r && x < h.x + h.w + r && y > h.y - r && y < h.y + h.h + r) return true;
  for (const b of buildingsNear(city, x, y)) {
    if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true;
  }
  return false;
}

/** Push the circle at `p` (with radius r) out of whatever solid it overlaps, in place. */
export function resolveCircle(city, p, r) {
  p.x = Math.max(r, Math.min(size - r, p.x));
  p.y = Math.max(r, Math.min(size - r, p.y));
  const h = city.harbour;
  if (p.x > h.x - r && p.x < h.x + h.w + r && p.y > h.y - r && p.y < h.y + h.h + r) {
    const left = p.x - (h.x - r);
    const right = h.x + h.w + r - p.x;
    const top = p.y - (h.y - r);
    const bottom = h.y + h.h + r - p.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) p.x = h.x - r;
    else if (min === right) p.x = h.x + h.w + r;
    else if (min === top) p.y = h.y - r;
    else p.y = h.y + h.h + r;
  }
  for (const b of buildingsNear(city, p.x, p.y)) {
    if (p.x > b.x - r && p.x < b.x + b.w + r && p.y > b.y - r && p.y < b.y + b.h + r) {
      const left = p.x - (b.x - r);
      const right = b.x + b.w + r - p.x;
      const top = p.y - (b.y - r);
      const bottom = b.y + b.h + r - p.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) p.x = b.x - r;
      else if (min === right) p.x = b.x + b.w + r;
      else if (min === top) p.y = b.y - r;
      else p.y = b.y + b.h + r;
    }
  }
}

/** A random point on a road centreline (a car or ped spawn). */
export function randomRoadPoint(rng) {
  const horizontal = rng.chance(0.5);
  const roadIndex = rng.int(0, roadCenters.length - 1);
  const along = rng.range(80, size - 80);
  return horizontal
    ? { x: along, y: roadCenters[roadIndex], angle: rng.chance(0.5) ? 0 : Math.PI }
    : { x: roadCenters[roadIndex], y: along, angle: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
}

/** Snap a point to the nearest road centreline, keeping the other coordinate. */
export function nearestRoadPoint(x, y) {
  let bestX = roadCenters[0];
  let bestY = roadCenters[0];
  let dx = Infinity;
  let dy = Infinity;
  for (const c of roadCenters) {
    if (Math.abs(x - c) < dx) { dx = Math.abs(x - c); bestX = c; }
    if (Math.abs(y - c) < dy) { dy = Math.abs(y - c); bestY = c; }
  }
  return dx <= dy ? { x: bestX, y } : { x, y: bestY };
}

/** The district name of a block, for the HUD's location readout. */
export function districtAt(city, x, y) {
  const bx = blockIndexAt(x);
  const by = blockIndexAt(y);
  if (bx < 0 || by < 0) {
    // On a road: use the nearest block.
    const nx = Math.max(0, Math.min(blocks - 1, Math.floor(x / pitch)));
    const ny = Math.max(0, Math.min(blocks - 1, Math.floor(y / pitch)));
    return city.grid[ny][nx].district;
  }
  return city.grid[by][bx].district;
}
