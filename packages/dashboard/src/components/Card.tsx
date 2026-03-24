import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
}

export function Card({ children, hover = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={`
        rounded-xl border border-zinc-800 bg-zinc-900
        ${hover ? 'hover:border-zinc-700 hover:bg-zinc-800/60 transition-colors duration-150 cursor-pointer' : ''}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = '',
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div className={`${flush ? '' : 'p-5'} ${className}`}>
      {children}
    </div>
  );
}
