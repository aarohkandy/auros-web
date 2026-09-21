// ─────────────────────────────────────────────────────────────────────────────────────────────────
// snapshot-diff — what makes `--check` a check.
//
// WHY THIS FILE EXISTS, stated as the bug it fixes.
//
// `snapshot-build-log.mjs --check` had two branches. The `--notable` one compared the whole payload
// and caught a fabricated line. The other one — for `src/lib/console/last-build.json`, the file the
// landing page, /how-it-works and /order all render — compared **only the run id**:
//
//     if (onDisk.run?.runId === snapshot.run.runId) { console.log('up to date'); process.exit(0) }
//
// So two lines that no runner ever printed were added to the committed file, the id was left alone,
// and `--check` said "up to date" and exited 0. One of them was a hardware claim (`✓ wifi associates
// · Intel 7260`) on the page whose entire argument is that we do not make hardware claims we have
// not measured. §7's build console is only worth having because it is TRUE; an id comparison does
// not check that, it checks that somebody remembered to run the tool.
//
// It also failed for the wrong reason the rest of the time: any newer run on `main` made the check
// exit 1 as "stale", which has nothing to do with whether the committed content is honest. A gate
// that is red for an unrelated reason is a gate people stop reading — and then the red that matters
// is ignored with it (D40).
//
// So: compare the CONTENT, against the run the committed file NAMES, and when it differs say WHICH
// LINE differs. `generatedAt` and `$comment` are stripped, because they move on every invocation and
// neither is something a reader sees.
//
// The second thing this file is for is the diagnostic. The notable check DID catch the fabrication
// and then printed:
//
//     on disk:     35544563774, 35543147750, …
//     would write: 35544563774, 35543147750, …
//
// — two identical lists, naming a dimension that had not changed. The one refusal that worked read
// like a spurious failure. "When an assertion fails it must print what IS there" is the rule; this
// prints the first differing line, on disk and as the runner's log reduces to now.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Keys that move on every invocation and that no reader of the page ever sees. */
export const VOLATILE_KEYS = ['generatedAt', '$comment']

/** A payload with the volatile keys removed. Non-destructive: the caller's object is untouched. */
export function stripVolatile (payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  const out = {}
  for (const [k, v] of Object.entries(payload)) {
    if (VOLATILE_KEYS.includes(k)) continue
    out[k] = v
  }
  return out
}

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The first place two payloads disagree, in reading order, as `{ path, onDisk, wouldWrite }`.
 * `null` when they are identical after stripping the volatile keys.
 *
 * Reading order matters: the caller prints ONE difference, so it had better be the earliest one
 * rather than whichever key a `Set` happened to yield first. Object keys are walked in the union of
 * both sides' insertion orders, arrays by index, and a length difference is reported at the first
 * index that only one side has — which is how an INSERTED line (the fabrication's actual shape)
 * gets reported at the line it was inserted at instead of at the end.
 */
export function firstDifference (onDisk, wouldWrite, path = []) {
  const a = path.length === 0 ? stripVolatile(onDisk) : onDisk
  const b = path.length === 0 ? stripVolatile(wouldWrite) : wouldWrite

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return { path, onDisk: a, wouldWrite: b }
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) {
      if (i >= a.length) return { path: [...path, i], onDisk: undefined, wouldWrite: b[i] }
      if (i >= b.length) return { path: [...path, i], onDisk: a[i], wouldWrite: undefined }
      const d = firstDifference(a[i], b[i], [...path, i])
      if (d) return d
    }
    return null
  }
  if (isObj(a) || isObj(b)) {
    if (!isObj(a) || !isObj(b)) return { path, onDisk: a, wouldWrite: b }
    const keys = [...Object.keys(a)]
    for (const k of Object.keys(b)) if (!keys.includes(k)) keys.push(k)
    for (const k of keys) {
      if (!(k in a)) return { path: [...path, k], onDisk: undefined, wouldWrite: b[k] }
      if (!(k in b)) return { path: [...path, k], onDisk: a[k], wouldWrite: undefined }
      const d = firstDifference(a[k], b[k], [...path, k])
      if (d) return d
    }
    return null
  }
  return Object.is(a, b) ? null : { path, onDisk: a, wouldWrite: b }
}

/** `runs[2].lines[7].text` — the path a person can paste into `jq` or search the file for. */
export const formatPath = (path) =>
  path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('').replace(/^\./, '')

const show = (v) => (v === undefined ? '(not present)' : typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v))

/**
 * The refusal, as lines to print on stderr. It names the run and the line, not a dimension that did
 * not change — the whole reason this function exists rather than a `join(', ')` of run ids.
 *
 * `runIdAt` walks back up the path to whichever run the difference sits inside, so the message is
 * the same shape for both files: the pinned set nests its lines under `runs[n]`, the latest-build
 * snapshot has one run and puts them at the top level.
 */
export function explainDifference (diff, { onDisk, wouldWrite } = {}) {
  const out = []
  const where = formatPath(diff.path)
  const runId = runIdAt(diff.path, onDisk) ?? runIdAt(diff.path, wouldWrite)

  // A differing LINE is the case this is for: say which run, which line number within that run, and
  // print both texts. Everything else falls through to the generic path/value form below.
  const li = diff.path.lastIndexOf('lines')
  if (li !== -1 && typeof diff.path[li + 1] === 'number') {
    const n = diff.path[li + 1]
    const textOf = (v) => (v === undefined ? undefined : isObj(v) ? v.text : v)
    const a = textOf(pluck(onDisk, diff.path.slice(0, li + 2)))
    const b = textOf(pluck(wouldWrite, diff.path.slice(0, li + 2)))
    out.push(`  first differing line: ${runId ? `run ${runId}, ` : ''}line ${n} (${where})`)
    out.push(`    on disk:     ${show(a)}`)
    out.push(`    would write: ${show(b)}`)
    if (a !== undefined && b !== undefined && a === b) {
      // Same text, different level/job/at. Say so, or the two identical strings above read as a
      // tool that cannot tell them apart — which is the bug this file replaced.
      out.push(`    the text matches; ${where} is what differs: ${show(diff.onDisk)} vs ${show(diff.wouldWrite)}`)
    }
    return out
  }

  out.push(`  first difference: ${runId ? `run ${runId}, ` : ''}${where}`)
  out.push(`    on disk:     ${show(diff.onDisk)}`)
  out.push(`    would write: ${show(diff.wouldWrite)}`)
  return out
}

/** The set of run ids on each side, and only when they actually differ. */
export function runIdSets (onDisk, wouldWrite) {
  const ids = (p) => {
    if (Array.isArray(p?.runs)) return p.runs.map((r) => r?.run?.runId)
    if (p?.run?.runId != null) return [p.run.runId]
    return []
  }
  const a = ids(onDisk)
  const b = ids(wouldWrite)
  const same = a.length === b.length && a.every((v, i) => v === b[i])
  return same ? null : { onDisk: a, wouldWrite: b }
}

function pluck (root, path) {
  let cur = root
  for (const p of path) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

function runIdAt (path, payload) {
  if (!payload) return null
  const i = path.indexOf('runs')
  if (i !== -1 && typeof path[i + 1] === 'number') return payload.runs?.[path[i + 1]]?.run?.runId ?? null
  return payload.run?.runId ?? null
}
