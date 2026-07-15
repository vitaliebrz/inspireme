let audioCtx: AudioContext | null = null;

// Apelat la primul click în app — creează contextul în time gesture
export function initAudioContext(): void {
  if (audioCtx) return;
  try { audioCtx = new AudioContext(); } catch { /* unsupported */ }
}

async function ctx(): Promise<AudioContext | null> {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return audioCtx.state === 'running' ? audioCtx : null;
  } catch { return null; }
}

function tone(
  ac: AudioContext, freq: number, start: number,
  dur: number, vol: number, type: OscillatorType = 'sine',
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

// ── Sunete mesaj ──────────────────────────────────────────────────────────
async function sPing() {
  const ac = await ctx(); if (!ac) return;
  tone(ac, 1046.5, ac.currentTime, 0.14, 0.22); // C6
}
async function sPop() {
  const ac = await ctx(); if (!ac) return;
  tone(ac, 880, ac.currentTime, 0.07, 0.28, 'triangle'); // A5
}
async function sBubble() {
  const ac = await ctx(); if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain); gain.connect(ac.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.exponentialRampToValueAtTime(380, now + 0.13);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  osc.start(now); osc.stop(now + 0.16);
}
async function sBell() {
  const ac = await ctx(); if (!ac) return;
  const now = ac.currentTime;
  tone(ac, 1318.5, now, 0.35, 0.14);     // E6
  tone(ac, 2637,   now, 0.18, 0.06);     // E7 harmonic
}
async function sChimeMini() {
  const ac = await ctx(); if (!ac) return;
  const now = ac.currentTime;
  tone(ac, 880,    now,        0.12, 0.16); // A5
  tone(ac, 1046.5, now + 0.11, 0.14, 0.16); // C6
}

// ── Sunete notificări ─────────────────────────────────────────────────────
async function nChime() {
  const ac = await ctx(); if (!ac) return;
  const now = ac.currentTime;
  tone(ac, 783.99, now,        0.20, 0.20); // G5
  tone(ac, 1046.5, now + 0.16, 0.25, 0.20); // C6
}
async function nDouble() {
  const ac = await ctx(); if (!ac) return;
  const now = ac.currentTime;
  tone(ac, 1046.5, now,        0.10, 0.18);
  tone(ac, 1046.5, now + 0.14, 0.12, 0.18);
}
async function nAlert() {
  const ac = await ctx(); if (!ac) return;
  const now = ac.currentTime;
  tone(ac, 1046.5, now,        0.12, 0.22);
  tone(ac, 830,    now + 0.14, 0.18, 0.18, 'triangle');
}
async function nSoft() {
  const ac = await ctx(); if (!ac) return;
  const now = ac.currentTime;
  tone(ac, 659.25, now,        0.20, 0.14);
  tone(ac, 783.99, now + 0.19, 0.24, 0.14);
}
async function nTriple() {
  const ac = await ctx(); if (!ac) return;
  const now = ac.currentTime;
  tone(ac, 880,    now,        0.10, 0.16);
  tone(ac, 1046.5, now + 0.12, 0.10, 0.16);
  tone(ac, 1318.5, now + 0.24, 0.14, 0.16);
}

// ── Registre ──────────────────────────────────────────────────────────────
const MSG_SOUNDS: Record<string, () => Promise<void>> = {
  ping:   sPing,
  pop:    sPop,
  bubble: sBubble,
  bell:   sBell,
  chime:  sChimeMini,
};

const NOTIF_SOUNDS: Record<string, () => Promise<void>> = {
  chime:  nChime,
  double: nDouble,
  alert:  nAlert,
  soft:   nSoft,
  triple: nTriple,
};

// ── Opțiuni expuse pentru UI ──────────────────────────────────────────────
export const MESSAGE_SOUND_OPTIONS = [
  { id: 'none',   label: 'Silențios' },
  { id: 'ping',   label: 'Ping' },
  { id: 'pop',    label: 'Pop' },
  { id: 'bubble', label: 'Bubble' },
  { id: 'bell',   label: 'Bell' },
  { id: 'chime',  label: 'Chime' },
];

export const NOTIF_SOUND_OPTIONS = [
  { id: 'none',   label: 'Silențios' },
  { id: 'chime',  label: 'Chime' },
  { id: 'double', label: 'Double' },
  { id: 'soft',   label: 'Soft' },
  { id: 'alert',  label: 'Alert' },
  { id: 'triple', label: 'Triple' },
];

const LS_MSG   = 'inspireme_sound_msg';
const LS_NOTIF = 'inspireme_sound_notif';

export async function playMessageSound(): Promise<void> {
  const id = localStorage.getItem(LS_MSG) ?? 'ping';
  if (id === 'none') return;
  await (MSG_SOUNDS[id] ?? sPing)();
}

export async function playNotificationSound(): Promise<void> {
  const id = localStorage.getItem(LS_NOTIF) ?? 'chime';
  if (id === 'none') return;
  await (NOTIF_SOUNDS[id] ?? nChime)();
}

export async function previewSound(type: 'message' | 'notification', id: string): Promise<void> {
  if (id === 'none') return;
  if (type === 'message') await (MSG_SOUNDS[id] ?? sPing)();
  else await (NOTIF_SOUNDS[id] ?? nChime)();
}

export function getSoundPref(type: 'message' | 'notification'): string {
  return localStorage.getItem(type === 'message' ? LS_MSG : LS_NOTIF)
    ?? (type === 'message' ? 'ping' : 'chime');
}

export function setSoundPref(type: 'message' | 'notification', id: string): void {
  localStorage.setItem(type === 'message' ? LS_MSG : LS_NOTIF, id);
}
