import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import multer from 'multer'

const DIR = fileURLToPath(new URL('.', import.meta.url))
const UPLOAD_DIR = join(DIR, 'uploads')
const PORT = process.env.PORT || 3002
// Base the browser uses to fetch stored files back. Dev: the server itself;
// prod: the nginx path that proxies to this service (set via env).
const PUBLIC_BASE = process.env.PUBLIC_BASE ?? `http://localhost:${PORT}`

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_FILES = 10
const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
])
const TTL_MS = 60 * 60 * 1000 // delete uploads older than 1h (ephemeral demo)

mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) =>
    cb(null, randomUUID() + extname(file.originalname).toLowerCase()),
})
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.has(file.mimetype)),
})

const app = express()
app.use(cors()) // dev is cross-origin; prod is same-origin via the nginx proxy

// react-uploady posts each file under the "file" field by default.
app.post('/upload', upload.array('file', MAX_FILES), (req, res) => {
  const files = (req.files ?? []).map((f) => ({
    name: f.originalname,
    size: f.size,
    mime: f.mimetype,
    url: `${PUBLIC_BASE}/files/${f.filename}`,
  }))
  res.json({ files })
})

app.get('/files/:name', (req, res) => {
  // Only ever serve from the uploads dir; no path traversal, no execution.
  const safe = req.params.name.replace(/[^a-zA-Z0-9._-]/g, '')
  const path = join(UPLOAD_DIR, safe)
  if (!safe || !existsSync(path)) return res.status(404).end()
  res.sendFile(path)
})

app.get('/health', (_req, res) => res.json({ ok: true }))

// Periodically clear old uploads so the demo can't fill the disk.
setInterval(() => {
  const now = Date.now()
  for (const f of readdirSync(UPLOAD_DIR)) {
    const p = join(UPLOAD_DIR, f)
    try {
      if (now - statSync(p).mtimeMs > TTL_MS) unlinkSync(p)
    } catch {
      /* ignore */
    }
  }
}, 10 * 60 * 1000)

app.listen(PORT, () => console.log(`upload server listening on :${PORT}`))
