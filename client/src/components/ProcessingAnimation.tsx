const STEPS = [
  'Parsing transaction rows',
  'Categorizing merchants with AI',
  'Building semantic search index',
  'Finalizing your ledger',
];

export function ProcessingAnimation() {
  return (
    <div className="flex flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="relative">
        <div className="animate-pulse-ring absolute inset-0 rounded-full bg-emerald-500/20 blur-xl" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-emerald-500/30 bg-slate-900 shadow-lg shadow-emerald-500/10">
          <svg
            className="h-10 w-10 animate-spin text-emerald-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      </div>

      <div className="max-w-sm space-y-3">
        <h3 className="text-lg font-semibold text-white">
          Processing Statement…
        </h3>
        <p className="text-sm leading-relaxed text-slate-400">
          Bob is reading every transaction and building your private financial
          memory. This typically takes{' '}
          <span className="font-medium text-emerald-400">4–5 minutes</span> for
          large statements — please keep this tab open.
        </p>
      </div>

      <ul className="w-full max-w-xs space-y-2 text-left">
        {STEPS.map((step, i) => (
          <li
            key={step}
            className="animate-shimmer flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-300"
            style={{ animationDelay: `${i * 0.4}s` }}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs text-emerald-400">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ul>
    </div>
  );
}
