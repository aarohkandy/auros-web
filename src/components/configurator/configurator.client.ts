/**
 * The configurator, in the browser. Plain TypeScript. No framework.
 *
 * Spec section 6D: no client-side framework. The panel is string generation and a diff
 * highlight; it does not need a virtual DOM, a hydration boundary or a runtime. Everything
 * below is form reading, one pure render call, and one repaint.
 *
 * WHY THE FORM IS CLONED FROM A `<template>`
 * `CONFIGURATOR.md` requires that the live form is JS-injected and that `<noscript>` carries a
 * `mailto:` fallback, because Turnstile has no `<noscript>` path and the Worker never accepts a
 * POST without a valid token. A `<template>` renders nothing at all when scripting is off, so
 * the no-JS visitor gets the honest fallback and nothing that looks like a working form. The
 * markup still ships in the HTML, where it can be read, diffed and audited.
 *
 * KEYBOARD
 * Every control is a real control: `input`, `select`, `textarea`, `button`, `fieldset`,
 * `legend`. Nothing here is a div pretending. That is most of accessibility done, and it is
 * also why there is no roving-tabindex code in this file — there is nothing to manage.
 */

import { defaultAnswers, slug, type Answers, type OrgKind, type Policy } from "../../lib/answers";
import { languageByName } from "../../lib/catalogue";
import { renderRecipe } from "../../lib/recipe-render";
import { validateRecipe } from "../../lib/recipe-validate";
import { tierFor } from "../../lib/pricing";
import { createPanelState, paint, type PanelElements } from "./panel";
import { HUMAN_CHECK_DEPLOYED, HUMAN_CHECK_REASON } from "./human-check";
import { ORDER_ENDPOINT, orderBody, type OrderAnswers } from "./order-request";

/**
 * Turnstile's explicit-render API, narrowed to the two calls this file makes.
 *
 * `AnswerForm.astro` loads `api.js?render=explicit&onload=aurosTurnstileReady`, and the inline
 * script beside it parks a promise on `window.aurosTurnstile` that resolves with `window.turnstile`
 * when that callback fires. The two scripts have no guaranteed ordering relative to each other, so
 * the promise is the handshake rather than a poll.
 */
type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string | undefined;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    aurosTurnstile?: Promise<TurnstileApi | undefined>;
  }
}

/** How long to wait for Cloudflare before saying so. A blocked or slow CDN is a real state. */
const TURNSTILE_LOAD_TIMEOUT_MS = 12_000;

/** Resolve once `window.turnstile` exists. The caller races this against the timeout above. */
function whenTurnstileAppears(): Promise<TurnstileApi> {
  return new Promise((resolve) => {
    const look = () => {
      if (window.turnstile) resolve(window.turnstile);
      else window.setTimeout(look, 150);
    };
    look();
  });
}

const REPAINT_DEBOUNCE_MS = 90;
const ANNOUNCE_DEBOUNCE_MS = 700;

/**
 * The two polite live regions that live in the FORM rather than in the panel.
 *
 * `[data-tier]` is `aria-live="polite"`; `[data-submit-reason]` is `role="status"`, which is the
 * same thing. Both used to be written unconditionally on every 90ms repaint, so typing three
 * characters into a free-text field that changes neither the price nor the blockers produced
 * nine mutations and nine announcements of byte-identical text. The panel was throttled
 * carefully and these two were not, which made it worse rather than better: the regions that
 * spoke over the visitor were the ones naming a price tier they had not changed.
 *
 * So: the last rendered value is kept here and an identical value is never written, and
 * `scheduleRepaint` sets `aria-busy` on these two nodes on the same timer as the panel. An
 * answer that genuinely changes the tier is announced once, after the visitor stops typing.
 */
type LiveRegions = { tierHtml: string; tierConversation: string; reason: string };

function el<T extends HTMLElement>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

function field<T extends HTMLElement>(form: HTMLFormElement, name: string): T | null {
  return form.querySelector<T>(`[name="${name}"]`);
}

function text(form: HTMLFormElement, name: string): string {
  const node = field<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(form, name);
  return node ? node.value : "";
}

function checked(form: HTMLFormElement, name: string): boolean {
  const node = field<HTMLInputElement>(form, name);
  return node ? node.checked : false;
}

function radio(form: HTMLFormElement, name: string): string | null {
  const node = form.querySelector<HTMLInputElement>(`[name="${name}"]:checked`);
  return node ? node.value : null;
}

