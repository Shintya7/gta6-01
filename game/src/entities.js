// The moving parts of Solmar: the player on foot and behind the wheel, traffic and
// parked cars, pedestrians, police cars, bullets and particles. No drawing and no browser
// in here — step() functions take the state and return what happened as bit flags, so the
// caller can react (sound, banners, saves) without the rules knowing about screens.

import { CAR, GAME, PED, PLAYER, POLICE, TRAFFIC, WANTED, WORLD } from './config.js';
import { nearestRoadPoint, randomRoadPoint, resolveCircle, solidAt } from './city.js';

export const EVENT_SHOT = 1;
export const EVENT_ENEMY_SHOT = 2;
export const EVENT_CRASH = 4;
export const EVENT_PICKUP = 8;
export const EVENT_BUSTED = 16;
export const EVENT_WASTED = 32;
export const EVENT_STEAL = 64;
export const EVENT_PED_DOWN = 128;
export const EVENT_POLICE_DISABLED = 256;

const { size, roadCenters } = WORLD;

let nextCarId = 1;

export function addWanted(state, stars) {
  state.wanted = Math.min(WANTED.maxStars, state.wanted + stars);
  state.wantedTimer = 0;
  state.lastCrimeAt = state.elapsed;
}

export function nearestPoliceDistance(state) {
  let best = Infinity;
  for (const car of state.cars) {
    if (car.mode !== 'police') continue;
    const dx = car.x - state.player.x;
    const dy = car.y - state.player.y;
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

function makeCar(kind, x, y, angle, mode, rng) {
  const spec = CAR[kind];
  return {
    id: nextCarId, kind, x, y, angle, speed: 0, mode,
    color: rng ? rng.pick(spec.colours) : spec.colours[0],
    hp: kind === 'police' ? POLICE.carHp : 1,
    stuckTimer: 0, ramCooldown: 0, bustTimer: 0, disabledTimer: 0,
    axis: 'h', roadIndex: 0, dir: 1, cruise: TRAFFIC.minSpeed,
    owned: false,
  };
}

export function createPlayer(x, y) {
  return { x, y, angle: -Math.PI / 2, health: PLAYER.health, inCar: null, fireCooldown: 0, moving: 0 };
}

export function createEntities(state) {
  const { city, rng } = state;
  state.player = createPlayer(city.landmarks.safehouse.x, city.landmarks.safehouse.y + 60);
  state.cars = [];
  state.peds = [];
  state.bullets = [];
  state.particles = [];
  state.pickups = [];
  state.wanted = 0;
  state.wantedTimer = 0;
  state.lastCrimeAt = -100;
  state.cash = GAME.startCash;
  state.clock = GAME.startTimeMinutes;
  state.elapsed = 0;
  state.stats = { carsStolen: 0, pedsDown: 0, shotsFired: 0, missionsDone: 0 };

  // The player's own car, parked outside Mara's garage: free to take, no stars.
  const owned = makeCar('sport', city.landmarks.safehouse.x, city.landmarks.safehouse.y + 110, Math.PI / 2, 'parked', rng);
  owned.color = '#e74c3c';
  owned.owned = true;
  state.cars.push(owned);

  // Parked cars along the roads.
  for (let i = 0; i < 8; i += 1) {
    const spot = randomRoadPoint(rng);
    const kind = rng.pick(['sedan', 'sedan', 'taxi', 'van', 'sport']);
    const car = makeCar(kind, spot.x, spot.y, spot.angle, 'parked', rng);
    // Nudge to the roadside so it does not block the lane.
    car.x += Math.cos(spot.angle + Math.PI / 2) * 20;
    car.y += Math.sin(spot.angle + Math.PI / 2) * 20;
    state.cars.push(car);
  }
  // Moving traffic.
  for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar(state);
  // Pedestrians on the sidewalks.
  for (let i = 0; i < PED.count; i += 1) spawnPed(state);
  // Cash stashes and health packs.
  for (const stash of city.stashes) {
    state.pickups.push({ x: stash.x, y: stash.y, kind: 'cash', value: 150, taken: false });
  }
  const healthSpots = [
    city.landmarks.hospital, city.landmarks.policeStation,
    city.landmarks.safehouse, city.landmarks.docks,
  ];
  for (const spot of healthSpots) {
    state.pickups.push({ x: spot.x + 40, y: spot.y + 40, kind: 'health', value: 50, taken: false });
  }
}

export function spawnTrafficCar(state) {
  const { rng } = state;
  const spot = randomRoadPoint(rng);
  const kind = rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sport']);
  const car = makeCar(kind, spot.x, spot.y, spot.angle, 'traffic', rng);
  car.axis = Math.abs(spot.angle) < 0.1 || Math.abs(spot.angle - Math.PI) < 0.1 ? 'h' : 'v';
  car.roadIndex = car.axis === 'h'
    ? roadCenters.indexOf(spot.y)
    : roadCenters.indexOf(spot.x);
  if (car.roadIndex < 0) car.roadIndex = 0;
  car.dir = car.axis === 'h' ? (spot.angle === 0 ? 1 : -1) : (spot.angle > 0 ? 1 : -1);
  car.cruise = rng.range(TRAFFIC.minSpeed, TRAFFIC.maxSpeed);
  car.speed = car.cruise;
  state.cars.push(car);
  return car;
}

export function spawnPed(state, x, y) {
  const { rng } = state;
  const spot = x === undefined ? randomRoadPoint(rng) : { x, y, angle: 0 };
  const ped = {
    x: spot.x, y: spot.y, angle: rng.range(0, Math.PI * 2),
    speed: rng.range(40, PED.walkSpeed), color: rng.pick(['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1', '#1abc9c']),
    state: 'walk', timer: rng.range(0, 2), fleeX: 0, fleeY: 0, downTimer: 0, hp: 1, guard: false, fireTimer: 0,
    axis: 'h', roadIndex: 0, dir: 1, offset: rng.chance(0.5) ? -26 : 26,
  };
  if (x === undefined) {
    ped.axis = Math.abs(spot.angle) < 0.1 || Math.abs(spot.angle - Math.PI) < 0.1 ? 'h' : 'v';
    ped.roadIndex = ped.axis === 'h' ? roadCenters.indexOf(spot.y) : roadCenters.indexOf(spot.x);
    if (ped.roadIndex < 0) ped.roadIndex = 0;
    ped.dir = 1;
  }
  state.peds.push(ped);
  return ped;
}

export function spawnGuard(state, x, y) {
  const ped = spawnPed(state, x, y);
  ped.guard = true;
  ped.hp = 3;
  ped.state = 'guard';
  ped.color = '#2c3e50';
  return ped;
}

/** Put the player behind the wheel of a fresh car of `kind` at (x, y). Used by screenshots. */
export function placePlayerInCar(state, kind, x, y, angle) {
  const car = makeCar(kind, x, y, angle, 'player', state.rng);
  state.cars.push(car);
  state.player.inCar = car;
  state.player.x = x;
  state.player.y = y;
  return car;
}

/** Move the player (on foot) to a point. Used by screenshots. */
export function teleportPlayer(state, x, y) {
  state.player.inCar = null;
  state.player.x = x;
  state.player.y = y;
}

export function spawnPoliceCar(state) {
  const { rng, player } = state;
  const angle = rng.range(0, Math.PI * 2);
  const px = player.x + Math.cos(angle) * 750;
  const py = player.y + Math.sin(angle) * 750;
  const spot = nearestRoadPoint(
    Math.max(80, Math.min(size - 80, px)),
    Math.max(80, Math.min(size - 80, py)),
  );
  const car = makeCar('police', spot.x, spot.y, Math.atan2(player.y - spot.y, player.x - spot.x), 'police', rng);
  car.speed = POLICE.chaseSpeed * 0.7;
  state.cars.push(car);
  return car;
}

function fireBullet(state, x, y, angle, from, damage) {
  state.bullets.push({
    x, y,
    vx: Math.cos(angle) * PLAYER.bulletSpeed,
    vy: Math.sin(angle) * PLAYER.bulletSpeed,
    life: PLAYER.bulletRange / PLAYER.bulletSpeed,
    from, damage,
  });
}

function addParticles(state, x, y, count, color, speed, life) {
  for (let i = 0; i < count; i += 1) {
    if (state.particles.length > 220) return;
    const a = state.rng.next() * Math.PI * 2;
    const s = state.rng.next() * speed;
    state.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.5 + state.rng.next() * 0.5), maxLife: life, color, size: 2 + state.rng.next() * 3,
    });
  }
}

