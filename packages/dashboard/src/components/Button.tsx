import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'warning';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-blue-600 hover:bg-blue-500 text-white border-blue-600 hover:border-blue-500',
  secondary:
    'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700 hover:border-zinc-600',
  danger:
    'bg-red-600/10 hover:bg-red-600/20 text-red-400 border-red-600/30 hover:border-red-500/50',
  ghost:
    'bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-transparent',
  success:
    'bg-green-600/10 hover:bg-green-600/20 text-green-400 border-green-600/30 hover:border-green-500/50',
  warning:
    'bg-yellow-600/10 hover:bg-yellow-600/20 text-yellow-400 border-yellow-600/30 hover:border-yellow-500/50',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium
        transition-all duration-150 cursor-pointer
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `.trim()}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
