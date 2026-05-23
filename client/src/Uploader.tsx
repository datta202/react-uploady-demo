import { forwardRef, useState } from 'react'
import Uploady, {
  useBatchAddListener,
  useItemProgressListener,
  useItemFinishListener,
  useItemErrorListener,
} from '@rpldy/uploady'
import { asUploadButton } from '@rpldy/upload-button'
import UploadDropZone from '@rpldy/upload-drop-zone'
import { UploadCloud, ImagePlus, Check, X, ExternalLink } from 'lucide-react'

// Where files are uploaded. Dev: the local Node server; prod: the nginx-proxied path.
const UPLOAD_URL = import.meta.env.VITE_UPLOAD_URL ?? 'http://localhost:3002/upload'

type Status = 'uploading' | 'done' | 'error'
type Item = {
  id: string
  name: string
  localUrl: string
  progress: number
  status: Status
  serverUrl?: string
  size?: number
}

function formatSize(n?: number) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// A real <button> that opens the file dialog and uploads on click.
const AddImagesButton = asUploadButton(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forwardRef<HTMLButtonElement, any>((props, ref) => (
    <button
      {...props}
      ref={ref}
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
    >
      <ImagePlus size={16} />
      Add images
    </button>
  ))
)

function Gallery() {
  const [items, setItems] = useState<Record<string, Item>>({})

  useBatchAddListener((batch) => {
    setItems((prev) => {
      const next = { ...prev }
      for (const it of batch.items) {
        next[it.id] = {
          id: it.id,
          name: it.file.name,
          localUrl: URL.createObjectURL(it.file as File),
          progress: 0,
          status: 'uploading',
        }
      }
      return next
    })
  })

  useItemProgressListener((item) => {
    setItems((prev) =>
      prev[item.id]
        ? { ...prev, [item.id]: { ...prev[item.id], progress: Math.round(item.completed) } }
        : prev
    )
  })

  useItemFinishListener((item) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const url = (item.uploadResponse as any)?.data?.files?.[0]?.url as string | undefined
    setItems((prev) =>
      prev[item.id]
        ? {
            ...prev,
            [item.id]: {
              ...prev[item.id],
              status: 'done',
              progress: 100,
              serverUrl: url,
              size: item.file.size,
            },
          }
        : prev
    )
  })

  useItemErrorListener((item) => {
    setItems((prev) =>
      prev[item.id] ? { ...prev, [item.id]: { ...prev[item.id], status: 'error' } } : prev
    )
  })

  const list = Object.values(items)
  if (!list.length) return null

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 border-t border-border p-4">
      {list.map((it) => (
        <figure
          key={it.id}
          className="overflow-hidden rounded-[10px] border border-border bg-card"
        >
          <div className="relative aspect-square bg-secondary">
            <img
              src={it.serverUrl ?? it.localUrl}
              alt={it.name}
              className="h-full w-full object-cover"
            />
            {it.status === 'uploading' && (
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/25">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${it.progress}%` }}
                />
              </div>
            )}
            <span className="absolute top-1.5 right-1.5">
              {it.status === 'done' && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check size={12} />
                </span>
              )}
              {it.status === 'error' && (
                <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-white">
                  <X size={12} />
                </span>
              )}
            </span>
          </div>
          <figcaption className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
            <span className="truncate text-foreground" title={it.name}>
              {it.name}
            </span>
            {it.serverUrl ? (
              <a
                href={it.serverUrl}
                target="_blank"
                rel="noreferrer"
                title="View the stored file on the server"
                className="shrink-0 text-primary hover:text-primary-hover"
              >
                <ExternalLink size={13} />
              </a>
            ) : (
              <span className="shrink-0 text-muted-foreground">
                {it.status === 'uploading' ? `${it.progress}%` : formatSize(it.size)}
              </span>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

export function Uploader() {
  return (
    <Uploady destination={{ url: UPLOAD_URL }} accept="image/*" multiple>
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <UploadDropZone onDragOverClassName="bg-secondary" className="block transition-colors">
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <UploadCloud size={22} />
            </span>
            <div>
              <p className="font-medium text-heading">Drag &amp; drop images here</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                or pick files — they upload to a real Node/Express backend
              </p>
            </div>
            <AddImagesButton />
          </div>
        </UploadDropZone>
        <Gallery />
      </div>
    </Uploady>
  )
}
