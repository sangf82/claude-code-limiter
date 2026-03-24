type BadgeVariant = 'active' | 'paused' | 'killed' | 'model' | 'default';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  killed: 'bg-red-500/10 text-red-400 border-red-500/20',
  model: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  default: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize
        ${variantClasses[variant]}
        ${className}
      `.trim()}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variant = (
    status === 'active' ? 'active' :
    status === 'paused' ? 'paused' :
    status === 'killed' ? 'killed' :
    'default'
  ) as BadgeVariant;

  return <Badge variant={variant}>{status}</Badge>;
}