function collideCarWithBuildings(state, car) {
  const spec = CAR[car.kind];
  const half = spec.length / 4;
  const cx = Math.cos(car.angle);
  const sy = Math.sin(car.angle);
  const front = { x: car.x + cx * half, y: car.y + sy * half };
  const back = { x: car.x - cx * half, y: car.y - sy * half };
  resolveCircle(state.city, front, spec.width / 2 + 1);
  resolveCircle(state.city, back, spec.width / 2 + 1);
  const nx = (front.x + back.x) / 2;
  const ny = (front.y + back.y) / 2;
  const moved = Math.hypot(nx - car.x, ny - car.y);
  car.x = nx;
  car.y = ny;
  car.angle = Math.atan2(front.y - back.y, front.x - back.x);
  return moved;
}

function separateCars(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.mode === 'disabled' || b.mode === 'disabled') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const min = 44;
      if (dist > 0.01 && dist < min) {
        const push = (min - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        if (a.mode === 'player' || b.mode === 'player') {
          // The player's car shoves the other car aside instead of stalling behind it:
          // push the other car the full overlap, keep the player's speed.
          const other = a.mode === 'player' ? b : a;
          const playerCar = a.mode === 'player' ? a : b;
          other.x += nx * push * 2 * (other === b ? 1 : -1);
          other.y += ny * push * 2 * (other === b ? 1 : -1);
          other.speed *= 0.9;
          playerCar.speed *= 0.98;
        } else {
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          a.speed *= 0.7;
          b.speed *= 0.7;
        }
      }
    }
  }
}

