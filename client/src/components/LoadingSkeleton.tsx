export function LoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <header className="border-b border-slate-800/80 bg-slate-900/50 px-8 py-5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-800" />
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
              <div className="h-3 w-48 animate-pulse rounded bg-slate-800/70" />
            </div>
          </div>
          <div className="h-8 w-28 animate-pulse rounded-full bg-slate-800" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 gap-6 p-6">
        <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-800" />
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-12">
            <div className="h-16 w-16 animate-pulse rounded-full bg-slate-800" />
            <div className="h-4 w-56 animate-pulse rounded bg-slate-800" />
            <div className="h-3 w-72 animate-pulse rounded bg-slate-800/60" />
          </div>
        </div>

        <div className="flex flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl">
          <div className="border-b border-slate-800 px-6 py-4">
            <div className="h-5 w-32 animate-pulse rounded bg-slate-800" />
          </div>
          <div className="flex flex-1 flex-col gap-4 p-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-16 animate-pulse rounded-xl bg-slate-800/60 ${i % 2 === 0 ? 'ml-12' : 'mr-12'}`}
              />
            ))}
          </div>
          <div className="border-t border-slate-800 p-4">
            <div className="h-12 animate-pulse rounded-xl bg-slate-800" />
          </div>
        </div>
      </main>

      <div className="flex items-center justify-center gap-2 pb-8 text-sm text-slate-500">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        Securing your private session…
      </div>
    </div>
  );
}
