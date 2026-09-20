/**
 * The build console's client half.
 *
 * THE RULE, before anything else: every line this module puts on the page came off the wire. There
 * is no sample array in this file, no timer that emits progress, no "connecting…" filler dressed as
 * output, no typewriter and no invented pacing. Lines appear when they arrive, at the speed they
 * arrive — a log, not an animation. §7 permits motion only from something reporting a real fact,
 * and pacing invented to look busy is not one. A fake console on a page arguing that we tell you
 * exactly what we deleted would be the worst defect on this site.
 *
 * ── The Worker's contract, as `worker/routes/build-console.js` actually implements it ────────────
 *
 * `GET /build-console?recipe=<name>` or `?run=<id>`. It **refuses** a request naming neither, with a
 * 400 saying why: "whatever is building right now" would leak which customers exist. So this module
 * does not open a stream at all unless the page named a target. Asking in order to be refused would
 * be theatre, and a 400 in the network panel of a site about honesty is a bad look earned for free.
 *
 * Events are named; `data` is JSON, never text:
 *   hello      the stream opened against a real run
 *   job | step a real GitHub Actions transition. GitHub has no line-level live log (DECISION-SHEET
 *              B14) — `/actions/jobs/{id}/logs` 404s until the job finishes — so what streams is
 *              real state rather than a log tail. Coarser, and entirely true.
 *   stale      real output stored from this run earlier, replayed during an outage and labelled as
 *              old, because old and true beats fresh and invented
 *   status     unavailable or degraded, carrying the Worker's own sentence about why
 *   idle       there is no build
 *   done       the run finished
 *   reconnect  the stream is about to be cut; EventSource reconnects with Last-Event-ID by itself
 *
 * ── What is on the page before any of that ──────────────────────────────────────────────────────
 *
 * Most pages name no target, and most of the time no build is running anyway. So the server has
 * already rendered **the last run that really happened**, out of `last-build.json`, labelled and
 * linked. That is the resting state, and it is a true one. This module therefore has two jobs:
 *
 *   1. Restate the snapshot's instant in the reader's own timezone — "last build · 22:14 today".
 *      Same fact, read by a person instead of by a server with no timezone to be right about.
 *   2. If a build is genuinely streaming, replace the snapshot with it and say `live`.
 *
 * Those are different truths and the console never blurs them. It does not claim `live` until a
 * transition lands, and when the stream has nothing, the snapshot stays exactly as the server left
 * it — including with JavaScript switched off entirely, which is the same page minus this file.
 */

type Status =
  | "snapshot"
  | "nothing"
  | "connecting"
  | "live"
  | "stale"
  | "finished"
  | "unavailable";

const MAX_LINES = 400;

interface Strings {
  live: string;
  stale: string;
  connecting: string;
  finished: string;
  nothing: string;
  unavailable: string;
  /** "last build · {time}" — {time} becomes the local rendering of the run's real instant. */
  lastBuild: string;
}

/** Pad so the verb column lines up. Mono type, so columns are free. */
function column(word: string, width = 9): string {
  return word.length >= width ? `${word} ` : word + " ".repeat(width - word.length);
}

type Fact = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * One real transition → one line. Every field printed came off the wire; nothing here composes,
 * estimates or fills in a value the Worker did not send. A fact it cannot read becomes no line.
 */
function lineFromFact(type: string, data: Fact): { text: string; level: string } | null {
  const phase =
    data["phase"] === "completed" ? (str(data["conclusion"]) ?? "completed") : "started";
  const seconds = data["seconds"];
  const took = typeof seconds === "number" ? ` · ${seconds}s` : "";
  const prefix = data["stale"] === true ? "stored   " : "";

  const level =
    phase === "failure" || phase === "timed_out" || phase === "cancelled"
      ? "bad"
      : phase === "success"
        ? "good"
        : "info";

  const kind = type === "stale" ? (str(data["originalType"]) ?? "") : type;

  if (kind === "step") {
    const step = str(data["step"]);
    if (step === null) return null;
    const n = data["number"];
    const number = typeof n === "number" ? `${n} ` : "";
    return { text: `${prefix}${column(phase)} ${number}${step}${took}`, level };
  }
  if (kind === "job") {
    const job = str(data["job"]);
    if (job === null) return null;
    // A job boundary is the coarsest real structure in the run, so it is the section rule.
    return {
      text: `${prefix}${column(phase)} job ${job}${took}`,
      level: phase === "started" ? "section" : level,
    };
  }
  return null;
}

function localTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
  const wireNote = root.querySelector<HTMLElement>("[data-console-note]");
  if (!log || !statusEl) return;

  const strings: Strings = {
    live: root.dataset["stringLive"] ?? "live",
    stale: root.dataset["stringStale"] ?? "stored output, not live",
    connecting: root.dataset["stringConnecting"] ?? "connecting",
    finished: root.dataset["stringFinished"] ?? "build finished",
    nothing: root.dataset["stringNothing"] ?? "no build to show",
    unavailable: root.dataset["stringUnavailable"] ?? "no build to show",
    lastBuild: root.dataset["stringLastBuild"] ?? "last build · {time}",
  };

  const hasSnapshot = root.dataset["hasSnapshot"] === "true";
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── job 1: restate the snapshot's instant in the reader's own time ────────────────────────────
  //
  // The <time datetime> the server wrote is the single source; no "time ago" is computed from
  // anything else, and if it will not parse the server's UTC stamp stays. Wrong-looking beats wrong.
  let snapshotLabel = statusEl.textContent ?? strings.nothing;
  const timeEl = root.querySelector<HTMLTimeElement>("[data-console-when]");
  if (hasSnapshot && timeEl) {
    const when = new Date(timeEl.dateTime);
    if (!Number.isNaN(when.getTime())) {
      const human = `${localTime(when)} ${relativeDay(when, new Date())}`;
      snapshotLabel = strings.lastBuild.replace("{time}", human);
      statusEl.textContent = snapshotLabel;
      timeEl.title = timeEl.textContent ?? "";
      timeEl.textContent = human;
    }
  }

  // ── job 2: the live stream, if this page names something to watch ─────────────────────────────
  const base = root.dataset["endpoint"];
  const recipe = root.dataset["recipe"] ?? "";
  const run = root.dataset["run"] ?? "";
  // No recipe and no run means there is nothing this console could honestly be pointed at, and the
  // Worker would refuse the request. The snapshot is already the true answer for this page.
  if (!base || (!recipe && !run)) return;

  let status: Status = hasSnapshot ? "snapshot" : "nothing";
  let wireLines = 0;

  function label(next: Status): string {
    switch (next) {
      case "live":
        return strings.live;
      case "stale":
        return strings.stale;
      case "connecting":
        return strings.connecting;
      case "finished":
        return strings.finished;
      case "snapshot":
        return snapshotLabel;
      case "unavailable":
        return strings.unavailable;
      case "nothing":
        return strings.nothing;
    }
  }

  /** The Worker's own sentence about why, printed as its words and never as a paraphrase. */
  function setNote(text: string | null): void {
    if (!wireNote) return;
    wireNote.textContent = text ?? "";
    wireNote.hidden = !text;
  }

  function setStatus(next: Status, note?: string | null): void {
    status = next;
    root.dataset["state"] = next;
    statusEl!.textContent = label(next);
    if (note !== undefined) setNote(note);
  }

  /**
   * Follow the tail — but only if the reader was already at the tail. Someone who has scrolled up
   * is reading, and yanking them back is the console deciding it matters more than they do. Under
   * `prefers-reduced-motion` nothing scrolls at all, and nothing transitions in either mode.
   */
  function appendLine(text: string, level: string): void {
    const atTail = log!.scrollHeight - log!.scrollTop - log!.clientHeight < 24;
    const li = document.createElement("li");
    li.className = "line";
    li.dataset["level"] = level;
    const at = document.createElement("span");
    at.className = "at";
    at.setAttribute("aria-hidden", "true");
    const body = document.createElement("span");
    body.className = "text";
    body.textContent = text;
    li.append(at, body);
    log!.appendChild(li);
    wireLines += 1;
    while (log!.childElementCount > MAX_LINES) log!.removeChild(log!.firstElementChild!);
    if (!reduceMotion && atTail) log!.scrollTop = log!.scrollHeight;
  }

  /**
   * The first line off the wire evicts the snapshot. Two different runs interleaved in one log
   * would be the console telling a small lie about which machine did what.
   */
  function beginWire(): void {
    if (wireLines > 0) return;
    log!.replaceChildren();
    const meta = root.querySelector<HTMLElement>("[data-console-run]");
    if (meta) meta.hidden = true;
    root.dataset["showingSnapshot"] = "false";
  }

  const params = new URLSearchParams();
  if (recipe) params.set("recipe", recipe);
  if (run) params.set("run", run);

  let source: EventSource;
  try {
    source = new EventSource(`${base}?${params.toString()}`);
  } catch {
    return; // Nothing changes: what the server rendered is still the truth about it.
  }

  setStatus("connecting");

  function parse(event: Event): Fact | null {
    const data = (event as MessageEvent<string>).data;
    if (typeof data !== "string" || data.length === 0) return null;
    try {
      const value: unknown = JSON.parse(data);
      return typeof value === "object" && value !== null ? (value as Fact) : null;
    } catch {
      return null; // an unparseable frame is not a line we can honestly print
    }
  }

  source.addEventListener("hello", () => {
    if (status === "connecting") setStatus("connecting", null);
  });

  for (const type of ["job", "step"] as const) {
    source.addEventListener(type, (event) => {
      const data = parse(event);
      if (!data) return;
      const line = lineFromFact(type, data);
      if (!line) return;
      beginWire();
      setStatus("live", null);
      appendLine(line.text, line.level);
    });
  }

  source.addEventListener("stale", (event) => {
    const data = parse(event);
    if (!data) return;
    const line = lineFromFact("stale", data);
    if (!line) return;
    beginWire();
    const storedAt = str(data["storedAt"]);
    setStatus(
      "stale",
      storedAt
        ? `Stored output from ${storedAt}. It is real and it is old. Nothing here is live.`
        : null,
    );
    appendLine(line.text, line.level);
  });

  source.addEventListener("status", (event) => {
    const data = parse(event);
    if (!data) return;
    const message = str(data["message"]);
    if (data["state"] === "degraded") setStatus("stale", message);
    // Nothing live and nothing stored. The snapshot on screen is still a real run, so it stays;
    // the Worker's sentence says what is unavailable, which is a different thing from what is shown.
    else setStatus(wireLines > 0 ? "unavailable" : hasSnapshot ? "snapshot" : "nothing", message);
  });

  source.addEventListener("idle", (event) => {
    const data = parse(event);
    setStatus(wireLines > 0 ? "finished" : hasSnapshot ? "snapshot" : "nothing", str(data?.["message"] ?? null));
  });

  source.addEventListener("done", (event) => {
    const data = parse(event);
    setStatus(wireLines > 0 ? "finished" : hasSnapshot ? "snapshot" : "nothing", str(data?.["message"] ?? null));
    source.close();
  });

  // The Worker saying it is about to be cut. EventSource reconnects on its own with Last-Event-ID,
  // and the Worker rebuilds the fact list deterministically, so there is nothing to do here.
  source.addEventListener("reconnect", () => {});

  source.addEventListener("error", () => {
    // EventSource retries by itself while readyState is CONNECTING. Only a closed stream is a
    // verdict, and the verdict is never a placeholder build: it is the last real run, or nothing.
    if (source.readyState !== EventSource.CLOSED) return;
    if (wireLines > 0) setStatus("finished");
    else setStatus(hasSnapshot ? "snapshot" : "nothing", null);
  });

  window.addEventListener("beforeunload", () => source.close());
}

export function mountBuildConsoles(): void {
  document.querySelectorAll<HTMLElement>("[data-build-console]").forEach(mount);
}
