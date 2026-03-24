import type { Toast as ToastType, ToastType as ToastVariant } from '../hooks/useToast';

interface ToastContainerProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

const icons: Record<ToastVariant, string> = {
  info: 'i',
  success: '\u2713',
  warning: '!',
  error: '\u00D7',
};

const iconBg: Record<ToastVariant, string> = {
  info: 'bg-blue-500/20 text-blue-400',
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  error: 'bg-red-500/20 text-red-400',
};

const borderColor: Record<ToastVariant, string> = {
  info: 'border-blue-500/20',
  success: 'border-green-500/20',
  warning: 'border-yellow-500/20',
  error: 'border-red-500/20',
};

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border
            bg-zinc-900/95 backdrop-blur-sm shadow-lg
            ${borderColor[toast.type]}
            ${toast.removing ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
            transition-all duration-250
          `}
          style={{
            animation: toast.removing ? undefined : 'toastSlideIn 0.25s ease-out',
          }}
          role="alert"
        >
          <div
            className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${iconBg[toast.type]}`}
          >
            {icons[toast.type]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-100">{toast.title}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{toast.message}</p>
          </div>
          <button
            onClick={() => onRemove(toast.id)}
            className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
