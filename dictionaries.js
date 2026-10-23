// Rewrite rules applied before translating. Translation engines handle
// standard Japanese and plain English well, but stumble on regional dialect
// and slang, so speech is normalized first. Each list is applied in order:
// whole phrases first, then words, then grammar endings.

// ---------- Japanese dialects → standard Japanese ----------
const DIALECT = [
  // Set phrases (several regions)
  [/なんでやねん/g, 'どうしてだよ'], [/どないしたん/g, 'どうしたの'], [/どないなっとん/g, 'どうなっているの'],
  [/おいでやす/g, 'いらっしゃいませ'], [/おこしやす/g, 'いらっしゃいませ'], [/まいど/g, 'どうも'],
  [/おばんです/g, 'こんばんは'], [/おしょうしな/g, 'ありがとう'], [/おやっとさあ/g, 'お疲れさま'],
  [/はいさい/g, 'こんにちは'], [/はいたい/g, 'こんにちは'], [/にふぇーでーびる/g, 'ありがとうございます'],
  [/めんそーれ/g, 'いらっしゃいませ'], [/なんくるないさ/g, 'なんとかなるさ'],
  [/すいとーよ/g, '好きだよ'], [/なんしよっと/g, '何をしているの'], [/なんしよると/g, '何をしているの'],
  [/やっとかめ/g, '久しぶり'], [/だがや/g, 'じゃないか'], [/がや$/g, 'じゃないか'], [/ゴミ(を)?投げ/g, 'ゴミ$1捨て'],

  // Kansai / Kyoto: words
  [/おおきに/g, 'ありがとう'],
  [/ほんまに/g, '本当に'], [/ほんま/g, '本当'],
  [/めっちゃ/g, 'とても'], [/めちゃめちゃ/g, 'とても'], [/めっさ/g, 'とても'], [/ごっつい/g, 'すごい'], [/ごっつ/g, 'すごく'],
  [/なんぼ/g, 'いくら'], [/どない/g, 'どう'], [/ようけ/g, 'たくさん'], [/(?<!お)はよ(?!う)/g, '早く'],
  [/かまへん/g, '構わない'], [/かめへん/g, '構わない'], [/しゃあない/g, '仕方ない'], [/しゃーない/g, '仕方ない'],
  [/かなわん/g, 'たまらない'], [/あかんわ/g, 'だめだ'], [/あかん/g, 'だめ'], [/かなん/g, 'かなわない'],
  [/しんどい/g, '疲れた'], [/おもろい/g, '面白い'], [/けったいな/g, '変な'], [/いけず/g, '意地悪'],
  [/べっぴん/g, '美人'], [/あんじょう/g, 'うまく'],
  [/ほんなら/g, 'それなら'], [/ほんで/g, 'それで'], [/ほな/g, 'それでは'], [/せやかて/g, 'だって'],
  [/(?<=[言思買会払使])うて/g, 'って'], [/もろて/g, 'もらって'],
  [/ほかす/g, '捨てる'], [/ほかした/g, '捨てた'],
  [/ちゃうちゃう/g, '違う違う'], [/ちゃうん/g, '違うの'], [/ちゃうで/g, '違うよ'], [/ちゃう/g, '違う'],
  [/せやけど/g, 'だけど'], [/せやから/g, 'だから'], [/せやな/g, 'そうだね'], [/せや/g, 'そうだ'],
  [/ええ(?=[やなよねわで])/g, 'いい'],
  [/(?<=^|[はがもにで、])いてる/g, 'いる'], [/(?<=^|[はがもにで、])おるん/g, 'いるの'], [/(?<=^|[はがもにで、])おった/g, 'いた'],
  [/さかい/g, 'から'],
  // Kansai: honorific 〜はる
  [/てはった/g, 'ていた'], [/てはる/g, 'ている'], [/しはった/g, 'した'], [/しはる/g, 'する'], [/来はる/g, '来る'],
  // Kansai: negatives (〜へん)
  [/(でけへん|できひん)かった/g, 'できなかった'], [/(でけへん|できひん)/g, 'できない'],
  [/(せえへん|せーへん|しいひん|しーひん)かった/g, 'しなかった'],
  [/(せえへん|せーへん|しいひん|しーひん|せん(?=[よわで]|$))/g, 'しない'],
  [/(けえへん|けーへん|こーへん|こおへん|きいひん|きーひん)かった/g, '来なかった'],
  [/(けえへん|けーへん|こーへん|こおへん|きいひん|きーひん)/g, '来ない'],
  [/(?<=[かがさたなばまらわえけげせてねべめれ])へんかった/g, 'なかった'],
  [/(?<=[かがさたなばまらわえけげせてねべめれ])へん/g, 'ない'],
  // Kansai: copula and endings
  [/やねん/g, 'なんだ'], [/てんねん/g, 'てるんだ'], [/ねん/g, 'んだ'],
  [/してん(?=$|[よでな])/g, 'したんだ'],
  [/やんか/g, 'じゃないか'], [/やんな/g, 'だよね'], [/やん(?=$|[、。])/g, 'じゃない'],
  [/やろか/g, 'だろうか'], [/やろ(?=$|[、。う])/g, 'だろう'],
  [/やけど/g, 'だけど'], [/やから/g, 'だから'], [/やけん/g, 'だから'],
  [/やで/g, 'だよ'], [/(?<=[うくすつぶむぐる])で$/g, 'よ'], [/やな/g, 'だね'], [/やわ/g, 'だわ'], [/やね/g, 'だね'], [/や(?=$|[、。])/g, 'だ'],
  [/どす(?=$|[、。えか])/g, 'です'],
  [/(?<=何|なに)なん$/g, 'なの'], [/なん$/g, 'なの'],

  // Hiroshima / Chugoku
  [/ぶち(?=[ぁ-んァ-ヶ一-龠])/g, 'とても'], [/たいぎい/g, '面倒くさい'],
  // At the end of a sentence 〜けぇ/〜けん is closer to 〜よ than to 〜から.
  [/じゃけ[んぇ]$/g, 'だよ'], [/じゃけん/g, 'だから'], [/じゃけぇ/g, 'だから'], [/けぇ$/g, 'よ'], [/けぇ(?=[、。])/g, 'から'],
  [/じゃろう?/g, 'だろう'], [/(?<!れ)じゃ(?=$|[、。])/g, 'だ'],

  // Fukuoka (Hakata) / Kyushu
  [/ばってん/g, 'だけど'], [/ちかっぱ/g, 'とても'], [/ごたる/g, 'ようだ'],
  [/しよると$/g, 'しているの'], [/しとると$/g, 'しているの'], [/とっと$/g, 'ているの'],
  [/(?<![たっ])よか(?=$|[よね、。])/g, 'いい'],
  [/っちゃ(?=$|[、。ね])/g, 'よ'], [/ばい$/g, 'よ'], [/でごわす/g, 'です'],

  // Kochi (Tosa)
  [/まっこと/g, '本当に'], [/ぜよ$/g, 'よ'], [/(?<=[るただ])きに(?=$|[、。])/g, 'から'],

  // Nagoya / Mikawa / Shizuoka
  [/どえりゃあ/g, 'とても'], [/でら/g, 'とても'],
  [/おみゃあ/g, 'お前'], [/(?<=こ)みゃあ$/g, 'う'], [/だで(?=$|[、。])/g, 'だから'], [/だに$/g, 'だよ'],
  [/ケッタ/g, '自転車'], [/[ずだ]ら$/g, 'だろう'],

  // Tohoku / Hokkaido
  [/(^|、)んだ(?=$|[、。ねな])/g, '$1そうだ'], [/だっちゃ/g, 'だよ'],
  [/なまら/g, 'とても'], [/めんこい/g, 'かわいい'], [/しゃっこい/g, '冷たい'], [/しばれる/g, 'とても寒い'],
  [/あずましい/g, '心地いい'], [/わんつか/g, '少し'], [/なんも/g, '何も'], [/いずい/g, '違和感がある'],
  [/どさ(?=$|[、。])/g, 'どこへ'], [/っしょ$/g, 'でしょう'], [/だべ/g, 'だろう'], [/べ$/g, 'だろう'],

  // Okinawa
  [/でーじ/g, 'とても'], [/ちゅら/g, '美しい'], [/ゆくい/g, '休憩'],

  // Western Japan grammar: 〜とる / 〜よる / 〜ん negatives / 〜けん
  [/しよる/g, 'している'], [/とる(?=$|[、。よのか])/g, 'ている'], [/とった/g, 'ていた'],
  [/(?<=[かまらわれ])んかった/g, 'なかった'],
  [/(?<=[かまらわれ])ん(?=$|[、。よわで])/g, 'ない'],
  [/けん$/g, 'よ'], [/けん(?=[、。])/g, 'から'],
  // Plain-form question ending 〜ん? (来るん → 来るの)
  [/(?<=[るうくすつぶむぐたい])ん$/g, 'の'],
];

