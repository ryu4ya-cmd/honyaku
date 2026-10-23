async function translateGoogle(text, from, to) {
  // Google Translate free web endpoint: no key, much better ja<->en quality.
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
    '&sl=' + from + '&tl=' + to + '&q=' + encodeURIComponent(text);
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

async function translate(text, from, to) {
  try {
    return await translateGoogle(text, from, to);
  } catch (e) {
    return await translateMyMemory(text, from, to);
  }
}

// Speech recognition drops punctuation, so a spoken question loses its "?"
// and gets translated as a statement. Guess questions from wording and add it back.
const JA_Q_END = /(か|かな|かね|かしら|っけ|でしょう|だろう|の|んですか|ますか)$/;
const JA_Q_WORD = /(何|なに|なん|どこ|いつ|誰|だれ|どう|なぜ|どうして|いくら|どれ|どちら|どっち|どの|いくつ)/;
const EN_Q_START = /^(do|does|did|is|are|was|were|am|can|could|will|would|should|shall|may|might|must|have|has|had|what|where|when|why|who|whom|whose|which|how|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|can't|couldn't|won't|wouldn't|shouldn't|haven't|hasn't)\b/i;
const EN_Q_END = /\b(right|okay|ok|isn't it|aren't you|don't you|didn't you|won't you|can't you)$/i;

function addQuestionMark(text, lang) {
  if (/[?？。.!！]$/.test(text)) return text;
  if (lang === 'ja') {
    if (JA_Q_END.test(text) || (JA_Q_WORD.test(text) && /(だ|です|ん|の|何|なに|なん|どこ|いつ|誰|だれ|どう|なぜ|どうして|いくら|どれ|どちら|どっち|いくつ)$/.test(text))) return text + '？';
  } else if (EN_Q_START.test(text) || EN_Q_END.test(text)) {
    return text + '?';
  }
  return text;
}

// Whether the accurate transcript differs from the fast one in more than
// punctuation or capitalization.
function differentWords(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9' ]/g, '').replace(/\s+/g, ' ').trim();
  return norm(a) !== norm(b);
}

// Dialect and slang rules live in dictionaries.js.
function normalizeSpeech(text, lang) {
  return lang === 'ja' ? normalizeDialect(text) : normalizeSlang(text);
}

// Turn a raw recognition result into what to show and what to translate.
function prepareText(text, from) {
  // Show what was said, but translate the standard-Japanese version.
  const std = normalizeSpeech(text, from);
  const query = addQuestionMark(std, from);
  const mark = query !== std ? query.slice(-1) : '';
  return { shown: text + mark, query };
}

// iOS only allows speech output after a tap, so call this from a tap handler.
function unlockSpeech() {
  if (window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

function pickVoice(utterance, lang) {
  utterance.lang = lang;
  utterance.rate = 1.15;  // a little faster keeps the conversation moving
  const voice = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-') === lang);
  if (voice) utterance.voice = voice;
}


// Decide when the speaker has finished. Safari is slow to mark a result as
// final, so we don't wait for that: once no new words have arrived for a short
// pause, the sentence (finished pieces plus the words still in progress) is
// done. Callers must abort the recognizer after a flush so Safari's late
// final result for the same words isn't used twice.
const PAUSE_MS = { ja: 800, en: 1000 };

function makeSentenceBuffer(onFlush) {
  let parts = [];
  let pending = '';
  let lang = null;
  let timer = null;
  const join = () => [...parts, pending].filter(Boolean).join(lang === 'ja' ? '' : ' ').trim();
  const flush = () => {
    timer = null;
    const text = join();
    const l = lang;
    parts = [];
    pending = '';
    if (text) onFlush(text, l);
  };
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, PAUSE_MS[lang] || 900);
  };
  return {
    final(text, l) {
      lang = l;
      parts.push(text);
      pending = '';
      arm();
    },
    interim(text, l) {
      lang = l;
      pending = text;
      arm();
    },
    // The recognizer restarted: keep waiting for the pause.
    rearm() { if ((parts.length || pending) && !timer) arm(); },
    text: join,
    clear() { clearTimeout(timer); timer = null; parts = []; pending = ''; },
  };
}

// Translate what's being said while the speaker is still talking, so the
// listener can follow along. Requests are spaced out to stay under the free
// translation service's rate limit.
function makeLivePreview(from, to, onText) {
  let latest = '', sent = '', timer = null, last = 0, seq = 0;
  const run = () => {
    timer = null;
    if (latest.length - sent.length < 3 && sent && latest.startsWith(sent)) return;
    sent = latest;
    last = Date.now();
    const id = ++seq;
    translateGoogle(latest, from, to).then(t => { if (id === seq) onText(t); }).catch(() => {});
  };
  return {
    update(text) {
      latest = text;
      if (!timer) timer = setTimeout(run, Math.max(0, 1200 - (Date.now() - last)));
    },
    cancel() { clearTimeout(timer); timer = null; latest = sent = ''; seq++; },
  };
}

// How English is recognized: 'whisper' (on-device AI, best with accents) or
// the iPhone's recognizer with a chosen accent.
const EN_MODES = [
  ['whisper', 'AI・高精度（おすすめ）'],
  ['whisper-fast', 'AI・軽量（動きが重いとき）'],
  ['en-US', 'iPhone標準・アメリカ英語'], ['en-GB', 'iPhone標準・イギリス英語'],
  ['en-AU', 'iPhone標準・オーストラリア英語'], ['en-IN', 'iPhone標準・インド英語'],
  ['en-SG', 'iPhone標準・シンガポール英語'], ['en-PH', 'iPhone標準・フィリピン英語'],
];

function getEnMode() {
  let mode = null;
  try { mode = localStorage.getItem('enMode'); } catch {}
  // The page crashed last time, most likely out of memory while the AI ran.
  // Step down one level each time: both models → light model → iPhone's own.
  if (crashedLastTime && lastSessionUsedWhisper) {
    const next = mode === 'whisper-fast' ? 'en-US' : (mode === 'whisper' || mode === null) ? 'whisper-fast' : mode;
    if (next !== mode) {
      mode = next;
      try { localStorage.setItem('enMode', mode); } catch {}
      debugLog('前回の強制終了のため、英語の聞き取りを「' + EN_MODES.find(([c]) => c === mode)[1] + '」に切り替えました', true);
    }
  }
  if (isWhisper(mode) && !window.WebAssembly) mode = null;
  return EN_MODES.some(([code]) => code === mode) ? mode : 'whisper';
}

function isWhisper(mode) { return mode === 'whisper' || mode === 'whisper-fast'; }

// Language code for the iPhone recognizer (used when Whisper is off).
function systemEnLang(mode) { return isWhisper(mode) ? 'en-US' : mode; }

function setupEnModeSelect(select, onChange) {
  for (const [code, name] of EN_MODES) select.add(new Option(name, code));
  select.value = getEnMode();
  select.onchange = () => {
    try { localStorage.setItem('enMode', select.value); } catch {}
    onChange?.(select.value);
  };
}

// Debug log: records errors and key events so problems seen on the phone can
// be reported. A 🐞 button appears once something goes wrong; tapping it shows
// the log with a copy button.
const debugLines = [];

function debugLog(msg, isError) {
  const line = new Date().toTimeString().slice(0, 8) + ' ' + msg;
  debugLines.push(line);
  if (debugLines.length > 80) debugLines.shift();
  try { localStorage.setItem('debugLog', JSON.stringify(debugLines)); } catch {}
  if (isError) showDebugButton();
}

function showDebugButton() {
  if (document.getElementById('debug-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'debug-btn';
  btn.textContent = '🐞';
  btn.setAttribute('aria-label', 'エラー内容を表示');
  btn.style.cssText = 'position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:50;' +
    'width:40px;height:40px;border-radius:50%;border:1px solid #e2e8f0;background:#fff;font-size:20px;';
  btn.onclick = showDebugPanel;
  document.body.appendChild(btn);
}

function showDebugPanel() {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;';
  panel.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:12px;padding:12px;width:100%;max-width:560px;max-height:80vh;display:flex;flex-direction:column;gap:8px">' +
    '<b>エラー内容（このまま開発者に送ってください）</b>' +
    '<pre style="flex:1;overflow:auto;white-space:pre-wrap;font-size:12px;margin:0;background:#f1f5f9;padding:8px;border-radius:8px"></pre>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end"><button data-a="copy">コピー</button><button data-a="close">閉じる</button></div></div>';
  const info = navigator.userAgent + '\n' + location.href + '\n\n';
  panel.querySelector('pre').textContent = info + debugLines.join('\n');
  panel.onclick = async (e) => {
    const a = e.target.dataset?.a;
    if (a === 'copy') {
      try { await navigator.clipboard.writeText(info + debugLines.join('\n')); e.target.textContent = 'コピーしました'; } catch {}
    } else if (a === 'close' || e.target === panel) panel.remove();
  };
  document.body.appendChild(panel);
}

window.addEventListener('error', (e) => debugLog('JS error: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno, true));
window.addEventListener('unhandledrejection', (e) => debugLog('Promise error: ' + (e.reason?.message || e.reason), true));

// iOS reloads a tab that ran out of memory without any event. Mark the page
// as running and clear the mark on a normal exit; if the mark is still there
// on the next load, the previous session crashed.
let lastSessionUsedWhisper = false;
const crashedLastTime = (() => {
  let crashed = false;
  try {
    crashed = localStorage.getItem('pageAlive') === '1';
    const prev = JSON.parse(localStorage.getItem('debugLog') || '[]');
    if (crashed) {
      debugLines.push(...prev.slice(-40), '--- 前回は強制終了しました（メモリ不足の可能性）---');
      // Only look at the session that crashed, not older ones carried over in the log.
      const start = prev.map(l => l.startsWith('---')).lastIndexOf(true) + 1;
      lastSessionUsedWhisper = prev.slice(start).some(l => l.includes('whisper:'));
    }
    localStorage.setItem('pageAlive', '1');
  } catch {}
  const mark = (alive) => { try { alive ? localStorage.setItem('pageAlive', '1') : localStorage.removeItem('pageAlive'); } catch {} };
  addEventListener('pagehide', () => mark(false));
  // A backgrounded tab may be discarded without pagehide; that isn't a crash.
  document.addEventListener('visibilitychange', () => {
    mark(document.visibilityState === 'visible');
    debugLog('page ' + document.visibilityState);
  });
  if (crashed) addEventListener('DOMContentLoaded', showDebugButton);
  return crashed;
})();
