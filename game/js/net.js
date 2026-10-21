// 通信層。main.js はこのインターフェースだけに依存する。
// 後で自前サーバーへ移すときは、同じ形の WebSocketNet を作って createNet() で返すだけ。
//
//   net.id                              自分のID
//   net.join(me)                        参加(me: 自分の状態)
//   net.update(me)                      自分の状態を送る(10Hz程度)
//   net.chat(text)                      チャット送信
//   net.onPlayers(fn(playersById))      他プレイヤー全員の状態が変わったとき
//   net.onChat(fn({id,name,text,t}))    チャット受信
//   net.leave()
import { firebaseConfig } from './firebase-config.js';

const STALE_MS = 3000;

class LocalNet {
  mode = 'local';
  id = 'p' + Math.random().toString(36).slice(2, 9);
  players = new Map();
  constructor() { this.ch = new BroadcastChannel('world-tree-library'); this.seen = new Set(); }
  async join(me) {
    this.me = me;
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (m.id === this.id) return;
      if (m.type === 'state') this.players.set(m.id, { ...m.p, _seen: Date.now() });
      else if (m.type === 'leave') this.players.delete(m.id);
      else if (m.type === 'chat') this.chatFn?.(m.msg);
      this.emit();
    };
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.players) if (now - v._seen > STALE_MS) this.players.delete(k);
      this.emit();
    }, 1000);
    this.update(me);
    addEventListener('pagehide', () => this.leave());
  }
  emit() { const o = {}; for (const [k, v] of this.players) o[k] = v; this.playersFn?.(o); }
  update(me) { this.me = me; this.ch.postMessage({ type: 'state', id: this.id, p: me }); }
  chat(text) {
    const msg = { id: this.id, name: this.me.name, text, t: Date.now() };
    this.ch.postMessage({ type: 'chat', msg });
    this.chatFn?.(msg);
  }
  onPlayers(fn) { this.playersFn = fn; }
  onChat(fn) { this.chatFn = fn; }
  leave() { this.ch.postMessage({ type: 'leave', id: this.id }); clearInterval(this.timer); }
}

class FirebaseNet {
  mode = 'firebase';
  async join(me) {
    const V = '10.12.2';
    const base = `https://www.gstatic.com/firebasejs/${V}/`;
    const [{ initializeApp }, auth, db] = await Promise.all([
      import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-database.js'),
    ]);
    this.db = db;
    const app = initializeApp(firebaseConfig);
    const a = auth.getAuth(app);
    const cred = await auth.signInAnonymously(a);
    this.id = cred.user.uid;
    this.rdb = db.getDatabase(app);
    this.meRef = db.ref(this.rdb, `rooms/library/players/${this.id}`);
    db.onDisconnect(this.meRef).remove();
    this.me = me;
    await db.set(this.meRef, { ...me, t: db.serverTimestamp() });

    db.onValue(db.ref(this.rdb, 'rooms/library/players'), (snap) => {
      const v = snap.val() || {};
      delete v[this.id];
      this.playersFn?.(v);
    });
    const joinedAt = Date.now();
    const chatQ = db.query(db.ref(this.rdb, 'rooms/library/chat'), db.limitToLast(30));
    db.onChildAdded(chatQ, (s) => {
      const m = s.val();
      if (m && m.t >= joinedAt - 5000) this.chatFn?.(m);
    });
  }
  update(me) { this.me = me; if (this.meRef) this.db.set(this.meRef, { ...me, t: this.db.serverTimestamp() }); }
  chat(text) {
    this.db.push(this.db.ref(this.rdb, 'rooms/library/chat'), { id: this.id, name: this.me.name, text, t: Date.now() });
  }
  onPlayers(fn) { this.playersFn = fn; }
  onChat(fn) { this.chatFn = fn; }
  leave() { this.meRef && this.db.remove(this.meRef); }
}

export const isFirebaseConfigured = () => !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;
export const createNet = () => (isFirebaseConfigured() ? new FirebaseNet() : new LocalNet());
