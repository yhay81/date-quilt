# Date Quilt

候補日時と参加者の○△×を色のグリッドで集め、登録なしで日程を決める日本語の日程調整ツールです。

- サービス: <https://date-quilt.yusuke8h.workers.dev>
- プライバシー: <https://date-quilt.yusuke8h.workers.dev/privacy>
- 運用判断: [`EXPERIMENT.md`](EXPERIMENT.md)
- 指標定義: [`METRICS.md`](METRICS.md)

## Product boundary

幹事は2〜12件の候補日時を作り、推測困難な回答URLを共有します。参加者はアカウントなしで名前、○△×、任意コメントを保存でき、幹事は候補編集、日程確定、カレンダー出力、全削除を行えます。

公開イベント一覧、参加者アカウント、メール・LINE自動送信、外部カレンダー権限、決済は扱いません。日程ページは`noindex`で、作成から90日後に自動削除します。

## Local development

```powershell
vp env off
npm ci
npx wrangler d1 migrations apply date-quilt --local
npm run dev
```

## Quality and operations

```powershell
npm run check
npm test
npm run build
npm run release:check
npm run metrics -- -Local
```

本番ではD1 migrationを先に適用し、デプロイ後に公開ページだけをIndexNowへ通知します。共有イベントURLはsitemapへ含めません。

```powershell
npx wrangler d1 migrations apply date-quilt --remote
npm run deploy
npm run indexnow
npm run metrics
```

予定名、参加者名、コメント、秘密鍵、生のイベント行をGitや公開Issueへ保存しないでください。
