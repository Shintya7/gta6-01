// The story of Solmar Heat: five missions for Rico Vega, fixer Mara Sol's driver.
// Each mission is a list of steps. A step is a place to reach, a package to carry, a
// wanted level to lose, a timed run, or a grab under fire. The mission state lives on the
// game state; updateMission advances it and reports what changed.

import { MISSION_REWARDS } from './config.js';
import { addWanted, spawnGuard } from './entities.js';

const GRAB_CHANNEL_SECONDS = 1.5;

/** Build the mission list against this city's landmarks. */
export function buildMissions(city) {
  const L = city.landmarks;
  return [
    {
      id: 'wheels',
      title: 'Wheels for Rico',
      reward: MISSION_REWARDS[0],
      brief: "Mara needs wheels. Take a car — any car — and bring it to Coral Paint & Body.",
      steps: [
        { type: 'goto', x: L.paintShop.x, y: L.paintShop.y, radius: 46, requireCar: true, label: 'Coral Paint & Body', hint: 'Press E near a car to take it, then drive to the yellow marker.' },
      ],
    },
    {
      id: 'pickup',
      title: 'The Pickup',
      reward: MISSION_REWARDS[1],
      brief: 'A package is waiting at the Solmar Docks. Grab it and bring it back to Mara’s garage.',
      steps: [
        { type: 'goto', x: L.docks.x, y: L.docks.y, radius: 46, label: 'Solmar Docks', hint: 'Drive or walk to the docks marker.' },
        { type: 'deliver', x: L.safehouse.x, y: L.safehouse.y, radius: 46, label: "Mara's Garage", hint: 'Package collected. Bring it back to Mara’s garage.' },
      ],
    },
    {
      id: 'heat',
      title: 'Lose the Heat',
      reward: MISSION_REWARDS[2],
      brief: 'You got made — three stars. Lose the cops and the job is yours.',
      steps: [
        { type: 'lose', label: 'Lose the cops', hint: 'Stay out of sight: no crimes, keep police far away, and the stars fade.' },
      ],
    },
    {
      id: 'rush',
      title: 'Rush Hour',
      reward: MISSION_REWARDS[3],
      brief: 'A client needs a package at the docks in 90 seconds. Don’t be late.',
      steps: [
        { type: 'goto', x: L.safehouse.x, y: L.safehouse.y, radius: 46, label: "Mara's Garage", hint: 'Pick the package up at Mara’s garage.' },
        { type: 'timed', x: L.docks.x, y: L.docks.y, radius: 46, seconds: 90, label: 'Solmar Docks', hint: '90 seconds to the docks. Drive fast, stay on the roads.' },
      ],
    },
    {
      id: 'score',
      title: 'The Big Score',
      reward: MISSION_REWARDS[4],
      brief: 'The Solmar Trust vault. Grab the cash, deal with the guards, and get to the safehouse.',
      steps: [
        { type: 'goto', x: L.bank.x, y: L.bank.y, radius: 46, label: 'Solmar Trust Bank', hint: 'Get to the bank. The vault is inside the marker.' },
        { type: 'grab', x: L.bank.x, y: L.bank.y, radius: 46, label: 'Solmar Trust Bank', hint: 'Stay in the marker to crack the vault — the guards are coming.', guards: 2 },
        { type: 'deliver', x: L.safehouse.x, y: L.safehouse.y, radius: 46, label: "Mara's Garage", hint: 'Cash grabbed, three stars on you. Lose the cops or just get to the garage.' },
      ],
    },
  ];
}

export function currentMission(state) {
  if (!state.missions) return null;
  if (state.missionIndex >= state.missions.length) return null;
  return state.missions[state.missionIndex];
}

export function missionTarget(state) {
  const mission = currentMission(state);
  if (!mission || !state.mission) return null;
  const step = mission.steps[state.mission.step];
  if (!step || step.type === 'lose') return null;
  return { x: step.x, y: step.y, label: step.label };
}

