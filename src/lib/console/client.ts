/**
 * The build console's client half.
 *
 * Two jobs, and a rule that governs both.
 *
 * THE RULE. Every line this module puts on the page arrived from the server-sent-events stream.
 * There is no array of sample lines in this file, no timer that emits progress, no "connecting…"
 * filler dressed as output, and no typewriter. Lines appear when they arrive and at the speed they
 * arrive — a log, not an animation (§7 permits movement only from something reporting a real fact;
 * pacing invented to look busy is not one). A fake console on a page arguing for honesty would be
 * the worst defect on this site, so the honest states are enumerated and none of them fabricate.
 *
 * JOB 1 — freshness. The page is statically built, so the server can only stamp the last run in
 * UTC. The reader has a timezone and a sense of "today". So the first thing this does is restate
 * the same instant in local time: "last build · 22:14 today". Same fact, read by a person.
 *
 * JOB 2 — live. If a build is actually running, its output replaces the snapshot and the console
 * says `live`. If it is not — no build, no endpoint, endpoint erroring, no JavaScript at all — the
 * snapshot stays exactly where the server put it, still labelled as the last real run. Those are
 * different truths and the console never blurs them: it does not claim `live` until a line lands.
 *
 * Reconnection is EventSource's own, using `Last-Event-ID`, which is why CONVENTIONS.md §5 requires
 * an `id:` on every line: the Cloudflare runtime drops in-flight requests on a runtime update, so a
 * long build WILL be interrupted, and resuming is how the log stays a log instead of restarting.
 */

type Status = "snapshot" | "live" | "finished" | "nothing";

const MAX_LINES = 400;

/** Levels the stylesheet knows. An unknown level from the wire renders as an ordinary line. */
const LEVELS = new Set(["section", "good", "bad", "warn", "note", "info", "meta"]);

interface Strings {
  live: string;
  finished: string;
  nothing: string;
  /** "last build · {time}" — {time} is filled with the local rendering of the run's real instant. */
  lastBuild: string;
}

function localTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** "today" / "yesterday" / "on 18 Sep" — calendar days apart, in the reader's own timezone. */
function relativeDay(d: Date, now: Date): string {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `on ${d.getDate()} ${d.toLocaleString(undefined, { month: "short" })}`;
}

function mount(root: HTMLElement): void {
  const log = root.querySelector<HTMLElement>("[data-console-log]");
  const statusEl = root.querySelector<HTMLElement>("[data-console-status]");
  if (!log || !statusEl) return;

  const strings: Strings = {
    live: root.dataset["stringLive"] ?? "live",
    finished: root.dataset["stringFinished"] ?? "build finished",
    nothing: root.dataset["stringNothing"] ?? "no build to show",
    lastBuild: root.dataset["stringLastBuild"] ?? "last build · {time}",
  };

  const hasSnapshot = root.dataset["hasSnapshot"] === "true";

  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── job 1: restate the snapshot's instant in the reader's own time ────────────────────────────
  //
  // The <time datetime> the server wrote is the single source; we never compute a "time ago" from
  // anything else. If it will not parse, the server's UTC stamp stays — wrong-looking beats wrong.
  let snapshotLabel = statusEl.textContent ?? "";
  const timeEl = root.querySelector<HTMLTimeElement>("[data-console-when]");
  if (hasSnapshot && timeEl) {
    const when = new Date(timeEl.dateTime);
    if (!Number.isNaN(when.getTime())) {
      snapshotLabel = strings.lastBuild.replace(
        "{time}",
        `${localTime(when)} ${relativeDay(when, new Date())}`,
      );
      statusEl.textContent = snapshotLabel;
      timeEl.textContent = `${localTime(when)} ${relativeDay(when, new Date())}`;
      timeEl.title = timeEl.dateTime;
    }
  }

  const endpoint = root.dataset["endpoint"];
  if (!endpoint) return;

  // ── job 2: the live stream ────────────────────────────────────────────────────────────────────
  let status: Status = hasSnapshot ? "snapshot" : "nothing";
  let liveLines = 0;

  function setStatus(next: Status): void {
    status = next;
    root.dataset["state"] = next;
    statusEl!.textContent =
      next === "live"
        ? strings.live
        : next === "finished"
          ? strings.finished
          : next === "snapshot"
            ? snapshotLabel
            : strings.nothing;
  }

  /**
   * Scroll the tail into view — but only if the reader was already at the tail. Someone who has
   * scrolled up is reading, and yanking them back to the bottom is the console deciding it matters
   * more than they do. Under `prefers-reduced-motion` nothing scrolls at all.
   */
  function followTail(wasAtTail: boolean): void {
    if (reduceMotion || !wasAtTail) return;
    log!.scrollTop = log!.scrollHeight;
  }

  /** The only writer to the log. Its argument comes off the wire; nothing else calls it. */
  function appendLine(text: string, level: string): void {
    const atTail = log!.scrollHeight - log!.scrollTop - log!.clientHeight < 24;
    const li = document.createElement("li");
    li.className = "line";
    li.dataset["level"] = LEVELS.has(level) ? level : "info";
    const body = document.createElement("span");
    body.className = "text";
    body.textContent = text;
    li.appendChild(body);
    log!.appendChild(li);
    liveLines += 1;
    while (log!.childElementCount > MAX_LINES) log!.removeChild(log!.firstElementChild!);
    followTail(atTail);
  }

  /** The first live line evicts the snapshot: two different runs in one log would be a lie. */
  function beginLive(): void {
    if (status === "live") return;
    log!.replaceChildren();
    liveLines = 0;
    root.dataset["showingSnapshot"] = "false";
    const meta = root.querySelector<HTMLElement>("[data-console-run]");
    if (meta) meta.hidden = true;
    setStatus("live");
  }

  let source: EventSource;
  try {
    source = new EventSource(endpoint);
  } catch {
    return; // Nothing changes: whatever the server rendered is still the truth about it.
  }

  source.addEventListener("line", (event) => {
    const data = (event as MessageEvent<string>).data;
    if (typeof data !== "string" || data.length === 0) return;
    // The Worker may send a bare line or a JSON object carrying a level (CONVENTIONS.md §5). Both
    // are accepted; neither is invented here. A payload we cannot read is dropped, not guessed at.
    let text = data;
    let level = "info";
    if (data.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(data);
        if (typeof parsed === "object" && parsed !== null) {
          const p = parsed as Record<string, unknown>;
          if (typeof p["text"] !== "string") return;
          text = p["text"];
          if (typeof p["level"] === "string") level = p["level"];
        }
      } catch {
        return;
      }
    }
    beginLive();
    appendLine(text, level);
  });

  // The server saying there is no build in flight. That is a fact about now; the snapshot is a fact
  // about earlier. Both stay true, so the snapshot stays on screen and keeps its own label.
  source.addEventListener("idle", () => {
    if (liveLines === 0) setStatus(hasSnapshot ? "snapshot" : "nothing");
  });

  source.addEventListener("done", () => {
    if (liveLines > 0) setStatus("finished");
    source.close();
  });

  source.addEventListener("error", () => {
    // EventSource retries by itself while readyState is CONNECTING. Only a closed stream is a
    // verdict, and the verdict is never a placeholder build: it is the last real run, or nothing.
    if (source.readyState === EventSource.CLOSED) {
      if (liveLines > 0) setStatus("finished");
      else setStatus(hasSnapshot ? "snapshot" : "nothing");
    }
  });

  window.addEventListener("beforeunload", () => source.close());
}

export function mountBuildConsoles(): void {
  document.querySelectorAll<HTMLElement>("[data-build-console]").forEach(mount);
}
