# Stack policy

## Date Quilt selection

- Runtime/UI: Cloudflare Workers、Hono、Hono JSX、ブラウザJavaScript、Vite+
- Persistence: 日程・回答・hash化した権限鍵・匿名集計をD1
- Authentication: 不採用。日程ID、幹事鍵、回答編集鍵で権限を分離し、全参加者の登録を避ける
- External services: 確定日は標準ICSを生成し、外部カレンダー権限を要求しない
- Dependencies: 中核機能はWeb標準APIだけで実装し、クライアントライブラリを追加しない

## Common default

- Runtime: Cloudflare Workers。構造化データはD1、blobはprivate R2、非同期処理はQueues/Cron、強い単一性が必要な場合だけDurable Objects。
- HTTP/UI: Hono、Hono JSX、Web標準API。クライアントJavaScriptは主要jobに必要な範囲だけ加える。
- Tooling: Vite+、TypeScript、Oxlint/Oxfmt、Vitest、Wrangler。
- Authentication: 所有者アカウントや長期sessionが必要な場合だけBetter Auth。受取人・回答者など一回利用者へ登録を強制しない。
- Data access: 小さいschemaはDrizzle ORMと手書きSQL migration。検索専用データや外部APIは、D1へ複製する理由を先に定義する。

## Selection rules

- 依存はWorkersで実行できるuniversal ESMまたはWeb API実装を優先する。ブラウザ/CLI向けのNode.js `require`、`fs`、native addonをrequest pathへ持ち込まない。
- QR SVGは`uqr`のようなzero-dependency universal実装を使う。Node.js CLIを同梱する`qrcode`はWorker bundleへ入れない。
- パスワードや共有用合い言葉は平文保存しない。Better Authのscryptを標準にし、Cloudflare Web Cryptoの上限へ合わせるためだけにKDFを弱めない。
- ファイルはmagic bytes、寸法、件数、body sizeを検査し、公開bucket URLではなく認可済みWorker経由で返す。
- 画像変換は、品質と端末負荷が許せばブラウザでサムネイルを生成する。サーバー変換が価値の中心になった時点でCloudflare Images等を比較する。
- 決済、メール、AI、検索、地図は仮説に必要な場合だけ追加する。追加前に失敗条件、費用上限、削除経路を決める。

## Release gate

1. `npm run check`、`npm test`、`npm run build`、依存監査を通す。
2. D1/R2等のbinding、secret、rate limit、Turnstile、期限削除を本番へ設定する。
3. 実URLで登録/ログイン、主要データ作成、閲覧、削除までをsmoke testする。
4. モバイル幅、キーボード、label/landmark、console error、CSPを確認する。
5. ファーストビューが説明用ヒーローではなく実際の操作面であり、見出しを読まなくても用途が分かることを確認する。
6. 検証条件、成功指標、運営判断などのメタ情報がサービス画面へ露出していないことを確認する。
7. 公開リポジトリでCI、private vulnerability reporting、検証Issueを有効にする。
8. `npm run metrics`で登録から中核job完了・再利用まで集計できることを確認する。
9. Open Graph画像、Schema.org情報、canonical URL、`robots.txt`、`sitemap.xml`、IndexNow所有確認ファイルを本番URLで確認する。
10. デプロイ後に`npm run indexnow`を実行し、HTTP 200または202を確認する。
