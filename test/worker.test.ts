import { beforeEach, describe, expect, it, vi } from "vitest";

import { app, type Bindings } from "../src/worker";

const scheduleId = "a".repeat(32);
const candidateOneId = "b".repeat(32);
const candidateTwoId = "c".repeat(32);
const sessionId = "7c0dbe70-8c47-4fc0-aa62-52427133c612";

type MockState = {
  candidates?: Array<{
    duration_minutes: number;
    id: string;
    position: number;
    starts_at: string;
  }>;
  participants?: Array<{ comment: string; id: string; name: string }>;
  schedule?: {
    creator_session_id: string;
    expires_at: number;
    finalized_candidate_id: string | null;
    id: string;
    owner_token_hash: string;
    status: "finalized" | "open";
    title: string;
  } | null;
  votes?: Array<{
    candidate_id: string;
    participant_id: string;
    status: "maybe" | "no" | "yes";
  }>;
};

const makeBindings = (state: MockState = {}) => {
  const calls: Array<{ arguments: unknown[]; sql: string }> = [];
  const batch = vi.fn(() => Promise.resolve([]));
  const prepare = vi.fn((sql: string) => {
    const call = { arguments: [] as unknown[], sql };
    calls.push(call);
    const statement = {
      all: vi.fn(async () => {
        if (sql.includes("FROM candidate_slots WHERE schedule_id")) {
          return { results: state.candidates ?? [] };
        }
        if (sql.includes("FROM participants WHERE schedule_id")) {
          return { results: state.participants ?? [] };
        }
        if (sql.includes("FROM availability")) {
          return { results: state.votes ?? [] };
        }
        return { results: [] };
      }),
      bind: vi.fn((...arguments_: unknown[]) => {
        call.arguments = arguments_;
        return statement;
      }),
      first: vi.fn(async () => {
        if (sql.includes("FROM schedules")) {
          return state.schedule ?? null;
        }
        if (sql.includes("FROM candidate_slots")) {
          return state.candidates?.[0] ?? null;
        }
        return null;
      }),
      run: vi.fn(() => Promise.resolve({ success: true })),
    };
    return statement;
  });
  return {
    batch,
    bindings: {
      ASSETS: {
        fetch: () => Promise.resolve(new Response("not used")),
      },
      DB: {
        batch,
        prepare,
      },
    } as unknown as Bindings,
    calls,
    prepare,
  };
};

const defaultState = (): MockState => ({
  candidates: [
    {
      duration_minutes: 120,
      id: candidateOneId,
      position: 0,
      starts_at: "2026-08-01T19:00",
    },
    {
      duration_minutes: 120,
      id: candidateTwoId,
      position: 1,
      starts_at: "2026-08-02T19:00",
    },
  ],
  participants: [],
  schedule: {
    creator_session_id: sessionId,
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    finalized_candidate_id: null,
    id: scheduleId,
    owner_token_hash: "0".repeat(64),
    status: "open",
    title: "8月の練習日",
  },
  votes: [],
});

