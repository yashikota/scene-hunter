# MoQ Relay 検証 (2026-10-17、第2回まで)

Cloudflare MoQ Relay を「1ルーム = 1 Relay」で使えるかの検証コードと結果。
Cloudflare アカウント `scene-hunter`、クライアントは `@moq/net@0.4.3`（IETF moq-transport draft-16）、
ブラウザは Chrome for Testing 151（headless、Linux デスクトップ）。

## 結果サマリ

| 項目 | 結果 | 数値・所見 |
| --- | --- | --- |
| Relay ライフサイクル | △ | 作成 201 / GET / DELETE 200 → GET 404。ただし削除後も旧トークンの**新規接続が約40秒**読める。**既存接続は5分以上**受信し続けた |
| ルーム分離 | ○ | 同じパス名を A・B で使っても混線なし。announce 一覧も Relay ごとに分かれる |
| ブラウザ接続 | △ | デスクトップ Chrome は WebTransport で約40-60ms で接続。**WebSocket（TCP）は 403 / error 1050 で拒否** → WebTransport 非対応のブラウザは繋がらない |
| ゲームイベント | ○（条件付き） | 1メッセージ = 1グループで連打すると欠落（156/200、230/1000）。**1グループに複数フレーム**なら 1000件連打でも全件・順序通り |
| 写真転送 | ○（第2回で原因特定） | 1フレームでの送信は 16MB まで成功。第1回で出た `MALFORMED_TRACK(0x12)` の原因は **@moq/net の Track の `maxAge` 既定値 5000ms**（下記）。`maxAge` を延ばせば複数フレームでも成功する。速度は約 0.55MB/s（手元回線の上り帯域が上限と推定） |
| Relay 作成速度 | ○ | N=100、作成 API p50 1.08s / p95 1.43s、**作成→初回受信 p50 2.31s / p95 2.92s / max 3.29s** |
| 同時ルーム数 | ○ | 10・50・100 並列作成がすべて 201。レート制限なし、削除失敗 0 |
| 複数人接続 | ○ | 2/4/8/16人で全件到達。16人で遅延 p50 7ms / p95 15ms（同一マシン、近くの POP 経由） |
| 切断・復帰 | ○（第2回） | host を SIGKILL すると約11.9秒で announce が消えて検知できる。同じパスへの再 publish では追従が 5回中3回だった。**epoch 方式（下記）では 50/50 回成功、切断→参加者4人全員が snapshot 受信まで p50 0.61s / p95 0.69s / max 0.73s**（新しい host の起動・接続込み、正常切断と SIGKILL を交互） |
| トークンと権限 | ○/△ | subscribe 専用トークンでの publish は届かない。改ざん JWT・ゴミ・トークン無しでもセッションは張れるが、何も読めない。pubsub トークンの参加者が host と同じパスを後から publish しても先着の host が優先された。**追加トークンの有効化に約52秒、失効の反映に約50秒**かかり、失効しても既存接続は切れない（ドキュメント記載どおり） |
| セッションのリクエスト上限 | ✕（第2回で発見） | **1 WebTransport セッションで出せるリクエストは50件**（SUBSCRIBE_NAMESPACE 1 + SUBSCRIBE 49、ID 0〜98）。終わったリクエストがあっても上限は増えず、relay から MAX_REQUEST_ID の引き上げも来なかった。超えるとそれ以上購読できない |
| announce の配送 | △（第2回で発見） | relay が一部の購読者へ PUBLISH_NAMESPACE（announce）を配り損ねることがある（同じ epoch を p0 は受信、p1 は未受信）。announce だけを頼りにすると取りこぼす |
| 未実施 | — | Android Chrome 実機、モバイル回線切替、Workers KV のコード発行、観測性、料金（iOS は対象外） |

## 設計への示唆

