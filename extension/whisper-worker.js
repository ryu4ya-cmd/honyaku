// Runs Whisper speech recognition on this PC, off the main thread.
// The library is bundled in lib/ (extensions may not load code from the web);
// the model is downloaded once from Hugging Face and then cached.
import { pipeline, env } from './lib/transformers.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = new URL('./lib/', self.location.href).href;
env.backends.onnx.wasm.numThreads = 1;

// Multilingual models, so videos in any language work.
const MODELS = { tiny: 'Xenova/whisper-tiny', base: 'Xenova/whisper-base', small: 'Xenova/whisper-small' };
const MODEL = MODELS[new URL(self.location.href).searchParams.get('model')] || MODELS.base;
let asr = null;
const files = {};

function reportProgress(p) {
  if (p.status !== 'progress' || !p.total) return;
  files[p.file] = { loaded: p.loaded, total: p.total };
  let loaded = 0, total = 0;
  for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
  postMessage({ type: 'progress', percent: Math.round(loaded / total * 100) });
}

function load() {
  if (!asr) {
    asr = pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: reportProgress,
    }).then(async (p) => {
      await p(new Float32Array(16000));
      return p;
    }).catch((err) => { asr = null; throw err; });
  }
  return asr;
}

onmessage = async (e) => {
  const { type, audio, language } = e.data;
  try {
    if (type === 'load') {
      await load();
      postMessage({ type: 'ready' });
    } else if (type === 'transcribe') {
      const transcriber = await load();
      const opts = { max_new_tokens: 128, task: 'transcribe' };
      if (language) opts.language = language;
      const out = await transcriber(audio, opts);
      postMessage({ type: 'result', text: out.text || '' });
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
