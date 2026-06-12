import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadStatement } from '../api/upload';
import { ApiError } from '../api/client';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { ProcessingAnimation } from './ProcessingAnimation';

const ACCEPTED = {
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
};

export function FileUpload() {
  const { sessionId } = useSession();
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<{
    fileName: string;
    recordsProcessed: number;
  } | null>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!sessionId) {
        showToast('Session not ready. Please refresh the page.', 'error');
        return;
      }

      setIsProcessing(true);
      setLastResult(null);

      try {
        const result = await uploadStatement(sessionId, file);
        setLastResult({ fileName: file.name, recordsProcessed: result.recordsProcessed });
        showToast(
          `Successfully processed ${result.recordsProcessed} transactions.`,
          'success',
        );
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : 'Upload failed. Please try again.';
        showToast(message, 'error');
      } finally {
        setIsProcessing(false);
      }
    },
    [sessionId, showToast],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (file) void handleUpload(file);
    },
    [handleUpload],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: ACCEPTED,
      maxFiles: 1,
      disabled: isProcessing,
    });

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl backdrop-blur-sm">
      <header className="border-b border-slate-800 px-6 py-4">
        <h2 className="text-base font-semibold text-white">Data Ingestion</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Upload your bank statement (.csv or .xlsx)
        </p>
      </header>

      <div className="flex flex-1 flex-col">
        {isProcessing ? (
          <ProcessingAnimation />
        ) : (
          <div
            {...getRootProps()}
            className={`m-6 flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
              isDragReject
                ? 'border-red-500/50 bg-red-950/20'
                : isDragActive
                  ? 'border-emerald-400 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-900/60 hover:border-emerald-500/40 hover:bg-slate-900'
            }`}
          >
            <input {...getInputProps()} />

            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <svg
                className="h-8 w-8 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>

            <p className="text-sm font-medium text-white">
              {isDragActive ? 'Drop your statement here' : 'Drag & drop your statement'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              or click to browse — CSV or Excel
            </p>

            {isDragReject && (
              <p className="mt-3 text-xs text-red-400">
                Only .csv and .xlsx files are supported
              </p>
            )}
          </div>
        )}

        {lastResult && !isProcessing && (
          <div className="mx-6 mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-sm font-medium text-emerald-300">
              ✓ {lastResult.fileName}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {lastResult.recordsProcessed} transactions indexed and ready for chat
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
