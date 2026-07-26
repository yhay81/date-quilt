# Decisions

## 2026-07-26 — Public usage pilot

- Status: advanced
- Evidence: 大規模な現行需要に加え、同日複数時間帯、候補の直接編集、スマホ一覧性、編集権限復旧への具体的な不満がある
- Decision: 登録不要の日程作成・回答・集計・確定を30日間公開する
- Contradicting evidence: 調整さんと伝助は無料・低摩擦・高認知で、現行サービスも継続改善している
- Next review: 2026-08-25

## 2026-07-26 — Secrets instead of accounts

- Decision: Better Authを追加せず、公開URL、幹事鍵、回答編集鍵を分離する
- Reason: 参加者登録は回答率を下げる。日程単位の秘密鍵なら中核作業を登録なしで完了できる
- Mitigation: 256-bit鍵、D1にはhashだけ保存、幹事鍵はURL fragment、90日自動削除
- Revisit when: 複数端末のイベント一覧、組織管理、長期履歴への実利用要求が確認されたとき

## 2026-07-26 — Candidate edits invalidate only affected votes

- Decision: 候補日時を直接変更できるが、その候補に付いた既存回答だけを未回答へ戻す
- Reason: 意味が変わった日時へ古い○△×を引き継ぐと、見た目は便利でも集計結果が不正確になる
