# DB

論物変換ルールは `dict.md` に記載している  

## 禁止ルール

- text型は使わずにvarcharを使う
- check制約は使用しない
- [NULL撲滅委員会](https://mickindex.sakura.ne.jp/database/db_getout_null.html) に従って原則NULLを使用しない
- UUIDはUUID型を使う
- 将来の拡張性のためフラグでもBool型は使わずにvarcharによるstatusなどの管理にする