function checkboxes(form: HTMLFormElement, name: string): string[] {
  return [...form.querySelectorAll<HTMLInputElement>(`[name="${name}"]:checked`)].map((n) => n.value);
}

function integer(form: HTMLFormElement, name: string): number | null {
  const raw = text(form, name).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

/** Read the whole form. One place, so nothing can be read two different ways. */
function readAnswers(form: HTMLFormElement): Answers {
  const base = defaultAnswers();
  const language = text(form, "language") || base.language;
  const lang = languageByName(language);
  const keyboardNode = field<HTMLSelectElement>(form, "keyboard");
  const secondNode = field<HTMLSelectElement>(form, "secondScript");
  const forNode = field<HTMLTextAreaElement>(form, "forParagraph");

  return {
    machines: integer(form, "machines"),
    age: radio(form, "age"),
    models: text(form, "models"),
    orgKind: (radio(form, "orgKind") as OrgKind | null) ?? null,

    language,
    keyboard: keyboardNode?.value || lang?.keyboard || base.keyboard,
    secondScript: secondNode?.value ?? "",
    switchWith: text(form, "switchWith") || base.switchWith,
    otherLanguages: lang?.otherLanguages ?? [],

    activities: checkboxes(form, "activities"),
    onlyThese: checked(form, "onlyThese"),

    policy: (radio(form, "policy") as Policy | null) ?? null,
    kioskOpens: text(form, "kioskOpens"),
    kioskSites: text(form, "kioskSites"),
    kioskForgetMinutes: integer(form, "kioskForgetMinutes") ?? base.kioskForgetMinutes,
    kioskPrinting: checked(form, "kioskPrinting"),
    kioskRestartAt: text(form, "kioskRestartAt") || base.kioskRestartAt,

    windowsApps: checked(form, "windowsApps"),
    acknowledgedMigration: checked(form, "acknowledgedMigration"),

    alsoAsking: text(form, "alsoAsking") || "none",

    buildName: text(form, "buildName"),
    orgDisplayName: text(form, "orgDisplayName"),
    helpdeskLabel: text(form, "helpdeskLabel"),
    helpdeskPhone: text(form, "helpdeskPhone"),
    timezone: text(form, "timezone"),
    forParagraph: forNode?.value ?? "",
    forParagraphEdited: forNode?.dataset.edited === "true",
    approverName: text(form, "approverName"),
    approverRole: text(form, "approverRole"),
    firstBootMessage: text(form, "firstBootMessage"),
  };
}

/** The panel elements, looked up once. */
function panelElements(root: HTMLElement): PanelElements | null {
  const code = el<HTMLElement>(root, "[data-code]");
  const status = el<HTMLElement>(root, "[data-status-text]");
  const findings = el<HTMLElement>(root, "[data-findings]");
  const summary = el<HTMLElement>(root, "[data-summary]");
  if (!code || !status || !findings || !summary) return null;
  return {
    root,
    code,
    status,
    findings,
    summary,
    illustration: el<HTMLElement>(root, "[data-illustration]"),
    path: el<HTMLElement>(root, "[data-path]"),
  };
}

export function mount(container: HTMLElement): void {
  const template = el<HTMLTemplateElement>(container, "template[data-configurator-form]");
  const mountPoint = el<HTMLElement>(container, "[data-form-mount]");
  const panelRoot = el<HTMLElement>(container, "[data-panel]");
  if (!template || !mountPoint || !panelRoot) return;

  mountPoint.replaceChildren(template.content.cloneNode(true));
  const form = el<HTMLFormElement>(mountPoint, "form");
  const panel = panelElements(panelRoot);
  if (!form || !panel) return;

  /**
   * Render the widget, AFTER the clone above.
   *
   * This is the half of the fatal that adding the script tag would not have fixed. Turnstile's
   * implicit renderer walks the document for `.cf-turnstile` exactly once, when `api.js` executes.
   * The widget ships inside `<template data-configurator-form>` and only enters the document on the
   * line above, so the implicit renderer never sees it: the div stayed empty, the client read
   * `[name="cf-turnstile-response"]`, found nothing, and told every visitor the check had not
   * completed. So the form is cloned first and the widget is rendered explicitly into it here.
   *
   * A failure to load is reported as itself. Cloudflare being blocked, or slow, or the key being
   * wrong, are different facts from "you are a robot", and the Worker refuses a tokenless POST
   * either way — so the honest thing on screen is which one happened and that the email path still
   * works.
   */
  let turnstileState: "pending" | "ready" | "unavailable" = HUMAN_CHECK_DEPLOYED ? "pending" : "unavailable";
  const widget = el<HTMLElement>(form, ".cf-turnstile");

  async function mountTurnstile(): Promise<void> {
    if (!HUMAN_CHECK_DEPLOYED || !widget) return;
    const sitekey = widget.dataset.sitekey;
    if (!sitekey) {
      turnstileState = "unavailable";
      return;
    }
    let api: TurnstileApi | undefined;
    try {
      api = await Promise.race([
        // The handshake the inline script sets up. If it is missing — a page that forgot it, a CSP
        // that blocked it — fall back to watching for `window.turnstile` rather than concluding on
        // the first tick that it will never arrive.
        window.aurosTurnstile ?? whenTurnstileAppears(),
        new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), TURNSTILE_LOAD_TIMEOUT_MS)),
      ]);
    } catch {
      api = undefined;
    }
    if (!api || typeof api.render !== "function") {
      turnstileState = "unavailable";
      update();
      return;
    }
    try {
      api.render(widget, {
        sitekey,
        theme: widget.dataset.theme ?? "auto",
        // A solved challenge is worth a repaint, because it removes a blocker the button names.
        callback: () => {
          turnstileState = "ready";
          update();
        },
        "expired-callback": () => {
          turnstileState = "pending";
          update();
        },
        "error-callback": () => {
          turnstileState = "pending";
          update();
        },
      });
    } catch {
      turnstileState = "unavailable";
    }
    update();
  }

  const state = createPanelState();
  const live: LiveRegions = { tierHtml: "", tierConversation: "", reason: "" };
  const tierNode = el<HTMLElement>(container, "[data-tier]");
  const reasonNode = el<HTMLElement>(container, "[data-submit-reason]");
  let touched = false;
  let repaintTimer = 0;
  let announceTimer = 0;

  // The default timezone is a fact about the machine the visitor is sitting at, offered as a
  // starting point rather than asserted. They can change it, and the file shows what they chose.
  const tzNode = field<HTMLInputElement>(form, "timezone");
  if (tzNode && !tzNode.value) {
    try {
      const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (guess && /^[A-Za-z]+(?:[_-][A-Za-z]+)*\/[A-Za-z]/.test(guess)) tzNode.value = guess;
    } catch {
      /* A browser that will not say is a browser that does not have to. */
    }
  }

  // Language drives the keyboard and the second script UNTIL somebody sets one by hand. After
  // that their choice is theirs; nothing in this form silently overwrites an answer.
  const keyboardNode = field<HTMLSelectElement>(form, "keyboard");
  const secondNode = field<HTMLSelectElement>(form, "secondScript");
  const switchRow = el<HTMLElement>(form, "[data-row='switchWith']");
  const forNode = field<HTMLTextAreaElement>(form, "forParagraph");

  function followLanguage(): void {
    const lang = languageByName(text(form!, "language"));
    if (!lang) return;
    if (keyboardNode && keyboardNode.dataset.touched !== "true") keyboardNode.value = lang.keyboard;
    if (secondNode && secondNode.dataset.touched !== "true") secondNode.value = lang.secondScript ?? "";
  }

  /**
   * Show or hide the rows whose relevance depends on an answer.
   *
   * `row.hidden` is the whole mechanism: it removes the row from the accessibility tree, and
   * `.cfg-form [hidden] { display: none !important }` in `AnswerForm.astro` is what makes it
   * remove the row from the screen as well. That `!important` is load-bearing, not tidiness —
   * `.cfg-row { display: grid }` and `.cfg-choice { display: flex }` are author declarations
   * and beat the user agent's `[hidden]` rule outright. Without it these rows stayed painted,
   * legible and unreachable: visible to a sighted keyboard user, absent to a screen reader.
   */
  function syncConditionalRows(a: Answers): void {
    for (const row of form!.querySelectorAll<HTMLElement>("[data-when-policy]")) {
      const want = (row.dataset.whenPolicy ?? "").split(" ").filter(Boolean);
      const show = a.policy !== null && want.includes(a.policy);
      row.hidden = !show;
      // A hidden control must not be reachable by keyboard, or the tab order walks into a
      // fieldset nobody can see.
      for (const control of row.querySelectorAll<HTMLInputElement>("input, select, textarea, button")) {
        control.disabled = !show;
      }
    }
    if (switchRow) switchRow.hidden = !secondNode?.value;
    if (secondNode && switchRow) {
      for (const control of switchRow.querySelectorAll<HTMLSelectElement>("select")) {
        control.disabled = !secondNode.value;
      }
    }
  }

  function update(): void {
    // Language first: it may change the keyboard and the second script, and the recipe has to be
    // rendered from what the form says AFTER that, not before.
    followLanguage();
    const a = readAnswers(form!);
    syncConditionalRows(a);

    const result = renderRecipe(a);
    const verdict = validateRecipe(result.recipe);

    // The `for:` box is pre-filled with our draft and stays in step with the answers until the
    // person edits it. It is their file; the draft exists so the box is never a blank wall with
    // a 120-character minimum behind it.
    if (forNode && forNode.dataset.edited !== "true") {
      forNode.value = result.derived.draftedFor;
    }

    const name = slug(a.buildName) || "your-build";
    paint(panel!, state, {
      lines: result.lines,
      verdict,
      path: `customers/${name}/recipe.yaml`,
      showIllustration: !touched,
      summary: {
        apps: result.derived.apps.length,
        removedGroups: result.derived.alsoRemove.length,
        keptCapabilities: result.derived.alsoKeep.length,
      },
    });

    const tier = paintTier(tierNode, live, a);
    paintSubmit(container, reasonNode, live, a, verdict.status === "ready", turnstileState);
    lastText = result.text;
    lastName = name;
    // The OBJECT, not the text. The Worker takes `recipe` as JSON and validates it with the same
    // schema this line just used; handing it YAML would mean a second parser on the server and a
    // second thing to disagree about.
    lastRecipe = result.recipe;
    lastTier = tier;
  }

  let lastText = "";
  let lastName = "your-build";
  let lastRecipe: Record<string, unknown> = {};
  let lastTier: string | null = null;

  /** Every polite region on this page, throttled together. */
  const liveRoots = [panel.root, tierNode, reasonNode].filter(Boolean) as HTMLElement[];

  function scheduleRepaint(): void {
    window.clearTimeout(repaintTimer);
    repaintTimer = window.setTimeout(update, REPAINT_DEBOUNCE_MS);
    // The polite regions are throttled harder than the paint. A screen-reader user typing a
    // machine count should not be told the file changed after every digit — and, before this
    // covered the tier and the blocker list too, they were told the price tier and the reason
    // the button was off after every digit as well, with the same words each time.
    window.clearTimeout(announceTimer);
    for (const node of liveRoots) node.setAttribute("aria-busy", "true");
    announceTimer = window.setTimeout(() => {
      for (const node of liveRoots) node.removeAttribute("aria-busy");
    }, ANNOUNCE_DEBOUNCE_MS);
  }

  form.addEventListener("input", (event) => {
    touched = true;
    const target = event.target as HTMLElement | null;
    // `target &&` is not redundant: `keyboardNode` and `secondNode` are `HTMLElement | null`, so
    // when the form has neither field the comparison is `null === null` and the next statement
    // dereferences null. Caught by `strict` in tsconfig.json.
    if (target && (target === keyboardNode || target === secondNode)) target.dataset.touched = "true";
    if (target === forNode && forNode) forNode.dataset.edited = "true";
    scheduleRepaint();
  });
  form.addEventListener("change", () => {
    touched = true;
    scheduleRepaint();
  });

  // Submitting is a deliberate act, so it never happens because someone pressed Return in a
  // text box on question one.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit(container, form!, { recipe: lastRecipe, tier: lastTier, contactEmail: text(form!, "contactEmail").trim() });
  });

  const resetFor = el<HTMLButtonElement>(container, "[data-reset-for]");
  resetFor?.addEventListener("click", () => {
    if (!forNode) return;
    delete forNode.dataset.edited;
    update();
    forNode.focus();
  });

  // The label is captured ONCE, at mount, and the outstanding restore is cancelled before a new
  // one is armed. Capturing it inside the handler meant a second click within the restore window
  // captured "Copied" as the original and restored that instead, leaving the panel's primary
  // affordance permanently mislabelled until a reload.
  const copyButton = el<HTMLButtonElement>(container, "[data-copy]");
  const copyLabel = copyButton?.textContent ?? "";
  let copyTimer = 0;
  copyButton?.addEventListener("click", async () => {
    window.clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(lastText);
      copyButton.textContent = "Copied";
    } catch {
      copyButton.textContent = "Select the file and copy it";
    }
    copyTimer = window.setTimeout(() => {
      copyButton.textContent = copyLabel;
    }, 2000);
  });

  el<HTMLButtonElement>(container, "[data-download]")?.addEventListener("click", () => {
    const blob = new Blob([lastText], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "recipe.yaml";
    link.click();
    URL.revokeObjectURL(url);
  });

  followLanguage();
  update();
  void mountTurnstile();
  container.dataset.ready = "true";
}

