import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompactMoney, formatCompactNumber } from "../../shared/lib/format";

const PRIMARY = "#2f4bd8";
const PRIMARY_SOFT = "#9db4ff";
const TEAL = "#0e9384";
const AMBER = "#b54708";
const DANGER = "#d92d20";
const INK = "#667085";
const GRID = "#e3e8f0";
const SURFACE = "#ffffff";
const SURFACE_ALT = "#f6f8fc";

export interface TrendPoint {
  label: string;
  payroll: number;
  claims: number;
  pph21: number;
}

export function PayrollTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return <div className="chart-empty">Belum ada data tren payroll.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="payrollFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.26} />
            <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: INK, fontSize: 11 }}
          dy={6}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={68}
          tick={{ fill: INK, fontSize: 10 }}
          tickFormatter={(value: number) => formatCompactMoney(value)}
        />
        <Tooltip
          cursor={{ stroke: PRIMARY, strokeDasharray: "3 3" }}
          contentStyle={{
            background: SURFACE,
            border: `1px solid ${GRID}`,
            borderRadius: 10,
            boxShadow: "0 12px 28px -18px rgba(16,24,40,.35)",
            fontSize: 12,
          }}
          formatter={(value) => formatCompactMoney(Number(value))}
          labelStyle={{ color: INK, fontWeight: 600 }}
        />
        <Area
          type="monotone"
          dataKey="payroll"
          name="Payroll"
          stroke={PRIMARY}
          strokeWidth={2.5}
          fill="url(#payrollFill)"
          activeDot={{ r: 4, fill: PRIMARY, stroke: SURFACE, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface ClaimStatusPoint {
  label: string;
  value: number;
}

export function ClaimsStatusChart({ data }: { data: ClaimStatusPoint[] }) {
  if (data.length === 0) {
    return <div className="chart-empty">Belum ada data klaim.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={92}
          tick={{ fill: INK, fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: SURFACE_ALT }}
          contentStyle={{
            background: SURFACE,
            border: `1px solid ${GRID}`,
            borderRadius: 10,
            fontSize: 12,
          }}
          formatter={(value) => formatCompactNumber(Number(value))}
        />
        <Bar dataKey="value" name="Klaim" radius={[0, 6, 6, 0]} barSize={16}>
          {data.map((entry, index) => (
            <Cell
              key={entry.label}
              fill={
                index === 0
                  ? AMBER
                  : index === 1
                    ? TEAL
                    : index === 2
                      ? PRIMARY
                      : index === 3
                        ? DANGER
                        : PRIMARY_SOFT
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface DonutPoint {
  label: string;
  value: number;
  color: string;
}

export function StatusDonut({ data }: { data: DonutPoint[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return <div className="chart-empty">Belum ada data.</div>;
  }
  let cursor = 0;
  const stops = data
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = (cursor / total) * 360;
      cursor += item.value;
      const end = (cursor / total) * 360;
      return `${item.color} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div className="donut-wrap">
      <div
        className="donut-css"
        style={{ background: `conic-gradient(${stops})` }}
        role="img"
        aria-label={data
          .map((item) => `${item.label} ${formatCompactNumber(item.value)}`)
          .join(", ")}
      >
        <div className="donut-css__hole">
          <strong>{formatCompactNumber(total)}</strong>
          <span>total</span>
        </div>
      </div>
      <ul className="donut-legend">
        {data.map((item) => (
          <li key={item.label}>
            <span className="donut-legend__dot" style={{ background: item.color }} />
            <span>{item.label}</span>
            <strong>{formatCompactNumber(item.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MonthlyBreakdown({
  items,
}: {
  items: Array<{ label: string; value: number; tone?: "jade" | "amber" }>;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="monthly-breakdown">
      {items.map((item) => (
        <div className="monthly-breakdown__row" key={item.label}>
          <div className="monthly-breakdown__label">
            <span>{item.label}</span>
            <strong>{formatCompactMoney(item.value)}</strong>
          </div>
          <div className="monthly-breakdown__track">
            <span
              className={`monthly-breakdown__fill monthly-breakdown__fill--${item.tone ?? "jade"}`}
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
