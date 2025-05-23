# Scene Hunter - Image Similarity API

## 概要
このプロジェクトは、2つの画像間の類似度を計算するAPIを提供する。`FastAPI`を使用して構築されており、画像のベクトル化と距離計算には`imgsim`ライブラリを使用している。

## アルゴリズムの概要
1. クライアントから送信された2つの画像URLを受け取る。
2. 各画像を指定されたURLからダウンロードし、OpenCVを使用してデコードする。
3. 画像を`256x256`にリサイズ。
4. `imgsim.Vectorizer`を使用して画像をベクトル化。
5. ベクトル間の距離を`imgsim.distance`で計算。
6. 距離に基づいてカスタム減衰関数を適用し、類似度スコアを計算。

## 類似度スコアの計算方法
類似度スコアは以下の手順で計算される：

1. **距離計算**  
   `imgsim.distance`を使用して、2つの画像ベクトル間の距離を計算。

2. **カスタム減衰関数**  
   距離に基づいて以下の減衰関数を適用：
   ```python
   def custom_decay(x):
       n = 2.17  # 減衰の指数
       k = 0.00241  # 減衰のスケール係数
       return math.exp(-k * (x ** n))
    ```
    この関数は、距離が大きいほどスコアが急激に減少するように設計されている。

3. スコア計算
    減衰関数の結果に100を掛けて、最終的な類似度スコアを計算：
    ```python
    score = 100 * custom_decay(dist)
    ```

4. スコアの丸め
    スコアは小数点以下4桁に丸められ、クライアントに返される。

## パラメータ調整
減衰関数のパラメータnとkは、画像の特性や用途に応じて調整可能です。
現在のデフォルト値は以下の通り：
n = 2.17
k = 0.00241
これらの値を変更することで、スコアの感度や減衰の挙動をカスタマイズできる。

## API エンドポイント
`POST /compare`
2つの画像URLを受け取り、類似度スコアを計算する。

リクエスト例
```
{
  "image1_url": "https://example.com/image1.jpg",
  "image2_url": "https://example.com/image2.jpg"
}
```
レスポンス例
```
{
  "similarity_score": 85.4321
}
```

## 使用ライブラリ
* FastAPI
* OpenCV
* imgsim
* NumPy
* Requests

## 注意事項
入力画像はURLで指定する必要がある。
類似度スコアは、画像の内容や解像度に依存する。
パラメータnとkの調整は、精度向上のために重要。