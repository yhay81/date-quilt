# Metrics

Date Quiltは参加者登録を要求しません。作成・回答・確定はD1の業務行から集計し、訪問・共有・カレンダー追加だけをブラウザ生成の匿名セッションIDで集計します。

| Stage                            | Source                 | Meaning                      |
| -------------------------------- | ---------------------- | ---------------------------- |
| `users`                          | `visited` event        | 画面を開いた匿名利用者       |
| `schedules_created`              | `schedules`            | 作成された実日程             |
| `shared_schedules`               | `share_copied` event   | 回答URLがコピーされた日程    |
| `responses`                      | `participants`         | 保存された参加者回答         |
| `schedules_with_responses`       | participant集約        | 1人以上が回答した日程        |
| `schedules_with_three_responses` | participant集約        | 3人以上が回答した日程        |
| `finalized`                      | schedule status        | 幹事が日程を確定したイベント |
| `calendar_adds`                  | `calendar_added` event | 確定日ICSを開いた操作        |
| `repeat_organizers`              | creator session集約    | 2件以上の日程を作った幹事    |

## Ratios

- Creation: `schedules_created / users`
- Share: `shared_schedules / schedules_created`
- Response event: `schedules_with_responses / schedules_created`
- Three responses: `schedules_with_three_responses / schedules_created`
- Finalization: `finalized / schedules_with_responses`

## Data contract

- 業務データ: 予定名、候補日時、参加者名、○△×、任意コメント、幹事鍵・回答編集鍵のSHA-256、作成者の匿名セッションID
- 匿名イベント: session ID、操作名、日程ID、発生日
- 保存しない: メールアドレス、電話番号、外部カレンダー、IPアドレス、User-Agent
- 保持: 日程・回答90日、匿名イベント120日
- 公開集計: 個別IDと自由記述を含めず、`npm run metrics`の集計値だけ

## Operator contract

- `npm run metrics`は`generated_at`、`service`、`environment`、`funnel`、`rates`をJSONで返す。
- 分母0の比率は0とし、欠測を成功扱いしない。
- ローカル・本番の手動テスト行を実利用として報告しない。
- 判断条件は[`EXPERIMENT.md`](EXPERIMENT.md)と公開Issueに置き、サービス画面へ載せない。
