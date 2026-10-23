// Runs Whisper speech recognition on the device, off the main thread.
// The model is downloaded once from Hugging Face and then cached by the browser.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';

env.allowLocalModels = false;

// Two copies run side by side: tiny.en answers fast, base.en (about 3x
// slower, more accurate) re-checks each sentence afterwards.
const MODELS = { fast: 'Xenova/whisper-tiny.en', accurate: 'Xenova/whisper-base.en' };
const MODEL = MODELS[new URL(self.location.href).searchParams.get('model')] || MODELS.fast;
let asr = null;
const files = {};

function reportProgress(p) {
  if (p.status !== 'progress' || !p.total) return;
  files[p.file] = { loaded: p.loaded, total: p.total };
  let loaded = 0, total = 0;
  for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
  postMessage({ type: 'progress', percent: Math.round(loaded / total * 100) });
}

// The GPU (WebGPU, available in recent Safari) is several times faster than the
// CPU. The fast model uses it when it can; the accurate one stays on the CPU so
// the two don't fight over the GPU.
async function hasGpu() {
  try { return !!(self.navigator?.gpu && await navigator.gpu.requestAdapter()); } catch { return false; }
}

function create(device) {
  const opts = device === 'webgpu'
    ? { device, dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } }
    : { device, dtype: 'q8' };
  return pipeline('automatic-speech-recognition', MODEL, { ...opts, progress_callback: reportProgress })
    .then(async (p) => {
      // The first run is much slower than later ones, so do it now on silence.
      await p(new Float32Array(16000));
      return p;
    });
}

function load() {
  if (!asr) {
    asr = (async () => {
      if (MODEL === MODELS.fast && await hasGpu()) {
        try {
          const p = await create('webgpu');
          postMessage({ type: 'log', message: 'using GPU' });
          return p;
        } catch (err) {
          postMessage({ type: 'log', message: 'GPU failed, using CPU: ' + (err?.message || err) });
        }
      }
      return create('wasm');
    })().catch((err) => { asr = null; throw err; });
  }
  return asr;
}

onmessage = async (e) => {
  const { type, id, audio } = e.data;
  try {
    if (type === 'load') {
      await load();
      postMessage({ type: 'ready' });
    } else if (type === 'transcribe') {
      const transcriber = await load();
      const out = await transcriber(audio, { max_new_tokens: 96 });
      postMessage({ type: 'result', id, text: out.text || '' });
    }
  } catch (err) {
    postMessage({ type: 'error', id, message: String(err?.message || err) });
  }
};
