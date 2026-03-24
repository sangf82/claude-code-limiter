import { useEffect, useRef, useCallback } from 'react';

/* ================================================================
   Canvas chart helpers — ported from charts.js
   ================================================================ */

const COLORS = {
  bg: '#09090b',
  cardBg: '#18181b',
  border: '#27272a',
  textPrimary: '#fafafa',
  textMuted: '#71717a',
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#a855f7',
  orange: '#f97316',
  track: '#1c1c1e',
};

const MODEL_COLORS: Record<string, string> = {
  opus: COLORS.purple,
  sonnet: COLORS.blue,
  haiku: COLORS.green,
  default: COLORS.orange,
};

function dpr(): number {
  return window.devicePixelRatio || 1;
}

function setupCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D {
  const ratio = dpr();
  canvas.width = cssW * ratio;
  canvas.height = cssH * ratio;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(ratio, ratio);
  return ctx;
}

function adjustAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w < 0) w = 0;
  if (r > h / 2) r = h / 2;
  if (r > w / 2) r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function formatDay(day: string): string {
  if (!day) return '';
  const parts = day.split('-');
  if (parts.length < 3) return day;
  return `${parts[1]}/${parts[2]}`;
}

/* ================================================================
   HorizontalBarChart
   ================================================================ */
interface BarItem {
  label: string;
  value: number;
  limit: number;
  color?: string;
}

