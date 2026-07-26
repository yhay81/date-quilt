# Privacy

## Schedule data

D1へ予定名、2〜12件の候補日時と長さ、参加者名、○△×の回答、任意コメントを保存します。日程は推測困難な128-bitのURL IDで共有し、公開一覧、sitemap、検索結果へ載せません。

日程と回答は作成から90日後、毎日の期限削除処理で自動削除します。幹事は秘密鍵を使い、それ以前でも日程全体を削除できます。

## Secrets on the device

ブラウザの`localStorage`へ、無作為な匿名セッションID、幹事用秘密鍵、回答編集用秘密鍵を保存します。幹事鍵はURL fragment（`#owner=...`）にも置き、通常のHTTPリクエストや参照元へ送らない構造です。D1には各秘密鍵のSHA-256だけを保存します。

## Anonymous product events

訪問、回答URLコピー、カレンダー追加、別日再訪の操作名、匿名セッションID、対象日程ID、発生日を120日以内保存します。予定名、候補日時、参加者名、コメント、IPアドレス、User-Agentは匿名イベントへ含めません。

## Deletion limits

幹事鍵を失うと、運営者は公開URLだけから正当な幹事か確認できません。共有日程は90日後に自動削除されます。ブラウザ内の鍵と匿名IDはサイトデータ削除で消去できます。

## Contact

- Security: GitHubのprivate vulnerability reporting
- Operator: [yhay81](https://github.com/yhay81)
