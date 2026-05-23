import { forwardRef, useRef, useState } from 'react'
import Uploady, {
  useAbortItem,
  useBatchAddListener,
  useItemProgressListener,
  useItemFinishListener,
  useItemErrorListener,
  useUploady,
} from '@rpldy/uploady'
import { retryEnhancer } from '@rpldy/retry'
import { useRetry } from '@rpldy/retry-hooks'
import { asUploadButton } from '@rpldy/upload-button'
import UploadDropZone from '@rpldy/upload-drop-zone'
import {
  UploadCloud,
  FilePlus,
  Check,
  X,
  ExternalLink,
  RotateCcw,
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  Trash2,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react'

// Where files are uploaded. Dev: the local Node server; prod: the nginx-proxied path.
const UPLOAD_URL = import.meta.env.VITE_UPLOAD_URL ?? 'http://localhost:3002/upload'

const MAX_FILES = 5
const MAX_TOTAL = 50 * 1024 * 1024 // 50 MB across the whole batch
// Images, PDFs, and Excel files. Re-validated on the server.
const ACCEPT =
  'image/*,application/pdf,.xls,.xlsx,application/vnd.ms-excel,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type Kind = 'image' | 'pdf' | 'excel' | 'other'
type Status = 'pending' | 'uploading' | 'done' | 'error'
type View = 'grid' | 'list'
type Item = {
  id: string
  name: string
  kind: Kind
  localUrl: string
  size: number
  progress: number
  status: Status
  serverUrl?: string
  error?: string
}

function kindOf(file: File): Kind {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('image/')) return 'image'
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    file.type.includes('excel') ||
    file.type.includes('spreadsheet') ||
    name.endsWith('.xls') ||
    name.endsWith('.xlsx')
  )
    return 'excel'
  return 'other'
}

function formatSize(n: number) {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// A real <button> that opens the file dialog (it only adds — upload is explicit).
const AddFilesButton = asUploadButton(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forwardRef<HTMLButtonElement, any>((props, ref) => (
    <button
      {...props}
      ref={ref}
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
    >
      <FilePlus size={16} />
      Add files
    </button>
  ))
)

function Thumb({ it, iconSize = 36 }: { it: Item; iconSize?: number }) {
  if (it.kind === 'image') {
    return <img src={it.serverUrl ?? it.localUrl} alt={it.name} className="h-full w-full object-cover" />
  }
  const Icon = it.kind === 'pdf' ? FileText : it.kind === 'excel' ? FileSpreadsheet : FileIcon
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      <Icon size={iconSize} />
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'done')
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check size={12} />
      </span>
    )
  if (status === 'error')
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-white">
        <X size={12} />
      </span>
    )
  return null
}

