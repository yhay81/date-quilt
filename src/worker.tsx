import { Hono } from "hono";
import type { Context } from "hono";
import { requestId } from "hono/request-id";

import { securityHeaders } from "./middleware/security";
import { HomePage, MissingSchedulePage, PrivacyPage, SchedulePage } from "./ui/pages";

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
};

type AppContext = Context<{ Bindings: Bindings }>;

type CandidateInput = {
  durationMinutes: number;
  id: string | null;
  startsAt: string;
};

type ScheduleRow = {
  creator_session_id: string;
  expires_at: number;
  finalized_candidate_id: string | null;
  id: string;
  owner_token_hash: string;
  status: "finalized" | "open";
  title: string;
};

type CandidateRow = {
  duration_minutes: number;
  id: string;
  position: number;
  starts_at: string;
};

type ParticipantRow = {
  comment: string;
  id: string;
  name: string;
};

type VoteRow = {
  candidate_id: string;
  participant_id: string;
  status: "maybe" | "no" | "yes";
};

class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409 | 413 | 415,
  ) {
    super(code);
  }
}

const app = new Hono<{ Bindings: Bindings }>();
const idPattern = /^[0-9a-f]{32}$/i;
const secretPattern = /^[0-9a-f]{64}$/i;
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const startPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const durationValues = new Set([60, 90, 120, 180, 240, 480]);
const voteStatuses = new Set(["yes", "maybe", "no"]);
const telemetryNames = new Set(["visited", "share_copied", "calendar_added", "returned"]);

const randomHex = (byteLength: number) => {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sameHash = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const cleanup = (db: D1Database) =>
  db.batch([
    db.prepare("DELETE FROM schedules WHERE expires_at <= unixepoch()"),
    db.prepare("DELETE FROM product_events WHERE created_at < unixepoch() - (120 * 86400)"),
  ]);

const enforceSameOrigin = (c: AppContext) => {
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    throw new ApiError("cross_site_request", 403);
  }
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) {
    throw new ApiError("cross_site_request", 403);
  }
};

const parseJson = async (c: AppContext, maximumBytes: number) => {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError("unsupported_media_type", 415);
  }
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (contentLength > maximumBytes) {
    throw new ApiError("payload_too_large", 413);
  }
  const rawBody = await c.req.text();
  if (new TextEncoder().encode(rawBody).byteLength > maximumBytes) {
    throw new ApiError("payload_too_large", 413);
  }
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new ApiError("invalid_json", 400);
  }
};

const cleanText = (value: unknown, maximumLength: number) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.replaceAll(/\s+/g, " ").trim().slice(0, maximumLength);
};

const validateCandidates = (value: unknown, allowIds: boolean): CandidateInput[] => {
  if (!Array.isArray(value) || value.length < 2 || value.length > 12) {
    throw new ApiError("invalid_candidates", 400);
  }
  const starts = new Set<string>();
  const now = Date.now();
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new ApiError("invalid_candidates", 400);
    }
    const source = candidate as Record<string, unknown>;
    const startsAt = typeof source.startsAt === "string" ? source.startsAt : "";
    const durationMinutes = Number(source.durationMinutes);
    const id =
      allowIds && typeof source.id === "string" && idPattern.test(source.id) ? source.id : null;
    const timestamp = Date.parse(`${startsAt}:00+09:00`);
    if (
      !startPattern.test(startsAt) ||
      Number.isNaN(timestamp) ||
      timestamp < now - 90 * 86_400_000 ||
      timestamp > now + 366 * 86_400_000 ||
      !durationValues.has(durationMinutes) ||
      starts.has(startsAt)
    ) {
      throw new ApiError("invalid_candidates", 400);
    }
    starts.add(startsAt);
    return { durationMinutes, id, startsAt };
  });
};

const getSchedule = (db: D1Database, scheduleId: string) =>
  db
    .prepare(
      `SELECT id, owner_token_hash, creator_session_id, title, status,
        finalized_candidate_id, expires_at
       FROM schedules
       WHERE id = ? AND expires_at > unixepoch()`,
    )
    .bind(scheduleId)
    .first<ScheduleRow>();

const ownerTokenFrom = (c: AppContext) => {
  const authorization = c.req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!secretPattern.test(token)) {
    throw new ApiError("owner_access_denied", 403);
  }
  return token;
};

