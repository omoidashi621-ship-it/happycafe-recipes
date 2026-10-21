export const JOBS = [
  { id: 'librarian', name: '司書', icon: '📖', color: '#6fb7a0', desc: '書庫の番人。静かに知識を守る。', emote: '📖' },
  { id: 'mage', name: '魔導士', icon: '🔮', color: '#9a7be0', desc: '星の魔力を操る探究者。', emote: '✨' },
  { id: 'knight', name: '騎士', icon: '🛡️', color: '#c0c8d4', desc: '世界樹を護る誇り高き剣士。', emote: '⚔️' },
  { id: 'alchemist', name: '錬金術師', icon: '⚗️', color: '#e0955a', desc: '素材と叡智を混ぜ合わせる。', emote: '💥' },
  { id: 'bard', name: '吟遊詩人', icon: '🎵', color: '#e06f8f', desc: '物語と歌を紡ぐ旅人。', emote: '🎵' },
];
export const jobById = (id) => JOBS.find((j) => j.id === id) || JOBS[0];
