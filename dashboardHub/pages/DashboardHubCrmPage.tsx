import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Filter,
  TrendingUp,
  TrendingDown,
  Target,
  Users,
  Loader2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { apiUrl } from '../../backendApi';

type ChartColors = {
  blue: string;
  green: string;
  red: string;
  orange: string;
  yellow: string;
  purple: string;
  textMain: string;
  textMuted: string;
  border: string;
};

type CrmState = {
  propertyId: string;
  salesCalls: any[];
  pipeline: Record<string, any[]>;
  accountActivities: Record<string, any>;
  leads: Record<string, any[]>;
};

const STAGES = [
  'new',
  'waiting',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'notInterested',
] as const;

const STAGE_LABEL: Record<string, string> = {
  new: 'New',
  waiting: 'Waiting',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  notInterested: 'Not Interested',
};

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export default function DashboardHubCrmPage({ colors }: { colors: any }) {
  const [state, setState] = useState<CrmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<number>(30);

  const chartColors: ChartColors = {
    blue: colors.blue,
    green: colors.green,
    red: colors.red,
    orange: colors.orange,
    yellow: colors.yellow,
    purple: colors.purple,
    textMain: colors.textMain,
    textMuted: colors.textMuted,
    border: colors.border,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/crm-state'), { credentials: 'include' });
      if (!res.ok) throw new Error(`CRM load failed (${res.status})`);
      setState((await res.json()) as CrmState);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CRM');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  const cutoff = now - range * 86400000;

  const inRange = useCallback(
    (items: any[]): any[] =>
      items.filter((it) => {
        const t = new Date(it.createdAt || it.timestamp || 0).getTime();
        return Number.isNaN(t) ? true : t >= cutoff;
      }),
    [cutoff],
  );

  const stats = useMemo(() => {
    if (!state) return null;
    const pipeline = state.pipeline || {};
    const leads = state.leads || {};
    const pCounts: Record<string, number> = {};
    const lCounts: Record<string, number> = {};
    for (const s of STAGES) {
      pCounts[s] = inRange(pipeline[s] || []).length;
      lCounts[s] = inRange(leads[s] || []).length;
    }
    const totalLeads = Object.values(lCounts).reduce((a, b) => a + b, 0);
    const won = lCounts.won || 0;
    const lost = lCounts.notInterested || 0;
    const winRate = pct(won, won + lost);
    const pipelineValue = (pipeline.won || []).reduce(
      (sum, it) => sum + Number(it.value || it.amount || 0),
      0,
    );
    return { pCounts, lCounts, totalLeads, won, lost, winRate, pipelineValue };
  }, [state, inRange]);

  if (loading) {
    return (
      <div className="flex justify-center py-10" style={{ color: colors.textMuted }}>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl p-3 text-sm"
        style={{ backgroundColor: `${colors.red}1a`, color: colors.red }}
      >
        {error}
      </div>
    );
  }

  if (!stats) return null;

  const funnelData = STAGES.map((s) => ({
    stage: STAGE_LABEL[s],
    leads: stats.lCounts[s],
    pipeline: stats.pCounts[s],
  }));

  const pieData = STAGES.filter((s) => s !== 'new').map((s) => ({
    name: STAGE_LABEL[s],
    value: stats.lCounts[s],
    fill:
      s === 'won'
        ? colors.green
        : s === 'notInterested'
        ? colors.red
        : s === 'negotiation'
        ? colors.orange
        : s === 'proposal'
        ? colors.purple
        : s === 'qualified'
        ? colors.blue
        : colors.yellow,
  })).filter((d) => d.value > 0);

  return (
    <div className="p-3" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-xl grid place-items-center"
            style={{ backgroundColor: `${colors.primary}22`, color: colors.primary }}
          >
            <Filter size={18} />
          </div>
          <div>
            <div className="font-bold text-lg" style={{ color: colors.textMain }}>
              CRM Pipeline Analytics
            </div>
            <div className="text-xs" style={{ color: colors.textMuted }}>
              Lead funnel, conversion & stage distribution
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90, 365].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className="px-2 py-1 rounded-lg text-xs font-bold"
              style={{
                backgroundColor: range === r ? colors.primary : 'transparent',
                color: range === r ? '#000' : colors.textMuted,
                border: `1px solid ${colors.border}`,
              }}
            >
              {r === 365 ? 'All' : `${r}d`}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Card colors={colors} label="Total Leads" value={stats.totalLeads} icon={<Users size={16} />} />
        <Card colors={colors} label="Won" value={stats.won} icon={<Target size={16} />} tone="green" />
        <Card
          colors={colors}
          label="Win Rate"
          value={`${stats.winRate}%`}
          icon={stats.winRate >= 30 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          tone={stats.winRate >= 30 ? 'green' : 'orange'}
        />
        <Card
          colors={colors}
          label="Pipeline Value"
          value={`$${Math.round(stats.pipelineValue).toLocaleString()}`}
          icon={<Filter size={16} />}
          tone="blue"
        />
      </div>

      {stats.totalLeads === 0 ? (
        <div
          className="rounded-2xl p-6 text-center text-sm border"
          style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.textMuted }}
        >
          No CRM leads or pipeline activity in this period yet. Add leads from the CRM
          module to see funnel analytics here.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Funnel by stage */}
          <div
            className="rounded-2xl p-3 border"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <div className="font-semibold mb-2 text-sm" style={{ color: colors.textMain }}>
              Lead Funnel by Stage
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnelData}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                <XAxis dataKey="stage" tick={{ fontSize: 11, fill: colors.textMuted }} />
                <YAxis tick={{ fontSize: 11, fill: colors.textMuted }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.card,
                    border: `1px solid ${colors.border}`,
                    color: colors.textMain,
                  }}
                />
                <Bar dataKey="leads" fill={colors.blue} radius={[4, 4, 0, 0]} />
                <Bar dataKey="pipeline" fill={colors.purple} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-3 mt-1 text-xs" style={{ color: colors.textMuted }}>
              <span style={{ color: colors.blue }}>■ Leads</span>
              <span style={{ color: colors.purple }}>■ Pipeline</span>
            </div>
          </div>

          {/* Stage distribution pie */}
          <div
            className="rounded-2xl p-3 border"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <div className="font-semibold mb-2 text-sm" style={{ color: colors.textMain }}>
              Stage Distribution
            </div>
            {pieData.length === 0 ? (
              <div className="text-sm py-10 text-center" style={{ color: colors.textMuted }}>
                No distributed stages in range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(e: any) => `${e.name}: ${e.value}`}
                  >
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: colors.card,
                      border: `1px solid ${colors.border}`,
                      color: colors.textMain,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: colors.textMuted }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  colors,
  label,
  value,
  icon,
  tone,
}: {
  colors: any;
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: 'green' | 'orange' | 'blue';
}) {
  const toneColor =
    tone === 'green'
      ? colors.green
      : tone === 'orange'
      ? colors.orange
      : tone === 'blue'
      ? colors.blue
      : colors.primary;
  return (
    <div
      className="rounded-2xl p-3 border flex flex-col gap-1"
      style={{ backgroundColor: colors.card, borderColor: colors.border }}
    >
      <div className="flex items-center gap-1 text-xs" style={{ color: colors.textMuted }}>
        <span style={{ color: toneColor }}>{icon}</span>
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color: colors.textMain }}>
        {value}
      </div>
    </div>
  );
}