/**
 * The tier, from the published five. Never a total and never a saving.
 *
 * This is a polite live region, so it is written ONLY when the value differs. Assigning
 * identical `innerHTML` still mutates the DOM and still announces, and a free-text field like
 * the model list changes neither the tier nor the price.
 */
function paintTier(node: HTMLElement | null, live: LiveRegions, a: Answers): string | null {
  const verdict = tierFor({ machines: a.machines, orgKind: a.orgKind, policy: a.policy });
  if (!node) return verdict.tier?.id ?? null;
  const price = verdict.tier ? `${verdict.tier.priceMono} ${verdict.tier.unitMono}` : "";
  const name = verdict.tier ? verdict.tier.name : "Not one of the five tiers";
  const conversation = verdict.needsAConversation ? "true" : "false";
  const html =
    `<p class="cfg-tier__name">${escape(name)}</p>` +
    (price ? `<p class="cfg-tier__price mono">${escape(price)}</p>` : "") +
    `<p class="cfg-tier__note">${escape(verdict.note)}</p>`;

  if (conversation !== live.tierConversation) {
    node.dataset.conversation = conversation;
    live.tierConversation = conversation;
  }
  // The tier id goes to the Worker with the order. It is not a price the page computed: the Worker
  // re-derives the tier from the recipe's own machine count and refuses the order if the id it was
  // sent disagrees with what the answers say (routes/order.js, `tierFor`). Prices are §9-reserved
  // and this string is a label, not an amount.
  const tierId = verdict.tier?.id ?? null;
  if (html === live.tierHtml) return tierId;
  node.innerHTML = html;
  live.tierHtml = html;
  return tierId;
}

