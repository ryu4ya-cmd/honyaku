// Shared text helpers for the extension. These follow the web app's core.js
// (question marks, dialect/slang normalization) so captions are cleaned up the
// same way before translating. dictionaries.js is a copy of the app's file.

const HV_DEFAULTS = {
  enabled: true,      // translate captions on video pages
  target: 'ja',       // language to translate into
  source: 'auto',     // language of the video
  showOriginal: true, // show the original line above the translation
  hideSite: true,     // hide the site's own captions (ours replace them)
  speak: false,       // read translations aloud
  duck: true,         // turn the video down while reading aloud
  rate: '1.2',
  size: 'm',
  pos: 'bottom',
  model: 'base',      // Whisper model for videos without captions
};

const HV_LANGS = [
  ['ja', '日本語'], ['en', '英語'], ['zh-CN', '中国語'], ['ko', '韓国語'], ['es', 'スペイン語'],
  ['fr', 'フランス語'], ['de', 'ドイツ語'], ['pt', 'ポルトガル語'], ['it', 'イタリア語'],
  ['ru', 'ロシア語'], ['vi', 'ベトナム語'], ['th', 'タイ語'], ['id', 'インドネシア語'],
];

// Voice language for reading aloud.
const HV_VOICE = {
  ja: 'ja-JP', en: 'en-US', 'zh-CN': 'zh-CN', ko: 'ko-KR', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
  pt: 'pt-BR', it: 'it-IT', ru: 'ru-RU', vi: 'vi-VN', th: 'th-TH', id: 'id-ID',
};

const HV_JA_Q_END = /(か|かな|かね|かしら|っけ|でしょう|だろう|んですか|ますか)$/;
const HV_EN_Q_START = /^(do|does|did|is|are|was|were|am|can|could|will|would|should|shall|may|might|must|have|has|had|what|where|when|why|who|whom|whose|which|how|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|can't|couldn't|won't|wouldn't|shouldn't|haven't|hasn't)\b/i;

// Which language a caption line is in, when the video's language is "auto".
function hvGuessLang(text, source) {
  if (source && source !== 'auto') return source;
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  if (/[一-鿿]/.test(text)) return 'zh-CN';
  if (/^[\x00-\x7F‘-”…—–]+$/.test(text)) return 'en';
  return 'auto';
}

// Auto-generated captions drop punctuation; add a "?" back to obvious questions.
function hvAddQuestionMark(text, lang) {
  if (/[?？。.!！]$/.test(text)) return text;
  if (lang === 'ja' && HV_JA_Q_END.test(text)) return text + '？';
  if (lang === 'en' && HV_EN_Q_START.test(text)) return text + '?';
  return text;
}

// What to send to the translator for one caption line.
function hvPrepare(text, lang) {
  let t = text;
  if (lang === 'ja') t = normalizeDialect(t);
  else if (lang === 'en') t = normalizeSlang(t);
  return hvAddQuestionMark(t, lang);
}

// Captions in Japanese, Chinese or Korean have no spaces between words.
function hvIsCjk(text) {
  return /[぀-ヿ一-鿿가-힯]/.test(text) && (text.match(/\s/g) || []).length < text.length / 8;
}
