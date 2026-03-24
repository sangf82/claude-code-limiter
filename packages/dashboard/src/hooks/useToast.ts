import { useState, useCallback, useRef } from 'react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: ToastType;
  removing?: boolean;
}

let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, removing: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 250);
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (title: string, message: string, type: ToastType = 'info', duration: number = 5000) => {
      const id = `toast-${++toastCounter}`;
      const toast: Toast = { id, title, message, type };
      setToasts((prev) => [...prev, toast]);

      const timer = setTimeout(() => {
        removeToast(id);
      }, duration);
      timersRef.current.set(id, timer);

      return id;
    },
    [removeToast]
  );

  return { toasts, showToast, removeToast };
}
