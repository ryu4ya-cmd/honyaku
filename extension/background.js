// Background: translates (pages can't call the translator directly because of
// their own security rules), reads aloud, and runs the "listen to the tab's
// sound" mode through an offscreen page.
importScripts('text.js');

async function translateGoogle(text, from, to) {
  // Google Translate free web endpoint: no key, the same one the web app uses.
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
    '&sl=' + encodeURIComponent(from) + '&tl=' + encodeURIComponent(to) + '&q=' + encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return data[0].map(seg => seg[0]).join('');
}

async function translateMyMemory(text, from, to) {
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
    '&langpair=' + from + '|' + to;
  const res = await fetch(url);
  const data = await res.json();
  if (String(data.responseStatus) !== '200') throw new Error(data.responseDetails || 'translation failed');
  return data.responseData.translatedText;
}

async function translate(text, from, hint, to) {
  try {
    return await translateGoogle(text, from || 'auto', to);
  } catch (e) {
    const src = from && from !== 'auto' ? from : (hint && hint !== 'auto' ? hint : 'en');
    return await translateMyMemory(text, src, to);
  }
}

const getSettings = () => chrome.storage.sync.get(HV_DEFAULTS);
const session = {
  get: async (k) => (await chrome.storage.session.get(k))[k],
  set: (k, v) => chrome.storage.session.set({ [k]: v }),
};

// ---------- Reading aloud ----------
// Only keep one line waiting, so speech doesn't fall behind the video.
let speakQueue = 0;
let duckTab = null;

async function speak(text, tabId) {
  const s = await getSettings();
  if (speakQueue >= 2) { chrome.tts.stop(); speakQueue = 0; }
  speakQueue++;
  chrome.tts.speak(text, {
    lang: HV_VOICE[s.target] || s.target,
    rate: Number(s.rate) || 1,
    enqueue: true,
    onEvent: (e) => {
      if (e.type === 'start') setDuck(tabId, true);
      if (['end', 'interrupted', 'cancelled', 'error'].includes(e.type)) {
        speakQueue = Math.max(0, speakQueue - 1);
        if (speakQueue === 0) setDuck(tabId, false);
      }
    },
  });
}

async function setDuck(tabId, on) {
  const s = await getSettings();
  if (on && !s.duck) return;
  if (!on && duckTab === null) return;
  duckTab = on ? tabId : null;
  if (tabId === await session.get('audioTab')) chrome.runtime.sendMessage({ target: 'offscreen', type: 'duck', on }).catch(() => {});
  else chrome.tabs.sendMessage(tabId, { type: 'duck', on }).catch(() => {});
}

// ---------- Listening to the tab's sound ----------
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: '字幕のない動画の音声を文字に起こして翻訳するため',
  });
}

async function startAudio(tabId, streamId) {
  const old = await session.get('audioTab');
  if (old != null && old !== tabId) await stopAudio();
  const s = await getSettings();
  await ensureOffscreen();
  await session.set('audioTab', tabId);
  chrome.tabs.sendMessage(tabId, { type: 'audio-mode', on: true }, { frameId: 0 }).catch(() => {});
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', streamId, model: s.model, lang: s.source });
}

async function stopAudio() {
  const tabId = await session.get('audioTab');
  await session.set('audioTab', null);
  await session.set('asrState', null);
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'audio-mode', on: false }, { frameId: 0 }).catch(() => {});
}

const STATE_TEXT = {
  loading: (p) => 'AIモデルを準備中… ' + (p ?? 0) + '%（初回だけ時間がかかります）',
  listening: () => '🎧 音声を聞き取り中',
  error: (m) => 'エラー: ' + m,
};

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.target === 'offscreen') return;
  if (m.type === 'translate') {
    translate(m.text, m.from, m.hint, m.to)
      .then(text => reply({ ok: true, text }))
      .catch(e => reply({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (m.type === 'speak') { speak(m.text, sender.tab?.id); return; }
  if (m.type === 'caption-source' && sender.tab) {
    // Remember what each tab's frames found, for the popup.
    const key = 'src' + sender.tab.id;
    session.get(key).then(cur => {
      const next = { ...(cur || {}), [sender.frameId]: m.name };
      if (!m.name) delete next[sender.frameId];
      session.set(key, next);
    });
    return;
  }
  if (m.type === 'popup-status') {
    Promise.all([session.get('src' + m.tabId), session.get('audioTab'), session.get('asrState')])
      .then(([src, audioTab, asrState]) => reply({ sources: Object.values(src || {}), audioOn: audioTab === m.tabId, asrState }));
    return true;
  }
  if (m.type === 'audio-start') { startAudio(m.tabId, m.streamId).then(() => reply({ ok: true }), e => reply({ ok: false, error: String(e) })); return true; }
  if (m.type === 'audio-stop') { stopAudio().then(() => reply({ ok: true })); return true; }
  // From the offscreen page.
  if (m.type === 'asr-state' || m.type === 'asr-result') {
    session.get('audioTab').then(tabId => {
      if (tabId == null) return;
      if (m.type === 'asr-result') { chrome.tabs.sendMessage(tabId, { type: 'asr-result', text: m.text }, { frameId: 0 }).catch(() => {}); return; }
      session.set('asrState', m.state === 'loading' ? STATE_TEXT.loading(m.info) : m.state === 'error' ? STATE_TEXT.error(m.info) : m.state);
      const text = STATE_TEXT[m.state]?.(m.info) || '';
      if (text || m.state === 'ready') chrome.tabs.sendMessage(tabId, { type: 'asr-state', text, ms: m.state === 'listening' ? 2500 : 0 }, { frameId: 0 }).catch(() => {});
      if (m.state === 'ended') stopAudio();
    });
  }
});

// Stop listening when that tab closes or goes to another page.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  chrome.storage.session.remove('src' + tabId);
  if (tabId === await session.get('audioTab')) stopAudio();
});
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status === 'loading' && info.url) chrome.storage.session.remove('src' + tabId);
});
