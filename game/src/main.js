// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between three screens —
// title, play and paused — with wasted/busted overlays on top of play. Progress saves to
// localStorage on every mission completion and from the pause menu.
//
// ?seed=N fixes the city's layout. ?shot=start|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady.

import { BEST_KEY, GAME, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_ENEMY_SHOT, EVENT_PICKUP, EVENT_POLICE_DISABLED,
  EVENT_SHOT, EVENT_STEAL, EVENT_WASTED, createEntities, nearestPoliceDistance,
  placePlayerInCar, teleportPlayer, tryEnterExitCar, updateEntities,
} from './entities.js';
import { buildMissions, startMission, updateMission } from './missions.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const renderer = createRenderer(canvas);

const ui = {
  best: 0, hasSave: false, muted: false,
  banner: null, overlay: null, saveFlash: false,
};

function createGameState(nextSeed) {
  const rng = createRandom(nextSeed);
  const city = createCity(rng);
  const state = {
    rng, city,
    missions: buildMissions(city),
    missionIndex: 0,
    mission: null,
    completed: [false, false, false, false, false],
  };
  createEntities(state);
  return state;
}

let state = createGameState(seed);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function updateBest() {
  if (state.cash > ui.best) {
    ui.best = state.cash;
    try {
      window.localStorage.setItem(BEST_KEY, String(ui.best));
    } catch {
      // Storage can be off: the best then lasts this visit only.
    }
  }
}

