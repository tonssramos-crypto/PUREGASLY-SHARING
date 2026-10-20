import { useEffect, useMemo, useRef, useState } from 'react';
import { shortDate } from '../utils/networkFormat';

const M = { l: 52, r: 12, t: 12, b: 28 };

// Responsive SVG line chart. `lines` = [{ key, name, color, values, dashed }] with one value per
// label (null = no data that day, which leaves a gap). `band` shades the area between min and max.
export default function LineChart({ labels, lines, band, height = 250, formatY = (v) => v, emptyText = 'No data to show yet.' }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  // Draw at the real on-screen width so text stays readable on a phone
  // (scaling a fixed 640px drawing down made the labels tiny).
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const apply = (w) => w > 0 && setW(Math.max(260, Math.round(w)));
    apply(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => apply(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;

  const { lo, hi, ticks } = useMemo(() => {
    const all = [];
    lines.forEach((l) => l.values.forEach((v) => v != null && all.push(v)));
    if (band) {
      band.min.forEach((v) => v != null && all.push(v));
      band.max.forEach((v) => v != null && all.push(v));
    }
    if (!all.length) return { lo: 0, hi: 0, ticks: [] };
    let min = Math.min(...all);
    let max = Math.max(...all);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.12;
    const lo2 = Math.max(0, min - pad);
    const hi2 = max + pad;
    return { lo: lo2, hi: hi2, ticks: [0, 1, 2, 3].map((i) => lo2 + ((hi2 - lo2) * i) / 3) };
  }, [lines, band]);

  const n = labels.length;
  if (!n || hi === lo) {
    return (
      <div className="chart-wrap" ref={wrapRef}>
        <p className="empty">{emptyText}</p>
      </div>
    );
  }

  const x = (i) => M.l + (n === 1 ? 0 : (i / (n - 1)) * (W - M.l - M.r));
  const y = (v) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);

  // Lines are drawn in separate pieces wherever data is missing.
  const pathFor = (values) => {
    const parts = [];
    let cur = [];
    values.forEach((v, i) => {
      if (v == null) {
        if (cur.length) parts.push(cur);
        cur = [];
      } else cur.push([x(i), y(v)]);
    });
    if (cur.length) parts.push(cur);
    return parts;
  };

  const bandPath = (() => {
    if (!band) return null;
    const segs = [];
    let cur = [];
    band.min.forEach((mn, i) => {
      const mx = band.max[i];
      if (mn == null || mx == null) {
        if (cur.length) segs.push(cur);
        cur = [];
      } else cur.push(i);
    });
    if (cur.length) segs.push(cur);
    return segs
      .filter((s) => s.length > 1)
      .map((s) => `M${s.map((i) => `${x(i)},${y(band.max[i])}`).join(' L')} L${[...s].reverse().map((i) => `${x(i)},${y(band.min[i])}`).join(' L')} Z`)
      .join(' ');
  })();

  const labelIdx = [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i);

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="line-chart"
        role="img"
        aria-label="Price chart"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">{formatY(Math.round(t))}</text>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="chart-axis">
            {shortDate(labels[i])}
          </text>
        ))}
        {bandPath && <path d={bandPath} className="chart-band" />}
        {lines.map((l) =>
          pathFor(l.values).map((pts, k) =>
            pts.length === 1 ? (
              <circle key={`${l.key}${k}`} cx={pts[0][0]} cy={pts[0][1]} r="3.5" fill={l.color} />
            ) : (
              <path
                key={`${l.key}${k}`}
                d={`M${pts.map((p) => p.join(',')).join(' L')}`}
                fill="none"
                stroke={l.color}
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={l.dashed ? '6 5' : undefined}
              />
            )
          )
        )}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} className="chart-cursor" />
            {lines.map((l) => l.values[hover] != null && <circle key={l.key} cx={x(hover)} cy={y(l.values[hover])} r="4.5" fill={l.color} stroke="var(--surface, #fff)" strokeWidth="2" />)}
          </g>
        )}
      </svg>

      {hover != null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{shortDate(labels[hover])}</strong>
          {lines.map((l) => (
            <div key={l.key}>
              <span className="dot" style={{ background: l.color }} /> {l.name}: {l.values[hover] != null ? formatY(l.values[hover]) : '—'}
            </div>
          ))}
          {band && band.min[hover] != null && <div className="muted small">Range: {formatY(band.min[hover])} – {formatY(band.max[hover])}</div>}
        </div>
      )}

      <div className="chart-legend">
        {lines.map((l) => (
          <span key={l.key}>
            <span className="dot" style={{ background: l.color }} /> {l.name}
          </span>
        ))}
        {band && <span><span className="dot band" /> Area price range</span>}
      </div>
    </div>
  );
}
