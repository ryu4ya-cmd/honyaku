// Runs Whisper speech recognition on the device, off the main thread.
// The model is downloaded once from Hugging Face and then cached by the browser.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';

env.allowLocalModels = false;

const MODEL = 'Xenova/whisper-base.en';
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
    }).catch((err) => { asr = null; throw err; });
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
      const out = await transcriber(audio);
      postMessage({ type: 'result', id, text: out.text || '' });
    }
  } catch (err) {
    postMessage({ type: 'error', id, message: String(err?.message || err) });
  }
};