function saveGame() {
  try {
    const data = {
      v: 1,
      cash: state.cash,
      health: state.player.health,
      missionIndex: state.missionIndex,
      completed: state.completed,
      clock: state.clock,
      x: state.player.x,
      y: state.player.y,
      car: state.player.inCar
        ? { kind: state.player.inCar.kind, x: state.player.inCar.x, y: state.player.inCar.y, angle: state.player.inCar.angle }
        : null,
      pickups: state.pickups.map((p) => p.taken),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    ui.saveFlash = true;
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

function loadSave() {
  let data = null;
  try {
    data = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? 'null');
  } catch {
    data = null;
  }
  if (!data || data.v !== 1) return false;
  state.cash = data.cash;
  state.player.health = data.health;
  state.missionIndex = data.missionIndex;
  state.completed = data.completed;
  state.clock = data.clock;
  state.pickups.forEach((pickup, i) => {
    pickup.taken = Boolean(data.pickups && data.pickups[i]);
  });
  teleportPlayer(state, data.x, data.y);
  if (data.car) placePlayerInCar(state, data.car.kind, data.car.x, data.car.y, data.car.angle);
  if (state.missionIndex < state.missions.length) startMission(state, state.missionIndex);
  return true;
}

function stepGame(input, dt, mouseWorld) {
  const events = updateEntities(state, input, dt, mouseWorld);
  if (events & EVENT_SHOT) audio.shot();
  if (events & EVENT_ENEMY_SHOT) audio.enemyShot();
  if (events & EVENT_CRASH) audio.crash();
  if (events & EVENT_PICKUP) audio.pickup();
  if (events & EVENT_POLICE_DISABLED) audio.crash();
  if (events & EVENT_STEAL) audio.click();
  audio.engine(state.player.inCar ? Math.min(1, Math.abs(state.player.inCar.speed) / 345) : 0);
  audio.siren(state.wanted > 0 && nearestPoliceDistance(state) < 700);
  const mission = updateMission(state, dt);
  if (mission.completed) {
    ui.banner = { title: 'Mission complete', sub: `${mission.mission.title} — +$${mission.mission.reward}`, timer: 3 };
    audio.missionDone();
    updateBest();
    saveGame();
    announce(`Mission complete: ${mission.mission.title}.`);
  } else if (mission.failed) {
    ui.banner = { title: 'Too slow', sub: 'The step restarts — try again', timer: 2.5 };
  } else if (mission.needCar) {
    ui.banner = { title: 'Bring a car', sub: 'This step needs wheels', timer: 2 };
  }
  if (ui.banner) {
    ui.banner.timer -= dt;
    if (ui.banner.timer <= 0) ui.banner = null;
  }
  if (events & EVENT_BUSTED) {
    ui.overlay = { kind: 'busted', text: `The law caught up. You lost $${Math.min(state.cash, GAME.bustedFine)}.` };
    audio.busted();
    announce('Busted by the police.');
  } else if (events & EVENT_WASTED) {
    ui.overlay = { kind: 'wasted', text: `You lost $${Math.min(state.cash, GAME.wastedFine)} at the hospital.` };
    audio.busted();
    announce('Wasted.');
  }
}

function resolveOverlay() {
  const wasInCar = state.player.inCar;
  if (wasInCar) {
    wasInCar.mode = 'parked';
    wasInCar.speed = 0;
    state.player.inCar = null;
  }
  state.player.health = 100;
  state.wanted = 0;
  state.wantedTimer = 0;
  if (ui.overlay.kind === 'wasted') {
    state.cash = Math.max(0, state.cash - GAME.wastedFine);
    teleportPlayer(state, state.city.landmarks.hospital.x, state.city.landmarks.hospital.y);
  } else {
    state.cash = Math.max(0, state.cash - GAME.bustedFine);
    teleportPlayer(state, state.city.landmarks.policeStation.x, state.city.landmarks.policeStation.y);
  }
  ui.overlay = null;
  saveGame();
  announce('Back on the streets of Solmar.');
}

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const scene = stageShot(name, state, (dt, input) => {
    stepGame(input, dt, { x: state.player.x, y: state.player.y - 100 });
  }, ui);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let saveFlashTimer = 0;
  ui.best = readBest();
  ui.hasSave = hasSave();

  const idleInput = {
    move: () => ({ x: 0, y: 0 }),
    run: false,
    accelerate: false,
    brake: false,
    steer: () => 0,
    mouseDown: false,
    mouse: () => ({ x: 0, y: 0 }),
    takeActions: () => 0,
  };

  function startGame() {
    audio.unlock();
    state = createGameState(Math.floor(Math.random() * 4294967296));
    startMission(state, 0);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Mission one: Wheels for Rico.');
  }

  function continueGame() {
    audio.unlock();
    state = createGameState(seed);
    if (!loadSave()) {
      startGame();
      return;
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Continued your game.');
  }

  function quitToTitle() {
    screen = SCREEN_TITLE;
    ui.hasSave = hasSave();
    announce('Solmar Heat. Press Enter to start.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) ui.muted = audio.toggleMute();
    if (ui.overlay) {
      if (actions & ACTION_CONFIRM) resolveOverlay();
      return;
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (actions & ACTION_ENTER) {
        const events = tryEnterExitCar(state);
        if (events & EVENT_STEAL) audio.click();
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  // Pause-menu keys that the input module does not own: save, restart, quit, continue.
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (screen === SCREEN_PAUSED && event.code === 'KeyS') {
      saveGame();
      saveFlashTimer = 2;
      announce('Game saved.');
    } else if (screen === SCREEN_PAUSED && event.code === 'KeyR') {
      if (state.missionIndex < state.missions.length) startMission(state, state.missionIndex);
      screen = SCREEN_PLAY;
      announce('Mission restarted.');
    } else if (screen === SCREEN_PAUSED && event.code === 'KeyQ') {
      quitToTitle();
    } else if (screen === SCREEN_TITLE && event.code === 'KeyC' && ui.hasSave) {
      continueGame();
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (saveFlashTimer > 0) {
      saveFlashTimer -= frameDt;
      if (saveFlashTimer <= 0) ui.saveFlash = false;
    }
    handleActions();
    const mouseWorld = renderer.toWorld(input.mouse().x, input.mouse().y);
    if (screen === SCREEN_TITLE) {
      accumulator += frameDt;
      while (accumulator >= STEP) {
        stepGame(idleInput, STEP, { x: state.player.x, y: state.player.y - 100 });
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY && !ui.overlay) {
      accumulator += frameDt;
      while (accumulator >= STEP) {
        stepGame(input, STEP, mouseWorld);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, ui);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A small hook for the maker’s own play-tests: read the state, jump the story on.
  window.__game = {
    get state() {
      return state;
    },
    get screen() {
      return screen;
    },
    startMission(index) {
      startMission(state, index);
    },
    setWanted(stars) {
      state.wanted = stars;
    },
    teleport(x, y) {
      teleportPlayer(state, x, y);
    },
  };

  announce('Solmar Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
