interface ProgressBarProps {
  label: string;
  used: number;
  limit: number;
  large?: boolean;
}

function getProgressColor(pct: number): string {
  if (pct >= 0.9) return 'bg-red-500';
  if (pct >= 0.7) return 'bg-yellow-500';
  return 'bg-blue-500';
}

function getGradient(pct: number): string {
  if (pct >= 0.9) return 'bg-gradient-to-r from-red-600 to-red-400';
  if (pct >= 0.7) return 'bg-gradient-to-r from-yellow-600 to-yellow-400';
  return 'bg-gradient-to-r from-blue-600 to-blue-400';
}

export function ProgressBar({ label, used, limit, large = false }: ProgressBarProps) {
  const pct = limit > 0 ? Math.min(used / limit, 1) : 0;
  const valStr = limit > 0 ? `${used} / ${limit}` : limit === -1 ? `${used} / unlimited` : `${used}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 capitalize">{label}</span>
        <span className="text-xs font-mono text-zinc-500">{valStr}</span>
      </div>
      <div className={`w-full rounded-full bg-zinc-800 overflow-hidden ${large ? 'h-2.5' : 'h-1.5'}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${getGradient(pct)}`}
          style={{ width: `${(pct * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

export function MiniProgress({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`w-full h-1 rounded-full bg-zinc-800 overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full ${getProgressColor(pct)}`}
        style={{ width: `${(Math.min(pct, 1) * 100).toFixed(1)}%` }}
      />
    </div>
  );
}