export function missionObjectiveText(state) {
  const mission = currentMission(state);
  if (!mission) return 'Story complete — free roam. Collect stashes, steal cars, dodge the law.';
  if (!state.mission) return 'Free roam — explore Solmar, steal cars, dodge the law.';
  const step = mission.steps[state.mission.step];
  if (!step) return mission.title;
  if (step.type === 'timed') return `${mission.title}: ${step.label} — ${Math.ceil(state.mission.timer)}s left`;
  if (step.type === 'grab') {
    return state.mission.channel > 0
      ? `${mission.title}: cracking the vault… ${Math.ceil((GRAB_CHANNEL_SECONDS - state.mission.channel) * 10) / 10}s`
      : `${mission.title}: ${step.label}`;
  }
  if (step.type === 'lose') return `${mission.title}: lose the cops (${state.wanted}★)`;
  return `${mission.title}: ${step.label}`;
}

export function missionHint(state) {
  const mission = currentMission(state);
  if (!mission || !state.mission) return 'WASD move · E enter car · mouse aim, click to shoot · P pause';
  const step = mission.steps[state.mission.step];
  return step ? step.hint : '';
}

function startStep(state) {
  const mission = currentMission(state);
  if (!mission) return;
  const step = mission.steps[state.mission.step];
  if (!step) return;
  state.mission.timer = step.seconds || 0;
  state.mission.channel = 0;
  if (step.type === 'lose') {
    addWanted(state, 3 - state.wanted);
  }
  if (step.type === 'grab' && step.guards) {
    for (let i = 0; i < step.guards; i += 1) {
      spawnGuard(state, step.x + (i === 0 ? -70 : 70), step.y + 50);
    }
  }
}

export function startMission(state, index) {
  state.missionIndex = index;
  state.mission = { step: 0, timer: 0, channel: 0, active: true };
  startStep(state);
}

function advanceStep(state) {
  const mission = currentMission(state);
  state.mission.step += 1;
  state.mission.channel = 0;
  if (state.mission.step >= mission.steps.length) {
    // Mission complete: pay out, mark done, move to the next.
    state.cash += mission.reward;
    state.completed[state.missionIndex] = true;
    state.stats.missionsDone += 1;
    state.missionIndex += 1;
    if (state.missionIndex < state.missions.length) {
      state.mission = { step: 0, timer: 0, channel: 0, active: true };
      startStep(state);
    } else {
      state.mission = null;
    }
    return { completed: true, mission };
  }
  startStep(state);
  return { advanced: true };
}

/**
 * One fixed step of the mission logic. Returns { advanced, completed, failed, mission }.
 * `failed` means a timed step ran out: the step restarts, the player keeps their place.
 */
export function updateMission(state, dt) {
  const mission = currentMission(state);
  if (!mission || !state.mission) return {};
  const step = mission.steps[state.mission.step];
  if (!step) return {};
  const player = state.player;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;

  if (step.type === 'timed') {
    state.mission.timer -= dt;
    if (Math.hypot(step.x - px, step.y - py) < step.radius) return advanceStep(state);
    if (state.mission.timer <= 0) {
      state.mission.timer = step.seconds;
      return { failed: true, mission };
    }
    return {};
  }
  if (step.type === 'lose') {
    if (state.wanted === 0) return advanceStep(state);
    return {};
  }
  if (step.type === 'grab') {
    const dist = Math.hypot(step.x - px, step.y - py);
    if (dist < step.radius) {
      state.mission.channel += dt;
      if (state.mission.channel >= GRAB_CHANNEL_SECONDS) {
        addWanted(state, 3);
        return advanceStep(state);
      }
    } else {
      state.mission.channel = 0;
    }
    return {};
  }
  // goto / pickup / deliver: reach the marker.
  if (Math.hypot(step.x - px, step.y - py) < step.radius) {
    if (step.requireCar && !player.inCar) return { needCar: true };
    return advanceStep(state);
  }
  return {};
}
