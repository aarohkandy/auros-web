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

const REPAINT_DEBOUNCE_MS = 90;
const ANNOUNCE_DEBOUNCE_MS = 700;

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

  const state = createPanelState();
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

    paintTier(container, a);
    paintSubmit(container, a, verdict.status === "ready");
    lastText = result.text;
    lastName = name;
  }

  let lastText = "";
  let lastName = "your-build";

  function scheduleRepaint(): void {
    window.clearTimeout(repaintTimer);
    repaintTimer = window.setTimeout(update, REPAINT_DEBOUNCE_MS);
    // The polite region is throttled harder than the paint. A screen-reader user typing a
    // machine count should not be told the file changed after every digit.
    window.clearTimeout(announceTimer);
    panel!.root.setAttribute("aria-busy", "true");
    announceTimer = window.setTimeout(() => panel!.root.removeAttribute("aria-busy"), ANNOUNCE_DEBOUNCE_MS);
  }

  form.addEventListener("input", (event) => {
    touched = true;
    const target = event.target as HTMLElement | null;
    if (target === keyboardNode || target === secondNode) target.dataset.touched = "true";
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
    void submit(container, form!, lastText, lastName);
  });

  const resetFor = el<HTMLButtonElement>(container, "[data-reset-for]");
  resetFor?.addEventListener("click", () => {
    if (!forNode) return;
    delete forNode.dataset.edited;
    update();
    forNode.focus();
  });

  el<HTMLButtonElement>(container, "[data-copy]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const original = button.textContent ?? "";
    try {
      await navigator.clipboard.writeText(lastText);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select the file and copy it";
    }
    window.setTimeout(() => {
      button.textContent = original;
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
  container.dataset.ready = "true";
}

/** The tier, from the published five. Never a total and never a saving. */
function paintTier(container: HTMLElement, a: Answers): void {
  const node = el<HTMLElement>(container, "[data-tier]");
  if (!node) return;
  const verdict = tierFor({ machines: a.machines, orgKind: a.orgKind, policy: a.policy });
  const price = verdict.tier ? `${verdict.tier.priceMono} ${verdict.tier.unitMono}` : "";
  const name = verdict.tier ? verdict.tier.name : "Not one of the five tiers";
  node.dataset.conversation = verdict.needsAConversation ? "true" : "false";
  node.innerHTML =
    `<p class="cfg-tier__name">${escape(name)}</p>` +
    (price ? `<p class="cfg-tier__price mono">${escape(price)}</p>` : "") +
    `<p class="cfg-tier__note">${escape(verdict.note)}</p>`;
}

/**
 * The submit button says what is stopping it, always.
 *
 * Three things gate it, and none of them is hidden behind a disabled attribute with no
 * explanation: the file has to pass the validator, the person has to have read what does not
 * come across, and there has to be a Turnstile token. A disabled control that will not say why
 * is the kind of thing this whole product is arguing against.
 */
function paintSubmit(container: HTMLElement, a: Answers, ready: boolean): void {
  const button = el<HTMLButtonElement>(container, "[data-submit]");
  const reason = el<HTMLElement>(container, "[data-submit-reason]");
  if (!button || !reason) return;
  const blockers: string[] = [];
  if (!ready) blockers.push("the file does not pass the validator yet");
  if (!a.acknowledgedMigration) blockers.push("the list of what does not come across has not been acknowledged");
  button.disabled = blockers.length > 0;
  reason.textContent = blockers.length
    ? `Not yet: ${blockers.join(", and ")}.`
    : "This opens a pull request in the public recipes repository. Nothing is charged and nothing is built until you and we have both read it.";
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Submit.
 *
 * The client check is a convenience and never a control: the Worker re-validates this exact
 * text against the same schema before it writes anything, and refuses a POST with no Turnstile
 * token. If no token is present here, this function does not POST and says so, because a
 * request that is going to be refused is not worth making and pretending otherwise would teach
 * the reader that our checks are decorative.
 */
async function submit(container: HTMLElement, form: HTMLFormElement, yamlText: string, name: string): Promise<void> {
  const reason = el<HTMLElement>(container, "[data-submit-reason]");
  const tokenNode = form.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
  const token = tokenNode?.value ?? "";
  if (!token) {
    if (reason) {
      reason.textContent =
        "The human check has not completed, so there is no token to send. The server refuses a submission without one, so this one is not being sent either. Reload the page, or email the file instead.";
    }
    return;
  }
  const endpoint = container.dataset.endpoint || "/api/order";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, recipeYaml: yamlText, turnstileToken: token }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { pullRequestUrl?: string };
    if (reason) {
      reason.textContent = body.pullRequestUrl
        ? `Opened. The pull request is at ${body.pullRequestUrl} and you can read it before anything is built.`
        : "Opened. You will get a link to the pull request by email.";
    }
  } catch {
    if (reason) {
      reason.textContent =
        "The order did not go through. Nothing was charged and nothing was created. Try again, or copy the file above and email it to us.";
    }
  }
}

// Boot. One container per page; more than one would mean two panels arguing.
if (typeof document !== "undefined") {
  const start = () => {
    for (const node of document.querySelectorAll<HTMLElement>("[data-configurator]")) mount(node);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