export function HorizontalBarChart({ data }: { data: BarItem[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data || data.length === 0) return;

    const barHeight = 22;
    const barGap = 32;
    const labelWidth = 70;
    const valueWidth = 80;
    const padding = { top: 8, right: 12, bottom: 8, left: 4 };
    const totalH = padding.top + data.length * (barHeight + barGap) - barGap + padding.bottom;
    let cssW = container.clientWidth;
    if (cssW < 200) cssW = 400;

    const ctx = setupCanvas(canvas, cssW, totalH);
    const barAreaW = cssW - labelWidth - valueWidth - padding.left - padding.right;

    let maxVal = 0;
    for (const item of data) {
      const cmp = item.limit > 0 ? item.limit : item.value;
      if (cmp > maxVal) maxVal = cmp;
    }
    if (maxVal === 0) maxVal = 1;

    for (let j = 0; j < data.length; j++) {
      const item = data[j];
      const y = padding.top + j * (barHeight + barGap);
      const barX = padding.left + labelWidth;

      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '500 12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, barX - 10, y + barHeight / 2);

      roundRect(ctx, barX, y, barAreaW, barHeight, 4);
      ctx.fillStyle = COLORS.track;
      ctx.fill();

      let pct = item.limit > 0 ? item.value / item.limit : (item.value > 0 ? 1 : 0);
      if (pct > 1) pct = 1;
      const fillW = barAreaW * pct;
      if (fillW > 0) {
        roundRect(ctx, barX, y, fillW, barHeight, 4);
        const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
        const barColor = item.color || MODEL_COLORS[item.label.toLowerCase()] || COLORS.blue;
        grad.addColorStop(0, barColor);
        grad.addColorStop(1, adjustAlpha(barColor, 0.7));
        ctx.fillStyle = grad;
        ctx.fill();
      }

      if (item.limit > 0) {
        let markerX = barX + barAreaW * (item.limit / maxVal);
        if (markerX > barX + barAreaW) markerX = barX + barAreaW;
        ctx.strokeStyle = COLORS.textPrimary;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(markerX, y - 3);
        ctx.lineTo(markerX, y + barHeight + 3);
        ctx.stroke();
      }

      ctx.fillStyle = COLORS.textPrimary;
      ctx.font = '600 12px "SF Mono", "Fira Code", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const valStr = item.value + (item.limit > 0 ? `/${item.limit}` : (item.limit === -1 ? '/inf' : ''));
      ctx.fillText(valStr, barX + barAreaW + 10, y + barHeight / 2);
    }
  }, [data]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  if (!data || data.length === 0) {
    return <div className="text-sm text-zinc-500 py-4 text-center">No model usage data</div>;
  }

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ================================================================
   TrendLineChart
   ================================================================ */
interface TrendPoint {
  day: string;
  value: number;
}

export function TrendLineChart({ data }: { data: TrendPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data || data.length === 0) return;

    let cssW = container.clientWidth;
    if (cssW < 200) cssW = 400;
    const cssH = 140;
    const ctx = setupCanvas(canvas, cssW, cssH);

    const padding = { top: 16, right: 16, bottom: 28, left: 40 };
    const plotW = cssW - padding.left - padding.right;
    const plotH = cssH - padding.top - padding.bottom;

    let maxVal = 0;
    for (const pt of data) {
      if (pt.value > maxVal) maxVal = pt.value;
    }
    if (maxVal === 0) maxVal = 1;
    let gridMax = Math.ceil(maxVal / 5) * 5;
    if (gridMax < 5) gridMax = 5;

    const gridLines = 4;
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 0.5;
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let g = 0; g <= gridLines; g++) {
      const gy = padding.top + plotH - (g / gridLines) * plotH;
      ctx.beginPath();
      ctx.moveTo(padding.left, gy);
      ctx.lineTo(padding.left + plotW, gy);
      ctx.stroke();
      const gridVal = Math.round((g / gridLines) * gridMax);
      ctx.fillText(String(gridVal), padding.left - 6, gy);
    }

    const pts: Array<{ x: number; y: number }> = [];
    for (let k = 0; k < data.length; k++) {
      const px = padding.left + (k / (data.length - 1 || 1)) * plotW;
      const py = padding.top + plotH - (data[k].value / gridMax) * plotH;
      pts.push({ x: px, y: py });
    }

    if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, padding.top + plotH);
      for (const pt of pts) ctx.lineTo(pt.x, pt.y);
      ctx.lineTo(pts[pts.length - 1].x, padding.top + plotH);
      ctx.closePath();
      const areaGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
      areaGrad.addColorStop(0, 'rgba(59,130,246,0.2)');
      areaGrad.addColorStop(1, 'rgba(59,130,246,0.02)');
      ctx.fillStyle = areaGrad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let n = 1; n < pts.length; n++) ctx.lineTo(pts[n].x, pts[n].y);
      ctx.strokeStyle = COLORS.blue;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    for (const pt of pts) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = COLORS.blue;
      ctx.fill();
    }

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 9px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    const labelY = padding.top + plotH + 8;

    if (data.length > 0) {
      ctx.textAlign = 'left';
      ctx.fillText(formatDay(data[0].day), pts[0].x, labelY);
    }
    if (data.length > 2) {
      const midIdx = Math.floor(data.length / 2);
      ctx.textAlign = 'center';
      ctx.fillText(formatDay(data[midIdx].day), pts[midIdx].x, labelY);
    }
    if (data.length > 1) {
      ctx.textAlign = 'right';
      ctx.fillText(formatDay(data[data.length - 1].day), pts[pts.length - 1].x, labelY);
    }
  }, [data]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  if (!data || data.length === 0) {
    return <div className="text-sm text-zinc-500 py-4 text-center">No trend data</div>;
  }

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ================================================================
   PeakHoursChart
   ================================================================ */
export function PeakHoursChart({ data }: { data: Array<{ hour: number; count: number }> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data) return;

    const hourMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = 0;
    for (const d of data) hourMap[d.hour] = d.count;

    const barHeight = 16;
    const barGap = 4;
    const labelWidth = 40;
    const valueWidth = 50;
    const padding = { top: 8, right: 12, bottom: 8, left: 4 };
    const totalH = padding.top + 24 * (barHeight + barGap) - barGap + padding.bottom;
    let cssW = container.clientWidth;
    if (cssW < 200) cssW = 400;

    const ctx = setupCanvas(canvas, cssW, totalH);
    const barAreaW = cssW - labelWidth - valueWidth - padding.left - padding.right;

    let maxVal = 0;
    for (let hh = 0; hh < 24; hh++) {
      if (hourMap[hh] > maxVal) maxVal = hourMap[hh];
    }
    if (maxVal === 0) maxVal = 1;

    for (let hr = 0; hr < 24; hr++) {
      const y = padding.top + hr * (barHeight + barGap);
      const barX = padding.left + labelWidth;
      const count = hourMap[hr];

      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '500 11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${String(hr).padStart(2, '0')}:00`, barX - 8, y + barHeight / 2);

      roundRect(ctx, barX, y, barAreaW, barHeight, 3);
      ctx.fillStyle = COLORS.track;
      ctx.fill();

      if (count > 0) {
        const fillW = barAreaW * (count / maxVal);
        roundRect(ctx, barX, y, fillW, barHeight, 3);
        const intensity = count / maxVal;
        const barColor = intensity > 0.7 ? COLORS.orange : intensity > 0.4 ? COLORS.yellow : COLORS.blue;
        ctx.fillStyle = barColor;
        ctx.fill();
      }

      ctx.fillStyle = COLORS.textPrimary;
      ctx.font = '600 11px "SF Mono", "Fira Code", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(count), barX + barAreaW + 8, y + barHeight / 2);
    }
  }, [data]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ================================================================
   DonutChart
   ================================================================ */
