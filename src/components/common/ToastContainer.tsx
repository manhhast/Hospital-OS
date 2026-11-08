import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { ToastMessage } from '../../types/hospital';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 max-w-md w-full pointer-events-none">
      {toasts.map((toast, idx) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={`${toast.id || 'toast'}-${idx}`}
            className={`pointer-events-auto flex items-start p-4 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-300 animate-in slide-in-from-bottom-5`}
          >
            <div className="shrink-0 mr-3 mt-0.5">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              {isError && <XCircle className="w-5 h-5 text-rose-500" />}
              {isWarning && <AlertTriangle className="w-5 h-5 text-amber-500" />}
              {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5 text-blue-500" />}
            </div>

            <div className="flex-1 min-w-0 pr-2">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{toast.title}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{toast.message}</p>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