function Manager() {
  const [items, setItems] = useState<Item[]>([])
  const itemsRef = useRef<Item[]>([])
  itemsRef.current = items // synchronous snapshot for the add listener's limit checks
  const [notice, setNotice] = useState<string | null>(null)
  const [view, setView] = useState<View>('grid')

  const abortItem = useAbortItem()
  const { processPending } = useUploady()
  const retry = useRetry()

  // autoUpload is off, so this fires as files are *added* (not uploaded). Enforce
  // type / count / total-size here and abort anything over the limits.
  useBatchAddListener((batch) => {
    const accepted: Item[] = []
    const skipped: string[] = []
    let count = itemsRef.current.length
    let total = itemsRef.current.reduce((s, it) => s + it.size, 0)

    for (const bi of batch.items) {
      // Retried items are re-queued through this listener — skip ones we already track
      // (otherwise a retry would add a duplicate card with a colliding key).
      if (itemsRef.current.some((x) => x.id === bi.id)) continue
      const file = bi.file as File
      const kind = kindOf(file)
      if (kind === 'other') {
        abortItem(bi.id)
        skipped.push(`${file.name} — unsupported type`)
      } else if (count >= MAX_FILES) {
        abortItem(bi.id)
        skipped.push(`${file.name} — over the ${MAX_FILES}-file limit`)
      } else if (total + file.size > MAX_TOTAL) {
        abortItem(bi.id)
        skipped.push(`${file.name} — would exceed ${formatSize(MAX_TOTAL)} total`)
      } else {
        count++
        total += file.size
        accepted.push({
          id: bi.id,
          name: file.name,
          kind,
          localUrl: URL.createObjectURL(file),
          size: file.size,
          progress: 0,
          status: 'pending',
        })
      }
    }

    if (accepted.length) setItems((prev) => [...prev, ...accepted])
    setNotice(skipped.length ? `Skipped: ${skipped.join('; ')}` : null)
  })

  useItemProgressListener((item) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, status: 'uploading', progress: Math.round(item.completed) } : it
      )
    )
  })

  useItemFinishListener((item) => {
    // Grouped upload: the response carries every file in the batch — match by name.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const files = (item.uploadResponse as any)?.data?.files as
      | { name: string; url: string }[]
      | undefined
    const match = files?.find((f) => f.name === item.file.name) ?? files?.[0]
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, status: 'done', progress: 100, serverUrl: match?.url } : it
      )
    )
  })

  useItemErrorListener((item) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (item.uploadResponse as any)?.data
    const msg = (data && typeof data === 'object' ? data.error : undefined) ?? 'Upload failed'
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: 'error', error: msg } : it))
    )
  })

  const remove = (it: Item) => {
    abortItem(it.id) // cancels the queued (or in-flight) item
    URL.revokeObjectURL(it.localUrl)
    setItems((prev) => prev.filter((x) => x.id !== it.id))
  }

  const startUpload = () => {
    // The server keeps only the latest upload, so drop already-finished items, and
    // flip pending → uploading right away so the progress UI shows even on a fast
    // (localhost) upload that would otherwise jump straight to "done".
    setItems((prev) =>
      prev
        .filter((it) => it.status !== 'done')
        .map((it) => (it.status === 'pending' ? { ...it, status: 'uploading', progress: 0 } : it))
    )
    setNotice(null)
    processPending()
  }

  const doRetry = (id?: string) => {
    setItems((prev) =>
      prev.map((it) =>
        (id ? it.id === id : it.status === 'error') ? { ...it, status: 'uploading', progress: 0 } : it
      )
    )
    retry(id)
  }

  if (!items.length) return null

  const pending = items.filter((it) => it.status === 'pending').length
  const failed = items.filter((it) => it.status === 'error').length
  const uploading = items.some((it) => it.status === 'uploading')
  const active = items.filter((it) => it.status === 'uploading' || it.status === 'done')
  const overall = active.length
    ? Math.round(
        active.reduce((s, it) => s + it.size * it.progress, 0) /
          active.reduce((s, it) => s + it.size, 0)
      )
    : 0
  const totalSize = items.reduce((s, it) => s + it.size, 0)

  return (
    <div className="border-t border-border">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {items.length} file{items.length > 1 ? 's' : ''} · {formatSize(totalSize)} /{' '}
          {formatSize(MAX_TOTAL)}
        </span>

        {/* Grid / list toggle */}
        <div className="ml-auto flex items-center rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => setView('grid')}
            title="Grid view"
            aria-pressed={view === 'grid'}
            className={`flex size-7 items-center justify-center rounded ${
              view === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
            }`}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            title="List view"
            aria-pressed={view === 'list'}
            className={`flex size-7 items-center justify-center rounded ${
              view === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
            }`}
          >
            <ListIcon size={15} />
          </button>
        </div>

        {failed > 0 && (
          <button
            type="button"
            onClick={() => doRetry()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <RotateCcw size={14} />
            Retry failed ({failed})
          </button>
        )}
        {pending > 0 && (
          <button
            type="button"
            onClick={startUpload}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            <UploadCloud size={15} />
            Upload {pending} file{pending > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Overall progress bar (while a batch is uploading) */}
      {uploading && (
        <div className="px-4 pb-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${overall}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Uploading… {overall}%</p>
        </div>
      )}

      {notice && <p className="px-4 pb-2 text-xs text-destructive">{notice}</p>}

      {/* Items — grid or list */}
      {view === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 px-4 pb-4">
          {items.map((it) => (
            <figure key={it.id} className="overflow-hidden rounded-[10px] border border-border bg-card">
              <div className="relative aspect-square bg-secondary">
                <Thumb it={it} />
                {it.status === 'uploading' && (
                  <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/25">
                    <div
                      className="h-full bg-primary transition-[width] duration-200"
                      style={{ width: `${it.progress}%` }}
                    />
                  </div>
                )}
                <span className="absolute top-1.5 right-1.5">
                  {it.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => remove(it)}
                      title="Remove"
                      className="flex size-5 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
                    >
                      <Trash2 size={11} />
                    </button>
                  ) : (
                    <StatusBadge status={it.status} />
                  )}
                </span>
              </div>
              <figcaption className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                <span className="truncate text-foreground" title={it.name}>
                  {it.name}
                </span>
                <ItemAction it={it} onRetry={() => doRetry(it.id)} />
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2 px-4 pb-4">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-secondary"
            >
              <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-secondary">
                <Thumb it={it} iconSize={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-foreground" title={it.name}>
                    {it.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatSize(it.size)}</span>
                </div>
                {it.status === 'uploading' ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-primary transition-[width] duration-200"
                      style={{ width: `${it.progress}%` }}
                    />
                  </div>
                ) : (
                  <span
                    title={it.status === 'error' ? it.error : undefined}
                    className={`block truncate text-xs ${
                      it.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    {it.status === 'done'
                      ? 'Uploaded'
                      : it.status === 'error'
                        ? (it.error ?? 'Failed')
                        : 'Ready'}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {it.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => remove(it)}
                    title="Remove"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                {it.status === 'error' && (
                  <button
                    type="button"
                    onClick={() => doRetry(it.id)}
                    title="Retry"
                    className="inline-flex items-center gap-0.5 text-sm text-destructive hover:opacity-80"
                  >
                    <RotateCcw size={14} /> retry
                  </button>
                )}
                {it.status === 'done' && it.serverUrl && (
                  <a
                    href={it.serverUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="View the stored file on the server"
                    className="text-primary hover:text-primary-hover"
                  >
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The right-hand control in a grid card's caption (view link / retry / size / %).
function ItemAction({ it, onRetry }: { it: Item; onRetry: () => void }) {
  if (it.status === 'done' && it.serverUrl)
    return (
      <a
        href={it.serverUrl}
        target="_blank"
        rel="noreferrer"
        title="View the stored file on the server"
        className="shrink-0 text-primary hover:text-primary-hover"
      >
        <ExternalLink size={13} />
      </a>
    )
  if (it.status === 'error')
    return (
      <button
        type="button"
        onClick={onRetry}
        title={it.error ? `${it.error} — click to retry` : 'Retry this upload'}
        className="inline-flex shrink-0 items-center gap-0.5 text-destructive hover:opacity-80"
      >
        <RotateCcw size={12} /> retry
      </button>
    )
  if (it.status === 'uploading')
    return <span className="shrink-0 text-muted-foreground">{it.progress}%</span>
  return <span className="shrink-0 text-muted-foreground">{formatSize(it.size)}</span>
}

export function Uploader() {
  return (
    <Uploady
      destination={{ url: UPLOAD_URL }}
      accept={ACCEPT}
      multiple
      autoUpload={false}
      grouped
      maxGroupSize={MAX_FILES}
      enhancer={retryEnhancer}
    >
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <UploadDropZone onDragOverClassName="bg-secondary" className="block transition-colors">
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <UploadCloud size={22} />
            </span>
            <div>
              <p className="font-medium text-heading">Drag &amp; drop files here</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                images, PDFs, or Excel — up to {MAX_FILES} files, {formatSize(MAX_TOTAL)} total. Add,
                remove, then upload.
              </p>
            </div>
            <AddFilesButton />
          </div>
        </UploadDropZone>
        <Manager />
      </div>
    </Uploady>
  )
}
