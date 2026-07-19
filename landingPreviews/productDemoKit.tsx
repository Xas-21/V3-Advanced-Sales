/**
 * Landing product tour — mounts the REAL dashboard chrome, RequestsManager, and CRM
 * with sample property data (read-only). Not a visual clone.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CalendarCheck,
  DollarSign,
  MoreHorizontal,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Legend,
  AreaChart,
  Area,
  ComposedChart,
  Line,
} from 'recharts';
import { KPICard, Card, MiniStatCard } from '../dashboardHub/dashboardChrome';
import RequestsManager from '../RequestsManager';
import CRM, { type CrmSalesPeriod } from '../CRM';
import { defaultPipelineBuckets, type CrmPipelineBuckets } from '../crmStateModel';

export function withAlpha(hexOrRgba: string, alpha: number): string {
  const c = String(hexOrRgba || '').trim();
  if (c.startsWith('rgba(')) {
    return c.replace(/rgba?\(([^)]+)\)/, (_m, inner) => {
      const parts = String(inner).split(',').map((p: string) => p.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    });
  }
  if (c.startsWith('rgb(')) return `rgba(${c.slice(4, -1)}, ${alpha})`;
  const hex = c.replace('#', '');
  if (hex.length === 3 || hex.length === 6) {
    const full = hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(192, 154, 78, ${alpha})`;
}

/** Kept for older preview imports */
export const DEMO_REVENUE = [
  { month: 'Jan', revenue: 1524000 },
  { month: 'Feb', revenue: 1182000 },
  { month: 'Mar', revenue: 2214000 },
  { month: 'Apr', revenue: 3713000 },
  { month: 'May', revenue: 2892000 },
  { month: 'Jun', revenue: 4128000 },
];

export const DEMO_REQUESTS = [
  { client: 'Deira Tours', type: 'Accommodation', date: '2026-07-02', status: 'Tentative' },
  { client: 'Bertel Travel', type: 'Event with Rooms', date: '2026-07-05', status: 'Inquiry' },
  { client: 'Contoso Travel', type: 'Accommodation', date: '2026-07-08', status: 'Definite' },
  { client: 'Red Sea Global', type: 'Event only', date: '2026-07-11', status: 'Accepted' },
  { client: 'Health Gate', type: 'Series Group', date: '2026-07-14', status: 'Actual' },
  { client: 'Dweedy', type: 'Accommodation', date: '2026-07-18', status: 'Tentative' },
];

export const DEMO_CRM = [
  { stage: 'New', count: 18, amount: 'SAR 420K' },
  { stage: 'Qualified', count: 11, amount: 'SAR 680K' },
  { stage: 'Proposal', count: 7, amount: 'SAR 910K' },
  { stage: 'Negotiation', count: 5, amount: 'SAR 1.2M' },
  { stage: 'Won', count: 9, amount: 'SAR 2.4M' },
];

const DEMO_PROPERTY_ID = 'landing-demo-property';

const DEMO_PROPERTY = {
  id: DEMO_PROPERTY_ID,
  name: 'AlUla Desert Resort (Demo)',
  currency: 'SAR',
};

const DEMO_USER = {
  id: 'landing-demo-user',
  name: 'Sara Al-Harbi',
  username: 'demo.sales',
  email: 'demo@advancedsales.local',
  role: 'Head of Sales',
};

function periodMonthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildDemoAccounts() {
  return [
    { id: 'acc-deira', name: 'Deira Tours', type: 'Travel Agent', propertyId: DEMO_PROPERTY_ID, status: 'Active', ownerId: DEMO_USER.id },
    { id: 'acc-bertel', name: 'Bertel Travel', type: 'Travel Agent', propertyId: DEMO_PROPERTY_ID, status: 'Active', ownerId: DEMO_USER.id },
    { id: 'acc-contoso', name: 'Contoso Travel', type: 'Corporate', propertyId: DEMO_PROPERTY_ID, status: 'Active', ownerId: DEMO_USER.id },
    { id: 'acc-rsg', name: 'Red Sea Global', type: 'Corporate', propertyId: DEMO_PROPERTY_ID, status: 'Active', ownerId: DEMO_USER.id },
    { id: 'acc-health', name: 'Health Gate', type: 'MICE', propertyId: DEMO_PROPERTY_ID, status: 'Active', ownerId: DEMO_USER.id },
    { id: 'acc-dweedy', name: 'Dweedy', type: 'One Shot Group', propertyId: DEMO_PROPERTY_ID, status: 'Active', ownerId: DEMO_USER.id },
  ];
}