const requireOwner = async (c: AppContext, scheduleId: string) => {
  const token = ownerTokenFrom(c);
  const schedule = await getSchedule(c.env.DB, scheduleId);
  if (!schedule || !sameHash(await sha256(token), schedule.owner_token_hash)) {
    throw new ApiError("owner_access_denied", 403);
  }
  return schedule;
};

const readSchedule = async (db: D1Database, scheduleId: string) => {
  const [schedule, candidates, participants, votes] = await Promise.all([
    getSchedule(db, scheduleId),
    db
      .prepare(
        `SELECT id, starts_at, duration_minutes, position
         FROM candidate_slots WHERE schedule_id = ? ORDER BY position`,
      )
      .bind(scheduleId)
      .all<CandidateRow>(),
    db
      .prepare(
        `SELECT id, name, comment
         FROM participants WHERE schedule_id = ? ORDER BY created_at, id`,
      )
      .bind(scheduleId)
      .all<ParticipantRow>(),
    db
      .prepare(
        `SELECT a.participant_id, a.candidate_id, a.status
         FROM availability a
         JOIN participants p ON p.id = a.participant_id
         WHERE p.schedule_id = ?`,
      )
      .bind(scheduleId)
      .all<VoteRow>(),
  ]);
  if (!schedule) {
    return null;
  }
  return {
    candidates: candidates.results.map((candidate) => ({
      durationMinutes: candidate.duration_minutes,
      id: candidate.id,
      position: candidate.position,
      startsAt: candidate.starts_at,
    })),
    expiresAt: new Date(schedule.expires_at * 1000).toISOString(),
    finalizedCandidateId: schedule.finalized_candidate_id,
    id: schedule.id,
    participants: participants.results.map((participant) => ({
      comment: participant.comment,
      id: participant.id,
      name: participant.name,
      votes: votes.results
        .filter((vote) => vote.participant_id === participant.id)
        .map((vote) => ({
          candidateId: vote.candidate_id,
          status: vote.status,
        })),
    })),
    status: schedule.status,
    title: schedule.title,
  };
};

const escapeIcs = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");

const utcIcsDate = (startsAt: string, offsetMinutes = 0) => {
  const date = new Date(`${startsAt}:00+09:00`);
  date.setUTCMinutes(date.getUTCMinutes() + offsetMinutes);
  return date.toISOString().replaceAll(/[-:]/g, "").replace(".000", "");
};

const currentIcsDate = () =>
  new Date()
    .toISOString()
    .replace(/\.\d{3}/, "")
    .replaceAll(/[-:]/g, "");

app.use("*", requestId());
app.use("*", securityHeaders);

