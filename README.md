# react-uploady-demo

A real file-upload demo: a **React + TypeScript + Vite** frontend built on
[react-uploady](https://react-uploady.org), uploading to a **Node.js / Express** backend
that stores the files and serves them back.

```
client/   # Vite + React + TS + Tailwind frontend (drag-drop, staged add/remove, progress)
server/   # Express + multer upload API (stores to disk, serves files back)
```

Uses react-uploady's [add → remove → upload](https://react-uploady.org/docs/guides/AddRemoveThenUpload/)
pattern: drag in (or pick) files, drop any you don't want, then upload the batch explicitly.
Supports **images, PDFs, and Excel** files, **≤5 files**, **≤50 MB total per batch**, with a
per-file + overall **progress bar** and **retry** for failed uploads.

## Run locally

```bash
npm run install:all     # install client + server deps
npm run dev             # client (Vite) + server (Express :3002) together
```

Open the client (Vite prints the URL). Drag in files or click **Add files**, remove any you
don't want, then click **Upload** — they upload together, show live progress, and render
(images) or link (PDF/Excel) from the stored file URL. Failed uploads get a **retry** button.

Run just the backend (no client): `cd server && npm install && npm start` (listens on
`:3002`; set `PORT` to change it).

**Troubleshooting** — `EADDRINUSE: :3002` means the port is taken (an old server still
running). Free it (`lsof -ti:3002 | xargs kill`) or start with a different `PORT`. If uploaded
images don't render back, check `PUBLIC_BASE` matches how the browser reaches the server
(dev: `http://localhost:3002`; prod: the proxied path, e.g. `/uploady-api`).

## Backend

- `POST /upload` — multipart (react-uploady's `file` field, sent **grouped** as one request);
  stores to `server/uploads/` (gitignored) and returns `{ files: [{ name, size, mime, url }] }`.
- `GET /files/:name` — serves a stored file.
- `GET /health`.
- Limits: images / PDF / Excel only, ≤5 files, ≤50 MB total per batch (multer enforces per-file
  size + count; the batch total is re-checked in the handler). The type check is by the
  **declared** MIME type / extension (multer `fileFilter`), not by inspecting file content — fine
  for a demo, not a security boundary.
- **Storage = latest upload only**: each upload deletes everything else in `uploads/` and keeps
  just that batch, so storage never accumulates (no time-based cleanup needed).
- Env: `PORT` (default `3002`), `PUBLIC_BASE` (the base the browser uses to fetch files
  back — dev defaults to `http://localhost:3002`; in production set it to the proxied path,
  e.g. `/uploady-api`).

## Production (served from itsdatta.com)

- Build the client for the subpath: `npm run build:embed` (sets `VITE_BASE=/uploady/`) and
  serve `client/dist/` at `https://itsdatta.com/uploady/`.
- Run the server as a long-lived service (pm2/systemd) on `:3002` with
  `PUBLIC_BASE=/uploady-api`.
- nginx: `location /uploady-api/ { proxy_pass http://localhost:3002/; client_max_body_size 55m; }`
  (must be ≥ the 50 MB batch limit, with headroom for multipart overhead)
- The client posts to `/uploady-api/upload` (set `VITE_UPLOAD_URL=/uploady-api/upload` for the
  embed build).
