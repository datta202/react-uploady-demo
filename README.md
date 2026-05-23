# react-uploady-demo

A real file-upload demo: a **React + TypeScript + Vite** frontend built on
[react-uploady](https://react-uploady.org), uploading to a **Node.js / Express** backend
that stores the files and serves them back.

```
client/   # Vite + React + TS + Tailwind frontend (drag-drop, progress, gallery)
server/   # Express + multer upload API (stores to disk, serves files back)
```

## Run locally

```bash
npm run install:all     # install client + server deps
npm run dev             # client (Vite) + server (Express :3002) together
```

Open the client (Vite prints the URL). Drag in images or click **Add images** — they upload
to the local server, show live progress, and render from the stored file URL.

## Backend

- `POST /upload` — multipart (react-uploady's `file` field); stores to `server/uploads/`
  (gitignored) and returns `{ files: [{ name, size, mime, url }] }`.
- `GET /files/:name` — serves a stored file.
- `GET /health`.
- Limits: images only, ≤5 MB/file, ≤10/request; uploads older than ~1 h are auto-deleted
  (ephemeral demo storage).
- Env: `PORT` (default `3002`), `PUBLIC_BASE` (the base the browser uses to fetch files
  back — dev defaults to `http://localhost:3002`; in production set it to the proxied path,
  e.g. `/uploady-api`).

## Production (served from itsdatta.com)

- Build the client for the subpath: `npm run build:embed` (sets `VITE_BASE=/uploady/`) and
  serve `client/dist/` at `https://itsdatta.com/uploady/`.
- Run the server as a long-lived service (pm2/systemd) on `:3002` with
  `PUBLIC_BASE=/uploady-api`.
- nginx: `location /uploady-api/ { proxy_pass http://localhost:3002/; client_max_body_size 6m; }`
- The client posts to `/uploady-api/upload` (set `VITE_UPLOAD_URL=/uploady-api/upload` for the
  embed build).