1. **Relay は WebTransport しか受け付けない。** WebTransport が無いブラウザは対象外になる（iOS は今回対象外）。
2. **参加者ごとのトークン発行やキックは使えない。** 有効化と失効に約50秒かかり、1 Relay あたりトークンは10個まで（CLI ヘルプに記載）。16人の部屋なら、作成時に発行されるデフォルトの pubsub トークンを全員で共有することになる。キックや権限の判定はアプリ層（host による検証や署名）で行う。
3. **イベントは「長く開いたグループにフレームを追記」で送る。** 途中参加者には relay にキャッシュ済みの最新グループしか届かないので、参加や再接続の時に host が状態のスナップショットを送り直す。
4. **写真は1枚1グループ1フレームで送り、写真用 Track の `maxAge` を最大送信時間より長くする**（例: 60s）。受信側で SHA-256 を照合し、ACK が無ければ提出 ID 付きで再送する。
5. **host の再接続ではパスを変える**（`room/host/<epoch>`）。参加者は announce を待ちつつ、次の epoch（current+1）を announce なしで購読しに行く（500ms→2s のバックオフ）。実装は `client.ts` の `follow`。
7. **リクエスト数を予算管理する。** 1セッション50件までなので、Track は少なく長生きさせる。自分で数えて40件を超えたらセッションを張り直す（約50ms）。ホストが参加者ごとに複数 Track を購読すると、16人部屋ではすぐに上限に達する。
6. **Relay の削除は後始末でしかない。** 削除しても接続は切れないので、ゲーム終了はアプリ層で通知する。

## 第2回の詳細

### `MALFORMED_TRACK` の原因

条件を一つずつ変えて切り分けた（`probe.ts malformed` / `probe.ts moqtail`）。

| 条件 | 結果 |
| --- | --- |
| 基準: 1MB/64KB → 5MB/64KB（同じ Track） | 失敗（約5.6秒、51フレーム目付近） |
| TIMESTAMP 拡張なし | 失敗 → タイムスタンプは無関係 |
| 前の写真が1フレーム | 失敗 → 前のグループの構造は無関係 |
| 別 Track に分ける / 10秒空ける / フレームを100ms間隔で書く | 成功 |
| 1フレームのグループ × 100 / 小さい複数フレーム × 2 | 成功 |
| **publisher を moqtail 0.12.1 に替える**（同じ relay・購読側） | **成功**（2回繰り返しても失敗しない） |
| **@moq/net の `maxAge` を 60000ms にする** | **成功**（既定に戻すと3パターンとも再現） |

@moq/net は Track ごとに `maxAge`（既定 `DEFAULT_MAX_AGE_MS = 5000`）を持ち、期限内に閉じなかったグループを publisher 自身が `TooFarBehind` で破棄する。
draft-16 には TOO_FAR_BEHIND が無いので、upstream には INTERNAL_ERROR でストリームリセットが送られ、relay はそれを購読側に MALFORMED_TRACK として伝えていた。
relay のバグではない。

### セッションのリクエスト上限

`probe.ts reqlimit`: 存在しないパスへの SUBSCRIBE を繰り返すと、49件目（request ID 98）で返事が来た後、ライブラリが次のリクエストを出さなくなる。
epoch テストで全参加者が同時に止まったのはこれが原因で、セッションを張り直す処理を入れたら 50/50 回成功した（各参加者106リクエスト、張り直し2回）。

## 実行方法

```bash
bun install && bun build client.ts --outdir dist --target browser
export CLOUDFLARE_ACCOUNT_ID=<scene-hunter のアカウント ID>
cf realtime moq relays list >/dev/null   # OAuth トークンを更新（cfapi.ts は cf の認証情報を流用する）

# probe.ts / run.ts は RELAY_DIR に relay-A.json / relay-B.json が必要
cf realtime moq relays create --name sh-verify-A > $RELAY_DIR/relay-A.json
cf realtime moq relays create --name sh-verify-B > $RELAY_DIR/relay-B.json
RELAY_DIR=... node run.ts                                     # P0 一括（初期版）
RELAY_DIR=... node probe.ts token hijack order blob fanout reconnect late malformed moqtail reqlimit epoch
node lifecycle.ts lifecycle speed bulk                        # Relay の作成と削除は自動で行う
```

- `client.ts`: ブラウザ内で動くテストクライアント（`window.T`）
- `client-mt.ts`: 比較用の moqtail publisher（`window.MT`）
- `lib.ts`: Playwright で別々のブラウザコンテキスト（= 別端末相当）を操作する共通処理
- `cfapi.ts`: MoQ Relay API の薄いラッパー
