# 世界樹の図書館

ブラウザで遊ぶ、みんなで集まれる異世界の図書館(試作版)。
アバター選択 → ジョブ選択 → 図書館を移動 → 同時ログイン中の人とチャット。

## 試す(ローカルモード)

```
cd game
python3 -m http.server 8000
```
`http://localhost:8000` を開く。ローカルモードでは**同じブラウザの別タブ同士**だけが見えます。

## みんなで遊ぶ(Firebase)

1. https://console.firebase.google.com でプロジェクトを作成(無料の Spark プラン)
2. 「Authentication」→「Sign-in method」→ **匿名** を有効化
3. 「Realtime Database」→ データベースを作成(リージョンは asia-southeast1 など)
4. 「Realtime Database」→「ルール」に `database.rules.json` の内容を貼って公開
5. プロジェクトの設定 → 「マイアプリ」→ ウェブアプリを追加し、表示された設定値を `js/firebase-config.js` に貼る(`databaseURL` も必須)
6. 公開: `npm i -g firebase-tools` → `firebase login` → `firebase init hosting`(公開ディレクトリは `game`)→ `firebase deploy`

## 構成

| ファイル | 役割 |
|---|---|
| `js/main.js` | 画面遷移、入力、描画ループ、チャット |
| `js/net.js` | 通信層。`LocalNet` / `FirebaseNet`。自前サーバーに移すときはここだけ差し替える |
| `js/world.js` | マップ、当たり判定、魔法陣(ミニゲーム入口) |
| `js/avatar.js` | アバター描画 |
| `js/jobs.js` | ジョブ定義 |

## 次の予定

- ミニゲーム用の部屋と、最初の1本
- BGM、ジョブごとのスキル/演出
- 自前サーバー(WebSocket)への移行
