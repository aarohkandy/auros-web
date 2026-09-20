/**
 * GET /build-console — Server-Sent Events carrying real GitHub Actions output.
 *
 * Spec §7: the build console "replaces every decorative animation impulse… It is more interesting than
 * any animation and it is true." The second half of that sentence is the engineering requirement. A
 * console that invents plausible lines between real ones is a decorative animation wearing a
 * monospaced font, and it would be worse than an animation, because an animation is not pretending.
 *
 * So there is **no synthesis anywhere in this file.** Every line emitted is derived from a field
 * GitHub returned. When there is no build, the stream says there is no build. When GitHub cannot be
 * reached, the stream says GitHub cannot be reached and offers the last real log we stored, labelled
 * with when it was stored. There is no code path that makes something up, and the sample lines in
 * `src/content/copy.ts` are the site's ILLUSTRATION state, rendered by the page, never by this stream.
 *
 * ── What is actually available (DECISION-SHEET.md B14) ──
 *
 * `GET /actions/jobs/{id}/logs` 404s while a job is running and returns a 60-second redirect only once
 * it has finished. There is no line-level live log. What does exist is job and step state, polled from
 * `GET /actions/runs/{id}/jobs`, which gives real transitions with real timestamps and real
 * conclusions. That is what this streams: coarser than a log tail, and entirely true.
 *
 * ── Why event ids are computed, not counted (DECISION-SHEET.md B16) ──
 *
 * Cloudflare's runtime updates land a few times a week and terminate in-flight requests after a 30
 * second grace period, so a stream lasting the length of a build *will* be cut. Recovery has to be
 * correct rather than lucky. The id of an event is therefore derived from the run's own structure —
 * `<runId>#<index into the ordered fact list>` — and the fact list is rebuilt deterministically from
 * the API on every poll. A client reconnecting with `Last-Event-ID` resumes at exactly the next fact,
 * with no server-side session, no replay buffer, and nothing to get out of sync.
 *
 * ── Why the headers look like that ──
 *
 * `Content-Encoding: identity` and `Cache-Control: no-transform`, because compressed SSE buffers on
 * Cloudflare today (workerd#7390), and a buffered event stream arrives in one lump at the end, which
 * is the one thing a live console must not do. A `: keepalive` comment every 15 seconds keeps
 * intermediaries from deciding the connection is idle.
 */

import { refuse } from '../lib/http.js'
import { runJobs, latestRunForBranch, rateLimitState } from '../lib/github.js'
import { githubConfig } from './order.js'
import { getOrder } from '../lib/orders.js'

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const POLL_MS = 3000
const SLOW_POLL_MS = 15000 // when GitHub's rate-limit budget is running low
const KEEPALIVE_MS = 15000
const MAX_STREAM_MS = 8 * 60 * 1000 // then tell the client to reconnect, rather than be cut mid-sentence

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx
 */
export async function handleBuildConsole (request, env, ctx) {
  if (request.method !== 'GET') return refuse(405, 'anything but a GET', 'the console is read, not written')

  const url = new URL(request.url)
  const recipe = url.searchParams.get('recipe')
  const runParam = url.searchParams.get('run')
  if (recipe !== null && !NAME.test(recipe)) {
    return refuse(400, 'this request', 'a recipe name is lowercase letters, digits and single hyphens — the same shape the schema allows')
  }
  if (runParam !== null && !/^\d{1,20}$/.test(runParam)) {
    return refuse(400, 'this request', 'a run id is a number')
  }
  if (recipe === null && runParam === null) {
    return refuse(400, 'this request', 'name a recipe or a run id — there is no "whatever is building right now", because that would leak which customers exist')
  }

  const gh = githubConfig(env)
  const lastEventId = request.headers.get('last-event-id')

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  ctx.waitUntil(pump({ writer, env, gh, recipe, runParam, lastEventId, request }))

  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-store, no-transform',
      'content-encoding': 'identity',
      'x-accel-buffering': 'no',
      connection: 'keep-alive'
    }
  })
}

/* ------------------------------------------------------------------ the stream */

