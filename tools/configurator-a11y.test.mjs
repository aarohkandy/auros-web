#!/usr/bin/env node --test
// REGRESSION TESTS FOR THE 2026-09-20 §7 / ACCESSIBILITY AUDIT OF THE CONFIGURATOR.
//
// One named test per FATAL and MAJOR finding, plus a few cheap ones for the minors that share a
// root cause. The point is not that the code currently reads well — somebody can always refactor.
// The point is that each specific attack becomes an assertion, so the defect cannot come back
// quietly in a later rewrite by somebody who does not know it was ever there.
//
//   node --test tools/configurator-a11y.test.mjs        (from auros-web/)
//
// Wherever it can, this file reads the BUILT site, because every one of these findings was made by
// measuring the built page rather than by reading the source. Where a property lives in the shape
// of the code rather than in its output — an early return that stops a live region being written —
// it asserts on the source, and the comment above the assertion says which property is load-bearing
// so that a refactor can satisfy it a different way on purpose rather than delete it by accident.
//
// dist/ missing is a SKIP, because an unbuilt tree is not a passing claim. A file missing from a
// tree that IS built is a FAILURE, because that is how an audit gets deleted rather than fixed.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(WEB, "src");
const DIST = join(WEB, "dist");
const CFG = join(SRC, "components", "configurator");
/**
 * The control repository (SPEC.md, DECISIONS.md, BLOCKED.md). Two places, in order:
 *
 *   1. `.auros-meta/` inside this repo — a checkout placed here by CI, which is the convention
 *      `auros-recipes/src/config.ts` already uses for exactly this problem.
 *   2. the parent directory — the working layout, where all five repos sit side by side.
 *
 * Resolving only to `..` is what this file did until 2026-09-20, and it meant **`pnpm build` could
 * not run in auros-web's own CI at all**: a GitHub Actions workspace is a single checkout with no
 * siblings, so `read(META, "BLOCKED.md")` failed and took the whole build with it. Nobody had
 * noticed because no workflow in this repository had ever run `pnpm build` — `./verify` runs it
 * from the control repo, where the sibling exists. Found by the first Lighthouse workflow run
 * (D40), in 26 seconds, by trying to build.
 */
const META = [join(WEB, ".auros-meta"), resolve(WEB, "..")].find((d) =>
  existsSync(join(d, "SPEC.md")) || existsSync(join(d, "BLOCKED.md")),
) ?? resolve(WEB, "..");

const built = existsSync(DIST);

function read(...parts) {
  const p = join(...parts);
  assert.ok(
    existsSync(p),
    `${relative(META, p)} is missing. A finding is not resolved by deleting the file it was found in; ` +
      "if this file legitimately moved, move the assertion with it.\n" +
      `Resolved the control repository to: ${META}\n` +
      `It contains: ${existsSync(META) ? readdirSync(META).slice(0, 25).join(" ") : "(the directory itself does not exist)"}\n` +
      "In CI, check the control repo out to auros-web/.auros-meta/ (see .github/workflows/lighthouse.yml).",
  );
  return readFileSync(p, "utf8");
}

/** Every built HTML page. */
function pages() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (extname(p) === ".html") out.push([relative(DIST, p), readFileSync(p, "utf8")]);
    }
  };
  walk(DIST);
  return out;
}

