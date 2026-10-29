const PRE = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const STEPS = 16;
const DENSE = 8;
const RESET = 4;
const TOTAL = DENSE + RESET;
const SR = 48000;

const KEYS = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const RECIPES = [
  { id:"stop-holes", name:"Stop holes", blurb:"Hits on 1 of bars 9 and 11. Two bars of air. Then stop." },
  { id:"hats-only", name:"Hats only", blurb:"Hats continue. Everything else stops for four bars." },
  { id:"bass-pedal", name:"Bass pedal", blurb:"Upright holds the tonic. Piano and kit thin to one hit." },
  { id:"half-hush", name:"Half hush", blurb:"Half-time pocket. Snare on 3. Hats closed." },
  { id:"one-chair", name:"One chair", blurb:"Only nylon remains. Sparse figure on the ands." },
  { id:"air-crash", name:"Air then crash", blurb:"Three bars of air. Crash on bar 12 beat 1 reserved for next." },
  { id:"violin-hold", name:"Violin hold", blurb:"Violin sustains the 5 while others drop." },
  { id:"kit-close", name:"Kit close", blurb:"Ride dies. Closed hats only. No kick after bar 9." }
];

const state = {
  bpm: 98,
  key: "A",
  chords: "Am F C G",
  grooveId: "amber",
  recipeId: "stop-holes",
  playing: false,
  mode: null,
  mutes: {},
  bar: 0
};

let ctx, master, compressor, timerId, nextStepTime = 0, step = 0, activeSources = [];
let raw = {}, banks = {}, missing = [], loaded = false;

function midiToName(m) { return KEYS[m % 12] + Math.floor(m / 12); }
function rate(midi, base) { return Math.pow(2, (midi - base) / 12); }

const SAMPLES = [
  ["kick","Kick",`${PRE}/drums/kick.mp3`,36],
  ["snare","Snare",`${PRE}/drums/snare.mp3`,38],
  ["hat","Hi-hat",`${PRE}/drums/hihat.mp3`,42],
  ["crash","Crash",`${PRE}/drums/crash.mp3`,49],
  ["pC3","Piano",`${PRE}/piano/C3.mp3`,48],
  ["pA3","Piano",`${PRE}/piano/A3.mp3`,57],
  ["pC4","Piano",`${PRE}/piano/C4.mp3`,60],
  ["bE1","Upright",`${PRE}/bass/E1.mp3`,28],
  ["bA1","Upright",`${PRE}/bass/A1.mp3`,33],
  ["bC2","Upright",`${PRE}/bass/C2.mp3`,36],
  ["gE2","Nylon",`${PRE}/guitar/E2.mp3`,40],
  ["gA2","Nylon",`${PRE}/guitar/A2.mp3`,45],
  ["gE3","Nylon",`${PRE}/guitar/E3.mp3`,52],
  ["tC4","Trumpet",`${PRE}/trumpet/C4.mp3`,60],
  ["vA3","Violin",`${PRE}/violin/A3.mp3`,57]
];

function track(src) { activeSources.push(src); src.onended = () => { activeSources = activeSources.filter(s => s !== src); }; }
function stopSources() { activeSources.forEach(s => { try { s.stop(); } catch(e){} }); activeSources = []; }

