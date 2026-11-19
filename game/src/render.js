// Drawing only: the game state and the current screen in, pixels out. The camera follows
// the player (or their car) over a fixed world; the HUD, minimap and menus are drawn on
// top. Everything is flat canvas shapes and text — no images, no fonts to load.

import { CAR, FONT, GAME, PALETTE, PED, PLAYER, WORLD } from './config.js';
import { districtAt } from './city.js';
import { missionObjectiveText, missionTarget } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';

const { size, pitch, road, block, roadCenters } = WORLD;
const MINIMAP = 170;

const fonts = new Map();
function font(size, weight) {
  const key = `${weight || ''}${size}`;
  if (!fonts.has(key)) fonts.set(key, `${weight ? weight + ' ' : ''}${size}px ${FONT}`);
  return fonts.get(key);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const camera = { x: 0, y: 0 };
  let viewW = 0;
  let viewH = 0;
  let ratio = 1;

  function resize() {
    ratio = window.devicePixelRatio || 1;
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * ratio);
    canvas.height = Math.round(viewH * ratio);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
  }

  function text(value, x, y, size, color, align, weight) {
    context.font = font(size, weight);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function updateCamera(state) {
    const focus = state.player.inCar ? state.player.inCar : state.player;
    const lookX = state.player.inCar ? Math.cos(state.player.inCar.angle) * 60 : 0;
    const lookY = state.player.inCar ? Math.sin(state.player.inCar.angle) * 60 : 0;
    camera.x = focus.x + lookX;
    camera.y = focus.y + lookY;
    const halfW = viewW / 2;
    const halfH = viewH / 2;
    camera.x = Math.max(halfW, Math.min(size - halfW, camera.x));
    camera.y = Math.max(halfH, Math.min(size - halfH, camera.y));
    if (viewW >= size) camera.x = size / 2;
    if (viewH >= size) camera.y = size / 2;
  }

  function toWorld(mx, my) {
    return { x: mx + camera.x - viewW / 2, y: my + camera.y - viewH / 2 };
  }

  function drawGround(state) {
    const { city } = state;
    context.fillStyle = PALETTE.ground;
    context.fillRect(0, 0, size, size);
    // Parks.
    for (let by = 0; by < 10; by += 1) {
      for (let bx = 0; bx < 10; bx += 1) {
        const cell = city.grid[by][bx];
        if (!cell.park) continue;
        const x0 = bx * pitch + road;
        const y0 = by * pitch + road;
        context.fillStyle = PALETTE.grass;
        context.fillRect(x0, y0, block, block);
      }
    }
    // Harbour basin.
    const h = city.harbour;
    context.fillStyle = PALETTE.water;
    context.fillRect(h.x, h.y, h.w, h.h);
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(h.x + 8, h.y + 8, h.w - 16, h.h - 16);
    // Docked boats.
    context.fillStyle = '#f5f6fa';
    for (let i = 0; i < 3; i += 1) {
      context.fillRect(h.x + 30 + i * 60, h.y + 60, 44, 16);
    }
    // Trees.
    for (const tree of city.trees) {
      context.fillStyle = PALETTE.parkDark;
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#8bc06a';
      context.beginPath();
      context.arc(tree.x - 3, tree.y - 3, tree.r * 0.6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawRoads() {
    // Sidewalks first (a pale border around each road), then asphalt, then dashes.
    context.fillStyle = PALETTE.sidewalk;
    for (const c of roadCenters) {
      context.fillRect(0, c - road / 2 - 10, size, road + 20);
      context.fillRect(c - road / 2 - 10, 0, road + 20, size);
    }
    context.fillStyle = PALETTE.road;
    for (const c of roadCenters) {
      context.fillRect(0, c - road / 2, size, road);
      context.fillRect(c - road / 2, 0, road, size);
    }
    context.fillStyle = PALETTE.lane;
    for (const c of roadCenters) {
      for (let d = 0; d < size; d += 56) {
        context.fillRect(d, c - 2, 28, 4);
        context.fillRect(c - 2, d, 4, 28);
      }
    }
  }

  function drawBuildings(state) {
    for (const b of state.city.buildings) {
      // A soft shadow to the south-east gives the flat roofs some height.
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      // Windows: a deterministic grid from the building's own position.
      const cols = Math.max(1, Math.floor((b.w - 16) / 20));
      const rows = Math.max(1, Math.floor((b.h - 16) / 20));
      const seed = (b.x * 31 + b.y * 17) % 97;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const lit = (seed + r * 7 + c * 13) % 5 === 0;
          context.fillStyle = lit ? '#ffe9a8' : 'rgba(20,28,40,0.55)';
          context.fillRect(b.x + 10 + c * 20, b.y + 10 + r * 20, 10, 12);
        }
      }
    }
    // Landmark names, small, above their buildings.
    context.font = font(13, '700');
    context.textAlign = 'center';
    for (const key of Object.keys(state.city.landmarks)) {
      const mark = state.city.landmarks[key];
      context.fillStyle = 'rgba(20,16,12,0.75)';
      const w = context.measureText(mark.label).width + 14;
      roundRect(mark.x - w / 2, mark.y - 64, w, 20, 6);
      context.fill();
      context.fillStyle = '#ffe9a8';
      context.fillText(mark.label, mark.x, mark.y - 50);
    }
  }

  function drawMarker(state) {
    const target = missionTarget(state);
    if (!target) return;
    const pulse = 1 + Math.sin(state.elapsed * 5) * 0.12;
    const r = 30 * pulse;
    context.strokeStyle = PALETTE.marker;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(target.x, target.y, r, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = 'rgba(255,225,77,0.25)';
    context.beginPath();
    context.arc(target.x, target.y, r * 0.7, 0, Math.PI * 2);
    context.fill();
    // A beacon column so the marker is visible from far away.
    context.fillStyle = 'rgba(255,225,77,0.10)';
    context.fillRect(target.x - 3, target.y - 260, 6, 260);
    // Off-screen arrow at the view edge.
    const sx = target.x - (camera.x - viewW / 2);
    const sy = target.y - (camera.y - viewH / 2);
    if (sx < 40 || sx > viewW - 40 || sy < 40 || sy > viewH - 40) {
      const cx = viewW / 2;
      const cy = viewH / 2;
      const angle = Math.atan2(sy - cy, sx - cx);
      const ax = cx + Math.cos(angle) * (Math.min(viewW, viewH) / 2 - 60);
      const ay = cy + Math.sin(angle) * (Math.min(viewW, viewH) / 2 - 60);
      context.save();
      context.translate(ax, ay);
      context.rotate(angle);
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.moveTo(18, 0);
      context.lineTo(-12, -12);
      context.lineTo(-12, 12);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      if (pickup.taken) continue;
      const bob = Math.sin(state.elapsed * 4 + pickup.x) * 3;
      if (pickup.kind === 'cash') {
        context.fillStyle = '#f1c40f';
        context.beginPath();
        context.arc(pickup.x, pickup.y + bob, 11, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#7d6608';
        context.font = font(14, '700');
        context.textAlign = 'center';
        context.fillText('$', pickup.x, pickup.y + bob + 5);
      } else {
        context.fillStyle = '#ffffff';
        context.fillRect(pickup.x - 10, pickup.y - 10 + bob, 20, 20);
        context.fillStyle = '#e74c3c';
        context.fillRect(pickup.x - 3, pickup.y - 8 + bob, 6, 16);
        context.fillRect(pickup.x - 8, pickup.y - 3 + bob, 16, 6);
      }
    }
  }

  function drawCar(car, elapsed) {
    const spec = CAR[car.kind];
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(-spec.length / 2 + 3, -spec.width / 2 + 4, spec.length, spec.width, 8);
    context.fill();
    // Body.
    context.fillStyle = car.mode === 'police' ? PALETTE.police : car.color;
    roundRect(-spec.length / 2, -spec.width / 2, spec.length, spec.width, 8);
    context.fill();
    // Windshield and rear window.
    context.fillStyle = 'rgba(180,220,240,0.85)';
    context.fillRect(spec.length / 2 - 14, -spec.width / 2 + 4, 8, spec.width - 8);
    context.fillRect(-spec.length / 2 + 6, -spec.width / 2 + 4, 7, spec.width - 8);
    // Wheels.
    context.fillStyle = '#111111';
    context.fillRect(-spec.length / 2 + 4, -spec.width / 2 - 3, 10, 4);
    context.fillRect(-spec.length / 2 + 4, spec.width / 2 - 1, 10, 4);
    context.fillRect(spec.length / 2 - 14, -spec.width / 2 - 3, 10, 4);
    context.fillRect(spec.length / 2 - 14, spec.width / 2 - 1, 10, 4);
    if (car.kind === 'taxi') {
      context.fillStyle = '#111111';
      context.fillRect(-4, -spec.width / 2 - 5, 12, 5);
      context.fillStyle = '#f1c40f';
      context.font = font(7, '700');
      context.textAlign = 'center';
      context.fillText('TAXI', 2, -spec.width / 2 - 7);
    }
    if (car.mode === 'police') {
      const flash = Math.floor(elapsed * 6) % 2 === 0;
      context.fillStyle = flash ? PALETTE.policeLight : PALETTE.policeLight2;
      context.fillRect(-4, -spec.width / 2 - 4, 10, 5);
      context.fillStyle = '#ffffff';
      context.font = font(8, '700');
      context.textAlign = 'center';
      context.fillText('PD', 0, 3);
    }
    if (car.mode === 'disabled') {
      context.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(-spec.length / 2, -spec.width / 2, spec.length, spec.width, 8);
      context.fill();
    }
    context.restore();
  }

  function drawPed(ped) {
    context.save();
    context.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      context.rotate(0.4);
      context.fillStyle = ped.color;
      context.beginPath();
      context.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    context.rotate(ped.angle);
    context.fillStyle = ped.guard ? '#2c3e50' : ped.color;
    context.beginPath();
    context.arc(0, 0, PED.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f5d0a9';
    context.beginPath();
    context.arc(4, 0, 5, 0, Math.PI * 2);
    context.fill();
    if (ped.guard) {
      context.strokeStyle = '#111111';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(6, 0);
      context.lineTo(20, 0);
      context.stroke();
    }
    context.restore();
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.inCar) return;
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.angle);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(2, 4, 14, 10, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerJacket;
    context.beginPath();
    context.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f5d0a9';
    context.beginPath();
    context.arc(3, 0, 6, 0, Math.PI * 2);
    context.fill();
    // Pistol.
    context.strokeStyle = '#222222';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(22, 0);
    context.stroke();
    context.restore();
  }

  function drawBullets(state) {
    context.strokeStyle = '#ffe9a8';
    context.lineWidth = 3;
    for (const b of state.bullets) {
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawMinimap(state) {
    const x0 = viewW - MINIMAP - 16;
    const y0 = 16;
    const scale = MINIMAP / size;
    context.save();
    context.fillStyle = 'rgba(20,16,12,0.78)';
    roundRect(x0 - 6, y0 - 6, MINIMAP + 12, MINIMAP + 12, 8);
    context.fill();
    context.beginPath();
    roundRect(x0, y0, MINIMAP, MINIMAP, 4);
    context.clip();
    context.fillStyle = '#c9b183';
    context.fillRect(x0, y0, MINIMAP, MINIMAP);
    context.fillStyle = '#3d3a38';
    for (const c of roadCenters) {
      context.fillRect(x0, y0 + c * scale - 1, MINIMAP, 2);
      context.fillRect(x0 + c * scale - 1, y0, 2, MINIMAP);
    }
    context.fillStyle = PALETTE.water;
    const h = state.city.harbour;
    context.fillRect(x0 + h.x * scale, y0 + h.y * scale, h.w * scale, h.h * scale);
    context.fillStyle = '#5d6d7e';
    for (const b of state.city.buildings) {
      context.fillRect(x0 + b.x * scale, y0 + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
    }
    const target = missionTarget(state);
    if (target) {
      context.fillStyle = PALETTE.marker;
      const tx = x0 + target.x * scale;
      const ty = y0 + target.y * scale;
      context.beginPath();
      context.arc(tx, ty, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#58d68d';
    const sh = state.city.landmarks.safehouse;
    context.beginPath();
    context.arc(x0 + sh.x * scale, y0 + sh.y * scale, 3, 0, Math.PI * 2);
    context.fill();
    for (const car of state.cars) {
      if (car.mode === 'police') {
        context.fillStyle = Math.floor(state.elapsed * 6) % 2 === 0 ? '#ff2d55' : '#2d9cdb';
        context.beginPath();
        context.arc(x0 + car.x * scale, y0 + car.y * scale, 3, 0, Math.PI * 2);
        context.fill();
      } else if (car.mode === 'player') {
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(x0 + car.x * scale, y0 + car.y * scale, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
    const player = state.player;
    if (!player.inCar) {
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(x0 + player.x * scale, y0 + player.y * scale, 3.5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(x0 + player.x * scale, y0 + player.y * scale);
      context.lineTo(
        x0 + (player.x + Math.cos(player.angle) * 160) * scale,
        y0 + (player.y + Math.sin(player.angle) * 160) * scale,
      );
      context.stroke();
    }
    context.restore();
    // Viewport rectangle.
    context.strokeStyle = 'rgba(255,255,255,0.65)';
    context.lineWidth = 1.5;
    context.strokeRect(
      x0 + (camera.x - viewW / 2) * scale,
      y0 + (camera.y - viewH / 2) * scale,
      viewW * scale,
      viewH * scale,
    );
  }

  function drawHud(state, ui) {
    const player = state.player;
    // Top-left: health and cash.
    context.fillStyle = PALETTE.hudPanel;
    roundRect(12, 12, 210, 64, 8);
    context.fill();
    text('RICO VEGA', 24, 34, 13, PALETTE.muted, 'left', '700');
    context.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(24, 42, 150, 12, 6);
    context.fill();
    context.fillStyle = player.health > 30 ? PALETTE.health : PALETTE.healthLow;
    roundRect(24, 42, 150 * Math.max(0, player.health / 100), 12, 6);
    context.fill();
    text(`$${state.cash.toLocaleString('en-US')}`, 24, 70, 16, '#7CFC98', 'left', '700');
    // Top-centre: wanted stars.
    const starY = 34;
    const starSize = 26;
    const totalW = 5 * starSize + 4 * 8;
    const startX = viewW / 2 - totalW / 2;
    for (let i = 0; i < 5; i += 1) {
      text(i < state.wanted ? '★' : '☆', startX + i * (starSize + 8) + starSize / 2, starY, starSize, i < state.wanted ? PALETTE.star : PALETTE.starEmpty, 'center', '700');
    }
    // Clock and district, under the minimap.
    const hours = Math.floor(state.clock / 60) % 24;
    const minutes = Math.floor(state.clock % 60);
    const clockText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    text(clockText, viewW - 24, MINIMAP + 52, 20, PALETTE.text, 'right', '700');
    text(districtAt(state.city, player.x, player.y).toUpperCase(), viewW - 24, MINIMAP + 74, 13, PALETTE.muted, 'right', '700');
    // Objective bar, bottom-centre.
    const objective = missionObjectiveText(state);
    context.font = font(16, '600');
    const ow = context.measureText(objective).width + 32;
    context.fillStyle = PALETTE.hudPanel;
    roundRect(viewW / 2 - ow / 2, viewH - 52, ow, 36, 8);
    context.fill();
    text(objective, viewW / 2, viewH - 28, 16, PALETTE.text, 'center', '600');
    // Speed and prompts, bottom-right.
    if (player.inCar) {
      const kmh = Math.round(Math.abs(player.inCar.speed) * 0.45);
      text(`${kmh} km/h`, viewW - 24, viewH - 64, 22, PALETTE.text, 'right', '700');
      text('E — get out · W/S drive · A/D steer', viewW - 24, viewH - 88, 13, PALETTE.muted, 'right');
    } else {
      let nearCar = null;
      let nearDist = PLAYER.enterRadius;
      for (const car of state.cars) {
        if (car.mode !== 'traffic' && car.mode !== 'parked') continue;
        const dist = Math.hypot(car.x - player.x, car.y - player.y);
        if (dist < nearDist) {
          nearCar = car;
          nearDist = dist;
        }
      }
      if (nearCar) {
        text(nearCar.owned ? 'E — take Rico’s car' : 'E — take the car', viewW - 24, viewH - 64, 16, PALETTE.hudAccent, 'right', '700');
      }
      text('WASD move · Shift run · mouse aim, click to shoot', viewW - 24, viewH - 88, 13, PALETTE.muted, 'right');
    }
    // Mute state.
    if (ui.muted) text('Muted (M)', 24, viewH - 24, 13, PALETTE.muted, 'left');
  }

  function drawBanner(ui) {
    if (!ui.banner) return;
    const alpha = Math.max(0, Math.min(1, ui.banner.timer / 0.4));
    const fade = ui.banner.timer < 0.6 ? ui.banner.timer / 0.6 : 1;
    context.globalAlpha = Math.min(alpha, fade);
    context.fillStyle = 'rgba(20,16,12,0.85)';
    const w = 520;
    roundRect(viewW / 2 - w / 2, 84, w, 84, 10);
    context.fill();
    context.strokeStyle = PALETTE.hudAccent;
    context.lineWidth = 2;
    roundRect(viewW / 2 - w / 2, 84, w, 84, 10);
    context.stroke();
    text(ui.banner.title, viewW / 2, 120, 26, PALETTE.hudAccent, 'center', '800');
    if (ui.banner.sub) text(ui.banner.sub, viewW / 2, 150, 16, PALETTE.text, 'center');
    context.globalAlpha = 1;
  }

  function drawOverlay(ui) {
    if (!ui.overlay) return;
    const isWasted = ui.overlay.kind === 'wasted';
    context.fillStyle = isWasted ? 'rgba(120,10,10,0.55)' : 'rgba(10,20,60,0.55)';
    context.fillRect(0, 0, viewW, viewH);
    text(isWasted ? 'WASTED' : 'BUSTED', viewW / 2, viewH / 2 - 10, 72, '#ffffff', 'center', '900');
    text(ui.overlay.text, viewW / 2, viewH / 2 + 40, 20, PALETTE.text, 'center');
    text('Press Enter to continue', viewW / 2, viewH / 2 + 80, 16, PALETTE.muted, 'center');
  }

  function drawTitle(state, ui) {
    context.fillStyle = 'rgba(20,12,6,0.62)';
    context.fillRect(0, 0, viewW, viewH);
    const cx = viewW / 2;
    text(GAME.title, cx, viewH * 0.3, 84, '#ffb400', 'center', '900');
    text('A SOLMAR STORY', cx, viewH * 0.3 + 44, 20, PALETTE.text, 'center', '700');
    const story = [
      'Rico Vega came back to Solmar with nothing but a jacket and a debt.',
      'Mara Sol, the fixer who runs the Coral District, has work for a driver',
      'who can keep his cool — if the Solmar PD lets him.',
    ];
    story.forEach((line, i) => text(line, cx, viewH * 0.44 + i * 26, 18, PALETTE.muted, 'center'));
    const controls = [
      'WASD / arrows — move or drive · Mouse — aim · Click — shoot',
      'E — steal / enter a car · Shift — run · P — pause · M — mute',
      'Steal cars, lose the cops, finish all five missions for Mara.',
    ];
    controls.forEach((line, i) => text(line, cx, viewH * 0.62 + i * 26, 16, PALETTE.text, 'center'));
    const prompt = ui.hasSave ? 'ENTER — new game · C — continue · Click — start' : 'ENTER or click to start';
    text(prompt, cx, viewH * 0.8, 20, PALETTE.hudAccent, 'center', '700');
    if (ui.best > 0) text(`Best cash: $${ui.best.toLocaleString('en-US')}`, cx, viewH * 0.8 + 34, 15, PALETTE.muted, 'center');
  }

  function drawPaused(state, ui) {
    context.fillStyle = 'rgba(10,8,6,0.6)';
    context.fillRect(0, 0, viewW, viewH);
    const w = 460;
    const h = 340;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    context.fillStyle = PALETTE.hudPanel;
    roundRect(x, y, w, h, 12);
    context.fill();
    text('PAUSED', viewW / 2, y + 56, 40, PALETTE.text, 'center', '800');
    const lines = [
      'P / Esc — resume',
      'S — save game',
      'R — restart current mission',
      'M — sound on/off',
      'Q — quit to title',
    ];
    lines.forEach((line, i) => text(line, viewW / 2, y + 116 + i * 34, 18, PALETTE.muted, 'center'));
    text(`Cash $${state.cash.toLocaleString('en-US')} · Missions ${state.stats.missionsDone}/5`, viewW / 2, y + h - 30, 15, PALETTE.hudAccent, 'center', '700');
    if (ui.saveFlash) text('Saved.', viewW / 2, y + h - 58, 15, '#7CFC98', 'center', '700');
  }

  /** Paint one frame: the world through the camera, then the HUD or a menu. */
  function draw(state, screen, ui) {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#14100c';
    context.fillRect(0, 0, viewW, viewH);
    updateCamera(state);
    context.save();
    context.translate(viewW / 2 - camera.x, viewH / 2 - camera.y);
    // Only what the camera sees: cull the ground and roads to the view.
    drawGround(state);
    drawRoads();
    drawBuildings(state);
    drawMarker(state);
    drawPickups(state);
    for (const car of state.cars) drawCar(car, state.elapsed);
    for (const ped of state.peds) drawPed(ped);
    drawPlayer(state);
    drawBullets(state);
    drawParticles(state);
    context.restore();
    // Warm daylight tint, stronger toward morning and evening.
    const hour = (state.clock / 60) % 24;
    const warmth = 0.04 + 0.08 * Math.min(1, Math.abs(hour - 13) / 6);
    context.fillStyle = `rgba(255,176,66,${warmth.toFixed(3)})`;
    context.fillRect(0, 0, viewW, viewH);
    drawMinimap(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawHud(state, ui);
    drawBanner(ui);
    if (screen === SCREEN_PAUSED) drawPaused(state, ui);
    drawOverlay(ui);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toWorld, camera: () => ({ x: camera.x, y: camera.y }) };
}
