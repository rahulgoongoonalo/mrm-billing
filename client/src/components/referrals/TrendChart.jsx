import React, { useEffect, useRef, useState } from 'react';
import { money, moneyShort } from './shared';

// Referral earned vs paid out, month by month: grouped bars on one axis.
// Colours checked for colour-blind separation on the dark card surface.
export const SERIES = [
  { key: 'earned', label: 'Referral earned', color: '#9d7ae5' },
  { key: 'paid', label: 'Paid to referrers', color: '#5fa232' },
];

const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 52 };

// Round ceiling for the axis: 1, 2, 2.5 or 5 times a power of ten.
const niceMax = (v) => {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = [1, 2, 2.5, 5, 10].find((m) => m * p >= v);
  return n * p;
};

// A bar with 4px rounded top corners, square at the baseline.
const barPath = (x, y, w, h) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

export default function TrendChart({ months }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...months.flatMap((m) => [m.earned, m.paid])));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, months.length);
  const barW = Math.max(3, Math.min(22, (slot - 8) / 2 - 1));
  const y = (v) => PAD.top + plotH - (v / max) * plotH;
  // Show at most ~10 month labels.
  const every = Math.ceil(months.length / Math.max(1, Math.floor(plotW / 64)));
  const empty = months.every((m) => !m.earned && !m.paid);

  return (
    <div className="rf-chart" ref={wrapRef}>
      <div className="rf-legend">
        {SERIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <svg width={width} height={H} role="img" aria-label="Referral earned and paid by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t ? 'rf-grid' : 'rf-base'} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="rf-axis">{moneyShort(t)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          return (
            <g key={m.ym}>
              {hover === i && <rect x={PAD.left + slot * i + 1} y={PAD.top} width={slot - 2} height={plotH} className="rf-hoverband" />}
              {SERIES.map((s, k) => {
                const v = m[s.key];
                if (!v) return null;
                const h = Math.max(1.5, plotH * (v / max));
                const x = cx - barW - 1 + k * (barW + 2);
                return <path key={s.key} d={barPath(x, PAD.top + plotH - h, barW, h)} fill={s.color} />;
              })}
              {i % every === 0 && <text x={cx} y={H - 8} textAnchor="middle" className="rf-axis">{m.label.replace(' 20', " '")}</text>}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH + PAD.bottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
        {empty && <text x={PAD.left + plotW / 2} y={PAD.top + plotH / 2} textAnchor="middle" className="rf-axis">No referral earned or paid in this period</text>}
      </svg>
      {hover !== null && months[hover] && (
        <div
          className="rf-tip-pop"
          style={{ left: Math.min(width - 190, Math.max(0, PAD.left + slot * hover + slot / 2 - 95)) }}
        >
          <b>{months[hover].label}</b>
          <div><span>Payments received</span><span>{money(months[hover].received)}</span></div>
          {SERIES.map((s) => (
            <div key={s.key}><span><i style={{ background: s.color }} />{s.label}</span><span>{money(months[hover][s.key])}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