function updatePlayerOnFoot(state, input, dt, mouseWorld) {
  const player = state.player;
  const move = input.move();
  const len = Math.hypot(move.x, move.y) || 1;
  const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const vx = (move.x / len) * speed * (move.x || move.y ? 1 : 0);
  const vy = (move.y / len) * speed * (move.x || move.y ? 1 : 0);
  player.x += vx * dt;
  player.y += vy * dt;
  player.moving = move.x || move.y ? 1 : 0;
  player.angle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
  resolveCircle(state.city, player, PLAYER.radius);
  // Cars are solid to a pedestrian.
  for (const car of state.cars) {
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.01 && dist < PLAYER.radius + 24) {
      const push = PLAYER.radius + 24 - dist;
      player.x += (dx / dist) * push;
      player.y += (dy / dist) * push;
    }
  }
  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  let events = 0;
  if (input.mouseDown && player.fireCooldown <= 0) {
    player.fireCooldown = PLAYER.fireRate;
    const mx = player.x + Math.cos(player.angle) * 20;
    const my = player.y + Math.sin(player.angle) * 20;
    fireBullet(state, mx, my, player.angle + state.rng.range(-0.03, 0.03), 'player', PLAYER.bulletDamage);
    addParticles(state, mx, my, 3, '#ffd76a', 120, 0.15);
    state.stats.shotsFired += 1;
    events |= EVENT_SHOT;
    // A gunshot nearby makes pedestrians run.
    for (const ped of state.peds) {
      if (!ped.guard && Math.hypot(ped.x - player.x, ped.y - player.y) < 260) {
        ped.state = 'flee';
        ped.timer = 2;
        ped.fleeX = player.x;
        ped.fleeY = player.y;
      }
    }
  }
  return events;
}