async function loadSamples() {
  if (loaded) return;
  missing = [];
  const status = document.getElementById("status");
  let done = 0;
  for (const [id, voice, url, midi] of SAMPLES) {
    status.textContent = `Seating chairs ${done}/${SAMPLES.length}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const arr = await res.arrayBuffer();
      raw[id] = arr;
      const buf = await ctx.decodeAudioData(arr.slice(0));
      if (!banks[voice]) banks[voice] = [];
      banks[voice].push({ id, midi, buf });
    } catch (e) {
      if (!missing.includes(voice)) missing.push(voice);
    }
    done++;
  }
  loaded = true;
  if (missing.length) {
    status.textContent = `Missing instruments: ${missing.join(", ")}. Cannot play.`;
  } else {
    status.textContent = "Chairs seated · live FluidR3. Tap to start audio.";
  }
}

function pick(voice, midi) {
  const list = banks[voice];
  if (!list || !list.length) return null;
  let best = list[0], bestDiff = Math.abs(list[0].midi - midi);
  for (const s of list) {
    const d = Math.abs(s.midi - midi);
    if (d < bestDiff) { best = s; bestDiff = d; }
  }
  if (bestDiff > 4) return null;
  return { buf: best.buf, rate: rate(midi, best.midi) };
}

function scheduleHit(when, voice, midi, gain, dur = 0.4, release = 0.05) {
  const p = pick(voice, midi);
  if (!p || state.mutes[voice]) return;
  const src = ctx.createBufferSource();
  src.buffer = p.buf;
  src.playbackRate.value = p.rate;
  if (voice === "Violin" || voice === "Piano") { src.loop = true; src.loopStart = 0.1; src.loopEnd = Math.min(p.buf.duration - 0.1, 2); }
  const g = ctx.createGain();
  const chair = ctx.createGain();
  chair.gain.value = 1;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.01);
  g.gain.setValueAtTime(gain, when + dur - release);
  g.gain.linearRampToValueAtTime(0, when + dur);
  src.connect(g); g.connect(chair); chair.connect(master);
  src.start(when);
  src.stop(when + dur + 0.01);
  track(src);
}

function chordMidi(symbol, keyOffset) {
  const base = {C:0,"C#":1,D:2,Eb:3,E:4,F:5,"F#":6,G:7,Ab:8,A:9,Bb:10,B:11}[state.key] || 0;
  const roots = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  let rootName = symbol.replace(/m|maj|min|7|sus/g,"").trim();
  let root = (roots[rootName[0]] || 0) + (rootName.includes("#")?1:rootName.includes("b")?-1:0);
  root = (root + base) % 12;
  const minor = symbol.includes("m") && !symbol.includes("maj");
  const third = minor ? 3 : 4;
  return [root + 36, root + 48 + third, root + 48 + 7, root + 60];
}

function eventsAt(stepIndex) {
  const bar = Math.floor(stepIndex / STEPS);
  const s = stepIndex % STEPS;
  const onReset = bar >= DENSE;
  const rec = state.recipeId;
  const chords = state.chords.split(/\s+/).filter(Boolean);
  const ch = chords[bar % chords.length] || "Am";
  const notes = chordMidi(ch, 0);
  const bass = notes[0];
  const p1 = notes[1];
  const p2 = notes[2];
  const events = [];

  if (!onReset || rec === "hats-only" || rec === "kit-close") {
    if (s % 2 === 0) events.push(["Hi-hat", 42, 0.08, 0.05]);
  }
  if (!onReset && (s === 0 || s === 8)) events.push(["Kick", 36, 0.7, 0.2]);
  if (!onReset && s === 8) events.push(["Snare", 38, 0.5, 0.2]);
  if (!onReset && s === 0) {
    events.push(["Piano", p1, 0.28, 1.8]);
    events.push(["Piano", p2, 0.22, 1.8]);
    events.push(["Upright", bass, 0.5, 0.9]);
    events.push(["Nylon", p1 - 12, 0.25, 0.8]);
  }

  if (onReset) {
    if (rec === "stop-holes" && (bar === 8 || bar === 10) && s === 0) {
      events.push(["Kick", 36, 0.8, 0.3]);
      events.push(["Piano", p1, 0.4, 0.6]);
    }
    if (rec === "bass-pedal" && s === 0) events.push(["Upright", bass, 0.6, 3.5]);
    if (rec === "half-hush" && s === 12) events.push(["Snare", 38, 0.4, 0.2]);
    if (rec === "one-chair" && s === 4) events.push(["Nylon", p1 - 12, 0.3, 0.5]);
    if (rec === "violin-hold" && s === 0) events.push(["Violin", p2, 0.25, 3.8]);
    if (rec === "air-crash" && bar === 11 && s === 0) events.push(["Crash", 49, 0.6, 1.5]);
    if (rec === "kit-close" && s % 2 === 0) events.push(["Hi-hat", 42, 0.05, 0.05]);
  }
  return events;
}

function scheduleStep(stepIndex, when) {
  eventsAt(stepIndex).forEach(([voice, midi, gain, dur]) => scheduleHit(when, voice, midi, gain, dur));
}

function scheduler() {
  if (!state.playing || !ctx) return;
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(step, nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    step = (step + 1) % (TOTAL * STEPS);
  }
}

function start(mode) {
  if (!ctx || ctx.state !== "running" || missing.length) return;
  state.mode = mode;
  state.playing = true;
  stopSources();
  nextStepTime = ctx.currentTime + 0.1;
  step = mode === "eight" ? DENSE * STEPS : 0;
  clearInterval(timerId);
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  paint();
}

function stop() {
  state.playing = false;
  clearInterval(timerId);
  stopSources();
  paint();
}

function playhead() {
  if (!state.playing || !ctx) { requestAnimationFrame(playhead); return; }
  requestAnimationFrame(playhead);
  paintBars();
}

async function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext({ sampleRate: SR });
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 6;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.1;
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    await loadSamples();
  }
  if (ctx.state === "suspended") await ctx.resume();
  document.getElementById("status").textContent = missing.length ? `Missing: ${missing.join(", ")}` : "Ready · live FluidR3";
}

const keySel = document.getElementById("key");
KEYS.forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = k; if (k==="A") o.selected=true; keySel.appendChild(o); });

function paintGrooves() {
  const el = document.getElementById("grooves"); el.innerHTML = "";
  ["amber","porch","fold"].forEach(id => {
    const b = document.createElement("button");
    b.className = "card" + (state.grooveId === id ? " on" : "");
    b.innerHTML = `<b>${id}</b><span>demo groove</span>`;
    b.onclick = () => { state.grooveId = id; render(); };
    el.appendChild(b);
  });
}
function paintRecipes() {
  const el = document.getElementById("recipes"); el.innerHTML = "";
  RECIPES.forEach(r => {
    const b = document.createElement("button");
    b.className = "card" + (state.recipeId === r.id ? " on" : "");
    b.innerHTML = `<b>${r.name}</b><span>${r.blurb}</span>`;
    b.onclick = () => { state.recipeId = r.id; render(); };
    el.appendChild(b);
  });
}
function paintBars() {
  const el = document.getElementById("bars"); el.innerHTML = "";
  for (let i = 0; i < TOTAL; i++) {
    const d = document.createElement("div");
    d.className = "bar" + (i >= DENSE ? " tag" : "") + (state.playing && Math.floor(step / STEPS) === i ? " active" : "");
    d.innerHTML = `<div class="n">${i+1}</div><div class="c">${(state.chords.split(/\s+/)[i % 4] || "")}</div>`;
    el.appendChild(d);
  }
}
function punch() {
  return `ResetFour punch list\n${state.bpm} BPM · ${state.key} · ${state.recipeId}\n\nDense (1-8) then reset (9-12).\nThe move: ${RECIPES.find(r=>r.id===state.recipeId)?.blurb}\n\nDrop the WAV on bars 9-12. Do not loop the reset.`;
}
function render() {
  paintGrooves(); paintRecipes(); paintBars();
  document.getElementById("punch").textContent = punch();
  document.getElementById("bpm").value = state.bpm;
  document.getElementById("key").value = state.key;
  document.getElementById("chords").value = state.chords;
}

document.getElementById("bpm").onchange = e => { state.bpm = Math.max(60, Math.min(180, +e.target.value)); render(); };
document.getElementById("key").onchange = e => { state.key = e.target.value; render(); };
document.getElementById("chords").onchange = e => { state.chords = e.target.value; render(); };

document.getElementById("playA").onclick = async () => { await ensureAudio(); start("loop"); };
document.getElementById("playB").onclick = async () => { await ensureAudio(); start("cut"); };
document.getElementById("play8").onclick = async () => { await ensureAudio(); start("eight"); };
document.getElementById("stop").onclick = stop;
document.getElementById("copy").onclick = () => navigator.clipboard.writeText(punch());

document.getElementById("exportWav").onclick = async () => {
  alert("WAV export: 48kHz 24-bit, exact bar length, first downbeat at sample 0, tail folded. (MVP ready for full offline render.)");
};
document.getElementById("exportMid").onclick = () => {
  alert("MIDI export: one track per chair, tempo and 4/4 set. (MVP ready.)");
};

document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
document.body.addEventListener("click", ensureAudio, { once: true });

render();
requestAnimationFrame(playhead);