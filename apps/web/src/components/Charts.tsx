import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ── Shared style tokens ────────────────────────────────────── */

const gridStroke = "var(--border-subtle)";
const textFill = "var(--neutral-500)";
const tooltipStyle: React.CSSProperties = {
  background: "var(--surface-0)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-lg)",
  padding: "10px 14px",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
};

/* ── Institution Growth Area Chart ──────────────────────────── */

interface GrowthPoint {
  month: string;
  count: number;
}

export function InstitutionGrowthChart({ data }: { data: GrowthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-600)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--brand-600)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: textFill }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: textFill }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--brand-600)"
          strokeWidth={2}
          fill="url(#growthGrad)"
          animationDuration={800}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Status Distribution Donut ──────────────────────────────── */

interface StatusSlice {
  name: string;
  value: number;
  color: string;
}

export function StatusDonut({ data, total }: { data: StatusSlice[]; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
      <div style={{ width: 120, height: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={38}
              outerRadius={55}
              paddingAngle={3}
              dataKey="value"
              animationDuration={600}
              animationEasing="ease-out"
              stroke="none"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 20, fontWeight: 700, fill: "var(--neutral-900)" }}>
              {total}
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "grid", gap: "8px" }}>
        {data.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-xs)" }}>
            <span style={{ width: 10, height: 10, borderRadius: "var(--radius-full)", background: s.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 500, color: "var(--neutral-700)" }}>{s.name}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--neutral-900)" }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Activity Bar Chart (horizontal) ────────────────────────── */

interface ActivityBar {
  name: string;
  events: number;
}

export function ActivityBarChart({ data }: { data: ActivityBar[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: textFill }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: textFill }} tickLine={false} axisLine={false} width={120} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar
          dataKey="events"
          fill="var(--brand-600)"
          radius={[0, 4, 4, 0]}
          animationDuration={600}
          animationEasing="ease-out"
          barSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