async function pump ({ writer, env, gh, recipe, runParam, lastEventId, request }) {
  const encoder = new TextEncoder()
  let closed = false
  const send = async (text) => {
    if (closed) return
    try { await writer.write(encoder.encode(text)) } catch { closed = true }
  }
  const event = (name, data, id) => send(
    (id !== undefined ? `id: ${id}\n` : '') + `event: ${name}\n` + `data: ${JSON.stringify(data)}\n\n`
  )
  const comment = (text) => send(`: ${text}\n\n`)

  const started = Date.now()
  let keepaliveAt = Date.now()

  try {
    if (!gh) {
      await event('status', {
        state: 'unavailable',
        message: 'This deployment has no GitHub App configured, so there is no build to read. Nothing is being shown in place of one.'
      })
      return
    }

    /* Which run are we watching? */
    let runId = runParam
    let branch = null
    if (!runId) {
      const order = env.AUROS_KV ? await getOrder(env.AUROS_KV, recipe) : null
      branch = order?.branch ?? env.RECIPES_BASE_BRANCH ?? 'main'
      const runs = await latestRunForBranch(gh, branch)
      if (runs.status === 200 && runs.body?.workflow_runs?.length) {
        runId = String(runs.body.workflow_runs[0].id)
      }
    }

    if (!runId) {
      // The honest empty state. §7 permits motion only from something reporting a real fact; "there is
      // nothing to report" is a real fact and it gets one line, not a loop of invented ones.
      await event('idle', {
        state: 'no-build',
        recipe,
        branch,
        message: recipe
          ? `No build has run for "${recipe}" yet. When one starts, this console shows what it is doing. Nothing is being shown in the meantime, because there is nothing to show.`
          : 'There is no build to stream.'
      })
      return
    }

    let resumeFrom = 0
    if (lastEventId && lastEventId.startsWith(`${runId}#`)) {
      const n = Number(lastEventId.slice(runId.length + 1))
      if (Number.isInteger(n) && n >= 0) resumeFrom = n + 1
    }

    await event('hello', {
      runId,
      recipe,
      branch,
      resumingFrom: resumeFrom,
      source: 'GitHub Actions job and step transitions, polled. There is no line-level live log to read (see DECISION-SHEET B14), so this is state, not a log tail — and it is real state.'
    })

    let emitted = resumeFrom
    let pollMs = POLL_MS
    let finished = false

    while (!finished && Date.now() - started < MAX_STREAM_MS) {
      if (request.signal?.aborted) return

      let res
      try {
        res = await runJobs(gh, runId)
      } catch (e) {
        await degrade(env, event, runId, `could not reach GitHub (${e instanceof Error ? e.message : String(e)})`)
        return
      }

      if (res.status === 403 || res.status === 429) {
        const limits = rateLimitState(res.headers)
        if (limits.remaining === 0 || res.status === 429) {
          await degrade(env, event, runId, 'GitHub\'s API rate limit is exhausted for this installation', limits)
          return
        }
        await degrade(env, event, runId, `GitHub refused the request (HTTP ${res.status})`, limits)
        return
      }
      if (res.status === 404) {
        await event('idle', { state: 'no-build', runId, message: `Run ${runId} is not visible to this installation. Nothing is being shown in place of it.` })
        return
      }
      if (res.status !== 200) {
        await degrade(env, event, runId, `GitHub returned HTTP ${res.status}`)
        return
      }

      const limits = rateLimitState(res.headers)
      // Back off before the budget is gone, rather than discovering it is gone. Many viewers on one
      // installation share one budget, and the failure mode we are avoiding is every console going
      // dark at once during the build somebody is watching.
      pollMs = limits.remaining !== null && limits.remaining < 200 ? SLOW_POLL_MS : POLL_MS

      const facts = factsFromJobs(runId, res.body?.jobs ?? [])
      for (let i = emitted; i < facts.length; i++) {
        await event(facts[i].type, facts[i].data, `${runId}#${i}`)
      }
      emitted = Math.max(emitted, facts.length)

      const jobs = res.body?.jobs ?? []
      finished = jobs.length > 0 && jobs.every(j => j.status === 'completed')
      if (finished) {
        const conclusions = jobs.map(j => j.conclusion)
        await event('done', {
          runId,
          conclusion: conclusions.includes('failure') ? 'failure' : conclusions.every(c => c === 'success') ? 'success' : 'mixed',
          jobs: jobs.length,
          message: 'The run finished. Publishing is gated on the results file, not on this stream.'
        }, `${runId}#${facts.length}`)
        // Keep the last real log, so a later viewer during an outage gets something true and stale
        // rather than something invented and fresh.
        if (env.AUROS_KV) {
          await env.AUROS_KV.put(
            `console:last:${runId}`,
            JSON.stringify({ storedAt: new Date().toISOString(), facts: facts.slice(-400) }),
            { expirationTtl: 60 * 60 * 24 * 30 }
          )
        }
        return
      }

      if (Date.now() - keepaliveAt >= KEEPALIVE_MS) {
        await comment('keepalive')
        keepaliveAt = Date.now()
      }
      await sleep(pollMs)
    }

    if (!finished) {
      await event('reconnect', {
        runId,
        after: emitted,
        message: 'This stream has been open long enough that the runtime may cut it. Reconnect with Last-Event-ID and it resumes exactly here.'
      }, `${runId}#${emitted - 1}`)
    }
  } finally {
    try { await writer.close() } catch { /* the client went away first; that is normal */ }
  }
}

