# Security Policy

## Reporting

脆弱性を公開Issueへ投稿せず、GitHubのprivate vulnerability reportingから報告してください。通常の不具合・改善要望は公開Issueを利用できます。

## Implemented controls

- 128-bitの日程ID、256-bitの幹事鍵・回答編集鍵
- 秘密鍵はD1へSHA-256で保存し、比較時は一定時間の文字列比較を行う
- イベントページは`noindex`、`noarchive`、`Cache-Control: no-store`
- CSP、HSTS、frame拒否、MIME sniffing拒否、Permissions Policy
- JSON content type、body size、same-origin、ID、候補数、日時範囲、文字数、○△×の完全性を検証
- JSXの既定エスケープと、クライアントの`textContent`だけで利用者入力を表示
- 候補日時変更時は該当候補の古い回答を削除し、意味の違う回答を引き継がない
- 毎日のscheduled処理による日程・回答90日、匿名イベント120日の期限削除
- 公開一覧、外部スクリプト、認証Cookie、決済、ファイルアップロードなし

## Known limits

- 回答URLを知る人は参加者名・回答・コメントを閲覧できます。機密予定には使用しないでください。
- 参加者登録がないため、回答URLを知る第三者の新規回答を完全には防げません。既存回答の編集には端末保存の秘密鍵が必要です。
- 幹事鍵を失った場合、運営者が本人確認して編集権限を復元する仕組みはありません。
- 匿名イベントAPIは認証を要求しないため、集計ノイズを完全には防げません。課金や権限判断には使用しません。
