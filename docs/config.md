# config

config用ファイルとして `.env` と `config.toml` の2つを使用している。  

- `.env` は Docker Compose用のファイルでDBパスワードなどを生成して記入している。セットアップ時に自動で生成されるため触る必要はない  
- `config.toml` はサーバーアプリケーション内で使用するDBのURLなどを記述している設定ファイル。`server/config.toml`にある。  
