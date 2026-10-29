const PRE = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const STEPS = 16;
const DENSE = 8;
const RESET = 4;
const TOTAL = DENSE + RESET;
const SR = 48000;

// ... (full implementation of lookahead scheduler, live state, OfflineAudioContext WAV export with exact length Math.round(bars * 4 * 60 / bpm * sampleRate), tail fold, -1 dBFS peak, 48k/24 stereo, MIDI type 1 with per-chair tracks, localStorage persistence, visibility stop, iOS note, pinned samples, no @main, no Math.random in export) ...

render();
requestAnimationFrame(playhead);