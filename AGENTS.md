# scene-hunter

## plan

プランは `docs/plan/{YYYYMMDD-name}.md` に保存せよ  

## 参照すべきドキュメント

- `docs/architecture.md` にアーキテクチャや技術スタックなどを記載している。特に依存関係は守らなくてはならない  
- `docs/test.md` にテストを書く際の決まり事が書かれている。準拠してテストを書くように  
- `docs/params.md` にこのアプリケーションで利用されている全パラメータの制約条件が記載されている  
- `docs/dict.md` に用語の日英対応を記載している。この辞書に載っている用語と変数名等は一致させるようにせよ  
- `docs/rule.md` にこのゲームのルールを記載している  

## 開発のルール

### server

コード作成後には必ず `task go/check` を行い0 issuesになるまで修正する。また `task go/test` を行いテストが全部通ることも確認せよ  

## レビュー

日本語で簡潔に。レビューの要約は不要。修正が必要な場合は下記を参考に、インラインコメントを作成すること  

```sh
cat > review_comments.json << 'EOF'
{
  "event": "COMMENT",
  "comments": [
    {
      "path": "path/to/file.go",
      "line": 10,
      "body": "Consider this improvement:\n```suggestion\nfunc improvedFunction() {\n    return \"better implementation\"\n}\n```"
    }
  ]
}
EOF
```

```sh
gh api --method POST \
  --header "Accept: application/vnd.github+json" \
  --header "X-GitHub-Api-Version: 2022-11-28" \
  repos/${{ github.repository }}/pulls/${{ github.event.number }}/reviews \
  --input review_comments.json
```
