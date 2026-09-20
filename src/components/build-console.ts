/**
 * The build console's client half.
 *
 * Spec §7: the console "streams genuine build output… It is more interesting than any animation and
 * it is true." The word doing the work is *genuine*, so this module has exactly one source of lines —
 * the Worker's `GET /build-console` event stream — and no other code path can put text into the log.
 * There is no sample array here, no timer that fakes progress, no "warming up" filler. A fake console
 * on a page whose argument is honesty would be the worst bug on the site.
 *
 * ── The contract, as the Worker actually implements it (`worker/routes/build-console.js`) ──
 *
 * The endpoint REFUSES a request that names neither a recipe nor a run, with a 400 whose reason is
 * that "whatever is building right now" would leak which customers exist. That is why this module
 * does not open a stream at all unless the page gave it one of the two. On a page that has no build
 * to point at — the landing page, how-it-works — the console's honest state is the one it is
 * rendered in: there is no build to show, and it says so.
 *
 * Events are named and their `data` is JSON, not text:
 *   hello      the stream opened against a real run
 *   job|step   a real GitHub Actions transition; this is state, not a log tail, because GitHub has
 *              no line-level live log (DECISION-SHEET B14) — the lines below say so in their words
 *   stale      real output stored from an earlier run of the same build, replayed during an outage
 *              and labelled as old, because old and true beats fresh and invented
 *   status     unavailable or degraded, with the Worker's own sentence about why
 *   idle       there is no build
 *   done       the run finished
 *   reconnect  the stream is about to be cut; EventSource reconnects with Last-Event-ID by itself
 *
 * Reconnection is the browser's, and it works because the Worker derives each `id:` from the run's
 * own structure rather than from a counter. Cloudflare terminates in-flight requests on a runtime
 * update (DECISION-SHEET B16), so a stream lasting a whole build will be cut; resuming from the last
 * id is how the log stays a log instead of starting over.
 */

type Status = "no-target" | "connecting" | "live" | "stale" | "ended" | "idle" | "unavailable";

const MAX_LINES_DEFAULT = 400;

interface Strings {
  idle: string;
  live: string;
  connecting: string;
  ended: string;
  unavailable: string;
  stale: string;
  noTarget: string;
}

/** Pad so the verb column lines up. Mono type, so columns are free. */
function column(word: string, width = 9): string {
  return word.length >= width ? word + " " : word + " ".repeat(width - word.length);
}

/**
 * Turn one real transition into one line. Every field printed came off the wire; nothing here
 * composes, estimates or fills in a value that the Worker did not send.
 */
function lineFromFact(type: string, data: Record<string, any>): string | null {
  const phase = data.phase === "completed" ? data.conclusion ?? "completed" : "started";
  const took = typeof data.seconds === "number" ? ` · ${data.seconds}s` : "";
  const prefix = data.stale ? "stored   " : "";
  if (type === "step" || data.originalType === "step") {
    const number = data.number === null || data.number === undefined ? "" : `${data.number} `;
    return `${prefix}${column(phase)} ${number}${data.step}${took}`;
  }
  if (type === "job" || data.originalType === "job") {
    return `${prefix}${column(phase)} job ${data.job}${took}`;
  }
  return null;
}

