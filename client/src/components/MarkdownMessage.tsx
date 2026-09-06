import ReactMarkdown from 'react-markdown';

interface MarkdownMessageProps {
  content: string;
}

/**
 * Renders assistant chat content as markdown (lists, emphasis, inline code, fences).
 */
export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="markdown-body text-sm leading-relaxed text-slate-200">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-emerald-300">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) => {
            const isFenced = typeof className === 'string' && className.startsWith('language-');
            if (isFenced) {
              return (
                <code className={`${className} font-mono text-xs text-emerald-200`} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-[0.85em] text-emerald-300"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg border border-slate-700/80 bg-slate-950 p-3 text-xs leading-relaxed last:mb-0">
              {children}
            </pre>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 text-base font-semibold text-white">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 text-sm font-semibold text-white">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 text-sm font-medium text-slate-100">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-emerald-500/40 pl-3 text-slate-400">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-slate-700" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
