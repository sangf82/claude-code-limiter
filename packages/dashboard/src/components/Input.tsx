import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100
          placeholder:text-zinc-500
          focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60
          transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-red-500/60 focus:ring-red-500/40' : ''}
          ${className}
        `.trim()}
        {...props}
      />
      {hint && !error && <p className="text-xs text-zinc-500">{hint}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}

export function Select({ label, children, className = '', id, ...props }: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`
          w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100
          focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60
          transition-colors duration-150
          ${className}
        `.trim()}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
