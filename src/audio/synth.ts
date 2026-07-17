/**
 * Pure WebAudio synthesis primitives — no module state, no engine knowledge.
 * Ported from the proven shared pattern: Tailgate's src/audio/synth.ts split
 * (primitives separate from the mixer) with Patch Tuesday's compact
 * implementations (its src/audio/audio.ts lines 100-170). The envelope
 * idiom is theirs exactly: exponentialRampToValueAtTime can't reach 0, so
 * ramp to an epsilon and snap.
 */

/** An attack/decay gain envelope, connected by the caller. `startAt` lets a cue schedule staggered notes. */
export function envGain(ctx: AudioContext, peak: number, attack: number, decay: number, startAt?: number): GainNode {
  const g = ctx.createGain();
  const t = startAt ?? ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.gain.setValueAtTime(0, t + attack + decay + 0.01);
  return g;
}

/** One enveloped oscillator note, with an optional frequency glide and start delay. */
export function tone(
  ctx: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  freq: number,
  peak: number,
  attack: number,
  decay: number,
  glideTo?: number,
  delaySeconds = 0,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  const t = ctx.currentTime + delaySeconds;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), t + attack + decay);
  }
  const env = envGain(ctx, peak, attack, decay, t);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

/** A reusable white-noise buffer. */
export function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** An enveloped, filtered noise burst — clicks, thumps, static. Optional start delay for staggered cues. */
export function noiseBurst(
  ctx: AudioContext,
  out: AudioNode,
  seconds: number,
  peak: number,
  filterType: BiquadFilterType,
  cutoff: number,
  delaySeconds = 0,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds + 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = cutoff;
  const t = ctx.currentTime + delaySeconds;
  const env = envGain(ctx, peak, 0.004, seconds, t);
  src.connect(filter).connect(env).connect(out);
  src.start(t);
  src.stop(t + seconds + 0.1);
}

/** A looping filtered-noise source with its own gain — ambience beds, the mutter. Caller owns start/stop via the returned nodes. */
export function noiseLoop(
  ctx: AudioContext,
  out: AudioNode,
  filterType: BiquadFilterType,
  cutoff: number,
  gain: number,
): { gain: GainNode; filter: BiquadFilterNode } {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2.7); // odd length so the loop seam wanders
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(out);
  src.start();
  return { gain: g, filter };
}

/** A quiet continuous oscillator drone with its own gain — hums, fans. */
export function drone(ctx: AudioContext, out: AudioNode, type: OscillatorType, freq: number, gain: number): GainNode {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  osc.connect(g).connect(out);
  osc.start();
  return g;
}
