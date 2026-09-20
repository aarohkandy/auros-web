/**
 * The build console never invents a line.
 *
 * Spec §7's claim for the console is that it is more interesting than an animation *because it is
 * true*. That claim is only worth making if it is mechanically true, so these tests check the property
 * directly: every field of every emitted fact traces back to a field GitHub returned, and a job with
 * nothing to report produces nothing rather than something plausible.
 *
 * They also check the ordering property that `Last-Event-ID` resumption depends on — that observing
 * more of a run only ever appends to the fact list, never reorders it. A reordering would shift every
 * index after it and break resumption silently, for parallel jobs only, which is the sort of bug that
 * survives for months.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { factsFromJobs } from '../routes/build-console.js'

const job = (over = {}) => ({
  name: 'build',
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-09-20T10:00:00Z',
  completed_at: '2026-09-20T10:04:00Z',
  html_url: 'https://github.com/aarohkandy/auros-recipes/actions/runs/1/job/2',
  steps: [
    { number: 1, name: 'Validate — a recipe may only ADD', status: 'completed', conclusion: 'success', started_at: '2026-09-20T10:00:05Z', completed_at: '2026-09-20T10:00:20Z' },
    { number: 2, name: 'Compile and build', status: 'completed', conclusion: 'success', started_at: '2026-09-20T10:00:20Z', completed_at: '2026-09-20T10:03:00Z' }
  ],
  ...over
})

describe('facts come from the payload and nowhere else', () => {
  test('every string in a fact appears in the payload it came from', () => {
    const payload = [job()]
    const facts = factsFromJobs('99', payload)
    const haystack = JSON.stringify(payload)
    for (const fact of facts) {
      for (const [key, value] of Object.entries(fact.data)) {
        if (typeof value !== 'string') continue
        if (['phase', 'runId'].includes(key)) continue // phase is our word for a state GitHub reported; runId is the caller's
        assert.ok(haystack.includes(value), `"${value}" is in the console output but not in what GitHub returned`)
      }
    }
  })

  test('a queued job with no timestamps produces no facts at all', () => {
    const facts = factsFromJobs('99', [{ name: 'build', status: 'queued', conclusion: null, started_at: null, steps: [] }])
    assert.deepEqual(facts, [], 'a job that has not started has nothing true to say, so it says nothing')
  })

  test('no jobs means no facts', () => {
    assert.deepEqual(factsFromJobs('99', []), [])
    assert.deepEqual(factsFromJobs('99', undefined ?? []), [])
  })

  test('a step that is running reports started and does not guess at a conclusion', () => {
    const facts = factsFromJobs('99', [job({
      status: 'in_progress',
      conclusion: null,
      completed_at: null,
      steps: [{ number: 1, name: 'booting test vm', status: 'in_progress', conclusion: null, started_at: '2026-09-20T10:00:05Z', completed_at: null }]
    })])
    const stepFacts = facts.filter(f => f.type === 'step')
    assert.equal(stepFacts.length, 1)
    assert.equal(stepFacts[0].data.phase, 'started')
    assert.equal(stepFacts[0].data.conclusion, undefined)
  })

  test('a failure is reported as a failure, not softened', () => {
    const facts = factsFromJobs('99', [job({
      conclusion: 'failure',
      steps: [{ number: 1, name: 'Check matrix', status: 'completed', conclusion: 'failure', started_at: '2026-09-20T10:00:05Z', completed_at: '2026-09-20T10:01:00Z' }]
    })])
    assert.ok(facts.some(f => f.data.conclusion === 'failure'))
  })

  test('durations are computed from the two timestamps, and are null when one is missing', () => {
    const facts = factsFromJobs('99', [job()])
    const compile = facts.find(f => f.data.step === 'Compile and build' && f.data.phase === 'completed')
    assert.equal(compile.data.seconds, 160)
    const noEnd = factsFromJobs('99', [job({ completed_at: null, conclusion: null, status: 'in_progress', steps: [] })])
    assert.ok(noEnd.every(f => f.data.seconds === undefined || f.data.seconds === null))
  })
})

describe('the fact list only ever appends', () => {
  test('observing a run later never reorders what was already emitted', () => {
    const early = factsFromJobs('99', [job({
      status: 'in_progress',
      conclusion: null,
      completed_at: null,
      steps: [{ number: 1, name: 'Validate — a recipe may only ADD', status: 'completed', conclusion: 'success', started_at: '2026-09-20T10:00:05Z', completed_at: '2026-09-20T10:00:20Z' }]
    })])
    const later = factsFromJobs('99', [job()])
    for (let i = 0; i < early.length; i++) {
      assert.deepEqual(later[i], early[i], `fact ${i} changed between polls — Last-Event-ID resumption would skip or repeat output`)
    }
    assert.ok(later.length > early.length)
  })

  test('a second, parallel job appends after the first rather than interleaving by timestamp', () => {
    const first = job({ name: 'build', started_at: '2026-09-20T10:00:00Z' })
    // This job started EARLIER in wall-clock terms. Ordering by time would insert it in front and
    // shift every index the client has already seen.
    const second = job({ name: 'lint', started_at: '2026-09-20T09:59:00Z', steps: [] })
    const facts = factsFromJobs('99', [first, second])
    assert.equal(facts[0].data.job, 'build')
    assert.equal(facts[facts.length - 1].data.job, 'lint')
  })

  test('steps are ordered by their number, not by the order the API happened to list them', () => {
    const facts = factsFromJobs('99', [job({
      steps: [
        { number: 2, name: 'second', status: 'completed', conclusion: 'success', started_at: '2026-09-20T10:01:00Z', completed_at: '2026-09-20T10:02:00Z' },
        { number: 1, name: 'first', status: 'completed', conclusion: 'success', started_at: '2026-09-20T10:00:00Z', completed_at: '2026-09-20T10:00:30Z' }
      ]
    })])
    const names = facts.filter(f => f.type === 'step').map(f => f.data.step)
    assert.deepEqual(names, ['first', 'first', 'second', 'second'])
  })
})
