import {
  apiJson,
  copyText,
  formatSlot,
  sessionId,
  setStatus,
  tokyoDateTime,
  track,
  trackVisit,
} from "./common.js";

const app = document.querySelector("#schedule-app");
if (!(app instanceof HTMLElement)) {
  throw new Error("schedule_app_missing");
}

const scheduleId = app.dataset.scheduleId ?? "";
const ownerStorageKey = `date-quilt:owner:${scheduleId}`;
const responseStorageKey = `date-quilt:response:${scheduleId}`;
const hashOwnerToken = new URLSearchParams(window.location.hash.slice(1)).get("owner");
const validSecret = (value) => typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
let ownerToken = validSecret(hashOwnerToken)
  ? hashOwnerToken
  : localStorage.getItem(ownerStorageKey);
if (validSecret(ownerToken)) {
  localStorage.setItem(ownerStorageKey, ownerToken);
} else {
  ownerToken = null;
}

let savedCredentials =
  (() => {
    try {
      const value = JSON.parse(localStorage.getItem(responseStorageKey) ?? "null");
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  })() ?? {};

const elements = {
  copyLink: document.querySelector("#copy-link-button"),
  copyOwnerLink: document.querySelector("#copy-owner-link-button"),
  deleteSchedule: document.querySelector("#delete-schedule-button"),
  editButton: document.querySelector("#edit-schedule-button"),
  editCandidates: document.querySelector("#edit-candidate-editor"),
  editDialog: document.querySelector("#edit-dialog"),
  editStatus: document.querySelector("#edit-status"),
  editTitle: document.querySelector("#edit-title"),
  eventState: document.querySelector("#event-state"),
  matrix: document.querySelector("#response-matrix"),
  name: document.querySelector("#participant-name"),
  ownerPanel: document.querySelector("#owner-panel"),
  rankedSlots: document.querySelector("#ranked-slots"),
  responseCount: document.querySelector("#response-count"),
  responseForm: document.querySelector("#response-form"),
  responseStatus: document.querySelector("#response-status"),
  comment: document.querySelector("#participant-comment"),
  saveEdit: document.querySelector("#save-edit-button"),
  voteEditor: document.querySelector("#vote-editor"),
};

let schedule = null;
let editCandidates = [];

const authHeaders = () => ({
  authorization: `Bearer ${ownerToken}`,
  "content-type": "application/json",
  "x-session-id": sessionId,
});

const statusSymbol = { maybe: "△", no: "×", yes: "○" };

const formatError = (error) => {
  if (error?.status === 404) {
    return "この日程は見つかりません。";
  }
  if (error?.status === 403) {
    return "幹事リンクを確認してください。";
  }
  return "通信できませんでした。時間をおいてもう一度お試しください。";
};

const clearElement = (element) => {
  if (element instanceof HTMLElement) {
    element.replaceChildren();
  }
};

const renderRankedSlots = () => {
  if (!(elements.rankedSlots instanceof HTMLElement) || !schedule) {
    return;
  }
  elements.rankedSlots.replaceChildren();
  const ranked = schedule.candidates
    .map((candidate) => {
      const votes = schedule.participants.map(
        (participant) =>
          participant.votes.find((vote) => vote.candidateId === candidate.id)?.status ?? null,
      );
      const counts = {
        maybe: votes.filter((status) => status === "maybe").length,
        no: votes.filter((status) => status === "no").length,
        yes: votes.filter((status) => status === "yes").length,
      };
      return { ...candidate, counts, score: counts.yes * 2 + counts.maybe };
    })
    .sort(
      (left, right) =>
        Number(right.id === schedule.finalizedCandidateId) -
          Number(left.id === schedule.finalizedCandidateId) ||
        right.score - left.score ||
        left.position - right.position,
    );

  ranked.slice(0, 3).forEach((candidate, index) => {
    const card = document.createElement("article");
    card.className = "slot-card";
    card.dataset.finalized = String(schedule.finalizedCandidateId === candidate.id);
    const heading = document.createElement("div");
    const title = document.createElement("h3");
    const formatted = formatSlot(candidate.startsAt, candidate.durationMinutes);
    title.textContent = `${index + 1}. ${formatted.dateLabel}`;
    const time = document.createElement("p");
    time.textContent = formatted.timeLabel;
    heading.append(title, time);

    const score = document.createElement("div");
    score.className = "slot-score";
    const bar = document.createElement("span");
    bar.className = "score-bar";
    const total = schedule.participants.length || 1;
    for (const status of ["yes", "maybe", "no"]) {
      const segment = document.createElement("i");
      segment.dataset.status = status;
      segment.style.width = `${(candidate.counts[status] / total) * 100}%`;
      bar.append(segment);
    }
    const value = document.createElement("span");
    value.className = "score-value";
    value.textContent = `○ ${candidate.counts.yes}`;
    score.append(bar, value);

    const actions = document.createElement("div");
    actions.className = "slot-actions";
    if (schedule.finalizedCandidateId === candidate.id) {
      const calendar = document.createElement("a");
      calendar.href = `/e/${scheduleId}/calendar.ics?candidate=${candidate.id}`;
      calendar.textContent = "カレンダーに追加";
      calendar.addEventListener("click", () => track("calendar_added", scheduleId));
      actions.append(calendar);
    }
    if (ownerToken) {
      const finalize = document.createElement("button");
      finalize.type = "button";
      finalize.textContent =
        schedule.finalizedCandidateId === candidate.id ? "確定済み" : "この日で確定";
      finalize.disabled = schedule.finalizedCandidateId === candidate.id;
      finalize.addEventListener("click", async () => {
        try {
          await apiJson(`/api/schedules/${scheduleId}/finalize`, {
            body: JSON.stringify({ candidateId: candidate.id }),
            headers: authHeaders(),
            method: "POST",
          });
          await loadSchedule();
        } catch (error) {
          setStatus(elements.responseStatus, formatError(error), "error");
        }
      });
      actions.append(finalize);
    }
    card.append(heading, score, actions);
    elements.rankedSlots.append(card);
  });
};

const renderMatrix = () => {
  if (!(elements.matrix instanceof HTMLElement) || !schedule) {
    return;
  }
  elements.matrix.replaceChildren();
  elements.matrix.style.setProperty(
    "--participant-count",
    String(Math.max(1, schedule.participants.length)),
  );
  const head = document.createElement("div");
  head.className = "matrix-row matrix-head";
  const label = document.createElement("span");
  label.textContent = "候補日時";
  head.append(label);
  if (schedule.participants.length === 0) {
    const empty = document.createElement("span");
    empty.className = "matrix-person";
    empty.textContent = "回答待ち";
    head.append(empty);
  } else {
    schedule.participants.forEach((participant) => {
      const person = document.createElement("span");
      person.className = "matrix-person";
      person.textContent = participant.name;
      person.title = participant.name;
      head.append(person);
    });
  }
  elements.matrix.append(head);

  schedule.candidates.forEach((candidate) => {
    const row = document.createElement("div");
    row.className = "matrix-row";
    const date = document.createElement("div");
    date.className = "matrix-date";
    const formatted = formatSlot(candidate.startsAt, candidate.durationMinutes);
    const strong = document.createElement("strong");
    strong.textContent = formatted.dateLabel;
    const small = document.createElement("small");
    small.textContent = formatted.timeLabel;
    date.append(strong, small);
    row.append(date);
    if (schedule.participants.length === 0) {
      const cell = document.createElement("span");
      cell.className = "matrix-cell";
      cell.textContent = "・";
      row.append(cell);
    } else {
      schedule.participants.forEach((participant) => {
        const status =
          participant.votes.find((vote) => vote.candidateId === candidate.id)?.status ?? "";
        const cell = document.createElement("span");
        cell.className = "matrix-cell";
        if (status) {
          cell.dataset.status = status;
        }
        cell.textContent = statusSymbol[status] ?? "・";
        row.append(cell);
      });
    }
    elements.matrix.append(row);
  });

  const comments = schedule.participants.filter((participant) => participant.comment);
  if (comments.length > 0) {
    const list = document.createElement("div");
    list.className = "comment-list";
    comments.forEach((participant) => {
      const item = document.createElement("p");
      const name = document.createElement("strong");
      name.textContent = participant.name;
      const text = document.createElement("span");
      text.textContent = participant.comment;
      item.append(name, text);
      list.append(item);
    });
    elements.matrix.append(list);
  }
};

const renderVoteEditor = () => {
  if (!(elements.voteEditor instanceof HTMLElement) || !schedule) {
    return;
  }
  elements.voteEditor.replaceChildren();
  const currentParticipant = schedule.participants.find(
    (participant) => participant.id === savedCredentials?.participantId,
  );
  if (currentParticipant) {
    if (elements.name instanceof HTMLInputElement) {
      elements.name.value = currentParticipant.name;
    }
    if (elements.comment instanceof HTMLTextAreaElement) {
      elements.comment.value = currentParticipant.comment;
    }
  }
  schedule.candidates.forEach((candidate) => {
    const current =
      currentParticipant?.votes.find((vote) => vote.candidateId === candidate.id)?.status ??
      "maybe";
    const row = document.createElement("div");
    row.className = "vote-row";
    const label = document.createElement("div");
    const formatted = formatSlot(candidate.startsAt, candidate.durationMinutes);
    const strong = document.createElement("strong");
    strong.textContent = formatted.dateLabel;
    const small = document.createElement("small");
    small.textContent = formatted.timeLabel;
    label.append(strong, small);
    const buttons = document.createElement("div");
    buttons.className = "vote-buttons";
    for (const voteStatus of ["yes", "maybe", "no"]) {
      const voteLabel = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `vote-${candidate.id}`;
      input.value = voteStatus;
      input.checked = current === voteStatus;
      input.required = true;
      const symbol = document.createElement("span");
      symbol.dataset.status = voteStatus;
      symbol.textContent = statusSymbol[voteStatus];
      voteLabel.append(input, symbol);
      buttons.append(voteLabel);
    }
    row.append(label, buttons);
    elements.voteEditor.append(row);
  });
};

const renderOwner = () => {
  if (elements.ownerPanel instanceof HTMLElement) {
    elements.ownerPanel.hidden = !ownerToken;
  }
};

const renderSchedule = () => {
  if (!schedule) {
    return;
  }
  const heading = document.querySelector(".schedule-heading h1");
  if (heading instanceof HTMLElement) {
    heading.textContent = schedule.title;
  }
  document.title = `${schedule.title} | Date Quilt`;
  if (elements.responseCount instanceof HTMLElement) {
    elements.responseCount.textContent = `${schedule.participants.length}人`;
  }
  if (elements.eventState instanceof HTMLElement) {
    const finalized = Boolean(schedule.finalizedCandidateId);
    elements.eventState.dataset.finalized = String(finalized);
    elements.eventState.textContent = finalized ? "日程確定" : "回答受付中";
  }
  renderRankedSlots();
  renderMatrix();
  renderVoteEditor();
  renderOwner();
};

async function loadSchedule() {
  try {
    schedule = await apiJson(`/api/schedules/${scheduleId}`);
    renderSchedule();
  } catch (error) {
    setStatus(elements.responseStatus, formatError(error), "error");
    clearElement(elements.rankedSlots);
    clearElement(elements.matrix);
  }
}

elements.responseForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (
    !schedule ||
    !(elements.name instanceof HTMLInputElement) ||
    !(elements.comment instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  const name = elements.name.value.trim();
  if (!name) {
    setStatus(elements.responseStatus, "名前を入力してください。", "error");
    elements.name.focus();
    return;
  }
  const votes = schedule.candidates.map((candidate) => ({
    candidateId: candidate.id,
    status: document.querySelector(`input[name="vote-${candidate.id}"]:checked`)?.value ?? "maybe",
  }));
  setStatus(elements.responseStatus, "回答を保存しています。");
  try {
    const result = await apiJson(`/api/schedules/${scheduleId}/responses`, {
      body: JSON.stringify({
        comment: elements.comment.value.trim(),
        editToken: savedCredentials?.editToken,
        name,
        participantId: savedCredentials?.participantId,
        sessionId,
        votes,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    localStorage.setItem(
      responseStorageKey,
      JSON.stringify({
        editToken: result.editToken,
        participantId: result.participantId,
      }),
    );
    savedCredentials.editToken = result.editToken;
    savedCredentials.participantId = result.participantId;
    setStatus(elements.responseStatus, "回答を保存しました。", "success");
    await loadSchedule();
  } catch (error) {
    setStatus(elements.responseStatus, formatError(error), "error");
  }
});

elements.copyLink?.addEventListener("click", async () => {
  try {
    await copyText(`${window.location.origin}/e/${scheduleId}`);
    track("share_copied", scheduleId);
    setStatus(elements.responseStatus, "回答URLをコピーしました。", "success");
  } catch {
    setStatus(elements.responseStatus, "URLをコピーできませんでした。", "error");
  }
});

elements.copyOwnerLink?.addEventListener("click", async () => {
  try {
    await copyText(`${window.location.origin}/e/${scheduleId}#owner=${ownerToken}`);
    setStatus(elements.responseStatus, "幹事リンクをコピーしました。", "success");
  } catch {
    setStatus(elements.responseStatus, "幹事リンクをコピーできませんでした。", "error");
  }
});

const createEditRow = (candidate, index) => {
  const row = document.createElement("div");
  row.className = "candidate-row";
  const input = document.createElement("input");
  input.type = "datetime-local";
  input.value = candidate.startsAt;
  input.required = true;
  input.setAttribute("aria-label", `候補${index + 1}の日時`);
  input.addEventListener("input", () => {
    candidate.startsAt = input.value;
  });
  const select = document.createElement("select");
  select.setAttribute("aria-label", `候補${index + 1}の長さ`);
  [
    [60, "1時間"],
    [90, "1時間30分"],
    [120, "2時間"],
    [180, "3時間"],
    [240, "4時間"],
    [480, "終日（8時間）"],
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    option.selected = candidate.durationMinutes === value;
    select.append(option);
  });
  select.addEventListener("change", () => {
    candidate.durationMinutes = Number(select.value);
  });
  const remove = document.createElement("button");
  remove.className = "candidate-remove";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `候補${index + 1}を削除`);
  remove.disabled = editCandidates.length <= 2;
  remove.addEventListener("click", () => {
    editCandidates = editCandidates.filter((entry) => entry.clientKey !== candidate.clientKey);
    renderEditCandidates();
  });
  row.append(input, select, remove);
  return row;
};

const renderEditCandidates = () => {
  if (!(elements.editCandidates instanceof HTMLElement)) {
    return;
  }
  elements.editCandidates.replaceChildren();
  editCandidates.forEach((candidate, index) => {
    elements.editCandidates.append(createEditRow(candidate, index));
  });
};

elements.editButton?.addEventListener("click", () => {
  if (
    !schedule ||
    !(elements.editDialog instanceof HTMLDialogElement) ||
    !(elements.editTitle instanceof HTMLInputElement)
  ) {
    return;
  }
  elements.editTitle.value = schedule.title;
  editCandidates = schedule.candidates.map((candidate) => ({
    ...candidate,
    clientKey: candidate.id,
  }));
  renderEditCandidates();
  elements.editDialog.showModal();
});

document.querySelector("[data-edit-add-slot]")?.addEventListener("click", () => {
  if (editCandidates.length >= 12) {
    setStatus(elements.editStatus, "候補は12件までです。", "error");
    return;
  }
  editCandidates.push({
    clientKey: crypto.randomUUID(),
    durationMinutes: editCandidates.at(-1)?.durationMinutes ?? 120,
    id: null,
    startsAt: tokyoDateTime(editCandidates.length + 1, "19:00"),
  });
  renderEditCandidates();
});

elements.saveEdit?.addEventListener("click", async (event) => {
  event.preventDefault();
  if (!(elements.editTitle instanceof HTMLInputElement)) {
    return;
  }
  try {
    await apiJson(`/api/schedules/${scheduleId}`, {
      body: JSON.stringify({
        candidates: editCandidates.map(({ durationMinutes, id, startsAt }) => ({
          durationMinutes,
          id,
          startsAt,
        })),
        title: elements.editTitle.value.trim(),
      }),
      headers: authHeaders(),
      method: "PATCH",
    });
    if (elements.editDialog instanceof HTMLDialogElement) {
      elements.editDialog.close();
    }
    setStatus(elements.responseStatus, "候補日時を更新しました。", "success");
    await loadSchedule();
  } catch (error) {
    setStatus(elements.editStatus, formatError(error), "error");
  }
});

elements.deleteSchedule?.addEventListener("click", async () => {
  if (!window.confirm("この日程とすべての回答を削除します。元に戻せません。")) {
    return;
  }
  try {
    await apiJson(`/api/schedules/${scheduleId}`, {
      headers: authHeaders(),
      method: "DELETE",
    });
    localStorage.removeItem(ownerStorageKey);
    localStorage.removeItem(responseStorageKey);
    window.location.assign("/");
  } catch (error) {
    setStatus(elements.responseStatus, formatError(error), "error");
  }
});

await loadSchedule();
trackVisit(scheduleId);
