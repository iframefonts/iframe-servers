"use client";

import { useState } from "react";

/**
 * Small SVG charts. Palette validated with the dataviz validator (light + dark, CVD-safe):
 * slot 1 blue = net, slot 2 orange = VAT. Text never wears series color.
 */
const SERIES = ["var(--series-1)", "var(--series-2)"];

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

export type StackedDatum = { label: string; short: string; values: number[] };

/** Vertical bars, optionally stacked (net + VAT). One y-axis, 4px rounded data-ends, 2px gaps. */
export function StackedBars({ data, series, height = 220 }: { data: StackedDatum[]; series: string[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.values.reduce((a, b) => a + b, 0)));
  const nice = niceMax(max);
  const W = 640;
  const padL = 44;
  const padB = 22;
  const innerH = height - padB - 8;
  const slot = (W - padL) / data.length;
  const barW = Math.min(28, slot * 0.6);
  const y = (v: number) => (v / nice) * innerH;
  const ticks = [0, 0.5, 1].map((f) => f * nice);

  return (
    <div className="relative">
      {series.length > 1 && <Legend series={series} />}
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={`${series.join(" and ")} per month`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={8 + innerH - y(t)} y2={8 + innerH - y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={padL - 6} y={8 + innerH - y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {fmt(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          let acc = 0;
          const total = d.values.reduce((a, b) => a + b, 0);
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.label}: ${series.map((s, k) => `${s} ${fmt(d.values[k])}`).join(", ")}`}>
              {/* hit target bigger than the mark */}
              <rect x={padL + i * slot} y={0} width={slot} height={8 + innerH} fill="transparent" />
              {hover === i && <rect x={padL + i * slot + 2} y={8} width={slot - 4} height={innerH} fill="var(--foreground)" opacity={0.04} rx={4} />}
              {d.values.map((v, k) => {
                if (v <= 0) return null;
                const h = Math.max(1, y(v) - (acc > 0 ? 2 : 0)); // 2px surface gap between stacked segments
                const top = 8 + innerH - y(acc) - y(v);
                acc += v;
                const isTop = acc === total;
                return <path key={k} d={roundedTop(x, top, barW, h, isTop ? 4 : 0)} fill={SERIES[k]} />;
              })}
              <text x={padL + i * slot + slot / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {d.short}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border bg-popover px-3 py-2 text-[13px] shadow-md"
          style={{ left: `clamp(0px, calc(${((padL + hover * slot + slot / 2) / W) * 100}% - 70px), calc(100% - 160px))` }}
        >
          <p className="font-medium">{data[hover].label}</p>
          {series.map((s, k) => (
            <p key={s} className="flex items-center gap-2 num">
              <span className="size-2 rounded-sm" style={{ background: SERIES[k] }} aria-hidden />
              {s}: {fmt(data[hover].values[k])}
            </p>
          ))}
          {series.length > 1 && <p className="mt-0.5 border-t pt-0.5 num">Total: {fmt(data[hover].values.reduce((a, b) => a + b, 0))}</p>}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for ranking categories (single series → no legend). */
export function HBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(80px,140px)_1fr_auto] items-center gap-3 text-sm" title={`${d.label}: ${fmt(d.value)}`}>
          <span className="truncate">{d.label}</span>
          <span className="h-3 rounded-r-[4px] bg-[var(--series-1)]" style={{ width: `${Math.max(1, (d.value / max) * 100)}%` }} aria-hidden />
          <span className="num text-muted-foreground">{fmt(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function Legend({ series }: { series: string[] }) {
  return (
    <ul className="mb-2 flex gap-4 text-[13px] text-muted-foreground">
      {series.map((s, k) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: SERIES[k] }} aria-hidden />
          {s}
        </li>
      ))}
    </ul>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
