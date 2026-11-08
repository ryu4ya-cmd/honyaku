const $ = (id) => document.getElementById(id);

for (const [code, name] of [['auto', '自動で判定'], ...HV_LANGS]) $('source').add(new Option(name, code));
for (const [code, name] of HV_LANGS) $('target').add(new Option(name, code));

const KEYS = Object.keys(HV_DEFAULTS);

chrome.storage.sync.get(HV_DEFAULTS, (s) => {
  for (const k of KEYS) {
    const el = $(k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = s[k]; else el.value = s[k];
    el.onchange = () => chrome.storage.sync.set({ [k]: el.type === 'checkbox' ? el.checked : el.value });
  }
});

let tab = null;

async function refresh() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const st = await chrome.runtime.sendMessage({ type: 'popup-status', tabId: tab.id });
  const btn = $('audio');
  btn.classList.toggle('on', st.audioOn);
  btn.textContent = st.audioOn ? '⏹ 音声からの翻訳を止める' : '🎧 音声から翻訳する（字幕がない動画）';
  const el = $('status');
  if (st.audioOn) {
    el.innerHTML = '🎧 このタブの音声を翻訳中<small></small>';
    el.querySelector('small').textContent = st.asrState && st.asrState !== 'listening' ? st.asrState : '話している内容が動画の上に出ます';
  } else if (!/^https?:/.test(tab.url || '')) {
    el.innerHTML = 'このページでは使えません<small>動画サイトを開いてから押してください</small>';
  } else if (st.sources.length) {
    const name = st.sources[0];
    el.innerHTML = '✅ 字幕を翻訳します<small></small>';
    el.querySelector('small').textContent = name === 'YouTube'
      ? 'YouTube: 動画の字幕（CC）ボタンをオンにしてください。自動生成の字幕でも大丈夫です。'
      : name + ' の字幕を読み取っています';
  } else {
    el.innerHTML = '字幕が見つかりません<small>動画の字幕をオンにするか、下のボタンで音声から翻訳してください</small>';
  }
}

$('audio').onclick = async () => {
  const btn = $('audio');
  if (btn.classList.contains('on')) {
    await chrome.runtime.sendMessage({ type: 'audio-stop' });
  } else {
    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      const res = await chrome.runtime.sendMessage({ type: 'audio-start', tabId: tab.id, streamId });
      if (!res?.ok) throw new Error(res?.error);
    } catch (e) {
      $('status').textContent = '音声を取得できませんでした: ' + (e.message || e);
      return;
    }
  }
  refresh();
};

refresh();
setInterval(refresh, 1000);
