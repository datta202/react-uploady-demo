import { useEffect } from 'react'
import { Uploader } from '@/Uploader'

// Embedded (in an iframe on itsdatta.com) when ?embed is present — drop the header.
const isEmbedded = new URLSearchParams(window.location.search).has('embed')

function App() {
  // Live theme sync from the host.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'set-theme') {
        document.documentElement.classList.toggle('dark', e.data.theme === 'dark')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  if (isEmbedded) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <Uploader />
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold text-heading">File Uploader</h1>
        <p className="mt-1 text-prose-muted">
          Drag-and-drop image uploads on{' '}
          <a
            href="https://react-uploady.org"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:text-primary-hover"
          >
            react-uploady
          </a>
          , with live progress and a real Node/Express backend that stores and serves the files.
        </p>
      </header>
      <Uploader />
    </main>
  )
}

export default App
