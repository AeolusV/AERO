export type InteractionSound = "press" | "tick" | "confirm" | "complete" | "destructive";

type SoundProfile = {
  startFrequency: number;
  endFrequency: number;
  duration: number;
  toneGain: number;
  noiseGain: number;
};

const profiles: Record<InteractionSound, SoundProfile> = {
  press: {
    startFrequency: 620,
    endFrequency: 330,
    duration: 0.038,
    toneGain: 0.018,
    noiseGain: 0.01,
  },
  tick: {
    startFrequency: 840,
    endFrequency: 610,
    duration: 0.024,
    toneGain: 0.009,
    noiseGain: 0.003,
  },
  confirm: {
    startFrequency: 760,
    endFrequency: 430,
    duration: 0.052,
    toneGain: 0.021,
    noiseGain: 0.008,
  },
  complete: {
    startFrequency: 520,
    endFrequency: 760,
    duration: 0.086,
    toneGain: 0.015,
    noiseGain: 0.001,
  },
  destructive: {
    startFrequency: 360,
    endFrequency: 185,
    duration: 0.046,
    toneGain: 0.016,
    noiseGain: 0.011,
  },
};

type LegacyWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastTickAt = 0;

function getAudioContext() {
  if (context?.state === "closed") {
    context = null;
    noiseBuffer = null;
  }
  if (context) return context;

  const AudioContextClass = window.AudioContext ?? (window as LegacyWindow).webkitAudioContext;
  if (!AudioContextClass) return null;
  context = new AudioContextClass({ latencyHint: "interactive" });
  return context;
}

function getNoiseBuffer(audioContext: AudioContext) {
  if (noiseBuffer && noiseBuffer.sampleRate === audioContext.sampleRate) return noiseBuffer;

  const length = Math.max(1, Math.floor(audioContext.sampleRate * 0.014));
  noiseBuffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    const envelope = 1 - index / length;
    channel[index] = (Math.random() * 2 - 1) * envelope * envelope;
  }
  return noiseBuffer;
}

export function playInteractionSound(kind: InteractionSound = "press") {
  const currentTime = performance.now();
  if (kind === "tick" && currentTime - lastTickAt < 34) return;
  if (kind === "tick") lastTickAt = currentTime;

  const audioContext = getAudioContext();
  if (!audioContext) return;
  if (audioContext.state === "suspended") void audioContext.resume();

  const profile = profiles[kind];
  const now = audioContext.currentTime;
  const end = now + profile.duration;

  const oscillator = audioContext.createOscillator();
  const tone = audioContext.createGain();
  oscillator.type = kind === "destructive" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(profile.startFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(profile.endFrequency, end);
  tone.gain.setValueAtTime(0.0001, now);
  tone.gain.exponentialRampToValueAtTime(profile.toneGain, now + 0.0015);
  tone.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(tone).connect(audioContext.destination);

  const noise = audioContext.createBufferSource();
  const noiseFilter = audioContext.createBiquadFilter();
  const noiseLevel = audioContext.createGain();
  noise.buffer = getNoiseBuffer(audioContext);
  noiseFilter.type = "highpass";
  noiseFilter.frequency.setValueAtTime(kind === "destructive" ? 950 : 1450, now);
  noiseLevel.gain.setValueAtTime(profile.noiseGain, now);
  noiseLevel.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(profile.duration, 0.018));
  noise.connect(noiseFilter).connect(noiseLevel).connect(audioContext.destination);

  oscillator.start(now);
  oscillator.stop(end);
  noise.start(now);
  noise.stop(now + Math.min(profile.duration, 0.018));
}
