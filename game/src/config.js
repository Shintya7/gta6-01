// Solmar Heat — every tuning number and colour in one place.
// The world is a fixed 2904x2904 grid city; the renderer scales the view to the window,
// so no rule below depends on the screen size.

export const STEP = 1 / 60;

export const WORLD = {
  size: 2904,
  pitch: 284, // road + block
  road: 64,
  block: 220,
  blocks: 10, // 10x10 blocks, 11 roads each way
  roadCenters: [32, 316, 600, 884, 1168, 1452, 1736, 2020, 2304, 2588, 2872],
};

export const PLAYER = {
  radius: 14,
  walkSpeed: 175,
  runSpeed: 265,
  health: 100,
  fireRate: 0.22,
  bulletSpeed: 760,
  bulletRange: 520,
  bulletDamage: 34,
  enterRadius: 62,
};

export const CAR = {
  // kind: length, width, top speed, acceleration, grip (steer), colour choices
  sedan: { length: 46, width: 22, topSpeed: 265, accel: 230, steer: 2.6, colours: ['#c0392b', '#2e6da4', '#7f8c8d', '#d4ac0d'] },
  taxi: { length: 46, width: 22, topSpeed: 255, accel: 225, steer: 2.6, colours: ['#f1c40f'] },
  van: { length: 54, width: 24, topSpeed: 210, accel: 180, steer: 2.1, colours: ['#ecf0f1', '#95a5a6', '#5d6d7e'] },
  sport: { length: 48, width: 22, topSpeed: 345, accel: 300, steer: 3.1, colours: ['#e74c3c', '#8e44ad', '#16a085', '#f39c12'] },
  police: { length: 48, width: 22, topSpeed: 330, accel: 290, steer: 3.0, colours: ['#1a1a2e'] },
};

export const PED = {
  radius: 11,
  walkSpeed: 55,
  runSpeed: 150,
  count: 36,
};

export const TRAFFIC = { count: 16, minSpeed: 85, maxSpeed: 135 };

export const POLICE = {
  maxCount: 3,
  chaseSpeed: 300,
  bustRadius: 30,
  bustTime: 0.8,
  ramDamage: 6,
  ramCooldown: 0.9,
  carHp: 3,
};

export const WANTED = {
  maxStars: 5,
  decaySeconds: 12,
  decayClearRadius: 460,
  stealStars: 1,
  killStars: 1,
};

export const MISSION_REWARDS = [300, 500, 600, 800, 2000];

export const PALETTE = {
  ground: '#d9c49a', // warm sand base under everything
  grass: '#7fae5a',
  parkDark: '#6b9a4a',
  road: '#3d3a38',
  roadEdge: '#2c2927',
  sidewalk: '#cbb89a',
  lane: '#e8d44d',
  water: '#3fa7c4',
  waterDeep: '#2b7d9e',
  buildingRoof: '#b08954',
  text: '#fff8ec',
  muted: '#d8cbb2',
  hudPanel: 'rgba(20, 16, 12, 0.72)',
  hudAccent: '#ffb400',
  health: '#58d68d',
  healthLow: '#e74c3c',
  star: '#ffd700',
  starEmpty: 'rgba(255,255,255,0.35)',
  marker: '#ffe14d',
  player: '#f5f6fa',
  playerJacket: '#e84118',
  police: '#1a1a2e',
  policeLight: '#ff2d55',
  policeLight2: '#2d9cdb',
};

export const DISTRICT_COLOURS = {
  downtown: ['#5d6d7e', '#2e4053', '#7f8c8d', '#4a6572', '#6c7a89'],
  barrio: ['#e67e22', '#d35400', '#c0392b', '#f39c12', '#16a085', '#8e44ad'],
  marina: ['#aed6f1', '#f9e79f', '#f5cba7', '#a9dfbf'],
  industrial: ['#7f8c8d', '#95a5a6', '#5d6d7e', '#b2babb'],
  park: ['#7fae5a'],
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'solmar-heat.save.v1';
export const BEST_KEY = 'solmar-heat.best.v1';

export const GAME = {
  title: 'SOLMAR HEAT',
  city: 'Solmar',
  hero: 'Rico Vega',
  fixer: 'Mara Sol',
  startCash: 120,
  startTimeMinutes: 8 * 60, // 08:00
  minutesPerSecond: 0.6, // in-game clock runs ~36x real time
  wastedFine: 150,
  bustedFine: 200,
};
