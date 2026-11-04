# ブラウザとゲームの E2E

`Platform gameplay` は push / PR / 手動実行で、同じゲームテストを次の環境に流す。

| OS | ブラウザ | 端末 |
| --- | --- | --- |
| Linux | Chrome | PC |
| Linux | Firefox | PC |
| Linux | Chromium | Pixel 7 のエミュレーション |
| Windows | Edge | PC |
| Windows | Firefox | PC |
| macOS | Chrome | PC |

ローカル Relay と本物のブラウザを使い、3 人での 3 ラウンド、撮影・アップロード・写真選定・採点・最終結果、および Admin への交代を確認する。
カメラ入力と Cloudflare 専用 API は E2E 用の依存へ置き換える。
Relay は固定バージョンの OS 別バイナリを SHA-256 で検証する。

`Native Safari transport` は手動実行する。
macOS runner の Safari 本体を SafariDriver で操作し、本番の Cloudflare Relay へ接続する。
WebTransport 接続、双方向ストリーム、MoQ 接続、130 秒の送受信と 60 秒ごとの交換を確認した後、3 人・3 ラウンドのゲームを通す。
ゲームのカメラ入力だけを canvas の MediaStream に置き換え、アップロード・AI・採点は本番を使う。
部屋と Relay を作り、AI を呼ぶので通常の PR CI から自動実行しない。

失敗時はスクリーンショット、進行ログ、ブラウザ/OS 別の成果物を GitHub Actions から取得する。
Safari と Playwright WebKit は別の実行環境として扱う。
Android エミュレーションは Android 実機の検証ではなく、macOS Safari は iOS Safari 実機の検証ではない。
