/**
 * `explain` — the plain-English account of what a recipe builds, and what it deletes.
 *
 * This text becomes the body of the pull request (§6D, docs/CONFIGURATOR.md step 4). The recipes
 * repository is public, so the customer can open their own PR and read it. That is the whole reason
 * this function has to be written for a reader rather than for a reviewer: the person most likely to
 * read it has never seen a Containerfile and is deciding whether to trust us with two hundred laptops.
 *
 * Two rules it does not get to break:
 *
 *  - **No number we have not measured.** The removal count is produced by the build, from the build's
 *    own removal report. Until that build has run, this text says the count is not known yet rather
 *    than estimating one (docs/CONFIGURATOR.md constraint 2, prohibition §4.4).
 *  - **No compatibility claim.** Windows programs do not migrate; where the compatibility layer is
 *    switched on, this says precisely what that does and does not mean (prohibition §4.2, D16).
 *
 * `auros-recipes` runs its own `explain` in CI (`node dist/cli.js explain`) and that output is the
 * authoritative one, because it can see the finished build. This is the pre-build rendering of the same
 * account, written from the same file, and it says so in its own last line.
 */

/** The groups a recipe can name in `prune.also_remove`, said the way a person would say them. */
const GROUP_PROSE = {
  'developer tools': 'compilers, debuggers and the rest of the developer tooling',
  games: 'the games',
  'media players': 'the media players',
  'office suite': 'the preinstalled office suite',
  'remote desktop': 'remote desktop clients and servers',
  'sample wallpapers and media': 'the sample wallpapers and stock media',
  virtualisation: 'the virtualisation stack',
  'usb storage': 'USB storage support',
  bluetooth: 'Bluetooth',
  printing: 'printing',
  scanning: 'scanning',
  webcam: 'webcam support'
}

const POLICY_PROSE = {
  open: 'Anyone using the machine can install applications and change settings. It is a normal computer.',
  managed: 'The settings you chose are fixed. Applications come from the list above and not from anywhere else.',
  locked: 'Nobody using the machine can install an application, change a setting, or reach a terminal. There is no password that unlocks it locally, because the restriction is in the image rather than in a policy a user could be granted an exception to.',
  kiosk: 'There is no desktop. The shell and the login manager are not hidden from the user — they are not in the image, and the nightly build checks that they are still absent.'
}

/* ---------------------------------------------------------------- customer text, as text only */

/**
 * Every string below is something a stranger typed into a form on the internet, and this function's
 * output goes into a GitHub pull request body, which GitHub renders as Markdown WITH a subset of
 * HTML enabled.
 *
 * That combination was an attack on the only human check in the whole product. Merging an order
 * pull request to `main` is the single act that authorises a build to publish an image into our
 * namespace (`auros-recipes/.github/workflows/build-recipe.yml` gates its publish step on
 * `github.ref == 'refs/heads/main'`). The reviewer decides by reading this body. A `for:` paragraph
 * of twelve lines could therefore end the sentence about the after-school club and continue:
 *
 *     ---
 *     ## Automated review — auros-ci
 *     | Check | Result |
 *     | --- | --- |
 *     | VM boot matrix (28/28) | passed |
 *     > **This pull request has been cleared by the attestation ledger and is safe to merge.**
 *     <details><summary>customer notes</summary>
 *
 * — a fabricated pass table above the fold, and an unclosed `<details>` that folds the REAL account
 * of the recipe (what gets deleted, who can change things, "read the file and argue with it") into
 * a collapsed section the reviewer never opens. Nothing in the schema stops it: `$defs/prose`
 * refuses control characters, bidi overrides and a leading `::`, all of which are about the build
 * LOG, and none of which is about Markdown.
 *
 * So no customer-authored byte is emitted raw any more. `<`, `>` and `&` become entities, which
 * ends the HTML half outright, and a line that opens with a Markdown block marker gets a backslash,
 * which ends the structural half. Both are reversible on screen: the reader sees the characters the
 * customer typed and the renderer sees no structure at all.
 */