function updatePlayerDriving(state, input, dt) {
  const car = state.player.inCar;
  const spec = CAR[car.kind];
  let events = 0;
  if (input.accelerate) car.speed += spec.accel * dt;
  if (input.brake) {
    car.speed -= (car.speed > 10 ? 420 : 200) * dt;
    if (car.speed < -70) car.speed = -70;
  }
  if (!input.accelerate && !input.brake) {
    car.speed -= car.speed * 0.5 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  if (car.speed > spec.topSpeed) car.speed = spec.topSpeed;
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 120 + 0.25);
  car.angle += input.steer() * spec.steer * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const moved = collideCarWithBuildings(state, car);
  if (moved > 0.5 && Math.abs(car.speed) > 120) {
    car.speed *= 0.35;
    events |= EVENT_CRASH;
    addParticles(state, car.x, car.y, 6, '#bbbbbb', 140, 0.4);
  } else if (moved > 0.5) {
    car.speed *= 0.7;
  }
  // Running over pedestrians.
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (Math.abs(car.speed) > 70 && Math.hypot(ped.x - car.x, ped.y - car.y) < 26) {
      ped.state = 'down';
      ped.downTimer = 4;
      addWanted(state, WANTED.killStars);
      addParticles(state, ped.x, ped.y, 8, '#c0392b', 100, 0.5);
      state.stats.pedsDown += 1;
      events |= EVENT_PED_DOWN;
    }
  }
  return events;
}

function updateTrafficCar(state, car, dt) {
  const { rng, player } = state;
  const centre = roadCenters[car.roadIndex];
  // Slow down for the player's car ahead on the same lane, and stop for Rico on foot.
  let target = car.cruise;
  if (player.inCar) {
    const pc = player.inCar;
    const dx = pc.x - car.x;
    const dy = pc.y - car.y;
    if (car.axis === 'h' && Math.abs(dy) < 30 && Math.sign(dx) === car.dir && Math.abs(dx) < 90) target = 0;
    if (car.axis === 'v' && Math.abs(dx) < 30 && Math.sign(dy) === car.dir && Math.abs(dy) < 90) target = 0;
  } else {
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    if (car.axis === 'h' && Math.abs(dy) < 30 && Math.sign(dx) === car.dir && Math.abs(dx) < 60) target = 0;
    if (car.axis === 'v' && Math.abs(dx) < 30 && Math.sign(dy) === car.dir && Math.abs(dy) < 60) target = 0;
  }
  car.speed += (target - car.speed) * Math.min(1, dt * 2);
  if (car.axis === 'h') {
    car.y = centre;
    car.x += car.dir * car.speed * dt;
    car.angle = car.dir > 0 ? 0 : Math.PI;
    // At an intersection, sometimes turn onto the crossing road.
    for (const c of roadCenters) {
      if (Math.abs(car.x - c) < car.speed * dt + 1 && rng.chance(0.22)) {
        car.axis = 'v';
        car.roadIndex = roadCenters.indexOf(c);
        car.dir = rng.chance(0.5) ? 1 : -1;
        car.y = c;
        break;
      }
    }
    if (car.x < -80) car.x = size + 80;
    if (car.x > size + 80) car.x = -80;
  } else {
    car.x = centre;
    car.y += car.dir * car.speed * dt;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    for (const c of roadCenters) {
      if (Math.abs(car.y - c) < car.speed * dt + 1 && rng.chance(0.22)) {
        car.axis = 'h';
        car.roadIndex = roadCenters.indexOf(c);
        car.dir = rng.chance(0.5) ? 1 : -1;
        car.x = c;
        break;
      }
    }
    if (car.y < -80) car.y = size + 80;
    if (car.y > size + 80) car.y = -80;
  }
}

