// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps with a scripted input —
// drive east, run from the cops, stand at the docks — so the frame is what a short game
// really looks like, and the same seed always gives the same frame.

import { STEP } from './config.js';
import { addWanted, placePlayerInCar, spawnPoliceCar, teleportPlayer } from './entities.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;

/** A fake input that holds the given keys: accelerate, steer -1..1, or nothing. */
function scriptedInput(overrides) {
  return {
    move: () => ({ x: 0, y: 0 }),
    run: false,
    accelerate: Boolean(overrides.accelerate),
    brake: false,
    steer: () => overrides.steer || 0,
    mouseDown: false,
    mouse: () => ({ x: 0, y: 0 }),
    takeActions: () => 0,
  };
}

function idleInput() {
  return scriptedInput({});
}

function runSteps(step, count, input) {
  for (let i = 0; i < count; i += 1) step(SAMPLE, input);
}

/**
 * Set `state` to the named scene and return the screen to draw over it.
 * `step` is main's one-fixed-step function: step(dt, input). `ui` is main's shared
 * UI object, which the steps may write banners into.
 */
export function stageShot(name, state, step, ui) {
  void ui;
  if (name === 'drive') {
    placePlayerInCar(state, 'sport', 200, 1452, 0);
    runSteps(step, Math.floor(6 / SAMPLE), scriptedInput({ accelerate: true }));
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    placePlayerInCar(state, 'sport', 400, 1452, 0);
    addWanted(state, 3);
    const cop1 = spawnPoliceCar(state);
    cop1.x = 180;
    cop1.y = 1452;
    cop1.angle = 0;
    cop1.speed = 300;
    const cop2 = spawnPoliceCar(state);
    cop2.x = 120;
    cop2.y = 1490;
    cop2.angle = 0;
    cop2.speed = 290;
    runSteps(step, Math.floor(5 / SAMPLE), scriptedInput({ accelerate: true }));
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    startMission(state, 1);
    teleportPlayer(state, 2380, 2730);
    runSteps(step, Math.floor(3 / SAMPLE), idleInput());
    return { screen: SCREEN_PLAY };
  }
  // start (and anything else): a live city behind the title screen.
  runSteps(step, Math.floor(5 / SAMPLE), idleInput());
  return { screen: SCREEN_TITLE };
}