function buildDemoRequests() {
  const pid = DEMO_PROPERTY_ID;
  return [
    {
      id: 'req-demo-1',
      propertyId: pid,
      accountId: 'acc-deira',
      account: 'Deira Tours',
      accountName: 'Deira Tours',
      requestName: 'Summer FIT Block',
      confirmationNo: 'CNF-10421',
      requestType: 'Accommodation',
      status: 'Tentative',
      segment: 'FIT',
      requestDate: '2026-07-02',
      arrivalDate: '2026-08-10',
      departureDate: '2026-08-14',
      rooms: [{ roomType: 'Deluxe', count: 12, rate: 850, nights: 4 }],
      totalRevenue: 40800,
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
    {
      id: 'req-demo-2',
      propertyId: pid,
      accountId: 'acc-bertel',
      account: 'Bertel Travel',
      accountName: 'Bertel Travel',
      requestName: 'Wedding Weekend + Rooms',
      confirmationNo: 'EVT-8821',
      requestType: 'Event with Rooms',
      status: 'Inquiry',
      segment: 'Weddings',
      requestDate: '2026-07-05',
      arrivalDate: '2026-09-18',
      departureDate: '2026-09-21',
      totalRevenue: 186000,
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
    {
      id: 'req-demo-3',
      propertyId: pid,
      accountId: 'acc-contoso',
      account: 'Contoso Travel',
      accountName: 'Contoso Travel',
      requestName: 'Q3 Corporate Stay',
      confirmationNo: 'CNF-11002',
      requestType: 'Accommodation',
      status: 'Definite',
      segment: 'Corporate',
      requestDate: '2026-07-08',
      arrivalDate: '2026-07-22',
      departureDate: '2026-07-25',
      rooms: [{ roomType: 'Standard', count: 24, rate: 720, nights: 3 }],
      totalRevenue: 51840,
      paidAmount: 20000,
      contractSigned: true,
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
    {
      id: 'req-demo-4',
      propertyId: pid,
      accountId: 'acc-rsg',
      account: 'Red Sea Global',
      accountName: 'Red Sea Global',
      requestName: 'Incentive Gala Dinner',
      confirmationNo: 'EVT-9104',
      requestType: 'Event',
      status: 'Accepted',
      segment: 'MICE',
      requestDate: '2026-07-11',
      arrivalDate: '2026-10-02',
      departureDate: '2026-10-02',
      totalRevenue: 94000,
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
    {
      id: 'req-demo-5',
      propertyId: pid,
      accountId: 'acc-health',
      account: 'Health Gate',
      accountName: 'Health Gate',
      requestName: 'Medical Congress Series',
      confirmationNo: 'SER-4410',
      requestType: 'Series Group',
      status: 'Actual',
      segment: 'MICE',
      requestDate: '2026-07-14',
      arrivalDate: '2026-06-01',
      departureDate: '2026-06-04',
      totalRevenue: 312000,
      paidAmount: 312000,
      contractSigned: true,
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
    {
      id: 'req-demo-6',
      propertyId: pid,
      accountId: 'acc-dweedy',
      account: 'Dweedy',
      accountName: 'Dweedy',
      requestName: 'Distributor Meet Rooms',
      confirmationNo: 'CNF-11880',
      requestType: 'Accommodation',
      status: 'Tentative',
      segment: 'One Shot Group',
      requestDate: '2026-07-18',
      arrivalDate: '2026-11-12',
      departureDate: '2026-11-15',
      rooms: [{ roomType: 'Suite', count: 8, rate: 1400, nights: 3 }],
      totalRevenue: 33600,
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
    {
      id: 'req-demo-7',
      propertyId: pid,
      accountId: 'acc-rsg',
      account: 'Red Sea Global',
      accountName: 'Red Sea Global',
      requestName: 'Board Retreat (CXL)',
      confirmationNo: 'EVT-7011',
      requestType: 'Event with Rooms',
      status: 'Cancelled',
      segment: 'Corporate',
      requestDate: '2026-06-20',
      arrivalDate: '2026-08-01',
      departureDate: '2026-08-03',
      totalRevenue: 128000,
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
    {
      id: 'req-demo-8',
      propertyId: pid,
      accountId: 'acc-bertel',
      account: 'Bertel Travel',
      accountName: 'Bertel Travel',
      requestName: 'Ramadan Series Hold',
      confirmationNo: 'SER-2201',
      requestType: 'Series Group',
      status: 'Inquiry',
      segment: 'Series Group',
      requestDate: '2026-07-01',
      arrivalDate: '2027-03-01',
      departureDate: '2027-03-10',
      totalRevenue: 420000,
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
  ];
}

function buildDemoPipeline(pm: string): CrmPipelineBuckets {
  const base = defaultPipelineBuckets();
  const pid = DEMO_PROPERTY_ID;
  base.waiting = [
    {
      id: 'lead-w1',
      company: 'Red Sea Global',
      accountId: 'acc-rsg',
      subject: 'AlUla incentive',
      value: 186000,
      periodMonth: pm,
      propertyId: pid,
      lastContact: `${pm}-05`,
      ownerId: DEMO_USER.id,
    },
    {
      id: 'lead-w2',
      company: 'Deira Tours',
      accountId: 'acc-deira',
      subject: 'Q4 FIT block',
      value: 42000,
      periodMonth: pm,
      propertyId: pid,
      lastContact: `${pm}-08`,
      ownerId: DEMO_USER.id,
    },
  ];
  base.qualified = [
    {
      id: 'lead-q1',
      company: 'Health Gate',
      accountId: 'acc-health',
      subject: 'Medical congress',
      value: 312000,
      periodMonth: pm,
      propertyId: pid,
      lastContact: `${pm}-03`,
      ownerId: DEMO_USER.id,
    },
  ];
  base.proposal = [
    {
      id: 'lead-p1',
      company: 'Contoso Travel',
      accountId: 'acc-contoso',
      subject: 'Board retreat',
      value: 94000,
      periodMonth: pm,
      propertyId: pid,
      lastContact: `${pm}-10`,
      ownerId: DEMO_USER.id,
    },
    {
      id: 'lead-p2',
      company: 'Dweedy',
      accountId: 'acc-dweedy',
      subject: 'Distributor meet',
      value: 74000,
      periodMonth: pm,
      propertyId: pid,
      lastContact: `${pm}-12`,
      ownerId: DEMO_USER.id,
    },
  ];
  base.negotiation = [
    {
      id: 'lead-n1',
      company: 'Bertel Travel',
      accountId: 'acc-bertel',
      subject: 'Wedding series',
      value: 220000,
      periodMonth: pm,
      propertyId: pid,
      lastContact: `${pm}-14`,
      ownerId: DEMO_USER.id,
    },
  ];
  base.won = [
    {
      id: 'lead-won1',
      company: 'Health Gate',
      accountId: 'acc-health',
      subject: 'Annual summit',
      value: 540000,
      periodMonth: pm,
      propertyId: pid,
      lastContact: `${pm}-01`,
      ownerId: DEMO_USER.id,
    },
  ];
  return base;
}

function buildDemoSalesCalls(pm: string) {
  return [
    {
      id: 'call-1',
      propertyId: DEMO_PROPERTY_ID,
      accountId: 'acc-rsg',
      accountName: 'Red Sea Global',
      subject: 'Follow-up incentive dates',
      date: `${pm}-04`,
      outcome: 'Positive',
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
    {
      id: 'call-2',
      propertyId: DEMO_PROPERTY_ID,
      accountId: 'acc-bertel',
      accountName: 'Bertel Travel',
      subject: 'Wedding package proposal',
      date: `${pm}-09`,
      outcome: 'Ongoing',
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
    {
      id: 'call-3',
      propertyId: DEMO_PROPERTY_ID,
      accountId: 'acc-contoso',
      accountName: 'Contoso Travel',
      subject: 'Rate negotiation',
      date: `${pm}-11`,
      outcome: 'Positive',
      createdBy: DEMO_USER.id,
      createdByName: DEMO_USER.name,
    },
  ];
}

function tip(colors: any) {
  return {
    contentStyle: {
      backgroundColor: colors.tooltip || colors.card,
      borderColor: colors.border,
      borderRadius: 8,
      color: colors.textMain,
    },
    labelStyle: { color: colors.textMain, fontWeight: 700 },
    itemStyle: { color: colors.textMain },
  };
}

/** Monthly series for Revenue / Requests / Rooms / MICE / Status charts (mirrors AS MainChart). */
const CHART_MONTHLY = [
  { month: 'Jan', revenue: 1524000, totalRequests: 9, rooms: 42, roomNights: 168, roomRevenue: 980000, mice: 2, miceRevenue: 420000, inquiry: 2, tentative: 3, accepted: 1, definite: 2, actual: 1, cancelled: 0 },
  { month: 'Feb', revenue: 1182000, totalRequests: 7, rooms: 36, roomNights: 140, roomRevenue: 760000, mice: 1, miceRevenue: 280000, inquiry: 1, tentative: 2, accepted: 1, definite: 2, actual: 1, cancelled: 0 },
  { month: 'Mar', revenue: 2214000, totalRequests: 11, rooms: 48, roomNights: 192, roomRevenue: 1240000, mice: 3, miceRevenue: 610000, inquiry: 3, tentative: 2, accepted: 2, definite: 3, actual: 1, cancelled: 0 },
  { month: 'Apr', revenue: 3713000, totalRequests: 14, rooms: 62, roomNights: 248, roomRevenue: 1980000, mice: 4, miceRevenue: 920000, inquiry: 2, tentative: 3, accepted: 2, definite: 4, actual: 2, cancelled: 1 },
  { month: 'May', revenue: 2892000, totalRequests: 10, rooms: 51, roomNights: 204, roomRevenue: 1520000, mice: 2, miceRevenue: 540000, inquiry: 2, tentative: 2, accepted: 1, definite: 3, actual: 2, cancelled: 0 },
  { month: 'Jun', revenue: 4128000, totalRequests: 16, rooms: 70, roomNights: 280, roomRevenue: 2280000, mice: 5, miceRevenue: 1100000, inquiry: 3, tentative: 4, accepted: 2, definite: 4, actual: 2, cancelled: 1 },
];

function LiveDashboardHome({ theme }: { theme: any }) {
  const colors = theme.colors;
  const [chartTab, setChartTab] = useState('Performance');
  const [distTab, setDistTab] = useState('Segments');

  const requests = useMemo(() => buildDemoRequests(), []);
  const statusCounts = useMemo(() => {
    const c = { act: 0, def: 0, tent: 0, acc: 0, inq: 0, cxl: 0 };
    for (const r of requests) {
      const s = String(r.status);
      if (s === 'Actual') c.act += 1;
      else if (s === 'Definite') c.def += 1;
      else if (s === 'Tentative') c.tent += 1;
      else if (s === 'Accepted') c.acc += 1;
      else if (s === 'Inquiry') c.inq += 1;
      else if (s === 'Cancelled' || s === 'Lost') c.cxl += 1;
    }
    return c;
  }, [requests]);

  const revenueTotal = requests.reduce((s, r) => s + Number(r.totalRevenue || 0), 0);
  const avgValue = requests.length ? Math.round(revenueTotal / requests.length) : 0;

  const segmentData = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of requests) {
      const seg = String(r.segment || 'Other');
      m[seg] = (m[seg] || 0) + 1;
    }
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [requests]);

  const accountTypeData = [
    { name: 'Travel Agent', value: 2, percent: 33 },
    { name: 'Corporate', value: 2, percent: 33 },
    { name: 'MICE', value: 1, percent: 17 },
    { name: 'One Shot Group', value: 1, percent: 17 },
  ];

  const roomActualPct = 78;
  const roomForecastPct = 92;
  const fnbActualPct = 64;
  const fnbForecastPct = 81;

  const barFills = ['blue', 'cyan', 'green', 'yellow', 'purple', 'red', 'orange'].map((k) => colors[k]);
  const pieFills = ['blue', 'cyan', 'green', 'yellow', 'purple', 'orange'].map((k) => colors[k]);

  const moneyTick = (v: any) => {
    const n = Number(v || 0);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(Math.round(n));
  };

  const renderMainChart = () => {
    if (chartTab === 'Performance') {
      return (
        <div className="flex flex-col lg:flex-row w-full h-full divide-y lg:divide-y-0 lg:divide-x overflow-y-auto" style={{ borderColor: colors.border }}>
          <div className="flex-1 shrink-0 w-full min-h-[220px] lg:min-h-0 flex flex-col p-2 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2 px-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest pl-2 border-l-2" style={{ borderColor: colors.primary, color: colors.textMuted }}>
                Rooms
              </h4>
            </div>
            <div className="flex flex-1 flex-row items-center gap-2">
              <div className="w-5/12 h-full relative shrink-0 min-h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="45%"
                    outerRadius="100%"
                    data={[
                      { name: 'Budget', value: 100, fill: colors.border },
                      { name: 'Forecast', value: roomForecastPct, fill: colors.blue },
                      { name: 'Actual', value: roomActualPct, fill: colors.green },
                    ]}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar background={{ fill: colors.card }} cornerRadius={10} dataKey="value" />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold" style={{ color: colors.textMain }}>{roomActualPct}%</span>
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: colors.textMuted }}>of Budget</span>
                </div>
              </div>
              <div className="w-7/12 flex flex-col justify-center gap-2 px-1">
                <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.green }}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.green }}>Actual</span>
                    <span className="text-[9px] font-mono" style={{ color: colors.green }}>{roomActualPct}%</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: colors.textMain }}>2.84M SAR</span>
                </div>
                <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.blue }}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.blue }}>Forecast</span>
                    <span className="text-[9px] font-mono" style={{ color: colors.blue }}>{roomForecastPct}%</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: colors.textMain }}>3.35M SAR</span>
                </div>
                <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.textMuted }}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.textMuted }}>Budget</span>
                    <span className="text-[9px] font-mono" style={{ color: colors.textMuted }}>Target</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: colors.textMain }}>3.64M SAR</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 shrink-0 w-full min-h-[220px] lg:min-h-0 flex flex-col p-2 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2 px-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest pl-2 border-l-2" style={{ borderColor: colors.orange, color: colors.textMuted }}>
                Food and Beverage
              </h4>
            </div>
            <div className="flex flex-1 flex-row items-center gap-2">
              <div className="w-5/12 h-full relative shrink-0 min-h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="45%"
                    outerRadius="100%"
                    data={[
                      { name: 'Budget', value: 100, fill: colors.border },
                      { name: 'Forecast', value: fnbForecastPct, fill: colors.blue },
                      { name: 'Actual', value: fnbActualPct, fill: colors.green },
                    ]}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar background={{ fill: colors.card }} cornerRadius={10} dataKey="value" />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold" style={{ color: colors.textMain }}>{fnbActualPct}%</span>
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: colors.textMuted }}>of Budget</span>
                </div>
              </div>
              <div className="w-7/12 flex flex-col justify-center gap-2 px-1">
                <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.green }}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.green }}>Actual</span>
                    <span className="text-[9px] font-mono" style={{ color: colors.green }}>{fnbActualPct}%</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: colors.textMain }}>1.12M SAR</span>
                </div>
                <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.blue }}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.blue }}>Forecast</span>
                    <span className="text-[9px] font-mono" style={{ color: colors.blue }}>{fnbForecastPct}%</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: colors.textMain }}>1.42M SAR</span>
                </div>
                <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.textMuted }}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.textMuted }}>Budget</span>
                    <span className="text-[9px] font-mono" style={{ color: colors.textMuted }}>Target</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: colors.textMain }}>1.75M SAR</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        {chartTab === 'Revenue' ? (
          <AreaChart data={CHART_MONTHLY} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="landingColorRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.green} stopOpacity={0.35} />
                <stop offset="95%" stopColor={colors.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
            <YAxis width={48} axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} tickFormatter={moneyTick} />
            <Tooltip {...tip(colors)} formatter={(v: any) => [`${Number(v).toLocaleString()} SAR`, 'Revenue']} />
            <Area type="monotone" dataKey="revenue" stroke={colors.green} fill="url(#landingColorRev)" strokeWidth={2} />
          </AreaChart>
        ) : chartTab === 'Requests' ? (
          <BarChart data={CHART_MONTHLY} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} allowDecimals={false} />
            <Tooltip {...tip(colors)} cursor={{ fill: colors.border }} />
            <Bar dataKey="totalRequests" name="Total Requests" fill={colors.blue} radius={[4, 4, 0, 0]} barSize={22} />
          </BarChart>
        ) : chartTab === 'Rooms' ? (
          <ComposedChart data={CHART_MONTHLY} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
            <YAxis yAxisId="rooms" orientation="left" width={36} axisLine={false} tickLine={false} tick={{ fill: colors.cyan, fontSize: 9 }} allowDecimals={false} />
            <YAxis yAxisId="money" orientation="right" width={44} axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 9 }} tickFormatter={moneyTick} />
            <Tooltip {...tip(colors)} />
            <Legend wrapperStyle={{ fontSize: 10, color: colors.textMuted }} />
            <Bar yAxisId="rooms" dataKey="rooms" name="Rooms" fill={colors.cyan} radius={[4, 4, 0, 0]} barSize={16} />
            <Line yAxisId="rooms" type="monotone" dataKey="roomNights" name="Room Nights" stroke={colors.blue} strokeWidth={2} dot={{ r: 2 }} />
            <Line yAxisId="money" type="monotone" dataKey="roomRevenue" name="Room Revenue" stroke={colors.green} strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        ) : chartTab === 'MICE' ? (
          <ComposedChart data={CHART_MONTHLY} margin={{ top: 10, right: 12, left: -4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
            <YAxis yAxisId="cnt" orientation="left" width={36} axisLine={false} tickLine={false} tick={{ fill: colors.orange, fontSize: 9 }} allowDecimals={false} />
            <YAxis yAxisId="money" orientation="right" width={44} axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 9 }} tickFormatter={moneyTick} />
            <Tooltip {...tip(colors)} />
            <Legend wrapperStyle={{ fontSize: 10, color: colors.textMuted }} />
            <Bar yAxisId="cnt" dataKey="mice" name="MICE Requests" fill={colors.orange} radius={[4, 4, 0, 0]} barSize={18} />
            <Line yAxisId="money" type="monotone" dataKey="miceRevenue" name="MICE Revenue" stroke={colors.purple} strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        ) : (
          <BarChart data={CHART_MONTHLY} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} allowDecimals={false} />
            <Tooltip {...tip(colors)} cursor={{ fill: colors.border }} />
            <Legend wrapperStyle={{ fontSize: 10, color: colors.textMuted }} />
            <Bar dataKey="inquiry" name="Inquiry" stackId="s" fill={colors.textMuted} />
            <Bar dataKey="tentative" name="Tentative" stackId="s" fill={colors.blue} />
            <Bar dataKey="accepted" name="Accepted" stackId="s" fill={colors.yellow} />
            <Bar dataKey="definite" name="Definite" stackId="s" fill={colors.green} />
            <Bar dataKey="actual" name="Actual" stackId="s" fill="#059669" />
            <Bar dataKey="cancelled" name="Cancelled" stackId="s" fill={colors.red} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3">
      <div className="col-span-1 md:col-span-12 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Total Requests" value={String(requests.length)} subtext="+3 vs last month" icon={CalendarCheck} colorKey="blue" theme={theme} />
        <KPICard
          label="Total Revenue"
          value={`${(revenueTotal / 1_000_000).toFixed(2)}M SAR`}
          subtext="▲ 12% vs prev"
          icon={DollarSign}
          isPrimary
          theme={theme}
        />
        <KPICard
          label="Avg Value"
          value={`${Math.round(avgValue / 1000)}K SAR`}
          subtext="Per request"
          icon={TrendingUp}
          colorKey="cyan"
          theme={theme}
        />
        <KPICard label="Accounts" value="6" subtext="Active Clients" icon={Users} colorKey="blue" theme={theme} />
      </div>

      <div className="col-span-1 md:col-span-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 gap-2">
        <MiniStatCard label="ACT" value={String(statusCounts.act)} colorKey="#059669" colors={colors} />
        <MiniStatCard label="DEF" value={String(statusCounts.def)} colorKey="green" colors={colors} />
        <MiniStatCard label="TENT" value={String(statusCounts.tent)} colorKey="blue" colors={colors} />
        <MiniStatCard label="ACC" value={String(statusCounts.acc)} colorKey="yellow" colors={colors} />
        <MiniStatCard label="INQ" value={String(statusCounts.inq)} colorKey="textMuted" colors={colors} />
        <MiniStatCard label="CXL" value={String(statusCounts.cxl)} colorKey="red" colors={colors} />
        <MiniStatCard label="Lost AMT" value="128K" colorKey="red" colors={colors} />
        <MiniStatCard label="Paid" value="332K" colorKey="green" colors={colors} />
        <MiniStatCard label="Signed" value="2" colorKey="green" colors={colors} />
        <MiniStatCard label="Calls" value="3" colorKey="cyan" colors={colors} />
      </div>

      {/* Match AS dashboard proportions: chart 8 cols, segments 4 — taller than AS h-72 */}
      <div className="col-span-1 md:col-span-8 h-96 md:h-[28rem] w-full min-w-0">
        <Card
          className="h-full w-full"
          tabs={['Performance', 'Revenue', 'Requests', 'Rooms', 'MICE', 'Status']}
          activeTab={chartTab}
          onTabChange={setChartTab}
          actionIcon={MoreHorizontal}
          colors={colors}
        >
          <div className="w-full h-full min-h-0 p-2">{renderMainChart()}</div>
        </Card>
      </div>

      <div className="col-span-1 md:col-span-4 h-96 md:h-[28rem] w-full min-w-0">
        <Card className="h-full w-full" tabs={['Segments', 'Account Type']} activeTab={distTab} onTabChange={setDistTab} actionIcon={Activity} colors={colors}>
          <div className="w-full h-full min-h-0 p-2">
            <ResponsiveContainer width="100%" height="100%">
              {distTab === 'Segments' ? (
                <BarChart layout="vertical" data={segmentData} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 9 }} />
                  <YAxis dataKey="name" type="category" width={100} tickMargin={8} interval={0} axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 9 }} />
                  <Tooltip {...tip(colors)} cursor={{ fill: colors.border, fillOpacity: 0.1 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                    {segmentData.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={barFills[index % barFills.length]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie data={accountTypeData} cx="50%" cy="48%" innerRadius={36} outerRadius={58} paddingAngle={5} dataKey="value" label={false}>
                    {accountTypeData.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={pieFills[index % pieFills.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...tip(colors)}
                    formatter={(value: any, _n: any, item: any) => [
                      `${value} account${value === 1 ? '' : 's'}`,
                      item?.payload?.name ?? 'Type',
                    ]}
                  />
                  <Legend verticalAlign="bottom" height={44} iconType="circle" wrapperStyle={{ fontSize: '10px', color: colors.textMuted }} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

type DemoTab = 'dashboard' | 'requests' | 'crm';
type CrmDemoView = 'dashboard' | 'pipeline' | 'list';

type ProductExperienceDemoProps = {
  theme?: any;
  colors?: any;
  className?: string;
  title?: string;
  /** Smaller outer shell for Taste landing embed */
  compact?: boolean;
  /** Jump target when mounting */
  initialTab?: DemoTab;
};

/** Interactive product slice using real Advanced Sales components */
export function ProductExperienceDemo({
  theme: themeProp,
  colors: colorsProp,
  className = '',
  title = 'Advanced Sales — live product tour',
  compact = false,
  initialTab = 'dashboard',
}: ProductExperienceDemoProps) {
  const theme = themeProp || { colors: colorsProp || {}, name: 'Demo' };
  const colors = theme.colors || colorsProp || {};
  const [tab, setTab] = useState<DemoTab>(initialTab);
  const [crmView, setCrmView] = useState<CrmDemoView>('dashboard');
  const pm = useMemo(() => periodMonthNow(), []);
  const [accounts, setAccounts] = useState(() => buildDemoAccounts());
  const [pipeline, setPipeline] = useState<CrmPipelineBuckets>(() => buildDemoPipeline(pm));
  const [salesCalls, setSalesCalls] = useState(() => buildDemoSalesCalls(pm));
  const [sharedRequests, setSharedRequests] = useState(() => buildDemoRequests());
  const [searchParams, setSearchParams] = useState<any>({});
  const [createdByUserFilterId, setCreatedByUserFilterId] = useState('');

  const dashRef = useRef<HTMLElement | null>(null);
  const reqRef = useRef<HTMLElement | null>(null);
  const crmRef = useRef<HTMLElement | null>(null);

  const crmSalesPeriod: CrmSalesPeriod = useMemo(() => {
    const [y, m] = pm.split('-').map(Number);
    return { mode: 'month', year: y, month: m, quarter: null };
  }, [pm]);

  const jump = (id: DemoTab) => {
    setTab(id);
    const el = id === 'dashboard' ? dashRef.current : id === 'requests' ? reqRef.current : crmRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (initialTab && initialTab !== 'dashboard') {
      const t = window.setTimeout(() => jump(initialTab), 80);
      return () => window.clearTimeout(t);
    }
  }, []);

  const tabs: { id: DemoTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'requests', label: 'Requests' },
    { id: 'crm', label: 'CRM' },
  ];

  const crmTabs: { id: CrmDemoView; label: string }[] = [
    { id: 'dashboard', label: 'Sales Funnel' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'list', label: 'List' },
  ];

  const sectionMax = compact ? 'max-h-[min(58vh,560px)]' : 'max-h-[min(70vh,720px)]';
  const shellMax = compact ? 'max-h-[min(78vh,880px)]' : 'max-h-[min(85vh,1100px)]';

  const syncRequest = (req: any) => {
    setSharedRequests((prev) => {
      const id = String(req?.id || '');
      if (!id) return prev;
      const i = prev.findIndex((r) => String(r.id) === id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = req;
        return next;
      }
      return [req, ...prev];
    });
  };

  return (
    <div
      className={`rounded-2xl overflow-hidden border shadow-2xl ${className}`}
      style={{
        background: colors.bg,
        borderColor: colors.border,
        boxShadow: `0 28px 60px -24px ${withAlpha(colors.primaryShadow || '#000', 0.55)}`,
      }}
    >
      <div
        className="sticky top-0 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b"
        style={{ background: colors.card, borderColor: colors.border }}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-bold truncate" style={{ color: colors.textMain }}>
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => jump(t.id)}
                className="text-[9px] px-2.5 py-1 rounded uppercase tracking-wide font-bold whitespace-nowrap border transition-colors"
                style={
                  on
                    ? { backgroundColor: colors.primary, color: '#111', borderColor: colors.primary }
                    : { color: colors.textMuted, borderColor: colors.border, background: 'transparent' }
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`overflow-y-auto custom-scrollbar ${shellMax}`} style={{ background: colors.bg }}>
        <section ref={dashRef as any} className="scroll-mt-2">
          <LiveDashboardHome theme={theme} />
        </section>

        <section
          ref={reqRef as any}
          className="scroll-mt-2 border-t"
          style={{ borderColor: colors.border }}
        >
          <div className="px-3 pt-3 pb-1 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: colors.primary }}>
                Requests
              </p>
              <h4 className="text-sm font-bold" style={{ color: colors.textMain }}>
                All Requests
              </h4>
            </div>
          </div>
          <div className={`p-2 overflow-y-auto ${sectionMax}`}>
            <RequestsManager
              theme={theme}
              subView="list"
              searchParams={searchParams}
              setSearchParams={setSearchParams}
              activeProperty={DEMO_PROPERTY}
              accounts={accounts}
              setAccounts={setAccounts}
              sharedRequestsSeed={sharedRequests}
              readOnlyOperational={false}
              currentUser={DEMO_USER}
              currency="SAR"
              segmentOptions={['FIT', 'Corporate', 'MICE', 'Weddings', 'Series Group', 'One Shot Group']}
              accountTypeOptions={['Travel Agent', 'Corporate', 'MICE', 'One Shot Group']}
              assignableUsersForProperty={[{ id: DEMO_USER.id, name: DEMO_USER.name }]}
              onRequestSaved={syncRequest}
              onRequestDeleted={(id) => {
                setSharedRequests((prev) => prev.filter((r) => String(r.id) !== String(id)));
              }}
            />
          </div>
        </section>

        <section
          ref={crmRef as any}
          className="scroll-mt-2 border-t"
          style={{ borderColor: colors.border }}
        >
          <div className="px-3 pt-3 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: colors.primary }}>
                CRM
              </p>
              <h4 className="text-sm font-bold" style={{ color: colors.textMain }}>
                Sales Funnel &amp; pipeline
              </h4>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              {crmTabs.map((t) => {
                const on = crmView === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCrmView(t.id)}
                    className="text-[9px] px-2.5 py-1 rounded uppercase tracking-wide font-bold whitespace-nowrap border"
                    style={
                      on
                        ? { backgroundColor: colors.primary, color: '#111', borderColor: colors.primary }
                        : { color: colors.textMuted, borderColor: colors.border, background: 'transparent' }
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={`p-2 overflow-y-auto ${sectionMax}`}>
            <CRM
              key={crmView}
              theme={theme}
              externalView={crmView}
              activeProperty={DEMO_PROPERTY}
              accounts={accounts}
              setAccounts={setAccounts}
              salesCalls={salesCalls}
              setSalesCalls={setSalesCalls}
              pipeline={pipeline}
              setPipeline={setPipeline}
              sharedRequests={sharedRequests}
              setSharedRequests={setSharedRequests}
              currentUser={DEMO_USER}
              crmSalesPeriod={crmSalesPeriod}
              createdByUserFilterId={createdByUserFilterId}
              onCreatedByUserFilterIdChange={setCreatedByUserFilterId}
              currency="SAR"
              crmFilterUsers={[{ id: DEMO_USER.id, name: DEMO_USER.name }]}
              assignableUsersForAccounts={[{ id: DEMO_USER.id, name: DEMO_USER.name }]}
              accountTypeOptions={['Travel Agent', 'Corporate', 'MICE', 'One Shot Group']}
              segmentOptions={['FIT', 'Corporate', 'MICE', 'Weddings', 'Series Group', 'One Shot Group']}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
