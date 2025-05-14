# Scene Hunter Image Server

画像の最適化とリサイズを行うサーバーです。ファイルアップロードとR2ストレージへの保存をサポートしています。

**サポートされている画像形式**: JPEG, PNG, WebP, AVIF

## ファイルアップロード

multipart/form-dataフォーマットでPOSTリクエストを送信します。

```sh
curl -X POST \
  -F "image=@testdata/test.jpg" \
  -F "filename=scene-hunter/test.jpg" \
  -F "w=800" \
  -F "q=90" \
  -F "f=webp" \
  http://localhost:8787/upload
```

応答として、アップロードされた画像のURLが返されます:

```json
{
  "url": "https://image.scene-hunter.yashikota.com/scene-hunter/test.jpg"
}
```

パラメータ:

- `image`: アップロードする画像ファイル **(必須)**
- `filename`: 保存するファイル名（パスを含む） **(必須)** 
- `w`: 幅（ピクセル）（デフォルト: 1280）
- `q`: 品質（1-100）（デフォルト: 75）
- `f`: フォーマット（jpeg, png, webp, avif）（デフォルト: jpeg）

## 保存済み画像の取得

アップロードされた画像はファイル名を使用して取得できます:

```sh
http://localhost:8787/file/scene-hunter/test.jpg
```

特定のフォーマットを指定して画像を取得:

```sh
http://localhost:8787/file/scene-hunter/test.jpg?f=webp
```

パラメータ:

- `f`: フォーマット（jpeg, png, webp, avif）

## ファイル一覧の取得

バケット内のファイル一覧を取得できます:

```sh
http://localhost:8787/list?bucket=scene-hunter
```

パラメータ:

- `bucket`: バケット名（プレフィックス）

## ファイル削除

ファイルを削除できます:

```sh
curl -X DELETE https://scene-hunter-image.yashikota.workers.dev/file/scene-hunter/test.jpg
```

注意: パスにサブディレクトリが含まれている場合（例: `scene-hunter/hoge/test.jpg`）も正しく動作します。

## バケット削除

バケットプレフィックスを指定して、そのプレフィックスに一致する全てのファイルを削除できます:

```sh
curl -X DELETE https://scene-hunter-image.yashikota.workers.dev/bucket/scene-hunter
```

注意: 
- バケット名にハイフン(`-`)が含まれていても正しく処理されます
- この操作は指定されたプレフィックスに一致する全てのファイルを削除します

## R2操作（Cloudflare Wrangler CLIを使用）

### ファイルのアップロード

```sh
# ローカルバケットにアップロード
wrangler r2 object put testdata/test.jpg --file=testdata/test.jpg

# リモートバケットにアップロード
wrangler r2 object put scene-hunter/test.jpg --file=testdata/test.jpg --remote

# ディレクトリ付きでアップロード
wrangler r2 object put scene-hunter/hoge/test.jpg --file=testdata/test.jpg --remote
```
