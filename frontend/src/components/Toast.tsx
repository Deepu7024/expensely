import React, { useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export interface ToastMessage {
  id: number;
  text: string;
  variant: 'success' | 'error';
}

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export default function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isSuccess = toast.variant === 'success';

  return (
    <div
      className={`pointer-events-auto flex w-80 animate-fade-in items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-glow-lg backdrop-blur ${
        isSuccess
          ? 'border-emerald-500/25 bg-zinc-900/95 text-emerald-200'
          : 'border-red-500/25 bg-zinc-900/95 text-red-200'
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />
      ) : (
        <XCircle size={18} className="mt-0.5 shrink-0 text-red-400" />
      )}
      <span className="text-zinc-200">{toast.text}</span>
    </div>
  );
}
