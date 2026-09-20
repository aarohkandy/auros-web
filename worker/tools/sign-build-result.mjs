#!/usr/bin/env node
/**
 * Sign a `/build-result` callback with the SAME CODE the Worker verifies it with.
 *
 * `worker/README.md` has always said this happens. It did not: `grep -rn 'build-result'` across
 * every repository returned the Worker, TASKS.md and PLAN.md, and nothing else. No workflow signed
 * anything, no workflow POSTed anything, and so "your card is authenticated now and billed only when
 * the test build passes" had a consumer and no producer — every order would have sat at
 * `awaiting-checkout` forever. On a product whose argument is that the machine does what the file
 * says, a README in the present tense about a thing that does not exist is an honesty defect as much
 * as a wiring one.
 *
 * So this is the producer, and it is deliberately four lines of real work around an import of
 * `lib/signature.js`. Reimplementing HMAC-SHA256 in the workflow with `openssl dgst` would have been
 * shorter and would have made the two sides agree by both reading the same paragraph of a README —
 * which is the arrangement the Worker's own comment says not to have.
 *
 *   node worker/tools/sign-build-result.mjs <body.json>
 *
 * Prints the header value to stdout. The secret comes from $BUILD_RESULT_SECRET and is never an
 * argument: arguments are visible in `ps` and in a process listing on a shared runner.
 */

import { readFileSync } from 'node:fs'
import { signPayload } from '../lib/signature.js'

const secret = process.env.BUILD_RESULT_SECRET
if (!secret) {
  console.error('sign-build-result: BUILD_RESULT_SECRET is not set. Refusing to sign with nothing — an unsigned callback is refused by the Worker anyway, and an empty secret would look like a signature.')
  process.exit(2)
}

const path = process.argv[2]
if (!path) {
  console.error('sign-build-result: usage: sign-build-result.mjs <body.json>')
  process.exit(2)
}

// The EXACT bytes that will be POSTed. The Worker verifies against the raw text it receives, before
// any JSON.parse, so signing a re-serialised object would sign a different document than the one
// sent — the difference is exactly where an attacker lives.
const body = readFileSync(path, 'utf8')
process.stdout.write(await signPayload(secret, body) + '\n')
