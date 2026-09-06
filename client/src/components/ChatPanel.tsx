import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { sendChatMessage } from '../api/chat';
import { ApiError } from '../api/client';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { MarkdownMessage } from './MarkdownMessage';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function TypingIndicator() {
  return (
    <div className="mr-12 flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
        B
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-800/60 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
          <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
          <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
        </div>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { sessionId } = useSession();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hi, I'm **Bob** — your private financial analyst. Upload a statement on the left, then ask me anything about your spending, categories, or unusual transactions.",
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isTyping]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    if (!sessionId) {
      showToast('Session not ready. Please refresh the page.', 'error');
      return;
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const { answer } = await sendChatMessage({
        sessionId,
        userQuery: trimmed,
      });

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: answer },
      ]);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Failed to get a response from Bob.';
      showToast(message, 'error');
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl backdrop-blur-sm">
      <header className="flex items-center gap-3 border-b border-slate-800 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-400 ring-1 ring-emerald-500/30">
          B
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">Bob</h2>
          <p className="text-xs text-slate-500">Your financial AI assistant</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Online
        </span>
      </header>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${msg.role === 'user' ? 'ml-12 flex-row-reverse' : 'mr-12'}`}
          >
            {msg.role === 'assistant' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                B
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'rounded-tr-sm bg-emerald-600 text-white'
                  : 'rounded-tl-sm border border-slate-800 bg-slate-800/60 text-slate-200'
              }`}
            >
              {msg.role === 'assistant' ? (
                <MarkdownMessage content={msg.content} />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {isTyping && <TypingIndicator />}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-800 p-4"
      >
        <div className="flex items-end gap-3 rounded-xl border border-slate-700 bg-slate-900/80 p-2 focus-within:border-emerald-500/40 focus-within:ring-1 focus-within:ring-emerald-500/20">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Bob about your spending…"
            rows={1}
            disabled={isTyping}
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-slate-600">
          Enter to send · Shift+Enter for new line
        </p>
      </form>
    </section>
  );
}
