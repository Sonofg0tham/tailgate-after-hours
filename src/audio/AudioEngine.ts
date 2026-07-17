import { AUDIO } from '../config/audio';
import { drone, noiseBurst, noiseLoop, tone } from './synth';
import { createTensionLayer, type AudioAlertLevel, type TensionLayer } from './TensionLayer';

/**
 * The shared audio module, following the pattern proven across the first
 * two games: cues keyed by name in a complete Record (Patch Tuesday's
 * shape), a `registerSample` file-swap escape hatch (drop an AudioBuffer
 * under a name and that cue is file-backed; otherwise it stays
 * synthesised), a gesture-gated idempotent `unlock()`, and a master gain
 * over category buses (Tailgate's mixer).
 *
 * NEW here, in neither predecessor (both were checked — CLAUDE.md's
 * "spatialised with PannerNode" described an intention, not shipped code):
 * real PannerNode positioning. A positional cue routes synth -> occlusion
 * lowpass -> panner -> bus, with the listener following the player. The
 * occlusion lowpass is Tailgate's proven trick, layered on top: when the
 * straight line from listener to source crosses a wall, the filter closes
 * and the guard sounds muffled but stays locatable.
 *
 * Everything here READS game state; nothing writes back — the sim never
 * knows audio exists (the determinism suite is the tripwire).
 */

export type CueName =
  | 'sting'
  | 'curiousTick'
  | 'detainLine'
  | 'radioSquelch'
  | 'boltLand'
  | 'reportPrint'
  | 'uiClick'
  | 'footstepCarpet'
  | 'footstepTile'
  | 'footstepConcrete'
  | 'guardFootstep'
  | 'dawnChirp';

export const CUE_NAMES: readonly CueName[] = [
  'sting',
  'curiousTick',
  'detainLine',
  'radioSquelch',
  'boltLand',
  'reportPrint',
  'uiClick',
  'footstepCarpet',
  'footstepTile',
  'footstepConcrete',
  'guardFootstep',
  'dawnChirp',
];

type BusName = 'sting' | 'footsteps' | 'guard' | 'radio' | 'ambience' | 'ui';

const CUE_BUS: Record<CueName, BusName> = {
  sting: 'sting',
  curiousTick: 'sting',
  detainLine: 'sting',
  radioSquelch: 'radio',
  boltLand: 'footsteps',
  reportPrint: 'ui',
  uiClick: 'ui',
  footstepCarpet: 'footsteps',
  footstepTile: 'footsteps',
  footstepConcrete: 'footsteps',
  guardFootstep: 'guard',
  dawnChirp: 'ambience',
};

type Synth = (ctx: AudioContext, out: AudioNode) => void;

/**
 * Every cue, synthesised. The record type makes the roster complete at
 * compile time — a new CueName without a synth will not build.
 */
