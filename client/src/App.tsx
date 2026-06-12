import { ChatPanel } from './components/ChatPanel';
import { FileUpload } from './components/FileUpload';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { useSession } from './context/SessionContext';

function AppShell() {
  const { sessionId, isLoading, error } = useSession();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !sessionId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
          <svg
            className="h-7 w-7 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-white">Session unavailable</h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          {error ?? 'Could not connect to the backend.'} Make sure the server is
          running at{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-400">
            http://127.0.0.1:3000
          </code>
          .
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <header className="border-b border-slate-800/80 bg-slate-900/50 px-6 py-4 backdrop-blur-sm lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 ring-1 ring-emerald-500/30">
              <svg
                className="h-5 w-5 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white">
                Finance AI
              </h1>
              <p className="text-xs text-slate-500">
                Privacy-first personal finance dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-mono text-xs text-slate-400">
              {sessionId.slice(0, 8)}…
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 lg:flex-row lg:p-6">
        <div className="flex min-h-[420px] flex-1 flex-col lg:min-h-0">
          <FileUpload />
        </div>
        <div className="flex min-h-[520px] flex-1 flex-col lg:min-h-0">
          <ChatPanel />
        </div>
      </main>

      <footer className="border-t border-slate-800/60 px-6 py-3 text-center text-xs text-slate-600">
        Your data stays on your machine. No cloud storage.
      </footer>
    </div>
  );
}

export default function App() {
  return <AppShell />;
}
