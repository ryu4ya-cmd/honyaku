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

// Translation engines only know standard Japanese, so rewrite common dialect
// (mainly Kansai, plus a few others) into standard forms before translating.
// Order matters: longer and more specific patterns come first.
const DIALECT = [
  // Kansai: words
  [/おおきに/g, 'ありがとう'],
  [/ほんまに/g, '本当に'], [/ほんま/g, '本当'],
  [/めっちゃ/g, 'とても'], [/めちゃめちゃ/g, 'とても'],
  [/なんぼ/g, 'いくら'],
  [/かまへん/g, '構わない'], [/しゃあない/g, '仕方ない'], [/しゃーない/g, '仕方ない'],
  [/あかんわ/g, 'だめだ'], [/あかん/g, 'だめ'], [/かなん/g, 'かなわない'],
  [/(?<=[言思買会払使])うて/g, 'って'], [/もろて/g, 'もらって'],
  [/ほかす/g, '捨てる'], [/ほかした/g, '捨てた'],
  [/ちゃうちゃう/g, '違う違う'], [/ちゃうん/g, '違うの'], [/ちゃうで/g, '違うよ'], [/ちゃう/g, '違う'],
  [/せやけど/g, 'だけど'], [/せやから/g, 'だから'], [/せやな/g, 'そうだね'], [/せや/g, 'そうだ'],
  [/ええ(?=[やなよねわで])/g, 'いい'],
  // Kansai: negatives (〜へん)
  [/(でけへん|できひん)/g, 'できない'],
  [/(せえへん|せーへん|しいひん|しーひん|せん(?=[よわで]|$))/g, 'しない'],
  [/(けえへん|けーへん|こーへん|こおへん|きいひん|きーひん)/g, '来ない'],
  [/(?<=[かがさたなばまらわえけげせてねべめれ])へん/g, 'ない'],
  // Kansai: copula and endings
  [/やねん/g, 'なんだ'], [/てんねん/g, 'てるんだ'], [/ねん/g, 'んだ'],
  [/してん(?=$|[よでな])/g, 'したんだ'],
  [/やんか/g, 'じゃないか'], [/やんな/g, 'だよね'], [/やん(?=$|[、。])/g, 'じゃない'],
  [/やろか/g, 'だろうか'], [/やろ(?=$|[、。う])/g, 'だろう'],
  [/やけど/g, 'だけど'], [/やから/g, 'だから'],
  [/やで/g, 'だよ'], [/(?<=[うくすつぶむぐる])で$/g, 'よ'], [/やな/g, 'だね'], [/やわ/g, 'だわ'], [/やね/g, 'だね'], [/や(?=$|[、。])/g, 'だ'],
  [/(?<=何|なに)なん$/g, 'なの'], [/なん$/g, 'なの'],
  [/(?<=[るうくすつぶむぐたい])ん$/g, 'の'],
  // Western Japan: 〜とる / 〜よる / 〜ん negatives / 〜けん
  [/しよる/g, 'している'], [/とる(?=$|[、。よのか])/g, 'ている'], [/とった/g, 'ていた'],
  [/(?<=[かまらわ])ん(?=$|[、。よわで])/g, 'ない'],
  [/じゃけん/g, 'だから'], [/けん(?=$|[、。])/g, 'から'],
  [/ばい$/g, 'よ'], [/じゃろ/g, 'だろう'],
  // Nagoya
  [/でら/g, 'とても'], [/だがや/g, 'じゃないか'], [/やっとかめ/g, '久しぶり'],
  // Tohoku / Hokkaido
  [/なまら/g, 'とても'], [/だべ/g, 'だろう'], [/べ$/g, 'だろう'], [/めんこい/g, 'かわいい'], [/しゃっこい/g, '冷たい'],
  // Okinawa
  [/めんそーれ/g, 'いらっしゃいませ'], [/なんくるないさ/g, 'なんとかなるさ'],
];

function normalizeDialect(text) {
  let out = text;
  for (const [re, std] of DIALECT) out = out.replace(re, std);
  return out;
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

// Turn a raw recognition result into what to show and what to translate.
function prepareText(text, from) {
  // Show what was said, but translate the standard-Japanese version.
  const std = from === 'ja' ? normalizeDialect(text) : text;
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
  ['whisper', 'High accuracy (AI)'],
  ['en-US', 'iPhone: English (US)'], ['en-GB', 'iPhone: English (UK)'],
  ['en-AU', 'iPhone: English (Australia)'], ['en-IN', 'iPhone: English (India)'],
  ['en-SG', 'iPhone: English (Singapore)'], ['en-PH', 'iPhone: English (Philippines)'],
];

function getEnMode() {
  let mode = null;
  try { mode = localStorage.getItem('enMode'); } catch {}
  if (mode === 'whisper' && !window.WebAssembly) mode = null;
  return EN_MODES.some(([code]) => code === mode) ? mode : 'whisper';
}

// Language code for the iPhone recognizer (used when Whisper is off).
function systemEnLang(mode) { return mode === 'whisper' ? 'en-US' : mode; }

function setupEnModeSelect(select, onChange) {
  for (const [code, name] of EN_MODES) select.add(new Option(name, code));
  select.value = getEnMode();
  select.onchange = () => {
    try { localStorage.setItem('enMode', select.value); } catch {}
    onChange?.(select.value);
  };
}