describe("worker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the compact product-specific scheduling workspace", async () => {
    const { bindings } = makeBindings();
    const response = await app.request("/", undefined, bindings);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(html).toContain('lang="ja"');
    expect(html).toContain('itemtype="https://schema.org/WebApplication"');
    expect(html).toContain("みんなの空きを、ひと目で。");
    expect(html).toContain('id="create-form"');
    expect(html).toContain('id="candidate-editor"');
    expect(html).toContain('class="quilt-preview"');
    expect(html).not.toContain("data-template-surface");
    expect(html).not.toContain('class="hero"');
    expect(html).not.toContain("PUBLIC VALIDATION");
    expect(html).not.toContain("成功条件");
  });

  it("renders a noindex schedule page only for a live unguessable id", async () => {
    const { bindings } = makeBindings(defaultState());
    const response = await app.request(`/e/${scheduleId}`, undefined, bindings);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(html).toContain("8月の練習日");
    expect(html).toContain(`data-schedule-id="${scheduleId}"`);
    expect(html).toContain('id="response-form"');
    expect(html).toContain('id="owner-panel"');
  });

  it("returns a private missing page for expired or unknown schedules", async () => {
    const { bindings } = makeBindings({ schedule: null });
    const response = await app.request(`/e/${scheduleId}`, undefined, bindings);
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain("この日程は見つかりません");
    expect(html).toContain('content="noindex,nofollow,noarchive"');
  });

  it("creates a schedule with a separate owner secret", async () => {
    const { batch, bindings, calls } = makeBindings();
    const response = await app.request(
      "/api/schedules",
      {
        body: JSON.stringify({
          candidates: [
            { durationMinutes: 120, startsAt: "2026-08-01T19:00" },
            { durationMinutes: 120, startsAt: "2026-08-02T19:00" },
          ],
          sessionId,
          title: "8月の練習日",
        }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      },
      bindings,
    );
    const body = await response.json<{ ownerToken: string; scheduleId: string }>();

    expect(response.status).toBe(201);
    expect(body.scheduleId).toMatch(/^[0-9a-f]{32}$/);
    expect(body.ownerToken).toMatch(/^[0-9a-f]{64}$/);
    expect(batch).toHaveBeenCalledTimes(2);
    expect(calls.some((call) => call.sql.includes("INSERT INTO schedules"))).toBe(true);
    expect(calls.filter((call) => call.sql.includes("INSERT INTO candidate_slots"))).toHaveLength(
      2,
    );
  });

  it("rejects malformed or cross-site schedule creation", async () => {
    const { batch, bindings } = makeBindings();
    const invalid = await app.request(
      "/api/schedules",
      {
        body: JSON.stringify({
          candidates: [{ durationMinutes: 120, startsAt: "2026-08-01T19:00" }],
          sessionId,
          title: "候補不足",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
      bindings,
    );
    const crossSite = await app.request(
      "/api/schedules",
      {
        body: "{}",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
        },
        method: "POST",
      },
      bindings,
    );

    expect(invalid.status).toBe(400);
    expect(crossSite.status).toBe(403);
    expect(batch).not.toHaveBeenCalled();
  });

  it("returns the response matrix without edit secrets", async () => {
    const state = defaultState();
    state.participants = [
      {
        comment: "20時以降なら参加できます",
        id: "d".repeat(32),
        name: "あおい",
      },
    ];
    state.votes = [
      {
        candidate_id: candidateOneId,
        participant_id: "d".repeat(32),
        status: "yes",
      },
    ];
    const { bindings } = makeBindings(state);
    const response = await app.request(`/api/schedules/${scheduleId}`, undefined, bindings);
    const body = await response.json<{
      participants: Array<{ editToken?: string; name: string }>;
    }>();

    expect(response.status).toBe(200);
    expect(body.participants).toHaveLength(1);
    expect(body.participants.at(0)?.name).toBe("あおい");
    expect(body.participants.at(0)).not.toHaveProperty("editToken");
  });

  it("stores a complete anonymous participant response", async () => {
    const { batch, bindings, calls } = makeBindings(defaultState());
    const response = await app.request(
      `/api/schedules/${scheduleId}/responses`,
      {
        body: JSON.stringify({
          comment: "20時以降なら参加できます",
          name: "あおい",
          sessionId,
          votes: [
            { candidateId: candidateOneId, status: "yes" },
            { candidateId: candidateTwoId, status: "maybe" },
          ],
        }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      },
      bindings,
    );
    const body = await response.json<{ editToken: string; participantId: string }>();

    expect(response.status).toBe(200);
    expect(body.participantId).toMatch(/^[0-9a-f]{32}$/);
    expect(body.editToken).toMatch(/^[0-9a-f]{64}$/);
    expect(batch).toHaveBeenCalledOnce();
    expect(calls.some((call) => call.sql.includes("INSERT INTO participants"))).toBe(true);
    expect(calls.filter((call) => call.sql.includes("INSERT INTO availability"))).toHaveLength(2);
  });

  it("documents the actual data and deletion boundary", async () => {
    const { bindings } = makeBindings();
    const response = await app.request("/privacy", undefined, bindings);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("推測しにくいURL");
    expect(html).toContain("localStorage");
    expect(html).toContain("90日後");
    expect(html).toContain("120日以内");
  });

  it("exposes health without leaking exception details", async () => {
    const { bindings } = makeBindings();
    const health = await app.request("/healthz", undefined, bindings);
    const missing = await app.request("/missing", undefined, bindings);
    const body = await missing.json<{ error: string; requestId: string }>();

    expect(health.status).toBe(200);
    expect(missing.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(body.requestId).toBeTruthy();
  });
});
