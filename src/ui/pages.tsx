import { product } from "../config/product";
import { Layout } from "./layout";

export function HomePage() {
  return (
    <Layout>
      <section class="composer" id="create">
        <header class="composer-heading">
          <div>
            <p class="eyebrow">NEW SCHEDULE</p>
            <h1>{product.headline}</h1>
          </div>
          <div class="status-key" aria-label="回答記号">
            <span data-status="yes">○ 参加</span>
            <span data-status="maybe">△ 未定</span>
            <span data-status="no">× 不参加</span>
          </div>
        </header>

        <div class="composer-grid">
          <form class="create-panel" id="create-form">
            <section class="panel-section">
              <div class="section-title">
                <span>01</span>
                <label for="schedule-title">予定の名前</label>
              </div>
              <input
                autocomplete="off"
                id="schedule-title"
                maxlength={80}
                placeholder="8月の練習日"
                required
                type="text"
              />
            </section>

            <section class="panel-section">
              <div class="section-title candidate-title">
                <div>
                  <span>02</span>
                  <h2>候補日時</h2>
                </div>
                <span class="candidate-count" id="candidate-count">
                  0 / 12
                </span>
              </div>
              <div class="preset-row" aria-label="候補日のひな形">
                <button data-preset="weekday" type="button">
                  平日 19:00
                </button>
                <button data-preset="weekend" type="button">
                  次の土日 14:00
                </button>
                <button data-add-slot type="button">
                  ＋ 候補を追加
                </button>
              </div>
              <div class="candidate-editor" id="candidate-editor"></div>
            </section>

            <div class="create-actions">
              <button class="button primary" id="create-button" type="submit">
                <span aria-hidden="true">↗</span>
                回答URLをつくる
              </button>
              <p>
                登録不要
                <span aria-hidden="true">•</span>
                90日後に自動削除
              </p>
            </div>
            <p class="action-status" id="create-status" aria-live="polite"></p>
          </form>

          <aside class="quilt-preview" aria-label="回答表のプレビュー">
            <div class="preview-toolbar">
              <span>
                <i aria-hidden="true"></i>
                AVAILABILITY
              </span>
              <span id="preview-count">0候補</span>
            </div>
            <div class="preview-card">
              <div class="preview-head">
                <span>候補日時</span>
                <span class="person-dot">あ</span>
                <span class="person-dot muted">友</span>
                <span class="person-dot muted">仲</span>
              </div>
              <div class="preview-rows" id="preview-rows"></div>
            </div>
            <div class="preview-foot">
              <div class="mini-score">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <p>共有すると、みんなの回答が色で重なります。</p>
            </div>
          </aside>
        </div>
      </section>
      <script src="/create.js" type="module"></script>
    </Layout>
  );
}

