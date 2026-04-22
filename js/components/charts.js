/**
 * Vanilla SVG charts — no external libraries.
 *   Charts.bars(series, options)         -> grouped bar chart SVG string
 *   Charts.donut(slices, options)        -> donut/pie chart SVG string
 *   Charts.line(series, options)         -> smooth line chart SVG string
 *
 * Each function returns an HTML string to be injected into the DOM.
 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  const COLORS = [
    '#0f766e', '#f59e0b', '#3b82f6', '#8b5cf6',
    '#ef4444', '#10b981', '#ec4899', '#14b8a6',
    '#a855f7', '#f97316'
  ];

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- Grouped bar chart (income vs expense per day) ----------
  function bars(series, { width = 640, height = 280, gap = 4, barMax = 22, labels } = {}) {
    const padL = 44, padR = 12, padT = 16, padB = 32;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const max = Math.max(
      1,
      ...series.map((d) => Math.max(d.income || 0, d.expense || 0))
    );
    const niceMax = niceScale(max);
    const groupW = chartW / series.length;
    const barW = Math.max(4, Math.min(barMax, (groupW - gap) / 2 - 2));

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
      y: padT + chartH - p * chartH,
      label: Fmt.formatCompact(p * niceMax)
    }));

    const gridLines = ticks
      .map((t) => `<line x1="${padL}" x2="${width - padR}" y1="${t.y}" y2="${t.y}" stroke="#eef2f6" />`)
      .join('');

    const tickLabels = ticks
      .map(
        (t) => `<text x="${padL - 8}" y="${t.y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${t.label}</text>`
      )
      .join('');

    const bars = series
      .map((d, i) => {
        const gx = padL + i * groupW + groupW / 2;
        const incH = ((d.income || 0) / niceMax) * chartH;
        const expH = ((d.expense || 0) / niceMax) * chartH;
        const incY = padT + chartH - incH;
        const expY = padT + chartH - expH;
        return `
          <g>
            <rect x="${gx - barW - 1}" y="${incY}" width="${barW}" height="${incH}" rx="3" fill="#10b981" opacity="0.9"/>
            <rect x="${gx + 1}"        y="${expY}" width="${barW}" height="${expH}" rx="3" fill="#ef4444" opacity="0.9"/>
          </g>`;
      })
      .join('');

    const xLabels = series
      .map((d, i) => {
        if (labels && labels[i] == null) return '';
        const label = labels ? labels[i] : '';
        if (!label) return '';
        const gx = padL + i * groupW + groupW / 2;
        return `<text x="${gx}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#94a3b8">${escapeHtml(label)}</text>`;
      })
      .join('');

    return `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="${NS}">
        ${gridLines}
        ${tickLabels}
        ${bars}
        ${xLabels}
      </svg>`;
  }

  // ---------- Donut ----------
  function donut(slices, { size = 220, thickness = 30, centerLabel = '' } = {}) {
    const total = slices.reduce((s, d) => s + (d.value || 0), 0);
    if (total <= 0) {
      return `<svg class="chart-svg donut" viewBox="0 0 ${size} ${size}" xmlns="${NS}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - thickness / 2}" fill="none" stroke="#eef2f6" stroke-width="${thickness}"/>
        <text x="${size / 2}" y="${size / 2 + 5}" text-anchor="middle" font-size="14" fill="#94a3b8">—</text>
      </svg>`;
    }
    const cx = size / 2, cy = size / 2;
    const r = size / 2 - thickness / 2;
    const circumference = 2 * Math.PI * r;

    let offset = 0;
    const arcs = slices
      .map((d, i) => {
        const frac = (d.value || 0) / total;
        const len = frac * circumference;
        const color = d.color || COLORS[i % COLORS.length];
        const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}"
          stroke-width="${thickness}"
          stroke-dasharray="${len} ${circumference - len}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 ${cx} ${cy})"
          stroke-linecap="butt"
        />`;
        offset += len;
        return el;
      })
      .join('');

    const centerText = centerLabel
      ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">${escapeHtml(centerLabel)}</text>`
      : '';

    return `
      <svg class="chart-svg donut" viewBox="0 0 ${size} ${size}" xmlns="${NS}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef2f6" stroke-width="${thickness}"/>
        ${arcs}
        ${centerText}
      </svg>`;
  }

  // ---------- Smooth line chart (net trend) ----------
  function line(series, { width = 640, height = 240, area = true } = {}) {
    const padL = 44, padR = 12, padT = 12, padB = 24;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    if (!series.length) return '';

    const values = series.map((d) => d.value);
    const max = Math.max(0, ...values);
    const min = Math.min(0, ...values);
    const range = Math.max(1, max - min);
    const pxX = (i) => padL + (i * chartW) / Math.max(1, series.length - 1);
    const pxY = (v) => padT + chartH - ((v - min) / range) * chartH;

    const pts = series.map((d, i) => [pxX(i), pxY(d.value)]);
    const path = pts
      .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
      .join(' ');

    const zeroY = pxY(0);
    const areaPath = `M${pts[0][0]},${zeroY} ` +
      pts.map((p) => `L${p[0]},${p[1]}`).join(' ') +
      ` L${pts[pts.length - 1][0]},${zeroY} Z`;

    const ticks = [0, 0.5, 1].map((p) => {
      const v = min + p * range;
      return { y: pxY(v), label: Fmt.formatCompact(v) };
    });
    const grid = ticks
      .map((t) => `<line x1="${padL}" x2="${width - padR}" y1="${t.y}" y2="${t.y}" stroke="#eef2f6"/>`)
      .join('');
    const tickLabels = ticks
      .map((t) => `<text x="${padL - 8}" y="${t.y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${t.label}</text>`)
      .join('');

    return `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="${NS}">
        <defs>
          <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#0f766e" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#0f766e" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${grid}
        ${tickLabels}
        <line x1="${padL}" x2="${width - padR}" y1="${zeroY}" y2="${zeroY}" stroke="#cbd5e1" stroke-dasharray="3 3"/>
        ${area ? `<path d="${areaPath}" fill="url(#areaGrad)"/>` : ''}
        <path d="${path}" fill="none" stroke="#0f766e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#ffffff" stroke="#0f766e" stroke-width="2"/>`).join('')}
      </svg>`;
  }

  function niceScale(maxVal) {
    if (maxVal <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(maxVal)));
    const n = maxVal / pow;
    let nice;
    if (n <= 1) nice = 1;
    else if (n <= 2) nice = 2;
    else if (n <= 5) nice = 5;
    else nice = 10;
    return nice * pow;
  }

  global.Charts = { bars, donut, line, COLORS };
})(window);