/**
 * The submit button says what is stopping it, always.
 *
 * Things gate it, and none of them is hidden behind a disabled attribute with no explanation:
 * the human check has to exist, the file has to pass the validator, and the person has to have
 * read what does not come across. A disabled control that will not say why is the kind of thing
 * this whole product is arguing against.
 *
 * The human check is checked FIRST and reported alone. The other two are things a visitor fixes
 * by answering a question; an undeployed check is not, and listing it beside them would read as
 * one more item on their to-do list. See `human-check.ts` and BLOCKED.md B11.
 *
 * `role="status"` makes this a polite live region, so — like the tier — an identical string is
 * never written back.
 */
function paintSubmit(
  container: HTMLElement,
  reason: HTMLElement | null,
  live: LiveRegions,
  a: Answers,
  ready: boolean,
  turnstile: "pending" | "ready" | "unavailable",
): void {
  const button = el<HTMLButtonElement>(container, "[data-submit]");
  if (!button || !reason) return;

  let next: string;
  if (!HUMAN_CHECK_DEPLOYED || turnstile === "unavailable") {
    button.disabled = true;
    next = HUMAN_CHECK_REASON;
  } else {
    const blockers: string[] = [];
    if (!ready) blockers.push("the file does not pass the validator yet");
    if (!a.acknowledgedMigration) blockers.push("the list of what does not come across has not been acknowledged");
    // The third gate, which the comment above this function has always claimed and the code did
    // not have: no token, no submission. It is listed with the other two because it IS something
    // the visitor fixes by doing something — the check is on the page, waiting for them.
    if (turnstile !== "ready") blockers.push("the human check beside this button has not been completed");
    button.disabled = blockers.length > 0;
    next = blockers.length
      ? `Not yet: ${blockers.join(", and ")}.`
      : "This opens a pull request in the public recipes repository. Nothing is charged and nothing is built until you and we have both read it.";
  }

  if (next === live.reason) return;
  reason.textContent = next;
  live.reason = next;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Submit.
 *
 * THE CONTRACT WITH THE WORKER, WRITTEN OUT, BECAUSE IT WAS WRONG THREE TIMES IN THIRTY LINES.
 * This function used to POST `{name, recipeYaml, turnstileToken}` to `/api/order`. The Worker has
 * no `/api/order` — that path fell through to the static 404 page, `response.ok` was false, and the
 * visitor was told "The order did not go through", so no order could ever be placed. Behind the
 * wrong URL were two more: `handleOrder` requires `{recipe: <object>, tier, turnstileToken}` and
 * 422s otherwise, and it answers with `pullRequest.url`, not `pullRequestUrl`. Three independent
 * mismatches in one function means the path had never been run end to end, so the fix is not three
 * edits — it is `worker/test/client-contract.test.js`, which builds the body THIS function builds
 * and runs it through the real `worker.fetch`.
 *
 *   POST /order-submit
 *   { recipe: <the recipe object, not YAML>, tier: <tier id>, contactEmail?, turnstileToken }
 *   201 → { ok: true, pullRequest: { number, url, branch }, payment, … }
 *
 * The client check is a convenience and never a control: the Worker re-validates this exact object
 * against the same schema before it writes anything, and refuses a POST with no Turnstile token. If
 * no token is present here this function does not POST and says so, because a request that is going
 * to be refused is not worth making and pretending otherwise would teach the reader that our checks
 * are decorative.
 */
/** The Worker's 201. Narrowed to what this function reads. */
type OrderResponse = {
  ok?: boolean;
  pullRequest?: { number?: number; url?: string; branch?: string };
  payment?: { required?: boolean; checkoutUrl?: string; because?: string };
  because?: string;
  headline?: string;
  why?: string;
};

async function submit(container: HTMLElement, form: HTMLFormElement, answers: OrderAnswers): Promise<void> {
  const reason = el<HTMLElement>(container, "[data-submit-reason]");
  const say = (message: string) => {
    if (reason) reason.textContent = message;
  };

  // Belt and braces: the button is already disabled, but a submit event can arrive from a
  // keypress in a text field in browsers that dispatch it before the disabled check. There is no
  // token to get and no request worth making.
  if (!HUMAN_CHECK_DEPLOYED) {
    say(HUMAN_CHECK_REASON);
    return;
  }
  const tokenNode = form.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
  const token = tokenNode?.value ?? "";
  if (!token) {
    say(
      "The human check has not completed, so there is no token to send. The server refuses a submission without one, so this one is not being sent either. Reload the page, or email the file instead.",
    );
    return;
  }

  // The endpoint and the body both come from `order-request.ts`, which is the one module the
  // Worker's own test suite can import — so "the client posts what the server accepts" is a test
  // rather than a hope. See worker/test/client-contract.test.js.
  const endpoint = container.dataset.endpoint || ORDER_ENDPOINT;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(orderBody(answers, token)),
    });
  } catch {
    say(
      "The order did not go through — the request never reached us. Nothing was charged and nothing was created. Try again, or copy the file above and email it to us.",
    );
    return;
  }

  let body: OrderResponse = {};
  try {
    body = (await response.json()) as OrderResponse;
  } catch {
    /* A body we cannot read is handled by the status below. */
  }

  if (!response.ok) {
    // The Worker's refusals are written to be read by a person — that is what `refuse()` is for —
    // so they are shown rather than replaced with a generic sentence of our own. Turnstile burns a
    // token on every attempt, so the widget is reset for the next one.
    if (window.turnstile) {
      try {
        window.turnstile.reset();
      } catch {
        /* Nothing to reset is not an error. */
      }
    }
    const said = body.why ?? body.because ?? body.headline;
    say(
      said
        ? `${said} Nothing was charged and nothing was created.`
        : "The order did not go through. Nothing was charged and nothing was created. Try again, or copy the file above and email it to us.",
    );
    return;
  }

  const prUrl = body.pullRequest?.url;
  const checkout = body.payment?.checkoutUrl;
  say(
    prUrl
      ? `Opened. The pull request is at ${prUrl} and you can read it before anything is built.${
          checkout ? " The card details are collected next, and nothing is charged until the test build passes." : ""
        }`
      : "Opened. You will get a link to the pull request by email.",
  );
}

// Boot. One container per page; more than one would mean two panels arguing.
if (typeof document !== "undefined") {
  const start = () => {
    for (const node of document.querySelectorAll<HTMLElement>("[data-configurator]")) mount(node);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