/** The CSS a built page actually loads: its linked stylesheets plus its inline <style> blocks. */
function cssFor(html) {
  let css = "";
  for (const m of html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
    if (!href) continue;
    const file = join(DIST, href.replace(/^\//, ""));
    if (existsSync(file)) css += readFileSync(file, "utf8") + "\n";
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) css += m[1] + "\n";
  return css;
}

/** Every `<script src>` on a page whose src is not same-origin. */
function remoteScripts(html) {
  return [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)]
    .map((m) => m[1])
    .filter((src) => /^(https?:)?\/\//.test(src));
}

/** The body of a named function, so a test can assert on the ORDER of things inside it. */
function bodyOf(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name}() is gone. If it was renamed, rename it here too and keep the assertion.`);
  let i = source.indexOf("{", start);
  assert.notEqual(i, -1, `${name}() has no body`);
  let depth = 0;
  for (let j = i; j < source.length; j += 1) {
    if (source[j] === "{") depth += 1;
    else if (source[j] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(i, j + 1);
    }
  }
  assert.fail(`${name}() body is unterminated`);
}

/* ══ FATAL ════════════════════════════════════════════════════════════════════════════════════════
 *
 * THE TURNSTILE WIDGET THAT WAS NEVER LOADED.
 *
 * What shipped: `<div class="cf-turnstile" data-sitekey="…">` on the built configure page, and
 * nothing anywhere in the repository loading `challenges.cloudflare.com/turnstile/v0/api.js` — not
 * the form, not the layout, not the Worker, and no CSP. Asked in the browser, the page answered
 * `remoteScripts = []`, `.cf-turnstile children = 0`, `cf-turnstile-response input = absent`. The
 * client read that missing input, took the no-token branch, and told EVERY visitor "the human check
 * has not completed" — copy about an exceptional state that was the only state. §6D's exit condition
 * was unreachable from the built site.
 *
 * It could not be fixed by adding the script, because §4.5 permitted no script host other than
 * cdnjs and Turnstile is served from Cloudflare's own origin. **DECISIONS.md D33 took that decision:
 * §4.5 now names exactly one exempt endpoint, on this page only.** B11 is closed.
 *
 * Adding the script would still not have been enough on its own, and that is the part worth keeping
 * pinned: Turnstile's IMPLICIT renderer scans for `.cf-turnstile` once, when api.js executes, and
 * this widget lives inside a `<template>` that `configurator.client.ts` clones into the document
 * afterwards. So the loader must carry `render=explicit` and the client must call
 * `turnstile.render()` after the clone. All four halves are pinned to each other below: no widget
 * without a loader, no loader from a host §4.5 does not name, no loader without `render=explicit`,
 * and no explicit loader without a `turnstile.render()` call that happens after the clone.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
describe("fatal — the human check is either deployed or declared, never faked", () => {
  const source = read(CFG, "human-check.ts");
  const deployed = /export const HUMAN_CHECK_DEPLOYED\s*=\s*true\b/.test(source);

  /**
   * The §4.5 allow-list, as data. Two entries, and the second one is a whole URL rather than a host:
   * D33 exempts one endpoint, not a domain, so `static.cloudflareinsights.com`, any RUM beacon and
   * any other path on challenges.cloudflare.com are refused here exactly as before.
   */
  const SCRIPT_ALLOW = [
    { host: "cdnjs.cloudflare.com", path: null, why: "§4.5" },
    { host: "challenges.cloudflare.com", path: "/turnstile/v0/api.js", why: "§4.5 as amended by D33" },
  ];

  test("§4.5: the built site loads no script from a host other than cdnjs and the one D33 endpoint", { skip: skipUnbuilt() }, () => {
    for (const [page, html] of pages()) {
      for (const src of remoteScripts(html)) {
        const url = new URL(src.startsWith("//") ? `https:${src}` : src);
        const allowed = SCRIPT_ALLOW.some((a) => a.host === url.host && (a.path === null || a.path === url.pathname));
        assert.ok(
          allowed,
          `${page} loads a script from ${url.host}${url.pathname}. Spec §4.5 permits cdnjs and, since ` +
            "DECISIONS.md D33, challenges.cloudflare.com/turnstile/v0/api.js — that one endpoint and " +
            "nothing else on that host. If a human has granted a further exemption, amend §4.5 in " +
            "DECISIONS.md and SCRIPT_ALLOW above in the same commit that adds the script. Do not add " +
            "the script and leave this test as the thing that noticed.",
        );
      }
    }
  });

  // REGRESSION (fatal). The implicit renderer would never see a widget that is cloned in later, so a
  // loader without `render=explicit` is the same empty box with a script tag next to it.
  test("the Turnstile loader asks for EXPLICIT rendering, because the widget is cloned in later", { skip: skipUnbuilt() }, () => {
    if (!deployed) return;
    for (const [page, html] of pages()) {
      for (const src of remoteScripts(html)) {
        if (!src.includes("challenges.cloudflare.com/turnstile")) continue;
        assert.match(
          src,
          /[?&]render=explicit\b/,
          `${page} loads Turnstile without render=explicit. The implicit renderer scans for ` +
            ".cf-turnstile ONCE, when api.js runs; this form's widget is inside a <template> and " +
            "enters the document afterwards, so it would never be rendered and the page would be " +
            "back to an empty box the client reads a token out of.",
        );
      }
    }
  });

  // REGRESSION. The handshake that tells the client Turnstile has loaded is an inline script, and
  // the first version of it was written as an Astro expression — `{`...`}` — inside `is:inline`.
  // Astro emits an is:inline body verbatim, so the browser received a block statement containing a
  // template literal: valid JavaScript that does nothing. `window.aurosTurnstile` was never set,
  // `onload=aurosTurnstileReady` called an undefined function, and the widget stayed empty with the
  // script sitting right next to it. Found in the browser, not by a test, which is why this is one.
  test("the Turnstile onload handshake ships as real JavaScript, not as template syntax", { skip: skipUnbuilt() }, () => {
    if (!deployed) return;
    const configure = pages().find(([p]) => p.startsWith("configure"));
    assert.ok(configure, "configure.html is not in dist/");
    const html = configure[1];
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1])
      .find((body) => body.includes("aurosTurnstile"));
    assert.ok(inline, "no inline script defines window.aurosTurnstile, so api.js's onload has nothing to call");
    assert.doesNotMatch(inline, /^\s*\{\s*`/, "the handshake is an Astro expression emitted literally — valid JS that does nothing");
    assert.match(inline, /window\.aurosTurnstileReady\s*=\s*function/, "the handshake no longer defines the onload callback api.js is told to call");
  });

  // REGRESSION (fatal). And the other half: the client has to actually call render, after the clone.
  test("the client renders the widget itself, after the form template is cloned", () => {
    if (!deployed) return;
    const client = read(CFG, "configurator.client.ts");
    const clone = client.indexOf("template.content.cloneNode");
    const render = client.search(/\.render\(\s*widget/);
    assert.notEqual(clone, -1, "configurator.client.ts no longer clones the form template — if the flow moved, move this assertion");
    assert.notEqual(render, -1, "configurator.client.ts no longer calls turnstile.render() on the widget at all");
    assert.ok(
      clone < render,
      "turnstile.render() must run AFTER the form template is cloned into the document. Rendering " +
        "into a node that is still inside the <template> renders into a document fragment nobody sees.",
    );
  });

  test("a cf-turnstile widget never renders on a page that does not load Turnstile", { skip: skipUnbuilt() }, () => {
    for (const [page, html] of pages()) {
      const widgets = (html.match(/class="[^"]*\bcf-turnstile\b/g) ?? []).length;
      if (widgets === 0) continue;
      const loader = remoteScripts(html).some((s) => s.includes("challenges.cloudflare.com/turnstile"));
      assert.ok(
        loader,
        `${page} renders ${widgets} cf-turnstile element(s) and loads nothing that could hydrate them. ` +
          "That is a permanently empty box that the client then reads a token out of. If the check is " +
          "not deployed, do not render the widget — say so instead (human-check.ts).",
      );
    }
  });

  test("while the check is undeployed, the page says THAT, not that a widget failed to load", { skip: skipUnbuilt() }, () => {
    if (deployed) return;
    const configure = pages().find(([p]) => p === "configure.html" || p === join("configure", "index.html"));
    assert.ok(configure, "configure.html is not in dist/ — the configurator page is the subject of this audit");
    const [, html] = configure;

    assert.equal(
      (html.match(/\bcf-turnstile\b/g) ?? []).length,
      0,
      "HUMAN_CHECK_DEPLOYED is false but the configure page still ships a cf-turnstile element.",
    );
    assert.match(
      html,
      /human check this form needs is not deployed/,
      "HUMAN_CHECK_DEPLOYED is false, so the page must state that the check is NOT DEPLOYED. Copy that " +
        'says it "has not completed" or "has not loaded" describes a transient failure and is false: ' +
        "there is nothing that could have loaded.",
    );
    assert.match(
      html,
      /<button[^>]+data-submit[^>]*\bdisabled\b|<button[^>]+\bdisabled\b[^>]*data-submit/,
      "The submit button must ship disabled while there is no path for it to take.",
    );
  });

  test("the client cannot POST an order while the check is undeployed", () => {
    const client = read(CFG, "configurator.client.ts");
    const body = bodyOf(client, "submit");
    assert.match(client, /HUMAN_CHECK_DEPLOYED/, "configurator.client.ts no longer consults the flag at all");
    const guard = body.indexOf("HUMAN_CHECK_DEPLOYED");
    const post = body.indexOf("fetch(");
    assert.notEqual(guard, -1, "submit() no longer checks whether the human check is deployed");
    assert.notEqual(post, -1, "submit() no longer posts at all — if the flow moved, move this assertion");
    assert.ok(
      guard < post,
      "submit() must refuse before it fetches. A request that is going to be refused is not worth making, " +
        "and making it teaches the reader that our checks are decorative.",
    );
  });

  test("the blocker is recorded for the human, not just worked around", () => {
    const blocked = read(META, "BLOCKED.md");
    assert.match(
      blocked,
      /^## B11 —/m,
      "B11 is gone from BLOCKED.md. §8: when blocked, write it down and surface it. The decision about " +
        "challenges.cloudflare.com vs §4.5 has not been taken by deleting the note about it.",
    );
    if (!deployed) {
      assert.match(
        blocked.slice(blocked.indexOf("## B11 —")),
        /OPEN/,
        "HUMAN_CHECK_DEPLOYED is false, so B11 is still open and must still say so.",
      );
    }
  });
});