function normalizeDialect(text) {
  let out = text;
  for (const [re, std] of DIALECT) out = out.replace(re, std);
  return out;
}

// ---------- English slang → plain English ----------
// \b word boundaries keep these from matching inside other words.
const SLANG = [
  // Abbreviations people say out loud or that recognizers write out
  [/\bidk\b/gi, "I don't know"], [/\bimo\b/gi, 'in my opinion'], [/\bngl\b/gi, 'honestly'],
  [/\btbh\b/gi, 'to be honest'], [/\bbrb\b/gi, 'be right back'], [/\bomg\b/gi, 'oh my god'],
  [/\blol\b/gi, 'haha'], [/\bfr\b/gi, 'seriously'], [/\bbtw\b/gi, 'by the way'], [/\basap\b/gi, 'as soon as possible'],

  // Phrases
  [/\bno cap\b/gi, 'honestly'], [/\b(that's|that is|is|so) cap\b/gi, '$1 a lie'],
  [/\bfor real\b/gi, 'seriously'], [/\bdeadass\b/gi, 'seriously'],
  [/\bnot gonna lie\b/gi, 'honestly'], [/\bspill the tea\b/gi, 'tell me the gossip'],
  [/\bhit me up\b/gi, 'contact me'], [/\btouch grass\b/gi, 'go outside'],
  [/^(hey,? |yo,? )?(what'?s up|sup|wassup|whaddup)[?!.]?$/gi, '$1how are you?'],
  [/^(hey,? )?how'?s it going[?!.]?$/gi, '$1how are you?'], [/\bno worries\b/gi, 'no problem'], [/\bmy bad\b/gi, 'my mistake'],
  [/\bchill out\b/gi, 'calm down'], [/\b(is|so|pretty|very|really) chill\b/gi, '$1 relaxed'],
  [/\bi'?m down for\b/gi, "I'm willing to do"], [/\bi'?m down\b(?=$|[.,!?])/gi, "I'm in"],
  [/\bgood vibes\b/gi, 'a good atmosphere'], [/\bvibe with\b/gi, 'get along with'],
  [/\bghosted\b/gi, 'stopped replying to'], [/\bi stan\b/gi, "I'm a big fan of"],
  [/^bet[.!]?$/gi, 'Okay, sure.'],
  [/\b(that's|that is|it's|it is|was|so) (lit|fire|sick|dope)\b/gi, '$1 amazing'],
  [/\bslaps\b/gi, 'is great'], [/\bbussin\b/gi, 'really delicious'],
  [/\bslay(ed)?\b/gi, 'did great'], [/\b(is|was|so|kinda|pretty|that's) mid\b/gi, '$1 mediocre'],
  [/\bsalty\b/gi, 'upset'], [/\bsus\b/gi, 'suspicious'], [/\bcringe\b/gi, 'embarrassing'],
  [/\b(i'm|im|i am|was|so|totally) shook\b/gi, '$1 shocked'], [/\brizz\b/gi, 'charm'], [/\bflexing\b/gi, 'showing off'], [/\bflex\b/gi, 'show off'],
  [/\b(so|super|being) extra\b/gi, '$1 over the top'], [/\bthe goat\b/gi, 'the greatest of all time'],
  [/\blowkey\b/gi, 'kind of'], [/\bhighkey\b/gi, 'really'], [/\bhella\b/gi, 'very'],
  [/\bwicked (good|cool|fast|smart)\b/gi, 'very $1'],

  // British / Australian
  [/\binnit\b/gi, "isn't it"], [/\bgutted\b/gi, 'very disappointed'], [/\bknackered\b/gi, 'exhausted'],
  [/\bquid\b/gi, 'pounds'], [/\breckon\b/gi, 'think'], [/\barvo\b/gi, 'afternoon'], [/\bbrekkie\b/gi, 'breakfast'],
  [/\bheaps\b/gi, 'a lot'], [/\bcheers mate\b/gi, 'thanks'], [/\bmate\b/gi, 'friend'],

  // Casual contractions
  [/\bgonna\b/gi, 'going to'], [/\bwanna\b/gi, 'want to'], [/\bgotta\b/gi, 'have to'], [/\bfinna\b/gi, 'going to'],
  [/\bkinda\b/gi, 'kind of'], [/\bsorta\b/gi, 'sort of'], [/\blemme\b/gi, 'let me'], [/\bgimme\b/gi, 'give me'],
  [/\bdunno\b/gi, "don't know"], [/\by'?all\b/gi, 'you all'], [/\bi ain'?t\b/gi, 'I am not'],
  [/\b(cuz|'cause|coz|cos)\b/gi, 'because'], [/\bya\b/gi, 'you'], [/\bbruh\b/gi, 'bro'],
];

function normalizeSlang(text) {
  let out = text;
  for (const [re, std] of SLANG) out = out.replace(re, std);
  return out;
}
