import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
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

const MAX_FILES = 5
const MAX_TOTAL = 50 * 1024 * 1024 // 50 MB across the whole batch
const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
])
// Some browsers send .xls/.xlsx as octet-stream — accept by extension too.
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.pdf', '.xls', '.xlsx'])

mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => cb(null, randomUUID() + extname(file.originalname).toLowerCase()),
})
const upload = multer({
  storage,
  // Per-file cap = the whole-batch cap; the total is checked again below.
  limits: { fileSize: MAX_TOTAL, files: MAX_FILES },
  fileFilter: (_req, file, cb) =>
    cb(null, ALLOWED.has(file.mimetype) || ALLOWED_EXT.has(extname(file.originalname).toLowerCase())),
})

// Delete everything in the uploads dir except the named files (keep only the
// latest upload — no separate cleanup/janitor needed).
function keepOnly(filenames) {
  const keep = new Set(filenames)
  for (const f of readdirSync(UPLOAD_DIR)) {
    if (!keep.has(f)) {
      try {
        unlinkSync(join(UPLOAD_DIR, f))
      } catch {
        /* ignore */
      }
    }
  }
}

const app = express()
app.use(cors()) // dev is cross-origin; prod is same-origin via the nginx proxy

// react-uploady posts the files under the "file" field (grouped → one request).
app.post('/upload', upload.array('file', MAX_FILES), (req, res) => {
  const uploaded = req.files ?? []
  // Nothing valid got through fileFilter — don't disturb what's already stored.
  if (!uploaded.length) {
    return res.status(400).json({ error: 'No supported files in the upload' })
  }
  const total = uploaded.reduce((s, f) => s + f.size, 0)

  // Reject an over-budget batch without disturbing what's already stored.
  if (total > MAX_TOTAL) {
    for (const f of uploaded) {
      try {
        unlinkSync(f.path)
      } catch {
        /* ignore */
      }
    }
    return res.status(413).json({ error: `Batch exceeds ${MAX_TOTAL / 1024 / 1024} MB` })
  }

  // This batch becomes the only thing in storage.
  keepOnly(uploaded.map((f) => f.filename))

  res.json({
    files: uploaded.map((f) => ({
      name: f.originalname,
      size: f.size,
      mime: f.mimetype,
      url: `${PUBLIC_BASE}/files/${f.filename}`,
    })),
  })
})

app.get('/files/:name', (req, res) => {
  // Only ever serve from the uploads dir; no path traversal, no execution.
  const safe = req.params.name.replace(/[^a-zA-Z0-9._-]/g, '')
  const path = join(UPLOAD_DIR, safe)
  if (!safe || !existsSync(path)) return res.status(404).end()
  res.sendFile(path)
})

app.get('/health', (_req, res) => res.json({ ok: true }))

// Turn multer rejections (size/count) into JSON the client can show.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? `A file exceeds the ${MAX_TOTAL / 1024 / 1024} MB limit`
        : err.code === 'LIMIT_FILE_COUNT'
          ? `Too many files (max ${MAX_FILES})`
          : err.message
    return res.status(413).json({ error: msg })
  }
  res.status(500).json({ error: 'Upload failed' })
})

app.listen(PORT, () => console.log(`upload server listening on :${PORT}`))
