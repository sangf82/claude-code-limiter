interface CreditGaugeProps {
  used: number;
  total: number;
  size?: number;
}

function usageColor(pct: number): string {
  if (pct >= 0.9) return '#ef4444';
  if (pct >= 0.7) return '#eab308';
  return '#22c55e';
}

export function CreditGauge({ used, total, size = 160 }: CreditGaugeProps) {
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const remaining = Math.max(total - used, 0);

  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - 28) / 2;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);
  const color = usageColor(pct);

  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${remaining} credits remaining of ${total}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Fill */}
        {pct > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="transition-all duration-700 ease-out"
          />
        )}
        {/* Center text */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-zinc-50 text-2xl font-bold"
          style={{ fontSize: '24px', fontWeight: 700 }}
        >
          {remaining}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-zinc-500"
          style={{ fontSize: '11px', fontWeight: 500 }}
        >
          credits left
        </text>
        <text
          x={cx}
          y={cy + 30}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-zinc-600"
          style={{ fontSize: '10px', fontWeight: 500 }}
        >
          {used} / {total} used
        </text>
      </svg>
    </div>
  );
}
