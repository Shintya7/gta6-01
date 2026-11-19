// All sound is synthesised with WebAudio — no audio files, no network.
// Everything is guarded: no context until the first user gesture, and every call is safe
// when sound is off or the context never started.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, seconds, type, gainValue, slideTo) {
    if (!context || muted) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, context.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + seconds);
      gain.gain.setValueAtTime(gainValue, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + seconds);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noiseHit(seconds, gainValue, filterFreq) {
    if (!context || muted) return;
    try {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer(seconds);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = context.createGain();
      gain.gain.setValueAtTime(gainValue, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
    } catch {
      // As above.
    }
  }

  return {
    /** Call from the first user gesture (start button / key press). */
    unlock() {
      if (!ensure()) return;
      try {
        if (context.state === 'suspended') void context.resume();
      } catch {
        // Ignore.
      }
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    click() {
      blip(660, 0.07, 'square', 0.08);
    },
    shot() {
      noiseHit(0.14, 0.5, 2600);
      blip(180, 0.09, 'square', 0.18, 60);
    },
    enemyShot() {
      noiseHit(0.12, 0.3, 2000);
    },
    crash() {
      noiseHit(0.25, 0.45, 500);
    },
    pickup() {
      blip(880, 0.1, 'sine', 0.2);
      setTimeout(() => blip(1320, 0.14, 'sine', 0.2), 90);
    },
    missionDone() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => setTimeout(() => blip(freq, 0.22, 'triangle', 0.22), i * 110));
    },
    busted() {
      const notes = [392, 330, 262];
      notes.forEach((freq, i) => setTimeout(() => blip(freq, 0.3, 'triangle', 0.2), i * 160));
    },
    /** Continuous engine hum while driving; speed 0 silences it. */
    engine(speed01) {
      if (!context || muted) return;
      try {
        if (!engineOsc) {
          engineOsc = context.createOscillator();
          engineOsc.type = 'sawtooth';
          const filter = context.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 420;
          engineGain = context.createGain();
          engineGain.gain.value = 0;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, context.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(speed01 > 0.02 ? 0.045 + speed01 * 0.03 : 0, context.currentTime, 0.1);
      } catch {
        // Ignore.
      }
    },
    /** Two-tone police siren while any police car is near. */
    siren(on) {
      if (!context || muted) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      try {
        if (!sirenOsc) {
          sirenOsc = context.createOscillator();
          sirenOsc.type = 'triangle';
          sirenOsc.frequency.value = 720;
          sirenLfo = context.createOscillator();
          sirenLfo.type = 'square';
          sirenLfo.frequency.value = 0.55;
          const lfoGain = context.createGain();
          lfoGain.gain.value = 140;
          sirenLfo.connect(lfoGain);
          lfoGain.connect(sirenOsc.frequency);
          sirenGain = context.createGain();
          sirenGain.gain.value = 0;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
          sirenLfo.start();
        }
        sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, context.currentTime, 0.2);
      } catch {
        // Ignore.
      }
    },
  };
}