/**
 * The degraded path: say what is wrong, then offer the last REAL log if we have one.
 * There is no third option where we show a plausible log. That is the rule this whole file exists for.
 */
async function degrade (env, event, runId, why, limits) {
  const stored = env.AUROS_KV ? await env.AUROS_KV.get(`console:last:${runId}`, 'json') : null
  await event('status', {
    state: 'degraded',
    why,
    ...(limits ? { rateLimit: limits } : {}),
    showing: stored ? 'the last log we stored for this run, which is real and is old' : 'nothing',
    message: stored
      ? `Live output is unavailable right now: ${why}. What follows is the last real output we stored for this run, from ${stored.storedAt}. It is not live and it is not made up.`
      : `Live output is unavailable right now: ${why}. There is no stored log for this run, so there is nothing to show. We would rather show you nothing than show you something we invented.`
  })
  if (stored?.facts) {
    for (const [i, fact] of stored.facts.entries()) {
      await event('stale', { ...fact.data, stale: true, storedAt: stored.storedAt, originalType: fact.type }, `${runId}#stale-${i}`)
    }
  }
}

/* ------------------------------------------------------------------ facts */

/**
 * Turn the jobs payload into an ordered list of facts.
 *
 * The ordering is (job index, step number, phase) and never (timestamp), which matters more than it
 * looks: parallel jobs would let a newly-observed earlier timestamp insert itself in the middle of a
 * list a client has already consumed, shifting every index after it and breaking `Last-Event-ID`
 * resumption in a way that would be rare, silent, and impossible to reproduce. This ordering only ever
 * appends.
 *
 * Every field below comes from GitHub. Nothing is composed, estimated or filled in.
 *
 * @param {string} runId
 * @param {any[]} jobs
 */
export function factsFromJobs (runId, jobs) {
  const facts = []
  jobs.forEach((job, jobIndex) => {
    if (job.started_at) {
      facts.push({ type: 'job', data: { runId, jobIndex, job: job.name, phase: 'started', at: job.started_at, url: job.html_url ?? null } })
    }
    for (const step of [...(job.steps ?? [])].sort((a, b) => (a.number ?? 0) - (b.number ?? 0))) {
      if (step.started_at) {
        facts.push({ type: 'step', data: { runId, jobIndex, job: job.name, step: step.name, number: step.number ?? null, phase: 'started', at: step.started_at } })
      }
      if (step.status === 'completed' && step.conclusion) {
        facts.push({
          type: 'step',
          data: {
            runId,
            jobIndex,
            job: job.name,
            step: step.name,
            number: step.number ?? null,
            phase: 'completed',
            conclusion: step.conclusion,
            at: step.completed_at ?? null,
            seconds: durationSeconds(step.started_at, step.completed_at)
          }
        })
      }
    }
    if (job.status === 'completed' && job.conclusion) {
      facts.push({
        type: 'job',
        data: { runId, jobIndex, job: job.name, phase: 'completed', conclusion: job.conclusion, at: job.completed_at ?? null, seconds: durationSeconds(job.started_at, job.completed_at), url: job.html_url ?? null }
      })
    }
  })
  return facts
}

function durationSeconds (from, to) {
  if (!from || !to) return null
  const a = Date.parse(from)
  const b = Date.parse(to)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.max(0, Math.round((b - a) / 1000))
}

function sleep (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
