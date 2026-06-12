import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { initSession } from '../api/session';
import { ApiError } from '../api/client';
import { useToast } from './ToastContext';

interface SessionContextValue {
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const { sessionId: id } = await initSession();
        if (!cancelled) {
          setSessionId(id);
          setError(null);
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : 'Failed to initialize session. Is the backend running?';
        if (!cancelled) {
          setError(message);
          showToast(message, 'error');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const value = useMemo(
    () => ({ sessionId, isLoading, error }),
    [sessionId, isLoading, error],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