/* ══ MAJOR ════════════════════════════════════════════════════════════════════════════════════════
 *
 * ROWS THAT WERE `hidden` AND FULLY PAINTED.
 *
 * Measured on the built page: `label.cfg-choice[data-when-policy]` reported `hidden = true`,
 * `display = "flex"`, `height = 123.08`, checkbox `disabled = true`; and
 * `div.cfg-row[data-row="switchWith"]` reported `hidden = true`, `display = "grid"`,
 * `height = 110.64` in every policy state, including first paint. The cause is cascade origin, not
 * specificity: `[hidden] { display: none }` is a USER-AGENT rule and any author `display`
 * declaration beats it. So "Install the Windows compatibility layer anyway" and "How do people
 * switch between them?" were legible, unclickable, untabbable controls that screen readers were
 * told did not exist — WCAG 1.3.1 and 4.1.2, and §6D's "full keyboard operation".
 *
 * Fixed at the mechanism, not per row, so the next row anyone adds cannot inherit it.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
describe("major — hidden means hidden, for every row in the form", () => {
  test("the built CSS hides any [hidden] descendant of the form, outranking author display", { skip: skipUnbuilt() }, () => {
    const configure = pages().find(([p]) => p.startsWith("configure"));
    assert.ok(configure, "configure.html is not in dist/");
    const css = cssFor(configure[1]).replace(/\s+/g, " ");

    assert.match(
      css,
      /\.cfg-form\s*\[hidden\][^{}]*\{[^{}]*display\s*:\s*none\s*!important/i,
      "The form's global `[hidden] { display: none !important }` rule is gone from the built CSS.\n\n" +
        "It is not tidiness. `.cfg-row { display: grid }` and `.cfg-choice { display: flex }` are author\n" +
        "declarations and beat the user agent's `[hidden]` rule outright, regardless of specificity, so\n" +
        "without this rule `row.hidden = true` removes a row from the accessibility tree and leaves it\n" +
        "painted on screen. Per-row rules (.cfg-choice[hidden], .cfg-row[hidden]) fix today's two rows\n" +
        "and hand the same bug to the next one. If you replace this with a different mechanism — a class\n" +
        "the script owns, say — assert that mechanism here instead of deleting the assertion.",
    );
  });

  test("no rule in the configurator's CSS gives a [hidden] element a display other than none", { skip: skipUnbuilt() }, () => {
    const configure = pages().find(([p]) => p.startsWith("configure"));
    const css = cssFor(configure[1]);
    for (const m of css.matchAll(/([^{}]*\[hidden\][^{}]*)\{([^{}]*)\}/g)) {
      const display = /display\s*:\s*([^;!}]+)/i.exec(m[2]);
      if (!display) continue;
      assert.equal(
        display[1].trim(),
        "none",
        `\`${m[1].trim()}\` sets display: ${display[1].trim()} on a hidden element.`,
      );
    }
  });

  test("the script still marks the conditional rows hidden and disables their controls", () => {
    const body = bodyOf(read(CFG, "configurator.client.ts"), "syncConditionalRows");
    assert.match(body, /\.hidden\s*=/, "syncConditionalRows no longer sets `hidden` — the accessibility half of the fix");
    assert.match(body, /\.disabled\s*=/, "syncConditionalRows no longer disables the controls inside a hidden row");
  });
});

/* ══ MAJOR ════════════════════════════════════════════════════════════════════════════════════════
 *
 * TWO POLITE LIVE REGIONS THAT ANNOUNCED UNCHANGED TEXT ON EVERY KEYSTROKE.
 *
 * Measured: MutationObservers on `[data-tier]` (aria-live="polite") and `[data-submit-reason]`
 * (role="status") recorded 6 and 3 mutations while typing three characters into `#cfg-models`, a
 * free-text field that changes neither the price tier nor the blockers. The text was byte-identical
 * before and after. paintTier assigned innerHTML and paintSubmit assigned textContent
 * unconditionally on every 90ms repaint, with no equality check and no aria-busy. The panel's own
 * throttle made this worse rather than better: the careful work was done on the panel, and the two
 * regions sitting in the form beside it announced a price tier and a blocker list nobody changed.
 *
 * CONFIGURATOR.md: the panel is "announced to screen readers as a live region that updates on
 * change but does not interrupt".
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
describe("major — a live region is written only when its value changed", () => {
  const client = read(CFG, "configurator.client.ts");

  test("paintTier returns before writing when the rendered tier is unchanged", () => {
    const body = bodyOf(client, "paintTier");
    // `return;` or `return <value>;` — paintTier now also hands the tier id back to the caller, which
    // does not change the property being asserted: it still compares before it writes.
    const guard = body.search(/if\s*\([^)]*===[^)]*\)\s*return[^;]*;/);
    const write = body.indexOf("innerHTML");
    assert.notEqual(guard, -1, "paintTier no longer compares against the last rendered value before writing");
    assert.notEqual(write, -1, "paintTier no longer writes the tier — if the flow moved, move this assertion");
    assert.ok(guard < write, "paintTier must compare BEFORE it writes; an identical innerHTML still announces");
  });

  test("paintSubmit returns before writing when the reason is unchanged", () => {
    const body = bodyOf(client, "paintSubmit");
    const guard = body.search(/if\s*\([^)]*===[^)]*\)\s*return;/);
    const write = body.indexOf("textContent =");
    assert.notEqual(guard, -1, "paintSubmit no longer compares against the last rendered reason before writing");
    assert.notEqual(write, -1, "paintSubmit no longer writes the reason — if the flow moved, move this assertion");
    assert.ok(guard < write, 'paintSubmit must compare BEFORE it writes; `role="status"` is a polite live region');
  });

  test("the tier and the blocker list are inside the same aria-busy throttle as the panel", () => {
    const body = bodyOf(client, "scheduleRepaint");
    assert.match(body, /aria-busy/, "scheduleRepaint no longer manages aria-busy at all");
    assert.match(
      client,
      /liveRoots\s*=\s*\[[^\]]*panel[^\]]*tierNode[^\]]*reasonNode[^\]]*\]/s,
      "The throttled set must contain the panel root, [data-tier] and [data-submit-reason]. Throttling " +
        "only the panel is what made this finding worse than it looked: the two regions that spoke over " +
        "the visitor were the unthrottled ones.",
    );
    assert.match(body, /for\s*\(const node of liveRoots\)/, "scheduleRepaint no longer applies aria-busy across liveRoots");
  });
});

/* ══ MINOR ════════════════════════════════════════════════════════════════════════════════════════
 * The two minors that live in the same files, asserted because they were cheap to keep.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
describe("minor — the panel's incremental-paint claim, and the copy button's label", () => {
  test("paint() does not unconditionally replace the whole file", () => {
    const body = bodyOf(read(CFG, "panel.ts"), "paint");
    const unconditional = /^\s*(?:el\.)?code\.innerHTML\s*=/m.test(body.replace(/\{[^{}]*\}/g, ""));
    assert.ok(
      body.includes("sameShape"),
      "paint()'s docblock claims only the lines that actually changed are touched. Measured, it replaced " +
        "46 nodes with 51 on a single keystroke. A full innerHTML swap also destroys any text selection " +
        "inside the panel, and manual selection is the documented fallback when the clipboard API refuses. " +
        "Either keep the incremental path or delete the claim — do not leave a comment asserting a " +
        "property the code does not have.",
    );
    assert.ok(!unconditional, "paint() replaces the whole file unconditionally again");
  });

  test("the copy button's label is captured once, at mount, not inside the handler", () => {
    const client = read(CFG, "configurator.client.ts");
    const handler = client.slice(client.indexOf('el<HTMLButtonElement>(container, "[data-copy]")'));
    const listener = handler.slice(handler.indexOf("addEventListener"));
    assert.ok(
      !/const\s+\w+\s*=\s*\w*[Bb]utton\.textContent/.test(listener),
      "The label is being captured inside the click handler again. A second click within the 2000ms " +
        "restore window then captures \"Copied\" as the original and restores that, leaving the panel's " +
        "primary affordance permanently mislabelled until a reload.",
    );
    assert.match(
      handler,
      /clearTimeout\(\s*copyTimer\s*\)/,
      "The outstanding restore must be cancelled before a new one is armed.",
    );
  });
});

function skipUnbuilt() {
  return built ? false : "no dist/ — run `astro build` first; these findings were all measured on the built page";
}
