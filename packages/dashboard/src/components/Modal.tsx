import { useEffect, useCallback, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({ open, onClose, children, size = 'md' }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Content */}
      <div
        className={`
          relative w-full ${sizeClasses[size]} bg-zinc-900 border border-zinc-800
          rounded-xl shadow-2xl overflow-hidden animate-slide-up
        `}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
      <h3 className="text-lg font-semibold text-zinc-50">{children}</h3>
      {onClose && (
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-zinc-800 cursor-pointer"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function ModalBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-5 max-h-[70vh] overflow-y-auto ${className}`}>
      {children}
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-900/50">
      {children}
    </div>
  );
}
