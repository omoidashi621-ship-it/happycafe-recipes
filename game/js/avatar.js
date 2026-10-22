// アバターの共通データ(色・髪型・表情)。絵そのものは pixel.js(ドット絵)と portrait.js(顔のアップ)で描く。

export const SKINS = ['#fde3cf', '#f6cba6', '#dba679', '#a56f4a'];
export const HAIR_COLORS = ['#3a2a20', '#8a5530', '#e2bc62', '#d2506e', '#5b82e0', '#eef1f5', '#4cbf94'];
export const OUTFITS = ['#4a78c2', '#c24f48', '#46a46c', '#8f60c2', '#dcaa40', '#555b68'];
export const EYE_COLORS = ['#7a4a2a', '#3f84dd', '#3fae72', '#9460c8', '#d85a62', '#2f3340', '#d9a53a'];
export const HAIR_STYLES = ['ショート', 'ロング', 'おだんご', 'ツイン', 'ポニー'];

export const FACES = [
  { id: 'normal', label: '通常', icon: '😐' },
  { id: 'smile', label: 'にっこり', icon: '😊' },
  { id: 'laugh', label: '大笑い', icon: '😆' },
  { id: 'angry', label: '怒り', icon: '😠' },
  { id: 'sad', label: '悲しい', icon: '😢' },
  { id: 'surprise', label: '驚き', icon: '😲' },
  { id: 'wink', label: 'ウィンク', icon: '😉' },
  { id: 'love', label: 'ハート', icon: '😍' },
  { id: 'sleepy', label: 'ねむい', icon: '😴' },
  { id: 'shy', label: '照れ', icon: '😳' },
];

// 首ふり・うなずきの動作
export const GESTURES = [
  { id: 'shake', label: '首をふる(Q)', icon: '🙅' },
  { id: 'nod', label: 'うなずく(E)', icon: '🙆' },
];
export const GESTURE_MS = 1300;

export const defaultLook = () => ({ skin: 0, hairStyle: 0, hair: 0, outfit: 0, eyes: 0 });

// 顔のアップ用の表情パラメータ
// eye: 目の種類 / open: まぶたの開き / tilt: まぶたの傾き(+怒り -悲しみ) / iris: 瞳の大きさ
// brow: [上下, 角度(+で内側が下がる)] / mouth: 口 / blush: 頬の赤み / look: 視線 / fx: 演出
export const FACE_DEF = {
  normal: { eye: 'open', open: 1, tilt: 0, iris: 1, brow: [0, 0], mouth: 'smile', blush: 0.3 },
  smile: { eye: 'open', open: 0.86, tilt: -0.05, iris: 1.05, brow: [-2, -0.08], mouth: 'grin', blush: 0.6 },
  laugh: { eye: 'arc', open: 0, brow: [-5, -0.12], mouth: 'laugh', blush: 0.85, fx: ['sparkle'] },
  angry: { eye: 'open', open: 0.82, tilt: 0.7, iris: 0.92, brow: [3, 0.55], mouth: 'frown', blush: 0, fx: ['vein'] },
  sad: { eye: 'open', open: 1, tilt: -0.55, iris: 1.12, brow: [-2, -0.5], mouth: 'frown', blush: 0.1, look: [0, 2], fx: ['tear'] },
  surprise: { eye: 'open', open: 1.12, tilt: 0, iris: 0.7, brow: [-8, -0.04], mouth: 'o', blush: 0.1, fx: ['sweat'] },
  wink: { eye: 'wink', open: 1, tilt: 0, iris: 1, brow: [-2, -0.06], mouth: 'grin', blush: 0.5, fx: ['sparkle'] },
  love: { eye: 'heart', open: 1, brow: [-3, -0.1], mouth: 'smile', blush: 1, fx: ['hearts'] },
  sleepy: { eye: 'open', open: 0.32, tilt: -0.22, iris: 1, brow: [-1, -0.18], mouth: 'flat', blush: 0.25, fx: ['zzz'] },
  shy: { eye: 'open', open: 0.85, tilt: -0.25, iris: 0.95, brow: [-1, -0.32], mouth: 'wavy', blush: 1, look: [-4, 3], fx: ['sweat', 'shy'] },
};

// まばたき(0..1: 1 で完全に閉じる)。seed で人ごとにタイミングをずらす
export function blinkAmount(t, seed = 0) {
  const c = (t + seed * 7) % 3.7;
  return c < 0.16 ? Math.sin((c / 0.16) * Math.PI) : 0;
}

// 表情が変わった直後の「ぽよん」(1 前後)
export function popScale(faceAge) {
  return 1 + Math.max(0, 0.08 * Math.exp(-faceAge * 7) * Math.cos(faceAge * 20));
}

// 首ふり・うなずきの進み具合から、頭の動きを返す(shake: 横の揺れ -1..1, nod: 縦の動き 0..1)
export function gestureMotion(type, age) {
  if (!type || age < 0 || age > GESTURE_MS / 1000) return { shake: 0, nod: 0 };
  const u = age / (GESTURE_MS / 1000), decay = 1 - u * 0.35;
  if (type === 'shake') return { shake: Math.sin(u * Math.PI * 6) * decay, nod: 0 };
  return { shake: 0, nod: Math.abs(Math.sin(u * Math.PI * 3)) * decay };
}

// チャットの文面から表情を推測する(なければ null)
export function faceFromText(text) {
  const rules = [
    ['love', /[♡❤♥💕]|好き|だいすき|愛してる/],
    ['angry', /怒|むかつ|ムカ|ふざけ|ぷんぷん|💢/],
    ['sad', /悲し|かなし|泣|ぐすん|しょんぼり|涙|うぅ|;;|T_T/],
    ['laugh', /笑|[wｗ]{2,}|草|あはは|ははは|うける|😆|😂/],
    ['shy', /照れ|てれ|はずかし|恥ず|えへへ|\/\/\//],
    ['sleepy', /ねむ|眠|zzz|おやすみ|すやすや/i],
    ['wink', /ウィンク|☆|★|\(\^_-\)|;\)/],
    ['smile', /ありがと|よろしく|こんにちは|こんばんは|おはよう|嬉し|うれし|楽し|たのし|やった|いいね|♪|\^\^|:\)/],
    ['surprise', /[!！]{2,}|[?？]{2,}|えっ|びっくり|驚|うそ|まじか/],
    ['smile', /[!！]$/],
  ];
  for (const [id, re] of rules) if (re.test(text)) return id;
  return null;
}