function updatePoliceCar(state, car, dt) {
  const { player } = state;
  const targetX = player.inCar ? player.inCar.x : player.x;
  const targetY = player.inCar ? player.inCar.y : player.y;
  const dx = targetX - car.x;
  const dy = targetY - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  const targetSpeed = !player.inCar && dist < 110
    ? (dist < 26 ? 0 : 60) // Pull up beside a pedestrian and stop, so the bust can land.
    : POLICE.chaseSpeed + state.wanted * 8;
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const moved = collideCarWithBuildings(state, car);
  if (moved > 0.5) car.speed *= 0.6;
  if (Math.abs(car.speed) < 15) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 2.5) {
      const spot = nearestRoadPoint(
        Math.max(80, Math.min(size - 80, targetX + state.rng.range(-600, 600))),
        Math.max(80, Math.min(size - 80, targetY + state.rng.range(-600, 600))),
      );
      car.x = spot.x;
      car.y = spot.y;
      car.stuckTimer = 0;
    }
  } else {
    car.stuckTimer = 0;
  }
  if (car.ramCooldown > 0) car.ramCooldown -= dt;
  let events = 0;
  if (player.inCar) {
    const pc = player.inCar;
    if (Math.hypot(pc.x - car.x, pc.y - car.y) < 46 && car.ramCooldown <= 0) {
      car.ramCooldown = POLICE.ramCooldown;
      player.health -= POLICE.ramDamage;
      pc.speed *= 0.75;
      events |= EVENT_CRASH;
      addParticles(state, car.x, car.y, 5, '#bbbbbb', 120, 0.35);
    }
  } else if (dist < POLICE.bustRadius) {
    car.bustTimer += dt;
    if (car.bustTimer >= POLICE.bustTime) events |= EVENT_BUSTED;
  } else {
    car.bustTimer = 0;
  }
  return events;
}

function updatePed(state, ped, dt) {
  const { player, rng } = state;
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    return;
  }
  if (ped.guard) {
    // Bank guards hold their ground and shoot at the player.
    ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
    ped.fireTimer -= dt;
    const dist = Math.hypot(player.x - ped.x, player.y - ped.y);
    if (dist < 420 && ped.fireTimer <= 0) {
      ped.fireTimer = 1.3;
      fireBullet(state, ped.x, ped.y, ped.angle + state.rng.range(-0.11, 0.11), 'guard', 8);
      return;
    }
    return;
  }
  if (ped.state === 'flee') {
    ped.timer -= dt;
    const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
    ped.angle = away;
    ped.x += Math.cos(away) * PED.runSpeed * dt;
    ped.y += Math.sin(away) * PED.runSpeed * dt;
    resolveCircle(state.city, ped, PED.radius);
    if (ped.timer <= 0) ped.state = 'walk';
    return;
  }
  // Walk the sidewalk: along a road, offset to one side.
  const centre = roadCenters[ped.roadIndex];
  if (ped.axis === 'h') {
    ped.y = centre + ped.offset;
    ped.x += ped.dir * ped.speed * dt;
    ped.angle = ped.dir > 0 ? 0 : Math.PI;
    for (const c of roadCenters) {
      if (Math.abs(ped.x - c) < ped.speed * dt + 1 && rng.chance(0.18)) {
        ped.axis = 'v';
        ped.roadIndex = roadCenters.indexOf(c);
        ped.dir = rng.chance(0.5) ? 1 : -1;
        ped.offset = rng.chance(0.5) ? -26 : 26;
        ped.y = c + ped.offset;
        break;
      }
    }
    if (ped.x < 20) { ped.x = 20; ped.dir = 1; }
    if (ped.x > size - 20) { ped.x = size - 20; ped.dir = -1; }
  } else {
    ped.x = centre + ped.offset;
    ped.y += ped.dir * ped.speed * dt;
    ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    for (const c of roadCenters) {
      if (Math.abs(ped.y - c) < ped.speed * dt + 1 && rng.chance(0.18)) {
        ped.axis = 'h';
        ped.roadIndex = roadCenters.indexOf(c);
        ped.dir = rng.chance(0.5) ? 1 : -1;
        ped.offset = rng.chance(0.5) ? -26 : 26;
        ped.x = c + ped.offset;
        break;
      }
    }
    if (ped.y < 20) { ped.y = 20; ped.dir = 1; }
    if (ped.y > size - 20) { ped.y = size - 20; ped.dir = -1; }
  }
  // A fast car bearing down makes a pedestrian run.
  if (player.inCar) {
    const car = player.inCar;
    if (Math.abs(car.speed) > 120 && Math.hypot(ped.x - car.x, ped.y - car.y) < 130) {
      ped.state = 'flee';
      ped.timer = 1.6;
      ped.fleeX = car.x;
      ped.fleeY = car.y;
    }
  }
}

