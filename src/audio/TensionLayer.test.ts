import { describe, expect, it } from 'vitest';
import { AUDIO } from '../config/audio';
import { createTensionLayer } from './TensionLayer';

interface TargetEvent {
  value: number;
  time: number;
  constant: number;
}

class FakeAudioParam {
  value = 0;
  readonly targets: TargetEvent[] = [];

  setTargetAtTime(value: number, time: number, constant: number): AudioParam {
    this.targets.push({ value, time, constant });
    return this as unknown as AudioParam;
  }
}

class FakeNode {
  readonly connections: FakeNode[] = [];
  disconnectCalls = 0;

  connect(destination: AudioNode): AudioNode {
    this.connections.push(destination as unknown as FakeNode);
    return destination;
  }

  disconnect(): void {
    this.disconnectCalls += 1;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeAudioParam();
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
  started = false;
  stopCalls = 0;

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.stopCalls += 1;
  }
}

class FakeContext {
  currentTime = 4.25;
  readonly gains: FakeGain[] = [];
  readonly oscillators: FakeOscillator[] = [];

  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createOscillator(): OscillatorNode {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }
}

describe('adaptive tension layer', () => {
  it('starts a quiet two-note drone on the supplied ambience output', () => {
    const context = new FakeContext();
    const ambienceOutput = new FakeNode();

    createTensionLayer(context as unknown as AudioContext, ambienceOutput as unknown as AudioNode);

    const layerGain = context.gains[0];
    expect(layerGain.gain.value).toBe(AUDIO.ambience.tension.gainByAlertLevel[0]);
    expect(layerGain.connections).toContain(ambienceOutput);
    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.every((oscillator) => oscillator.started)).toBe(true);
    expect(context.oscillators.map((oscillator) => oscillator.frequency.value)).toEqual(
      AUDIO.ambience.tension.frequenciesHz,
    );
  });

  it('smoothly targets the configured gain for each site alert level', () => {
    const context = new FakeContext();
    const layer = createTensionLayer(
      context as unknown as AudioContext,
      new FakeNode() as unknown as AudioNode,
    );
    const layerGain = context.gains[0].gain;

    layer.setAlertLevel(1);
    layer.setAlertLevel(2);
    layer.setAlertLevel(0);

    expect(layerGain.targets).toEqual(
      ([1, 2, 0] as const).map((alertLevel) => ({
        value: AUDIO.ambience.tension.gainByAlertLevel[alertLevel],
        time: context.currentTime,
        constant: AUDIO.ambience.tension.smoothingSeconds,
      })),
    );
  });

  it('stops and disconnects every owned voice exactly once', () => {
    const context = new FakeContext();
    const layer = createTensionLayer(
      context as unknown as AudioContext,
      new FakeNode() as unknown as AudioNode,
    );

    layer.dispose();
    layer.dispose();

    expect(context.oscillators.map((oscillator) => oscillator.stopCalls)).toEqual([1, 1]);
    expect(context.oscillators.map((oscillator) => oscillator.disconnectCalls)).toEqual([1, 1]);
    expect(context.gains.map((gain) => gain.disconnectCalls)).toEqual([1, 1, 1]);
  });
});
