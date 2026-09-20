/**
 * The build console's client half.
 *
 * Spec §7: "The build console replaces every decorative animation impulse. It streams genuine build
 * output." The word doing the work in that sentence is *genuine*. This module has exactly one source
 * of lines — the server-sent-events stream — and no other code path can put text into the live log.
 * There is no sample array here, no timer that fakes progress, no "warming up" filler. A fake console
 * on a page whose argument is honesty would be the worst bug on the site.
 *
 * So the states are: streaming a real build, or saying plainly that there is not one.
 *
 * Reconnection: EventSource sends `Last-Event-ID` by itself when the server has emitted `id:` lines.
 * That matters here because the Cloudflare runtime terminates in-flight requests on a runtime update
 * (a few times a week, after a 30s grace period), so a long build WILL be interrupted; resuming from
 * the last id is how the log stays a log rather than restarting.
 */

type Status = "idle" | "connecting" | "live" | "ended" | "unreachable";

const MAX_LINES_DEFAULT = 400;

interface Strings {
  idle: string;
  live: string;
  connecting: string;
  ended: string;
  unreachable: string;
}

function statusText(strings: Strings, status: Status): string {
  return strings[status];
}

function mount(root: HTMLElement): void {
  const endpoint = root.dataset.endpoint;
  const log = root.querySelector<HTMLOListElement>("[data-console-log]");
  const statusEl = root.querySelector<HTMLElement>("[data-console-status]");
  const noteEl = root.querySelector<HTMLElement>("[data-console-note]");
  if (!endpoint || !log || !statusEl) return;

  const strings: Strings = {
    idle: root.dataset.stringIdle ?? "No build running",
    live: root.dataset.stringLive ?? "live",
    connecting: root.dataset.stringConnecting ?? "connecting",
    ended: root.dataset.stringEnded ?? "build finished",
    unreachable: root.dataset.stringUnreachable ?? "no build to show",
  };
  const note = {
    unreachable: root.dataset.noteUnreachable ?? "",
    idle: root.dataset.noteIdle ?? "",
  };

  const maxLines = Number(root.dataset.maxLines ?? MAX_LINES_DEFAULT) || MAX_LINES_DEFAULT;
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let status: Status = "connecting";
  let received = 0;

  function setStatus(next: Status): void {
    status = next;
    statusEl!.textContent = statusText(strings, next);
    root.dataset.state = next;
    if (noteEl) {
      noteEl.textContent =
        next === "unreachable" ? note.unreachable : next === "idle" ? note.idle : "";
      noteEl.hidden = noteEl.textContent === "";
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

  let source: EventSource;
  try {
    source = new EventSource(endpoint);
  } catch {
    setStatus("unreachable");
    return;
  }

  setStatus("connecting");

  source.addEventListener("open", () => {
    // Open only means the socket is up. Until a line arrives there is nothing to claim.
    if (status === "connecting" && received === 0) setStatus("connecting");
  });

  // A line of real pipeline output.
  source.addEventListener("line", (event) => {
    const data = (event as MessageEvent<string>).data;
    if (typeof data !== "string" || data.length === 0) return;
    if (status !== "live") setStatus("live");
    appendLine(data);
  });

  // The server telling us there is no build in flight. It is a fact, so we print it as one.
  source.addEventListener("idle", () => {
    setStatus("idle");
  });

  // The build finished. The lines already on screen stay; nothing is added.
  source.addEventListener("done", () => {
    setStatus("ended");
    source.close();
  });

  source.addEventListener("error", () => {
    // EventSource retries by itself while readyState is CONNECTING. Only a closed stream is a
    // verdict, and the verdict is "we have nothing real to show you", never a placeholder build.
    if (source.readyState === EventSource.CLOSED) {
      setStatus(received > 0 ? "ended" : "unreachable");
    }
  });

  window.addEventListener("beforeunload", () => source.close());
}

export function mountBuildConsoles(): void {
  document.querySelectorAll<HTMLElement>("[data-build-console]").forEach(mount);
}