function mount(root: HTMLElement): void {
  const base = root.dataset.endpoint;
  const recipe = root.dataset.recipe ?? "";
  const run = root.dataset.run ?? "";
  const log = root.querySelector<HTMLOListElement>("[data-console-log]");
  const statusEl = root.querySelector<HTMLElement>("[data-console-status]");
  const noteEl = root.querySelector<HTMLElement>("[data-console-note]");
  if (!base || !log || !statusEl) return;

  const strings: Strings = {
    idle: root.dataset.stringIdle ?? "No build running",
    live: root.dataset.stringLive ?? "live",
    connecting: root.dataset.stringConnecting ?? "connecting",
    ended: root.dataset.stringEnded ?? "build finished",
    unavailable: root.dataset.stringUnavailable ?? "no build to show",
    stale: root.dataset.stringStale ?? "stored output, not live",
    noTarget: root.dataset.stringNoTarget ?? "No build running",
  };
  const notes = {
    noTarget: root.dataset.noteNoTarget ?? "",
    idle: root.dataset.noteIdle ?? "",
  };

  const maxLines = Number(root.dataset.maxLines ?? MAX_LINES_DEFAULT) || MAX_LINES_DEFAULT;
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let received = 0;

  function setStatus(next: Status, note?: string): void {
    const label =
      next === "no-target" ? strings.noTarget
      : next === "connecting" ? strings.connecting
      : next === "live" ? strings.live
      : next === "stale" ? strings.stale
      : next === "ended" ? strings.ended
      : next === "idle" ? strings.idle
      : strings.unavailable;
    statusEl!.textContent = label;
    root.dataset.state = next;
    if (noteEl) {
      const text = note ?? (next === "no-target" ? notes.noTarget : next === "idle" ? notes.idle : "");
      noteEl.textContent = text;
      noteEl.hidden = text === "";
    }
  }

  /** Append one line that came off the wire. The only writer to the log. */
  function appendLine(text: string): void {
    const li = document.createElement("li");
    li.className = "line";
    li.textContent = text;
    log!.appendChild(li);
    received += 1;
    while (log!.childElementCount > maxLines) log!.removeChild(log!.firstElementChild!);
    log!.scrollTo({ top: log!.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }

  // No recipe and no run means there is nothing this console could honestly be pointed at. The
  // Worker would refuse the request anyway, and asking it in order to be refused would be theatre.
  if (!recipe && !run) {
    setStatus("no-target");
    return;
  }

  const params = new URLSearchParams();
  if (recipe) params.set("recipe", recipe);
  if (run) params.set("run", run);
  const url = `${base}?${params.toString()}`;

  let source: EventSource;
  try {
    source = new EventSource(url);
  } catch {
    setStatus("unavailable");
    return;
  }

  setStatus("connecting");

  const parse = (event: Event): Record<string, any> | null => {
    const data = (event as MessageEvent<string>).data;
    if (typeof data !== "string" || data.length === 0) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null; // an unparseable frame is not a line we can honestly print
    }
  };

  source.addEventListener("hello", () => setStatus("connecting"));

  for (const type of ["job", "step"]) {
    source.addEventListener(type, (event) => {
      const data = parse(event);
      if (!data) return;
      const line = lineFromFact(type, data);
      if (!line) return;
      setStatus("live");
      appendLine(line);
    });
  }

  source.addEventListener("stale", (event) => {
    const data = parse(event);
    if (!data) return;
    const line = lineFromFact(String(data.originalType ?? ""), data);
    if (!line) return;
    setStatus("stale", typeof data.storedAt === "string" ? `Stored output from ${data.storedAt}. It is real and it is old. Nothing here is live.` : undefined);
    appendLine(line);
  });

  // The Worker's own sentence about why there is nothing live. We print its words, not a paraphrase.
  source.addEventListener("status", (event) => {
    const data = parse(event);
    if (!data) return;
    if (data.state === "degraded") setStatus("stale", typeof data.message === "string" ? data.message : undefined);
    else setStatus("unavailable", typeof data.message === "string" ? data.message : undefined);
  });

  source.addEventListener("idle", (event) => {
    const data = parse(event);
    setStatus("idle", typeof data?.message === "string" ? data.message : undefined);
  });

  source.addEventListener("done", (event) => {
    const data = parse(event);
    setStatus("ended", typeof data?.message === "string" ? data.message : undefined);
    source.close();
  });

  // `reconnect` is the Worker saying it is about to be cut. EventSource reconnects on its own and
  // sends Last-Event-ID, so there is nothing to do here but leave the log alone.
  source.addEventListener("reconnect", () => {});

  source.addEventListener("error", () => {
    // EventSource retries by itself while readyState is CONNECTING. Only a closed stream is a
    // verdict, and the verdict is "we have nothing real to show you", never a placeholder build.
    if (source.readyState === EventSource.CLOSED) {
      setStatus(received > 0 ? "ended" : "unavailable");
    }
  });

  window.addEventListener("beforeunload", () => source.close());
}

export function mountBuildConsoles(): void {
  document.querySelectorAll<HTMLElement>("[data-build-console]").forEach(mount);
}
