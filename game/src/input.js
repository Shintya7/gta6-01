// Keyboard and pointer input. Held keys give movement and driving; one-shot presses
// (confirm, pause, enter a car, mute) are queued as bit flags and taken once by the loop,
// so a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || RUN.has(event.code) || CONFIRM.has(event.code) || PAUSE.has(event.code)
      || ENTER.has(event.code) || MUTE.has(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(event.code)) actions |= ACTION_ENTER;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  function axis(negative, positive) {
    return (positive ? 1 : 0) - (negative ? 1 : 0);
  }

  return {
    /** Move axes, -1..1 each: x right, y down. */
    move() {
      return {
        x: axis(keys.has('KeyA') || keys.has('ArrowLeft'), keys.has('KeyD') || keys.has('ArrowRight')),
        y: axis(keys.has('KeyW') || keys.has('ArrowUp'), keys.has('KeyS') || keys.has('ArrowDown')),
      };
    },
    get run() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    get accelerate() {
      return keys.has('KeyW') || keys.has('ArrowUp');
    },
    get brake() {
      return keys.has('KeyS') || keys.has('ArrowDown');
    },
    /** -1 left, 1 right, 0 neither — used for steering while driving. */
    steer() {
      return axis(keys.has('KeyA') || keys.has('ArrowLeft'), keys.has('KeyD') || keys.has('ArrowRight'));
    },
    get mouseDown() {
      return mouseDown;
    },
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