export function SchedulePage({ scheduleId, title }: { scheduleId: string; title: string }) {
  const canonical = `${product.url}/e/${scheduleId}`;
  return (
    <Layout canonical={canonical} noindex title={`${title} | ${product.name}`}>
      <section class="schedule-app" data-schedule-id={scheduleId} id="schedule-app">
        <header class="schedule-heading">
          <div>
            <p class="eyebrow">AVAILABILITY QUILT</p>
            <h1>{title}</h1>
          </div>
          <div class="schedule-actions">
            <span class="event-state" id="event-state">
              回答受付中
            </span>
            <button class="button compact" id="copy-link-button" type="button">
              回答URLをコピー
            </button>
          </div>
        </header>

        <div class="schedule-grid">
          <section class="results-panel">
            <div class="results-toolbar">
              <div>
                <span>候補日のまとまり</span>
                <strong id="response-count">0人</strong>
              </div>
              <div class="status-key small">
                <span data-status="yes">○</span>
                <span data-status="maybe">△</span>
                <span data-status="no">×</span>
              </div>
            </div>
            <div class="ranked-slots" id="ranked-slots" aria-live="polite"></div>
            <div class="response-matrix-wrap">
              <div class="response-matrix" id="response-matrix"></div>
            </div>
          </section>

          <aside class="response-panel">
            <div class="response-panel-heading">
              <span class="person-dot">あ</span>
              <div>
                <p class="eyebrow">YOUR RESPONSE</p>
                <h2>あなたの予定</h2>
              </div>
            </div>
            <form id="response-form">
              <label class="field">
                <span>名前</span>
                <input
                  autocomplete="name"
                  id="participant-name"
                  maxlength={30}
                  placeholder="あおい"
                  required
                  type="text"
                />
              </label>
              <div class="vote-editor" id="vote-editor"></div>
              <label class="field">
                <span>
                  ひとこと <small>任意</small>
                </span>
                <textarea
                  id="participant-comment"
                  maxlength={120}
                  placeholder="20時以降なら参加できます"
                  rows={2}
                ></textarea>
              </label>
              <button class="button primary" id="response-button" type="submit">
                回答を保存
              </button>
              <p class="action-status" id="response-status" aria-live="polite"></p>
            </form>
          </aside>
        </div>

        <section class="owner-panel" hidden id="owner-panel">
          <div>
            <p class="eyebrow">ORGANIZER TOOLS</p>
            <h2>幹事メニュー</h2>
          </div>
          <div class="owner-actions">
            <button class="button compact" id="edit-schedule-button" type="button">
              候補を編集
            </button>
            <button class="button compact" id="copy-owner-link-button" type="button">
              幹事リンクをコピー
            </button>
            <button class="text-button danger" id="delete-schedule-button" type="button">
              この日程を削除
            </button>
          </div>
        </section>

        <dialog id="edit-dialog">
          <form id="edit-form" method="dialog">
            <div class="dialog-heading">
              <div>
                <p class="eyebrow">EDIT SCHEDULE</p>
                <h2>候補日時を編集</h2>
              </div>
              <button aria-label="閉じる" class="dialog-close" value="cancel">
                ×
              </button>
            </div>
            <label class="field">
              <span>予定の名前</span>
              <input id="edit-title" maxlength={80} required type="text" />
            </label>
            <div class="candidate-editor" id="edit-candidate-editor"></div>
            <button data-edit-add-slot type="button">
              ＋ 候補を追加
            </button>
            <p class="edit-note">
              日時を変更した候補の回答だけ未回答へ戻ります。削除した候補の回答は復元できません。
            </p>
            <div class="dialog-actions">
              <button class="button compact" value="cancel">
                キャンセル
              </button>
              <button class="button primary compact" id="save-edit-button" value="default">
                変更を保存
              </button>
            </div>
            <p class="action-status" id="edit-status" aria-live="polite"></p>
          </form>
        </dialog>
      </section>
      <script src="/event.js" type="module"></script>
    </Layout>
  );
}

export function PrivacyPage() {
  return (
    <Layout title={`プライバシー | ${product.name}`}>
      <article class="prose">
        <p class="eyebrow">PRIVACY</p>
        <h1>予定は、共有した人の間だけに。</h1>
        <section>
          <h2>日程ページに保存する情報</h2>
          <p>
            予定名、候補日時、参加者名、○△×の回答、任意コメントをD1へ保存します。
            日程ページは推測しにくいURLで共有し、公開一覧や検索結果へ掲載しません。
          </p>
        </section>
        <section>
          <h2>端末に保存する情報</h2>
          <p>
            無作為な匿名セッションID、幹事用の秘密鍵、回答を再編集するための秘密鍵をブラウザのlocalStorageへ保存します。
            幹事用の秘密鍵はURLの#以降にも置くため、通常のHTTPリクエストや検索エンジンへ送られません。
          </p>
        </section>
        <section>
          <h2>保持と削除</h2>
          <p>
            日程と回答は作成から90日後に自動削除します。幹事はそれ以前でも日程全体を削除できます。
            品質改善用の匿名操作イベントは120日以内に削除し、予定名、候補日時、参加者名、コメント、IPアドレスを含めません。
          </p>
        </section>
      </article>
    </Layout>
  );
}

export function MissingSchedulePage() {
  return (
    <Layout noindex title={`日程が見つかりません | ${product.name}`}>
      <article class="missing-card">
        <div class="missing-quilt" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </div>
        <h1>この日程は見つかりません。</h1>
        <p>URLが違うか、幹事によって削除されたか、90日の保存期限を過ぎています。</p>
        <a class="button primary compact" href="/">
          新しい日程をつくる
        </a>
      </article>
    </Layout>
  );
}