const SYNTHS: Record<CueName, Synth> = {
  sting(ctx, out) {
    // The signature: a FALLING dissonant minor-second cluster with a sub
    // thump — nasty, and deliberately nothing like anyone else's rising
    // exclamation mark.
    tone(ctx, out, 'sawtooth', 622, 0.42, 0.006, 0.5, 311);
    tone(ctx, out, 'sawtooth', 659, 0.34, 0.006, 0.46, 330);
    tone(ctx, out, 'sine', 55, 0.5, 0.005, 0.3);
    noiseBurst(ctx, out, 0.09, 0.18, 'highpass', 2500);
  },

  curiousTick(ctx, out) {
    // A soft "hm?" — one quiet woody tick.
    tone(ctx, out, 'triangle', 920, 0.14, 0.004, 0.07, 700);
  },

  detainLine(ctx, out) {
    // The dead line: a flat telephone tone, held, then cut. Two barely
    // detuned sines beat slowly against each other so it feels wrong.
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.03);
    g.gain.setValueAtTime(0.32, t + 1.0);
    g.gain.linearRampToValueAtTime(0, t + 1.06);
    g.connect(out);
    for (const freq of [425, 426.5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 1.1);
    }
  },

  radioSquelch(ctx, out) {
    // Keyed static and a clipped acknowledge beep.
    noiseBurst(ctx, out, 0.11, 0.22, 'bandpass', 1600);
    tone(ctx, out, 'square', 950, 0.09, 0.005, 0.05, undefined, 0.1);
    noiseBurst(ctx, out, 0.05, 0.14, 'bandpass', 1800, 0.16);
  },

  boltLand(ctx, out) {
    // A small clatter: hard click, then a skitter.
    noiseBurst(ctx, out, 0.03, 0.32, 'highpass', 2400);
    noiseBurst(ctx, out, 0.1, 0.16, 'bandpass', 900, 0.045);
  },

  reportPrint(ctx, out) {
    // A dot-matrix line feed: six rapid alternating ticks.
    for (let i = 0; i < 6; i++) {
      tone(ctx, out, 'square', i % 2 === 0 ? 1400 : 1650, 0.05, 0.003, 0.03, undefined, i * 0.048);
    }
  },

  uiClick(ctx, out) {
    tone(ctx, out, 'triangle', 1200, 0.1, 0.003, 0.045);
  },

  footstepCarpet(ctx, out) {
    // A soft press into pile — almost a breath.
    noiseBurst(ctx, out, 0.07, 0.4, 'lowpass', 240);
  },

  footstepTile(ctx, out) {
    // A hard heel click with a tiny ring.
    noiseBurst(ctx, out, 0.03, 0.34, 'highpass', 1900);
    tone(ctx, out, 'sine', 1300, 0.05, 0.003, 0.03);
  },

  footstepConcrete(ctx, out) {
    // A dry mid knock.
    noiseBurst(ctx, out, 0.05, 0.42, 'bandpass', 700);
  },

  guardFootstep(ctx, out) {
    // Heavier issue boots, unhurried.
    noiseBurst(ctx, out, 0.06, 0.5, 'bandpass', 520);
    noiseBurst(ctx, out, 0.04, 0.2, 'lowpass', 180);
  },

  dawnChirp(ctx, out) {
    // One bird, far too cheerful. Two rising syllables.
    const base = 2500 + Math.random() * 800;
    tone(ctx, out, 'sine', base, 0.13, 0.008, 0.08, base * 1.3);
    tone(ctx, out, 'sine', base * 1.12, 0.1, 0.008, 0.07, base * 1.4, 0.14);
  },
};

export interface AudioEngineOptions {
  /** True when the straight line between source and listener crosses something sight-blocking — drives the occlusion lowpass. */
  isOccluded(sourceX: number, sourceZ: number, listenerX: number, listenerZ: number): boolean;
}

export interface AudioFrameState {
  listenerX: number;
  listenerZ: number;
  /** Listener facing on the ground plane (the camera's forward, projected). */
  forwardX: number;
  forwardZ: number;
  /** The player's current zone, for the per-zone ambience mix. */
  zone: string | null;
  /** Where the searching mutter should sit (the nearest SEARCHING guard), or null for silence. */
  mutterSource: { x: number; z: number } | null;
  /** Building-wide alert state, used only to shape the non-diegetic tension bed. */
  alertLevel: AudioAlertLevel;
  /** Dawn has arrived: the birds start, quiet and awful. */
  dawn: boolean;
}

interface SpatialVoice {
  panner: PannerNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  x: number;
  z: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<BusName, GainNode> | null = null;
  private userVolume = 1;
  private readonly samples = new Map<CueName, AudioBuffer>();

  private hvacBed: GainNode | null = null;
  private tension: TensionLayer | null = null;
  private emitters: SpatialVoice[] = [];
  private mutter: SpatialVoice | null = null;
  private nextChirpAtMs: number | null = null;

  constructor(private readonly opts: AudioEngineOptions) {}

  /**
   * Gesture-gated and idempotent: the context is not created until a real
   * user input calls this (autoplay policy), and calling it again only
   * resumes a suspended context. Everything else is a safe no-op before it.
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    if (typeof window === 'undefined') {
      return; // headless test environment — audio stays a no-op
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return;
    }
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.baseMasterGain();
    this.master.connect(this.ctx.destination);

    const makeBus = (name: BusName): GainNode => {
      const bus = this.ctx!.createGain();
      bus.gain.value = AUDIO.volumes[name];
      bus.connect(this.master!);
      return bus;
    };
    this.buses = {
      sting: makeBus('sting'),
      footsteps: makeBus('footsteps'),
      guard: makeBus('guard'),
      radio: makeBus('radio'),
      ambience: makeBus('ambience'),
      ui: makeBus('ui'),
    };

    this.buildAmbience();
    this.tension = createTensionLayer(this.ctx, this.buses.ambience);
    this.buildMutter();
  }

  /** File-swap escape hatch: a registered buffer plays instead of the synth, no other change. */
  registerSample(name: CueName, buffer: AudioBuffer): void {
    this.samples.set(name, buffer);
  }