export function DonutChart({ data }: { data: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const size = 200;
    const ctx = setupCanvas(canvas, size, size);
    const cx = size / 2;
    const cy = size / 2;
    const outerR = 80;
    const innerR = 50;

    let total = 0;
    const entries: Array<{ label: string; value: number; color: string }> = [];
    const chartColors: Record<string, string> = {
      opus: COLORS.purple,
      sonnet: COLORS.blue,
      haiku: COLORS.green,
    };

    for (const key of Object.keys(data)) {
      if (data[key] > 0) {
        total += data[key];
        entries.push({ label: key, value: data[key], color: chartColors[key] || COLORS.blue });
      }
    }

    if (total === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
      ctx.strokeStyle = COLORS.track;
      ctx.lineWidth = outerR - innerR;
      ctx.stroke();
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '500 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No data', cx, cy);
      return;
    }

    let startAngle = -Math.PI / 2;
    for (const entry of entries) {
      const sliceAngle = (entry.value / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = entry.color;
      ctx.fill();
      startAngle = endAngle;
    }

    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(total), cx, cy - 4);
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 10px system-ui, sans-serif';
    ctx.fillText('total', cx, cy + 12);

    let legendY = size - 10;
    let legendX = 10;
    ctx.font = '500 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    for (const entry of entries) {
      ctx.fillStyle = entry.color;
      ctx.fillRect(legendX, legendY - 8, 8, 8);
      ctx.fillStyle = COLORS.textMuted;
      const label = `${entry.label}: ${entry.value}`;
      ctx.fillText(label, legendX + 12, legendY);
      legendX += ctx.measureText(label).width + 24;
    }
  }, [data]);

  useEffect(() => {
    draw();
  }, [draw]);

  return <canvas ref={canvasRef} />;
}

/* ================================================================
   BlockRateGauge
   ================================================================ */
export function BlockRateGauge({ total, blocked }: { total: number; blocked: number }) {
  const rate = total > 0 ? Math.min(blocked / total, 1) : 0;
  const color = rate > 0.2 ? '#ef4444' : rate > 0.1 ? '#eab308' : '#22c55e';
  const size = 160;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const radius = 58;
  const strokeWidth = 12;

  // Half-circle gauge from PI to 2*PI
  const circumference = Math.PI * radius; // half-circle
  const dashOffset = circumference * (1 - rate);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track (half-circle) */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="#27272a"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Fill */}
        {rate > 0 && (
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-700 ease-out"
          />
        )}
        <text x={cx} y={cy - 10} textAnchor="middle" dominantBaseline="middle" className="fill-zinc-50" style={{ fontSize: '24px', fontWeight: 700 }}>
          {(rate * 100).toFixed(1)}%
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle" className="fill-zinc-500" style={{ fontSize: '10px', fontWeight: 500 }}>
          block rate
        </text>
        <text x={cx} y={cy + 22} textAnchor="middle" dominantBaseline="middle" className="fill-zinc-600" style={{ fontSize: '10px', fontWeight: 500 }}>
          {blocked} / {total} prompts
        </text>
      </svg>
    </div>
  );
}
