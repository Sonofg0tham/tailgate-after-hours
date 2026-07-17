import { AUDIO } from '../config/audio';

export type AudioAlertLevel = 0 | 1 | 2;

export interface TensionLayer {
  /** Crossfades the pressure bed slowly enough to avoid announcing a state change with a volume step. */
  setAlertLevel(alertLevel: AudioAlertLevel): void;
  /** Stops both continuous voices and disconnects every node owned by the layer. */
  dispose(): void;
}

interface TensionVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

function createVoice(
  ctx: AudioContext,
  output: AudioNode,
  type: OscillatorType,
  frequencyHz: number,
  gainValue: number,
): TensionVoice {
  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequencyHz;
  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  oscillator.connect(gain).connect(output);
  oscillator.start();
  return { oscillator, gain };
}

/**
 * A restrained low minor-second drone. The supplied output is the ambience
 * bus, so its level remains under both the existing ambience mix and the
 * player's master-volume setting.
 */
export function createTensionLayer(ctx: AudioContext, ambienceOutput: AudioNode): TensionLayer {
  const config = AUDIO.ambience.tension;
  const layerGain = ctx.createGain();
  layerGain.gain.value = config.gainByAlertLevel[0];
  layerGain.connect(ambienceOutput);

  const voices = [
    createVoice(ctx, layerGain, 'sine', config.frequenciesHz[0], config.voiceGains[0]),
    createVoice(ctx, layerGain, 'triangle', config.frequenciesHz[1], config.voiceGains[1]),
  ];

  let currentAlertLevel: AudioAlertLevel = 0;
  let disposed = false;
  return {
    setAlertLevel(alertLevel: AudioAlertLevel): void {
      if (disposed || alertLevel === currentAlertLevel) return;
      currentAlertLevel = alertLevel;
      layerGain.gain.setTargetAtTime(
        config.gainByAlertLevel[alertLevel],
        ctx.currentTime,
        config.smoothingSeconds,
      );
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const voice of voices) {
        voice.oscillator.stop();
        voice.oscillator.disconnect();
        voice.gain.disconnect();
      }
      layerGain.disconnect();
    },
  };
}
