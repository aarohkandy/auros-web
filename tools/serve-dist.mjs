#!/usr/bin/env node
// AUROS — a static file server for `dist/`, for Lighthouse and the no-JS check.
//
// Why ours and not `npx serve`: §4.5's spirit is that we do not pull an unpinned third party into a
// gate, and more practically, a Lighthouse score is only worth reporting if the serving behaviour
// matches production. Cloudflare Pages serves `faq.html` at BOTH `/faq` and `/faq.html`, with no
// trailing slash (astro.config.mjs sets `build.format: 'file'`), and it does NOT set
// `Cache-Control: no-store`. A server that 404s on `/faq` would score a page the visitor never sees,
// and one that disables caching would report a worse score than production for no reason.
//
// It also gzips text. That is not a thumb on the scale, it is the opposite: Cloudflare Pages
// compresses HTML, CSS and JS unconditionally, so a server that does not would measure a 90 KB
// index.html where a visitor receives 19 KB, and Lighthouse's simulated 4G would charge us ~450 ms
// of TTFB that nobody ever pays. The dishonest choice here is the uncompressed one. Fonts are
// already woff2 and are served as-is, because compressing them again costs CPU and saves nothing.
//
// Usage:
//   node tools/serve-dist.mjs [--root dist] [--port 0]
// Prints one line, `listening <origin>`, then serves until killed. Port 0 means "pick a free one",
// which is what CI wants — a fixed port is a flake waiting for another job on the same runner.

import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, normalize, extname, resolve } from 'node:path'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

const root = resolve(arg('root', 'dist'))
const port = Number(arg('port', '0'))

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

async function resolveFile(pathname) {
  // Normalise away `..` BEFORE joining: `join(root, '../etc/passwd')` escapes the root, and a
  // Lighthouse run is not a reason to ship a directory traversal into CI.
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const base = join(root, clean)
  const candidates =
    clean === '/' || clean === ''
      ? [join(root, 'index.html')]
      : [base, `${base}.html`, join(base, 'index.html')]
  for (const c of candidates) {
    if (!c.startsWith(root)) continue
    try {
      const s = await stat(c)
      if (s.isFile()) return { path: c, size: s.size }
    } catch {
      /* next candidate */
    }
  }
  return null
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const found = await resolveFile(url.pathname)
  if (!found) {
    const fallback = await resolveFile('/404.html')
    if (fallback) {
      res.writeHead(404, { 'content-type': TYPES['.html'], 'content-length': fallback.size })
      createReadStream(fallback.path).pipe(res)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
    return
  }
  const ext = extname(found.path).toLowerCase()
  const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml', '.webmanifest'])
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  const gzip = acceptsGzip && COMPRESSIBLE.has(ext)
  const headers = {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    // Matches a static host's defaults closely enough that Lighthouse's cache-policy audit reads
    // production and not this script. Hashed assets under /_astro are immutable by construction.
    'cache-control': found.path.includes('/_astro/') || ext === '.woff2'
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=600',
  }
  if (gzip) {
    headers['content-encoding'] = 'gzip'
    headers['vary'] = 'Accept-Encoding'
  } else {
    headers['content-length'] = found.size
  }
  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  const source = createReadStream(found.path)
  if (gzip) pipeline(source, createGzip({ level: 6 }), res, () => {})
  else source.pipe(res)
})

server.listen(port, '127.0.0.1', () => {
  const addr = server.address()
  process.stdout.write(`listening http://127.0.0.1:${addr.port}\n`)
})

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)))
