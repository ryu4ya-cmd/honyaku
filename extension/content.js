// Runs on every page. Finds the video, reads its captions, sends each line to
// be translated and shows the translation on top of the video.
(() => {
if (window.__honyakuVideo) return;
window.__honyakuVideo = true;

let S = { ...HV_DEFAULTS };
let audioMode = false;      // this tab's sound is being transcribed instead
let currentSource = null;   // where captions are coming from, e.g. "YouTube"

// ---------- Overlay ----------
const host = document.createElement('div');
host.id = 'honyaku-video-host';
const shadow = host.attachShadow({ mode: 'closed' });
shadow.innerHTML = `<style>
  :host { all: initial; }
  .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
    justify-content: flex-end; padding: 0 4% 9%; box-sizing: border-box; pointer-events: none; }
  .wrap.top { justify-content: flex-start; padding-top: 5%; padding-bottom: 0; }
  .box { max-width: 92%; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .line { background: rgba(8, 8, 12, .78); color: #fff; border-radius: 8px; padding: 4px 12px;
    text-align: center; line-height: 1.4; font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", "Meiryo", sans-serif;
    text-shadow: 0 1px 2px #000; white-space: pre-wrap; }
  .orig { font-size: calc(var(--s) * .62); color: #d6dae3; }
  .tr { font-size: var(--s); font-weight: 600; }
  .tr.old { opacity: .55; font-size: calc(var(--s) * .8); font-weight: 500; }
  .status { font-size: 12px; color: #cfe3ff; background: rgba(20, 40, 80, .8); }
  .line:empty { display: none; }
</style><div class="wrap"><div class="box">
  <div class="line status"></div><div class="line tr old"></div><div class="line orig"></div><div class="line tr cur"></div>
</div></div>`;
const wrapEl = shadow.querySelector('.wrap');
const statusEl = shadow.querySelector('.status');
const oldEl = shadow.querySelector('.tr.old');
const origEl = shadow.querySelector('.orig');
const curEl = shadow.querySelector('.tr.cur');
let lastShownAt = 0;
let statusTimer = null;

function setStatus(text, ms) {
  statusEl.textContent = text || '';
  clearTimeout(statusTimer);
  if (text && ms) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, ms);
}

const SIZES = { s: 18, m: 24, l: 32, xl: 42 };

function applyLook() {
  wrapEl.classList.toggle('top', S.pos === 'top');
  document.documentElement.classList.toggle('honyaku-hide-site', S.enabled && S.hideSite && !audioMode);
}

function pickVideo() {
  let best = null, bestArea = 0;
  for (const v of document.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    const area = r.width * r.height;
    if (r.width < 160 || r.height < 90 || r.bottom < 0 || r.top > innerHeight) continue;
    if (area > bestArea) { best = v; bestArea = area; }
  }
  return best;
}

let video = null;

function place() {
  const parent = document.fullscreenElement && document.fullscreenElement.tagName !== 'VIDEO'
    ? document.fullscreenElement : document.documentElement;
  if (host.parentNode !== parent) parent.appendChild(host);
  const active = S.enabled || audioMode;
  const hasText = curEl.textContent || statusEl.textContent || origEl.textContent;
  host.style.display = active && (video || hasText) ? 'block' : 'none';
  let r = video ? video.getBoundingClientRect() : null;
  // No video in this frame (e.g. it's in an embedded player): use the window.
  if (!r || r.width < 160) r = { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const scale = Math.max(0.6, Math.min(1.6, r.width / 960));
  Object.assign(host.style, {
    position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
    zIndex: '2147483647', pointerEvents: 'none', margin: '0', padding: '0', border: '0',
  });
  host.style.setProperty('--s', Math.round(SIZES[S.size] * scale) + 'px');
  wrapEl.style.setProperty('--s', Math.round(SIZES[S.size] * scale) + 'px');
  // Clear old lines once nothing has been said for a while.
  if (curEl.textContent && Date.now() - lastShownAt > 9000) { curEl.textContent = oldEl.textContent = origEl.textContent = ''; }
}

// ---------- Reading captions ----------
// Sites that draw captions themselves (not as a video text track).
const DOM_SOURCES = [
  { name: 'YouTube', sel: '.ytp-caption-segment' },
  { name: 'Netflix', sel: '.player-timedtext-text-container' },
  { name: 'Prime Video', sel: '.atvwebplayersdk-captions-text' },
  { name: 'Disney+', sel: '.dss-subtitle-renderer-line' },
  { name: 'Vimeo', sel: '.vp-captions .vp-captions-line, .vp-captions > span' },
];

const hiddenTracks = new Set();

function readTrack(v) {
  const tracks = [...v.textTracks].filter(t => t.kind === 'subtitles' || t.kind === 'captions');
  if (!tracks.length) return null;
  const t = tracks.find(t => t.mode === 'showing') || tracks.find(t => t.mode === 'hidden') || tracks[0];
  // "hidden" still loads the cues but lets us draw them instead of the browser.
  if (t.mode === 'disabled' || (t.mode === 'showing' && S.hideSite)) { t.mode = 'hidden'; hiddenTracks.add(t); }
  if (!t.activeCues) return '';
  return [...t.activeCues].map(c => (c.text || '').replace(/<[^>]+>/g, '')).join('\n');
}

function restoreTracks() {
  for (const t of hiddenTracks) { try { t.mode = 'showing'; } catch {} }
  hiddenTracks.clear();
}

// Current caption text on screen, and whether each change is a whole new
// caption (discrete) or more words added to a scrolling one.
function readCaptions() {
  for (const src of DOM_SOURCES) {
    const els = document.querySelectorAll(src.sel);
    if (els.length) return { name: src.name, text: [...els].map(e => e.textContent).join(' '), discrete: false };
    if (src.name === 'YouTube' && document.querySelector('.ytp-caption-window-container')) {
      return { name: src.name, text: '', discrete: false };
    }
  }
  if (video) {
    const t = readTrack(video);
    if (t !== null) return { name: '字幕トラック', text: t, discrete: true };
  }
  return null;
}

// ---------- Splitting scrolling captions into sentences ----------
// Auto captions scroll word by word, so the same words stay on screen for a
// while. We keep only newly added words and translate once a sentence ends or
// the speaker pauses.
const PAUSE_MS = 900;
const MAX_WORDS = 28;
let prevTokens = [];
let buffer = [];
let bufferCjk = false;
let flushTimer = null;
let lastText = '';

const tokenize = (text) => hvIsCjk(text) ? [...text.replace(/\s+/g, '')] : text.split(/\s+/).filter(Boolean);
const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
const joinTokens = (tokens, cjk) => tokens.join(cjk ? '' : ' ');

// How many tokens at the start of `cur` were already at the end of `prev`.
// A word or two may differ, since auto captions fix words as they go.
function overlap(prev, cur) {
  for (let m = Math.min(prev.length, cur.length); m >= 1; m--) {
    let miss = 0;
    for (let i = 0; i < m; i++) if (norm(prev[prev.length - m + i]) !== norm(cur[i])) miss++;
    if (miss === 0 || (m >= 4 && miss <= Math.floor(m / 4))) return m;
  }
  return 0;
}

function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  const text = joinTokens(buffer, bufferCjk).trim();
  buffer = [];
  if (text) handleLine(text);
}

function onCaption(text, discrete) {
  text = (text || '').replace(/\s+/g, ' ').trim();
  if (text === lastText) return;
  lastText = text;
  if (discrete) {
    flush();
    prevTokens = [];
    if (text) { buffer = tokenize(text); bufferCjk = hvIsCjk(text); flush(); }
    return;
  }
  if (!text) { prevTokens = []; clearTimeout(flushTimer); flushTimer = setTimeout(flush, 300); return; }
  const tokens = tokenize(text);
  const m = overlap(prevTokens, tokens);
  if (m === 0 && buffer.length) flush();
  const added = tokens.slice(m);
  prevTokens = tokens;
  if (!added.length) return;
  bufferCjk = hvIsCjk(text);
  buffer.push(...added);
  if (S.showOriginal) { origEl.textContent = joinTokens(buffer, bufferCjk); lastShownAt = Date.now(); }
  const last = buffer[buffer.length - 1];
  if ((/[.?!。？！]["')\]]?$/.test(last) && buffer.length >= 3) || buffer.length >= (bufferCjk ? MAX_WORDS * 2 : MAX_WORDS)) flush();
  else { clearTimeout(flushTimer); flushTimer = setTimeout(flush, PAUSE_MS); }
}

// ---------- Translating and showing ----------
let seq = 0, shownSeq = 0;

async function handleLine(text) {
  const id = ++seq;
  const lang = hvGuessLang(text, S.source);
  // Already in the language we want: show it as is.
  const same = lang === S.target || (lang === 'zh-CN' && S.target.startsWith('zh'));
  let translated = text;
  if (!same) {
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'translate', text: hvPrepare(text, lang), from: S.source, hint: lang, to: S.target });
    } catch (e) { return; }
    if (!res?.ok) { setStatus('翻訳できませんでした（通信を確認してください）', 4000); return; }
    translated = res.text;
  }
  if (id < shownSeq) return; // a newer line is already on screen
  shownSeq = id;
  oldEl.textContent = curEl.textContent;
  curEl.textContent = translated;
  origEl.textContent = S.showOriginal ? text : '';
  lastShownAt = Date.now();
  if (S.speak && !same) chrome.runtime.sendMessage({ type: 'speak', text: translated }).catch(() => {});
}

// ---------- Turning the video down while reading aloud ----------
let ducked = null;
function duck(on) {
  if (on && !ducked && video) { ducked = { v: video, vol: video.volume }; video.volume = video.volume * 0.3; }
  else if (!on && ducked) { ducked.v.volume = ducked.vol; ducked = null; }
}

// ---------- Main loop ----------
function tick() {
  video = pickVideo();
  place();
  if (!S.enabled || audioMode) return;
  const cap = readCaptions();
  const name = cap ? cap.name : null;
  if (name !== currentSource) {
    currentSource = name;
    chrome.runtime.sendMessage({ type: 'caption-source', name, top: window === top }).catch(() => {});
  }
  if (cap) onCaption(cap.text, cap.discrete);
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.type === 'asr-result') { lastShownAt = Date.now(); handleLine(m.text); }
  else if (m.type === 'asr-state') setStatus(m.text, m.ms);
  else if (m.type === 'audio-mode') {
    audioMode = m.on;
    if (audioMode) { flush(); restoreTracks(); }
    else setStatus('音声からの翻訳を止めました', 2500);
    applyLook();
  } else if (m.type === 'duck') duck(m.on && S.duck);
  else if (m.type === 'get-source') reply({ name: currentSource });
});

chrome.storage.sync.get(HV_DEFAULTS, (v) => {
  S = v;
  applyLook();
  setInterval(tick, 250);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const k in changes) S[k] = changes[k].newValue;
  if (!S.enabled) { restoreTracks(); curEl.textContent = oldEl.textContent = origEl.textContent = ''; buffer = []; }
  else if (!S.hideSite) restoreTracks();
  if (!S.showOriginal) origEl.textContent = '';
  lastText = '';
  applyLook();
});

addEventListener('fullscreenchange', place);
})();
