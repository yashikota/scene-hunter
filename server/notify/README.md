# Scene Hunter 通知サーバー

## 概要

このプロジェクトは、Cloudflare Workers、Hono、Durable Objectsを使用したWebSocketベースの通知サーバーです。Scene Hunterゲームのイベント通知システムとして機能します。

- サーバーはルームIDごとに部屋を建てる
- 部屋はユーザーが接続した時のみ作成される
- クライアントはルームIDを指定してサーバーに接続する
- 1つの部屋に複数のユーザーが存在できる
- 通信はWebSocketを使用したJSONベース
- ゲームイベント（プレイヤー参加・退出、ラウンド開始・終了など）をリアルタイムに配信

## 開発環境のセットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

## WebSocketテスト方法

### コマンドラインツールを使ったWebSocketテスト

コマンドラインからWebSocketをテストするには、以下のツールが利用できます。

#### websocatを使ったテスト

[websocat](https://github.com/vi/websocat)はRust製の高速なWebSocketクライアントツールです。

##### インストール

```bash
# Homebrewを使用する場合
brew install websocat

# Cargoを使用する場合
cargo install websocat

# aquaを使用する場合
aqua install vi/websocat
```

##### 基本的な使い方

```bash
# 実際のチャットルームに接続
websocat "wss://scene-hunter-notify.yashikota.workers.dev/ws/123456?userId=test-user"
```

#### WebSocketクライアントからのメッセージ送信方法

WebSocketクライアントからメッセージを送信する際は、**1行のJSON形式**で送信する必要があります。複数行のJSONや改行を含むJSONはパースエラーの原因となります。

**正しい送信方法**:

```bash
# 1行のJSON形式で送信（推奨形式）
{"type":"broadcast","content":"こんにちは、全員！"}
```

**代替形式**（後方互換性のためサポート）:

```bash
# event_typeを使用した形式も受け付けます
{"event_type":"chat.message","content":"こんにちは、全員！"}
```

**誤った送信方法**:

```bash
# 複数行のJSONはエラーになります
{
  "type": "broadcast",
  "content": "こんにちは、全員！"
}
```

#### メッセージ送信例

ブロードキャストメッセージ（全員に送信）:

```json
{"type":"broadcast","content":"こんにちは、全員！"}
```

プライベートメッセージ（特定のユーザーに送信）:

```json
{"type":"private","content":"こんにちは！","recipient":"user123"}
```

### ブラウザアプリケーションでの自動再接続

ブラウザアプリケーションでは、WebSocketの再接続ロジックを実装することができます。以下は簡単な再接続の実装例です：

```javascript
function connectWebSocket(roomId, userId) {
  // 本番環境ではwssプロトコルを使用
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}/ws/${roomId}?userId=${encodeURIComponent(userId)}`;
  const ws = new WebSocket(wsUrl);
  
  // 接続が閉じられたときの処理
  ws.onclose = (event) => {
    console.log('WebSocket接続が閉じられました。再接続を試みます...');
    
    // 1秒後に再接続を試みる
    setTimeout(() => {
      connectWebSocket(roomId, userId);
    }, 1000);
  };
  
  // エラー発生時の処理
  ws.onerror = (error) => {
    console.error('WebSocketエラー:', error);
    // エラーが発生した場合は接続を閉じる（oncloseイベントが発生し、再接続が試みられる）
    ws.close();
  };
  
  // その他の必要なイベントハンドラを設定
  ws.onopen = () => {
    console.log('WebSocket接続が確立されました');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('メッセージを受信しました:', data);
    
    // サーバーからのメッセージはevent_typeフィールドを使用
    if (data.event_type) {
      console.log(`イベントタイプ: ${data.event_type}`);
      // イベントタイプに応じた処理を実装
    }
  };
  
  return ws;
}

// 使用例
const ws = connectWebSocket('test-room', 'test-user');

// メッセージ送信例
function sendMessage(ws, content, recipient = null) {
  const message = {
    type: recipient ? 'private' : 'broadcast',
    content: content
  };
  
  if (recipient) {
    message.recipient = recipient;
  }
  
  ws.send(JSON.stringify(message));
}

// 全員にメッセージを送信
sendMessage(ws, 'こんにちは、全員！');

// 特定のユーザーにメッセージを送信
sendMessage(ws, 'こんにちは！', 'user123');
```

この実装では、接続が閉じられたときに自動的に再接続を試みます。実際のアプリケーションでは、指数バックオフなどの再試行戦略を実装して、サーバーに過負荷をかけないようにすることをお勧めします。

## メッセージ形式の詳細

### クライアントからサーバーへのメッセージ形式

クライアントからサーバーへのメッセージは以下の形式で送信します：

```json
{
  "type": "broadcast | private",  // メッセージタイプ（必須）
  "content": "メッセージ内容",     // メッセージ内容（必須）
  "recipient": "user123"         // 受信者ID（typeがprivateの場合のみ必須）
}
```

**注意**: 後方互換性のため、`event_type`フィールドを使用したメッセージも受け付けますが、新しい実装では`type`フィールドの使用を推奨します。

### サーバーからクライアントへのメッセージ形式

サーバーからクライアントへのメッセージは以下の形式で送信されます：

```json
{
  "event_type": "chat.message | room.player_joined | ...",  // イベントタイプ
  "timestamp": "2025-05-17T10:15:30Z",                     // タイムスタンプ
  "content": "メッセージ内容",                              // メッセージ内容（イベントによって異なる）
  "sender": "user123",                                     // 送信者ID（該当する場合）
  "recipient": "user456"                                   // 受信者ID（個別メッセージの場合のみ）
}
```

## APIエンドポイント

### WebSocket接続

```
GET /ws/:roomId?userId={userId}
```

- `:roomId`: ルームID（必須）
- `userId`: ユーザーID（クエリパラメータ、必須）

### イベント送信

```
POST /api/rooms/:roomId/events
```

- `:roomId`: ルームID（必須）
- リクエストボディ: イベントオブジェクト（JSON形式）

例:
```json
{
  "event_type": "room.player_joined",
  "timestamp": "2025-05-04T03:51:00Z",
  "player_id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Player1"
}
```

### イベントを送る方法

```bash
curl -X POST "https://scene-hunter-notify.yashikota.workers.dev/api/rooms/123456/events" --json '{"event_type":"chat.message","content":"こんにちは、全員！"}'
```

### ヘルスチェック

```
GET /health
```

レスポンス例:
```json
{
  "status": "ok"
}
```

## イベントタイプ

サーバーは以下のイベントタイプをサポートしています：

### ゲーム関連イベント

- `room.player_joined`: プレイヤーがルームに参加
- `room.player_left`: プレイヤーがルームから退出
- `room.gamemaster_changed`: ゲームマスターが変更
- `room.connected`: ルームに接続完了（ユーザーリスト情報を含む）
- `game.round_started`: ラウンドが開始
- `game.hint_revealed`: ヒントが公開
- `game.photo_submitted`: 写真が提出
- `game.score_updated`: スコアが更新
- `game.round_ended`: ラウンドが終了
- `game.timer_update`: タイマーが更新

### コミュニケーション関連イベント

- `chat.message`: チャットメッセージ（従来のブロードキャスト/プライベートメッセージ用）
- `system.error`: システムエラーメッセージ

## デプロイ

```bash
# Cloudflare Workersへのデプロイ
npm run deploy