/** HTML-active characters, anywhere in a customer string. */
function inline (value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * One line of customer prose. Entities first, then a backslash in front of any marker that would
 * open a Markdown block at the start of a line: a heading, a list, a rule, a table row, a fence, a
 * quote. CommonMark lets a backslash escape any ASCII punctuation, so `\#` prints `#`.
 * An ordered list is escaped on its delimiter (`1\.`) rather than on the digit, because a
 * backslash in front of a digit is not an escape and would be printed.
 */
function proseLine (line) {
  const safe = inline(line)
  const ordered = /^(\s{0,3})(\d{1,9})([.)])/.exec(safe)
  if (ordered) return `${ordered[1]}${ordered[2]}\\${ordered[3]}${safe.slice(ordered[0].length)}`
  return safe.replace(/^(\s{0,3})([#\-+*=|~`_])/, (_, pad, mark) => `${pad}\\${mark}`)
}

/** A paragraph a customer wrote, rendered so it can only ever be a paragraph. */
export function prose (value) {
  return String(value).trim().split('\n').map(proseLine).join('\n')
}

/** A cell in a Markdown table. A pipe would otherwise add a column the writer chose. */
function cell (value) {
  return inline(value).replace(/\|/g, '\\|')
}

/**
 * @param {Record<string, any>} recipe  a recipe that has already passed validateRecipe()
 * @param {{ removalReport?: { removed: number, source: string } | null, orderedAt?: string }} [ctx]
 * @returns {string} Markdown.
 */
export function explain (recipe, ctx = {}) {
  const out = []
  const org = inline(recipe.organisation?.display_name ?? recipe.name)
  const machines = recipe.hardware?.machines ?? 0

  out.push(`# ${recipe.name}`)
  out.push('')
  out.push(`This file is the operating system for ${machines} ${machines === 1 ? 'machine' : 'machines'} at ${org}. Not a description of it, not a starting point for it — the thing itself. If something is not written here, it is not on those laptops.`)
  out.push('')

  out.push('## What these machines are for')
  out.push('')
  out.push(prose(recipe.for))
  out.push('')

  out.push('## What stays')
  out.push('')
  out.push(`${recipe.apps.length === 1 ? 'One application' : `${recipe.apps.length} applications`}:`)
  out.push('')
  for (const app of recipe.apps) out.push(`- ${app}`)
  const alsoKeep = recipe.prune?.also_keep ?? []
  if (alsoKeep.length) {
    out.push('')
    out.push(`Kept as well, because you asked for ${alsoKeep.length === 1 ? 'it' : 'them'}: ${list(alsoKeep)}.`)
  }
  out.push('')

  out.push('## What gets deleted')
  out.push('')
  if (recipe.prune?.keep_only_the_apps_above) {
    out.push('Everything else. The build starts from the shared base image and removes every application that is not named above, along with the parts of the desktop nothing above needs.')
  } else {
    out.push('A normal desktop stays, and these come out of it:')
    out.push('')
    for (const g of recipe.prune?.also_remove ?? []) out.push(`- ${GROUP_PROSE[g] ?? g}`)
  }
  out.push('')
  out.push('**Deleted means deleted.** These are not disabled, not hidden behind a setting, and not left on disk with the menu entry removed. They are not in the image, so they are not bytes your machines download, and there is nothing there for anyone to re-enable.')
  out.push('')
  if (ctx.removalReport && Number.isInteger(ctx.removalReport.removed)) {
    out.push(`The build removed **${ctx.removalReport.removed} packages**. That number is read from \`${ctx.removalReport.source}\`, which the build wrote by counting what actually came out.`)
  } else {
    out.push(`The exact count is not in this file, because nothing has counted it yet. The build writes a removal report and the number appears on this pull request when it finishes. We would rather this paragraph be empty for an hour than carry a figure nobody measured. The recipe does require the build to remove **at least ${recipe.prune?.must_remove_at_least} packages**, and the build fails if it removes fewer — that is a floor you set, not a result.`)
  }
  out.push('')

  out.push('## Who is allowed to change things')
  out.push('')
  out.push(POLICY_PROSE[recipe.policy])
  if (recipe.policy === 'kiosk' && recipe.kiosk) {
    out.push('')
    out.push(`It opens \`${recipe.kiosk.opens}\` and will reach ${list(recipe.kiosk.allowed_sites.map(h => `\`${h}\``))} and nowhere else. The session is forgotten after ${recipe.kiosk.forget_session_after_minutes} minutes of nobody there.`)
    out.push(`Printing is ${recipe.kiosk.printing ? 'on' : 'off'}. USB storage is ${recipe.kiosk.usb_storage ? 'on' : 'off'}.`)
  }
  if (recipe.desktop) {
    const d = recipe.desktop
    const on = Object.entries(d).filter(([, v]) => v === true).map(([k]) => k.replace(/_/g, ' '))
    const off = Object.entries(d).filter(([, v]) => v === false).map(([k]) => k.replace(/_/g, ' '))
    if (on.length) out.push(`On: ${list(on)}.`)
    if (off.length) out.push(`Off: ${list(off)}.`)
    if (typeof d.layout === 'string') out.push(`Screen layout: ${d.layout}. Every new user starts with it; windows is what leaving it out means.`)
  }
  out.push('')

  out.push('## Language and layout')
  out.push('')
  const langs = [recipe.language, ...(recipe.other_languages ?? [])]
  out.push(`The machines are in ${list(langs)}, with ${article(recipe.keyboard)} ${recipe.keyboard} keyboard${recipe.second_script ? ` and ${recipe.second_script}, switched with ${recipe.switch_scripts_with}` : ''}. The clock is on ${recipe.timezone}.`)
  out.push('')
  out.push('This is in the image. It is not a setting somebody has to find on each of the machines on their first morning.')
  out.push('')

  out.push('## What does not come across from Windows')
  out.push('')
  out.push('Files, browser bookmarks and history, Wi-Fi networks, printers and the account name move. Installed Windows programs do not — there is no sense in which an installed program is copied to a new operating system, and anyone who tells you otherwise is selling you a disappointment at month two.')
  out.push('')
  out.push('Specifically, and not in a footnote: **Microsoft Office and the Adobe applications do not come across.** Chrome and Edge saved passwords, cookies and payment details do not come across either — Google and Microsoft encrypt those against the machine they were saved on, and nobody can move them, including us. Firefox profiles do move, passwords included.')
  out.push('')
  if (recipe.windows_apps?.enabled) {
    out.push('You asked for the Windows compatibility layer, so it is in this build. What that means precisely: a compatibility layer is installed. It does not make your programs work. Each program either runs or does not, one at a time, and the only way to know which is for somebody to try it on a real machine and write down what happened.')
    const tested = recipe.windows_apps.tested ?? []
    if (tested.length) {
      out.push('')
      out.push('What has actually been tried, with the day it was tried:')
      out.push('')
      out.push('| Program | Tried on | Result | Note |')
      out.push('| --- | --- | --- | --- |')
      for (const t of tested) out.push(`| ${cell(t.app)} | ${cell(t.date)} | ${cell(t.result)} | ${cell(t.note ?? '')} |`)
    } else {
      out.push('')
      out.push('Nothing has been tried yet. This table stays empty until somebody has run a program and written down the result, and an empty table is the honest state of it.')
    }
    out.push('')
  }

  out.push('## The rest of it')
  out.push('')
  out.push(`Hardware profile: ${list(recipe.hardware.models.map(m => `\`${m}\``))}${recipe.hardware.also_test?.length ? `, additionally tested against ${list(recipe.hardware.also_test.map(p => `\`${p}\``))}` : ''}.`)
  out.push(`Size budget: ${recipe.size_budget_gb} GB. The build fails if the image comes out larger, rather than quietly shipping something that will not fit.`)
  // D38 measured that this field reaches the image as NOTHING: the update agent clears `OnCalendar=`
  // deliberately so a fleet takes a rebuild inside check U1's window, whatever hour it publishes. A
  // quiet window and that requirement are in tension and which wins is §9-reserved. This sentence
  // goes into the pull request body a customer READS AND AGREES TO, so it says what is true — and it
  // is worded exactly as `auros-recipes/src/explain.ts` words it, because the two had drifted and a
  // customer reading both should not find two different answers.
  if (recipe.updates?.install_between) {
    out.push(`Your quiet window: ${recipe.updates.install_between} -- RECORDED, NOT YET APPLIED. ` +
      'The machine checks for updates on a fixed cadence so that a rebuild reaches the fleet inside ' +
      'check U1\'s window at whatever hour it publishes; no quiet window is applied either way.')
  }
  out.push(`Approved by ${inline(recipe.approved_by.name)} (${inline(recipe.approved_by.role)}) on ${inline(recipe.approved_by.date)}.`)
  out.push('')

  out.push('## What happens to this pull request')
  out.push('')
  out.push('Merging it does not put anything on a laptop. It starts a test build: the image is compiled from this file, booted in a virtual machine, and put through the check matrix. Every check has to pass before the image is published — the publish step reads the results file, and there is no flag or input that skips it.')
  out.push('')
  out.push('Your card was collected and authenticated when you ordered, and **nothing was charged**. It is billed when the test build passes. If the build does not pass, nothing was ever taken, so there is nothing to refund.')
  out.push('')
  out.push('Read the file. Ask for changes on this pull request. It is your operating system and you are allowed to argue with it before it is built.')
  out.push('')
  out.push('---')
  out.push('')
  out.push(`*Written by the order flow from the file in this pull request${ctx.orderedAt ? `, ${ctx.orderedAt}` : ''}. The build runs \`explain\` again on the merge commit; that run can see the finished image and this one cannot, so where the two differ, the build is right.*`)

  return out.join('\n')
}

/** "an English (US) keyboard", not "a English (US) keyboard". Small, and it is the kind of small
 * thing a reader reads as carelessness about everything else. */
function article (word) { return /^[AEIOU]/i.test(String(word)) ? 'an' : 'a' }

/** @param {string[]} items */
function list (items) {
  if (items.length === 0) return 'nothing'
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