function updateBullets(state, dt) {
  let events = 0;
  const { player } = state;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && solidAt(state.city, b.x, b.y, 1)) {
      addParticles(state, b.x, b.y, 4, '#ffd76a', 90, 0.2);
      dead = true;
    }
    if (!dead && b.from === 'player') {
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < PED.radius + 4) {
          ped.hp -= 1;
          dead = true;
          if (ped.hp <= 0) {
            ped.state = 'down';
            ped.downTimer = 4;
            if (!ped.guard) {
              addWanted(state, WANTED.killStars);
              state.stats.pedsDown += 1;
              events |= EVENT_PED_DOWN;
            }
            addParticles(state, ped.x, ped.y, 8, '#c0392b', 100, 0.5);
          }
          break;
        }
      }
    }
    if (!dead && b.from === 'player') {
      for (const car of state.cars) {
        if (car.mode !== 'police') continue;
        if (Math.hypot(car.x - b.x, car.y - b.y) < 26) {
          car.hp -= 1;
          dead = true;
          addWanted(state, 1);
          addParticles(state, b.x, b.y, 6, '#ff9f43', 120, 0.3);
          if (car.hp <= 0) {
            car.mode = 'disabled';
            car.disabledTimer = 6;
            car.speed = 0;
            events |= EVENT_POLICE_DISABLED;
            addParticles(state, car.x, car.y, 14, '#555555', 90, 0.8);
          }
          break;
        }
      }
    }
    if (!dead && b.from === 'guard') {
      const target = player.inCar ? player.inCar : player;
      if (Math.hypot(target.x - b.x, target.y - b.y) < 20) {
        player.health -= player.inCar ? 4 : b.damage;
        dead = true;
        addParticles(state, b.x, b.y, 4, '#e74c3c', 90, 0.25);
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
  return events;
}

function updatePickups(state) {
  let events = 0;
  const { player } = state;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  for (const pickup of state.pickups) {
    if (pickup.taken) continue;
    if (Math.hypot(pickup.x - px, pickup.y - py) < 30) {
      pickup.taken = true;
      if (pickup.kind === 'cash') state.cash += pickup.value;
      else player.health = Math.min(PLAYER.health, player.health + pickup.value);
      addParticles(state, pickup.x, pickup.y, 10, '#f1c40f', 110, 0.5);
      events |= EVENT_PICKUP;
    }
  }
  return events;
}

function updateWanted(state, dt) {
  if (state.wanted <= 0) return;
  const nearest = nearestPoliceDistance(state);
  if (state.elapsed - state.lastCrimeAt > 2 && nearest > WANTED.decayClearRadius) {
    state.wantedTimer += dt;
    if (state.wantedTimer >= WANTED.decaySeconds) {
      state.wanted -= 1;
      state.wantedTimer = 0;
    }
  } else {
    state.wantedTimer = 0;
  }
  // Keep the right number of police cars on the road.
  const want = Math.min(state.wanted, POLICE.maxCount);
  const cops = state.cars.filter((car) => car.mode === 'police');
  if (cops.length > want) {
    // Extra units stand down, farthest first.
    cops.sort((a, b) => {
      const da = Math.hypot(a.x - state.player.x, a.y - state.player.y);
      const db = Math.hypot(b.x - state.player.x, b.y - state.player.y);
      return db - da;
    });
    for (let i = want; i < cops.length; i += 1) {
      state.cars.splice(state.cars.indexOf(cops[i]), 1);
    }
  } else if (cops.length < want) {
    spawnPoliceCar(state);
  }
}

function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2 * dt;
    p.vy *= 1 - 2 * dt;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

/**
 * Try to enter or leave a car. Returns EVENT_STEAL when a car is taken by force.
 * `nearbyPolice` is the distance to the closest police car, for witnessed thefts.
 */
export function tryEnterExitCar(state) {
  const { player } = state;
  if (player.inCar) {
    const car = player.inCar;
    car.mode = 'parked';
    car.speed = 0;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    resolveCircle(state.city, player, PLAYER.radius);
    player.inCar = null;
    return 0;
  }
  let best = null;
  let bestDist = PLAYER.enterRadius;
  for (const car of state.cars) {
    if (car.mode !== 'traffic' && car.mode !== 'parked') continue;
    const dist = Math.hypot(car.x - player.x, car.y - player.y);
    if (dist < bestDist) {
      best = car;
      bestDist = dist;
    }
  }
  if (!best) return 0;
  let events = 0;
  if (best.mode === 'traffic') {
    // The driver bails and runs.
    const driver = spawnPed(state, best.x, best.y);
    driver.state = 'flee';
    driver.timer = 3;
    driver.fleeX = player.x;
    driver.fleeY = player.y;
    addWanted(state, WANTED.stealStars);
    state.stats.carsStolen += 1;
    events |= EVENT_STEAL;
  } else if (!best.owned && nearestPoliceDistance(state) < 500) {
    addWanted(state, WANTED.stealStars);
    state.stats.carsStolen += 1;
    events |= EVENT_STEAL;
  }
  best.mode = 'player';
  best.speed = 0;
  player.inCar = best;
  player.x = best.x;
  player.y = best.y;
  return events;
}

/** One fixed step of the whole simulation. Returns EVENT_* flags. */
export function updateEntities(state, input, dt, mouseWorld) {
  let events = 0;
  const { player } = state;
  state.elapsed += dt;
  state.clock += (dt * 0.6) % (24 * 60);
  if (state.clock >= 24 * 60) state.clock -= 24 * 60;

  if (player.inCar) events |= updatePlayerDriving(state, input, dt);
  else events |= updatePlayerOnFoot(state, input, dt, mouseWorld);

  for (const car of state.cars) {
    if (car.mode === 'traffic') updateTrafficCar(state, car, dt);
    else if (car.mode === 'police') events |= updatePoliceCar(state, car, dt);
    else if (car.mode === 'disabled') {
      car.disabledTimer -= dt;
      if (state.rng.chance(0.3)) {
        addParticles(state, car.x, car.y - 6, 1, '#555555', 30, 0.8);
      }
    }
  }
  // Remove disabled police cars once their timer runs out.
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    if (state.cars[i].mode === 'disabled' && state.cars[i].disabledTimer <= 0) state.cars.splice(i, 1);
  }
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    const ped = state.peds[i];
    updatePed(state, ped, dt);
    if (ped.state === 'down' && ped.downTimer <= 0) state.peds.splice(i, 1);
  }
  // Keep the streets populated.
  if (state.peds.length < PED.count && state.rng.chance(0.02)) spawnPed(state);
  if (state.cars.filter((c) => c.mode === 'traffic').length < TRAFFIC.count && state.rng.chance(0.01)) {
    spawnTrafficCar(state);
  }
  separateCars(state);
  events |= updateBullets(state, dt);
  events |= updatePickups(state);
  updateWanted(state, dt);
  updateParticles(state, dt);

  if (player.health <= 0) events |= EVENT_WASTED;
  return events;
}
