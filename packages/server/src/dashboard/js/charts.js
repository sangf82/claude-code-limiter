/**
 * charts.js — Canvas-based charts for the Claude Code Limiter dashboard.
 * No external libraries. Uses Canvas 2D API directly.
 *
 * Exports on window.Charts:
 *   horizontalBar(canvas, data)
 *   creditGauge(canvas, used, total)
 *   trendLine(canvas, dataPoints)
 */
(function () {
  'use strict';

  /* ---- Color helpers matching the dark theme ---- */
  var COLORS = {
    bg:          '#0d1117',
    cardBg:      '#161b22',
    border:      '#30363d',
    textPrimary: '#e6edf3',
    textMuted:   '#6e7681',
    green:       '#3fb950',
    yellow:      '#d29922',
    red:         '#f85149',
    blue:        '#58a6ff',
    purple:      '#bc8cff',
    orange:      '#f0883e',
    track:       '#1c2129',
  };

  var MODEL_COLORS = {
    opus:    COLORS.purple,
    sonnet:  COLORS.blue,
    haiku:   COLORS.green,
    default: COLORS.orange,
  };

  /**
   * Get device pixel ratio for crisp rendering.
   * @returns {number}
   */
  function dpr() {
    return window.devicePixelRatio || 1;
  }

  /**
   * Set up a canvas for high-DPI rendering. Returns the 2D context.
   * @param {HTMLCanvasElement} canvas
   * @param {number} cssW - CSS width
   * @param {number} cssH - CSS height
   * @returns {CanvasRenderingContext2D}
   */
  function setupCanvas(canvas, cssW, cssH) {
    var ratio = dpr();
    canvas.width = cssW * ratio;
    canvas.height = cssH * ratio;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    return ctx;
  }

  /**
   * Pick a color for a usage percentage.
   * @param {number} pct - 0..1
   * @returns {string}
   */
  function usageColor(pct) {
    if (pct >= 0.9) return COLORS.red;
    if (pct >= 0.7) return COLORS.yellow;
    return COLORS.green;
  }

  /**
   * Draw a rounded rectangle path.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} r - corner radius
   */
  function roundRect(ctx, x, y, w, h, r) {
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

  /* ================================================================
     horizontalBar(canvas, data)
     Renders per-model usage bars with limit markers.
     data: [{ label, value, limit, color? }]
     ================================================================ */
  function horizontalBar(canvas, data) {
    if (!canvas || !data || data.length === 0) return;

    var barHeight = 22;
    var barGap = 32;
    var labelWidth = 70;
    var valueWidth = 80;
    var padding = { top: 8, right: 12, bottom: 8, left: 4 };
    var totalH = padding.top + data.length * (barHeight + barGap) - barGap + padding.bottom;
    var cssW = canvas.parentElement ? canvas.parentElement.clientWidth : 400;
    if (cssW < 200) cssW = 400;
    var cssH = totalH;

    var ctx = setupCanvas(canvas, cssW, cssH);
    var barAreaW = cssW - labelWidth - valueWidth - padding.left - padding.right;

    // Find max for scale
    var maxVal = 0;
    for (var i = 0; i < data.length; i++) {
      var cmp = data[i].limit > 0 ? data[i].limit : data[i].value;
      if (cmp > maxVal) maxVal = cmp;
    }
    if (maxVal === 0) maxVal = 1;

    for (var j = 0; j < data.length; j++) {
      var item = data[j];
      var y = padding.top + j * (barHeight + barGap);
      var barX = padding.left + labelWidth;

      // Label
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '500 12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, barX - 10, y + barHeight / 2);

      // Track
      roundRect(ctx, barX, y, barAreaW, barHeight, 4);
      ctx.fillStyle = COLORS.track;
      ctx.fill();

      // Fill
      var pct = item.limit > 0 ? item.value / item.limit : (item.value > 0 ? 1 : 0);
      if (pct > 1) pct = 1;
      var fillW = barAreaW * pct;
      if (fillW > 0) {
        roundRect(ctx, barX, y, fillW, barHeight, 4);
        var grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
        var barColor = item.color || MODEL_COLORS[item.label.toLowerCase()] || COLORS.blue;
        grad.addColorStop(0, barColor);
        grad.addColorStop(1, adjustAlpha(barColor, 0.7));
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Limit marker
      if (item.limit > 0) {
        var markerX = barX + barAreaW * (item.limit / maxVal);
        if (markerX > barX + barAreaW) markerX = barX + barAreaW;
        ctx.strokeStyle = COLORS.textPrimary;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(markerX, y - 3);
        ctx.lineTo(markerX, y + barHeight + 3);
        ctx.stroke();
      }

      // Value text
      ctx.fillStyle = COLORS.textPrimary;
      ctx.font = '600 12px "SF Mono", "Fira Code", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      var valStr = item.value + (item.limit > 0 ? '/' + item.limit : (item.limit === -1 ? '/inf' : ''));
      ctx.fillText(valStr, barX + barAreaW + 10, y + barHeight / 2);
    }
  }

  /* ================================================================
     creditGauge(canvas, used, total)
     Renders a circular progress indicator showing credit usage.
     ================================================================ */
  function creditGauge(canvas, used, total) {
    if (!canvas) return;

    var size = 180;
    var ctx = setupCanvas(canvas, size, size);
    var cx = size / 2;
    var cy = size / 2;
    var radius = 68;
    var lineWidth = 14;

    var pct = total > 0 ? used / total : 0;
    if (pct > 1) pct = 1;
    var remaining = total - used;
    if (remaining < 0) remaining = 0;

    // Start angle at top (-PI/2), go clockwise
    var startAngle = -Math.PI / 2;
    var endAngle = startAngle + 2 * Math.PI * pct;

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = COLORS.track;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Filled arc
    if (pct > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      var color = usageColor(pct);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Center text — remaining credits
    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(remaining), cx, cy - 6);

    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 11px system-ui, sans-serif';
    ctx.fillText('credits left', cx, cy + 16);

    // Bottom label
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 10px system-ui, sans-serif';
    ctx.fillText(used + ' / ' + total + ' used', cx, cy + 36);
  }

  /* ================================================================
     trendLine(canvas, dataPoints)
     Renders a 30-day daily usage sparkline.
     dataPoints: [{ day: 'YYYY-MM-DD', value: number }]
     ================================================================ */
  function trendLine(canvas, dataPoints) {
    if (!canvas || !dataPoints || dataPoints.length === 0) return;

    var cssW = canvas.parentElement ? canvas.parentElement.clientWidth : 400;
    if (cssW < 200) cssW = 400;
    var cssH = 140;
    var ctx = setupCanvas(canvas, cssW, cssH);

    var padding = { top: 16, right: 16, bottom: 28, left: 40 };
    var plotW = cssW - padding.left - padding.right;
    var plotH = cssH - padding.top - padding.bottom;

    // Find max
    var maxVal = 0;
    for (var i = 0; i < dataPoints.length; i++) {
      if (dataPoints[i].value > maxVal) maxVal = dataPoints[i].value;
    }
    if (maxVal === 0) maxVal = 1;
    // Round up to nice number
    var gridMax = Math.ceil(maxVal / 5) * 5;
    if (gridMax < 5) gridMax = 5;

    // Horizontal grid lines
    var gridLines = 4;
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 0.5;
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (var g = 0; g <= gridLines; g++) {
      var gy = padding.top + plotH - (g / gridLines) * plotH;
      ctx.beginPath();
      ctx.moveTo(padding.left, gy);
      ctx.lineTo(padding.left + plotW, gy);
      ctx.stroke();
      var gridVal = Math.round((g / gridLines) * gridMax);
      ctx.fillText(String(gridVal), padding.left - 6, gy);
    }

    // Plot points
    var pts = [];
    for (var k = 0; k < dataPoints.length; k++) {
      var px = padding.left + (k / (dataPoints.length - 1 || 1)) * plotW;
      var py = padding.top + plotH - (dataPoints[k].value / gridMax) * plotH;
      pts.push({ x: px, y: py });
    }

    // Fill area under line
    if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, padding.top + plotH);
      for (var m = 0; m < pts.length; m++) {
        ctx.lineTo(pts[m].x, pts[m].y);
      }
      ctx.lineTo(pts[pts.length - 1].x, padding.top + plotH);
      ctx.closePath();
      var areaGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
      areaGrad.addColorStop(0, 'rgba(88,166,255,0.2)');
      areaGrad.addColorStop(1, 'rgba(88,166,255,0.02)');
      ctx.fillStyle = areaGrad;
      ctx.fill();
    }

    // Line
    if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var n = 1; n < pts.length; n++) {
        ctx.lineTo(pts[n].x, pts[n].y);
      }
      ctx.strokeStyle = COLORS.blue;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Dots
    for (var d = 0; d < pts.length; d++) {
      ctx.beginPath();
      ctx.arc(pts[d].x, pts[d].y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = COLORS.blue;
      ctx.fill();
    }

    // X-axis labels (show first, middle, last)
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 9px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    var labelY = padding.top + plotH + 8;

    if (dataPoints.length > 0) {
      ctx.textAlign = 'left';
      ctx.fillText(formatDay(dataPoints[0].day), pts[0].x, labelY);
    }
    if (dataPoints.length > 2) {
      var midIdx = Math.floor(dataPoints.length / 2);
      ctx.textAlign = 'center';
      ctx.fillText(formatDay(dataPoints[midIdx].day), pts[midIdx].x, labelY);
    }
    if (dataPoints.length > 1) {
      ctx.textAlign = 'right';
      ctx.fillText(formatDay(dataPoints[dataPoints.length - 1].day), pts[pts.length - 1].x, labelY);
    }
  }

  /* ---- Helpers ---- */

  /**
   * Adjust a hex color's alpha. Returns an rgba() string.
   * @param {string} hex
   * @param {number} alpha
   * @returns {string}
   */
  function adjustAlpha(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /**
   * Format a YYYY-MM-DD string as a short label.
   * @param {string} day
   * @returns {string}
   */
  function formatDay(day) {
    if (!day) return '';
    var parts = day.split('-');
    if (parts.length < 3) return day;
    return parts[1] + '/' + parts[2];
  }

  /* ---- Public API ---- */
  window.Charts = {
    horizontalBar: horizontalBar,
    creditGauge: creditGauge,
    trendLine: trendLine,
    COLORS: COLORS,
    MODEL_COLORS: MODEL_COLORS,
  };
})();