app.get("/", (c) => c.html(<HomePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

app.get("/e/:scheduleId", async (c) => {
  const scheduleId = c.req.param("scheduleId");
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (!idPattern.test(scheduleId)) {
    return c.html(<MissingSchedulePage />, 404);
  }
  const schedule = await getSchedule(c.env.DB, scheduleId);
  if (!schedule) {
    return c.html(<MissingSchedulePage />, 404);
  }
  return c.html(<SchedulePage scheduleId={scheduleId} title={schedule.title} />);
});

app.get("/e/:scheduleId/calendar.ics", async (c) => {
  const scheduleId = c.req.param("scheduleId");
  const candidateId = c.req.query("candidate") ?? "";
  if (!idPattern.test(scheduleId) || !idPattern.test(candidateId)) {
    throw new ApiError("not_found", 404);
  }
  const schedule = await getSchedule(c.env.DB, scheduleId);
  const candidate = await c.env.DB.prepare(
    `SELECT id, starts_at, duration_minutes, position
       FROM candidate_slots WHERE id = ? AND schedule_id = ?`,
  )
    .bind(candidateId, scheduleId)
    .first<CandidateRow>();
  if (!schedule || !candidate) {
    throw new ApiError("not_found", 404);
  }
  const url = `https://date-quilt.yusuke8h.workers.dev/e/${scheduleId}`;
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Date Quilt//JA",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${candidate.id}@date-quilt.yusuke8h.workers.dev`,
    `DTSTAMP:${currentIcsDate()}`,
    `DTSTART:${utcIcsDate(candidate.starts_at)}`,
    `DTEND:${utcIcsDate(candidate.starts_at, candidate.duration_minutes)}`,
    `SUMMARY:${escapeIcs(schedule.title)}`,
    `DESCRIPTION:${escapeIcs(`Date Quiltで決まった日程\n${url}`)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  c.header("Cache-Control", "private, no-store");
  c.header("Content-Disposition", 'attachment; filename="date-quilt.ics"');
  c.header("Content-Type", "text/calendar; charset=utf-8");
  return c.body(body);
});

app.get("/api/schedules/:scheduleId", async (c) => {
  const scheduleId = c.req.param("scheduleId");
  c.header("Cache-Control", "no-store");
  if (!idPattern.test(scheduleId)) {
    throw new ApiError("not_found", 404);
  }
  const schedule = await readSchedule(c.env.DB, scheduleId);
  if (!schedule) {
    throw new ApiError("not_found", 404);
  }
  return c.json(schedule);
});

app.post("/api/schedules", async (c) => {
  enforceSameOrigin(c);
  const payload = await parseJson(c, 8192);
  if (!payload || typeof payload !== "object") {
    throw new ApiError("invalid_schedule", 400);
  }
  const source = payload as Record<string, unknown>;
  const title = cleanText(source.title, 80);
  const sessionId = typeof source.sessionId === "string" ? source.sessionId : "";
  const candidates = validateCandidates(source.candidates, false);
  if (!title || !sessionPattern.test(sessionId)) {
    throw new ApiError("invalid_schedule", 400);
  }
  await cleanup(c.env.DB);
  const scheduleId = randomHex(16);
  const ownerToken = randomHex(32);
  const ownerTokenHash = await sha256(ownerToken);
  const expiresAt = Math.floor(Date.now() / 1000) + 90 * 86_400;
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO schedules
          (id, owner_token_hash, creator_session_id, title, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
    ).bind(scheduleId, ownerTokenHash, sessionId, title, expiresAt),
    ...candidates.map((candidate, index) =>
      c.env.DB.prepare(
        `INSERT INTO candidate_slots
            (id, schedule_id, starts_at, duration_minutes, position)
           VALUES (?, ?, ?, ?, ?)`,
      ).bind(randomHex(16), scheduleId, candidate.startsAt, candidate.durationMinutes, index),
    ),
  ];
  await c.env.DB.batch(statements);
  c.header("Cache-Control", "no-store");
  return c.json({ ownerToken, scheduleId }, 201);
});

app.post("/api/schedules/:scheduleId/responses", async (c) => {
  enforceSameOrigin(c);
  const scheduleId = c.req.param("scheduleId");
  if (!idPattern.test(scheduleId)) {
    throw new ApiError("not_found", 404);
  }
  const payload = await parseJson(c, 8192);
  if (!payload || typeof payload !== "object") {
    throw new ApiError("invalid_response", 400);
  }
  const source = payload as Record<string, unknown>;
  const schedule = await getSchedule(c.env.DB, scheduleId);
  if (!schedule) {
    throw new ApiError("not_found", 404);
  }
  const name = cleanText(source.name, 30);
  const comment = cleanText(source.comment, 120);
  const votes = Array.isArray(source.votes) ? source.votes : [];
  const candidates = await c.env.DB.prepare(
    "SELECT id FROM candidate_slots WHERE schedule_id = ? ORDER BY position",
  )
    .bind(scheduleId)
    .all<{ id: string }>();
  const candidateIds = new Set(candidates.results.map((candidate) => candidate.id));
  const normalizedVotes = votes.map((vote) => {
    if (!vote || typeof vote !== "object") {
      throw new ApiError("invalid_response", 400);
    }
    const item = vote as Record<string, unknown>;
    const candidateId = typeof item.candidateId === "string" ? item.candidateId : "";
    const status = typeof item.status === "string" ? item.status : "";
    if (!candidateIds.has(candidateId) || !voteStatuses.has(status)) {
      throw new ApiError("invalid_response", 400);
    }
    return { candidateId, status };
  });
  if (
    !name ||
    normalizedVotes.length !== candidateIds.size ||
    new Set(normalizedVotes.map((vote) => vote.candidateId)).size !== candidateIds.size
  ) {
    throw new ApiError("invalid_response", 400);
  }

  const requestedParticipantId =
    typeof source.participantId === "string" ? source.participantId : "";
  const requestedEditToken = typeof source.editToken === "string" ? source.editToken : "";
  let participantId = randomHex(16);
  let editToken = randomHex(32);
  let editTokenHash = await sha256(editToken);
  let existing = false;
  if (requestedParticipantId || requestedEditToken) {
    if (!idPattern.test(requestedParticipantId) || !secretPattern.test(requestedEditToken)) {
      throw new ApiError("response_access_denied", 403);
    }
    const participant = await c.env.DB.prepare(
      `SELECT id, edit_token_hash
         FROM participants WHERE id = ? AND schedule_id = ?`,
    )
      .bind(requestedParticipantId, scheduleId)
      .first<{ edit_token_hash: string; id: string }>();
    if (!participant || !sameHash(await sha256(requestedEditToken), participant.edit_token_hash)) {
      throw new ApiError("response_access_denied", 403);
    }
    participantId = participant.id;
    editToken = requestedEditToken;
    editTokenHash = participant.edit_token_hash;
    existing = true;
  }
  const statements = [
    existing
      ? c.env.DB.prepare(
          `UPDATE participants SET name = ?, comment = ?, updated_at = unixepoch()
             WHERE id = ? AND schedule_id = ?`,
        ).bind(name, comment, participantId, scheduleId)
      : c.env.DB.prepare(
          `INSERT INTO participants
              (id, schedule_id, edit_token_hash, name, comment)
             VALUES (?, ?, ?, ?, ?)`,
        ).bind(participantId, scheduleId, editTokenHash, name, comment),
    c.env.DB.prepare("DELETE FROM availability WHERE participant_id = ?").bind(participantId),
    ...normalizedVotes.map((vote) =>
      c.env.DB.prepare(
        `INSERT INTO availability (participant_id, candidate_id, status)
           VALUES (?, ?, ?)`,
      ).bind(participantId, vote.candidateId, vote.status),
    ),
    c.env.DB.prepare("UPDATE schedules SET updated_at = unixepoch() WHERE id = ?").bind(scheduleId),
  ];
  await c.env.DB.batch(statements);
  c.header("Cache-Control", "no-store");
  return c.json({ editToken, participantId });
});

app.patch("/api/schedules/:scheduleId", async (c) => {
  enforceSameOrigin(c);
  const scheduleId = c.req.param("scheduleId");
  if (!idPattern.test(scheduleId)) {
    throw new ApiError("not_found", 404);
  }
  const schedule = await requireOwner(c, scheduleId);
  const payload = await parseJson(c, 8192);
  if (!payload || typeof payload !== "object") {
    throw new ApiError("invalid_schedule", 400);
  }
  const source = payload as Record<string, unknown>;
  const title = cleanText(source.title, 80);
  const candidates = validateCandidates(source.candidates, true);
  if (!title) {
    throw new ApiError("invalid_schedule", 400);
  }
  const existingResult = await c.env.DB.prepare(
    `SELECT id, starts_at, duration_minutes, position
       FROM candidate_slots WHERE schedule_id = ?`,
  )
    .bind(scheduleId)
    .all<CandidateRow>();
  const existingById = new Map(
    existingResult.results.map((candidate) => [candidate.id, candidate]),
  );
  const requestedExistingIds = candidates
    .map((candidate) => candidate.id)
    .filter((id): id is string => Boolean(id));
  if (
    requestedExistingIds.some((id) => !existingById.has(id)) ||
    new Set(requestedExistingIds).size !== requestedExistingIds.length
  ) {
    throw new ApiError("invalid_candidates", 400);
  }

  const requestedIds = new Set(requestedExistingIds);
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE schedules SET title = ?, updated_at = unixepoch() WHERE id = ?").bind(
      title,
      scheduleId,
    ),
  ];
  existingResult.results
    .filter((candidate) => !requestedIds.has(candidate.id))
    .forEach((candidate) => {
      statements.push(
        c.env.DB.prepare("DELETE FROM candidate_slots WHERE id = ?").bind(candidate.id),
      );
    });
  candidates.forEach((candidate, index) => {
    if (candidate.id) {
      const existing = existingById.get(candidate.id);
      if (
        existing &&
        (existing.starts_at !== candidate.startsAt ||
          existing.duration_minutes !== candidate.durationMinutes)
      ) {
        statements.push(
          c.env.DB.prepare("DELETE FROM availability WHERE candidate_id = ?").bind(candidate.id),
        );
      }
      statements.push(
        c.env.DB.prepare(
          `UPDATE candidate_slots
             SET starts_at = ?, duration_minutes = ?, position = ?
             WHERE id = ? AND schedule_id = ?`,
        ).bind(candidate.startsAt, candidate.durationMinutes, index, candidate.id, scheduleId),
      );
    } else {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO candidate_slots
              (id, schedule_id, starts_at, duration_minutes, position)
             VALUES (?, ?, ?, ?, ?)`,
        ).bind(randomHex(16), scheduleId, candidate.startsAt, candidate.durationMinutes, index),
      );
    }
  });
  if (schedule.finalized_candidate_id && !requestedIds.has(schedule.finalized_candidate_id)) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE schedules
           SET status = 'open', finalized_candidate_id = NULL WHERE id = ?`,
      ).bind(scheduleId),
    );
  }
  await c.env.DB.batch(statements);
  return c.json({ updated: true });
});

app.post("/api/schedules/:scheduleId/finalize", async (c) => {
  enforceSameOrigin(c);
  const scheduleId = c.req.param("scheduleId");
  if (!idPattern.test(scheduleId)) {
    throw new ApiError("not_found", 404);
  }
  await requireOwner(c, scheduleId);
  const payload = await parseJson(c, 1024);
  const candidateId =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).candidateId
      : null;
  if (typeof candidateId !== "string" || !idPattern.test(candidateId)) {
    throw new ApiError("invalid_candidate", 400);
  }
  const candidate = await c.env.DB.prepare(
    "SELECT id FROM candidate_slots WHERE id = ? AND schedule_id = ?",
  )
    .bind(candidateId, scheduleId)
    .first<{ id: string }>();
  if (!candidate) {
    throw new ApiError("invalid_candidate", 400);
  }
  await c.env.DB.prepare(
    `UPDATE schedules SET status = 'finalized',
        finalized_candidate_id = ?, updated_at = unixepoch() WHERE id = ?`,
  )
    .bind(candidateId, scheduleId)
    .run();
  return c.json({ finalized: true });
});

app.delete("/api/schedules/:scheduleId", async (c) => {
  enforceSameOrigin(c);
  const scheduleId = c.req.param("scheduleId");
  if (!idPattern.test(scheduleId)) {
    throw new ApiError("not_found", 404);
  }
  await requireOwner(c, scheduleId);
  await c.env.DB.prepare("DELETE FROM schedules WHERE id = ?").bind(scheduleId).run();
  return c.json({ deleted: true });
});

app.post("/api/telemetry", async (c) => {
  enforceSameOrigin(c);
  const payload = await parseJson(c, 1024);
  if (!payload || typeof payload !== "object") {
    throw new ApiError("invalid_event", 400);
  }
  const source = payload as Record<string, unknown>;
  const sessionId = typeof source.sessionId === "string" ? source.sessionId : "";
  const name = typeof source.name === "string" ? source.name : "";
  const context = typeof source.context === "string" ? source.context : "";
  if (
    !sessionPattern.test(sessionId) ||
    !telemetryNames.has(name) ||
    (context !== "home" && context !== "" && !idPattern.test(context))
  ) {
    throw new ApiError("invalid_event", 400);
  }
  const occurredOn = new Date().toISOString().slice(0, 10);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO product_events
          (session_id, name, context, occurred_on)
         VALUES (?, ?, ?, ?)`,
    ).bind(sessionId, name, context, occurredOn),
    c.env.DB.prepare("DELETE FROM product_events WHERE created_at < unixepoch() - (120 * 86400)"),
    c.env.DB.prepare("DELETE FROM schedules WHERE expires_at <= unixepoch()"),
  ]);
  return c.body(null, 204);
});

app.get("/healthz", (c) =>
  c.json({
    healthy: true,
    service: "date-quilt",
    time: new Date().toISOString(),
  }),
);

app.notFound((c) =>
  c.json(
    {
      error: "not_found",
      requestId: c.get("requestId"),
    },
    404,
  ),
);

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: error.code }, error.status);
  }
  console.error(
    JSON.stringify({
      event: "request_failed",
      message: error.message,
      requestId: c.get("requestId"),
    }),
  );
  return c.json(
    {
      error: "internal_error",
      requestId: c.get("requestId"),
    },
    500,
  );
});

export { app };
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Bindings, context: ExecutionContext) {
    context.waitUntil(cleanup(env.DB));
  },
};
