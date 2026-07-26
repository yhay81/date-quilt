import {
  addTokyoDays,
  apiJson,
  formatSlot,
  makeId,
  sessionId,
  setStatus,
  tokyoDateTime,
  trackVisit,
} from "./common.js";

const form = document.querySelector("#create-form");
const editor = document.querySelector("#candidate-editor");
const titleInput = document.querySelector("#schedule-title");
const count = document.querySelector("#candidate-count");
const previewCount = document.querySelector("#preview-count");
const previewRows = document.querySelector("#preview-rows");
const status = document.querySelector("#create-status");
const createButton = document.querySelector("#create-button");
const durations = [
  [60, "1時間"],
  [90, "1時間30分"],
  [120, "2時間"],
  [180, "3時間"],
  [240, "4時間"],
  [480, "終日（8時間）"],
];

let candidates = [];

const weekdayNumber = (startsAt) => new Date(`${startsAt}:00+09:00`).getUTCDay();

const nextWeekdays = () => {
  const slots = [];
  for (let offset = 1; offset <= 10 && slots.length < 3; offset += 1) {
    const startsAt = tokyoDateTime(offset, "19:00");
    const weekday = weekdayNumber(startsAt);
    if (weekday !== 0 && weekday !== 6) {
      slots.push({ clientId: makeId(), durationMinutes: 120, startsAt });
    }
  }
  return slots;
};

const nextWeekend = () => {
  const slots = [];
  for (let offset = 1; offset <= 8 && slots.length < 2; offset += 1) {
    const startsAt = tokyoDateTime(offset, "14:00");
    const weekday = weekdayNumber(startsAt);
    if (weekday === 0 || weekday === 6) {
      slots.push({ clientId: makeId(), durationMinutes: 180, startsAt });
    }
  }
  return slots;
};

const makeCandidate = (startsAt = tokyoDateTime(1, "19:00"), durationMinutes = 120) => ({
  clientId: makeId(),
  durationMinutes,
  startsAt,
});

const render = () => {
  if (!(editor instanceof HTMLElement) || !(previewRows instanceof HTMLElement)) {
    return;
  }
  editor.replaceChildren();
  previewRows.replaceChildren();

  candidates.forEach((candidate, index) => {
    const row = document.createElement("div");
    row.className = "candidate-row";

    const input = document.createElement("input");
    input.type = "datetime-local";
    input.required = true;
    input.value = candidate.startsAt;
    input.setAttribute("aria-label", `候補${index + 1}の日時`);
    input.addEventListener("input", () => {
      candidate.startsAt = input.value;
      renderPreview();
    });

    const select = document.createElement("select");
    select.setAttribute("aria-label", `候補${index + 1}の長さ`);
    durations.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = label;
      option.selected = candidate.durationMinutes === value;
      select.append(option);
    });
    select.addEventListener("change", () => {
      candidate.durationMinutes = Number(select.value);
      renderPreview();
    });

    const remove = document.createElement("button");
    remove.className = "candidate-remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `候補${index + 1}を削除`);
    remove.disabled = candidates.length <= 2;
    remove.addEventListener("click", () => {
      candidates = candidates.filter((entry) => entry.clientId !== candidate.clientId);
      render();
    });

    row.append(input, select, remove);
    editor.append(row);
  });
  renderPreview();
};

const renderPreview = () => {
  if (!(previewRows instanceof HTMLElement)) {
    return;
  }
  previewRows.replaceChildren();
  candidates.forEach((candidate, index) => {
    const row = document.createElement("div");
    row.className = "preview-row";
    const date = document.createElement("div");
    date.className = "preview-date";
    const label = formatSlot(candidate.startsAt, candidate.durationMinutes);
    const strong = document.createElement("strong");
    strong.textContent = label.dateLabel;
    const small = document.createElement("small");
    small.textContent = label.timeLabel;
    date.append(strong, small);
    const symbols = ["○", index % 2 === 0 ? "△" : "○", index % 3 === 0 ? "×" : "△"];
    row.append(date);
    symbols.forEach((symbol) => {
      const cell = document.createElement("span");
      cell.className = "preview-cell";
      cell.textContent = symbol;
      row.append(cell);
    });
    previewRows.append(row);
  });
  if (count instanceof HTMLElement) {
    count.textContent = `${candidates.length} / 12`;
  }
  if (previewCount instanceof HTMLElement) {
    previewCount.textContent = `${candidates.length}候補`;
  }
};

document.querySelector("[data-add-slot]")?.addEventListener("click", () => {
  if (candidates.length >= 12) {
    setStatus(status, "候補は12件までです。", "error");
    return;
  }
  const last = candidates.at(-1);
  const startsAt = last ? addTokyoDays(last.startsAt, 1) : tokyoDateTime(1, "19:00");
  candidates.push(makeCandidate(startsAt, last?.durationMinutes ?? 120));
  render();
});

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    candidates = button.dataset.preset === "weekend" ? nextWeekend() : nextWeekdays();
    render();
    setStatus(status, "候補日時を入れ替えました。");
  });
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(titleInput instanceof HTMLInputElement) || !(createButton instanceof HTMLButtonElement)) {
    return;
  }
  const title = titleInput.value.trim();
  if (!title) {
    setStatus(status, "予定の名前を入力してください。", "error");
    titleInput.focus();
    return;
  }
  if (candidates.length < 2) {
    setStatus(status, "候補日時を2件以上追加してください。", "error");
    return;
  }
  createButton.disabled = true;
  setStatus(status, "回答ページを作成しています。");
  try {
    const result = await apiJson("/api/schedules", {
      body: JSON.stringify({
        candidates: candidates.map(({ durationMinutes, startsAt }) => ({
          durationMinutes,
          startsAt,
        })),
        sessionId,
        title,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    localStorage.setItem(`date-quilt:owner:${result.scheduleId}`, result.ownerToken);
    window.location.assign(`/e/${result.scheduleId}#owner=${result.ownerToken}`);
  } catch {
    createButton.disabled = false;
    setStatus(status, "作成できませんでした。入力内容を確認してもう一度お試しください。", "error");
  }
});

candidates = nextWeekdays();
render();
trackVisit();
