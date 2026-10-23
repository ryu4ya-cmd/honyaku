// English recognition with Whisper, which handles non-native accents much
// better than the iPhone's built-in recognizer. It listens to the mic, finds
// where each utterance starts and ends from the volume, and transcribes it.

const SAMPLE_RATE = 16000;
const END_SILENCE_MS = 2000;   // pause that ends an utterance (room to stop and think)
const MAX_UTTERANCE_MS = 20000;
const MIN_SPEECH_MS = 400;
const PREROLL_MS = 400;

function resampleTo16k(input, fromRate) {
  if (fromRate === SAMPLE_RATE) return new Float32Array(input);
  const ratio = fromRate / SAMPLE_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const frac = pos - j;
    out[i] = input[j] * (1 - frac) + (input[j + 1] ?? input[j]) * frac;
  }
  return out;
}

function concat(chunks) {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// Whisper sometimes "hears" these in noise or silence.
function cleanTranscript(text, ms) {
  const t = text.replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z0-9]/.test(t)) return '';
  if (ms < 1500 && /^(thank you|thanks for watching|you|bye|okay)[.!]?$/i.test(t)) return '';
  return t;
}

// onResult(text, id) gets the fast transcript; onRefine(id, text) later gets
// the accurate model's transcript of the same audio.
function createWhisperListener({ onState: report, onResult, onRefine }) {
  let refineOn = canRefine();
  const onState = (state, info) => {
    if (state !== 'loading' && state !== 'hearing') debugLog('whisper: ' + state + (info ? ' ' + info : ''), state === 'error');
    report(state, info);
  };
  let worker = null;
  let accurate = null;
  let ready = false;
  let ctx = null, stream = null, source = null, proc = null;
  let active = false;
  let nextId = 0;
  let failed = null;
  const durations = {};
  const sentAt = {};

  // Voice activity detection state
  let noise = 0.005, hot = 0, inSpeech = false, silenceMs = 0, speechMs = 0;
  let preroll = [], speech = [];

  function ensureWorker() {
    if (worker) return;
    worker = new Worker('whisper-worker.js?model=fast', { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'log') debugLog('whisper: ' + m.message);
      else if (m.type === 'progress') onState('loading', m.percent);
      else if (m.type === 'ready') {
        ready = true;
        onState(active ? 'listening' : 'ready');
        startAccurate();
      } else if (m.type === 'result') {
        debugLog('whisper: result #' + m.id + ' in ' + Math.round(performance.now() - (sentAt[m.id] || 0)) + 'ms');
        delete sentAt[m.id];
        const text = cleanTranscript(m.text, durations[m.id] || 0);
        if (active) onState('listening');
        if (text && active && !isNoiseText(text)) onResult(text, m.id);
        else delete durations[m.id];
      } else if (m.type === 'error') fail(m.message);
    };
    worker.onerror = (e) => fail(e.message || 'worker error');
    debugLog('whisper: loading fast model');
    worker.postMessage({ type: 'load' });
  }

  // Load the accurate model only after the fast one, so it doesn't slow the first download.
  function startAccurate() {
    if (accurate || !onRefine || !refineOn) return;
    debugLog('whisper: loading accurate model');
    accurate = new Worker('whisper-worker.js?model=accurate', { type: 'module' });
    accurate.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') debugLog('whisper: accurate model ready');
      if (m.type === 'error') debugLog('whisper accurate error: ' + m.message, true);
      if (m.type !== 'result') return;
      const text = cleanTranscript(m.text, durations[m.id] || 0);
      delete durations[m.id];
      if (text) onRefine(m.id, text);
    };
    accurate.onerror = (e) => debugLog('whisper accurate worker error: ' + (e.message || ''), true);
    accurate.postMessage({ type: 'load' });
  }

  function fail(message) {
    failed = message;
    onState('error', message);
  }

  function resetVad() {
    hot = 0; inSpeech = false; silenceMs = 0; speechMs = 0; preroll = []; speech = [];
  }

  function finishUtterance() {
    const audio = concat(speech);
    const ms = speechMs;
    resetVad();
    if (ms - silenceMs < Math.max(MIN_SPEECH_MS, noiseSettings().minSpeechMs)) { onState('listening'); return; }
    const id = nextId++;
    durations[id] = ms;
    sentAt[id] = performance.now();
    debugLog('whisper: transcribe #' + id + ' (' + (ms / 1000).toFixed(1) + 's audio)');
    onState('transcribing');
    accurate?.postMessage({ type: 'transcribe', id, audio: audio.slice() });
    worker.postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
  }

  function onAudio(e) {
    if (!active) return;
    const chunk = resampleTo16k(e.inputBuffer.getChannelData(0), ctx.sampleRate);
    const chunkMs = chunk.length / SAMPLE_RATE * 1000;
    let sum = 0;
    for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
    const rms = Math.sqrt(sum / chunk.length);
    const ns = noiseSettings();
    const threshold = Math.max(ns.vadMin, noise * ns.vadMul);

    if (!inSpeech) {
      // Track background noise so a noisy room doesn't count as speech.
      noise = rms < noise ? noise * 0.9 + rms * 0.1 : noise * 0.995 + rms * 0.005;
      preroll.push(chunk);
      while (preroll.length * chunkMs > PREROLL_MS) preroll.shift();
      hot = rms > threshold ? hot + 1 : 0;
      if (hot >= 2) {
        inSpeech = true;
        speech = preroll.slice();
        speechMs = speech.length * chunkMs;
        silenceMs = 0;
        onState('hearing');
      }
      return;
    }
    speech.push(chunk);
    speechMs += chunkMs;
    silenceMs = rms > threshold * 0.7 ? 0 : silenceMs + chunkMs;
    if (silenceMs >= END_SILENCE_MS || speechMs >= MAX_UTTERANCE_MS) finishUtterance();
  }

  return {
    // Download the model ahead of time.
    preload() { ensureWorker(); },
    // Turn the background accuracy check on or off (off saves memory).
    setRefine(on) {
      refineOn = on && canRefine();
      if (on) { if (ready) startAccurate(); }
      else if (accurate) { accurate.terminate(); accurate = null; }
    },
    get ready() { return ready; },
    // Must be called from a tap first: iOS only starts audio after a user gesture.
    prime() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state !== 'running') ctx.resume();
    },
    async start() {
      ensureWorker();
      this.prime();
      if (failed) { onState('error', failed); return; }
      if (active) return;
      active = true;
      resetVad();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        active = false;
        onState('error', 'マイクが許可されていません');
        return;
      }
      if (!active) { stream.getTracks().forEach(t => t.stop()); stream = null; return; }
      source = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = onAudio;
      debugLog('whisper: mic on');
      source.connect(proc);
      proc.connect(ctx.destination);
      onState(ready ? 'listening' : 'loading', 0);
    },
    // Releases the mic so speech output plays through the speaker, not the earpiece.
    stop() {
      if (stream) debugLog('whisper: mic off');
      active = false;
      resetVad();
      proc?.disconnect();
      source?.disconnect();
      stream?.getTracks().forEach(t => t.stop());
      proc = source = stream = null;
    },
  };
}
