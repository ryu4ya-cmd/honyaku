// Offscreen page: receives the tab's sound, keeps it playing through the
// speakers, cuts it into utterances by volume and transcribes each with
// Whisper (runs on this PC; nothing is uploaded except text to translate).

const SAMPLE_RATE = 16000;
const END_SILENCE_MS = 600;   // short pause that ends a piece of speech
const MAX_UTTERANCE_MS = 9000;
const MIN_SPEECH_MS = 700;
const PREROLL_MS = 300;

const WHISPER_LANG = {
  en: 'english', ja: 'japanese', 'zh-CN': 'chinese', ko: 'korean', es: 'spanish', fr: 'french',
  de: 'german', pt: 'portuguese', it: 'italian', ru: 'russian', vi: 'vietnamese', th: 'thai', id: 'indonesian',
};

const send = (m) => chrome.runtime.sendMessage(m).catch(() => {});
const state = (s, info) => send({ type: 'asr-state', state: s, info });

let ctx = null, stream = null, source = null, gain = null, proc = null, worker = null;
let ready = false, busy = 0;
let language = null;

function resample(input, fromRate) {
  if (fromRate === SAMPLE_RATE) return new Float32Array(input);
  const ratio = fromRate / SAMPLE_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio, j = Math.floor(pos), f = pos - j;
    out[i] = input[j] * (1 - f) + (input[j + 1] ?? input[j]) * f;
  }
  return out;
}

function concat(chunks) {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// Whisper "hears" these in music or silence.
function clean(text) {
  const t = text.replace(/\[[^\]]*\]|\([^)]*\)|♪+/g, '').replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return '';
  if (/^(thank you( for watching)?|thanks for watching|you|bye|okay|ご視聴ありがとうございました)[.!。]?$/i.test(t)) return '';
  return t;
}

// ---------- Voice activity detection ----------
let noise = 0.004, hot = 0, inSpeech = false, silenceMs = 0, speechMs = 0;
let preroll = [], speech = [];
const resetVad = () => { hot = 0; inSpeech = false; silenceMs = 0; speechMs = 0; preroll = []; speech = []; };

function finish() {
  const audio = concat(speech);
  const ms = speechMs - silenceMs;
  resetVad();
  if (ms < MIN_SPEECH_MS || !ready) return;
  // If the PC can't keep up, skip a piece rather than fall further behind.
  if (busy >= 2) return;
  busy++;
  worker.postMessage({ type: 'transcribe', audio, language }, [audio.buffer]);
}

function onAudio(e) {
  const chunk = resample(e.inputBuffer.getChannelData(0), ctx.sampleRate);
  const chunkMs = chunk.length / SAMPLE_RATE * 1000;
  let sum = 0;
  for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
  const rms = Math.sqrt(sum / chunk.length);
  const threshold = Math.max(0.008, noise * 2.2);
  if (!inSpeech) {
    noise = rms < noise ? noise * 0.9 + rms * 0.1 : noise * 0.995 + rms * 0.005;
    preroll.push(chunk);
    while (preroll.length * chunkMs > PREROLL_MS) preroll.shift();
    hot = rms > threshold ? hot + 1 : 0;
    if (hot >= 2) { inSpeech = true; speech = preroll.slice(); speechMs = speech.length * chunkMs; silenceMs = 0; }
    return;
  }
  speech.push(chunk);
  speechMs += chunkMs;
  silenceMs = rms > threshold * 0.7 ? 0 : silenceMs + chunkMs;
  if (silenceMs >= END_SILENCE_MS || speechMs >= MAX_UTTERANCE_MS) finish();
}

// ---------- Whisper ----------
function startWorker(model) {
  if (worker) return;
  worker = new Worker('whisper-worker.js?model=' + encodeURIComponent(model), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') state('loading', m.percent);
    else if (m.type === 'ready') { ready = true; state('listening'); }
    else if (m.type === 'result') {
      busy = Math.max(0, busy - 1);
      const text = clean(m.text);
      if (text) send({ type: 'asr-result', text });
    } else if (m.type === 'error') { busy = Math.max(0, busy - 1); state('error', m.message); }
  };
  worker.onerror = (e) => state('error', e.message || 'AIの読み込みに失敗しました');
  state('loading', 0);
  worker.postMessage({ type: 'load' });
}

async function start({ streamId, model, lang }) {
  stop();
  language = WHISPER_LANG[lang] || null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false,
    });
  } catch (e) {
    state('error', 'タブの音を取得できませんでした（' + (e.message || e.name) + '）');
    return;
  }
  ctx = new AudioContext();
  source = ctx.createMediaStreamSource(stream);
  // Capturing mutes the tab, so play the sound back.
  gain = ctx.createGain();
  source.connect(gain);
  gain.connect(ctx.destination);
  proc = ctx.createScriptProcessor(4096, 1, 1);
  proc.onaudioprocess = onAudio;
  source.connect(proc);
  proc.connect(ctx.destination);
  stream.getAudioTracks()[0].onended = () => state('ended');
  resetVad();
  startWorker(model);
  if (ready) state('listening');
}

function stop() {
  proc?.disconnect(); source?.disconnect(); gain?.disconnect();
  stream?.getTracks().forEach(t => t.stop());
  ctx?.close();
  proc = source = gain = stream = ctx = null;
}

chrome.runtime.onMessage.addListener((m) => {
  if (m.target !== 'offscreen') return;
  if (m.type === 'start') start(m);
  else if (m.type === 'stop') stop();
  else if (m.type === 'duck' && gain) gain.gain.setTargetAtTime(m.on ? 0.3 : 1, ctx.currentTime, 0.1);
});