  /** Fire a cue — positional when given a world point, straight onto its bus otherwise. Silent no-op before unlock. */
  play(name: CueName, opts: { at?: { x: number; z: number }; gain?: number } = {}): void {
    if (!this.ctx || !this.buses) {
      return;
    }
    const bus = this.buses[CUE_BUS[name]];
    let out: AudioNode = opts.at ? this.spatialEntry(opts.at.x, opts.at.z, bus) : bus;
    if (opts.gain !== undefined && opts.gain !== 1) {
      const g = this.ctx.createGain();
      g.gain.value = opts.gain;
      g.connect(out);
      out = g;
    }

    const sample = this.samples.get(name);
    if (sample) {
      const src = this.ctx.createBufferSource();
      src.buffer = sample;
      src.connect(out);
      src.start();
      return;
    }
    SYNTHS[name](this.ctx, out);
  }

  /** 0-1 user master volume (the Phase 6 setting), over the tuned base. Click-free. */
  setMasterVolume(volume: number): void {
    this.userVolume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.baseMasterGain(), this.ctx.currentTime, 0.02);
    }
  }

  get masterVolume(): number {
    return this.userVolume;
  }

  /** Releases continuous voices and the Web Audio graph on page teardown. */
  dispose(): void {
    this.tension?.dispose();
    this.tension = null;
    if (this.ctx) {
      void this.ctx.close();
    }
    this.ctx = null;
    this.master = null;
    this.buses = null;
    this.hvacBed = null;
    this.emitters = [];
    this.mutter = null;
    this.nextChirpAtMs = null;
  }

  /** Everything drops briefly (the detain dead-line moment), then recovers. */
  duck(amount: number, holdMs: number): void {
    if (!this.master || !this.ctx) {
      return;
    }
    const t = this.ctx.currentTime;
    const base = this.baseMasterGain();
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(base * amount, t, 0.02);
    this.master.gain.setTargetAtTime(base, t + holdMs / 1000, 0.18);
  }

  /** Per-render-frame state feed: listener pose, ambience mix, the mutter, birdsong. Reads state, never writes. */
  update(frame: AudioFrameState, nowMs: number): void {
    if (!this.ctx) {
      return;
    }

    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = frame.listenerX;
      listener.positionY.value = 1.4;
      listener.positionZ.value = frame.listenerZ;
      listener.forwardX.value = frame.forwardX;
      listener.forwardY.value = 0;
      listener.forwardZ.value = frame.forwardZ;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    }

    // Zone-shaped HVAC bed.
    if (this.hvacBed) {
      const zoneGain = AUDIO.ambience.zoneBedGain[frame.zone ?? 'corridor'] ?? 1;
      this.hvacBed.gain.setTargetAtTime(AUDIO.ambience.hvacBedGain * zoneGain, this.ctx.currentTime, 0.4);
    }
    this.tension?.setAlertLevel(frame.alertLevel);

    // Placed emitters: only their occlusion changes.
    for (const voice of this.emitters) {
      this.updateOcclusion(voice, frame.listenerX, frame.listenerZ);
    }

    // The searching mutter follows its guard, or fades out.
    if (this.mutter) {
      if (frame.mutterSource) {
        this.mutter.x = frame.mutterSource.x;
        this.mutter.z = frame.mutterSource.z;
        this.mutter.panner.positionX.value = frame.mutterSource.x;
        this.mutter.panner.positionZ.value = frame.mutterSource.z;
        this.mutter.gain.gain.setTargetAtTime(AUDIO.mutter.gain, this.ctx.currentTime, 0.15);
        this.updateOcclusion(this.mutter, frame.listenerX, frame.listenerZ);
      } else {
        this.mutter.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
      }
    }

    // Dawn: sparse chirps for as long as the sun is up and the report reads.
    if (frame.dawn) {
      if (this.nextChirpAtMs === null) {
        this.nextChirpAtMs = nowMs + 400;
      }
      if (nowMs >= this.nextChirpAtMs) {
        this.play('dawnChirp');
        this.nextChirpAtMs =
          nowMs + AUDIO.birdsong.chirpEveryMsMin + Math.random() * (AUDIO.birdsong.chirpEveryMsMax - AUDIO.birdsong.chirpEveryMsMin);
      }
    } else {
      this.nextChirpAtMs = null;
    }
  }

  private baseMasterGain(): number {
    return AUDIO.volumes.master * this.userVolume;
  }

  /** Build the positional chain for a one-shot: entry gain -> occlusion lowpass -> panner -> bus. */
  private spatialEntry(x: number, z: number, bus: GainNode): AudioNode {
    const voice = this.makeSpatialVoice(x, z, bus, 1);
    // One-shots stop on their own; the chain is garbage once sources end.
    return voice.gain;
  }

  private makeSpatialVoice(x: number, z: number, bus: GainNode, gain: number): SpatialVoice {
    const ctx = this.ctx!;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = AUDIO.spatial.refDistanceMetres;
    panner.maxDistance = AUDIO.spatial.maxDistanceMetres;
    panner.rolloffFactor = AUDIO.spatial.rolloff;
    panner.positionX.value = x;
    panner.positionY.value = 1.4;
    panner.positionZ.value = z;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = AUDIO.spatial.clearCutoffHz;

    const g = ctx.createGain();
    g.gain.value = gain;

    g.connect(filter).connect(panner).connect(bus);
    const voice: SpatialVoice = { panner, filter, gain: g, x, z };
    return voice;
  }

  private updateOcclusion(voice: SpatialVoice, listenerX: number, listenerZ: number): void {
    const occluded = this.opts.isOccluded(voice.x, voice.z, listenerX, listenerZ);
    const target = occluded ? AUDIO.spatial.occludedCutoffHz : AUDIO.spatial.clearCutoffHz;
    voice.filter.frequency.setTargetAtTime(target, this.ctx!.currentTime, AUDIO.spatial.occlusionSmoothing);
  }

  /** The night's standing sound: a global HVAC bed plus the placed hums. */
  private buildAmbience(): void {
    const ctx = this.ctx!;
    const bus = this.buses!.ambience;

    // Global HVAC: filtered noise floor plus a sub drone. Zone-shaped in update().
    this.hvacBed = ctx.createGain();
    this.hvacBed.gain.value = AUDIO.ambience.hvacBedGain;
    this.hvacBed.connect(bus);
    noiseLoop(ctx, this.hvacBed, 'lowpass', 210, 0.6);
    drone(ctx, this.hvacBed, 'sine', 53, 0.12);

    // The server fan wall: broadband whoosh plus an electrical hum.
    const fans = this.makeSpatialVoice(AUDIO.ambience.emitters.serverFans.x, AUDIO.ambience.emitters.serverFans.z, bus, AUDIO.ambience.emitters.serverFans.gain);
    noiseLoop(ctx, fans.gain, 'bandpass', 640, 0.5);
    drone(ctx, fans.gain, 'sawtooth', 120, 0.045);
    this.emitters.push(fans);

    // The kitchen fridge: a tired compressor.
    const fridge = this.makeSpatialVoice(AUDIO.ambience.emitters.kitchenFridge.x, AUDIO.ambience.emitters.kitchenFridge.z, bus, AUDIO.ambience.emitters.kitchenFridge.gain);
    drone(ctx, fridge.gain, 'triangle', 98, 0.22);
    drone(ctx, fridge.gain, 'sine', 49, 0.18);
    this.emitters.push(fridge);

    // The city through the east windows: a distant low wash.
    const city = this.makeSpatialVoice(AUDIO.ambience.emitters.distantCity.x, AUDIO.ambience.emitters.distantCity.z, bus, AUDIO.ambience.emitters.distantCity.gain);
    noiseLoop(ctx, city.gain, 'lowpass', 150, 0.7);
    this.emitters.push(city);
  }

  /** The searching mutter: a syllabic grumble, parked silent until a guard searches. */
  private buildMutter(): void {
    const ctx = this.ctx!;
    const voice = this.makeSpatialVoice(0, 0, this.buses!.guard, 0.0001);
    const { gain: loopGain } = noiseLoop(ctx, voice.gain, 'bandpass', 310, 0.9);
    // Syllable LFO on the loop's own gain.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = AUDIO.mutter.lfoHz;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(loopGain.gain);
    lfo.start();
    this.mutter = voice;
  }
}
