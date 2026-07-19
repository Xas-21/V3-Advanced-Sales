import React, { useState, useMemo, useEffect, useRef, useCallback, memo, Suspense, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    CalendarDays,
    Wine,
    Settings,
    Pin,
    PinOff,
    Search,
    Bell,
    User,
    TrendingUp,
    Users,
    Briefcase,
    MoreHorizontal,
    FileCheck,
    Clock,
    ChevronDown,
    BarChart3,
    PieChart as PieChartIcon,
    Activity,
    BedDouble,
    Crown,
    CheckSquare,
    MessageSquare,
    Filter,
    ArrowRightLeft,
    DollarSign,
    FileText,
    Phone,
    XCircle,
    CheckCircle2,
    AlertCircle,
    Palette,
    X,
    Target,
    Briefcase as BriefcaseIcon,
    Menu,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Check,
    ListTodo,
    List,
    Star,
    ClipboardList,
    Plus,
    MapPin,
    Utensils,
    Calendar,
    CalendarCheck,
    Printer,
    Grid,
    LayoutList,
    Download,
    Trash2,
    UserPlus,
} from 'lucide-react';
import { apiUrl } from './backendApi';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    Legend,
    LineChart,
    Line,
    ComposedChart,
    RadialBarChart,
    RadialBar
} from 'recharts';
import Login from './Login';
import { useWebSocket, type WebSocketMessage } from './websocket-client';
import { CRM_QUARTER_MONTH_BLOCKS, type CrmSalesPeriod } from './crmActivitiesUtils';
import { dispatchChatWs } from './messenger/chatWsBridge';
import { collectSalesCallFormViolations, FORM_CONFIGURATION_CHANGED_EVENT } from './formConfigurations';
import { flattenCrmLeads, filterRequestsForAccount, computeAccountMetrics } from './accountProfileData';
import {
    defaultCrmState,
    mergeCrmStateFromApi,
    PIPELINE_STAGE_KEYS,
    filterPipelineForProperty,
    filterSalesCallsForProperty,
    crmStateToLegacyLeads,
    updatePipelineForLinkedRequest,
    syncAllPipelineCardsFromRequests,
    clearPipelineLinkForDeletedRequest,
    linkRequestToMonthlyPipelineCard,
    linkAgreementTemplateToMonthlyPipelineCard,
    migrateLegacyLeads,
    type CrmStatePayload,
    type PipelineLinkExtras,
} from './crmStateModel';
import { formatCompactAmount, formatCompactCurrency } from './formatCompactCurrency';
import { CURRENCY_OPTIONS, type CurrencyCode, formatCurrencyAmount, resolveCurrencyCode } from './currency';
import { contactDisplayName } from './accountLeadMapping';
import {
    calculateAccFinancialsForRequest,
    calculateNights,
    printBeoDocument,
    getAccountForRequest,
    getEventDateWindow,
    formatAgendaPackageSummary,
    formatAgendaRowCoffeeBreak,
    formatAgendaRowLunch,
    formatAgendaRowDinner,
    formatBeoSpecialRequestsCombined,
    inclusiveCalendarDays,
    normalizeRequestTypeKey,
    shouldIncludeRequestInRoomsChart,
    getBeoScopeGrandTotalInclTax,
    deriveBeoPaymentView,
    sumAgendaAttendeeDays,
    expandAgendaRowVenueOccupancies,
    formatAgendaRowVenueDisplay,
} from './beoShared';
import { resolveUserAttributionId, taskAssignedToUser, getPrimaryOperationalDate } from './userProfileMetrics';
import { buildAccountProfileChartData, getDefaultAccountPerformanceRange } from './accountProfileChartData';
import AccountProfilePerformanceChart from './AccountProfilePerformanceChart';
import ChartVsCompareControls, { defaultChartVsYear } from './ChartVsCompareControls';
import {
    chartTabSupportsVs,
    mergeChartRowsWithLyComparison,
    shiftRangeToComparisonYear,
} from './chartVsYearCompare';
import { computeAllRequestAlerts, type RequestAlert } from './requestAlertEngine';
import { refreshRequestsWithDefiniteToActual } from './requestStatusAutomation';
import { localDateKey, loadDismissMap, saveDismissMap, isDismissedForDate } from './alertDismissals';
import {
    resolveSegmentsForProperty,
    resolveAccountTypesForProperty,
    TAXONOMY_CHANGED_EVENT,
} from './propertyTaxonomy';
import {
    ALERT_SETTINGS_CHANGED_EVENT,
    resolveAlertSettingsForProperty,
    shouldCreateTaskForAlertKind,
} from './propertyAlertSettings';
import { CALL_SETTINGS_CHANGED_EVENT } from './propertyCallSettings';
import { MEALS_PACKAGES_CHANGED_EVENT } from './propertyMealsPackages';
import { OCCUPANCY_TYPES_CHANGED_EVENT } from './propertyOccupancyTypes';
import { PAYMENT_METHODS_CHANGED_EVENT } from './propertyPaymentMethods';
import { bucketRequestDistribution, REQUEST_DISTRIBUTION_META } from './requestTypeUtils';
import { StatusBadge, KPICard, Card, MiniStatCard } from './dashboardHub/dashboardChrome';
import {
    addProratedRequestFinancialsToDashboardBuckets,
    buildReportSegmentsForRequest,
    computeRequestRevenueBreakdownNoTax,
    getRequestOperationalCountDates,
    incrementUniqueRequestChartCounts,
    requestCountsInChartsPeriod,
    requestOperationalDatesOverlapRange,
    requestTouchesOperationalRange,
    sumRequestProratedEventRevenueExTaxInRange,
    sumRequestOperationalRevenueExTaxInRange,
    sumRequestProratedRoomRevenueExTaxInRange,
} from './operationalSegmentRevenue';
import {
    can,
    canAccessReports,
    canAccessPromotions,
    canCreatePromotions,
    canEditPromotions,
    canDeletePromotions,
    canLinkRequestPromotions,
    canShowAccountsNavItem,
    getAllowedAppViewsForUser,
    MAIN_NAV_ITEM_PERMISSIONS,
    canDeleteTasks,
    canDeleteContracts,
    canDeleteContractTemplates,
    canMutateOperational,
    canDeleteRequests,
    canDeleteRequestPayments,
} from './userPermissions';
import { normalizePathname, parseAppPath, viewToPath } from './appShellRoutes';
import type { DashboardHubTabId } from './dashboardHub/dashboardHubTabs';

function normalizeComparePath(pathname: string): string {
    return normalizePathname(pathname);
}

const LandingPage = lazy(() => import('./LandingPage'));
const LandingPageTasteMotionPreview = lazy(() => import('./landingPreviews/LandingPageTasteMotionPreview'));
const RequestFeedbackPublicPage = lazy(() => import('./RequestFeedbackPublicPage'));
const CRM = lazy(() => import('./CRM'));
const Contracts = lazy(() => import('./Contracts'));
const Reports = lazy(() => import('./Reports'));
const SettingsPage = lazy(() => import('./Settings'));
const RequestsManager = lazy(() => import('./RequestsManager'));
const AddSalesCallModal = lazy(() => import('./AddSalesCallModal'));
const AddAccountModal = lazy(() => import('./AddAccountModal'));
const AccountsPage = lazy(() => import('./AccountsPage'));
const DashboardHubShell = lazy(() => import('./dashboardHub/DashboardHubShell'));
const MessengerWidget = lazy(() => import('./messenger/MessengerWidget'));
const PromotionsPage = lazy(() => import('./PromotionsPage'));

function PageLoadFallback({ label = 'Loading…' }: { label?: string }) {
    return (
        <div className="flex items-center justify-center min-h-[40vh] w-full text-sm opacity-60" aria-busy="true">
            {label}
        </div>
    );
}

/**
 * Advanced Sales v20
 * * Fixes:
 * - Added missing CalendarCheck import.
 * - Verified object rendering safety.
 */

// --- Theme Presets ---
const THEMES = {
    luxury: {
        name: 'Luxury Dark',
        colors: {
            bg: '#121212',
            card: '#1E1E1E',
            primary: '#C09A4E', // Rich Metallic Gold
            primaryHighlight: '#EACD84',
            primaryShadow: '#806125',
            primaryDim: 'rgba(192, 154, 78, 0.15)',
            textMain: '#FFFFFF',
            textMuted: '#9CA3AF',
            border: 'rgba(255, 255, 255, 0.08)',
            grid: '#333333',
            tooltip: '#1E1E1E',
            blue: '#3B82F6',
            green: '#10B981',
            cyan: '#06B6D4',
            orange: '#F97316',
            yellow: '#EAB308',
            red: '#EF4444',
            purple: '#8B5CF6',
        }
    },
    light: {
        name: 'Blue Sky',
        colors: {
            bg: '#DBEAFE', // Stronger light blue background
            card: '#EFF6FF', // Distinctly blue-white card background
            primary: '#1D4ED8', // Deep vibrant blue
            primaryHighlight: '#3B82F6',
            primaryShadow: '#1E3A8A',
            primaryDim: 'rgba(37, 99, 235, 0.15)',
            textMain: '#0F172A', // Navy text
            textMuted: '#475569', // Blue-grey muted text
            border: '#BFDBFE', // Solid light blue border
            grid: '#BFDBFE', // Matching grid
            tooltip: '#EFF6FF',
            blue: '#2563EB',
            green: '#059669',
            cyan: '#0891B2',
            orange: '#EA580C',
            yellow: '#CA8A04',
            red: '#DC2626',
            purple: '#7C3AED',
        }
    },
    desert: {
        name: 'AlUla Desert',
        colors: {
            bg: '#EFE5D9',
            card: '#FFF8F0',
            primary: '#D67D3E',
            primaryHighlight: '#E8A775',
            primaryShadow: '#9C5624',
            primaryDim: 'rgba(214, 125, 62, 0.15)',
            textMain: '#4A3B32',
            textMuted: '#8C7B70',
            border: 'rgba(74, 59, 50, 0.08)',
            grid: '#DECDC3',
            tooltip: '#FFF8F0',
            blue: '#5D8AA8',
            green: '#556B2F',
            cyan: '#4682B4',
            orange: '#CD853F',
            yellow: '#DAA520',
            red: '#A52A2A',
            purple: '#800080',
        }
    },
    colorful: {
        name: 'Cyber Pop',
        colors: {
            bg: '#0F172A',
            card: '#1E293B',
            primary: '#F43F5E',
            primaryHighlight: '#FDA4AF',
            primaryShadow: '#BE123C',
            primaryDim: 'rgba(244, 63, 94, 0.15)',
            textMain: '#F8FAFC',
            textMuted: '#94A3B8',
            border: 'rgba(255, 255, 255, 0.08)',
            grid: '#334155',
            tooltip: '#1E293B',
            blue: '#38BDF8',
            green: '#34D399',
            cyan: '#22D3EE',
            orange: '#FB923C',
            yellow: '#FACC15',
            red: '#FB7185',
            purple: '#C084FC',
        }
    }
};

/** Recharts default tooltip renders name/value in black; align label + items with theme foreground. */
function rechartsTooltipThemeProps(colors: any, contentStylePatch?: Record<string, any>) {
    return {
        contentStyle: {
            backgroundColor: colors.tooltip,
            borderColor: colors.border,
            borderRadius: 8,
            color: colors.textMain,
            ...(contentStylePatch || {}),
        },
        labelStyle: { color: colors.textMain, fontWeight: 700 },
        itemStyle: { color: colors.textMain },
    };
}

const CRM_BY_PROP_PREFIX = 'visatour_crm_leads_by_prop_v1::';
const ACTIVE_PROPERTY_STORAGE_KEY = 'visatour_active_property_id_v1';
const crmLocalStorageKey = (propertyId: string) => `${CRM_BY_PROP_PREFIX}${propertyId}`;

const defaultCrmLeadBuckets = () => ({
    new: [] as any[],
    waiting: [] as any[],
    qualified: [] as any[],
    proposal: [] as any[],
    negotiation: [] as any[],
    won: [] as any[],
    notInterested: [] as any[]
});

function mergeCrmBucketsFromApi(raw: any): Record<string, any[]> {
    const base = defaultCrmLeadBuckets();
    if (!raw || typeof raw !== 'object') return base;
    (Object.keys(base) as string[]).forEach((key) => {
        const arr = (raw as any)[key];
        if (Array.isArray(arr)) (base as any)[key] = arr;
    });
    return base;
}

/** Keep only leads that belong to this property: explicit propertyId, or legacy rows tied to an account on this property. */
function filterCrmBucketsForPropertyContext(
    buckets: Record<string, any[]>,
    propertyId: string,
    accounts: any[]
): Record<string, any[]> {
    const pid = String(propertyId);
    const allowedAccountIds = new Set((accounts || []).map((a: any) => String(a.id)));
    const out = defaultCrmLeadBuckets();
    (Object.keys(out) as string[]).forEach((key) => {
        const arr = (buckets as any)[key];
        if (!Array.isArray(arr)) return;
        (out as any)[key] = arr
            .filter((l: any) => {
                const lp = l.propertyId != null && String(l.propertyId).trim() !== '' ? String(l.propertyId) : '';
                if (lp) return lp === pid;
                if (!l.accountId) return false;
                return allowedAccountIds.has(String(l.accountId));
            })
            .map((l: any) => (l.propertyId ? l : { ...l, propertyId: pid }));
    });
    return out;
}

const DASHBOARD_PERIOD_MODES = ['autoCurrentYear', 'custom', 'mtd', 'ytd'] as const;
type DashboardPeriodMode = (typeof DASHBOARD_PERIOD_MODES)[number];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KPI_STATUS_ORDER = ['Inquiry', 'Accepted', 'Tentative', 'Definite', 'Actual', 'Cancelled'] as const;

const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const parseYmd = (value: any): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return toYmd(dt);
};

const asNumber = (value: any) => parseFloat(String(value ?? 0).replace(/,/g, '')) || 0;

const normalizeStatus = (status: any): string => {
    const raw = String(status || '').trim().toLowerCase();
    if (raw === 'draft') return 'Inquiry';
    if (raw === 'inquiry') return 'Inquiry';
    if (raw === 'accepted') return 'Accepted';
    if (raw === 'tentative') return 'Tentative';
    if (raw === 'definite') return 'Definite';
    if (raw === 'actual') return 'Actual';
    if (raw === 'cancelled') return 'Cancelled';
    return '';
};

/** Dashboard KPIs, revenue, rooms, and MICE: same as Requests / vs LY (exclude cancelled and lost; status chips still list them). */
const isDashboardExcludedRequest = (req: any) => {
    const raw = String(req?.status || '')
        .trim()
        .toLowerCase();
    if (raw === 'cancelled' || raw === 'lost') return true;
    return normalizeStatus(req?.status) === 'Cancelled';
};

const isSeriesRequest = (req: any) => String(req?.requestType || '').toLowerCase().includes('series');

function isMiceRequest(req: any) {
    const t = String(req?.requestType || '').toLowerCase();
    if (t === 'event') return true;
    if (t === 'event_rooms') return true;
    if (t === 'series' || t.includes('series')) return true;
    if (t.includes('event with')) return true;
    return false;
}

/** Events & Catering kanban + dashboard MICE tab: Event, Event+Rooms, and similar — excludes Series / group-series stays. */
function isEventsCateringEligibleRequest(req: any): boolean {
    if (isSeriesRequest(req)) return false;
    const t = String(req?.requestType || '').toLowerCase();
    if (t === 'event') return true;
    if (t === 'event_rooms') return true;
    if (t.includes('event with')) return true;
    return false;
}

/** Calendar days in range for MICE event/agenda attribution (dashboard charts). */
const getMiceAttributionDatesInRange = (req: any, range: { start: string; end: string }): string[] => {
    if (!isEventsCateringEligibleRequest(req)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    const pushDay = (iso: string) => {
        if (!iso || !isIsoInRange(iso, range) || seen.has(iso)) return;
        seen.add(iso);
        out.push(iso);
    };
    for (const item of Array.isArray(req?.agenda) ? req.agenda : []) {
        const s = parseYmd(item?.startDate);
        const e = parseYmd(item?.endDate || item?.startDate);
        if (!s) continue;
        let c = new Date(`${s}T00:00:00`).getTime();
        const endAt = new Date(`${e || s}T00:00:00`).getTime();
        while (c <= endAt) {
            pushDay(toYmd(new Date(c)));
            c += 86400000;
        }
    }
    if (out.length) return out.sort();
    for (const d of getRequestOperationalCountDates(req)) {
        if (d && isIsoInRange(d, range)) pushDay(d);
    }
    return out.sort();
};

const getCurrentYearRange = () => {
    const now = new Date();
    const y = now.getFullYear();
    return {
        start: `${y}-01-01`,
        end: `${y}-12-31`,
    };
};

/** Month-to-date through the anchor day (local calendar). */
const getMtdRange = (anchor: Date) => {
    const y = anchor.getFullYear();
    const m = anchor.getMonth() + 1;
    return {
        start: `${y}-${String(m).padStart(2, '0')}-01`,
        end: toYmd(anchor),
    };
};

/** Calendar year-to-date: Jan 1 of anchor’s year through anchor day (local). */
const getYtdRange = (anchor: Date) => ({
    start: `${anchor.getFullYear()}-01-01`,
    end: toYmd(anchor),
});

const shiftRangeByYears = (range: { start: string; end: string }, years: number) => {
    const s = parseYmd(range.start);
    const e = parseYmd(range.end);
    if (!s || !e) return range;
    const sd = new Date(`${s}T00:00:00`);
    const ed = new Date(`${e}T00:00:00`);
    sd.setFullYear(sd.getFullYear() + years);
    ed.setFullYear(ed.getFullYear() + years);
    return { start: toYmd(sd), end: toYmd(ed) };
};

const isIsoInRange = (iso: string, range: { start: string; end: string }) => {
    if (!iso) return false;
    return iso >= range.start && iso <= range.end;
};

const fmtMd = (iso: string) => {
    const parsed = parseYmd(iso);
    if (!parsed) return '—';
    const dt = new Date(`${parsed}T00:00:00`);
    return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
};

const formatPeriodLabel = (range: { start: string; end: string }) => `${fmtMd(range.start)} - ${fmtMd(range.end)}`;

const getMonthKey = (iso: string) => {
    const parsed = parseYmd(iso);
    return parsed ? parsed.slice(0, 7) : '';
};

type DashboardAxisGranularity = 'month' | 'day';
type DashboardAxisPoint = { key: string; month: string };

const monthNameToIndex = (name: any) => {
    const num = Number(name);
    if (Number.isFinite(num) && num >= 1 && num <= 12) return num - 1;
    const raw = String(name || '').trim().toLowerCase();
    const names = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const fullIdx = names.indexOf(raw);
    if (fullIdx >= 0) return fullIdx;
    const short = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return short.indexOf(raw);
};

const buildDashboardAxis = (range: { start: string; end: string }): { granularity: DashboardAxisGranularity; points: DashboardAxisPoint[] } => {
    const startIso = parseYmd(range.start);
    const endIso = parseYmd(range.end);
    if (!startIso || !endIso || startIso > endIso) return { granularity: 'month', points: [] };
    const start = new Date(`${startIso}T00:00:00`);
    const end = new Date(`${endIso}T00:00:00`);
    const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
    if (sameMonth) {
        const points: DashboardAxisPoint[] = [];
        const cursor = new Date(start);
        while (cursor <= end) {
            const iso = toYmd(cursor);
            points.push({
                key: iso,
                month: String(cursor.getDate()).padStart(2, '0'),
            });
            cursor.setDate(cursor.getDate() + 1);
        }
        return { granularity: 'day', points };
    }
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endBoundary = new Date(end.getFullYear(), end.getMonth(), 1);
    const singleYear = start.getFullYear() === end.getFullYear();
    const out: DashboardAxisPoint[] = [];
    while (cursor <= endBoundary) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const label = singleYear
            ? MONTH_SHORT[cursor.getMonth()]
            : `${MONTH_SHORT[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`;
        out.push({ key, month: label });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return { granularity: 'month', points: out };
};

const getDashboardAxisKey = (iso: string, granularity: DashboardAxisGranularity) => {
    const parsed = parseYmd(iso);
    if (!parsed) return '';
    return granularity === 'day' ? parsed : getMonthKey(parsed);
};

const recentRequests = [
    { id: 1, client: 'Brainquil', type: 'Event w/o Rooms', date: 'Jan 18', status: 'Pending', amount: '45k' },
    { id: 2, client: 'Al-Mosafer', type: 'Series Group', date: 'Jan 17', status: 'Actual', amount: '120k' },
    { id: 3, client: 'Pangaea', type: 'FIT Group', date: 'Jan 16', status: 'Paid', amount: '32k' },
    { id: 4, client: 'ALBORAQ', type: 'Corp Event', date: 'Jan 15', status: 'Draft', amount: '15k' },
    { id: 5, client: 'Royal Comm.', type: 'Gov Delegation', date: 'Jan 14', status: 'Actual', amount: '85k' },
    { id: 6, client: 'Husaak', type: 'Adventure', date: 'Jan 12', status: 'Paid', amount: '28k' },
];

const recentSalesCalls = [
    { id: 1, activity: 'Site Inspection', client: 'Rolex Team', date: 'Yesterday', result: 'Positive' },
    { id: 2, activity: 'Contract Neg.', client: 'Seera Group', date: 'Jan 15', result: 'Ongoing' },
    { id: 3, activity: 'Sales Visit', client: 'Royal Comm.', date: 'Jan 12', result: 'Completed' },
    { id: 4, activity: 'Cold Call', client: 'Tech Solutions', date: 'Jan 10', result: 'No Answer' },
];

const TASK_CATEGORIES = ['Follow-up', 'Contract', 'Payment', 'Event Prep', 'Internal'];

const MOCK_PROPERTIES = [];

const accountPerformanceData = [
    { id: 1, client: 'Seera Group', type: 'DMC', revenue: 'SAR 450k', bookings: 15, trend: '+12%' },
    { id: 2, client: 'Al-Mosafer', type: 'DMC', revenue: 'SAR 320k', bookings: 12, trend: '+5%' },
    { id: 3, client: 'Saudi Aramco', type: 'Corporate', revenue: 'SAR 280k', bookings: 8, trend: 'Stable' },
    { id: 4, client: 'Royal Comm.', type: 'Government', revenue: 'SAR 190k', bookings: 5, trend: '+20%' },
    { id: 5, client: 'Husaak', type: 'Adventure', revenue: 'SAR 150k', bookings: 10, trend: '+8%' },
    { id: 6, client: 'Roam', type: 'DMC', revenue: 'SAR 120k', bookings: 6, trend: '-2%' },
];

const analyticTables = {
    statusBreakdown: [
        { label: 'Actual', count: 54, pct: '56%' },
        { label: 'Cancelled', count: 16, pct: '17%' },
        { label: 'Paid', count: 13, pct: '13%' },
        { label: 'Pending', count: 13, pct: '14%' },
    ],
    typeBreakdown: [
        { label: 'Group Accom.', count: 42, pct: '45%' },
        { label: 'Event w/o Rooms', count: 28, pct: '30%' },
        { label: 'Series Group', count: 24, pct: '25%' },
    ],
};

// --- Initial Events Data (Kanban) ---
const initialEventsKanban = {
    inquiry: [
        { id: 101, title: 'Red Sea Annual Gala', client: 'Red Sea Global', pax: 150, budget: '200k', date: 'Feb 20', type: 'Gala Dinner' },
        { id: 102, title: 'Saudi Tour Press Conf', client: 'Min. of Sport', pax: 50, budget: '45k', date: 'Jan 25', type: 'Press' }
    ],
    accepted: [
        { id: 103, title: 'Wedding: Al-Saud', client: 'Private', pax: 300, budget: '850k', date: 'Mar 15', type: 'Wedding' },
        { id: 104, title: 'Product Launch', client: 'Lucid Motors', pax: 80, budget: '120k', date: 'Feb 10', type: 'Corporate' }
    ],
    tentative: [
        { id: 105, title: 'Team Retreat', client: 'McKinsey', pax: 25, budget: '180k', date: 'Feb 05', type: 'Retreat' }
    ],
    definite: [
        { id: 106, title: 'Al-Ula Arts Festival', client: 'RCU', pax: 500, budget: '1.2M', date: 'Feb 12', type: 'Festival' },
        { id: 107, title: 'VIP Dinner', client: 'Cartier', pax: 40, budget: '95k', date: 'Jan 22', type: 'Dining' }
    ],
    actual: [
        { id: 109, title: 'Executive Summit', client: 'NEOM', pax: 120, budget: '450k', date: 'Jan 15', type: 'Summit' }
    ],
    cancelled: [
        { id: 108, title: 'Regional Expo', client: 'SME Authority', pax: 1000, budget: '2.5M', date: 'Jan 10', type: 'Exhibition' }
    ]
};

// --- Events & Catering: request helpers (MICE types + kanban mapping) ---
const COLUMN_TO_STATUS: Record<string, string> = {
    inquiry: 'Inquiry',
    accepted: 'Accepted',
    tentative: 'Tentative',
    definite: 'Definite',
    actual: 'Actual',
    cancelled: 'Cancelled',
};

const statusToColumnId = (status: string): string => {
    const s = (status || 'Inquiry').toLowerCase();
    if (s === 'lost') return 'cancelled';
    if (s === 'draft') return 'inquiry';
    const valid = ['inquiry', 'accepted', 'tentative', 'definite', 'actual', 'cancelled'];
    if (valid.includes(s)) return s;
    return 'inquiry';
};

/** Min/max dates for filtering MICE requests (agenda + legacy event/check fields). */
function getMiceRequestDateWindow(req: any): { start: string; end: string } {
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const dates: string[] = [];
    for (const item of agenda) {
        const s = String(item?.startDate || '').trim().slice(0, 10);
        const e = String(item?.endDate || item?.startDate || '').trim().slice(0, 10);
        if (s) dates.push(s);
        if (e) dates.push(e);
    }
    if (dates.length) {
        const sorted = [...new Set(dates)].sort();
        return { start: sorted[0], end: sorted[sorted.length - 1] };
    }
    const a = String(req?.eventStart || req?.checkIn || req?.requestDate || '').slice(0, 10);
    const b = String(req?.eventEnd || req?.checkOut || a || '').slice(0, 10) || a;
    return { start: a, end: b || a };
}

/** Total attendees for a MICE request: prefer stored total, else sum of agenda row pax. */
function totalMiceRequestPax(req: any): number {
    const stored = Number(req?.totalEventPax ?? 0);
    if (Number.isFinite(stored) && stored > 0) return Math.floor(stored);
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    let sum = 0;
    for (const row of agenda) sum += Number(row?.pax || 0) || 0;
    if (sum > 0) return sum;
    const ag0 = agenda[0];
    return Number(ag0?.pax || 0) || 0;
}

/** Sum of (agenda pax × row days) for dashboards / performance; falls back to headcount when agenda yields 0. */
function totalMiceRequestAttendeeDays(req: any): number {
    const n = sumAgendaAttendeeDays(Array.isArray(req?.agenda) ? req.agenda : []);
    if (n > 0) return n;
    return totalMiceRequestPax(req);
}

/** First agenda start through last agenda end (YYYY-MM-DD), or single date. */
function formatMiceAgendaDateRange(req: any): string {
    const win = getMiceRequestDateWindow(req);
    const s = String(win.start || '').trim().slice(0, 10);
    const e = String(win.end || win.start || '').trim().slice(0, 10);
    if (!s) return '—';
    if (!e || e === s) return s;
    return `${s} — ${e}`;
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
    if (!aStart && !aEnd) return true;
    const as = aStart || aEnd;
    const ae = aEnd || aStart;
    return !(ae < bStart || as > bEnd);
}

function requestInEventDateRange(req: any, range: { start: string; end: string }) {
    if (!range?.start && !range?.end) return true;
    const start = range.start || '1970-01-01';
    const end = range.end || '2099-12-31';
    const win = getMiceRequestDateWindow(req);
    const rs = win.start;
    const re = win.end || win.start;
    if (!rs && !re) return true;
    return rangesOverlap(rs, re, start, end);
}

function computeRequestTotalWithTax(req: any, taxes: any[] = []) {
    const rawTotal = parseFloat(String(req.totalCost ?? 0).replace(/,/g, '')) || 0;
    const agenda = Array.isArray(req.agenda) ? req.agenda : [];
    const rooms = Array.isArray(req.rooms) ? req.rooms : [];
    const transport = Array.isArray(req.transportation) ? req.transportation : [];
    const nightsFromRequest = (() => {
        const a = String(req.checkIn || '').trim();
        const b = String(req.checkOut || '').trim();
        if (!a || !b) return 0;
        const ms = new Date(b).getTime() - new Date(a).getTime();
        if (Number.isNaN(ms)) return 0;
        return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    })();
    const roomsCostNoTax = rooms.reduce((sum: number, r: any) => {
        const count = Number(r.count || 0);
        const rate = Number(r.rate || 0);
        const a = String(r.arrival || req.checkIn || '').trim();
        const b = String(r.departure || req.checkOut || '').trim();
        let nights = nightsFromRequest;
        if (a && b) {
            const ms = new Date(b).getTime() - new Date(a).getTime();
            if (!Number.isNaN(ms)) nights = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
        }
        return sum + (count * rate * nights);
    }, 0);
    const eventCostNoTax = agenda.reduce((sum: number, item: any) => sum + (Number(item.rate || 0) * Number(item.pax || 0)) + Number(item.rental || 0), 0);
    const transCostNoTax = transport.reduce((sum: number, t: any) => sum + Number(t.costPerWay || 0), 0);
    let roomsTax = 0;
    let eventTax = 0;
    let transTax = 0;
    for (const tax of taxes) {
        const rate = (Number(tax?.rate) || 0) / 100;
        if (tax?.scope?.accommodation) roomsTax += rate;
        if (tax?.scope?.events || tax?.scope?.foodAndBeverage) eventTax += rate;
        if (tax?.scope?.transport) transTax += rate;
    }
    const computedWithTax =
        roomsCostNoTax * (1 + roomsTax) +
        eventCostNoTax * (1 + eventTax) +
        transCostNoTax * (1 + transTax);
    if (computedWithTax > 0) return computedWithTax;
    return rawTotal;
}

/** Dashboard / KPI revenue: line-item subtotals only (no tax/fees). Uses persisted grandTotalNoTax when lines are empty. */
function computeRequestCostBreakdown(req: any) {
    const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const transport = Array.isArray(req?.transportation) ? req.transportation : [];
    const reqNights = (() => {
        const inDate = parseYmd(req?.checkIn);
        const outDate = parseYmd(req?.checkOut);
        if (!inDate || !outDate) return 0;
        const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
        if (Number.isNaN(ms)) return 0;
        return Math.max(0, Math.ceil(ms / 86400000));
    })();
    const roomsRevenue = rooms.reduce((sum: number, row: any) => {
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        const inDate = parseYmd(row?.arrival || req?.checkIn);
        const outDate = parseYmd(row?.departure || req?.checkOut);
        let nights = reqNights;
        if (inDate && outDate) {
            const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) nights = Math.max(0, Math.ceil(ms / 86400000));
        }
        return sum + (count * rate * nights);
    }, 0);
    let eventRevenue = agenda.reduce((sum: number, item: any) => {
        const start = parseYmd(item?.startDate);
        const end = parseYmd(item?.endDate || item?.startDate);
        let rowDays = 1;
        if (start && end) {
            const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = (Number(item?.rate || 0) * Number(item?.pax || 0)) + Number(item?.rental || 0);
        return sum + (rowCost * rowDays);
    }, 0);
    const transportRevenue = transport.reduce((sum: number, row: any) => sum + Number(row?.costPerWay || 0), 0);
    let lineSum = roomsRevenue + eventRevenue + transportRevenue;
    const storedNoTax = asNumber(
        req?.grandTotalNoTax ??
        req?.totalCostNoTax ??
        req?.totalCost ??
        req?.grandTotal ??
        req?.totalAmount ??
        0
    );
    if (lineSum <= 0 && storedNoTax > 0) {
        if (isMiceRequest(req)) {
            eventRevenue = storedNoTax;
            lineSum = roomsRevenue + eventRevenue + transportRevenue;
        } else {
            lineSum = storedNoTax;
        }
    }
    return {
        roomsRevenue,
        eventRevenue,
        transportRevenue,
        totalRevenue: lineSum,
    };
}

function requestToKanbanCard(req: any, _taxes: any[] = []) {
    const eventRevenueOnly = computeRequestCostBreakdown(req).eventRevenue;
    const pax = totalMiceRequestPax(req);
    const date = formatMiceAgendaDateRange(req);
    return {
        id: req.id,
        requestId: req.id,
        title: req.requestName || req.confirmationNo || String(req.id),
        client: req.account || req.accountName || '—',
        pax,
        /** Events & Catering: show event/agenda revenue only (not rooms/series accommodation). */
        budget: Number(eventRevenueOnly || 0),
        date,
        type: req.requestType || 'Event',
    };
}

// --- View Components ---

function calendarColorForRequest(req: any) {
    const b = bucketRequestDistribution(req.requestType);
    if (b === 'series') return 'purple';
    if (b === 'event' || b === 'event_rooms') return 'orange';
    return 'blue';
}

/** Match RequestsManager.getStatusColor for request pipeline statuses. */
function calendarRequestStatusColor(status: string, c: any): string {
    const s = String(status || '').trim();
    switch (s) {
        case 'Inquiry':
        case 'Draft':
            return c.textMuted;
        case 'Accepted':
            return c.yellow;
        case 'Tentative':
            return c.blue;
        case 'Definite':
            return c.green;
        case 'Actual':
            return '#059669';
        case 'Lost':
        case 'Cancelled':
            return c.red;
        default:
            return c.primary;
    }
}

/** Humanize CRM stage keys like `notInterested` → "Not Interested". */
function humanizeCrmStageKey(raw: string): string {
    const s = String(raw || '').trim();
    if (!s) return '—';
    const spaced = s
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[\s_-]+/g, ' ')
        .trim();
    if (!spaced) return '—';
    return spaced.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Match CRM.tsx pipeline stage colors/labels. */
function crmCalendarStageMeta(stageKey: string, c: any): { label: string; color: string } {
    const k = String(stageKey || 'new').toLowerCase().replace(/\s+/g, '');
    const map: Record<string, { label: string; color: string }> = {
        new: { label: 'New Calls', color: c.blue },
        waiting: { label: 'Leads', color: '#94a3b8' },
        qualified: { label: 'QUALIFIED', color: c.cyan },
        proposal: { label: 'PROPOSAL', color: c.yellow },
        negotiation: { label: 'NEGOTIATION', color: c.orange },
        won: { label: 'WON', color: c.green },
        notinterested: { label: 'Not Interested', color: '#8b0000' },
    };
    return map[k] || { label: humanizeCrmStageKey(stageKey), color: c.primary };
}

function calendarItemStatusStyle(evt: any, colors: any): { color: string; text: string } {
    if (evt?.kind === 'crm') {
        const meta = crmCalendarStageMeta(evt.crmStageKey, colors);
        return { color: meta.color, text: meta.label };
    }
    return {
        color: calendarRequestStatusColor(evt?.status, colors),
        text: String(evt?.status || '—'),
    };
}

function expandRequestCalendarEntries(req: any, propertyId: string | undefined): any[] {
    if (propertyId && req.propertyId && req.propertyId !== propertyId) return [];
    const title = req.requestName || req.confirmationNo || String(req.id);
    const typeLabel = String(req.requestType || 'Request');
    const status = String(req.status || '');
    const color = calendarColorForRequest(req);
    const pax = Number(req.totalEventPax || 0) || 0;
    const entry = (ymd: string, suffix: string) => ({
        kind: 'request' as const,
        requestId: String(req.id),
        ymd,
        id: `req-${req.id}-${suffix}`,
        title,
        type: typeLabel,
        status,
        color,
        duration: 1,
        pax,
        rev: '',
    });

    if (isSeriesRequest(req)) {
        const rows = Array.isArray(req.rooms) ? req.rooms : [];
        const out: any[] = [];
        rows.forEach((row: any, i: number) => {
            const ymd = parseYmd(row.arrival || row.checkIn || req.checkIn);
            if (ymd) out.push(entry(ymd, `s${i}`));
        });
        if (out.length) return out;
    }
    const ymd = getPrimaryOperationalDate(req);
    if (!ymd) return [];
    return [entry(ymd, 'p')];
}

function expandSalesCallCalendarEntries(leads: any[]): any[] {
    const out: any[] = [];
    (leads || []).forEach((lead: any, i: number) => {
        const ymd = parseYmd(lead?.lastContact || lead?.date);
        if (!ymd) return;
        const crmStageKey = String(lead.stage || 'new').toLowerCase();
        out.push({
            kind: 'crm' as const,
            leadSnapshot: { ...lead },
            crmStageKey,
            ymd,
            id: `crm-${lead.id ?? i}`,
            title: String(lead.subject || lead.company || lead.nextStep || 'Sales call').trim() || 'Sales call',
            type: 'Sales Call',
            status: crmStageKey,
            color: 'green',
            duration: 1,
            pax: 0,
            rev: '',
            companyName: String(lead.company || '').trim(),
            ownerName: String(lead.accountManager || lead.ownerUserId || '').trim() || '—',
        });
    });
    return out;
}

const CalendarView = ({
    theme,
    currentDate,
    viewMode = 'Month',
    sharedRequests = [],
    crmLeadsFlat = [],
    activeProperty,
    onCalendarItemClick,
}: any) => {
    const colors = theme.colors;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    /** 0 = Sunday … 6 = Saturday, aligned with `days` header */
    const firstWeekdayOfMonth = new Date(year, month, 1).getDay();
    const monthGridCells = firstWeekdayOfMonth + daysInMonth;
    const trailingPadDays = Math.ceil(monthGridCells / 7) * 7 - monthGridCells;
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    const displayEvents = useMemo(() => {
        const pid = activeProperty?.id;
        const fromReqs = (sharedRequests || []).flatMap((r: any) => expandRequestCalendarEntries(r, pid));
        const fromCrm = expandSalesCallCalendarEntries(crmLeadsFlat);
        return [...fromReqs, ...fromCrm];
    }, [sharedRequests, activeProperty?.id, crmLeadsFlat]);

    const getEventColor = (colorName: any) => {
        switch (colorName) {
            case 'blue': return { bg: colors.blue + '20', border: colors.blue, text: colors.blue };
            case 'purple': return { bg: colors.purple + '20', border: colors.purple, text: colors.purple };
            case 'orange': return { bg: '#ff6b35' + '20', border: '#ff6b35', text: '#ff6b35' };
            case 'green': return { bg: colors.green + '20', border: colors.green, text: colors.green };
            case 'yellow': return { bg: colors.yellow + '20', border: colors.yellow, text: colors.yellow };
            case 'red': return { bg: colors.red + '20', border: colors.red, text: colors.red };
            default: return { bg: colors.border, border: colors.textMuted, text: colors.textMuted };
        }
    };

    // Week View: Show current week
    if (viewMode === 'Week') {
        const today = new Date(currentDate);
        const dayOfWeek = today.getDay();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - dayOfWeek);

        const weekDays = Array.from({ length: 7 }, (_, i) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            return date;
        });

        return (
            <div className="flex flex-1 flex-col min-h-0 gap-3">
                {/* Calendar Legend */}
                <div className="shrink-0 flex flex-wrap items-center gap-4 sm:gap-6 px-3 sm:px-4 py-2 rounded-lg border-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    {[
                        { label: 'Group Accommodation', color: colors.blue },
                        { label: 'Series Group', color: colors.purple },
                        { label: 'Events', color: '#ff6b35' },
                        { label: 'Sales Calls', color: colors.green },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div>
                            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: colors.textMuted }}>{item.label}</span>
                        </div>
                    ))}
                </div>

                {/* Week Grid */}
                <div className="flex-1 min-h-0 rounded-xl border-2 overflow-hidden flex flex-col" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="grid grid-cols-7 border-b-2" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                        {weekDays.map((date, i) => (
                            <div key={i} className="py-3 text-center border-r-2 last:border-r-0" style={{ borderColor: colors.border }}>
                                <div className="text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.primary }}>{days[date.getDay()]}</div>
                                <div className="text-sm font-bold mt-1" style={{ color: colors.textMain }}>{date.getDate()}</div>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 flex-1 min-h-0" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
                        {weekDays.map((date, i) => {
                            const dayYmd = toYmd(date);
                            const dayEvents = displayEvents.filter((e: any) => e.ymd === dayYmd);
                            const isToday = dayYmd === toYmd(new Date());
                            return (
                                <div key={i} className="border-r-2 last:border-r-0 p-2 min-h-0 flex flex-col overflow-hidden" style={{ borderColor: colors.border, backgroundColor: isToday ? colors.bg : 'transparent' }}>
                                    <div className="min-h-0 flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                                        {dayEvents.map((evt: any, idx: number) => {
                                            const style = getEventColor(evt.color);
                                            const st = calendarItemStatusStyle(evt, colors);
                                            const isCrm = evt?.kind === 'crm';
                                            return (
                                                <div
                                                    key={idx}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => {
                                                        if (!onCalendarItemClick) return;
                                                        if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                                        else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                                        e.preventDefault();
                                                        if (!onCalendarItemClick) return;
                                                        if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                                        else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                                    }}
                                                    className="text-xs px-2 py-2 rounded cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-current/20 hover:scale-105 hover:brightness-110 border-l-3"
                                                    style={{ backgroundColor: style.bg, borderLeftColor: style.border, borderLeftWidth: '3px', boxShadow: `0 0 0 ${style.border}00` }}
                                                >
                                                    {isCrm ? (
                                                        <>
                                                            <div className="flex items-center gap-1 min-w-0 font-bold leading-tight">
                                                                <span className="truncate min-w-0" style={{ color: colors.textMain }}>{evt.title}</span>
                                                                {evt.ownerName && evt.ownerName !== '—' ? (
                                                                    <span className="shrink-0 text-[10px] font-semibold whitespace-nowrap" style={{ color: colors.textMuted }}>· {evt.ownerName}</span>
                                                                ) : null}
                                                            </div>
                                                            {evt.companyName ? (
                                                                <div className="text-[10px] font-medium truncate mt-0.5" style={{ color: colors.textMain }}>{evt.companyName}</div>
                                                            ) : null}
                                                        </>
                                                    ) : (
                                                        <div className="font-bold truncate" style={{ color: colors.textMain }}>{evt.title}</div>
                                                    )}
                                                    <div className="text-[10px] mt-1" style={{ color: style.text }}>{evt.type}</div>
                                                    <div className="text-[10px] font-bold mt-0.5" style={{ color: st.color }}>{st.text}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // List View: Show all events in a list
    if (viewMode === 'List') {
        const allEvents = displayEvents
            .filter((e: any) => String(e.ymd || '').startsWith(monthPrefix))
            .map((evt: any) => ({
                ...evt,
                fullDate: new Date(`${evt.ymd}T12:00:00`),
            }))
            .sort((a: any, b: any) => String(a.ymd).localeCompare(String(b.ymd)));

        return (
            <div className="flex flex-1 flex-col min-h-0 gap-3">
                {/* Calendar Legend */}
                <div className="shrink-0 flex flex-wrap items-center gap-4 sm:gap-6 px-3 sm:px-4 py-2 rounded-lg border-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    {[
                        { label: 'Group Accommodation', color: colors.blue },
                        { label: 'Series Group', color: colors.purple },
                        { label: 'Events', color: '#ff6b35' },
                        { label: 'Sales Calls', color: colors.green },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div>
                            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: colors.textMuted }}>{item.label}</span>
                        </div>
                    ))}
                </div>

                {/* List View */}
                <div className="flex-1 min-h-0 rounded-xl border-2 overflow-hidden flex flex-col" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="h-full overflow-y-auto p-4 space-y-3">
                        {allEvents.map((evt: any, idx: number) => {
                            const style = getEventColor(evt.color);
                            const st = calendarItemStatusStyle(evt, colors);
                            const dateStr = evt.fullDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                            const isCrm = evt?.kind === 'crm';
                            return (
                                <div
                                    key={idx}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        if (!onCalendarItemClick) return;
                                        if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                        else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                        e.preventDefault();
                                        if (!onCalendarItemClick) return;
                                        if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                        else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                    }}
                                    className="flex items-center gap-4 p-3 rounded-lg border-2 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-current/30 hover:scale-[1.02] hover:brightness-110"
                                    style={{ backgroundColor: style.bg, borderColor: style.border, boxShadow: `0 0 0 ${style.border}00` }}
                                >
                                    <div className="flex-shrink-0 text-center min-w-[80px]">
                                        <div className="text-xs font-bold" style={{ color: style.text }}>{dateStr}</div>
                                        <div className="text-[10px] mt-1" style={{ color: colors.textMuted }}>{evt.duration} days</div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {isCrm ? (
                                            <>
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="font-bold text-sm truncate min-w-0" style={{ color: colors.textMain }}>{evt.title}</span>
                                                    {evt.ownerName && evt.ownerName !== '—' ? (
                                                        <span className="shrink-0 text-[11px] font-semibold whitespace-nowrap" style={{ color: colors.textMuted }}>· {evt.ownerName}</span>
                                                    ) : null}
                                                </div>
                                                {evt.companyName ? (
                                                    <div className="text-[11px] font-medium truncate mt-0.5" style={{ color: colors.textMain }}>{evt.companyName}</div>
                                                ) : null}
                                            </>
                                        ) : (
                                            <div className="font-bold text-sm truncate" style={{ color: colors.textMain }}>{evt.title}</div>
                                        )}
                                        <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: colors.textMuted }}>
                                            <span>{evt.type}</span>
                                            <span>•</span>
                                            <span className="font-bold" style={{ color: st.color }}>{st.text}</span>
                                        </div>
                                    </div>
                                    <div className="flex-shrink-0 text-right">
                                        <div className="text-xs font-bold" style={{ color: colors.textMain }}>{evt.pax} PAX</div>
                                        <div className="text-xs mt-1" style={{ color: colors.textMuted }}>{evt.rev}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // Month View (default)
    const monthWeekRowCount = Math.ceil((firstWeekdayOfMonth + daysInMonth + trailingPadDays) / 7);

    return (
        <div className="flex flex-1 flex-col min-h-0 gap-3">
            {/* Calendar Legend */}
            <div className="shrink-0 flex flex-wrap items-center gap-4 sm:gap-6 px-3 sm:px-4 py-2 rounded-lg border-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                {[
                    { label: 'Group Accommodation', color: colors.blue },
                    { label: 'Series Group', color: colors.purple },
                    { label: 'Events', color: '#ff6b35' },
                    { label: 'Sales Calls', color: colors.green },
                ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div>
                        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: colors.textMuted }}>{item.label}</span>
                    </div>
                ))}
            </div>

            {/* Calendar Grid — rows share remaining height; each day scrolls its own items */}
            <div className="flex-1 min-h-0 rounded-xl border-2 overflow-hidden flex flex-col" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="shrink-0 grid grid-cols-7 border-b-2" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                    {days.map(day => (
                        <div key={day} className="py-2 text-center text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.primary }}>
                            {day}
                        </div>
                    ))}
                </div>
                <div
                    className="grid grid-cols-7 flex-1 min-h-0"
                    style={{ gridTemplateRows: `repeat(${monthWeekRowCount}, minmax(0, 1fr))` }}
                >
                    {Array.from({ length: firstWeekdayOfMonth }).map((_, i) => (
                        <div
                            key={`empty-start-${i}`}
                            className={`border-r-2 border-b-2 min-h-0 h-full ${i % 7 === 6 ? 'border-r-0' : ''}`}
                            style={{ borderColor: colors.border, backgroundColor: colors.bg + '30' }}
                        />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const cellIndex = firstWeekdayOfMonth + i;
                        const dayYmd = `${monthPrefix}-${String(dayNum).padStart(2, '0')}`;
                        const dayEvents = displayEvents.filter((e: any) => e.ymd === dayYmd);
                        const now = new Date();
                        const isToday = now.getFullYear() === year && now.getMonth() === month && now.getDate() === dayNum;
                        return (
                            <div
                                key={dayNum}
                                className={`border-r-2 border-b-2 p-1.5 relative group hover:bg-white/5 transition-colors flex flex-col min-h-0 h-full ${cellIndex % 7 === 6 ? 'border-r-0' : ''}`}
                                style={{ borderColor: colors.border }}
                            >
                                <div className="flex justify-between items-center mb-1 shrink-0">
                                    <span className={`text-xs font-bold ${isToday ? 'bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]' : ''}`}
                                        style={{ color: isToday ? '#fff' : colors.textMuted }}>
                                        {dayNum}
                                    </span>
                                    {dayEvents.length > 0 && (
                                        <div className="flex gap-0.5">
                                            {dayEvents.slice(0, 4).map((evt, idx) => {
                                                const style = getEventColor(evt.color);
                                                return <div key={idx} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.border }}></div>
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div
                                    className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5 space-y-0.5 scrollbar-thin"
                                >
                                    {dayEvents.map((evt: any, idx: number) => {
                                        const style = getEventColor(evt.color);
                                        const st = calendarItemStatusStyle(evt, colors);
                                        const isCrm = evt?.kind === 'crm';
                                        return (
                                            <div
                                                key={idx}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => {
                                                    if (!onCalendarItemClick) return;
                                                    if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                                    else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key !== 'Enter' && e.key !== ' ') return;
                                                    e.preventDefault();
                                                    if (!onCalendarItemClick) return;
                                                    if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                                    else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                                }}
                                                className="text-[9px] px-1.5 py-1 rounded cursor-pointer transition-all duration-200 hover:shadow-md hover:shadow-current/25 hover:scale-[1.03] hover:brightness-110 border-l-2"
                                                style={{ backgroundColor: style.bg, borderLeftColor: style.border, boxShadow: `0 0 0 ${style.border}00` }}
                                            >
                                                {isCrm ? (
                                                    <>
                                                        <div className="flex items-center gap-0.5 min-w-0 leading-tight">
                                                            <span className="font-semibold truncate min-w-0" style={{ color: colors.textMain }}>{evt.title}</span>
                                                            {evt.ownerName && evt.ownerName !== '—' ? (
                                                                <span className="shrink-0 text-[8px] font-medium whitespace-nowrap" style={{ color: colors.textMuted }}>· {evt.ownerName}</span>
                                                            ) : null}
                                                        </div>
                                                        {evt.companyName ? (
                                                            <div className="text-[8px] font-medium truncate mt-0.5" style={{ color: colors.textMain }}>{evt.companyName}</div>
                                                        ) : null}
                                                    </>
                                                ) : (
                                                    <div className="font-semibold truncate leading-tight" style={{ color: colors.textMain }}>{evt.title}</div>
                                                )}
                                                <div className="flex items-center justify-between mt-0.5 text-[8px]">
                                                    <span className="truncate" style={{ color: style.text }}>{evt.type}</span>
                                                    <span className="font-bold ml-1 whitespace-nowrap" style={{ color: st.color }}>{st.text}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                    {Array.from({ length: trailingPadDays }).map((_, i) => {
                        const cellIndex = firstWeekdayOfMonth + daysInMonth + i;
                        return (
                            <div
                                key={`empty-end-${i}`}
                                className={`border-r-2 border-b-2 min-h-0 h-full ${cellIndex % 7 === 6 ? 'border-r-0' : ''}`}
                                style={{ borderColor: colors.border, backgroundColor: colors.bg + '30' }}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// --- Events View Component with Drag and Drop ---
const EventsView = ({
    theme,
    subView,
    filterRange,
    sharedRequests = [],
    onPatchRequestStatus,
    onOpenRequest,
    onOpenRequestOpts,
    activeProperty,
    accounts = [],
    onRefreshRequests,
    readOnly = false,
    currency = 'SAR',
}: any) => {
    const colors = theme.colors;
    const selectedCurrency = resolveCurrencyCode(currency);
    const formatMoneyCompact = (amountSar: number) => formatCompactCurrency(amountSar, selectedCurrency);
    const formatMoney = (amountSar: number, maxFractionDigits = 2) =>
        formatCurrencyAmount(amountSar, selectedCurrency, { maximumFractionDigits: maxFractionDigits });
    const [draggedItem, setDraggedItem] = useState<any>(null);
    const [accountSearch, setAccountSearch] = useState('');
    const [expandedAccounts, setExpandedAccounts] = useState<string[]>([]);
    const [venuesList, setVenuesList] = useState<any[]>([]);
    const [propertyTaxes, setPropertyTaxes] = useState<any[]>([]);
    const todayIso = toYmd(new Date());
    const defaultTo = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 4);
        return toYmd(d);
    })();
    const [draftFrom, setDraftFrom] = useState(todayIso);
    const [draftTo, setDraftTo] = useState(defaultTo);
    const [draftGridStart, setDraftGridStart] = useState(todayIso);
    const [appliedFrom, setAppliedFrom] = useState(todayIso);
    const [appliedTo, setAppliedTo] = useState(defaultTo);
    /** Grid columns follow this only (not `draftGridStart`) until user clicks Align or Search applies range. */
    const [appliedGridStart, setAppliedGridStart] = useState(todayIso);
    /** How many day columns the availability grid shows (independent of summary range). */
    const [availabilityGridDays, setAvailabilityGridDays] = useState(7);
    const [availabilityVenueModal, setAvailabilityVenueModal] = useState<{ venueName: string; bookings: any[] } | null>(null);
    const [beoSearch, setBeoSearch] = useState('');
    const [beoSortOrder, setBeoSortOrder] = useState<'newest' | 'oldest'>('newest');
    const [beoModalRequestId, setBeoModalRequestId] = useState<string | null>(null);
    const [beoNotesDraft, setBeoNotesDraft] = useState('');
    const eventsKanbanScrollRef = useRef<HTMLDivElement>(null);

    const miceRequests = useMemo(() => {
        return (sharedRequests || [])
            .filter(isEventsCateringEligibleRequest)
            .filter((r: any) => requestInEventDateRange(r, filterRange));
    }, [sharedRequests, filterRange]);

    /** All eligible MICE requests (no pipeline date filter); used for venue availability and BEO. */
    const allMiceRequests = useMemo(() => (sharedRequests || []).filter(isEventsCateringEligibleRequest), [sharedRequests]);

    const kanbanData = useMemo(() => {
        const empty: Record<string, any[]> = {
            inquiry: [], accepted: [], tentative: [], definite: [], actual: [], cancelled: [],
        };
        for (const req of miceRequests) {
            const col = statusToColumnId(String(req.status || 'Inquiry'));
            const card = requestToKanbanCard(req, propertyTaxes);
            (empty[col] || empty.inquiry).push(card);
        }
        return empty;
    }, [miceRequests, propertyTaxes]);

    const toggleAccountExpansion = (accountName: string) => {
        setExpandedAccounts(prev =>
            prev.includes(accountName)
                ? prev.filter(name => name !== accountName)
                : [...prev, accountName]
        );
    };

    const parseValue = (valStr: string) => {
        if (typeof valStr === 'number') return Number.isFinite(valStr) ? valStr : 0;
        const str = valStr.toString().toLowerCase();
        if (str.endsWith('k')) return (parseFloat(str) || 0) * 1000;
        if (str.endsWith('m')) return (parseFloat(str) || 0) * 1000000;
        return parseFloat(str) || 0;
    };

    const getColumnTotal = (colId: string) => {
        const total = (kanbanData[colId] || []).reduce((sum: number, e: any) => sum + parseValue(e.budget), 0);
        return formatMoneyCompact(total);
    };

    const totalRevenue = useMemo(() => {
        const activeCols = ['inquiry', 'accepted', 'tentative', 'definite', 'actual'];
        const total = activeCols.reduce((sum, colId) => {
            return sum + (kanbanData[colId] || []).reduce((s: number, e: any) => s + parseValue(e.budget), 0);
        }, 0);
        return formatMoneyCompact(total);
    }, [kanbanData, formatMoneyCompact]);

    const totalAttendance = useMemo(() => {
        const n = miceRequests.reduce((sum: number, r: any) => sum + totalMiceRequestAttendeeDays(r), 0);
        return `${n.toLocaleString()} Pax`;
    }, [miceRequests]);

    const numEventsLabel = useMemo(() => String(miceRequests.length), [miceRequests]);

    const performanceRows = useMemo(() => {
        const byAcc: Record<string, { name: string; events: any[]; total: number; pax: number }> = {};
        for (const r of miceRequests) {
            const name = r.account || r.accountName || 'Unknown';
            if (!byAcc[name]) byAcc[name] = { name, events: [], total: 0, pax: 0 };
            byAcc[name].events.push(r);
            byAcc[name].total += computeRequestCostBreakdown(r).eventRevenue;
            byAcc[name].pax += totalMiceRequestAttendeeDays(r);
        }
        return Object.values(byAcc)
            .map(a => ({
                name: a.name,
                events: a.events.length,
                spent: formatMoneyCompact(a.total),
                pax: a.pax,
                details: a.events.map((req: any) => {
                    const date = formatMiceAgendaDateRange(req);
                    const val = computeRequestCostBreakdown(req).eventRevenue;
                    const valStr = formatMoneyCompact(val);
                    return {
                        date: date || '—',
                        title: req.requestName || req.confirmationNo,
                        pax: totalMiceRequestAttendeeDays(req),
                        value: valStr,
                    };
                }),
            }))
            .sort((a, b) => b.events - a.events);
    }, [miceRequests, formatMoneyCompact]);

    const pipelineValueKpi = useMemo(() => {
        const t = miceRequests
            .filter((r: any) => ['Inquiry', 'Accepted', 'Tentative', 'Definite', 'Draft'].includes(String(r.status || '')))
            .reduce((s: number, r: any) => s + computeRequestCostBreakdown(r).eventRevenue, 0);
        return formatMoneyCompact(t);
    }, [miceRequests, formatMoneyCompact]);

    const avgEventValueKpi = useMemo(() => {
        if (!miceRequests.length) return formatMoneyCompact(0);
        const sum = miceRequests.reduce((s: number, r: any) => s + computeRequestCostBreakdown(r).eventRevenue, 0);
        const avg = sum / miceRequests.length;
        return formatMoneyCompact(avg);
    }, [miceRequests, formatMoneyCompact]);

    const venueBarData = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const r of miceRequests) {
            const rows = Array.isArray(r.agenda) ? r.agenda : [];
            for (const row of rows) {
                for (const occ of expandAgendaRowVenueOccupancies(row, r)) {
                    const v = occ.name.trim();
                    if (!v) continue;
                    counts[v] = (counts[v] || 0) + 1;
                }
            }
        }
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12);
    }, [miceRequests]);

    const typePieData = useMemo(() => {
        let ev = 0;
        let er = 0;
        for (const r of miceRequests) {
            const t = String(r.requestType || '').toLowerCase();
            if (t.includes('room') || t.includes('event with')) er += 1;
            else ev += 1;
        }
        if (ev === 0 && er === 0) return [{ name: 'No data', value: 1 }];
        return [
            { name: 'Event', value: Math.max(ev, 0) },
            { name: 'Event + rooms', value: Math.max(er, 0) },
        ];
    }, [miceRequests]);

    useEffect(() => {
        if (!activeProperty?.id) {
            setVenuesList([]);
            return;
        }
        fetch(apiUrl(`/api/venues?propertyId=${encodeURIComponent(activeProperty.id)}`))
            .then(r => r.json())
            .then((d) => {
                if (Array.isArray(d)) setVenuesList(d);
            })
            .catch(() => setVenuesList([]));
    }, [activeProperty?.id]);

    useEffect(() => {
        if (!activeProperty?.id) {
            setPropertyTaxes([]);
            return;
        }
        fetch(apiUrl(`/api/taxes?propertyId=${encodeURIComponent(activeProperty.id)}`))
            .then(r => r.json())
            .then((d) => {
                if (Array.isArray(d)) setPropertyTaxes(d);
            })
            .catch(() => setPropertyTaxes([]));
    }, [activeProperty?.id]);

    const agendaCoversDate = (row: any, checkIso: string, req: any) => {
        const a = String(row.startDate || req.eventStart || req.checkIn || '').slice(0, 10);
        const b = String(row.endDate || row.startDate || req.eventEnd || req.checkOut || req.eventStart || req.checkIn || '').slice(0, 10) || a;
        if (!a) return false;
        return checkIso >= a && checkIso <= (b || a);
    };

    /** Use all eligible MICE requests (not `miceRequests`), so venue availability is not tied to the Events pipeline date filter (e.g. current year only). */
    const venueBookingsOnDate = (venueName: string, checkIso: string) => {
        const out: any[] = [];
        for (const req of allMiceRequests) {
            const st = String(req.status || 'Inquiry');
            if (st === 'Cancelled' || st === 'Lost') continue;
            const rows = Array.isArray(req.agenda) ? req.agenda : [];
            for (const row of rows) {
                if (!agendaCoversDate(row, checkIso, req)) continue;
                const want = venueName.trim().toLowerCase();
                const matchesVenue = expandAgendaRowVenueOccupancies(row, req).some((occ) => occ.name.trim().toLowerCase() === want);
                if (!matchesVenue) continue;
                out.push({
                    requestId: String(req.id || ''),
                    accountName: String(req.account || req.accountName || '—'),
                    requestName: String(req.requestName || req.confirmationNo || req.id || '—'),
                    startDate: String(row.startDate || req.eventStart || req.checkIn || '').slice(0, 10),
                    endDate: String(row.endDate || row.startDate || req.eventEnd || req.checkOut || '').slice(0, 10),
                    sessionTiming: [row.startTime, row.endTime].filter(Boolean).join(' - ') || '—',
                    status: st,
                });
            }
        }
        return out;
    };

    const venueBookingLabel = (venueName: string, checkIso: string) => {
        const bookings = venueBookingsOnDate(venueName, checkIso);
        if (!bookings.length) return { label: 'Available', tone: 'free' as const, booking: null as any };
        return { label: 'Booked', tone: 'booked' as const, booking: bookings[0] };
    };

    const expandAvailabilityDays = (fromIso: string, toIso: string, maxCols: number) => {
        if (!fromIso) return [];
        let a = fromIso.slice(0, 10);
        let b = (toIso || fromIso).slice(0, 10);
        if (b < a) [a, b] = [b, a];
        const out: string[] = [];
        const cur = new Date(`${a}T12:00:00`);
        const end = new Date(`${b}T12:00:00`);
        let n = 0;
        while (cur <= end && n < maxCols) {
            out.push(toYmd(cur));
            cur.setDate(cur.getDate() + 1);
            n++;
        }
        return out;
    };

    const venueRangeSummary = (venueName: string, dayList: string[]) => {
        if (!dayList.length) return { label: '—', tone: 'free' as const };
        const seen = new Set<string>();
        const bookings: any[] = [];
        for (const d of dayList) {
            const daily = venueBookingsOnDate(venueName, d);
            for (const b of daily) {
                const key = `${b.requestId}__${b.startDate}__${b.endDate}__${b.sessionTiming}`;
                if (seen.has(key)) continue;
                seen.add(key);
                bookings.push(b);
            }
        }
        if (!bookings.length) return { label: 'Available', tone: 'free' as const, bookings: [] as any[] };
        return { label: 'Booked', tone: 'booked' as const, bookings };
    };

    const beoCandidates = useMemo(() => {
        return allMiceRequests.filter((r: any) => {
            const s = String(r.status || '');
            return s !== 'Cancelled' && s !== 'Lost';
        });
    }, [allMiceRequests]);

    const columns = [
        { id: 'inquiry', title: 'Inquiry', color: colors.textMuted },
        { id: 'accepted', title: 'Accepted', color: colors.yellow },
        { id: 'tentative', title: 'Tentative', color: colors.blue },
        { id: 'definite', title: 'Definite', color: colors.green },
        { id: 'actual', title: 'Actual', color: '#059669' },
        { id: 'cancelled', title: 'Cancelled', color: colors.red },
    ];

    const handleDragStart = (e: any, item: any, sourceCol: any) => {
        setDraggedItem({ item, sourceCol });
        e.dataTransfer.setData('text/plain', JSON.stringify({ item, sourceCol }));
    };

    const handleDragOver = (e: any) => {
        e.preventDefault();
    };

    const handleDrop = (e: any, targetCol: any) => {
        e.preventDefault();
        if (readOnly) {
            setDraggedItem(null);
            return;
        }
        if (!draggedItem) return;
        const { item, sourceCol } = draggedItem;
        if (sourceCol === targetCol) {
            setDraggedItem(null);
            return;
        }
        const newStatus = COLUMN_TO_STATUS[targetCol];
        if (item.requestId && newStatus && onPatchRequestStatus) {
            onPatchRequestStatus(String(item.requestId), newStatus);
        }
        setDraggedItem(null);
    };

    // --- Sub-Views Implementations ---

    if (subView === 'availability') {
        const list = venuesList.length ? venuesList : [];
        const summaryDays = expandAvailabilityDays(appliedFrom, appliedTo, 14);
        const gridDayCount = Math.min(31, Math.max(1, Number(availabilityGridDays) || 7));
        const gridDayColumns = (() => {
            if (!appliedGridStart) return [];
            const cur = new Date(`${appliedGridStart.slice(0, 10)}T12:00:00`);
            const out: string[] = [];
            for (let i = 0; i < gridDayCount; i++) {
                out.push(toYmd(cur));
                cur.setDate(cur.getDate() + 1);
            }
            return out;
        })();

        const shiftAvailabilityGridStart = (deltaDays: number) => {
            const base = (appliedGridStart || draftGridStart || todayIso).slice(0, 10);
            const d = new Date(`${base}T12:00:00`);
            d.setDate(d.getDate() + deltaDays);
            const y = toYmd(d);
            setAppliedGridStart(y);
            setDraftGridStart(y);
        };

        const runAvailabilitySearch = () => {
            setAppliedFrom(draftFrom);
            setAppliedTo(draftTo);
            setAppliedGridStart(draftGridStart);
        };

        const gridEndIso = gridDayColumns.length ? gridDayColumns[gridDayColumns.length - 1] : appliedGridStart;
        const gridRangeSubtitle =
            gridDayCount === 7
                ? `week starting ${appliedGridStart}`
                : gridDayCount === 1
                  ? `1 day — ${appliedGridStart}`
                  : `${gridDayCount} days — ${appliedGridStart} through ${gridEndIso}`;

        return (
            <div className="h-full rounded-xl border p-6 flex flex-col gap-6 overflow-y-auto" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="flex flex-col items-center text-center shrink-0">
                    <Grid size={40} style={{ color: colors.textMuted }} className="mb-2" />
                    <h3 className="text-xl font-bold" style={{ color: colors.textMain }}>Venue Availability Check</h3>
                </div>

                <div className="flex flex-col gap-4 items-center w-full max-w-2xl mx-auto">
                    <div className="flex flex-wrap gap-4 items-end justify-center w-full">
                        <div>
                            <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>From date</label>
                            <input
                                type="date"
                                value={draftFrom}
                                onChange={(e) => setDraftFrom(e.target.value)}
                                className="px-3 py-2 rounded-lg border text-sm min-w-[10.5rem]"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>To date</label>
                            <div className="flex flex-wrap items-end gap-2">
                                <input
                                    type="date"
                                    value={draftTo}
                                    onChange={(e) => setDraftTo(e.target.value)}
                                    className="px-3 py-2 rounded-lg border text-sm min-w-[10.5rem]"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide shrink-0 h-[42px]"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                    onClick={runAvailabilitySearch}
                                >
                                    Search
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3 items-end justify-center w-full">
                        <div>
                            <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>Grid start date</label>
                            <input
                                type="date"
                                value={draftGridStart}
                                onChange={(e) => setDraftGridStart(e.target.value)}
                                className="px-3 py-2 rounded-lg border text-sm min-w-[10.5rem]"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            />
                        </div>
                        <button
                            type="button"
                            className="px-4 py-2 rounded-lg border text-xs font-bold uppercase shrink-0 h-[42px]"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                            onClick={() => setAppliedGridStart(draftGridStart.slice(0, 10))}
                        >
                            Align grid
                        </button>
                    </div>
                </div>

                <div>
                    <p className="text-[10px] uppercase font-bold mb-2" style={{ color: colors.textMuted }}>Summary ({summaryDays.length} day{summaryDays.length === 1 ? '' : 's'}) — last search</p>
                    <p className="text-[11px] mb-3 leading-relaxed" style={{ color: colors.textMuted }}>
                        Range used for venue summary:{' '}
                        <span className="font-mono text-[10px] whitespace-nowrap" style={{ color: colors.textMain }}>{appliedFrom}</span>
                        <span className="mx-1 opacity-60">→</span>
                        <span className="font-mono text-[10px] whitespace-nowrap" style={{ color: colors.textMain }}>{appliedTo}</span>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 w-full">
                        {(list.length ? list : [{ id: 'none', name: 'No venues configured' }]).map((v: any) => {
                            const nm = v.name || 'Venue';
                            const { label, tone, bookings } = venueRangeSummary(nm, summaryDays);
                            const isBooked = tone === 'booked';
                            const statusColor = isBooked ? (colors.red || '#ef4444') : colors.green;
                            return (
                                <button
                                    key={v.id || nm}
                                    type="button"
                                    disabled={!isBooked || !list.length}
                                    onClick={() => setAvailabilityVenueModal({ venueName: nm, bookings })}
                                    className="p-3 rounded border text-left disabled:cursor-default disabled:opacity-100 hover:bg-white/5 transition-colors"
                                    style={{ borderColor: colors.border }}
                                >
                                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>Venue</div>
                                    <div className="font-bold text-sm" style={{ color: colors.textMain }}>{nm}</div>
                                    <div className="mt-1 text-xs font-bold" style={{ color: statusColor }}>
                                        {list.length ? label : 'Set venues in settings'}
                                    </div>
                                    {isBooked && list.length ? (
                                        <div className="text-[10px] mt-1" style={{ color: colors.textMuted }}>
                                            {bookings.length} booking{bookings.length === 1 ? '' : 's'}
                                        </div>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="w-full min-w-0 border rounded-xl overflow-hidden" style={{ borderColor: colors.border }}>
                    <div
                        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:gap-3 px-3 py-2 border-b"
                        style={{ borderColor: colors.border, backgroundColor: colors.bg + '66' }}
                    >
                        <div className="flex justify-start min-w-0">
                            <button
                                type="button"
                                onClick={() => shiftAvailabilityGridStart(-7)}
                                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg border text-[10px] sm:text-xs font-black uppercase tracking-wide shrink-0 h-[42px]"
                                style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.card }}
                            >
                                <ChevronLeft size={16} strokeWidth={2.5} />
                                <span className="sm:hidden">Prev</span>
                                <span className="hidden sm:inline">Previous week</span>
                            </button>
                        </div>
                        <div className="flex flex-col items-center justify-end min-w-0">
                            <label className="text-[10px] uppercase font-bold block mb-1 text-center w-full" style={{ color: colors.textMuted }}>Days to show</label>
                            <select
                                value={gridDayCount}
                                onChange={(e) => setAvailabilityGridDays(Number(e.target.value))}
                                className="px-3 py-2 rounded-lg border text-xs font-bold min-w-[6.5rem] w-full max-w-[9rem]"
                                style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.textMain }}
                            >
                                {[3, 5, 7, 10, 14, 21, 28, 31].map((n) => (
                                    <option key={n} value={n}>
                                        {n} {n === 1 ? 'day' : 'days'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end min-w-0">
                            <button
                                type="button"
                                onClick={() => shiftAvailabilityGridStart(7)}
                                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg border text-[10px] sm:text-xs font-black uppercase tracking-wide shrink-0 h-[42px]"
                                style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.card }}
                            >
                                <span className="sm:hidden">Next</span>
                                <span className="hidden sm:inline">Next week</span>
                                <ChevronRight size={16} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                    <div className="px-3 py-2 border-b text-[10px] font-black uppercase tracking-wider" style={{ borderColor: colors.border, color: colors.textMuted }}>
                        Availability grid — {gridRangeSubtitle} (after Search or Align grid)
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px] border-collapse min-w-[520px]">
                            <thead>
                                <tr style={{ backgroundColor: colors.bg + '80' }}>
                                    <th className="p-2 border-b sticky left-0 z-[1] min-w-[120px]" style={{ borderColor: colors.border, backgroundColor: colors.card }}>Meeting room</th>
                                    {gridDayColumns.map((d) => (
                                        <th key={d} className="p-2 border-b text-center font-mono whitespace-nowrap" style={{ borderColor: colors.border, color: colors.textMuted }}>
                                            {d.slice(5).replace('-', '/')}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(list.length ? list : [{ id: 'none', name: '—' }]).map((v: any) => {
                                    const nm = v.name || 'Venue';
                                    return (
                                        <tr key={v.id || nm}>
                                            <td className="p-2 border-b font-bold sticky left-0 z-[1]" style={{ borderColor: colors.border, backgroundColor: colors.card, color: colors.textMain }}>
                                                {nm}
                                            </td>
                                            {gridDayColumns.map((d) => {
                                                const { tone, booking } = venueBookingLabel(nm, d);
                                                const statusColor = booking ? calendarRequestStatusColor(String(booking.status || ''), colors) : colors.textMuted;
                                                const bg = tone === 'free' ? 'transparent' : `${statusColor}1f`;
                                                const fg = tone === 'free' ? colors.textMuted : colors.textMain;
                                                return (
                                                    <td
                                                        key={d}
                                                        className="p-2 border-b align-top text-center"
                                                        style={{ borderColor: colors.border, backgroundColor: bg, color: fg }}
                                                        title={booking ? `${booking.accountName} • ${booking.status}` : 'Available'}
                                                    >
                                                        {tone === 'free' ? (
                                                            <span className="opacity-50">—</span>
                                                        ) : (
                                                            <div className="flex flex-col gap-0.5">
                                                                {booking ? (
                                                                    <>
                                                                        <span className="text-[9px] leading-tight line-clamp-2 break-words">{booking.accountName}</span>
                                                                        <span className="text-[9px] leading-tight line-clamp-2 break-words font-bold" style={{ color: statusColor }}>{booking.status}</span>
                                                                    </>
                                                                ) : null}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                {availabilityVenueModal ? (
                    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4" onClick={() => setAvailabilityVenueModal(null)}>
                        <div
                            className="w-full max-w-4xl max-h-[80vh] overflow-y-auto rounded-xl border p-4"
                            style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.textMain }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-black text-sm uppercase tracking-wider">
                                    {availabilityVenueModal.venueName} bookings
                                </h4>
                                <button type="button" onClick={() => setAvailabilityVenueModal(null)} className="px-2 py-1 rounded border text-xs" style={{ borderColor: colors.border }}>
                                    Close
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b" style={{ borderColor: colors.border, color: colors.textMuted }}>
                                            <th className="text-left py-2 pr-2">Account</th>
                                            <th className="text-left py-2 pr-2">Request</th>
                                            <th className="text-left py-2 pr-2">Start</th>
                                            <th className="text-left py-2 pr-2">End</th>
                                            <th className="text-left py-2 pr-2">Session timing</th>
                                            <th className="text-left py-2 pr-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {availabilityVenueModal.bookings.map((b: any, i: number) => (
                                            <tr key={`${b.requestId || 'req'}-${i}`} className="border-b" style={{ borderColor: colors.border }}>
                                                <td className="py-2 pr-2">{b.accountName || '—'}</td>
                                                <td className="py-2 pr-2">{b.requestName || '—'}</td>
                                                <td className="py-2 pr-2">{b.startDate || '—'}</td>
                                                <td className="py-2 pr-2">{b.endDate || '—'}</td>
                                                <td className="py-2 pr-2">{b.sessionTiming || '—'}</td>
                                                <td className="py-2 pr-2">{b.status || '—'}</td>
                                            </tr>
                                        ))}
                                        {availabilityVenueModal.bookings.length === 0 ? (
                                            <tr>
                                                <td className="py-3 opacity-60" colSpan={6}>No bookings in selected range.</td>
                                            </tr>
                                        ) : null}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (subView === 'beo') {
        const q = beoSearch.toLowerCase().trim();
        const rowsFiltered = beoCandidates.filter((r: any) => {
            if (!q) return true;
            const blob = `${r.requestName || ''} ${r.account || ''} ${r.confirmationNo || ''}`.toLowerCase();
            return blob.includes(q);
        });
        const beoEventSortKey = (r: any) => {
            const w = getMiceRequestDateWindow(r);
            const iso = String(w.start || '').slice(0, 10);
            if (iso) return iso;
            return String(r.requestDate || r.receivedDate || r.createdAt || '').slice(0, 10) || '1970-01-01';
        };
        const rows = [...rowsFiltered].sort((a, b) => {
            const cmp = beoEventSortKey(a).localeCompare(beoEventSortKey(b));
            return beoSortOrder === 'newest' ? -cmp : cmp;
        });
        const beoModalReq = beoModalRequestId
            ? (sharedRequests || []).find((x: any) => String(x.id) === String(beoModalRequestId)) || null
            : null;
        const beoFinModal = beoModalReq ? calculateAccFinancialsForRequest(beoModalReq, propertyTaxes, beoModalReq.requestType) : null;
        const beoEvModal = beoModalReq ? getEventDateWindow(beoModalReq) : { start: '', end: '' };
        const beoPkgModal = beoModalReq ? formatAgendaPackageSummary(beoModalReq.agenda || []) || beoModalReq.mealPlan || '—' : '—';
        const beoTypeKeyModal = beoModalReq ? normalizeRequestTypeKey(beoModalReq.requestType) : '';
        const beoAccModal = beoModalReq ? getAccountForRequest(beoModalReq, accounts) : null;
        const beoFallbackDaysModal = beoEvModal.start && beoEvModal.end ? inclusiveCalendarDays(beoEvModal.start, beoEvModal.end) : 1;
        const beoDayDenomModal = beoFinModal ? Math.max(1, beoFinModal.totalEventDays || beoFallbackDaysModal) : 1;
        const beoEventCostPerDayModal = beoFinModal ? beoFinModal.eventCostWithTax / beoDayDenomModal : 0;
        const beoScopeGrandModal = beoFinModal
            ? getBeoScopeGrandTotalInclTax(beoFinModal, beoModalReq?.requestType)
            : 0;
        const beoPaidModal = beoFinModal ? Number(beoFinModal.paidAmount || 0) : 0;
        const { remaining: beoRemainingModal, payLabel: beoPayLabelModal } = deriveBeoPaymentView(
            beoPaidModal,
            beoScopeGrandModal
        );

        const saveBeoNotesFromEvents = async () => {
            if (readOnly || !beoModalRequestId || !beoModalReq) return;
            const existing = (sharedRequests || []).find((x: any) => String(x.id) === String(beoModalRequestId));
            if (!existing) return;
            try {
                const res = await fetch(apiUrl('/api/requests'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...existing, beoNotes: beoNotesDraft }),
                });
                if (res.ok) onRefreshRequests?.();
                else alert('Failed to save BEO notes. Status: ' + res.status);
            } catch (e) {
                console.error(e);
                alert('Error saving BEO notes.');
            }
        };

        return (
            <>
                <div className="h-full rounded-xl border p-6 flex flex-col min-h-0" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex flex-wrap justify-between items-start border-b pb-6 mb-6 gap-4" style={{ borderColor: colors.border }}>
                        <div>
                            <h2 className="text-2xl font-bold mb-1" style={{ color: colors.primary }}>Banquet Event Order Management</h2>
                            <p style={{ color: colors.textMuted }}>All active MICE requests (excluding Cancelled / Lost).</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                                <button
                                    type="button"
                                    onClick={() => setBeoSortOrder('newest')}
                                    className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide ${beoSortOrder === 'newest' ? '' : 'opacity-60'}`}
                                    style={{
                                        backgroundColor: beoSortOrder === 'newest' ? colors.primary + '35' : 'transparent',
                                        color: colors.textMain,
                                    }}
                                >
                                    Newest
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBeoSortOrder('oldest')}
                                    className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide border-l ${beoSortOrder === 'oldest' ? '' : 'opacity-60'}`}
                                    style={{
                                        borderColor: colors.border,
                                        backgroundColor: beoSortOrder === 'oldest' ? colors.primary + '35' : 'transparent',
                                        color: colors.textMain,
                                    }}
                                >
                                    Oldest
                                </button>
                            </div>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search event..."
                                    value={beoSearch}
                                    onChange={(e) => setBeoSearch(e.target.value)}
                                    className="pl-8 pr-3 py-2 rounded bg-black/20 border text-sm w-64"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                />
                                <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: colors.textMuted }} />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3 overflow-y-auto flex-1">
                        {!rows.length ? (
                            <p className="text-sm opacity-50 text-center py-12" style={{ color: colors.textMuted }}>No qualifying events for this property.</p>
                        ) : (
                            rows.map((r: any) => {
                                const agenda = Array.isArray(r.agenda) ? r.agenda : [];
                                const venues = [...new Set(agenda.map((row: any) => String(row?.venue || '').trim()).filter(Boolean))];
                                const venue = venues.length ? venues.join(', ') : '—';
                                const d = formatMiceAgendaDateRange(r);
                                const paxLine = totalMiceRequestPax(r);
                                return (
                                    <div
                                        key={r.id}
                                        className="w-full p-4 rounded border flex items-stretch justify-between gap-3 hover:bg-white/5 transition-colors"
                                        style={{ borderColor: colors.border }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onOpenRequest?.(r.id)}
                                            className="flex-1 min-w-0 text-left"
                                        >
                                            <h4 className="font-bold" style={{ color: colors.textMain }}>{r.requestName || r.confirmationNo}</h4>
                                            <p className="text-xs" style={{ color: colors.textMuted }}>{d} • {venue} • {paxLine} pax • {r.account || r.accountName}</p>
                                        </button>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <StatusBadge status={String(r.status)} theme={theme} />
                                            <button
                                                type="button"
                                                title="Open BEO"
                                                className="p-2 rounded-lg border hover:bg-white/10 transition-colors"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setBeoModalRequestId(String(r.id));
                                                    setBeoNotesDraft(String(r.beoNotes ?? ''));
                                                }}
                                            >
                                                <FileText size={18} style={{ color: colors.primary }} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {beoModalReq && beoFinModal && (
                    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
                        <div
                            className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200"
                            style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        >
                            <div className="shrink-0 p-4 border-b flex flex-wrap items-center gap-2 justify-between" style={{ borderColor: colors.border }}>
                                <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: colors.textMain }}>Banquet event order (BEO)</h3>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => printBeoDocument(beoModalReq, beoFinModal, beoNotesDraft, accounts, activeProperty)}
                                        className="px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2"
                                        style={{ backgroundColor: colors.primary, color: '#000' }}
                                    >
                                        <Printer size={14} /> Print
                                    </button>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            onClick={saveBeoNotesFromEvents}
                                            className="px-4 py-2 rounded-xl border font-bold text-xs"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        >
                                            Save notes
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { setBeoModalRequestId(null); }}
                                        className="p-2 rounded-xl border"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        aria-label="Close"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 text-left" style={{ color: colors.textMain }}>
                                <div className="border-b pb-4 mb-4 flex flex-wrap items-start justify-between gap-4" style={{ borderColor: colors.border }}>
                                    <div>
                                        <h1 className="text-2xl font-black" style={{ color: colors.textMain }}>BEO — {beoModalReq.confirmationNo}</h1>
                                        <p className="text-sm mt-1 font-bold">{beoModalReq.account}</p>
                                        <p className="text-xs opacity-70 mt-2">Request status: <span className="font-bold">{beoModalReq.status || '—'}</span> · Type: <span className="font-bold">{beoModalReq.requestType || beoTypeKeyModal}</span></p>
                                    </div>
                                    <div className="text-right">
                                        {activeProperty?.logoUrl ? (
                                            <img src={activeProperty.logoUrl} alt="Property logo" className="h-14 ml-auto object-contain max-w-[180px]" />
                                        ) : null}
                                        <p className="text-xs font-bold mt-2" style={{ color: colors.textMain }}>{activeProperty?.name || 'Property'}</p>
                                    </div>
                                </div>
                                <h4 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Contacts (from account)</h4>
                                <div className="overflow-x-auto mb-6">
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b opacity-70" style={{ borderColor: colors.border }}>
                                                <th className="text-left py-2 pr-2 w-10">#</th>
                                                <th className="text-left py-2 pr-2">Name</th>
                                                <th className="text-left py-2 pr-2">Position</th>
                                                <th className="text-left py-2 pr-2">Phone</th>
                                                <th className="text-left py-2">Email</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {!beoAccModal ? (
                                                <tr>
                                                    <td className="py-2 pr-2">1</td>
                                                    <td className="py-2 pr-2 font-bold">Primary Contact</td>
                                                    <td className="py-2 pr-2">—</td>
                                                    <td className="py-2 pr-2">—</td>
                                                    <td className="py-2">—</td>
                                                </tr>
                                            ) : (
                                                (() => {
                                                    const list = (Array.isArray(beoAccModal.contacts) ? beoAccModal.contacts : [])
                                                        .filter((c: any) => contactDisplayName(c) || c?.email || c?.phone || c?.position);
                                                    if (list.length > 0) {
                                                        return list.map((c: any, i: number) => (
                                                            <tr key={i} className="border-b" style={{ borderColor: colors.border }}>
                                                                <td className="py-2 pr-2">{i + 1}</td>
                                                                <td className="py-2 pr-2 font-bold">{contactDisplayName(c) || `Contact ${i + 1}`}</td>
                                                                <td className="py-2 pr-2">{c?.position || '—'}</td>
                                                                <td className="py-2 pr-2">{c?.phone || '—'}</td>
                                                                <td className="py-2">{c?.email || '—'}</td>
                                                            </tr>
                                                        ));
                                                    }
                                                    return (
                                                        <tr>
                                                            <td className="py-2 pr-2">1</td>
                                                            <td className="py-2 pr-2 font-bold">Primary Contact</td>
                                                            <td className="py-2 pr-2">—</td>
                                                            <td className="py-2 pr-2">{beoAccModal?.phone || '—'}</td>
                                                            <td className="py-2">{beoAccModal?.email || '—'}</td>
                                                        </tr>
                                                    );
                                                })()
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-6">
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">Start</span><br />{beoEvModal.start || '—'}</div>
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">End</span><br />{beoEvModal.end || '—'}</div>
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">Package</span><br />{beoPkgModal}</div>
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">Event days</span><br />{beoFinModal.totalEventDays || beoFallbackDaysModal}</div>
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">Total attendees (pax × days)</span><br />{beoFinModal.totalEventAttendeeDays ?? beoFinModal.totalEventPax} <span className="text-[10px] opacity-50">({beoFinModal.totalEventPax} pax)</span></div>
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">DDR (per person)</span><br />{formatMoney(beoFinModal.ddr)}</div>
                                    <div className="md:col-span-2"><span className="font-bold uppercase text-[10px] opacity-50">Event cost per day (incl. tax)</span><br />{formatMoney(beoEventCostPerDayModal)}</div>
                                </div>
                                <h4 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Agenda</h4>
                                <div className="overflow-x-auto mb-6">
                                    <table className="w-full text-xs border-collapse min-w-[900px]">
                                        <thead>
                                            <tr className="border-b opacity-60" style={{ borderColor: colors.border }}>
                                                <th className="text-left py-2 pr-2">Start</th>
                                                <th className="text-left py-2 pr-2">End</th>
                                                <th className="text-left py-2 pr-2">Session time</th>
                                                <th className="text-left py-2 pr-2">Coffee</th>
                                                <th className="text-left py-2 pr-2">Lunch</th>
                                                <th className="text-left py-2 pr-2">Dinner</th>
                                                <th className="text-left py-2 pr-2">Venue</th>
                                                <th className="text-center py-2">Pax</th>
                                                <th className="text-right py-2">Line</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {!(beoModalReq.agenda || []).length ? (
                                                <tr><td colSpan={9} className="py-4 italic opacity-50">No agenda</td></tr>
                                            ) : (beoModalReq.agenda || []).map((row: any, i: number) => {
                                                const line = (Number(row.rate || 0) * Number(row.pax || 0)) + Number(row.rental || 0);
                                                return (
                                                    <tr key={row.id ?? i} className="border-b align-top" style={{ borderColor: colors.border }}>
                                                        <td className="py-2 pr-2">{row.startDate || '—'}</td>
                                                        <td className="py-2 pr-2">{row.endDate || row.startDate || '—'}</td>
                                                        <td className="py-2 pr-2 whitespace-nowrap">{[row.startTime, row.endTime].filter(Boolean).join(' – ') || '—'}</td>
                                                        <td className="py-2 pr-2 whitespace-nowrap">{formatAgendaRowCoffeeBreak(row) || '—'}</td>
                                                        <td className="py-2 pr-2 whitespace-nowrap">{formatAgendaRowLunch(row) || '—'}</td>
                                                        <td className="py-2 pr-2 whitespace-nowrap">{formatAgendaRowDinner(row) || '—'}</td>
                                                        <td className="py-2 pr-2">{formatAgendaRowVenueDisplay(row) || '—'}</td>
                                                        <td className="text-center py-2">{row.pax ?? '—'}</td>
                                                        <td className="text-right py-2 font-mono font-bold">{line.toLocaleString()}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="text-sm mb-4 space-y-1 p-4 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                    <p><span className="font-bold">Event total (incl. tax):</span> {formatMoney(beoScopeGrandModal)}</p>
                                </div>
                                <div className="p-4 rounded-xl border mb-4 space-y-2" style={{ borderColor: colors.primary + '40', backgroundColor: colors.primary + '08' }}>
                                    <h4 className="text-xs font-black uppercase tracking-widest opacity-70">Payment</h4>
                                    <p className="text-sm"><span className="font-bold">Status:</span> {beoPayLabelModal}</p>
                                    <p className="text-sm"><span className="font-bold">Amount paid:</span> {formatMoney(beoPaidModal)}</p>
                                    <p className="text-sm"><span className="font-bold">Remaining balance:</span> {formatMoney(beoRemainingModal)}</p>
                                </div>
                                <div className="mb-4">
                                    <label className="text-[10px] font-black uppercase opacity-50">Special requests (from request)</label>
                                    <div
                                        className="w-full mt-1 px-3 py-2 rounded-xl border min-h-[72px] text-sm whitespace-pre-wrap"
                                        style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg + '80' }}
                                    >
                                        {formatBeoSpecialRequestsCombined(beoModalReq) || '—'}
                                    </div>
                                </div>
                                <div className="mb-2">
                                    <label className="text-[10px] font-black uppercase opacity-50">Operations notes (BEO)</label>
                                    <textarea
                                        value={beoNotesDraft}
                                        onChange={(e) => setBeoNotesDraft(e.target.value)}
                                        disabled={readOnly}
                                        className="w-full mt-1 px-3 py-2 rounded-xl border min-h-[100px] text-sm disabled:opacity-50"
                                        style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg }}
                                        placeholder="Banquet / ops notes…"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }



    // 2. Accounts Performance View (Event + Event with rooms only, current filter range)
    if (subView === 'performance') {
        const top = performanceRows[0];
        const repeatClients = performanceRows.filter((a) => a.events > 1).length;
        const repeatPct = performanceRows.length ? Math.round((repeatClients / performanceRows.length) * 100) : 0;
        return (
            <div className="h-full flex flex-col gap-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KPICard
                        label="Top Account (value)"
                        value={top ? top.spent : '—'}
                        subtext={top?.name || 'No MICE requests'}
                        icon={Crown}
                        isPrimary
                        theme={theme}
                    />
                    <KPICard label="Avg Event Value" value={avgEventValueKpi} subtext="In filtered period" icon={TrendingUp} colorKey="green" theme={theme} />
                    <KPICard label="Accounts w/ 2+ events" value={`${repeatPct}%`} subtext={`${repeatClients} of ${performanceRows.length}`} icon={Users} colorKey="blue" theme={theme} />
                    <KPICard label="Pipeline Value" value={pipelineValueKpi} subtext="Open pipeline (est.)" icon={DollarSign} colorKey="yellow" theme={theme} />
                </div>
                <div className="flex-1 rounded-xl border p-5 flex flex-col min-h-0" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Account Performance Details</h3>

                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 opacity-40" size={14} style={{ color: colors.textMain }} />
                            <input
                                type="text"
                                placeholder="Search account name..."
                                value={accountSearch}
                                onChange={(e) => setAccountSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 rounded-lg border text-xs focus:ring-1 transition-all outline-none"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            />
                        </div>
                    </div>

                    <div className="overflow-auto flex-1 scrollbar-thin">
                        {!performanceRows.length ? (
                            <p className="text-sm text-center py-12 opacity-50" style={{ color: colors.textMuted }}>No event requests in this period for the active property.</p>
                        ) : (
                            <table className="w-full text-left border-separate border-spacing-y-2">
                                <thead className="text-[10px] uppercase font-bold sticky top-0 z-10" style={{ backgroundColor: colors.card, color: colors.textMuted }}>
                                    <tr>
                                        <th className="pb-3 pl-4">Account Name</th>
                                        <th className="pb-3 text-right">Events Held</th>
                                        <th className="pb-3 text-right">Total Spent</th>
                                        <th className="pb-3 pr-4 text-right">Pax (× days)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {performanceRows
                                        .filter((a) => a.name.toLowerCase().includes(accountSearch.toLowerCase()))
                                        .map((acc) => (
                                            <React.Fragment key={acc.name}>
                                                <tr
                                                    onClick={() => toggleAccountExpansion(acc.name)}
                                                    className="group cursor-pointer hover:translate-x-1 transition-transform"
                                                    style={{ backgroundColor: colors.bg }}
                                                >
                                                    <td className="py-4 pl-4 rounded-l-xl font-bold flex items-center gap-2" style={{ color: colors.textMain }}>
                                                        <ChevronDown size={14} className={`transition-transform duration-300 ${expandedAccounts.includes(acc.name) ? 'rotate-180' : ''}`} style={{ color: colors.primary }} />
                                                        {acc.name}
                                                    </td>
                                                    <td className="py-4 text-right font-mono text-xs" style={{ color: colors.textMuted }}>{acc.events}</td>
                                                    <td className="py-4 text-right font-mono font-bold text-xs" style={{ color: colors.primary }}>{acc.spent}</td>
                                                    <td className="py-4 pr-4 rounded-r-xl text-right font-mono text-xs" style={{ color: colors.textMuted }}>{acc.pax}</td>
                                                </tr>

                                                {expandedAccounts.includes(acc.name) && (
                                                    <tr>
                                                        <td colSpan={4} className="p-0">
                                                            <div className="mx-4 mb-4 rounded-xl border overflow-hidden animate-in slide-in-from-top-2 duration-300 shadow-inner"
                                                                style={{ backgroundColor: 'rgba(0,0,0,0.05)', borderColor: colors.border }}>
                                                                <table className="w-full text-[10px]">
                                                                    <thead className="opacity-60" style={{ color: colors.textMuted }}>
                                                                        <tr className="border-b" style={{ borderColor: colors.border }}>
                                                                            <th className="px-4 py-2 font-medium">Dates</th>
                                                                            <th className="px-4 py-2 font-medium">Event Title</th>
                                                                            <th className="px-4 py-2 text-right font-medium">Pax (× days)</th>
                                                                            <th className="pl-5 pr-4 py-2 text-right font-medium">Value</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {acc.details.map((detail, di) => (
                                                                            <tr key={di} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                                                                <td className="px-4 py-2 opacity-70 text-[10px] whitespace-nowrap max-w-[10rem] truncate" style={{ color: colors.textMain }} title={detail.date}>{detail.date}</td>
                                                                                <td className="px-4 py-2 font-medium" style={{ color: colors.textMain }}>{detail.title}</td>
                                                                                <td className="px-4 py-2 text-right opacity-70" style={{ color: colors.textMain }}>{detail.pax}</td>
                                                                                <td className="pl-5 pr-4 py-2 text-right font-bold tabular-nums" style={{ color: colors.green }}>{detail.value}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // 3. Analytics & Requests View
    if (subView === 'analytics') {
        const barData = venueBarData.length ? venueBarData : [{ name: 'No agenda venues yet', value: 0 }];
        const piePalette = [colors.blue, colors.orange];
        return (
            <div className="h-full flex flex-col gap-4 min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[280px] shrink-0">
                    <div className="rounded-xl border p-4 flex flex-col min-h-[260px]" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: colors.textMuted }}>Agenda venues (frequency)</h3>
                        <div className="flex-1 min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart layout="vertical" data={barData} margin={{ top: 0, right: 30, left: 8, bottom: 5 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={120} axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 9 }} />
                                    <Tooltip cursor={{ fill: 'transparent' }} {...rechartsTooltipThemeProps(colors)} />
                                    <Bar dataKey="value" fill={colors.purple} barSize={18} radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="rounded-xl border p-4 flex flex-col min-h-[260px]" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: colors.textMuted }}>Request type mix</h3>
                        <div className="flex-1 min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={typePieData} cx="50%" cy="50%" innerRadius={40} outerRadius={72} paddingAngle={4} dataKey="value">
                                        {typePieData.map((_, i) => (
                                            <Cell key={i} fill={piePalette[i % piePalette.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip {...rechartsTooltipThemeProps(colors)} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', color: colors.textMuted }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 rounded-xl border p-4 flex flex-col" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>MICE requests (filtered period)</h3>
                        <div className="flex gap-2 opacity-40">
                            <Filter size={14} style={{ color: colors.textMuted }} />
                            <Download size={14} style={{ color: colors.textMuted }} />
                        </div>
                    </div>
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-left text-xs">
                            <thead className="uppercase font-bold border-b sticky top-0 z-10" style={{ borderColor: colors.border, color: colors.textMuted, backgroundColor: colors.bg }}>
                                <tr>
                                    <th className="pb-2">Client / Event Name</th>
                                    <th className="pb-2">Dates</th>
                                    <th className="pb-2">Venue</th>
                                    <th className="pb-2 text-center">Pax (× days)</th>
                                    <th className="pb-2 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ borderColor: colors.border }}>
                                {miceRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center opacity-50" style={{ color: colors.textMuted }}>No rows</td>
                                    </tr>
                                ) : (
                                    miceRequests.map((req: any) => {
                                        const agenda = Array.isArray(req.agenda) ? req.agenda : [];
                                        const venues = [...new Set(agenda.map((row: any) => String(row?.venue || '').trim()).filter(Boolean))];
                                        const venue = venues.length ? venues.join(', ') : '—';
                                        const d = formatMiceAgendaDateRange(req);
                                        const pax = totalMiceRequestAttendeeDays(req);
                                        return (
                                            <tr key={req.id} className="hover:bg-white/5 transition-colors">
                                                <td className="py-2.5">
                                                    <div className="font-bold" style={{ color: colors.textMain }}>{req.requestName || req.confirmationNo}</div>
                                                    <div className="text-[10px]" style={{ color: colors.textMuted }}>{req.account || req.accountName}</div>
                                                </td>
                                                <td className="py-2.5 text-[11px] whitespace-nowrap max-w-[11rem] truncate" style={{ color: colors.textMuted }} title={d}>{d}</td>
                                                <td className="py-2.5 text-[11px] max-w-[10rem] truncate" style={{ color: colors.textMuted }} title={venue}>{venue}</td>
                                                <td className="py-2.5 text-center font-mono" style={{ color: colors.textMain }}>{pax}</td>
                                                <td className="py-2.5 text-right"><StatusBadge status={String(req.status || 'Inquiry')} theme={theme} /></td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    // Default: Kanban Pipeline (Kanban Icon)
    return (
        <div className="flex flex-col h-full min-h-0 gap-4">
            {/* KPI Header */}
            <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>Dates</h3>
                <div className="text-[10px] font-bold truncate max-w-[min(100%,14rem)] text-right" style={{ color: colors.primary }} title={`${filterRange.start} – ${filterRange.end}`}>
                    {filterRange.start && filterRange.end ? `${filterRange.start} - ${filterRange.end}` : 'All dates'}
                </div>
            </div>

            {/* Event KPIs */}
            <div className="grid grid-cols-3 gap-4 shrink-0">
                <KPICard label="Total Event Revenue" value={totalRevenue} subtext="In The Selected Period" icon={DollarSign} isPrimary theme={theme} />
                <KPICard label="Total Attendance" value={totalAttendance} subtext="In The Selected Period" icon={Users} colorKey="blue" theme={theme} />
                <KPICard label="Number of Events" value={numEventsLabel} subtext="In The Selected Period" icon={CalendarDays} colorKey="orange" theme={theme} />
            </div>

            <div className="shrink-0 flex items-center justify-end gap-1 px-1">
                <button
                    type="button"
                    aria-label="Scroll columns left"
                    className="p-1.5 rounded-lg border transition-colors hover:bg-white/10"
                    style={{ borderColor: colors.border, color: colors.textMain }}
                    onClick={() => {
                        const el = eventsKanbanScrollRef.current;
                        if (!el) return;
                        el.scrollBy({ left: -Math.max(280, Math.floor(el.clientWidth * 0.55)), behavior: 'smooth' });
                    }}
                >
                    <ChevronLeft size={18} />
                </button>
                <button
                    type="button"
                    aria-label="Scroll columns right"
                    className="p-1.5 rounded-lg border transition-colors hover:bg-white/10"
                    style={{ borderColor: colors.border, color: colors.textMain }}
                    onClick={() => {
                        const el = eventsKanbanScrollRef.current;
                        if (!el) return;
                        el.scrollBy({ left: Math.max(280, Math.floor(el.clientWidth * 0.55)), behavior: 'smooth' });
                    }}
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* Kanban Board */}
            <div ref={eventsKanbanScrollRef} className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
                {columns.map(col => (
                    <div
                        key={col.id}
                        className="flex flex-col h-full min-w-[300px] rounded-xl border overflow-hidden transition-colors shrink-0"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, col.id)}
                    >
                        {/* Column Header */}
                        <div className="p-3 border-b border-t-[6px]" style={{ borderColor: colors.border, borderTopColor: col.color, backgroundColor: colors.bg }}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: col.color }}>{col.title}</h3>
                                    <p className="text-[9px] font-mono font-bold mt-0.5" style={{ color: col.color, opacity: 0.8 }}>{getColumnTotal(col.id)}</p>
                                </div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10" style={{ color: colors.textMuted }}>
                                    {kanbanData[col.id]?.length || 0}
                                </span>
                            </div>
                        </div>

                        {/* Cards Container — min height keeps empty columns sized for ~4 cards after main scroll layout */}
                        <div className="flex-1 min-h-[34rem] p-2 space-y-2 overflow-y-auto">
                            {kanbanData[col.id]?.map((event: any) => (
                                <div
                                    key={String(event.requestId ?? event.id)}
                                    draggable={!readOnly}
                                    onDragStart={(e) => !readOnly && handleDragStart(e, event, col.id)}
                                    className={`p-3 rounded-lg border hover:shadow-lg transition-all hover:translate-y-[-2px] group ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'}`}
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: col.color + '40', color: col.color, backgroundColor: col.color + '10' }}>
                                            {event.type}
                                        </span>
                                        {!readOnly && onOpenRequestOpts ? (
                                            <button
                                                type="button"
                                                title="Request options (same as Requests OPTS)"
                                                className="opacity-70 hover:opacity-100 transition-opacity p-0.5 rounded-md hover:bg-white/10"
                                                style={{ color: colors.textMuted }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const rid = event.requestId ?? event.id;
                                                    if (rid) onOpenRequestOpts(String(rid));
                                                }}
                                            >
                                                <MoreHorizontal size={14} />
                                            </button>
                                        ) : null}
                                    </div>
                                    <h4 className="font-bold text-sm mb-1 leading-snug" style={{ color: colors.textMain }}>{event.title}</h4>
                                    <p className="text-xs mb-3" style={{ color: colors.textMuted }}>{event.client}</p>

                                    <div className="flex items-center justify-between text-[10px]" style={{ color: colors.textMuted }}>
                                        <div className="flex items-center gap-1">
                                            <Users size={12} /> {event.pax}
                                        </div>
                                        <div className="font-mono font-bold" style={{ color: colors.green }}>
                                            {formatMoneyCompact(parseValue(event.budget))}
                                        </div>
                                    </div>
                                    <div className="mt-2 text-[10px] flex items-center gap-1 min-w-0" style={{ color: colors.textMuted }} title={event.date}>
                                        <Calendar size={10} className="shrink-0" />
                                        <span className="truncate">{event.date}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Requests Management Views ---
const RequestsView = ({ theme, subView, setSubView, searchParams, setSearchParams }: any) => {
    const colors = theme.colors;

    if (subView === 'search') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-full max-w-4xl p-8 rounded-2xl border shadow-2xl relative overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.primary + '40' }}>
                    {/* Decorative Background */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-white/5 to-transparent rounded-bl-full pointer-events-none" />

                    <h2 className="text-3xl font-bold mb-2 text-center tracking-tight" style={{ color: colors.primary }}>Requests Management Center</h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        {/* Request Type */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Request Type</label>
                            <div className="relative">
                                <select
                                    className="w-full p-3 rounded-lg border bg-black/20 focus:ring-1 focus:ring-primary outline-none appearance-none transition-all hover:bg-black/30"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                    value={searchParams.type}
                                    onChange={(e) => setSearchParams({ ...searchParams, type: e.target.value })}
                                >
                                    <option value="all">All Request Types</option>
                                    <option value="group_acc">Group Accommodations</option>
                                    <option value="event_rooms">Event + Rooms</option>
                                    <option value="event_only">Event Only</option>
                                    <option value="series">Series Groups</option>
                                </select>
                                <ChevronDown size={16} className="absolute right-3 top-3.5 pointer-events-none" style={{ color: colors.textMuted }} />
                            </div>
                        </div>

                        {/* Arrival Date */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Arrival / Start Date</label>
                            <input type="date" className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors"
                                style={{ borderColor: colors.border, color: colors.textMain }} />
                        </div>

                        {/* Departure Date */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Departure / End Date</label>
                            <input type="date" className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors"
                                style={{ borderColor: colors.border, color: colors.textMain }} />
                        </div>

                        {/* Account Name */}
                        <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Account Name</label>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-3.5" style={{ color: colors.textMuted }} />
                                <input type="text" placeholder="Search account..." className="w-full p-3 pl-10 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors"
                                    style={{ borderColor: colors.border, color: colors.textMain }} />
                            </div>
                        </div>

                        {/* Confirmation # */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Confirmation Number</label>
                            <input type="text" placeholder="#REQ-..." className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors font-mono"
                                style={{ borderColor: colors.border, color: colors.textMain }} />
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <button
                            onClick={() => setSubView('list')}
                            className="px-10 py-3 rounded-xl font-bold uppercase tracking-widest text-sm flex items-center gap-3 transition-transform hover:scale-105 active:scale-95 shadow-lg"
                            style={{ backgroundColor: colors.primary, color: '#000', boxShadow: `0 0 20px -5px ${colors.primary}` }}
                        >
                            <Search size={18} /> Search Requests
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (subView === 'list') {
        return (
            <div className="h-full flex flex-col animate-in fade-in duration-300">
                <div className="p-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <div>
                        <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Search Results</h2>
                        <p className="text-xs mt-1" style={{ color: colors.textMuted }}>Showing 4 results for "All Requests"</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setSubView('search')} className="px-3 py-1.5 rounded border text-xs hover:bg-white/5 transition-colors" style={{ borderColor: colors.border, color: colors.textMain }}>New Search</button>
                        <button className="px-3 py-1.5 rounded border text-xs hover:bg-white/5 transition-colors flex items-center gap-2" style={{ borderColor: colors.border, color: colors.textMain }}><Download size={14} /> Export</button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
                        <table className="w-full text-left border-collapse">
                            <thead className="text-[10px] uppercase tracking-wider font-bold" style={{ backgroundColor: colors.bg, color: colors.textMuted }}>
                                <tr>
                                    <th className="p-4 border-b" style={{ borderColor: colors.border }}>Conf #</th>
                                    <th className="p-4 border-b" style={{ borderColor: colors.border }}>Account</th>
                                    <th className="p-4 border-b" style={{ borderColor: colors.border }}>Dates</th>
                                    <th className="p-4 border-b text-center" style={{ borderColor: colors.border }}>Rms / Pax</th>
                                    <th className="p-4 border-b" style={{ borderColor: colors.border }}>Details</th>
                                    <th className="p-4 border-b text-right" style={{ borderColor: colors.border }}>Cost</th>
                                    <th className="p-4 border-b text-right" style={{ borderColor: colors.border }}>Status</th>
                                    <th className="p-4 border-b" style={{ borderColor: colors.border }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs divide-y" style={{ borderTop: `1px solid ${colors.border}` }}>
                                {[
                                    { id: 'REQ-2024-001', client: 'Red Sea Global', start: 'Jan 20', end: 'Jan 25', rooms: 45, pax: 120, cost: '450k', status: 'Confirmed', type: 'Event + Rooms', venue: 'Main Ballroom' },
                                    { id: 'REQ-2024-002', client: 'McKinsey Retreat', start: 'Feb 10', end: 'Feb 12', rooms: 20, pax: 25, cost: '120k', status: 'Tentative', type: 'Group Acc.', venue: '-' },
                                    { id: 'REQ-2024-003', client: 'Saudi Aramco', start: 'Mar 05', end: 'Mar 05', rooms: 0, pax: 50, cost: '45k', status: 'Proposal', type: 'Event Only', venue: 'Meeting Room A' },
                                    { id: 'REQ-2024-004', client: 'Neom Delegation', start: 'Apr 15', end: 'Apr 20', rooms: 100, pax: 200, cost: '1.2M', status: 'Inquiry', type: 'Series Group', venue: 'All Venues' }
                                ].map((req, i) => (
                                    <tr key={i} className="hover:bg-white/5 transition-colors group">
                                        <td className="p-4 font-mono font-bold cursor-pointer hover:underline" style={{ color: colors.primary }}>{req.id}</td>
                                        <td className="p-4 font-bold" style={{ color: colors.textMain }}>
                                            {req.client}
                                            <div className="text-[9px] font-normal mt-0.5 opacity-60">{req.type}</div>
                                        </td>
                                        <td className="p-4" style={{ color: colors.textMain }}>
                                            {req.start} <span style={{ color: colors.textMuted }}>&rarr;</span> {req.end}
                                            <div className="text-[9px] font-normal mt-0.5 opacity-60">5 Days</div>
                                        </td>
                                        <td className="p-4 text-center" style={{ color: colors.textMain }}>
                                            {req.rooms > 0 && <div>{req.rooms} Rooms</div>}
                                            {req.pax > 0 && <div className="text-[10px]" style={{ color: colors.textMuted }}>{req.pax} Pax</div>}
                                        </td>
                                        <td className="p-4" style={{ color: colors.textMuted }}>
                                            {req.venue}
                                            <div className="text-[9px]">Full Board</div>
                                        </td>
                                        <td className="p-4 text-right font-mono font-bold" style={{ color: colors.textMain }}>{`${selectedCurrency} ${req.cost}`}</td>
                                        <td className="p-4 text-right">
                                            <StatusBadge status={req.status} theme={theme} />
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button className="p-1.5 rounded hover:bg-white/10" title="Edit"><FileText size={14} style={{ color: colors.textMain }} /></button>
                                                <button className="p-1.5 rounded hover:bg-white/10 text-red-500" title="Cancel"><X size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};


// --- Extracted Components (Memoization Optimization) ---

const MainChart = ({
    chartTab,
    chartData,
    colors,
    performanceData,
    currency = 'SAR',
    chartVsEnabled = false,
    chartVsYear,
}: any) => {
    const selectedCurrency = resolveCurrencyCode(currency);
    /** Integer counts for chart + legend (underlying buckets use prorated floats). */
    const chartDataForCurrentTab = useMemo(() => {
        const rows = chartData || [];
        if (chartTab === 'Rooms') {
            return rows.map((row: any) => ({
                ...row,
                rooms: Math.round(Number(row?.rooms) || 0),
                roomNights: Math.round(Number(row?.roomNights) || 0),
            }));
        }
        if (chartTab === 'Events' || chartTab === 'MICE') {
            return rows.map((row: any) => ({
                ...row,
                miceRequests: Math.round(Number(row?.miceRequests) || 0),
            }));
        }
        return rows;
    }, [chartData, chartTab]);
    /** Rooms tab: left scale for bars (rooms); second left scale for room nights line (not max of both). */
    const roomsChartYDomains = useMemo(() => {
        if (chartTab !== 'Rooms') return { maxRooms: 1, maxNights: 1 };
        const rows = chartDataForCurrentTab || [];
        let maxR = 0;
        let maxN = 0;
        for (const row of rows) {
            maxR = Math.max(maxR, Number(row?.rooms) || 0);
            maxN = Math.max(maxN, Number(row?.roomNights) || 0);
        }
        const head = (n: number) => {
            const c = Math.ceil(Number(n) || 0);
            if (c <= 0) return 1;
            return Math.max(c, Math.ceil(c * 1.06));
        };
        return { maxRooms: head(maxR), maxNights: head(maxN) };
    }, [chartTab, chartDataForCurrentTab]);
    const formatMoneyCompact = (amountSar: number) => formatCompactCurrency(amountSar, selectedCurrency);
    const perf = performanceData || {};
    const rooms = perf.rooms || {};
    const fnb = perf.fnb || {};
    const roomActualPct = Number(rooms.actualPct || 0);
    const roomForecastPct = Number(rooms.forecastPct || 0);
    const fnbActualPct = Number(fnb.actualPct || 0);
    const fnbForecastPct = Number(fnb.forecastPct || 0);
    const chartRoomActual = Math.max(0, Math.min(100, roomActualPct));
    const chartRoomForecast = Math.max(0, Math.min(100, roomForecastPct));
    const chartFnbActual = Math.max(0, Math.min(100, fnbActualPct));
    const chartFnbForecast = Math.max(0, Math.min(100, fnbForecastPct));
    const roomActualDelta = rooms.actualDeltaVsBudget || '0%';
    const roomForecastDelta = rooms.forecastDeltaVsBudget || '0%';
    const fnbActualDelta = fnb.actualDeltaVsBudget || '0%';
    const fnbForecastDelta = fnb.forecastDeltaVsBudget || '0%';
    const statusSeries = [
        { key: 'inquiry', name: 'Inquiry', color: colors.textMuted },
        { key: 'accepted', name: 'Accepted', color: colors.yellow },
        { key: 'tentative', name: 'Tentative', color: colors.blue },
        { key: 'definite', name: 'Definite', color: colors.green },
        { key: 'actual', name: 'Actual', color: '#059669' },
        { key: 'cancelled', name: 'Cancelled', color: colors.red },
    ];
    const activeStatusSeries = statusSeries.filter((s) =>
        (chartData || []).some((row: any) => Number(row?.[s.key] || 0) > 0)
    );
    const sumChartKey = (key: string) =>
        (chartDataForCurrentTab || []).reduce((sum: number, row: any) => sum + (Number(row?.[key]) || 0), 0);
    const formatLegendCount = (n: number) => Math.round(Number(n) || 0).toLocaleString();
    const formatLegendMoneyTotal = (amountSar: number) =>
        formatCurrencyAmount(Number(amountSar) || 0, selectedCurrency, { maximumFractionDigits: 0 });
    const statusLegendPayload = activeStatusSeries.map((s) => ({
        value: `${s.name} (${formatLegendCount(sumChartKey(s.key))})`,
        type: 'circle' as const,
        color: s.color,
        id: s.key,
    }));
    const roomsLegendPayload = [
        { value: `Rooms (${formatLegendCount(sumChartKey('rooms'))})`, type: 'circle' as const, color: colors.cyan, id: 'rooms' },
        { value: `Room Nights (${formatLegendCount(sumChartKey('roomNights'))})`, type: 'circle' as const, color: colors.blue, id: 'roomNights' },
        {
            value: `Rooms Revenue (${formatLegendMoneyTotal(sumChartKey('roomsRevenue'))})`,
            type: 'circle' as const,
            color: colors.green,
            id: 'roomsRevenue',
        },
    ];
    const miceLegendPayload = [
        { value: `MICE Requests (${formatLegendCount(sumChartKey('miceRequests'))})`, type: 'circle' as const, color: colors.purple, id: 'miceRequests' },
        {
            value: `Rooms Revenue (${formatLegendMoneyTotal(sumChartKey('miceRoomsRevenue'))})`,
            type: 'circle' as const,
            color: colors.cyan,
            id: 'miceRoomsRevenue',
        },
        {
            value: `Event Revenue (${formatLegendMoneyTotal(sumChartKey('miceRevenue'))})`,
            type: 'circle' as const,
            color: colors.green,
            id: 'miceRevenue',
        },
    ];
    const statusTooltipContent = ({ active, payload, label }: any) => {
        if (!active || !Array.isArray(payload) || payload.length === 0) return null;
        const nonZero = payload.filter((p: any) => Number(p?.value || 0) > 0);
        if (!nonZero.length) return null;
        return (
            <div
                className="rounded-lg border px-3 py-2 text-xs"
                style={{ backgroundColor: colors.tooltip, borderColor: colors.border, color: colors.textMain }}
            >
                <div className="font-bold mb-1">{label}</div>
                <div className="space-y-0.5">
                    {nonZero.map((p: any, i: number) => (
                        <div key={`${p?.name || p?.dataKey || i}`} style={{ color: p?.color || colors.textMain }}>
                            {p?.name}: {Math.round(Number(p?.value) || 0)}
                        </div>
                    ))}
                </div>
            </div>
        );
    };
    const moneyTickFormatter = (v: any) => formatCompactCurrency(Number(v || 0), selectedCurrency);
    const moneyTooltipFormatter = (value: any, name: any, entry: any) => {
        const key = String(entry?.dataKey || '').toLowerCase();
        const label = String(name || '').toLowerCase();
        const isMoney = key.includes('revenue') || label.includes('revenue');
        if (!isMoney) return [String(value ?? '—'), name];
        return [formatCurrencyAmount(Number(value || 0), selectedCurrency, { maximumFractionDigits: 2 }), name];
    };

    if (chartTab === 'Performance') {
        return (
            <div className="flex flex-col lg:flex-row w-full h-full divide-y lg:divide-y-0 lg:divide-x overflow-y-auto" style={{ borderColor: colors.border }}>
                {/* ROOMS Section */}
                <div className="flex-1 lg:flex-1 shrink-0 w-full min-h-[220px] lg:min-h-0 flex flex-col p-2 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2 px-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest pl-2 border-l-2" style={{ borderColor: colors.primary, color: colors.textMuted }}>Rooms</h4>
                    </div>

                    <div className="flex flex-1 flex-row items-center gap-2">
                        {/* Radial Chart */}
                        <div className="w-5/12 h-full relative shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart
                                    innerRadius="45%" outerRadius="100%"
                                    data={[
                                        { name: 'Budget', value: 100, fill: colors.border },
                                        { name: 'Forecast', value: chartRoomForecast, fill: colors.blue },
                                        { name: 'Actual', value: chartRoomActual, fill: colors.green }
                                    ]}
                                    startAngle={90} endAngle={-270}
                                >
                                    <RadialBar background={{ fill: colors.card }} cornerRadius={10} dataKey="value" />
                                </RadialBarChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-bold" style={{ color: colors.textMain }}>{Math.round(roomActualPct)}%</span>
                                <span className="text-[9px] uppercase tracking-wider" style={{ color: colors.textMuted }}>of Budget</span>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="w-7/12 flex flex-col justify-center gap-2 px-1">
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.green }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.green }}>Actual</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.green }}>{Math.round(roomActualPct)}%</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{rooms.actualLabel || formatMoneyCompact(0)}</span>
                                    <span className="text-[9px]" style={{ color: colors.textMuted }}>{roomActualDelta}</span>
                                </div>
                            </div>
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.blue }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.blue }}>Forecast</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.blue }}>{Math.round(roomForecastPct)}%</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{rooms.forecastLabel || formatMoneyCompact(0)}</span>
                                    <span className="text-[9px]" style={{ color: colors.textMuted }}>{roomForecastDelta}</span>
                                </div>
                            </div>
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.textMuted }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.textMuted }}>Budget</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.textMuted }}>Target</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{rooms.budgetLabel || formatMoneyCompact(0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Food and Beverage Section */}
                <div className="flex-1 lg:flex-1 shrink-0 w-full min-h-[220px] lg:min-h-0 flex flex-col p-2 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2 px-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest pl-2 border-l-2" style={{ borderColor: colors.orange, color: colors.textMuted }}>Food and Beverage</h4>
                    </div>

                    <div className="flex flex-1 flex-row items-center gap-2">
                        {/* Radial Chart */}
                        <div className="w-5/12 h-full relative shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart
                                    innerRadius="45%" outerRadius="100%"
                                    data={[
                                        { name: 'Budget', value: 100, fill: colors.border },
                                        { name: 'Forecast', value: chartFnbForecast, fill: colors.blue },
                                        { name: 'Actual', value: chartFnbActual, fill: colors.green }
                                    ]}
                                    startAngle={90} endAngle={-270}
                                >
                                    <RadialBar background={{ fill: colors.card }} cornerRadius={10} dataKey="value" />
                                </RadialBarChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-bold" style={{ color: colors.textMain }}>{Math.round(fnbActualPct)}%</span>
                                <span className="text-[9px] uppercase tracking-wider" style={{ color: colors.textMuted }}>of Budget</span>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="w-7/12 flex flex-col justify-center gap-2 px-1">
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.green }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.green }}>Actual</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.green }}>{Math.round(fnbActualPct)}%</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{fnb.actualLabel || formatMoneyCompact(0)}</span>
                                    <span className="text-[9px]" style={{ color: colors.textMuted }}>{fnbActualDelta}</span>
                                </div>
                            </div>
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.blue }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.blue }}>Forecast</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.blue }}>{Math.round(fnbForecastPct)}%</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{fnb.forecastLabel || formatMoneyCompact(0)}</span>
                                    <span className="text-[9px]" style={{ color: colors.textMuted }}>{fnbForecastDelta}</span>
                                </div>
                            </div>
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.textMuted }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.textMuted }}>Budget</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.textMuted }}>Target</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{fnb.budgetLabel || formatMoneyCompact(0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const profileChartTab = chartTab === 'Events' ? 'MICE' : chartTab;
    if (profileChartTab !== 'Performance') {
        return (
            <AccountProfilePerformanceChart
                chartTab={profileChartTab}
                chartData={chartData}
                colors={colors}
                currency={currency}
                chartVsEnabled={chartVsEnabled}
                chartVsYear={chartVsYear}
            />
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            {chartTab === 'Revenue' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 8, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={colors.green} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={colors.green} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        width={56}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        tickFormatter={moneyTickFormatter}
                    />
                    <Tooltip {...rechartsTooltipThemeProps(colors)} formatter={moneyTooltipFormatter} />
                    <Area type="monotone" dataKey="revenue" stroke={colors.green} fill="url(#colorRev)" />
                </AreaChart>
            ) : chartTab === 'Requests' ? (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <Tooltip {...rechartsTooltipThemeProps(colors)} cursor={{ fill: colors.border }} />
                    <Bar dataKey="totalRequests" name="Total Requests" fill={colors.blue} radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
            ) : chartTab === 'Rooms' ? (
                <ComposedChart data={chartDataForCurrentTab} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        yAxisId="rooms"
                        orientation="left"
                        width={40}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 9 }}
                        allowDecimals={false}
                        domain={[0, Math.max(roomsChartYDomains.maxRooms, roomsChartYDomains.maxNights)]}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        width={52}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        tickFormatter={moneyTickFormatter}
                    />
                    <Tooltip {...rechartsTooltipThemeProps(colors)} formatter={moneyTooltipFormatter} />
                    <Legend payload={roomsLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar yAxisId="rooms" dataKey="rooms" name="Rooms" fill={colors.cyan} radius={[4, 4, 0, 0]} barSize={16} />
                    <Line
                        yAxisId="rooms"
                        type="monotone"
                        dataKey="roomNights"
                        name="Room Nights"
                        stroke={colors.blue}
                        strokeWidth={2}
                        dot={{ r: 3, fill: colors.card, stroke: colors.blue, strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                    />
                    <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="roomsRevenue"
                        name="Rooms Revenue"
                        stroke={colors.green}
                        strokeWidth={2}
                        dot={{ r: 3, fill: colors.card, stroke: colors.green, strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                    />
                </ComposedChart>
            ) : chartTab === 'Events' || chartTab === 'MICE' ? (
                <ComposedChart data={chartDataForCurrentTab} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        yAxisId="left"
                        width={40}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        width={52}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        tickFormatter={moneyTickFormatter}
                    />
                    <Tooltip {...rechartsTooltipThemeProps(colors)} formatter={moneyTooltipFormatter} />
                    <Legend payload={miceLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar yAxisId="left" dataKey="miceRequests" name="MICE Requests" fill={colors.purple} radius={[4, 4, 0, 0]} barSize={20} />
                    <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="miceRoomsRevenue"
                        name="Rooms Revenue"
                        stroke={colors.cyan}
                        strokeWidth={2}
                        dot={{ r: 3, fill: colors.card, stroke: colors.cyan, strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                    />
                    <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="miceRevenue"
                        name="Event Revenue"
                        stroke={colors.green}
                        strokeWidth={2}
                        dot={{ r: 3, fill: colors.card, stroke: colors.green, strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                    />
                </ComposedChart>
            ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <Tooltip content={statusTooltipContent} cursor={{ fill: colors.border }} />
                    <Legend payload={statusLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar dataKey="inquiry" stackId="a" name="Inquiry" fill={colors.textMuted} />
                    <Bar dataKey="accepted" stackId="a" name="Accepted" fill={colors.yellow} />
                    <Bar dataKey="tentative" stackId="a" name="Tentative" fill={colors.blue} />
                    <Bar dataKey="definite" stackId="a" name="Definite" fill={colors.green} />
                    <Bar dataKey="actual" stackId="a" name="Actual" fill="#059669" />
                    <Bar dataKey="cancelled" stackId="a" name="Cancelled" fill={colors.red} radius={[4, 4, 0, 0]} />
                </BarChart>
            )}
        </ResponsiveContainer>
    );
};

type TaskAssigneeForm = { id: string; name: string };

function normalizeTaskAssignees(task: any): TaskAssigneeForm[] {
    if (Array.isArray(task?.assignees) && task.assignees.length) {
        return task.assignees
            .map((a: any) => ({
                id: String(a?.id ?? a?.userId ?? '').trim(),
                name: String(a?.name ?? '').trim(),
            }))
            .filter((a) => a.name);
    }
    const raw = String(task?.assignedTo || '').trim();
    if (!raw) return [];
    return raw
        .split(/\s*,\s*/)
        .map((name) => ({ id: '', name: name.trim() }))
        .filter((a) => a.name);
}

function taskAssigneeNamesList(task: any): string[] {
    return normalizeTaskAssignees(task).map((a) => a.name);
}

function taskAssigneesAvatarLetters(task: any): string {
    const names = taskAssigneeNamesList(task);
    if (!names.length) return '??';
    if (names.length === 1) {
        return names[0]
            .split(/\s+/)
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
    }
    const a = names[0].split(/\s+/)[0]?.[0] || '';
    const b = names[1].split(/\s+/)[0]?.[0] || '';
    return `${a}${b}`.toUpperCase() || '••';
}

const ToDoView = ({
    tasks,
    setTasks,
    handleOpenTaskModal,
    handleToggleTaskComplete,
    colors,
    theme,
    activePropertyId,
    canMutateOperational: canMutateTodo,
    currentUser,
}: any) => {
    const [activeList, setActiveList] = useState('All');

    const scopedTasks = (tasks || []).filter(
        (t: any) => !activePropertyId || !t.propertyId || t.propertyId === activePropertyId
    );

    const lists = [
        { id: 'All', icon: List, label: 'All Tasks' },
        { id: 'Important', icon: Star, label: 'Important', color: colors.orange },
        { id: 'Planned', icon: CalendarDays, label: 'Planned', color: colors.blue },
        { id: 'Assigned', icon: User, label: 'Assigned to me', color: colors.green },
        { id: 'Completed', icon: CheckCircle2, label: 'Completed' },
        { id: 'Progress', icon: Activity, label: 'Progress Insights', color: colors.cyan }
    ];

    const isAssignedToCurrentUser = (t: any) => !!currentUser && taskAssignedToUser(t, currentUser);

    const filteredTasks = scopedTasks.filter((t: any) => {
        if (activeList === 'Important') return t.star && !t.completed;
        if (activeList === 'Planned') return t.date && !t.completed;
        if (activeList === 'Assigned') return isAssignedToCurrentUser(t) && !t.completed;
        if (activeList === 'Completed') return t.completed;
        return !t.completed;
    });

    const toggleStar = (id: string | number, e: any) => {
        e.stopPropagation();
        if (!canMutateTodo) return;
        setTasks((prev: any) => prev.map((t: any) => String(t.id) === String(id) ? { ...t, star: !t.star } : t));
    };

    return (
        <div className="flex flex-1 h-full overflow-hidden rounded-2xl border bg-black/5" style={{ borderColor: colors.border }}>
            {/* To Do Sidebar */}
            <div className="w-60 border-r flex flex-col p-4 space-y-1 hidden md:flex" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                {lists.map(list => (
                    <button
                        key={list.id}
                        onClick={() => setActiveList(list.id)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeList === list.id ? 'bg-white/5 font-bold shadow-sm' : 'hover:bg-white/5 opacity-70'}`}
                        style={{ color: activeList === list.id ? colors.primary : colors.textMain }}
                    >
                        <list.icon size={18} style={{ color: list.color || (activeList === list.id ? colors.primary : colors.textMuted) }} />
                        <span className="text-sm">{list.label}</span>
                        <span className="ml-auto text-[10px] font-mono opacity-60">
                            {scopedTasks.filter((t: any) => {
                                if (list.id === 'Important') return t.star && !t.completed;
                                if (list.id === 'Planned') return t.date && !t.completed;
                                if (list.id === 'Assigned') return isAssignedToCurrentUser(t) && !t.completed;
                                if (list.id === 'Completed') return t.completed;
                                return !t.completed;
                            }).length}
                        </span>
                    </button>
                ))}
            </div>

            {/* To Do Main List Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
                <div className="p-8 pb-4 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-3xl font-black tracking-tight flex items-center gap-4" style={{ color: colors.textMain }}>
                            {lists.find(l => l.id === activeList)?.label}
                        </h2>
                        <p className="text-sm font-medium opacity-50 mt-1" style={{ color: colors.textMuted }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    </div>
                    {activeList !== 'Progress' && canMutateTodo && (
                        <button
                            onClick={() => handleOpenTaskModal()}
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-105 active:scale-95 shadow-2xl hover:brightness-110"
                            style={{ backgroundColor: colors.primary, color: '#000', boxShadow: `0 8px 30px ${colors.primary}40` }}
                        >
                            <Plus size={18} strokeWidth={3} />
                            Add Task
                        </button>
                    )}
                </div>

                {activeList === 'Progress' ? (
                    <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
                            {/* Summary Cards */}
                            <div className="md:col-span-2 grid grid-cols-3 gap-4">
                                <div className="p-6 rounded-3xl border-2 flex flex-col items-center justify-center text-center gap-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                    <div className="text-3xl font-black" style={{ color: colors.primary }}>{scopedTasks.filter((t: any) => t.completed).length}</div>
                                    <div className="text-[10px] uppercase font-bold tracking-widest opacity-60" style={{ color: colors.textMuted }}>Completed</div>
                                </div>
                                <div className="p-6 rounded-3xl border-2 flex flex-col items-center justify-center text-center gap-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                    <div className="text-3xl font-black" style={{ color: colors.blue }}>{scopedTasks.filter((t: any) => !t.completed).length}</div>
                                    <div className="text-[10px] uppercase font-bold tracking-widest opacity-60" style={{ color: colors.textMuted }}>Active</div>
                                </div>
                                <div className="p-6 rounded-3xl border-2 flex flex-col items-center justify-center text-center gap-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                    <div className="text-3xl font-black" style={{ color: colors.orange }}>{scopedTasks.filter((t: any) => t.star && !t.completed).length}</div>
                                    <div className="text-[10px] uppercase font-bold tracking-widest opacity-60" style={{ color: colors.textMuted }}>Critical</div>
                                </div>
                            </div>

                            {/* Circular Progress */}
                            <div className="p-6 rounded-3xl border-2 flex flex-col items-center justify-center relative bg-gradient-to-br from-black/20 to-transparent" style={{ borderColor: colors.border }}>
                                <div className="relative w-32 h-32 flex items-center justify-center">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="64" cy="64" r="54" stroke="currentColor" strokeWidth="8" fill="transparent" className="opacity-10" style={{ color: colors.primary }} />
                                        <circle cx="64" cy="64" r="54" stroke="currentColor" strokeWidth="8" fill="transparent"
                                            strokeDasharray={2 * Math.PI * 54}
                                            strokeDashoffset={2 * Math.PI * 54 * (1 - (scopedTasks.filter((t: any) => t.completed).length / (scopedTasks.length || 1)))}
                                            strokeLinecap="round"
                                            className="transition-all duration-1000 ease-out"
                                            style={{ color: colors.primary }}
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-black" style={{ color: colors.textMain }}>
                                            {Math.round((scopedTasks.filter((t: any) => t.completed).length / (scopedTasks.length || 1)) * 100)}%
                                        </span>
                                        <span className="text-[8px] uppercase font-bold opacity-40">Total</span>
                                    </div>
                                </div>
                                <p className="mt-4 text-[10px] uppercase font-bold tracking-tighter opacity-70">Overall Completion</p>
                            </div>

                            {/* Priority Breakdown Chart */}
                            <div className="md:col-span-1 p-6 rounded-3xl border-2 h-64" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <h3 className="text-sm font-black mb-4 uppercase tracking-widest opacity-70" style={{ color: colors.textMuted }}>Priority Mix</h3>
                                <ResponsiveContainer width="100%" height="80%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'High', value: scopedTasks.filter((t: any) => t.priority === 'High').length, fill: colors.red },
                                                { name: 'Medium', value: scopedTasks.filter((t: any) => t.priority === 'Medium').length, fill: colors.yellow },
                                                { name: 'Low', value: scopedTasks.filter((t: any) => t.priority === 'Low').length, fill: colors.green }
                                            ]}
                                            innerRadius={50}
                                            outerRadius={70}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {[0, 1, 2].map((i) => <Cell key={i} />)}
                                        </Pie>
                                        <Tooltip {...rechartsTooltipThemeProps(colors, { borderRadius: '12px' })} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Category Distribution */}
                            <div className="md:col-span-2 p-6 rounded-3xl border-2 h-64" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <h3 className="text-sm font-black mb-4 uppercase tracking-widest opacity-70" style={{ color: colors.textMuted }}>Category Load</h3>
                                <ResponsiveContainer width="100%" height="80%">
                                    <BarChart data={TASK_CATEGORIES.map(cat => ({
                                        name: cat,
                                        count: scopedTasks.filter((t: any) => t.category === cat).length
                                    }))}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.border} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: colors.textMuted }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: colors.textMuted }} />
                                        <Tooltip cursor={{ fill: 'white', opacity: 0.05 }} {...rechartsTooltipThemeProps(colors, { borderRadius: '12px' })} />
                                        <Bar dataKey="count" radius={[10, 10, 0, 0]} barSize={30}>
                                            {TASK_CATEGORIES.map((_, i) => (
                                                <Cell key={i} fill={[colors.primary, colors.blue, colors.purple, colors.cyan, colors.orange][i % 5]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>


                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto px-8 py-4 space-y-3 custom-scrollbar">
                        {filteredTasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 italic">
                                <CheckCircle2 size={64} strokeWidth={1} className="mb-4" />
                                <p className="text-lg font-light tracking-widest">Everything is caught up</p>
                            </div>
                        ) : (
                            filteredTasks.map((task: any) => {
                                const assigneeNames = taskAssigneeNamesList(task);
                                return (
                                <div
                                    key={task.id}
                                    onClick={() => handleOpenTaskModal(task)}
                                    className="group flex items-center gap-5 p-5 rounded-2xl border-2 transition-all cursor-pointer hover:shadow-xl hover:-translate-y-0.5 animate-in slide-in-from-bottom-4"
                                    style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                >
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleToggleTaskComplete(task.id, e); }}
                                        disabled={!canMutateTodo}
                                        className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 shrink-0 shadow-inner disabled:opacity-40 disabled:pointer-events-none"
                                        style={{ borderColor: task.completed ? colors.green : colors.primary + '30' }}
                                    >
                                        {task.completed && <Check size={14} strokeWidth={4} style={{ color: colors.green }} />}
                                        {!task.completed && <div className="w-3 h-3 rounded-full opacity-0 group-hover:opacity-30" style={{ backgroundColor: colors.primary }} />}
                                    </button>

                                    <div className="flex-1 min-w-0">
                                        <h4 className={`text-base font-bold truncate transition-all ${task.completed ? 'line-through opacity-30 italic' : ''}`} style={{ color: colors.textMain }}>{task.task}</h4>
                                        <div className="flex items-center gap-4 mt-1.5">
                                            <span className="text-xs font-medium opacity-60 flex items-center gap-1" style={{ color: colors.textMuted }}>
                                                <Briefcase size={12} />
                                                {task.client}
                                            </span>
                                            {task.date && (
                                                <span className="flex items-center gap-1.5 text-xs font-black tracking-tighter" style={{ color: new Date(task.date) < new Date() && !task.completed ? colors.red : colors.blue }}>
                                                    <Calendar size={12} strokeWidth={3} />
                                                    {task.date}
                                                </span>
                                            )}
                                            {task.category && (
                                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-[0.1em]" style={{ backgroundColor: colors.primary + '15', color: colors.primary }}>
                                                    {task.category}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-5 shrink-0">
                                        <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/5 max-w-[min(100%,22rem)]">
                                            <div className="w-6 h-6 rounded-full flex shrink-0 items-center justify-center text-[10px] font-black text-black"
                                                style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.orange})` }}>
                                                {taskAssigneesAvatarLetters(task)}
                                            </div>
                                            <span
                                                className="text-[10px] font-bold opacity-70 hidden lg:flex flex-wrap items-center gap-x-1 gap-y-0.5 justify-end text-right leading-snug"
                                                style={{ color: colors.textMain }}
                                            >
                                                {assigneeNames.length === 0 ? (
                                                    '—'
                                                ) : (
                                                    assigneeNames.map((nm, i) => (
                                                        <React.Fragment key={`${nm}-${i}`}>
                                                            {i > 0 && <span className="opacity-40 shrink-0">·</span>}
                                                            <span className="whitespace-nowrap">{nm}</span>
                                                        </React.Fragment>
                                                    ))
                                                )}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => toggleStar(task.id, e)}
                                            disabled={!canMutateTodo}
                                            className="p-1 hover:scale-125 transition-transform disabled:opacity-30 disabled:pointer-events-none"
                                            style={{ color: task.star ? colors.orange : colors.textMuted + '20' }}
                                        >
                                            <Star size={22} fill={task.star ? colors.orange : 'transparent'} strokeWidth={task.star ? 0 : 2} />
                                        </button>
                                    </div>
                                </div>
                            );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const DIST_BAR_PALETTE_KEYS = ['blue', 'cyan', 'green', 'yellow', 'purple', 'red', 'orange'] as const;

const DistributionChart = ({ distTab, segmentData, accountTypeData, colors }: any) => {
    const barFills = DIST_BAR_PALETTE_KEYS.map((k) => colors[k]);
    /** Types with zero accounts are already stripped from `accountTypeData`. */
    const typeRows = Array.isArray(accountTypeData) ? accountTypeData : [];

    if (distTab === 'Segments') {
        return (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={segmentData} margin={{ top: 5, right: 30, left: 72, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 9 }} />
                    <YAxis
                        dataKey="name"
                        type="category"
                        width={118}
                        tickMargin={10}
                        interval={0}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 9 }}
                    />
                    <Tooltip {...rechartsTooltipThemeProps(colors)} cursor={{ fill: colors.border, fillOpacity: 0.1 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                        {(segmentData || []).map((entry: any, index: number) => (
                            <Cell key={`${entry.name}-${index}`} fill={barFills[index % barFills.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    }

    if (!typeRows.length) {
        return (
            <div className="flex h-full w-full items-center justify-center text-xs" style={{ color: colors.textMuted }}>
                No accounts with a type yet
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={typeRows} margin={{ top: 8, right: 12, left: 4, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                <XAxis
                    dataKey="name"
                    interval={0}
                    angle={-28}
                    textAnchor="end"
                    height={52}
                    tick={{ fill: colors.textMuted, fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: colors.textMuted, fontSize: 9 }}
                    width={28}
                />
                <Tooltip
                    {...rechartsTooltipThemeProps(colors)}
                    cursor={{ fill: colors.border, fillOpacity: 0.12 }}
                    formatter={(value: any, _n: any, item: any) => {
                        const n = Number(value) || 0;
                        const pct = Number(item?.payload?.percent ?? 0);
                        return [`${n} account${n === 1 ? '' : 's'} · ${pct}%`, item?.payload?.name ?? 'Type'];
                    }}
                />
                <Bar dataKey="value" name="Accounts" radius={[6, 6, 0, 0]} barSize={22} maxBarSize={36}>
                    {typeRows.map((entry: any, index: number) => (
                        <Cell key={`${entry.name}-${index}`} fill={barFills[index % barFills.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
};

// --- Main Dashboard ---

const USER_CURRENCY_PREFS_KEY = 'as_userCurrencyPrefs';

function getCurrencyUserKey(user: any): string {
    return String(user?.id || user?.username || user?.email || user?.name || '').trim().toLowerCase();
}

function readUserCurrencyPrefs(): Record<string, CurrencyCode> {
    try {
        const raw = localStorage.getItem(USER_CURRENCY_PREFS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeUserCurrencyPref(user: any, currency: CurrencyCode) {
    const key = getCurrencyUserKey(user);
    if (!key) return;
    const prefs = readUserCurrencyPrefs();
    prefs[key] = resolveCurrencyCode(currency);
    localStorage.setItem(USER_CURRENCY_PREFS_KEY, JSON.stringify(prefs));
}

function getPersistedUserCurrency(user: any): CurrencyCode {
    const key = getCurrencyUserKey(user);
    if (key) {
        const pref = readUserCurrencyPrefs()[key];
        if (pref) return resolveCurrencyCode(pref);
    }
    return resolveCurrencyCode(user?.preferredCurrency);
}

function getActivePropertyStorageKey(user: any): string {
    const userKey = String(user?.id || user?.username || user?.email || '').trim().toLowerCase();
    return userKey ? `${ACTIVE_PROPERTY_STORAGE_KEY}::${userKey}` : ACTIVE_PROPERTY_STORAGE_KEY;
}

type AlertsBellProps = {
    colors: any;
    bellSize: number;
    panelRef: React.RefObject<HTMLDivElement | null>;
    open: boolean;
    setOpen: (v: boolean) => void;
    activeAlerts: RequestAlert[];
    getAlertRowStyle: (a: RequestAlert['accent']) => React.CSSProperties;
    onDone: (a: RequestAlert) => void;
    onViewRequest: (a: RequestAlert) => void;
};

const AlertsBell = memo(function AlertsBell({
    colors,
    bellSize,
    panelRef,
    open,
    setOpen,
    activeAlerts,
    getAlertRowStyle,
    onDone,
    onViewRequest,
}: AlertsBellProps) {
    return (
        <div className="relative" ref={panelRef}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="relative p-1.5 rounded-md border transition-all hover:bg-white/10"
                style={{ borderColor: colors.border, color: colors.textMuted }}
                aria-expanded={open}
                aria-haspopup="dialog"
                title="Alerts"
            >
                <Bell size={bellSize} />
                {activeAlerts.length > 0 ? (
                    <span
                        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-black flex items-center justify-center leading-none"
                        style={{ backgroundColor: colors.red, color: '#fff' }}
                    >
                        {activeAlerts.length > 99 ? '99+' : activeAlerts.length}
                    </span>
                ) : null}
            </button>
            {open ? (
                <div
                    className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,22rem)] max-h-[min(70vh,440px)] overflow-y-auto rounded-xl border shadow-2xl z-[200] py-2"
                    style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    role="dialog"
                    aria-label="Alerts"
                >
                    {activeAlerts.length === 0 ? (
                        <p className="px-4 py-6 text-xs text-center font-medium" style={{ color: colors.textMuted }}>
                            No active alerts
                        </p>
                    ) : (
                        activeAlerts.map((alert) => (
                            <div
                                key={alert.dismissKey}
                                className="px-2 py-1.5 border-b last:border-b-0"
                                style={{ borderColor: colors.border }}
                            >
                                <div
                                    className="rounded-lg overflow-hidden border"
                                    style={{
                                        ...getAlertRowStyle(alert.accent),
                                        borderRightWidth: 1,
                                        borderTopWidth: 1,
                                        borderBottomWidth: 1,
                                        borderRightStyle: 'solid',
                                        borderTopStyle: 'solid',
                                        borderBottomStyle: 'solid',
                                        borderRightColor: colors.border,
                                        borderTopColor: colors.border,
                                        borderBottomColor: colors.border,
                                    }}
                                >
                                    <div className="p-2.5">
                                        <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: colors.textMuted }}>
                                            {alert.title}
                                            {alert.urgent ? <span style={{ color: colors.red }}> · Urgent</span> : null}
                                        </p>
                                        <p className="text-xs font-bold mt-1 leading-snug" style={{ color: colors.textMain }}>
                                            {alert.body}
                                        </p>
                                        <p className="text-[10px] mt-1.5 opacity-70" style={{ color: colors.textMain }}>
                                            Owner: <span className="font-bold">{alert.creatorName}</span>
                                        </p>
                                        {alert.anchorDate ? (
                                            <p className="text-[9px] opacity-50 mt-0.5" style={{ color: colors.textMuted }}>
                                                Anchor: {alert.anchorDate}
                                            </p>
                                        ) : null}
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                type="button"
                                                onClick={() => onDone(alert)}
                                                className="flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors hover:opacity-90"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                Done
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onViewRequest(alert)}
                                                className="flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors hover:opacity-90"
                                                style={{
                                                    borderColor: colors.primary,
                                                    color: colors.textMain,
                                                    backgroundColor: `${colors.primary}18`,
                                                }}
                                            >
                                                View request
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : null}
        </div>
    );
});

const APP_SHELL_VIEW_IDS = new Set<string>([
    'dashboard',
    'calendar',
    'events',
    'requests',
    'crm',
    'contracts',
    'accounts',
    'promotions',
    'reports',
    'todo',
    'settings',
]);

function readInitialShellView(): string {
    try {
        // Prefer URL (shareable / refreshable) over legacy localStorage.
        if (typeof window !== 'undefined') {
            const fromUrl = parseAppPath(window.location.pathname);
            if (fromUrl.view && APP_SHELL_VIEW_IDS.has(fromUrl.view)) return fromUrl.view;
        }
        const raw = localStorage.getItem('as_currentView');
        if (raw && APP_SHELL_VIEW_IDS.has(raw)) return raw;
        if (raw) localStorage.removeItem('as_currentView');
    } catch {
        /* ignore */
    }
    return 'dashboard';
}

function readInitialHubTab(): DashboardHubTabId {
    try {
        if (typeof window !== 'undefined') {
            return parseAppPath(window.location.pathname).hubTab;
        }
    } catch {
        /* ignore */
    }
    return 'dashboard';
}

export default function AdvancedSalesDashboard() {
    const location = useLocation();
    const navigate = useNavigate();
    const [currentThemeId, setCurrentThemeId] = useState(() => {
        try {
            const raw = localStorage.getItem('as_themeId');
            if (raw && (THEMES as any)[raw]) return raw;
            if (raw) localStorage.removeItem('as_themeId');
        } catch {
            /* ignore */
        }
        return 'light';
    });
    const [isSidebarPinned, setIsSidebarPinned] = useState(false);
    const [currentView, setCurrentViewState] = useState(() => readInitialShellView());
    const [hubTab, setHubTabState] = useState<DashboardHubTabId>(() => readInitialHubTab());
    const hubTabRef = useRef(hubTab);
    hubTabRef.current = hubTab;

    const navigatePreservingSearch = useCallback(
        (nextPath: string) => {
            if (normalizeComparePath(location.pathname) === normalizeComparePath(nextPath)) return;
            // Keep ?joinChat= and other query params across module navigations.
            navigate({ pathname: nextPath, search: location.search });
        },
        [navigate, location.pathname, location.search],
    );

    const setCurrentView = useCallback(
        (view: string) => {
            // Sidebar "Dashboard" always opens the KPI home (not the last hub analytics tab).
            if (view === 'dashboard') {
                setHubTabState('dashboard');
                hubTabRef.current = 'dashboard';
            }
            setCurrentViewState(view);
            navigatePreservingSearch(viewToPath(view, 'dashboard'));
        },
        [navigatePreservingSearch],
    );

    const setHubTab = useCallback(
        (tab: DashboardHubTabId) => {
            setHubTabState(tab);
            hubTabRef.current = tab;
            setCurrentViewState('dashboard');
            navigatePreservingSearch(viewToPath('dashboard', tab));
        },
        [navigatePreservingSearch],
    );

    // Authentication State
    const [currentUser, setCurrentUser] = useState<any>(() => {
        try {
            const saved = localStorage.getItem('as_currentUser');
            return saved ? JSON.parse(saved) : null;
        } catch {
            try {
                localStorage.removeItem('as_currentUser');
            } catch {
                /* ignore */
            }
            return null;
        }
    });
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        try {
            const saved = localStorage.getItem('as_currentUser');
            if (!saved) return false;
            JSON.parse(saved);
            return true;
        } catch {
            try {
                localStorage.removeItem('as_currentUser');
            } catch {
                /* ignore */
            }
            return false;
        }
    });
    const [showLoginPage, setShowLoginPage] = useState(false);
    const [showLandingPreview, setShowLandingPreview] = useState(false);
    const currentCurrency = resolveCurrencyCode(currentUser?.preferredCurrency || 'SAR');
    const theme = (THEMES as any)[currentThemeId] || (THEMES as any).light;
    const colors = theme.colors;
    const userInitials = useMemo(
        () =>
            String(currentUser?.name || '')
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map((n: string) => n[0])
                .join('') || 'US',
        [currentUser?.name]
    );
    const userAvatarGradientStyle = useMemo(
        () => ({
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.orange})`,
            borderColor: colors.border,
        }),
        [colors.primary, colors.orange, colors.border]
    );
    const formatMoney = useCallback(
        (amountSar: number, maxFractionDigits = 2) => formatCurrencyAmount(amountSar, currentCurrency, { maximumFractionDigits: maxFractionDigits }),
        [currentCurrency]
    );
    const formatMoneyCompact = useCallback(
        (amountSar: number) => formatCompactCurrency(amountSar, currentCurrency),
        [currentCurrency]
    );
    // Persistent Storage Effects
    useEffect(() => {
        localStorage.setItem('as_themeId', currentThemeId);
    }, [currentThemeId]);

    /** Drive global CSS for native selects, scrollbars, and color-scheme (Luxury Dark + Cyber Pop). */
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', currentThemeId);
        const isDark = currentThemeId === 'luxury' || currentThemeId === 'colorful';
        root.style.colorScheme = isDark ? 'dark' : 'light';
    }, [currentThemeId]);

    useEffect(() => {
        localStorage.setItem('as_currentView', currentView);
    }, [currentView]);

    // URL → shell state (back/forward + refresh + shared links)
    useEffect(() => {
        const parsed = parseAppPath(location.pathname);
        if (parsed.view !== currentView) setCurrentViewState(parsed.view);
        if (parsed.hubTab !== hubTab) setHubTabState(parsed.hubTab);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: drive from location only
    }, [location.pathname]);

    useEffect(() => {
        if (currentUser) {
            localStorage.setItem('as_currentUser', JSON.stringify(currentUser));
            setIsAuthenticated(true);
        } else {
            localStorage.removeItem('as_currentUser');
            setIsAuthenticated(false);
        }
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) return;
        const persistedCurrency = getPersistedUserCurrency(currentUser);
        if (persistedCurrency === resolveCurrencyCode(currentUser?.preferredCurrency)) return;
        setCurrentUser((prev: any) => (prev ? { ...prev, preferredCurrency: persistedCurrency } : prev));
    }, [currentUser]);

    useEffect(() => {
        localStorage.setItem('as_selectedCurrency', currentCurrency);
    }, [currentCurrency]);

    useEffect(() => {
        if (!isAuthenticated || !currentUser) return;
        const allowedViews = getAllowedAppViewsForUser(currentUser);
        if (!allowedViews.has(currentView)) {
            const fallback =
                (allowedViews.has('requests') ? 'requests' : null) ||
                (allowedViews.has('dashboard') ? 'dashboard' : null) ||
                (allowedViews.has('todo') ? 'todo' : null) ||
                [...allowedViews][0] ||
                'settings';
            setCurrentView(fallback);
        }
    }, [currentView, currentUser, isAuthenticated, setCurrentView]);

    // Events Sub-View State: 'pipeline' (default), 'calendar', 'availability', 'beo'
    const [eventsSubView, setEventsSubView] = useState('pipeline');
    const [crmSubView, setCrmSubView] = useState<'activities' | 'pipeline' | 'list' | 'dashboard'>('activities');
    const [crmViewMode, setCrmViewMode] = useState<'account' | 'request'>('account');
    const [dashboardPeriodMode, setDashboardPeriodMode] = useState<DashboardPeriodMode>('autoCurrentYear');
    const [dashboardNowAnchor, setDashboardNowAnchor] = useState(() => Date.now());
    const [chartTab, setChartTab] = useState('Performance');
    const [chartVsEnabled, setChartVsEnabled] = useState(false);
    const [chartVsYear, setChartVsYear] = useState(defaultChartVsYear);
    const [distTab, setDistTab] = useState('Segments');
    const [feedTab, setFeedTab] = useState('Requests');
    const [dashboardFeedSearchOpen, setDashboardFeedSearchOpen] = useState(false);
    const [dashboardFeedSearchQuery, setDashboardFeedSearchQuery] = useState('');
    const [tableTab, setTableTab] = useState('Status');
    const [isSideNavOpen, setIsSideNavOpen] = useState(false);

    // Calendar Navigation State
    const [currentCalendarDate, setCurrentCalendarDate] = useState(() => new Date());
    const [calendarViewMode, setCalendarViewMode] = useState('Month');
    const [showCalendarDatePicker, setShowCalendarDatePicker] = useState(false);
    const [calendarDetailModal, setCalendarDetailModal] = useState<
        { kind: 'request'; requestId: string } | { kind: 'crm'; lead: any } | null
    >(null);

    // Requests Management State
    const [requestsSubView, setRequestsSubView] = useState('search'); // 'search' | 'list' | 'details' | 'create'
    const [requestsNavNonce, setRequestsNavNonce] = useState(0);
    const [requestSearchParams, setRequestSearchParams] = useState({
        type: 'all',
        arrival: '',
        departure: '',
        account: '',
        segment: '',
        confNumber: '',
        statuses: [] as string[],
        createdByUserId: '',
    });
    const navigateRequestsSubView = (nextSubView: string) => {
        setRequestsSubView((prev) => {
            if (prev !== nextSubView) {
                // Remount only when switching sub-views (preserves in-progress new request on same tab).
                setRequestsNavNonce((n) => n + 1);
            }
            return nextSubView;
        });
        if (nextSubView === 'new_request') {
            setRequestSearchParams((p: any) => {
                const next = { ...(p || {}), subView: 'new_request' };
                delete next.editRequestId;
                return next;
            });
        }
    };

    useEffect(() => {
        if (canMutateOperational(currentUser)) return;
        if (requestsSubView !== 'new_request') return;
        setRequestsSubView('list');
        setRequestSearchParams((p: any) => {
            const next = { ...p, subView: 'list' };
            delete next.editRequestId;
            return next;
        });
        setRequestsNavNonce((n) => n + 1);
    }, [currentUser, requestsSubView]);

    // New Event Modal State
    const [showNewEventModal, setShowNewEventModal] = useState(false);
    const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
    const [eventModalSource, setEventModalSource] = useState<'calendar' | 'events_page'>('calendar');

    // Date Picker State
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [customDates, setCustomDates] = useState(() => getCurrentYearRange());
    const [crmSalesPeriod, setCrmSalesPeriod] = useState<CrmSalesPeriod>(() => {
        const d = new Date();
        return {
            mode: 'month',
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            quarter: null,
        };
    });
    const [crmCreatedByFilterId, setCrmCreatedByFilterId] = useState('');
    const [crmAddCallNonce, setCrmAddCallNonce] = useState(0);

    /** Accounts: which account profile is open (non-null → show performance picker in shell header). */
    const [accountsProfileLeadKey, setAccountsProfileLeadKey] = useState<string | null>(null);
    const [accountShellPerfRange, setAccountShellPerfRange] = useState(() => getDefaultAccountPerformanceRange());
    const [accountShellPerfDraftFrom, setAccountShellPerfDraftFrom] = useState(() => getDefaultAccountPerformanceRange().from);
    const [accountShellPerfDraftTo, setAccountShellPerfDraftTo] = useState(() => getDefaultAccountPerformanceRange().to);
    const [showAccountShellPerfPicker, setShowAccountShellPerfPicker] = useState(false);

    const handleAccountProfileShellState = useCallback((next: { open: boolean; leadKey: string | null }) => {
        setAccountsProfileLeadKey(next.leadKey);
    }, []);

    // Events Calendar State
    const [eventsCalendarView, setEventsCalendarView] = useState('Month');
    const [eventsCalendarDate, setEventsCalendarDate] = useState(new Date(2026, 0, 1)); // Jan 2026
    const [pendingRequestType, setPendingRequestType] = useState<string | null>(null);
    const [showEventsRequestModal, setShowEventsRequestModal] = useState(false);
    const [eventsEmbeddedRequestType, setEventsEmbeddedRequestType] = useState<'event' | 'event_rooms' | null>(null);
    const [showEventTypeMenu, setShowEventTypeMenu] = useState(false);
    const [eventsModalSearchParams, setEventsModalSearchParams] = useState<Record<string, unknown>>({});
    const [pendingCrmAction, setPendingCrmAction] = useState<'add_call' | null>(null);
    const [showSalesCallModal, setShowSalesCallModal] = useState(false);
    const [showAddAccountModal, setShowAddAccountModal] = useState(false);

    const skipNextAccountsSync = useRef(false);
    const accountsHydratedForPropertyId = useRef<string | null>(null);
    const skipNextTasksSync = useRef(false);
    const tasksHydratedForPropertyId = useRef<string | null>(null);
    const skipNextCrmPersist = useRef(false);
    const crmHydratedForPropertyId = useRef<string | null>(null);
    const crmServerCountsRef = useRef({ salesCalls: 0, pipeline: 0 });
    const crmPersistEnabledRef = useRef(false);
    const requestsLoadPropertyRef = useRef<string | null>(null);
    const financialsLoadPropertyRef = useRef<string | null>(null);
    const promotionsLoadPropertyRef = useRef<string | null>(null);

    const [accounts, setAccounts] = useState<any[]>([]);
    // Per-entity live signals: any WebSocket broadcast for an entity bumps its
    // counter, and the owning loader effect refetches. This mirrors the
    // dashboard/requests pattern and is loop-safe (the loader sets the
    // sync-skip guard so the refetch never re-POSTs and re-broadcasts).
    const [accountsLiveVersion, setAccountsLiveVersion] = useState(0);
    const [promotionsLiveVersion, setPromotionsLiveVersion] = useState(0);
    const [tasksLiveVersion, setTasksLiveVersion] = useState(0);
    const [financialsLiveVersion, setFinancialsLiveVersion] = useState(0);
    const [taxesLiveVersion, setTaxesLiveVersion] = useState(0);
    const [crmLiveVersion, setCrmLiveVersion] = useState(0);
    const [feedLiveVersion, setFeedLiveVersion] = useState(0);
    const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
    const activePropertyIdRef = useRef<string | undefined>(undefined);

    const refreshPresence = useCallback(async () => {
        const pid = activePropertyIdRef.current;
        if (!pid) {
            setOnlineUsers([]);
            return;
        }
        try {
            const res = await fetch(apiUrl(`/api/presence?property_id=${encodeURIComponent(pid)}`), { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setOnlineUsers(Array.isArray(data) ? data : []);
            }
        } catch {
            /* ignore */
        }
    }, []);

    const fetchAccountsForProperty = useCallback(async (propertyId: string): Promise<any[]> => {
        try {
            const res = await fetch(apiUrl(`/api/accounts?propertyId=${encodeURIComponent(propertyId)}`));
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }, []);


    const [crmState, setCrmState] = useState<CrmStatePayload>(() => defaultCrmState());
    const crmLeads = useMemo(() => crmStateToLegacyLeads(crmState), [crmState]);

    const setCrmLeads = useCallback((updater: React.SetStateAction<Record<string, any[]>>) => {
        setCrmState((prev) => {
            const current = crmStateToLegacyLeads(prev);
            const nextLegacy = typeof updater === 'function' ? updater(current) : updater;
            return migrateLegacyLeads(nextLegacy);
        });
    }, []);

    const [pendingPipelineLink, setPendingPipelineLink] = useState<PipelineLinkExtras & {
        accountId: string;
        periodMonth: string;
    } | null>(null);
    const [pendingRequestContactFromCall, setPendingRequestContactFromCall] = useState<{
        name: string;
        contactId: string;
    } | null>(null);
    const [pendingAgreementPipelineLink, setPendingAgreementPipelineLink] = useState<{
        accountId: string;
        periodMonth: string;
        extras?: PipelineLinkExtras;
    } | null>(null);

    const crmRequestRevenue = useCallback(
        (req: any) => sumRequestOperationalRevenueExTaxInRange(req, '1900-01-01', '2100-12-31'),
        []
    );

    const syncPipelineFromRequest = useCallback(
        (request: any) => {
            if (!request?.id) return;
            setCrmState((prev) => ({
                ...prev,
                pipeline: updatePipelineForLinkedRequest(prev.pipeline, request, crmRequestRevenue),
            }));
        },
        [crmRequestRevenue]
    );

    const handleCrmRequestSaved = useCallback(
        (request: any) => {
            if (!request?.id) return;
            setCrmState((prev) => {
                let pipeline = prev.pipeline;
                if (pendingPipelineLink) {
                    pipeline = linkRequestToMonthlyPipelineCard(
                        pipeline,
                        pendingPipelineLink.accountId,
                        pendingPipelineLink.periodMonth,
                        request,
                        crmRequestRevenue,
                        pendingPipelineLink
                    );
                } else {
                    pipeline = updatePipelineForLinkedRequest(pipeline, request, crmRequestRevenue);
                }
                return { ...prev, pipeline };
            });
            setPendingPipelineLink(null);
            setPendingRequestContactFromCall(null);
        },
        [pendingPipelineLink, crmRequestRevenue]
    );

    const handleCrmRequestDeleted = useCallback((requestId: string) => {
        const rid = String(requestId || '').trim();
        if (!rid) return;
        setSharedRequests((prev) => prev.filter((r: any) => String(r.id) !== rid));
        setCrmState((prev) => ({
            ...prev,
            pipeline: clearPipelineLinkForDeletedRequest(prev.pipeline, rid),
        }));
    }, []);

    const handleSalesCallSave = (callData: any) => {
        const viol = collectSalesCallFormViolations(activeProperty?.id, callData, activeProperty);
        if (viol.length) {
            window.alert(viol.join('\n'));
            return;
        }
        setShowSalesCallModal(false);
    };

    const handleCreateAccount = () => {
        // Temporarily close sales call modal if open, or manage z-index
        // For simplicity, we can stack them or close one. Let's stack them (open on top).
        setShowAddAccountModal(true);
    };

    const handleSaveAccount = (accountData: any) => {
        if (!accountData?.name) return;
        const u = currentUser?.name || currentUser?.username || currentUser?.email || 'User';
        const act = {
            id: `acct-${Date.now()}`,
            at: new Date().toISOString(),
            title: 'Account created',
            body: 'Account created in the system.',
            user: u,
        };
        setAccounts((prev: any[]) => [
            {
                id: `A${Date.now()}`,
                ...accountData,
                propertyId: accountData.propertyId || activeProperty?.id || 'P-GLOBAL',
                createdByUserId: resolveUserAttributionId(currentUser) || undefined,
                accountOwnerName: u,
                activities: [...(accountData.activities || []), act],
            },
            ...prev,
        ]);
        setShowAddAccountModal(false);
    };

    // Filter Logic — Events & Catering: default to current calendar year until the user changes the range
    const defaultEventsYearRange = () => {
        const y = new Date().getFullYear();
        return { start: `${y}-01-01`, end: `${y}-12-31` };
    };
    const [eventsFilterRange, setEventsFilterRange] = useState(defaultEventsYearRange);
    const [showEventsDatePicker, setShowEventsDatePicker] = useState(false);

    // Task Management State
    const [tasks, setTasks] = useState<any[]>([]);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [editingTask, setEditingTask] = useState<any>(null);
    const [taskFormData, setTaskFormData] = useState<{
        task: string;
        client: string;
        date: string;
        priority: string;
        assignees: TaskAssigneeForm[];
        description: string;
        category: string;
        star: boolean;
    }>({
        task: '',
        client: '',
        date: '',
        priority: 'Medium',
        assignees: [],
        description: '',
        category: 'Follow-up',
        star: false,
    });
    const [taskAssigneePick, setTaskAssigneePick] = useState('');

    const [userDropdownOpen, setUserDropdownOpen] = useState(false);
    const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);
    const [alertDetailRequest, setAlertDetailRequest] = useState<any | null>(null);
    const [alertDayKey, setAlertDayKey] = useState(() => localDateKey(new Date()));
    const [dismissMap, setDismissMap] = useState<Record<string, string>>({});
    const [properties, setProperties] = useState<any[]>([]);
    const [activeProperty, setActiveProperty] = useState<any>(null);
    /** Per-property tax config from `/api/taxes` (Reports, dashboard-caliber with-tax figures). */
    const [propertyTaxes, setPropertyTaxes] = useState<any[]>([]);

    useEffect(() => {
        activePropertyIdRef.current = activeProperty?.id ? String(activeProperty.id) : undefined;
        if (isAuthenticated) void refreshPresence();
    }, [activeProperty?.id, isAuthenticated, refreshPresence]);

    const [systemUsers, setSystemUsers] = useState<any[]>([]);
    // Points at terminateSessionAndShowLogin (declared below) so callbacks defined
    // earlier can trigger logout without a forward reference.
    const terminateSessionRef = useRef<() => void>(() => {});

    const refreshSystemUsers = useCallback(() => {
        // Landing / login are unauthenticated — do not hit /api/users or a 401 will
        // call terminateSessionAndShowLogin and yank the user onto the login screen.
        if (!isAuthenticated) return;
        fetch(apiUrl('/api/users'))
            .then((res) => {
                // Session expired/revoked while the app was open -> drop to login
                // instead of silently showing empty data.
                if (res.status === 401 || res.status === 403) {
                    terminateSessionRef.current();
                    return [];
                }
                return res.ok ? res.json() : [];
            })
            .then((data) => {
                if (Array.isArray(data)) setSystemUsers(data);
            })
            .catch(() => {});
    }, [isAuthenticated]);

    const terminateSessionAndShowLogin = useCallback(() => {
        setCurrentUser(null);
        setIsAuthenticated(false);
        setShowLandingPreview(false);
        setShowLoginPage(true);
        setCurrentView('dashboard');
    }, [setCurrentView]);

    useEffect(() => {
        terminateSessionRef.current = terminateSessionAndShowLogin;
    }, [terminateSessionAndShowLogin]);

    // Validate a persisted (localStorage) session against the server cookie once
    // on boot. If the cookie is missing/expired, show the login screen rather
    // than a logged-in-looking UI full of empty data.
    const sessionValidatedRef = useRef(false);
    useEffect(() => {
        if (sessionValidatedRef.current || !isAuthenticated) return;
        sessionValidatedRef.current = true;
        fetch(apiUrl('/api/auth/me'))
            .then((res) => {
                if (res.status === 401 || res.status === 403) terminateSessionAndShowLogin();
            })
            .catch(() => {
                /* network hiccup: keep the optimistic session, don't force logout */
            });
    }, [isAuthenticated, terminateSessionAndShowLogin]);

    useEffect(() => {
        refreshSystemUsers();
    }, [refreshSystemUsers]);

    useEffect(() => {
        const onFocus = () => refreshSystemUsers();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [refreshSystemUsers]);

    useEffect(() => {
        const myId = currentUser?.id != null ? String(currentUser.id) : null;
        if (!myId) return;
        const onStorage = (e: StorageEvent) => {
            if (e.key !== 'as_force_relogin' || !e.newValue) return;
            try {
                const j = JSON.parse(e.newValue) as { userId?: string };
                if (String(j.userId) === myId) {
                    terminateSessionAndShowLogin();
                }
            } catch {
                /* ignore */
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [currentUser?.id, terminateSessionAndShowLogin]);

    /** Keep session user aligned with server (permissions, role) after login or staff directory refresh. */
    useEffect(() => {
        if (!currentUser?.id || !Array.isArray(systemUsers) || systemUsers.length === 0) return;
        const fresh = systemUsers.find((u: any) => String(u?.id) === String(currentUser.id));
        if (!fresh) return;
        const serverV = Number((fresh as any).sessionVersion ?? 0);
        const localV = Number((currentUser as any).sessionVersion ?? 0);
        if (serverV !== localV) {
            terminateSessionAndShowLogin();
            return;
        }
        const keys = ['role', 'permissionGrants', 'permissionRevokes', 'propertyId', 'name', 'email', 'username', 'status'] as const;
        const patch: Record<string, unknown> = {};
        for (const k of keys) {
            const a = JSON.stringify((currentUser as any)[k] ?? null);
            const b = JSON.stringify((fresh as any)[k] ?? null);
            if (a !== b) patch[k] = (fresh as any)[k];
        }
        if (Object.keys(patch).length > 0) {
            setCurrentUser((prev: any) => (prev ? { ...prev, ...patch } : prev));
        }
    }, [systemUsers, currentUser?.id, currentUser?.sessionVersion, terminateSessionAndShowLogin]);

    const taskAssignableUsers = useMemo(() => {
        const ap = activeProperty;
        const label = (u: any) => String(u?.name ?? u?.username ?? '').trim() || String(u?.id ?? '');
        const row = (u: any) => ({ id: String(u.id ?? u.username ?? label(u)), name: label(u) });

        if (!ap?.id) {
            return currentUser?.name ? [row({ id: currentUser.id, name: currentUser.name })] : [];
        }
        // Match Settings "Staff Management": users on this property are those in assignedUserIds
        // OR whose primary propertyId matches. Previously we only used propertyId when assignedUserIds
        // was empty, so a partial assignedUserIds list (e.g. one admin) hid everyone else.
        const assignedIds = new Set((ap.assignedUserIds || []).map((x: any) => String(x)));
        const propId = String(ap.id);
        const byUserId = new Map<string, { id: string; name: string }>();

        for (const u of systemUsers || []) {
            if (u?.id == null && u?.username == null) continue;
            const uid = String(u.id ?? '');
            const onProperty =
                (uid && assignedIds.has(uid)) || String(u.propertyId ?? '') === propId;
            if (!onProperty) continue;
            const r = row(u);
            if (!r.name) continue;
            if (!byUserId.has(r.id)) byUserId.set(r.id, r);
        }

        const curName = currentUser?.name ? String(currentUser.name).trim() : '';
        const curId = String(currentUser?.id ?? '');
        if (curName && curId && !byUserId.has(curId)) {
            byUserId.set(curId, { id: curId, name: curName });
        }

        const merged = [...byUserId.values()].sort((a, b) => a.name.localeCompare(b.name));
        return merged.length ? merged : curName ? [{ id: curId || String(currentUser.id), name: curName }] : [];
    }, [activeProperty, systemUsers, currentUser]);

    const resolveContactForAlert = useCallback(
        (req: any) => {
            const acc = getAccountForRequest(req, accounts);
            if (!acc) return String(req?.account || req?.accountName || '—').trim() || '—';
            const list = (Array.isArray(acc.contacts) ? acc.contacts : []).filter(
                (c: any) => contactDisplayName(c) || c?.email || c?.phone,
            );
            if (list.length) return contactDisplayName(list[0]) || '—';
            return String(acc?.name || req?.account || '—').trim() || '—';
        },
        [accounts],
    );

    const resolveCreatorForAlert = useCallback(
        (req: any) => {
            const id = req?.createdByUserId;
            if (id == null || id === '') return 'Unknown';
            const u = (systemUsers || []).find((x: any) => String(x.id) === String(id));
            return String(u?.name || u?.username || '').trim() || 'Unknown';
        },
        [systemUsers],
    );

    const alertUserKey = useMemo(
        () => String(currentUser?.id ?? currentUser?.username ?? currentUser?.email ?? 'anon').trim() || 'anon',
        [currentUser?.id, currentUser?.username, currentUser?.email],
    );

    useEffect(() => {
        const id = setInterval(() => {
            const k = localDateKey(new Date());
            setAlertDayKey((prev) => (prev !== k ? k : prev));
        }, 45000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const pid = activeProperty?.id;
        const uid = alertUserKey;
        if (!pid) {
            setDismissMap({});
            return;
        }
        setDismissMap(loadDismissMap(pid, uid));
    }, [activeProperty?.id, alertUserKey, alertDayKey]);

    useEffect(() => {
        const pid = activeProperty?.id;
        accountsHydratedForPropertyId.current = null;
        if (!pid) {
            setAccounts([]);
            return;
        }
        // Avoid keeping another property's accounts in memory while the new list loads (reduces bad sync payloads).
        setAccounts([]);
        let cancelled = false;
        fetchAccountsForProperty(String(pid)).then((list) => {
            if (cancelled) return;
            skipNextAccountsSync.current = true;
            accountsHydratedForPropertyId.current = String(pid);
            setAccounts(list);
        });
        return () => {
            cancelled = true;
        };
    }, [activeProperty?.id, fetchAccountsForProperty]);

    useEffect(() => {
        const pid = activeProperty?.id;
        if (!pid) return;
        if (accountsHydratedForPropertyId.current !== String(pid)) return;
        if (skipNextAccountsSync.current) {
            skipNextAccountsSync.current = false;
            return;
        }
        const t = setTimeout(() => {
            fetch(apiUrl('/api/accounts/sync'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: String(pid), accounts }),
            }).catch((e) => console.warn('[AccountSync] Failed:', e));
        }, 300);
        return () => clearTimeout(t);
    }, [accounts, activeProperty?.id]);

    // Live refetch for accounts on WebSocket signal. Does NOT clear the list
    // first (no flicker) and sets skipNextAccountsSync so the incoming data is
    // not re-POSTed back to the server (prevents cross-client sync ping-pong).
    useEffect(() => {
        if (accountsLiveVersion === 0) return;
        const pid = activeProperty?.id;
        if (!pid) return;
        let cancelled = false;
        fetchAccountsForProperty(String(pid)).then((list) => {
            if (cancelled) return;
            skipNextAccountsSync.current = true;
            accountsHydratedForPropertyId.current = String(pid);
            setAccounts(list);
        });
        return () => {
            cancelled = true;
        };
    }, [accountsLiveVersion, activeProperty?.id, fetchAccountsForProperty]);

    useEffect(() => {
        const pid = activeProperty?.id;
        tasksHydratedForPropertyId.current = null;
        if (!pid) {
            setTasks([]);
            return;
        }
        let cancelled = false;
        fetch(apiUrl(`/api/tasks?propertyId=${encodeURIComponent(String(pid))}`))
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (cancelled) return;
                skipNextTasksSync.current = true;
                tasksHydratedForPropertyId.current = String(pid);
                setTasks(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                if (cancelled) return;
                skipNextTasksSync.current = true;
                tasksHydratedForPropertyId.current = String(pid);
                setTasks([]);
            });
        return () => {
            cancelled = true;
        };
    }, [activeProperty?.id, tasksLiveVersion]);

    useEffect(() => {
        const pid = activeProperty?.id;
        if (!pid) return;
        if (tasksHydratedForPropertyId.current !== String(pid)) return;
        if (skipNextTasksSync.current) {
            skipNextTasksSync.current = false;
            return;
        }
        const t = setTimeout(() => {
            fetch(apiUrl('/api/tasks/sync'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: String(pid), tasks }),
            }).catch((e) => console.warn('[TaskSync] Failed:', e));
        }, 300);
        return () => clearTimeout(t);
    }, [tasks, activeProperty?.id]);

    const [sharedRequests, setSharedRequests] = useState<any[]>([]);
    // Bumped on every live request event so list views (RequestsManager) can
    // refetch authoritative data from the server (refetch-on-notify pattern).
    const [requestsLiveVersion, setRequestsLiveVersion] = useState(0);
    // Bumped when a bulk request change (e.g. account rename cascade) requires
    // the dashboard's shared requests to be refetched from the server.
    const [sharedRequestsLiveVersion, setSharedRequestsLiveVersion] = useState(0);

    // Coalesces bursts of live signals into a single refetch. A flood of N
    // broadcasts (e.g. a bulk sync emitting one event per row) collapses into one
    // version bump per entity, preventing refetch storms.
    const liveBumpTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const debouncedBump = useCallback(
        (key: string, setter: React.Dispatch<React.SetStateAction<number>>) => {
            const timers = liveBumpTimersRef.current;
            if (timers[key]) clearTimeout(timers[key]);
            timers[key] = setTimeout(() => {
                delete timers[key];
                setter((v) => v + 1);
            }, 250);
        },
        []
    );

    // Real-time live updates via WebSocket (placed after state declarations to avoid TDZ)
    const handleLiveUpdate = useCallback((msg: WebSocketMessage) => {
        const entity = String(msg?.entity || '');
        if (entity === 'request') {
            // Bulk change signal (e.g. account rename): refetch lists once, do not merge.
            if (msg.type === 'refresh') {
                debouncedBump('request', setRequestsLiveVersion);
                debouncedBump('sharedRequests', setSharedRequestsLiveVersion);
                return;
            }
            // Notify list views to refetch (covers create/update/delete uniformly).
            debouncedBump('request', setRequestsLiveVersion);
            if (msg.type === 'created' || msg.type === 'updated') {
                setSharedRequests((prev) => {
                    const idx = prev.findIndex((r: any) => String(r.id) === String(msg.data.id));
                    if (idx >= 0) {
                        const updated = [...prev];
                        updated[idx] = msg.data;
                        return updated;
                    } else {
                        return [...prev, msg.data];
                    }
                });
                // Also sync CRM pipeline
                setCrmState((prev) => ({
                    ...prev,
                    pipeline: syncAllPipelineCardsFromRequests(prev.pipeline, [msg.data], crmRequestRevenue),
                }));
            } else if (msg.type === 'deleted') {
                setSharedRequests((prev) => prev.filter((r: any) => String(r.id) !== String(msg.data.id)));
                setCrmState((prev) => ({
                    ...prev,
                    pipeline: clearPipelineLinkForDeletedRequest(prev.pipeline, String(msg.data.id)),
                }));
            }
            return;
        }

        // All other entities use the loop-safe, debounced refetch-on-signal pattern.
        switch (entity) {
            case 'account':
                debouncedBump('account', setAccountsLiveVersion);
                break;
            case 'promotions':
                debouncedBump('promotions', setPromotionsLiveVersion);
                break;
            case 'tasks':
                debouncedBump('tasks', setTasksLiveVersion);
                break;
            case 'financials':
                debouncedBump('financials', setFinancialsLiveVersion);
                break;
            case 'taxes':
                debouncedBump('taxes', setTaxesLiveVersion);
                break;
            case 'crm_state':
                debouncedBump('crm_state', setCrmLiveVersion);
                break;
            case 'feed':
                debouncedBump('feed', setFeedLiveVersion);
                break;
            case 'chat':
                dispatchChatWs(msg);
                break;
            case 'presence':
                if (!msg.data?.propertyId || String(msg.data.propertyId) === String(activePropertyIdRef.current || '')) {
                    void refreshPresence();
                }
                break;
            default:
                break;
        }
    }, [debouncedBump, crmRequestRevenue, syncAllPipelineCardsFromRequests, clearPipelineLinkForDeletedRequest, refreshPresence]);

    // Connect to WebSocket only when authenticated (avoids 4401 on login page
    // which previously prevented reconnect after successful login).
    useWebSocket(handleLiveUpdate, isAuthenticated);

    const [promotions, setPromotions] = useState<any[]>([]);
    const [propertyFinancialKpis, setPropertyFinancialKpis] = useState<any[]>([]);
    const [pendingOpenRequestId, setPendingOpenRequestId] = useState<string | null>(null);
    /** Headless RequestsManager on Events page for in-place OPTS (see eventsOptsBootstrapId). */
    const [eventsOptsHostMounted, setEventsOptsHostMounted] = useState(false);
    const [eventsOptsBootstrapId, setEventsOptsBootstrapId] = useState<string | null>(null);
    const [eventsOptsSearchParams, setEventsOptsSearchParams] = useState({
        type: 'all',
        arrival: '',
        departure: '',
        account: '',
        segment: '',
        confNumber: '',
        status: 'all',
    });
    const [pendingCrmAccountId, setPendingCrmAccountId] = useState<string | null>(null);
    const [pendingOpenCrmLeadId, setPendingOpenCrmLeadId] = useState<string | null>(null);
    const [pendingContractsAccountId, setPendingContractsAccountId] = useState<string | null>(null);
    const [pendingRequestAccountId, setPendingRequestAccountId] = useState<string | null>(null);
    const [pendingAgreementAfterRequestAccountId, setPendingAgreementAfterRequestAccountId] = useState<string | null>(null);

    useEffect(() => {
        if (currentView !== 'events') {
            setEventsOptsHostMounted(false);
            setEventsOptsBootstrapId(null);
        }
    }, [currentView]);

    const refreshSharedRequests = async () => {
        const pid = activeProperty?.id || '';
        requestsLoadPropertyRef.current = pid;
        try {
            const url = pid
                ? apiUrl(`/api/requests?propertyId=${encodeURIComponent(pid)}`)
                : apiUrl('/api/requests');
            const data = await refreshRequestsWithDefiniteToActual(url, {
                readOnly: !canMutateOperational(currentUser),
                requestLogUser: String(currentUser?.name || 'System').trim() || 'System',
            });
            if (requestsLoadPropertyRef.current !== pid) return;
            if (Array.isArray(data)) {
                setSharedRequests(data);
                setCrmState((prev) => ({
                    ...prev,
                    pipeline: syncAllPipelineCardsFromRequests(prev.pipeline, data, crmRequestRevenue),
                }));
            }
        } catch (e) {
            console.error('refreshSharedRequests', e);
        }
    };

    const patchRequestStatus = useCallback(
        async (requestId: string, status: string) => {
            const existing = sharedRequests.find((r: any) => String(r.id) === String(requestId));
            if (!existing) return;
            const logUser =
                String(currentUser?.name || currentUser?.username || currentUser?.email || 'User').trim() ||
                'User';
            const previousStatus = existing.status;
            const optimistic = {
                ...existing,
                status,
                logs: [
                    {
                        date: new Date().toISOString(),
                        user: logUser,
                        action: `Status changed to ${status}`,
                    },
                    ...(Array.isArray(existing.logs) ? existing.logs : []),
                ],
            };

            setSharedRequests((prev) =>
                prev.map((r: any) => (String(r.id) === String(requestId) ? optimistic : r))
            );
            syncPipelineFromRequest(optimistic);

            try {
                const res = await fetch(apiUrl('/api/requests'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(optimistic),
                });
                if (res.ok) {
                    await refreshSharedRequests();
                } else {
                    setSharedRequests((prev) =>
                        prev.map((r: any) =>
                            String(r.id) === String(requestId) ? { ...existing, status: previousStatus } : r
                        )
                    );
                    syncPipelineFromRequest(existing);
                }
            } catch (e) {
                console.error('patchRequestStatus', e);
                setSharedRequests((prev) =>
                    prev.map((r: any) =>
                        String(r.id) === String(requestId) ? { ...existing, status: previousStatus } : r
                    )
                );
                syncPipelineFromRequest(existing);
            }
        },
        [sharedRequests, syncPipelineFromRequest, currentUser]
    );

    useEffect(() => {
        if (!activeProperty?.id) return;
        refreshSharedRequests();
    }, [activeProperty?.id, sharedRequestsLiveVersion]);

    useEffect(() => {
        let cancelled = false;
        const pid = String(activeProperty?.id || '').trim();
        if (!pid) {
            setPromotions([]);
            return;
        }
        promotionsLoadPropertyRef.current = pid;
        fetch(apiUrl(`/api/promotions?propertyId=${encodeURIComponent(pid)}`))
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (cancelled || promotionsLoadPropertyRef.current !== pid) return;
                setPromotions(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                if (!cancelled) setPromotions([]);
            });
        return () => {
            cancelled = true;
        };
    }, [activeProperty?.id, promotionsLiveVersion]);

    useEffect(() => {
        let cancelled = false;
        const pid = activeProperty?.id;
        if (!pid) {
            setPropertyFinancialKpis([]);
            return;
        }
        const pidStr = String(pid);
        financialsLoadPropertyRef.current = pidStr;
        fetch(apiUrl(`/api/financials?propertyId=${encodeURIComponent(pidStr)}`), { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (cancelled || financialsLoadPropertyRef.current !== pidStr) return;
                if (Array.isArray(data)) {
                    setPropertyFinancialKpis(data);
                } else {
                    setPropertyFinancialKpis([]);
                }
            })
            .catch(() => {
                if (!cancelled) setPropertyFinancialKpis([]);
            });
        return () => {
            cancelled = true;
        };
    }, [activeProperty?.id, currentView, financialsLiveVersion]);

    useEffect(() => {
        let cancelled = false;
        const pid = activeProperty?.id;
        if (!pid) {
            setPropertyTaxes([]);
            return;
        }
        fetch(apiUrl(`/api/taxes?propertyId=${encodeURIComponent(pid)}`))
            .then((r) => r.json())
            .then((d) => {
                if (cancelled) return;
                if (Array.isArray(d)) setPropertyTaxes(d);
            })
            .catch(() => {
                if (!cancelled) setPropertyTaxes([]);
            });
        return () => {
            cancelled = true;
        };
    }, [activeProperty?.id, taxesLiveVersion]);

    useEffect(() => {
        let cancelled = false;
        const pid = activeProperty?.id;
        crmHydratedForPropertyId.current = null;
        crmPersistEnabledRef.current = false;
        if (!pid) {
            setCrmState(defaultCrmState());
            return;
        }
        const pidStr = String(pid);
        skipNextCrmPersist.current = true;
        const applyCrmPayload = (payload: any, accs: any[]) => {
            const rawPipeCount = PIPELINE_STAGE_KEYS.reduce((n, k) => {
                const arr = payload?.pipeline?.[k];
                return n + (Array.isArray(arr) ? arr.length : 0);
            }, 0);
            crmServerCountsRef.current = {
                salesCalls: Array.isArray(payload?.salesCalls) ? payload.salesCalls.length : 0,
                pipeline: rawPipeCount,
            };
            const merged = mergeCrmStateFromApi(payload);
            const pipeCount = PIPELINE_STAGE_KEYS.reduce(
                (n, k) => n + (merged.pipeline[k]?.length || 0),
                0
            );
            const scoped: CrmStatePayload = {
                salesCalls: filterSalesCallsForProperty(merged.salesCalls, pidStr, accs),
                pipeline: filterPipelineForProperty(merged.pipeline, pidStr, accs),
            };
            crmHydratedForPropertyId.current = pidStr;
            setCrmState(scoped);
            window.setTimeout(() => {
                crmPersistEnabledRef.current = true;
            }, 0);
        };
        fetch(apiUrl(`/api/crm-state?propertyId=${encodeURIComponent(pidStr)}`))
            .then((res) => (res.ok ? res.json() : null))
            .then(async (data) => {
                if (cancelled) return;
                let payload = data;
                const pre = mergeCrmStateFromApi(data || {});
                const preTotal =
                    pre.salesCalls.length +
                    PIPELINE_STAGE_KEYS.reduce((n, k) => n + (pre.pipeline[k]?.length || 0), 0);
                if (preTotal === 0) {
                    try {
                        const rec = await fetch(
                            apiUrl(`/api/crm-state/recover?propertyId=${encodeURIComponent(pidStr)}`),
                            { method: 'POST' }
                        );
                        if (rec.ok) payload = await rec.json();
                    } catch { /* ignore */ }
                }
                const accs = await fetchAccountsForProperty(pidStr);
                if (cancelled) return;
                applyCrmPayload(payload, accs);
            })
            .catch(() => {
                if (cancelled) return;
                try {
                    const raw = localStorage.getItem(crmLocalStorageKey(pidStr));
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed && typeof parsed === 'object') {
                            const merged = mergeCrmStateFromApi(parsed);
                            fetchAccountsForProperty(pidStr).then((accs) => {
                                if (cancelled) return;
                                applyCrmPayload(parsed, accs);
                            });
                            return;
                        }
                    }
                } catch { /* ignore */ }
                crmHydratedForPropertyId.current = pidStr;
                setCrmState(defaultCrmState());
            });
        return () => {
            cancelled = true;
        };
    }, [activeProperty?.id, fetchAccountsForProperty, crmLiveVersion]);

    useEffect(() => {
        const pid = activeProperty?.id;
        if (!pid) return;
        if (skipNextCrmPersist.current) {
            skipNextCrmPersist.current = false;
            return;
        }
        try {
            localStorage.setItem(
                crmLocalStorageKey(String(pid)),
                JSON.stringify({ salesCalls: crmState.salesCalls, pipeline: crmState.pipeline })
            );
        } catch { /* ignore */ }
    }, [crmState, activeProperty?.id]);

    useEffect(() => {
        const pid = activeProperty?.id;
        if (!pid || crmHydratedForPropertyId.current !== String(pid)) return;
        if (!crmPersistEnabledRef.current) return;
        const clientPipe = PIPELINE_STAGE_KEYS.reduce(
            (n, k) => n + (crmState.pipeline[k]?.length || 0),
            0
        );
        const clientTotal = crmState.salesCalls.length + clientPipe;
        const serverTotal = crmServerCountsRef.current.salesCalls + crmServerCountsRef.current.pipeline;
        if (clientTotal === 0 && serverTotal > 0) return;
        const t = setTimeout(() => {
            fetch(apiUrl('/api/crm-state'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: String(pid),
                    salesCalls: crmState.salesCalls,
                    pipeline: crmState.pipeline,
                }),
            })
                .then((res) => {
                    if (res.ok) {
                        crmServerCountsRef.current = {
                            salesCalls: crmState.salesCalls.length,
                            pipeline: clientPipe,
                        };
                    }
                })
                .catch(() => {});
        }, 1200);
        return () => clearTimeout(t);
    }, [crmState, activeProperty?.id]);

    const canAccessProperty = useCallback(
        (prop: any) =>
            !!prop &&
            (String(prop.id) === String(currentUser?.propertyId ?? '') ||
                (Array.isArray(prop.assignedUserIds) &&
                    prop.assignedUserIds.some((id: any) => String(id) === String(currentUser?.id)))),
        [currentUser?.id, currentUser?.propertyId]
    );

    // Initial load properties globally for user
    useEffect(() => {
        if (!currentUser) return;
        fetch(apiUrl('/api/properties'))
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setProperties(data);
                    const allowed = data.filter((p: any) => canAccessProperty(p));
                    const savedPropertyId =
                        localStorage.getItem(getActivePropertyStorageKey(currentUser)) ||
                        localStorage.getItem(ACTIVE_PROPERTY_STORAGE_KEY);
                    const savedProp = savedPropertyId
                        ? allowed.find((p: any) => String(p.id) === String(savedPropertyId))
                        : null;
                    const userProp = allowed.find((p: any) => String(p.id) === String(currentUser?.propertyId ?? ''));
                    if (savedProp) setActiveProperty(savedProp);
                    else if (userProp) setActiveProperty(userProp);
                    else if (allowed.length > 0) setActiveProperty(allowed[0]);
                }
            })
            .catch(err => console.error("Error fetching properties globally:", err));
    }, [currentUser, canAccessProperty]);

    useEffect(() => {
        if (!currentUser) return;
        const pid = activeProperty?.id;
        if (!pid) return;
        localStorage.setItem(getActivePropertyStorageKey(currentUser), String(pid));
        localStorage.setItem(ACTIVE_PROPERTY_STORAGE_KEY, String(pid));
    }, [activeProperty?.id, currentUser]);

    const [taxonomyRefresh, setTaxonomyRefresh] = useState(0);
    useEffect(() => {
        const mergeIntoProperty = (propertyId: string, patch: Record<string, unknown>) => {
            setProperties((prev) =>
                prev.map((p) => (String(p.id) === String(propertyId) ? { ...p, ...patch } : p))
            );
            setActiveProperty((prev) =>
                prev && String(prev.id) === String(propertyId) ? { ...prev, ...patch } : prev
            );
        };
        const onTax = (e: Event) => {
            const d = (e as CustomEvent<{ propertyId?: string; segments?: string[]; accountTypes?: string[] }>)
                .detail;
            if (!d?.propertyId) return;
            const patch: Record<string, unknown> = {};
            if (Array.isArray(d.segments)) patch.segments = d.segments;
            if (Array.isArray(d.accountTypes)) patch.accountTypes = d.accountTypes;
            if (Object.keys(patch).length) mergeIntoProperty(String(d.propertyId), patch);
            setTaxonomyRefresh((n) => n + 1);
        };
        const onMeals = (e: Event) => {
            const d = (e as CustomEvent<{
                propertyId?: string;
                mealPlans?: unknown[];
                eventPackages?: unknown[];
            }>).detail;
            if (!d?.propertyId) return;
            const patch: Record<string, unknown> = {};
            if (Array.isArray(d.mealPlans)) patch.mealPlans = d.mealPlans;
            if (Array.isArray(d.eventPackages)) patch.eventPackages = d.eventPackages;
            if (Object.keys(patch).length) mergeIntoProperty(String(d.propertyId), patch);
            setTaxonomyRefresh((n) => n + 1);
        };
        const onAlertSettings = (e: Event) => {
            const d = (e as CustomEvent<{ propertyId?: string; alertSettings?: unknown }>).detail;
            if (!d?.propertyId || d.alertSettings == null) return;
            mergeIntoProperty(String(d.propertyId), { alertSettings: d.alertSettings });
        };
        const onCallSettings = (e: Event) => {
            const d = (e as CustomEvent<{ propertyId?: string; callSettings?: unknown }>).detail;
            if (!d?.propertyId || d.callSettings == null) return;
            mergeIntoProperty(String(d.propertyId), { callSettings: d.callSettings });
        };
        const onFormConfigurations = (e: Event) => {
            const d = (e as CustomEvent<{ propertyId?: string; formConfigurations?: unknown }>).detail;
            if (!d?.propertyId || d.formConfigurations == null) return;
            mergeIntoProperty(String(d.propertyId), { formConfigurations: d.formConfigurations });
        };
        const onOccupancyTypes = (e: Event) => {
            const d = (e as CustomEvent<{ propertyId?: string; occupancyTypes?: string[] }>).detail;
            if (!d?.propertyId || !Array.isArray(d.occupancyTypes)) return;
            mergeIntoProperty(String(d.propertyId), { occupancyTypes: d.occupancyTypes });
            setTaxonomyRefresh((n) => n + 1);
        };
        const onPaymentMethods = (e: Event) => {
            const d = (e as CustomEvent<{ propertyId?: string; paymentMethods?: string[] }>).detail;
            if (!d?.propertyId || !Array.isArray(d.paymentMethods)) return;
            mergeIntoProperty(String(d.propertyId), { paymentMethods: d.paymentMethods });
            setTaxonomyRefresh((n) => n + 1);
        };
        window.addEventListener(TAXONOMY_CHANGED_EVENT, onTax);
        window.addEventListener(MEALS_PACKAGES_CHANGED_EVENT, onMeals);
        window.addEventListener(ALERT_SETTINGS_CHANGED_EVENT, onAlertSettings);
        window.addEventListener(CALL_SETTINGS_CHANGED_EVENT, onCallSettings);
        window.addEventListener(FORM_CONFIGURATION_CHANGED_EVENT, onFormConfigurations);
        window.addEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, onOccupancyTypes);
        window.addEventListener(PAYMENT_METHODS_CHANGED_EVENT, onPaymentMethods);
        return () => {
            window.removeEventListener(TAXONOMY_CHANGED_EVENT, onTax);
            window.removeEventListener(MEALS_PACKAGES_CHANGED_EVENT, onMeals);
            window.removeEventListener(ALERT_SETTINGS_CHANGED_EVENT, onAlertSettings);
            window.removeEventListener(CALL_SETTINGS_CHANGED_EVENT, onCallSettings);
            window.removeEventListener(FORM_CONFIGURATION_CHANGED_EVENT, onFormConfigurations);
            window.removeEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, onOccupancyTypes);
            window.removeEventListener(PAYMENT_METHODS_CHANGED_EVENT, onPaymentMethods);
        };
    }, []);

    const propertySegmentLabels = useMemo(
        () => resolveSegmentsForProperty(String(activeProperty?.id || ''), activeProperty),
        [activeProperty, taxonomyRefresh]
    );
    const propertyAccountTypeLabels = useMemo(
        () => resolveAccountTypesForProperty(String(activeProperty?.id || ''), activeProperty),
        [activeProperty, taxonomyRefresh]
    );

    const dashboardCurrentRange = useMemo(() => {
        const anchor = new Date(dashboardNowAnchor);
        if (dashboardPeriodMode === 'custom') {
            const start = parseYmd(customDates.start);
            const end = parseYmd(customDates.end);
            if (!start || !end || start > end) return getCurrentYearRange();
            return { start, end };
        }
        if (dashboardPeriodMode === 'mtd') return getMtdRange(anchor);
        if (dashboardPeriodMode === 'ytd') return getYtdRange(anchor);
        return getCurrentYearRange();
    }, [dashboardPeriodMode, customDates.start, customDates.end, dashboardNowAnchor]);

    const dashboardSegmentChartData = useMemo(() => {
        const pid = activeProperty?.id;
        const reqs = (sharedRequests || []).filter(
            (r: any) =>
                (!pid || !r.propertyId || r.propertyId === pid) &&
                !isDashboardExcludedRequest(r) &&
                requestTouchesOperationalRange(r, dashboardCurrentRange)
        );
        return propertySegmentLabels.map((name) => ({
            name,
            value: reqs.filter((r: any) => String(r.segment || '').trim() === name).length,
        }));
    }, [sharedRequests, activeProperty?.id, propertySegmentLabels, dashboardCurrentRange]);

    const dashboardAccountTypeChartData = useMemo(() => {
        const rows = propertyAccountTypeLabels
            .map((name) => ({
                name,
                value: (accounts || []).filter((a: any) => String(a.type || '').trim() === name).length,
            }))
            .filter((d) => d.value > 0);
        const sum = rows.reduce((s, d) => s + d.value, 0);
        return rows.map((d) => ({
            ...d,
            percent: sum > 0 ? Math.round((d.value / sum) * 100) : 0,
        }));
    }, [accounts, propertyAccountTypeLabels]);

    const dashboardRequestDistributionData = useMemo(() => {
        const tc = ((THEMES as any)[currentThemeId] || (THEMES as any).light).colors;
        const palette = [tc.blue, tc.cyan, tc.purple, tc.orange];
        const pid = activeProperty?.id;
        const reqs = (sharedRequests || []).filter(
            (r: any) =>
                (!pid || !r.propertyId || r.propertyId === pid) &&
                !isDashboardExcludedRequest(r) &&
                requestTouchesOperationalRange(r, dashboardCurrentRange)
        );
        const tallies: Record<'accommodation' | 'event_rooms' | 'series' | 'event', number> = {
            accommodation: 0,
            event_rooms: 0,
            series: 0,
            event: 0,
        };
        for (const r of reqs) {
            const b = bucketRequestDistribution(r.requestType);
            tallies[b] += 1;
        }
        const n = reqs.length;
        return REQUEST_DISTRIBUTION_META.map((meta, i) => ({
            name: meta.label,
            value: tallies[meta.key],
            percent: n ? Math.round((tallies[meta.key] / n) * 100) : 0,
            color: palette[i % palette.length],
        }));
    }, [sharedRequests, activeProperty?.id, currentThemeId, dashboardCurrentRange]);

    const dashboardLyRange = useMemo(
        () => shiftRangeByYears(dashboardCurrentRange, -1),
        [dashboardCurrentRange]
    );

    const scopedRequests = useMemo(() => {
        const pid = activeProperty?.id;
        return (sharedRequests || []).filter((r: any) => !pid || !r.propertyId || r.propertyId === pid);
    }, [sharedRequests, activeProperty?.id]);

    const propertyAlertPrefs = useMemo(
        () => resolveAlertSettingsForProperty(String(activeProperty?.id || ''), activeProperty),
        [activeProperty?.id, activeProperty?.alertSettings],
    );

    const activeAlerts = useMemo(() => {
        const pid = activeProperty?.id;
        if (!pid) return [];
        const inputs = scopedRequests.map((r: any) => ({
            request: r,
            contactName: resolveContactForAlert(r),
            creatorName: resolveCreatorForAlert(r),
        }));
        const raw = computeAllRequestAlerts(inputs, new Date(), propertyAlertPrefs);
        const today = localDateKey(new Date());
        return raw.filter((a) => !isDismissedForDate(dismissMap, a.dismissKey, today));
    }, [
        scopedRequests,
        dismissMap,
        activeProperty?.id,
        propertyAlertPrefs,
        resolveContactForAlert,
        resolveCreatorForAlert,
        alertDayKey,
        alertUserKey,
    ]);

    const canMutateOps = canMutateOperational(currentUser);
    useEffect(() => {
        if (!canMutateOps) return;
        const pid = activeProperty?.id;
        if (!pid) return;
        const settings = resolveAlertSettingsForProperty(String(pid), activeProperty);
        const today = localDateKey(new Date());
        const inputs = scopedRequests.map((r: any) => ({
            request: r,
            contactName: resolveContactForAlert(r),
            creatorName: resolveCreatorForAlert(r),
        }));
        const raw = computeAllRequestAlerts(inputs, new Date(), settings);
        const visible = raw.filter((a) => !isDismissedForDate(dismissMap, a.dismissKey, today));

        setTasks((prev) => {
            const additions: any[] = [];
            for (const a of visible) {
                if (!shouldCreateTaskForAlertKind(settings, a.kind)) continue;
                if (prev.some((t: any) => String(t.alertDismissKey) === String(a.dismissKey))) continue;
                const req = scopedRequests.find((x: any) => String(x.id) === String(a.requestId));
                if (!req) continue;
                const ownerId = req.createdByUserId;
                if (ownerId == null || String(ownerId).trim() === '') continue;
                const u = (systemUsers || []).find((x: any) => String(x.id) === String(ownerId));
                const ownerName = String(u?.name || u?.username || '').trim();
                if (!ownerName) continue;
                const acc = getAccountForRequest(req, accounts);
                const client = String(acc?.name || req?.account || req?.accountName || '—').trim();
                additions.push({
                    id: `T-auto-${String(a.dismissKey).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
                    task: a.title,
                    client,
                    date: a.anchorDate || today,
                    priority: a.urgent ? 'High' : 'Medium',
                    assignees: [{ id: String(ownerId), name: ownerName }],
                    assignedTo: ownerName,
                    description: a.body,
                    category: 'Follow-up',
                    star: Boolean(a.urgent),
                    completed: false,
                    propertyId: String(pid),
                    alertDismissKey: a.dismissKey,
                    alertKind: a.kind,
                });
            }
            if (!additions.length) return prev;
            skipNextTasksSync.current = true;
            return [...additions, ...prev];
        });
    }, [
        canMutateOps,
        activeProperty,
        scopedRequests,
        dismissMap,
        resolveContactForAlert,
        resolveCreatorForAlert,
        systemUsers,
        accounts,
        alertDayKey,
    ]);

    const handleAlertDone = useCallback(
        (alert: RequestAlert) => {
            const pid = activeProperty?.id;
            const uid = alertUserKey;
            if (!pid) return;
            const today = localDateKey(new Date());
            const next = { ...dismissMap, [alert.dismissKey]: today };
            saveDismissMap(pid, uid, next);
            setDismissMap(next);
        },
        [activeProperty?.id, alertUserKey, dismissMap],
    );

    const handleViewAlertRequest = useCallback(
        (alert: RequestAlert) => {
            const r = scopedRequests.find((x: any) => String(x.id) === String(alert.requestId));
            if (r) setAlertDetailRequest(r);
            setAlertsPanelOpen(false);
        },
        [scopedRequests],
    );

    const calendarCrmLeadsFlat = useMemo(() => {
        const flat = flattenCrmLeads(crmLeads);
        const buckets = crmLeads || {};
        const stageById = new Map<string, string>();
        (Object.keys(buckets) as string[]).forEach((sk) => {
            const arr = (buckets as any)[sk];
            if (!Array.isArray(arr)) return;
            arr.forEach((l: any) => {
                if (l?.id != null) stageById.set(String(l.id), sk);
            });
        });
        return flat.map((l: any) => ({
            ...l,
            stage: l.stage || stageById.get(String(l.id)) || 'new',
        }));
    }, [crmLeads]);

    const calendarModalResolvedRequest = useMemo(() => {
        if (!calendarDetailModal || calendarDetailModal.kind !== 'request') return null;
        return (sharedRequests || []).find((r: any) => String(r.id) === String(calendarDetailModal.requestId)) || null;
    }, [calendarDetailModal, sharedRequests]);

    const computeRangeSummary = useCallback((range: { start: string; end: string }) => {
        const statusCounts = KPI_STATUS_ORDER.reduce((acc: Record<string, number>, status) => {
            acc[status] = 0;
            return acc;
        }, {});
        let totalRevenue = 0;
        let paidRevenue = 0;
        let cancelledRevenue = 0;
        /** Non-cancelled requests whose check-in / agenda dates overlap the range (not received date). */
        let requestCount = 0;
        /** Total segment rows in range (series / multi-line = multiple units). */
        let requestUnits = 0;
        const callsCount = flattenCrmLeads(crmLeads).filter((lead: any) => {
            const dt = parseYmd(lead?.lastContact || lead?.date);
            return dt ? isIsoInRange(dt, range) : false;
        }).length;

        for (const req of scopedRequests) {
            if (!requestOperationalDatesOverlapRange(req, range.start, range.end)) continue;
            const st = normalizeStatus(req?.status);
            if (st) {
                statusCounts[st] += 1;
                if (st === 'Cancelled') {
                    cancelledRevenue += sumRequestOperationalRevenueExTaxInRange(req, range.start, range.end);
                }
            }
            if (isDashboardExcludedRequest(req)) continue;
            const segs = buildReportSegmentsForRequest(req, range.start, range.end);
            const segTotal = sumRequestOperationalRevenueExTaxInRange(req, range.start, range.end);
            requestCount += 1;
            totalRevenue += segTotal;
            paidRevenue += asNumber(req?.paidAmount || 0);
            requestUnits += segs.length > 0 ? segs.length : 1;
        }

        const avgValue = requestCount > 0 ? totalRevenue / requestCount : 0;
        return {
            requestCount,
            requestUnits,
            totalRevenue,
            avgValue,
            paidRevenue,
            cancelledRevenue,
            callsCount,
            statusCounts,
        };
    }, [scopedRequests, crmLeads]);

    const currentRangeSummary = useMemo(
        () => computeRangeSummary(dashboardCurrentRange),
        [computeRangeSummary, dashboardCurrentRange]
    );
    const lyRangeSummary = useMemo(
        () => computeRangeSummary(dashboardLyRange),
        [computeRangeSummary, dashboardLyRange]
    );

    const pctVsLyLabel = (cur: number, ly: number) => {
        if (!ly) return cur ? 'vs LY New' : 'vs LY 0.0%';
        const pct = ((cur - ly) / ly) * 100;
        const sign = pct >= 0 ? '+' : '';
        return `vs LY ${sign}${pct.toFixed(1)}%`;
    };

    const dashboardStats = useMemo(() => {
        const status = currentRangeSummary.statusCounts;
        return {
            requests: String(currentRangeSummary.requestCount),
            revenue: formatMoneyCompact(currentRangeSummary.totalRevenue),
            avgValue: currentRangeSummary.requestCount ? formatMoneyCompact(currentRangeSummary.avgValue) : formatMoneyCompact(0),
            accounts: String((accounts || []).length),
            trend: pctVsLyLabel(currentRangeSummary.totalRevenue, lyRangeSummary.totalRevenue),
            requestsSubtext: pctVsLyLabel(currentRangeSummary.requestCount, lyRangeSummary.requestCount),
            avgSubtext: pctVsLyLabel(currentRangeSummary.avgValue, lyRangeSummary.avgValue),
            status: {
                act: String(status.Actual || 0),
                def: String(status.Definite || 0),
                tent: String(status.Tentative || 0),
                acc: String(status.Accepted || 0),
                inq: String(status.Inquiry || 0),
                cxl: String(status.Cancelled || 0),
                /** Total request value for Cancelled status in period (same basis as KPI revenue). */
                lostAmt: formatMoneyCompact(currentRangeSummary.cancelledRevenue),
                paid: formatMoneyCompact(currentRangeSummary.paidRevenue),
                cancelledAmt: formatMoneyCompact(currentRangeSummary.cancelledRevenue),
                /** Placeholder until contracts backend supplies signed count. */
                signed: '0',
                calls: String(currentRangeSummary.callsCount),
            },
        };
    }, [currentRangeSummary, lyRangeSummary, accounts, formatMoneyCompact]);

    const dashboardComparisonLabel = useMemo(() => {
        return `${formatPeriodLabel(dashboardCurrentRange)} vs ${formatPeriodLabel(dashboardLyRange)}`;
    }, [dashboardCurrentRange, dashboardLyRange]);

    const chartData = useMemo(() => {
        const axisConfig = buildDashboardAxis(dashboardCurrentRange);
        const axis = axisConfig.points;
        const keyFor = (iso: string) => getDashboardAxisKey(iso, axisConfig.granularity);
        const byMonth = new Map<string, any>(
            axis.map((m) => [m.key, {
                month: m.month,
                revenue: 0,
                totalRequests: 0,
                rooms: 0,
                roomNights: 0,
                roomsRevenue: 0,
                miceRequests: 0,
                miceRevenue: 0,
                miceRoomsRevenue: 0,
                inquiry: 0,
                accepted: 0,
                tentative: 0,
                definite: 0,
                actual: 0,
                cancelled: 0,
            }])
        );

        for (const req of scopedRequests) {
            const dRange = dashboardCurrentRange;
            const inPeriodCharts = requestCountsInChartsPeriod(req, dRange.start, dRange.end);
            const inOverlap = requestTouchesOperationalRange(req, dRange);
            if (!inOverlap && !inPeriodCharts) continue;

            const skipPerf = isDashboardExcludedRequest(req);

            if (inOverlap && !skipPerf && dRange.start && dRange.end) {
                addProratedRequestFinancialsToDashboardBuckets(
                    req,
                    dRange.start,
                    dRange.end,
                    (iso) => getDashboardAxisKey(iso, axisConfig.granularity),
                    (k) => byMonth.get(k),
                    {
                        skipPerf: false,
                        includeRoomsChart: shouldIncludeRequestInRoomsChart(req),
                        includeMiceChart: isEventsCateringEligibleRequest(req),
                        roomsChartBucketGranularity: axisConfig.granularity,
                    }
                );
            }

            incrementUniqueRequestChartCounts(
                req,
                dRange.start,
                dRange.end,
                (anchorYmd) => byMonth.get(keyFor(anchorYmd)),
                { includeInRequestCount: !skipPerf }
            );

        }

        return axis.map((m) => byMonth.get(m.key) || {
            month: m.month,
            revenue: 0,
            totalRequests: 0,
            rooms: 0,
            roomNights: 0,
            roomsRevenue: 0,
            miceRequests: 0,
            miceRevenue: 0,
            miceRoomsRevenue: 0,
            inquiry: 0,
            accepted: 0,
            tentative: 0,
            definite: 0,
            actual: 0,
            cancelled: 0,
        });
    }, [scopedRequests, dashboardCurrentRange]);

    const chartVsCompareRange = useMemo(() => {
        if (!chartVsEnabled) return null;
        return shiftRangeToComparisonYear(dashboardCurrentRange, chartVsYear);
    }, [chartVsEnabled, chartVsYear, dashboardCurrentRange]);

    const chartDataLy = useMemo(() => {
        if (!chartVsCompareRange) return [];
        return buildAccountProfileChartData(scopedRequests, chartVsCompareRange);
    }, [scopedRequests, chartVsCompareRange]);

    const chartDataForDisplay = useMemo(() => {
        if (!chartVsEnabled) return chartData;
        const tab = chartTab === 'Events' ? 'MICE' : chartTab;
        if (!chartTabSupportsVs(tab)) return chartData;
        return mergeChartRowsWithLyComparison(chartData, chartDataLy, tab);
    }, [chartData, chartDataLy, chartVsEnabled, chartTab]);

    const performanceData = useMemo(() => {
        const range = dashboardCurrentRange;
        const rangeStart = parseYmd(range.start);
        const rangeEnd = parseYmd(range.end);
        if (!rangeStart || !rangeEnd) {
            return {
                rooms: { actualPct: 0, forecastPct: 0, actualLabel: formatMoneyCompact(0), forecastLabel: formatMoneyCompact(0), budgetLabel: formatMoneyCompact(0), actualDeltaVsBudget: '0%', forecastDeltaVsBudget: '0%' },
                fnb: { actualPct: 0, forecastPct: 0, actualLabel: formatMoneyCompact(0), forecastLabel: formatMoneyCompact(0), budgetLabel: formatMoneyCompact(0), actualDeltaVsBudget: '0%', forecastDeltaVsBudget: '0%' },
            };
        }
        const periodStart = new Date(`${rangeStart}T00:00:00`);
        const periodEnd = new Date(`${rangeEnd}T00:00:00`);
        const overlapWeight = (year: number, monthIdx: number) => {
            const monthStart = new Date(year, monthIdx, 1);
            const monthEnd = new Date(year, monthIdx + 1, 0);
            const startMs = Math.max(monthStart.getTime(), periodStart.getTime());
            const endMs = Math.min(monthEnd.getTime(), periodEnd.getTime());
            if (endMs < startMs) return 0;
            const overlapDays = Math.floor((endMs - startMs) / 86400000) + 1;
            const monthDays = monthEnd.getDate();
            return monthDays > 0 ? overlapDays / monthDays : 0;
        };

        let roomsBudget = 0;
        let roomsForecast = 0;
        let fnbBudget = 0;
        let fnbForecast = 0;
        for (const yearRow of propertyFinancialKpis || []) {
            const y = Number(yearRow?.year);
            if (!Number.isFinite(y)) continue;
            const months = Array.isArray(yearRow?.months) ? yearRow.months : [];
            if (months.length > 0) {
                for (const monthRow of months) {
                    const idx = monthNameToIndex(monthRow?.month);
                    if (idx < 0) continue;
                    const w = overlapWeight(y, idx);
                    if (w <= 0) continue;
                    roomsBudget += Number(monthRow?.roomsBudget ?? monthRow?.budget ?? 0) * w;
                    roomsForecast += Number(monthRow?.roomsForecast ?? monthRow?.forecastRevenue ?? monthRow?.forecast ?? 0) * w;
                    fnbBudget += Number(monthRow?.foodAndBeverageBudget ?? monthRow?.foodBeverageBudget ?? monthRow?.fnbBudget ?? 0) * w;
                    fnbForecast += Number(monthRow?.foodAndBeverageForecast ?? monthRow?.foodBeverageForecast ?? monthRow?.fnbForecast ?? 0) * w;
                }
                continue;
            }
            // Backward-compatible row shape: one row per month with year/month/budget/forecast fields.
            const singleMonthIdx = monthNameToIndex(yearRow?.month);
            if (singleMonthIdx < 0) continue;
            const w = overlapWeight(y, singleMonthIdx);
            if (w <= 0) continue;
            roomsBudget += Number(yearRow?.roomsBudget ?? yearRow?.budget ?? 0) * w;
            roomsForecast += Number(yearRow?.roomsForecast ?? yearRow?.forecastRevenue ?? yearRow?.forecast ?? 0) * w;
            fnbBudget += Number(yearRow?.foodAndBeverageBudget ?? yearRow?.foodBeverageBudget ?? yearRow?.fnbBudget ?? 0) * w;
            fnbForecast += Number(yearRow?.foodAndBeverageForecast ?? yearRow?.foodBeverageForecast ?? yearRow?.fnbForecast ?? 0) * w;
        }

        let roomsActual = 0;
        let fnbActual = 0;
        for (const req of scopedRequests) {
            if (!requestTouchesOperationalRange(req, range)) continue;
            if (isDashboardExcludedRequest(req)) continue;
            if (normalizeStatus(req?.status) !== 'Actual') continue;
            const segsA = buildReportSegmentsForRequest(req, range.start, range.end);
            if (!segsA.length) continue;
            if (shouldIncludeRequestInRoomsChart(req)) {
                roomsActual += sumRequestProratedRoomRevenueExTaxInRange(req, range.start, range.end);
            }
            fnbActual += sumRequestProratedEventRevenueExTaxInRange(req, range.start, range.end);
        }

        const pct = (value: number, base: number) => (base > 0 ? (value / base) * 100 : 0);
        const deltaPct = (value: number, base: number) => {
            if (!base) return '0%';
            const v = ((value - base) / base) * 100;
            return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
        };

        return {
            rooms: {
                actualPct: pct(roomsActual, roomsBudget),
                forecastPct: pct(roomsForecast, roomsBudget),
                actualLabel: formatMoneyCompact(roomsActual),
                forecastLabel: formatMoneyCompact(roomsForecast),
                budgetLabel: formatMoneyCompact(roomsBudget),
                actualDeltaVsBudget: deltaPct(roomsActual, roomsBudget),
                forecastDeltaVsBudget: deltaPct(roomsForecast, roomsBudget),
            },
            fnb: {
                actualPct: pct(fnbActual, fnbBudget),
                forecastPct: pct(fnbForecast, fnbBudget),
                actualLabel: formatMoneyCompact(fnbActual),
                forecastLabel: formatMoneyCompact(fnbForecast),
                budgetLabel: formatMoneyCompact(fnbBudget),
                actualDeltaVsBudget: deltaPct(fnbActual, fnbBudget),
                forecastDeltaVsBudget: deltaPct(fnbForecast, fnbBudget),
            },
        };
    }, [dashboardCurrentRange, propertyFinancialKpis, scopedRequests, formatMoneyCompact]);

    const dashboardFeedRecentRequests = useMemo(() => {
        const q = dashboardFeedSearchQuery.trim().toLowerCase();
        const list = [...(scopedRequests || [])]
            .filter((r: any) => !isDashboardExcludedRequest(r))
            .filter((r: any) => requestTouchesOperationalRange(r, dashboardCurrentRange))
            .sort((a: any, b: any) => {
                const da = getPrimaryOperationalDate(a);
                const db = getPrimaryOperationalDate(b);
                return db.localeCompare(da);
            })
            .slice(0, 80);
        const mapped = list.map((r: any, i: number) => {
            const r0 = dashboardCurrentRange.start;
            const r1 = dashboardCurrentRange.end;
            const raw = r0 && r1 ? sumRequestOperationalRevenueExTaxInRange(r, r0, r1) : computeRequestCostBreakdown(r).totalRevenue;
            const amount = formatCompactAmount(raw);
            return {
                id: r.id ?? `req-${i}`,
                client: r.account || r.accountName || '—',
                type: r.requestType || 'Request',
                date: getPrimaryOperationalDate(r) || '—',
                status: r.status || '—',
                amount,
            };
        });
        const filtered = q
            ? mapped.filter(
                  (row: any) =>
                      String(row.client || '')
                          .toLowerCase()
                          .includes(q) ||
                      String(row.type || '')
                          .toLowerCase()
                          .includes(q) ||
                      String(row.status || '')
                          .toLowerCase()
                          .includes(q),
              )
            : mapped;
        return filtered.slice(0, 12);
    }, [scopedRequests, dashboardCurrentRange, dashboardFeedSearchQuery]);

    const dashboardFeedSalesCalls = useMemo(() => {
        const q = dashboardFeedSearchQuery.trim().toLowerCase();
        const flat = flattenCrmLeads(crmLeads);
        const sorted = [...flat]
            .filter((lead: any) => {
                const d = parseYmd(lead?.lastContact || lead?.date);
                return d ? isIsoInRange(d, dashboardCurrentRange) : false;
            })
            .sort((a, b) => {
            const ta = Date.parse(parseYmd(a.lastContact || a.date) || '') || 0;
            const tb = Date.parse(parseYmd(b.lastContact || b.date) || '') || 0;
            return tb - ta;
        }).slice(0, 80);
        const mapped = sorted.map((l: any, i: number) => ({
            id: l.id ?? `crm-${i}`,
            activity: l.subject || l.nextStep || 'Sales opportunity',
            client: l.company || '—',
            date: l.lastContact || l.date || '—',
            result: crmCalendarStageMeta(String(l.stage || l.status || 'new'), colors).label,
        }));
        const filtered = q
            ? mapped.filter(
                  (row: any) =>
                      String(row.client || '')
                          .toLowerCase()
                          .includes(q) ||
                      String(row.activity || '')
                          .toLowerCase()
                          .includes(q) ||
                      String(row.result || '')
                          .toLowerCase()
                          .includes(q),
              )
            : mapped;
        return filtered.slice(0, 12);
    }, [crmLeads, dashboardCurrentRange, colors, dashboardFeedSearchQuery]);

    const dashboardFeedAccountProfiles = useMemo(() => {
        const q = dashboardFeedSearchQuery.trim().toLowerCase();
        const rows = (accounts || []).map((acc: any) => {
            const reqs = filterRequestsForAccount(sharedRequests || [], acc.id, acc.name);
            const m = computeAccountMetrics(reqs);
            return {
                id: acc.id,
                client: acc.name,
                type: acc.type || 'Account',
                revenue: formatMoneyCompact(m.totalSpend),
                bookings: m.totalRequests,
                revenueSort: m.totalSpend,
            };
        });
        const filtered = q
            ? rows.filter((row: any) => String(row.client || '').toLowerCase().includes(q))
            : rows;
        return filtered
            .sort((a: any, b: any) => (b.revenueSort || 0) - (a.revenueSort || 0))
            .slice(0, 50)
            .map(({ revenueSort: _rs, ...rest }: any) => rest);
    }, [accounts, sharedRequests, formatMoneyCompact, dashboardFeedSearchQuery]);

    const handleOpenTaskModal = (task: any = null) => {
        if (!task && !canMutateOperational(currentUser)) return;
        if (task) {
            setEditingTask(task);
            setTaskFormData({
                task: task.task,
                client: task.client,
                date: task.date || '',
                priority: task.priority || 'Medium',
                assignees: normalizeTaskAssignees(task),
                description: task.description || '',
                category: task.category || 'Follow-up',
                star: task.star || false,
            });
        } else {
            setEditingTask(null);
            setTaskFormData({
                task: '',
                client: '',
                date: new Date().toISOString().split('T')[0],
                priority: 'Medium',
                assignees: currentUser?.name
                    ? [{ id: String(currentUser.id ?? ''), name: String(currentUser.name) }]
                    : [],
                description: '',
                category: 'Follow-up',
                star: false,
            });
        }
        setTaskAssigneePick('');
        setShowTaskModal(true);
    };

    const handleSaveTask = () => {
        if (!canMutateOperational(currentUser)) return;
        if (!taskFormData.task) return;

        const assignedToJoined = taskFormData.assignees.map((a) => a.name).filter(Boolean).join(', ');
        const payload = {
            ...taskFormData,
            assignedTo: assignedToJoined,
            assignees: taskFormData.assignees,
        };
        if (editingTask) {
            setTasks((prev) =>
                prev.map((t) =>
                    String(t.id) === String(editingTask.id)
                        ? { ...t, ...payload, propertyId: t.propertyId || activeProperty?.id || null }
                        : t
                )
            );
        } else {
            const newTask = {
                id: `T${Date.now()}`,
                ...payload,
                completed: false,
                propertyId: activeProperty?.id || null,
            };
            setTasks((prev) => [newTask, ...prev]);
        }
        setShowTaskModal(false);
    };

    const handleDeleteTask = () => {
        if (!editingTask || !canDeleteTasks(currentUser)) return;
        if (!window.confirm('Delete this task permanently?')) return;
        setTasks((prev) => prev.filter((t: any) => String(t.id) !== String(editingTask.id)));
        setShowTaskModal(false);
        setEditingTask(null);
    };

    const handleToggleTaskComplete = (id: string | number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!canMutateOperational(currentUser)) return;
        setTasks(prev => prev.map(t => String(t.id) === String(id) ? { ...t, completed: !t.completed } : t));
    };

    const taskModalReadOnly =
        !!editingTask && showTaskModal && !canMutateOperational(currentUser);

    const activeTasksCount = useMemo(
        () =>
            tasks.filter(
                (t: any) =>
                    !t.completed &&
                    (!activeProperty?.id || !t.propertyId || t.propertyId === activeProperty.id)
            ).length,
        [tasks, activeProperty?.id]
    );
    const activeTasks = useMemo(
        () =>
            tasks.filter(
                (t: any) =>
                    !t.completed &&
                    (!activeProperty?.id || !t.propertyId || t.propertyId === activeProperty.id)
            ),
        [tasks, activeProperty?.id]
    );

    const dashboardFeedTasksFiltered = useMemo(() => {
        const q = dashboardFeedSearchQuery.trim().toLowerCase();
        if (!q) return activeTasks;
        return activeTasks.filter(
            (t: any) =>
                String(t.task || '')
                    .toLowerCase()
                    .includes(q) ||
                String(t.client || '')
                    .toLowerCase()
                    .includes(q) ||
                String(t.description || '')
                    .toLowerCase()
                    .includes(q) ||
                String(t.assignedTo || '')
                    .toLowerCase()
                    .includes(q),
        );
    }, [activeTasks, dashboardFeedSearchQuery]);

    // Click Outside Refs
    const eventsPickerRef = useRef<HTMLDivElement>(null);
    const eventTypeMenuRef = useRef<HTMLDivElement>(null);
    const calendarPickerRef = useRef<HTMLDivElement>(null);
    const dashboardPickerRef = useRef<HTMLDivElement>(null);
    const accountShellPerfPickerRef = useRef<HTMLDivElement>(null);
    const userDropdownRef = useRef<HTMLDivElement>(null);
    /** Mobile header avatar (must be included in click-outside for profile menu). */
    const userProfileMobileRef = useRef<HTMLDivElement>(null);
    const alertsPanelRef = useRef<HTMLDivElement>(null);
    const alertsPanelMobileRef = useRef<HTMLDivElement>(null);

    // Global Click Outside Logic
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (eventsPickerRef.current && !eventsPickerRef.current.contains(event.target as Node)) {
                setShowEventsDatePicker(false);
            }
            if (calendarPickerRef.current && !calendarPickerRef.current.contains(event.target as Node)) {
                setShowCalendarDatePicker(false);
            }
            if (dashboardPickerRef.current && !dashboardPickerRef.current.contains(event.target as Node)) {
                setShowDatePicker(false);
            }
            if (accountShellPerfPickerRef.current && !accountShellPerfPickerRef.current.contains(event.target as Node)) {
                setShowAccountShellPerfPicker(false);
            }
            const profileTarget = event.target as Node;
            const inDesktopProfile = userDropdownRef.current?.contains(profileTarget);
            const inMobileProfile = userProfileMobileRef.current?.contains(profileTarget);
            if (!inDesktopProfile && !inMobileProfile) {
                setUserDropdownOpen(false);
            }
            const t = event.target as Node;
            const inDesk = alertsPanelRef.current?.contains(t);
            const inMob = alertsPanelMobileRef.current?.contains(t);
            if (!inDesk && !inMob) {
                setAlertsPanelOpen(false);
            }
            if (eventTypeMenuRef.current && !eventTypeMenuRef.current.contains(event.target as Node)) {
                setShowEventTypeMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Auto-close on view change
    useEffect(() => {
        setShowEventsDatePicker(false);
        setShowCalendarDatePicker(false);
        setShowDatePicker(false);
        setShowAccountShellPerfPicker(false);
        setCalendarDetailModal(null);
        setAlertsPanelOpen(false);
    }, [currentView, eventsSubView, requestsSubView]);

    useEffect(() => {
        if (currentView !== 'accounts') {
            setAccountsProfileLeadKey(null);
            setShowAccountShellPerfPicker(false);
        }
    }, [currentView]);

    useEffect(() => {
        if (!accountsProfileLeadKey) return;
        const d = getDefaultAccountPerformanceRange();
        setAccountShellPerfRange(d);
        setAccountShellPerfDraftFrom(d.from);
        setAccountShellPerfDraftTo(d.to);
        setShowAccountShellPerfPicker(false);
    }, [accountsProfileLeadKey]);

    useEffect(() => {
        if (currentView !== 'dashboard') return;
        setDashboardPeriodMode('autoCurrentYear');
        setCustomDates(getCurrentYearRange());
    }, [currentView]);

    useEffect(() => {
        if (currentView !== 'calendar') return;
        setCurrentCalendarDate(new Date());
    }, [currentView]);

    useEffect(() => {
        if (!isAuthenticated) return;
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        // Prompt for location access on app open; if granted, refresh date-dependent state.
        navigator.geolocation.getCurrentPosition(
            () => setCurrentCalendarDate(new Date()),
            () => { /* Keep local device time fallback when denied/unavailable. */ },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
        );
    }, [isAuthenticated]);

    useEffect(() => {
        const t = setInterval(() => setDashboardNowAnchor(Date.now()), 60 * 60 * 1000);
        return () => clearInterval(t);
    }, []);

    /** After midnight or long backgrounding, refresh “today” so MTD/YTD end dates stay correct. */
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'visible') setDashboardNowAnchor(Date.now());
        };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, []);

    const handleMonthChange = (direction: any) => {
        const newDate = new Date(eventsCalendarDate);
        newDate.setMonth(newDate.getMonth() + direction);
        setEventsCalendarDate(newDate);
    };

    // Calendar Navigation Helpers
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const navigateMonth = (direction: number) => {
        const newDate = new Date(currentCalendarDate);
        if (calendarViewMode === 'Week') {
            // Navigate by week (7 days)
            newDate.setDate(newDate.getDate() + (direction * 7));
        } else {
            // Navigate by month
            newDate.setMonth(newDate.getMonth() + direction);
        }
        setCurrentCalendarDate(newDate);
    };

    const selectMonthYear = (selectedMonth: number, selectedYear: number) => {
        setCurrentCalendarDate(new Date(selectedYear, selectedMonth, 1));
        setShowCalendarDatePicker(false);
    };

    const cycleTheme = () => {
        const ids = Object.keys(THEMES);
        const nextIdx = (ids.indexOf(currentThemeId) + 1) % ids.length;
        setCurrentThemeId(ids[nextIdx]);
    };

    const handleLogin = (user: any) => {
        const preferredCurrency = getPersistedUserCurrency(user);
        setCurrentUser({ ...(user || {}), preferredCurrency });
        setIsAuthenticated(true);
    };

    const handleCurrencyChange = (next: string) => {
        const nextCurrency = resolveCurrencyCode(next);
        setCurrentUser((prev: any) => {
            if (!prev) return prev;
            const updated = { ...prev, preferredCurrency: nextCurrency };
            writeUserCurrencyPref(updated, nextCurrency);
            return updated;
        });
    };

    const handleLogout = () => {
        // Revoke the server-side session (cookie) so it can't be reused; best-effort.
        fetch(apiUrl('/api/logout'), { method: 'POST' }).catch(() => {});
        setCurrentUser(null);
        setIsAuthenticated(false);
        setShowLoginPage(false);
        setCurrentView('dashboard');
    };

    /** Must run on every render (even when logged out) — hooks cannot appear after the unauthenticated early return. */
    const getAlertRowStyle = useCallback((accent: RequestAlert['accent']): React.CSSProperties => {
        const lw = 4;
        switch (accent) {
            case 'yellow':
                return {
                    borderLeftWidth: lw,
                    borderLeftStyle: 'solid',
                    borderLeftColor: colors.yellow,
                    backgroundColor: `${colors.yellow}14`,
                };
            case 'blue':
                return {
                    borderLeftWidth: lw,
                    borderLeftStyle: 'solid',
                    borderLeftColor: colors.blue,
                    backgroundColor: `${colors.blue}14`,
                };
            case 'green':
                return {
                    borderLeftWidth: lw,
                    borderLeftStyle: 'solid',
                    borderLeftColor: colors.green,
                    backgroundColor: `${colors.green}14`,
                };
            case 'lightGreen':
                return {
                    borderLeftWidth: lw,
                    borderLeftStyle: 'solid',
                    borderLeftColor: '#34d399',
                    backgroundColor: 'rgba(52,211,153,0.12)',
                };
            case 'lightBlue':
                return {
                    borderLeftWidth: lw,
                    borderLeftStyle: 'solid',
                    borderLeftColor: '#38bdf8',
                    backgroundColor: 'rgba(56,189,248,0.12)',
                };
            case 'red':
            default:
                return {
                    borderLeftWidth: lw,
                    borderLeftStyle: 'solid',
                    borderLeftColor: colors.red,
                    backgroundColor: `${colors.red}14`,
                };
        }
    }, [colors]);

    // --- Renderers ---


    // --- Render ---

    const feedbackPublicToken = useMemo(
        () => String(new URLSearchParams(window.location.search).get('feedbackToken') || '').trim(),
        []
    );

    if (feedbackPublicToken) {
        return (
            <Suspense fallback={<PageLoadFallback label="Loading feedback…" />}>
                <RequestFeedbackPublicPage token={feedbackPublicToken} />
            </Suspense>
        );
    }

    // Show Login page if not authenticated
    if (!isAuthenticated) {
        if (!showLoginPage) {
            if (showLandingPreview) {
                return (
                    <Suspense fallback={<PageLoadFallback label="Loading…" />}>
                        <LandingPage
                            themes={THEMES}
                            currentThemeId={currentThemeId}
                            onOpenLogin={() => setShowLoginPage(true)}
                            onThemeChange={cycleTheme}
                            onOpenRedesignPreview={() => setShowLandingPreview(false)}
                        />
                    </Suspense>
                );
            }
            return (
                <Suspense fallback={<PageLoadFallback label="Loading…" />}>
                    <LandingPageTasteMotionPreview
                        themes={THEMES}
                        currentThemeId={currentThemeId}
                        onOpenLogin={() => setShowLoginPage(true)}
                        onThemeChange={cycleTheme}
                        onBackToLanding={() => setShowLandingPreview(true)}
                        embedded
                    />
                </Suspense>
            );
        }
        return (
            <Login
                onLogin={handleLogin}
                themes={THEMES}
                currentThemeId={currentThemeId}
                onThemeChange={cycleTheme}
                onBackToLanding={() => { setShowLoginPage(false); setShowLandingPreview(false); }}
            />
        );
    }

    // Main Dashboard (when authenticated)
    const getPageTitle = () => {
        switch (currentView) {
            case 'dashboard': return 'Dashboard';
            case 'calendar': return 'Calendar';
            case 'events': return 'Events & Catering';
            case 'requests': return 'Requests Center';
            case 'crm': return 'CRM';
            case 'contracts': return 'Contracts';
            case 'accounts': return 'Accounts';
            case 'promotions': return 'Promotions';
            case 'reports': return 'Reports';
            case 'todo': return 'To-Do Management';
            case 'settings': return 'Settings';
            default: return 'Dashboard';
        }
    };
    const mainNavItems = [
        { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' },
        { icon: CalendarDays, label: 'Calendar', id: 'calendar' },
        { icon: ListTodo, label: 'To Do', id: 'todo' },
        { icon: Wine, label: 'Events & Catering', id: 'events' },
        { icon: BedDouble, label: 'Requests Management', id: 'requests' },
        { icon: Users, label: 'CRM', id: 'crm' },
        { icon: FileText, label: 'Contracts', id: 'contracts' },
        { icon: BriefcaseIcon, label: 'Accounts', id: 'accounts' },
        { icon: Target, label: 'Promotions', id: 'promotions' }
    ];

    // Main Dashboard (when authenticated)
    return (
        <div className="flex h-screen w-full font-sans overflow-hidden"
            style={{ backgroundColor: colors.bg, color: colors.textMain }}>


            {/* Side Navigation Drawer - Flexible */}
            <div
                className={`flex-shrink-0 h-full transition-all duration-300 ease-in-out border-r overflow-hidden ${isSideNavOpen || isSidebarPinned ? 'w-64 opacity-100' : 'w-0 opacity-0'}`}
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
                {/* Fixed width container for sidebar content to prevent squishing */}
                <div className="w-64 h-full flex flex-col">
                    <div className="p-5 border-b" style={{ borderColor: colors.border }}>
                        <div className="flex items-center justify-between mb-6">
                            <img
                                src="https://res.cloudinary.com/dmydt1xa9/image/upload/v1769032168/Gemini_Generated_Image_4hqpsz4hqpsz4hqp_ukfn6c.png"
                                alt="Advanced Sales Logo"
                                className="h-12 w-auto object-contain"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsSidebarPinned(!isSidebarPinned)}
                                    style={{ color: isSidebarPinned ? colors.primary : colors.textMuted }}
                                    className="hover:opacity-100 transition-opacity hidden lg:block"
                                    title={isSidebarPinned ? "Unpin Sidebar" : "Pin Sidebar"}
                                >
                                    {isSidebarPinned ? <Pin size={18} fill={colors.primary} /> : <Pin size={18} />}
                                </button>
                                <button onClick={() => setIsSideNavOpen(false)} style={{ color: colors.textMuted }} className="hover:opacity-70 transition-opacity lg:hidden">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold tracking-widest opacity-60" style={{ color: colors.textMuted }}>Welcome</span>
                            <h2
                                className="font-bold text-lg truncate"
                                style={{
                                    background: `linear-gradient(to right, ${colors.primary}, ${colors.primaryHighlight || colors.primary})`,
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    color: colors.primary // Fallback
                                }}
                            >
                                Hi, {currentUser?.name?.split(' ')[0] || 'User'}
                            </h2>
                        </div>
                    </div>

                    {/* Main Navigation */}
                    <div className="flex-1 py-4 px-2 space-y-1 overflow-y-auto custom-scrollbar">
                        {mainNavItems
                            .filter((item) => {
                                if (item.id === 'accounts') return canShowAccountsNavItem(currentUser);
                                if (item.id === 'promotions') return canAccessPromotions(currentUser);
                                const perm = MAIN_NAV_ITEM_PERMISSIONS[item.id];
                                return perm ? can(currentUser, perm) : false;
                            })
                            .map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        setCurrentView(item.id);
                                        if (item.id === 'crm') setCrmSubView('activities');
                                        setPendingCrmAction(null);
                                        setPendingRequestType(null);
                                        if (!isSidebarPinned) setIsSideNavOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-white/5 ${currentView === item.id ? 'bg-white/5 border-r-2' : ''}`}
                                    style={{
                                        color: currentView === item.id ? colors.primary : colors.textMain,
                                        borderColor: currentView === item.id ? colors.primary : 'transparent'
                                    }}
                                >
                                    <item.icon size={18} style={{ color: currentView === item.id ? colors.primary : colors.textMuted }} />
                                    <span className={`text-sm ${currentView === item.id ? 'font-bold' : ''}`}>{item.label}</span>
                                </button>
                            ))}
                    </div>

                    {/* Bottom Navigation & Logout */}
                    <div className="p-4 border-t space-y-1" style={{ borderColor: colors.border }}>
                        {[
                            { icon: BarChart3, label: 'Reports', id: 'reports' },
                            { icon: Settings, label: 'Settings', id: 'settings' }
                        ]
                            .filter((item) => item.id !== 'reports' || canAccessReports(currentUser))
                            .map((item, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    setCurrentView(item.id);
                                    setPendingCrmAction(null);
                                    setPendingRequestType(null);
                                    if (!isSidebarPinned) setIsSideNavOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-white/5 ${currentView === item.id ? 'bg-white/5 border-r-2' : ''}`}
                                style={{
                                    color: currentView === item.id ? colors.primary : colors.textMain,
                                    borderColor: currentView === item.id ? colors.primary : 'transparent'
                                }}
                            >
                                <item.icon size={18} style={{ color: currentView === item.id ? colors.primary : colors.textMuted }} />
                                <span className={`text-sm ${currentView === item.id ? 'font-bold' : ''}`}>{item.label}</span>
                            </button>
                        ))}

                        <div className="h-px w-full my-2 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                            <LogOut size={18} />
                            <span className="text-sm font-medium">Sign Out</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Wrapper */}
            <div className="flex-1 flex flex-col min-w-0 h-full relative">



                {/* 1. Header */}
                <header className="flex-none h-auto md:min-h-12 border-b flex flex-col md:flex-row items-center justify-between px-4 md:px-5 py-2 md:py-1.5 z-20 relative gap-3 md:gap-0"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border }}>

                    {/* Left: Logo & Menu Trigger */}
                    <div className="flex items-center justify-between w-full md:w-auto gap-4">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setIsSideNavOpen(!isSideNavOpen)} className="p-1 hover:bg-white/10 rounded transition-colors" style={{ color: colors.textMuted }}>
                                <Menu size={24} />
                            </button>
                            <div className="flex flex-col ml-2 -mt-0.5 md:-mt-1 leading-none gap-0">
                                <img
                                    src="https://res.cloudinary.com/dmydt1xa9/image/upload/v1769032168/Gemini_Generated_Image_4hqpsz4hqpsz4hqp_ukfn6c.png"
                                    alt="Advanced Sales Logo"
                                    className="h-10 w-auto object-contain shrink-0 md:h-9"
                                />
                                <span className="text-[8px] uppercase tracking-wider pl-1 leading-none mt-0.5 pb-px" style={{ color: colors.textMuted }}>Advanced Sales</span>
                            </div>
                        </div>
                        {/* Mobile Only Tools */}
                        <div className="flex md:hidden items-center gap-3">
                            
                            <AlertsBell
                                colors={colors}
                                bellSize={20}
                                panelRef={alertsPanelMobileRef}
                                open={alertsPanelOpen}
                                setOpen={setAlertsPanelOpen}
                                activeAlerts={activeAlerts}
                                getAlertRowStyle={getAlertRowStyle}
                                onDone={handleAlertDone}
                                onViewRequest={handleViewAlertRequest}
                            />
                            <select
                                value={currentCurrency}
                                onChange={(e) => handleCurrencyChange(e.target.value)}
                                className="px-2 py-1 rounded border text-[11px] font-bold bg-black/20 outline-none"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                                title="Currency"
                            >
                                {CURRENCY_OPTIONS.map((code) => (
                                    <option key={code} value={code}>{code}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                ref={userProfileMobileRef}
                                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black border shadow-sm active:scale-95"
                                style={userAvatarGradientStyle}
                            >
                                {userInitials}
                            </button>
                        </div>

                        {/* Page Title - Vertical Divider & Text */}
                        <div className="hidden md:flex items-center gap-4 ml-2">
                            <div className="h-8 w-[1px] bg-white/10"></div>
                            <span className="font-bold text-sm uppercase tracking-widest" style={{ color: colors.textMuted }}>
                                {getPageTitle()}
                            </span>
                        </div>
                    </div>

                    {/* Center: Context-Aware Navigation */}
                    <div
                        className={`w-full md:w-auto flex items-center justify-center gap-3 ${
                            currentView === 'crm'
                                ? 'md:relative'
                                : 'md:absolute md:left-1/2 md:top-1/2 md:transform md:-translate-x-1/2 md:-translate-y-1/2'
                        }`}
                    >

                        {currentView === 'calendar' ? (
                            /* CALENDAR HEADER CONTROLS */
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 relative" ref={calendarPickerRef}>
                                    <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded hover:bg-white/10 transition-colors" style={{ color: colors.textMuted }}><ChevronLeft size={16} /></button>
                                    <button
                                        onClick={() => setShowCalendarDatePicker(!showCalendarDatePicker)}
                                        className="text-sm font-bold tracking-wide mx-1 whitespace-nowrap hover:bg-white/10 px-2 py-1 rounded transition-colors cursor-pointer"
                                        style={{ color: colors.textMain }}
                                    >
                                        {calendarViewMode === 'Week' ? (() => {
                                            // Calculate week range for display
                                            const today = new Date(currentCalendarDate);
                                            const dayOfWeek = today.getDay();
                                            const weekStart = new Date(today);
                                            weekStart.setDate(today.getDate() - dayOfWeek);
                                            const weekEnd = new Date(weekStart);
                                            weekEnd.setDate(weekStart.getDate() + 6);

                                            const startMonth = monthNames[weekStart.getMonth()].slice(0, 3);
                                            const endMonth = monthNames[weekEnd.getMonth()].slice(0, 3);

                                            if (weekStart.getMonth() === weekEnd.getMonth()) {
                                                return `${startMonth} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
                                            } else {
                                                return `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
                                            }
                                        })() : `${monthNames[month].slice(0, 3)} ${year}`}
                                    </button>
                                    <button onClick={() => navigateMonth(1)} className="p-1.5 rounded hover:bg-white/10 transition-colors" style={{ color: colors.textMuted }}><ChevronRight size={16} /></button>

                                    {/* Date Picker Dropdown */}
                                    {showCalendarDatePicker && (
                                        <div className="absolute top-full left-0 mt-2 p-4 rounded-lg border shadow-xl z-50 min-w-[280px]"
                                            style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                            <div className="mb-3">
                                                <label className="text-[10px] uppercase font-bold mb-1 block" style={{ color: colors.textMuted }}>Year</label>
                                                <select
                                                    value={year}
                                                    onChange={(e) => selectMonthYear(month, parseInt(e.target.value))}
                                                    className="w-full px-3 py-2 rounded border text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                >
                                                    {Array.from(
                                                        { length: Math.max(new Date().getFullYear(), 2030) - 1999 + 1 },
                                                        (_, i) => 2000 + i
                                                    ).map((y) => (
                                                        <option key={y} value={y}>{y}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold mb-1 block" style={{ color: colors.textMuted }}>Month</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {monthNames.map((m: any, idx: any) => (
                                                        <button
                                                            key={m}
                                                            onClick={() => selectMonthYear(idx, year)}
                                                            className="px-2 py-1.5 rounded text-xs font-medium transition-colors"
                                                            style={{
                                                                backgroundColor: idx === month ? colors.primary : colors.bg,
                                                                color: idx === month ? '#000' : colors.textMain
                                                            }}
                                                        >
                                                            {m.slice(0, 3)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 p-1 rounded-lg border transition-colors duration-300" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                    {['Month', 'Week', 'List'].map(view => (
                                        <button
                                            key={view}
                                            onClick={() => setCalendarViewMode(view)}
                                            className={`text-[10px] px-2 py-1 rounded transition-colors whitespace-nowrap ${view === calendarViewMode ? 'font-bold' : ''}`}
                                            style={{ backgroundColor: view === calendarViewMode ? colors.bg : 'transparent', color: view === calendarViewMode ? colors.textMain : colors.textMuted }}
                                        >
                                            {view}
                                        </button>
                                    ))}
                                </div>

                                {canMutateOperational(currentUser) && (
                                    <div className="relative" ref={eventTypeMenuRef}>
                                        <button
                                            type="button"
                                            onClick={() => setShowEventTypeMenu((v) => !v)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-transform hover:scale-105 active:scale-95 whitespace-nowrap"
                                            style={{ backgroundColor: colors.primary, color: '#000' }}
                                        >
                                            <Plus size={12} /> New Event
                                            <ChevronDown size={12} className="opacity-70" />
                                        </button>
                                        {showEventTypeMenu && (
                                            <div
                                                className="absolute right-0 top-full mt-1 py-1 rounded-xl border shadow-xl z-[100] min-w-[220px]"
                                                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                            >
                                                <button
                                                    type="button"
                                                    className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/5 transition-colors"
                                                    style={{ color: colors.textMain }}
                                                    onClick={() => {
                                                        setEventsEmbeddedRequestType('event');
                                                        setShowEventsRequestModal(true);
                                                        setShowEventTypeMenu(false);
                                                    }}
                                                >
                                                    Event
                                                </button>
                                                <button
                                                    type="button"
                                                    className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/5 transition-colors border-t border-white/5"
                                                    style={{ color: colors.textMain }}
                                                    onClick={() => {
                                                        setEventsEmbeddedRequestType('event_rooms');
                                                        setShowEventsRequestModal(true);
                                                        setShowEventTypeMenu(false);
                                                    }}
                                                >
                                                    Event with accommodation
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : currentView === 'events' ? (
                            /* EVENTS HEADER CONTROLS */
                            <div className="flex items-center gap-2">
                                {/* 1. View Toggles */}



                                {/* Drag & Drop Board (Kanban) */}
                                <button
                                    onClick={() => setEventsSubView('pipeline')}
                                    className={`p-1.5 rounded-lg border transition-colors ${eventsSubView === 'pipeline' ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                                    title="Kanban Cards"
                                >
                                    <LayoutList size={14} style={{ color: eventsSubView === 'pipeline' ? colors.textMain : colors.textMuted }} />
                                </button>

                                {/* Account Performance */}
                                <button
                                    onClick={() => setEventsSubView('performance')}
                                    className={`p-1.5 rounded-lg border transition-colors ${eventsSubView === 'performance' ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                                    title="Account Performance"
                                >
                                    <Briefcase size={14} style={{ color: eventsSubView === 'performance' ? colors.textMain : colors.textMuted }} />
                                </button>

                                {/* Requests & Analytics */}
                                <button
                                    onClick={() => setEventsSubView('analytics')}
                                    className={`p-1.5 rounded-lg border transition-colors ${eventsSubView === 'analytics' ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                                    title="Requests & Analytics"
                                >
                                    <BarChart3 size={14} style={{ color: eventsSubView === 'analytics' ? colors.textMain : colors.textMuted }} />
                                </button>

                                {/* Additional Tools: Availability & BEO */}
                                <button
                                    onClick={() => setEventsSubView('availability')}
                                    className={`p-1.5 rounded-lg border transition-colors ${eventsSubView === 'availability' ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                                    title="Check Venue Availability"
                                >
                                    <CalendarCheck size={14} style={{ color: eventsSubView === 'availability' ? colors.textMain : colors.textMuted }} />
                                </button>
                                <button
                                    onClick={() => setEventsSubView('beo')}
                                    className={`p-1.5 rounded-lg border transition-colors ${eventsSubView === 'beo' ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                                    title="BEO Management"
                                >
                                    <FileText size={14} style={{ color: eventsSubView === 'beo' ? colors.textMain : colors.textMuted }} />
                                </button>

                                {eventsSubView === 'pipeline' && (
                                    /* Event Date Filter */
                                    <div className="relative" ref={eventsPickerRef}>
                                        <button
                                            onClick={() => setShowEventsDatePicker(!showEventsDatePicker)}
                                            className={`p-1.5 rounded-lg border transition-all ${showEventsDatePicker ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                                            title="Filter Events Month"
                                        >
                                            <Calendar size={14} style={{ color: colors.primary }} />
                                        </button>

                                        {showEventsDatePicker && (
                                            <div className="absolute top-full right-0 mt-2 p-4 rounded-lg border shadow-xl z-50 min-w-[280px]"
                                                style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold mb-1 block" style={{ color: colors.textMuted }}>From</label>
                                                        <input
                                                            type="date"
                                                            value={eventsFilterRange.start}
                                                            onChange={(e) => setEventsFilterRange(prev => ({ ...prev, start: e.target.value }))}
                                                            className="w-full px-2 py-1.5 rounded border text-[10px]"
                                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold mb-1 block" style={{ color: colors.textMuted }}>To</label>
                                                        <input
                                                            type="date"
                                                            value={eventsFilterRange.end}
                                                            onChange={(e) => setEventsFilterRange(prev => ({ ...prev, end: e.target.value }))}
                                                            className="w-full px-2 py-1.5 rounded border text-[10px]"
                                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-2 mt-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowEventsDatePicker(false)}
                                                        className="w-full py-1.5 rounded text-[10px] font-bold uppercase tracking-wide bg-primary text-black hover:brightness-110 transition-all"
                                                        style={{ backgroundColor: colors.primary }}
                                                    >
                                                        Apply Range
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEventsFilterRange(defaultEventsYearRange());
                                                            setShowEventsDatePicker(false);
                                                        }}
                                                        className="w-full py-1.5 rounded text-[10px] font-bold uppercase tracking-wide border hover:bg-white/5"
                                                        style={{ borderColor: colors.border, color: colors.textMuted }}
                                                    >
                                                        Reset to this year
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEventsFilterRange({ start: '', end: '' });
                                                            setShowEventsDatePicker(false);
                                                        }}
                                                        className="w-full py-1.5 rounded text-[10px] font-bold uppercase tracking-wide border hover:bg-white/5"
                                                        style={{ borderColor: colors.border, color: colors.textMuted }}
                                                    >
                                                        All dates
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="w-[1px] h-4 bg-white/10 mx-1"></div>

                                {/* Primary Action: MICE request types only — opens embedded Requests wizard in modal */}
                                {canMutateOperational(currentUser) && (
                                    <div className="relative" ref={eventTypeMenuRef}>
                                        <button
                                            type="button"
                                            onClick={() => setShowEventTypeMenu((v) => !v)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-transform hover:scale-105 active:scale-95 whitespace-nowrap"
                                            style={{ backgroundColor: colors.primary, color: '#000' }}
                                        >
                                            <Plus size={12} /> Event
                                            <ChevronDown size={12} className="opacity-70" />
                                        </button>
                                        {showEventTypeMenu && (
                                            <div
                                                className="absolute right-0 top-full mt-1 py-1 rounded-xl border shadow-xl z-[100] min-w-[220px]"
                                                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                            >
                                                <button
                                                    type="button"
                                                    className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/5 transition-colors"
                                                    style={{ color: colors.textMain }}
                                                    onClick={() => {
                                                        setEventsEmbeddedRequestType('event');
                                                        setShowEventsRequestModal(true);
                                                        setShowEventTypeMenu(false);
                                                    }}
                                                >
                                                    Event
                                                </button>
                                                <button
                                                    type="button"
                                                    className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/5 transition-colors border-t border-white/5"
                                                    style={{ color: colors.textMain }}
                                                    onClick={() => {
                                                        setEventsEmbeddedRequestType('event_rooms');
                                                        setShowEventsRequestModal(true);
                                                        setShowEventTypeMenu(false);
                                                    }}
                                                >
                                                    Event with accommodation
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : currentView === 'requests' ? (
                            /* REQUESTS MANAGEMENT HEADER CONTROLS */
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => navigateRequestsSubView('search')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${requestsSubView === 'search' ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                                >
                                    <Search size={14} style={{ color: requestsSubView === 'search' ? colors.primary : colors.textMuted }} />
                                    <span className="text-[10px] font-bold uppercase" style={{ color: requestsSubView === 'search' ? colors.textMain : colors.textMuted }}>Search</span>
                                </button>

                                <button
                                    onClick={() => navigateRequestsSubView('list')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${requestsSubView === 'list' ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                                >
                                    <LayoutList size={14} style={{ color: requestsSubView === 'list' ? colors.primary : colors.textMuted }} />
                                    <span className="text-[10px] font-bold uppercase" style={{ color: requestsSubView === 'list' ? colors.textMain : colors.textMuted }}>All Requests</span>
                                </button>

                                <button
                                    onClick={() => navigateRequestsSubView('grid')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${requestsSubView === 'grid' ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                                >
                                    <Grid size={14} style={{ color: requestsSubView === 'grid' ? colors.primary : colors.textMuted }} />
                                    <span className="text-[10px] font-bold uppercase" style={{ color: requestsSubView === 'grid' ? colors.textMain : colors.textMuted }}>Grid</span>
                                </button>

                                {canMutateOperational(currentUser) && (
                                    <button
                                        onClick={() => navigateRequestsSubView('new_request')}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-transform hover:scale-105 active:scale-95 whitespace-nowrap ml-2 shadow-lg shadow-primary/20"
                                        style={{ backgroundColor: colors.primary, color: '#000' }}>
                                        <Plus size={12} /> New Request
                                    </button>
                                )}
                            </div>
                        ) : currentView === 'accounts' ? (
                            accountsProfileLeadKey ? (
                                <div
                                    className="relative flex items-center gap-2 px-2 py-1 rounded-lg border transition-colors duration-300 overflow-visible max-w-full"
                                    style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                    ref={accountShellPerfPickerRef}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!showAccountShellPerfPicker) {
                                                setAccountShellPerfDraftFrom(accountShellPerfRange.from);
                                                setAccountShellPerfDraftTo(accountShellPerfRange.to);
                                            }
                                            setShowAccountShellPerfPicker((v) => !v);
                                        }}
                                        className="p-1 rounded hover:bg-white/10 transition-colors"
                                        title="Account profile performance date range (operational dates)"
                                    >
                                        <CalendarDays
                                            size={14}
                                            style={{ color: showAccountShellPerfPicker ? colors.primary : colors.textMuted }}
                                            className="shrink-0"
                                        />
                                    </button>
                                    <span
                                        className="text-[10px] font-bold uppercase tracking-wide max-w-[min(11rem,40vw)] truncate hidden sm:inline font-mono"
                                        style={{ color: colors.textMuted }}
                                        title={`${accountShellPerfRange.from} → ${accountShellPerfRange.to}`}
                                    >
                                        {accountShellPerfRange.from} → {accountShellPerfRange.to}
                                    </span>
                                    {showAccountShellPerfPicker && (
                                        <div
                                            className="absolute top-full right-0 mt-2 p-4 rounded-xl border shadow-2xl z-[130] w-[min(100vw-2rem,20rem)] flex flex-col gap-3"
                                            style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                        >
                                            <div>
                                                <label className="text-[9px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>From</label>
                                                <input
                                                    type="date"
                                                    value={accountShellPerfDraftFrom}
                                                    onChange={(e) => setAccountShellPerfDraftFrom(e.target.value)}
                                                    className="w-full px-2 py-1.5 rounded border text-xs"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>To</label>
                                                <input
                                                    type="date"
                                                    value={accountShellPerfDraftTo}
                                                    onChange={(e) => setAccountShellPerfDraftTo(e.target.value)}
                                                    className="w-full px-2 py-1.5 rounded border text-xs"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                className="w-full py-2 rounded text-[10px] font-black uppercase tracking-wide"
                                                style={{ backgroundColor: colors.primary, color: '#000' }}
                                                onClick={() => {
                                                    const f = accountShellPerfDraftFrom.trim().slice(0, 10);
                                                    const t = accountShellPerfDraftTo.trim().slice(0, 10);
                                                    if (!f || !t || f > t) return;
                                                    setAccountShellPerfRange({ from: f, to: t });
                                                    setShowAccountShellPerfPicker(false);
                                                }}
                                            >
                                                Apply Range
                                            </button>
                                            <button
                                                type="button"
                                                className="w-full py-2 rounded border text-[10px] font-black uppercase tracking-wide"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                                onClick={() => {
                                                    const d = getDefaultAccountPerformanceRange();
                                                    setAccountShellPerfRange(d);
                                                    setAccountShellPerfDraftFrom(d.from);
                                                    setAccountShellPerfDraftTo(d.to);
                                                    setShowAccountShellPerfPicker(false);
                                                }}
                                            >
                                                RESET TO CURRENT YEAR
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : null
                        ) : currentView === 'crm' ? (
                            <div className="flex items-center justify-center gap-2 w-full overflow-x-auto whitespace-nowrap px-1">
                                <div
                                    className="flex items-center gap-1 p-1 rounded-lg border transition-colors duration-300 shrink-0"
                                    style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setCrmSalesPeriod((p) => ({
                                                ...p,
                                                mode: 'month',
                                                quarter: null,
                                            }))
                                        }
                                        className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${crmSalesPeriod.mode === 'month' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                        style={{
                                            color: crmSalesPeriod.mode === 'month' ? colors.primary : colors.textMuted,
                                        }}
                                    >
                                        Month View
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setCrmSalesPeriod((p) => ({
                                                ...p,
                                                mode: 'year',
                                                quarter: null,
                                            }))
                                        }
                                        className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${crmSalesPeriod.mode === 'year' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                        style={{
                                            color: crmSalesPeriod.mode === 'year' ? colors.primary : colors.textMuted,
                                        }}
                                    >
                                        Year View
                                    </button>
                                </div>
                                <select
                                    value={crmSalesPeriod.month}
                                    onChange={(e) =>
                                        setCrmSalesPeriod((p) => ({
                                            ...p,
                                            month: Number(e.target.value) || 1,
                                            mode: 'month',
                                            quarter: null,
                                        }))
                                    }
                                    className="text-[10px] font-bold px-2 py-1.5 rounded border outline-none w-[4.5rem] shrink-0"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    aria-label="Month"
                                >
                                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
                                        (m, idx) => (
                                            <option key={m} value={idx + 1}>
                                                {m}
                                            </option>
                                        )
                                    )}
                                </select>
                                <select
                                    value={crmSalesPeriod.year}
                                    onChange={(e) =>
                                        setCrmSalesPeriod((p) => ({
                                            ...p,
                                            year: Number(e.target.value) || new Date().getFullYear(),
                                        }))
                                    }
                                    className="text-[10px] font-bold px-2 py-1.5 rounded border outline-none w-[4.8rem] shrink-0"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    aria-label="Year"
                                >
                                    {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                                </select>
                                {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((qk) => {
                                    const months = CRM_QUARTER_MONTH_BLOCKS[qk];
                                    return (
                                        <button
                                            key={qk}
                                            type="button"
                                            onClick={() =>
                                                setCrmSalesPeriod((prev) => ({
                                                    ...prev,
                                                    mode: 'quarter',
                                                    quarter: qk,
                                                    month: months[2],
                                                    year: prev.year,
                                                }))
                                            }
                                            className={`text-[10px] px-2 py-1 rounded border font-bold uppercase tracking-wide hover:bg-white/5 shrink-0 ${
                                                crmSalesPeriod.mode === 'quarter' && crmSalesPeriod.quarter === qk
                                                    ? 'bg-white/10'
                                                    : ''
                                            }`}
                                            style={{
                                                borderColor: colors.border,
                                                color:
                                                    crmSalesPeriod.mode === 'quarter' && crmSalesPeriod.quarter === qk
                                                        ? colors.primary
                                                        : colors.textMuted,
                                            }}
                                            title={`Filter to ${qk} of selected year`}
                                        >
                                            {qk}
                                        </button>
                                    );
                                })}
                                <div className="w-[1px] h-5 bg-white/10 mx-1 hidden sm:block" aria-hidden />
                                <div
                                    className="flex items-center gap-1 p-1 rounded-lg border transition-colors duration-300 shrink-0"
                                    style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setCrmSubView('activities')}
                                        className={`p-1.5 rounded transition-all ${crmSubView === 'activities' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                        title="Activities"
                                    >
                                        <ClipboardList
                                            size={14}
                                            style={{ color: crmSubView === 'activities' ? colors.primary : colors.textMuted }}
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCrmSubView('pipeline')}
                                        className={`p-1.5 rounded transition-all ${crmSubView === 'pipeline' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                        title="Pipeline View"
                                    >
                                        <Grid
                                            size={14}
                                            style={{ color: crmSubView === 'pipeline' ? colors.primary : colors.textMuted }}
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCrmSubView('dashboard')}
                                        className={`p-1.5 rounded transition-all ${crmSubView === 'dashboard' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                        title="Sales Funnel Dashboard"
                                    >
                                        <BarChart3
                                            size={14}
                                            style={{
                                                color: crmSubView === 'dashboard' ? colors.primary : colors.textMuted,
                                            }}
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCrmSubView('list')}
                                        className={`p-1.5 rounded transition-all ${crmSubView === 'list' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                        title="Table List View"
                                    >
                                        <List
                                            size={14}
                                            style={{ color: crmSubView === 'list' ? colors.primary : colors.textMuted }}
                                        />
                                    </button>
                                </div>
                                {(crmSubView === 'pipeline' || crmSubView === 'dashboard') && (
                                    <select
                                        value={crmViewMode}
                                        onChange={(e) => setCrmViewMode(e.target.value as 'account' | 'request')}
                                        className="text-[10px] font-bold px-2 py-1.5 rounded-lg border outline-none shrink-0"
                                        style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.textMain }}
                                    >
                                        <option value="account">View by Account</option>
                                        <option value="request">View by Request</option>
                                    </select>
                                )}
                            </div>
                        ) : currentView === 'settings' ? (
                            null
                        ) : currentView === 'reports' ? (
                            null
                        ) : currentView === 'contracts' ? (
                            null
                        ) : currentView === 'todo' ? (
                            null
                        ) : (
                            /* DASHBOARD HEADER CONTROLS (Default) */
                            <div className="relative flex items-center gap-1 p-1 rounded-lg border transition-colors duration-300 overflow-visible max-w-full" style={{ backgroundColor: colors.card, borderColor: colors.border }} ref={dashboardPickerRef}>
                                <button
                                    onClick={() => setShowDatePicker(!showDatePicker)}
                                    className="p-1 rounded hover:bg-white/10 transition-colors"
                                >
                                    <CalendarDays size={14} style={{ color: dashboardPeriodMode === 'custom' ? colors.primary : colors.textMuted }} className="shrink-0" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDashboardNowAnchor(Date.now());
                                        setDashboardPeriodMode('mtd');
                                    }}
                                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${dashboardPeriodMode === 'mtd' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                    style={{ color: dashboardPeriodMode === 'mtd' ? colors.primary : colors.textMuted }}
                                >
                                    MTD
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDashboardNowAnchor(Date.now());
                                        setDashboardPeriodMode('ytd');
                                    }}
                                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${dashboardPeriodMode === 'ytd' ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                    style={{ color: dashboardPeriodMode === 'ytd' ? colors.primary : colors.textMuted }}
                                >
                                    YTD
                                </button>


                                {/* Date Picker Popup */}
                                {showDatePicker && (
                                    <div className="absolute top-full left-0 mt-2 p-3 rounded-xl border shadow-2xl z-50 flex flex-col gap-3 min-w-[200px]"
                                        style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] uppercase tracking-wider" style={{ color: colors.textMuted }}>From</label>
                                            <input
                                                type="date"
                                                value={customDates.start}
                                                onChange={(e) => setCustomDates(prev => ({ ...prev, start: e.target.value }))}
                                                className="w-full text-xs p-1.5 rounded bg-black/20 border outline-none focus:border-opacity-100 transition-colors"
                                                style={{ color: colors.textMain, borderColor: colors.border }}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] uppercase tracking-wider" style={{ color: colors.textMuted }}>To</label>
                                            <input
                                                type="date"
                                                value={customDates.end}
                                                onChange={(e) => setCustomDates(prev => ({ ...prev, end: e.target.value }))}
                                                className="w-full text-xs p-1.5 rounded bg-black/20 border outline-none focus:border-opacity-100 transition-colors"
                                                style={{ color: colors.textMain, borderColor: colors.border }}
                                            />
                                        </div>
                                        <button
                                            onClick={() => { setDashboardPeriodMode('custom'); setShowDatePicker(false); }}
                                            className="w-full py-1.5 rounded text-[10px] uppercase font-bold tracking-wide mt-1 hover:brightness-110 transition-all"
                                            style={{ backgroundColor: colors.primary, color: '#000' }}
                                        >
                                            Apply Range
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}


                    </div>

                    {/* Right: User & Tools (Desktop Only) */}
                    <div className="hidden md:flex items-center gap-4">
                        {currentView === 'crm' && (
                            <>
                                {(taskAssignableUsers || []).length > 0 && (
                                    <select
                                        value={crmCreatedByFilterId}
                                        onChange={(e) => setCrmCreatedByFilterId(e.target.value)}
                                        className="text-[10px] font-bold px-2 py-1.5 rounded-lg border outline-none min-w-[9rem] max-w-[13rem] truncate"
                                        style={{
                                            backgroundColor: colors.card,
                                            borderColor: colors.border,
                                            color: colors.textMain,
                                        }}
                                        aria-label="Filter sales calls by creator"
                                        title="Show only sales calls created by this user"
                                    >
                                        <option value="">All users</option>
                                        {(taskAssignableUsers || []).map((u: { id: string; name: string }) => (
                                            <option key={u.id} value={u.id}>
                                                {u.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                
                                <div className="w-[1px] h-6" style={{ backgroundColor: colors.border }} aria-hidden />
                            </>
                        )}
                        <div className="flex items-center gap-2 mr-2">
                            <button
                                onClick={cycleTheme}
                                className="p-1.5 rounded-md border transition-all hover:scale-105 active:scale-95"
                                style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.primary }}
                                title={`Switch Theme (Current: ${theme.name})`}
                            >
                                <Palette size={16} />
                            </button>
                        </div>


                        {/* Period Comparison - Only show on Dashboard */}
                        {currentView === 'dashboard' && (
                            <>
                                <div className="text-right">
                                    <p className="text-[9px] uppercase tracking-wide" style={{ color: colors.textMuted }}>Period Comparison</p>
                                    <p className="text-[10px] font-mono" style={{ color: colors.green }}>{dashboardComparisonLabel}</p>
                                </div>
                                <div className="w-[1px] h-8" style={{ backgroundColor: colors.border }}></div>
                            </>
                        )}
                        <div className="flex items-center gap-3">
                            <AlertsBell
                                colors={colors}
                                bellSize={18}
                                panelRef={alertsPanelRef}
                                open={alertsPanelOpen}
                                setOpen={setAlertsPanelOpen}
                                activeAlerts={activeAlerts}
                                getAlertRowStyle={getAlertRowStyle}
                                onDone={handleAlertDone}
                                onViewRequest={handleViewAlertRequest}
                            />
                            <select
                                value={currentCurrency}
                                onChange={(e) => handleCurrencyChange(e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg border text-[11px] font-bold bg-black/20 outline-none transition-colors"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                                title="Currency"
                            >
                                {CURRENCY_OPTIONS.map((code) => (
                                    <option key={code} value={code}>{code}</option>
                                ))}
                            </select>

                            {/* Profile Dropdown */}
                            <div className="relative" ref={userDropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                                    className="flex items-center gap-2 p-1 pr-3 rounded-full border transition-colors hover:bg-white/5"
                                    style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                >
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black border shadow-sm"
                                        style={userAvatarGradientStyle}>
                                        {userInitials}
                                    </div>
                                    <div className="text-left hidden lg:block">
                                        <p className="text-[10px] font-bold leading-tight" style={{ color: colors.textMain }}>{currentUser?.name || 'User'}</p>
                                        <p className="text-[8px] font-medium opacity-50 uppercase tracking-tighter" style={{ color: colors.textMuted }}>{currentUser?.role || 'Staff'}</p>
                                    </div>
                                    <ChevronDown size={14} style={{ color: colors.textMuted }} className={`transition-transform duration-300 ${userDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Dropdown Menu */}
                                {userDropdownOpen && (
                                    <div className="absolute top-full right-0 mt-3 w-72 rounded-2xl border shadow-2xl overflow-hidden z-[100]"
                                        style={{ backgroundColor: colors.card, borderColor: colors.border }}>

                                        {/* User Profile Header */}
                                        <div className="p-5 border-b" style={{ borderColor: colors.border, background: `linear-gradient(to bottom right, ${colors.primary}05, transparent)` }}>
                                            <div className="flex items-center gap-4 mb-4">
                                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-black shadow-lg"
                                                    style={userAvatarGradientStyle}>
                                                    {userInitials}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-base leading-tight" style={{ color: colors.textMain }}>{currentUser?.name || 'User'}</h4>
                                                    <p className="text-xs opacity-60 font-medium" style={{ color: colors.textMuted }}>{currentUser?.email || 'user@hms.com'}</p>
                                                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border"
                                                        style={{ borderColor: colors.primary + '30', color: colors.primary, backgroundColor: colors.primary + '10' }}>
                                                        {currentUser?.role || 'Staff'}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => { setCurrentView('settings'); setUserDropdownOpen(false); }}
                                                className="w-full py-2.5 rounded-xl border font-bold text-xs uppercase tracking-widest transition-all hover:bg-white/5 active:scale-95"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                My Profile Settings
                                            </button>
                                        </div>

                                        {/* Property Switcher */}
                                        <div className="p-4 space-y-3">
                                            <h5 className="text-[9px] uppercase font-black tracking-[0.2em] opacity-40 px-1" style={{ color: colors.textMain }}>Switch Property</h5>
                                            <div className="space-y-1">
                                                {properties.filter((prop: any) => canAccessProperty(prop)).map(prop => (
                                                    <button
                                                        key={prop.id}
                                                        onClick={() => { setActiveProperty(prop); setUserDropdownOpen(false); }}
                                                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all border ${activeProperty?.id === prop.id ? 'shadow-md scale-[1.02]' : 'hover:bg-white/5 opacity-60 hover:opacity-100'}`}
                                                        style={{
                                                            backgroundColor: activeProperty?.id === prop.id ? colors.primary + '10' : 'transparent',
                                                            borderColor: activeProperty?.id === prop.id ? colors.primary + '40' : 'transparent'
                                                        }}
                                                    >
                                                        <div className={`p-2 rounded-lg ${activeProperty?.id === prop.id ? 'bg-primary text-black' : 'bg-black/20 text-muted'}`}
                                                            style={activeProperty?.id === prop.id ? { backgroundColor: colors.primary, color: '#000' } : { color: colors.textMuted }}>
                                                            <MapPin size={14} />
                                                        </div>
                                                        <div className="text-left flex-1 min-w-0">
                                                            <p className={`text-xs font-bold truncate ${activeProperty?.id === prop.id ? '' : 'opacity-80'}`} style={{ color: colors.textMain }}>{prop.name}</p>
                                                            <p className="text-[9px] opacity-40 uppercase font-medium" style={{ color: colors.textMuted }}>{prop.location || 'HQ'}</p>
                                                        </div>
                                                        {activeProperty?.id === prop.id && (
                                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.primary }}></div>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Logout Button */}
                                        <div className="p-2 pt-0">
                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl transition-all text-red-500 hover:bg-red-500/10 font-bold text-xs uppercase tracking-widest"
                                            >
                                                <LogOut size={16} />
                                                Sign Out Account
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* 2. Main Content Area — calendar fills viewport and scrolls inside day cells; other views scroll the main pane */}
                <main
                    className={`flex-1 p-3 min-h-0 relative ${
                        currentView === 'calendar' ? 'overflow-hidden flex flex-col min-h-0' : 'overflow-y-auto'
                    }`}
                >
                    <div
                        className={`w-full min-h-0 ${
                            currentView === 'calendar' ? 'flex-1 flex flex-col min-h-0 h-full' : 'h-auto'
                        }`}
                    >
                    <Suspense fallback={<PageLoadFallback />}>
                    {currentView === 'calendar' ? (
                        <CalendarView
                            theme={theme}
                            currentDate={currentCalendarDate}
                            viewMode={calendarViewMode}
                            sharedRequests={sharedRequests}
                            crmLeadsFlat={calendarCrmLeadsFlat}
                            activeProperty={activeProperty}
                            onCalendarItemClick={(payload: any) => setCalendarDetailModal(payload)}
                        />
                    ) : currentView === 'events' ? (
                        <EventsView
                            theme={theme}
                            subView={eventsSubView}
                            filterRange={eventsFilterRange}
                            sharedRequests={sharedRequests}
                            onPatchRequestStatus={patchRequestStatus}
                            onOpenRequest={(id: string) => {
                                setPendingOpenRequestId(String(id));
                                setRequestsSubView('list');
                                setCurrentView('requests');
                            }}
                            onOpenRequestOpts={(id: string) => {
                                setEventsOptsHostMounted(true);
                                setEventsOptsBootstrapId(String(id));
                            }}
                            activeProperty={activeProperty}
                            accounts={accounts}
                            onRefreshRequests={refreshSharedRequests}
                            readOnly={!canMutateOperational(currentUser)}
                            currency={currentCurrency}
                        />
                    ) : currentView === 'accounts' ? (
                        <AccountsPage
                            theme={theme}
                            accounts={accounts}
                            setAccounts={setAccounts}
                            sharedRequests={sharedRequests}
                            crmLeads={crmLeads}
                            currentUser={currentUser}
                            activeProperty={activeProperty}
                            currency={currentCurrency}
                            accountTypeOptions={propertyAccountTypeLabels}
                            shellAccountPerformanceRange={accountShellPerfRange}
                            onShellAccountPerformanceRangeChange={setAccountShellPerfRange}
                            onAccountProfileShellStateChange={handleAccountProfileShellState}
                            onOpenRequest={(id) => {
                                setPendingOpenRequestId(id);
                                setRequestsSubView('list');
                                setCurrentView('requests');
                            }}
                            onNavigateToCrmWithAccount={(accountId) => {
                                setPendingCrmAccountId(accountId);
                                setPendingCrmAction('add_call');
                                setCurrentView('crm');
                            }}
                            onNavigateToContractsWithAccount={(accountId) => {
                                setPendingContractsAccountId(accountId);
                                setCurrentView('contracts');
                            }}
                            setCrmLeads={setCrmLeads}
                            setSharedRequests={setSharedRequests}
                            assignableUsersForAccounts={taskAssignableUsers}
                            segmentOptions={propertySegmentLabels}
                            promotionOptions={promotions}
                            onAfterRequestsMutate={refreshSharedRequests}
                        />
                    ) : currentView === 'promotions' ? (
                        <PromotionsPage
                            theme={theme}
                            activeProperty={activeProperty}
                            promotions={promotions}
                            setPromotions={setPromotions}
                            accounts={accounts}
                            setAccounts={setAccounts}
                            sharedRequests={sharedRequests}
                            segmentOptions={propertySegmentLabels}
                            accountTypeOptions={propertyAccountTypeLabels}
                            currency={currentCurrency}
                            canCreate={canCreatePromotions(currentUser)}
                            canEdit={canEditPromotions(currentUser)}
                            canDelete={canDeletePromotions(currentUser)}
                            currentUser={currentUser}
                        />
                    ) : currentView === 'crm' ? (
                        <CRM
                            theme={theme}
                            externalView={crmSubView}
                            crmViewMode={crmViewMode}
                            initialAction={pendingCrmAction}
                            activeProperty={activeProperty}
                            accounts={accounts}
                            setAccounts={setAccounts}
                            salesCalls={crmState.salesCalls}
                            setSalesCalls={(updater) =>
                                setCrmState((prev) => ({
                                    ...prev,
                                    salesCalls:
                                        typeof updater === 'function' ? updater(prev.salesCalls) : updater,
                                }))
                            }
                            pipeline={crmState.pipeline}
                            setPipeline={(updater) =>
                                setCrmState((prev) => ({
                                    ...prev,
                                    pipeline: typeof updater === 'function' ? updater(prev.pipeline) : updater,
                                }))
                            }
                            sharedRequests={sharedRequests}
                            currentUser={currentUser}
                            pendingCrmAccountId={pendingCrmAccountId}
                            onConsumedPendingCrmAccount={() => setPendingCrmAccountId(null)}
                            pendingOpenLeadId={pendingOpenCrmLeadId}
                            onConsumedPendingOpenLead={() => setPendingOpenCrmLeadId(null)}
                            onNavigateToRequest={(rid) => {
                                setPendingOpenRequestId(rid);
                                setRequestsSubView('list');
                                setCurrentView('requests');
                            }}
                            onConsumedInitialAction={() => setPendingCrmAction(null)}
                            accountTypeOptions={propertyAccountTypeLabels}
                            crmSalesPeriod={crmSalesPeriod}
                            createdByUserFilterId={crmCreatedByFilterId}
                            onCreatedByUserFilterIdChange={setCrmCreatedByFilterId}
                            openAddSalesCallNonce={crmAddCallNonce}
                            currency={currentCurrency}
                            crmFilterUsers={taskAssignableUsers}
                            propertyFinancialKpis={propertyFinancialKpis}
                            setSharedRequests={setSharedRequests}
                            assignableUsersForAccounts={taskAssignableUsers}
                            onNavigateToNewRequest={(accountId, chainAgreement, meta) => {
                                setPendingRequestAccountId(accountId);
                                if (meta) {
                                    setPendingPipelineLink({
                                        accountId: String(meta.accountId || accountId),
                                        periodMonth: String(meta.periodMonth || ''),
                                        pipelineCardId: meta.pipelineCardId,
                                        company: meta.company,
                                        contact: meta.contact,
                                        tags: meta.tags,
                                        sourceCallIds: meta.sourceCallIds,
                                        propertyId: meta.propertyId,
                                    });
                                    if (meta.contactId || meta.contact) {
                                        setPendingRequestContactFromCall({
                                            name: String(meta.contact || ''),
                                            contactId: String(meta.contactId || ''),
                                        });
                                    }
                                }
                                if (chainAgreement) setPendingAgreementAfterRequestAccountId(accountId);
                                setCurrentView('requests');
                                navigateRequestsSubView('new_request');
                            }}
                            onNavigateToNewAgreement={(accountId, meta) => {
                                setPendingContractsAccountId(accountId);
                                if (meta) {
                                    setPendingAgreementPipelineLink({
                                        accountId: String(meta.accountId || accountId),
                                        periodMonth: String(meta.periodMonth || ''),
                                        extras: meta,
                                    });
                                }
                                setCurrentView('contracts');
                            }}
                            onPatchRequestStatus={patchRequestStatus}
                            segmentOptions={propertySegmentLabels}
                            promotionOptions={promotions}
                            onAfterRequestsMutate={refreshSharedRequests}
                        />
                    ) : currentView === 'contracts' ? (
                        <Contracts
                            theme={theme}
                            activeProperty={activeProperty}
                            accounts={accounts}
                            setAccounts={setAccounts}
                            currentUser={currentUser}
                            accountTypeOptions={propertyAccountTypeLabels}
                            canDeleteContracts={canDeleteContracts(currentUser)}
                            canDeleteContractTemplates={canDeleteContractTemplates(currentUser)}
                            initialAccountId={pendingContractsAccountId}
                            onConsumedInitialAccountId={() => setPendingContractsAccountId(null)}
                            onAgreementGenerated={(templateName, accountId) => {
                                const link = pendingAgreementPipelineLink;
                                if (!link || String(link.accountId) !== String(accountId)) return;
                                setCrmState((prev) => ({
                                    ...prev,
                                    pipeline: linkAgreementTemplateToMonthlyPipelineCard(
                                        prev.pipeline,
                                        link.accountId,
                                        link.periodMonth,
                                        templateName,
                                        link.extras
                                    ),
                                }));
                                setPendingAgreementPipelineLink(null);
                            }}
                        />
                    ) : currentView === 'reports' ? (
                        <Reports
                            theme={theme}
                            activeProperty={activeProperty}
                            propertyTaxes={propertyTaxes}
                            sharedRequests={sharedRequests}
                            accounts={accounts}
                            crmLeads={crmLeads}
                            tasks={tasks}
                            currency={currentCurrency}
                            currentUser={currentUser}
                        />
                    ) : currentView === 'settings' ? (
                        <SettingsPage
                            theme={theme}
                            currentUser={currentUser}
                            activeProperty={activeProperty}
                            sharedRequests={sharedRequests}
                            accounts={accounts}
                            crmLeads={crmLeads}
                            tasks={tasks}
                            onOpenTasks={() => setCurrentView('todo')}
                            currency={currentCurrency}
                            onUsersDirectoryChange={refreshSystemUsers}
                            onRequireReLogin={terminateSessionAndShowLogin}
                        />
                    ) : currentView === 'todo' ? (
                        <ToDoView tasks={tasks} setTasks={setTasks} handleOpenTaskModal={handleOpenTaskModal} handleToggleTaskComplete={handleToggleTaskComplete} colors={colors} theme={theme} activePropertyId={activeProperty?.id} canMutateOperational={canMutateOperational(currentUser)} currentUser={currentUser} />
                    ) : currentView === 'requests' ? (
                        <RequestsManager key={`requests-${requestsSubView}-${requestsNavNonce}`} theme={theme} subView={requestsSubView} searchParams={requestSearchParams} setSearchParams={(p: any) => {
                            if (p && p.subView) {
                                setRequestsSubView(p.subView);
                            }
                            setRequestSearchParams((prev: any) => (typeof p === 'function' ? p(prev) : { ...(prev || {}), ...p }));
                        }} initialRequestType={pendingRequestType} initialAccountId={pendingRequestAccountId} initialContactFromCall={pendingRequestContactFromCall} onConsumedInitialAccountId={() => setPendingRequestAccountId(null)} onConsumedInitialContactFromCall={() => setPendingRequestContactFromCall(null)} onRequestSaved={handleCrmRequestSaved} onRequestDeleted={handleCrmRequestDeleted} onRequestWizardFinished={() => {
                            const aid = pendingAgreementAfterRequestAccountId;
                            if (aid) {
                                setPendingAgreementAfterRequestAccountId(null);
                                setPendingContractsAccountId(aid);
                                setCurrentView('contracts');
                            }
                        }} activeProperty={activeProperty} accounts={accounts} setAccounts={setAccounts} sharedRequestsSeed={sharedRequests} liveUpdateSignal={requestsLiveVersion} pendingOpenRequestId={pendingOpenRequestId} onConsumedPendingOpenRequest={() => setPendingOpenRequestId(null)} onAfterRequestsMutate={refreshSharedRequests} segmentOptions={propertySegmentLabels} accountTypeOptions={propertyAccountTypeLabels} canDeleteRequest={canDeleteRequests(currentUser)} canDeleteRequestPayments={canDeleteRequestPayments(currentUser)} readOnlyOperational={!canMutateOperational(currentUser)} currentUser={currentUser} currency={currentCurrency} assignableUsersForProperty={taskAssignableUsers} promotionOptions={promotions} canLinkRequestPromotions={canLinkRequestPromotions(currentUser)} />
                    ) : (
                        /* DASHBOARD VIEW */
                        <div className="grid grid-cols-1 md:grid-cols-12 auto-rows-min gap-3 pb-4">
                            <DashboardHubShell
                                key={String(currentUser?.id ?? currentUser?.username ?? 'anon')}
                                colors={colors}
                                activeTab={hubTab}
                                onTabChange={setHubTab}
                                data={{
                                    currency: currentCurrency,
                                    activeProperty: activeProperty ? { id: activeProperty.id, name: (activeProperty as any).name } : null,
                                    properties: properties,
                                    requests: scopedRequests,
                                    accounts: accounts,
                                    crmState: crmState,
                                    promotions: promotions,
                                    financials: propertyFinancialKpis,
                                    taxes: propertyTaxes,
                                    users: systemUsers,
                                    currentUser: currentUser,
                                    feedLiveVersion: feedLiveVersion,
                                    onlineUsers: onlineUsers,
                                }}
                            >

                            {/* ROW 1: PRIMARY KPIs */}
                            <div className="col-span-1 md:col-span-12 grid grid-cols-2 md:grid-cols-4 gap-3">
                                <KPICard label="Total Requests" value={dashboardStats.requests} subtext={dashboardStats.requestsSubtext} icon={CalendarCheck} colorKey="blue" theme={theme} />
                                <KPICard label="Total Revenue" value={dashboardStats.revenue} subtext={dashboardStats.trend} icon={DollarSign} isPrimary theme={theme} />
                                <KPICard label="Avg Value" value={dashboardStats.avgValue} subtext={dashboardStats.avgSubtext} icon={TrendingUp} colorKey="cyan" theme={theme} />
                                <KPICard label="Accounts" value={dashboardStats.accounts} subtext="Active Clients" icon={Users} colorKey="blue" theme={theme} />
                            </div>

                            {/* ROW 2: SECONDARY METRICS */}
                            <div className="col-span-1 md:col-span-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 gap-2">
                                <MiniStatCard label="ACT" value={dashboardStats.status.act} colorKey="#059669" colors={colors} />
                                <MiniStatCard label="DEF" value={dashboardStats.status.def} colorKey="green" colors={colors} />
                                <MiniStatCard label="TENT" value={dashboardStats.status.tent} colorKey="blue" colors={colors} />
                                <MiniStatCard label="ACC" value={dashboardStats.status.acc} colorKey="yellow" colors={colors} />
                                <MiniStatCard label="INQ" value={dashboardStats.status.inq} colorKey="textMuted" colors={colors} />
                                <MiniStatCard label="CXL" value={dashboardStats.status.cxl} colorKey="red" colors={colors} />
                                <MiniStatCard label="Lost AMT" value={dashboardStats.status.lostAmt} colorKey="red" colors={colors} />
                                <MiniStatCard label="Paid" value={dashboardStats.status.paid} colorKey="green" colors={colors} />
                                <MiniStatCard label="Signed" value={dashboardStats.status.signed} colorKey="green" colors={colors} />
                                <MiniStatCard label="Calls" value={dashboardStats.status.calls} colorKey="cyan" colors={colors} />
                            </div>

                            {/* ROW 3: CHARTS */}
                            <div className="col-span-1 md:col-span-8 h-72 md:h-72">
                                <Card
                                    className="h-full"
                                    tabs={['Performance', 'Revenue', 'Requests', 'Rooms', 'MICE', 'Status']}
                                    activeTab={chartTab}
                                    onTabChange={setChartTab}
                                    actionIcon={MoreHorizontal}
                                    colors={colors}
                                    extraHeaderAction={
                                        <ChartVsCompareControls
                                            chartTab={chartTab === 'Events' ? 'MICE' : chartTab}
                                            enabled={chartVsEnabled}
                                            onEnabledChange={setChartVsEnabled}
                                            year={chartVsYear}
                                            onYearChange={setChartVsYear}
                                            colors={colors}
                                        />
                                    }
                                >
                                    <div className="w-full h-full p-2">
                                        <MainChart
                                            chartTab={chartTab}
                                            chartData={chartDataForDisplay}
                                            colors={colors}
                                            performanceData={performanceData}
                                            currency={currentCurrency}
                                            chartVsEnabled={chartVsEnabled}
                                            chartVsYear={chartVsYear}
                                        />
                                    </div>
                                </Card>
                            </div>

                            <div className="col-span-1 md:col-span-4 h-72 md:h-72">
                                <Card className="h-full" tabs={['Segments', 'Account Type']} activeTab={distTab} onTabChange={setDistTab} actionIcon={Activity} colors={colors}>
                                    <div className="w-full h-full p-2">
                                        <DistributionChart distTab={distTab} segmentData={dashboardSegmentChartData} accountTypeData={dashboardAccountTypeChartData} colors={colors} />
                                    </div>
                                </Card>
                            </div>

                            {/* ROW 4: LISTS & TABLES */}
                            <div className="col-span-1 md:col-span-8 h-64 md:h-64">
                                <Card
                                    className="h-full"
                                    tabs={['Tasks', 'Requests', 'Sales Calls', 'ACC. Production']}
                                    activeTab={feedTab}
                                    onTabChange={setFeedTab}
                                    actionIcon={Search}
                                    onActionIconClick={() => setDashboardFeedSearchOpen((o) => !o)}
                                    headerSearch={{
                                        open: dashboardFeedSearchOpen,
                                        value: dashboardFeedSearchQuery,
                                        onChange: setDashboardFeedSearchQuery,
                                        placeholder:
                                            feedTab === 'ACC. Production'
                                                ? 'Account name'
                                                : feedTab === 'Tasks'
                                                  ? 'Task or client'
                                                  : feedTab === 'Sales Calls'
                                                    ? 'Activity or client'
                                                    : 'Client or type',
                                    }}
                                    colors={colors}
                                    extraHeaderAction={feedTab === 'Tasks' && canMutateOperational(currentUser) && (
                                        <button
                                            onClick={() => handleOpenTaskModal()}
                                            className="p-1 rounded bg-white/10 hover:bg-white/20 transition-all hover:scale-110 active:scale-95 shadow-sm"
                                            style={{ color: colors.primary }}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    )}
                                >
                                    <div className="overflow-y-auto h-full scrollbar-thin relative" style={{ scrollbarColor: `${colors.border} transparent`, backgroundColor: feedTab === 'Tasks' ? colors.bg + '40' : 'transparent' }}>
                                        <table className="w-full text-left border-collapse">
                                            <thead className="sticky top-0 z-10 text-[9px] uppercase tracking-wider font-semibold" style={{ backgroundColor: colors.card, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>
                                                <tr>
                                                    {feedTab === 'ACC. Production' ? (
                                                        <>
                                                            <th className="px-4 py-2 border-b" style={{ borderColor: colors.border }}>Account Name</th>
                                                            <th className="px-4 py-2 border-b hidden sm:table-cell" style={{ borderColor: colors.border }}>Profile Type</th>
                                                            <th className="px-4 py-2 border-b" style={{ borderColor: colors.border }}>Revenue</th>
                                                            <th className="px-4 py-2 border-b text-right" style={{ borderColor: colors.border }}>Bookings</th>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <th className="px-4 py-2 border-b" style={{ borderColor: colors.border }}>{feedTab === 'Tasks' ? 'Task' : (feedTab === 'Sales Calls' ? 'Activity' : 'Client')}</th>
                                                            <th className="px-4 py-2 border-b hidden sm:table-cell" style={{ borderColor: colors.border }}>{feedTab === 'Tasks' ? 'Client/Context' : (feedTab === 'Sales Calls' ? 'Client' : 'Type')}</th>
                                                            {feedTab === 'Tasks' && <th className="px-4 py-2 border-b" style={{ borderColor: colors.border }}>Assign To</th>}
                                                            <th className="px-4 py-2 border-b" style={{ borderColor: colors.border }}>{feedTab === 'Tasks' ? 'Due Date' : 'Date'}</th>
                                                            <th className="px-4 py-2 border-b text-right" style={{ borderColor: colors.border }}>{feedTab === 'Tasks' ? 'Priority' : 'Status'}</th>
                                                        </>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="text-xs">
                                                {(feedTab === 'Requests'
                                                    ? dashboardFeedRecentRequests
                                                    : feedTab === 'Sales Calls'
                                                        ? dashboardFeedSalesCalls
                                                        : feedTab === 'Tasks'
                                                            ? dashboardFeedTasksFiltered
                                                            : dashboardFeedAccountProfiles).map((item: any, i: number) => (
                                                    <tr key={item.id || i} className="transition-all group cursor-pointer border-b last:border-0 hover:bg-white/5 active:bg-white/10"
                                                        style={{ borderColor: colors.border }}
                                                        onClick={() => feedTab === 'Tasks' ? handleOpenTaskModal(item) : null}
                                                    >
                                                        {feedTab === 'ACC. Production' ? (
                                                            <>
                                                                <td className="px-4 py-2 font-medium" style={{ color: colors.textMain }}>{item.client}</td>
                                                                <td className="px-4 py-2 hidden sm:table-cell" style={{ color: colors.textMuted }}>{item.type}</td>
                                                                <td className="px-4 py-2 font-mono" style={{ color: colors.primary }}>{item.revenue}</td>
                                                                <td className="px-4 py-2 text-right font-mono" style={{ color: colors.textMain }}>{item.bookings}</td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td className="px-4 py-2 font-medium flex items-center gap-3" style={{ color: colors.textMain }}>
                                                                    {feedTab === 'Tasks' && (
                                                                        <button
                                                                            onClick={(e) => handleToggleTaskComplete(item.id, e)}
                                                                            className="w-4 h-4 rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center shrink-0"
                                                                            style={{ borderColor: colors.primary + '60' }}
                                                                        >
                                                                            <div className="w-2 h-2 rounded-full opacity-0 hover:opacity-100 transition-opacity" style={{ backgroundColor: colors.primary }} />
                                                                        </button>
                                                                    )}
                                                                    <span>{feedTab === 'Requests' ? item.client : (feedTab === 'Tasks' ? item.task : item.activity)}</span>
                                                                </td>
                                                                <td className="px-4 py-2 hidden sm:table-cell" style={{ color: colors.textMuted }}>
                                                                    {feedTab === 'Requests' ? item.type : item.client}
                                                                </td>
                                                                {feedTab === 'Tasks' && (
                                                                    <td className="px-4 py-2" style={{ color: colors.textMain }}>
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-black shadow-sm shrink-0"
                                                                                style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.orange})` }}>
                                                                                {taskAssigneesAvatarLetters(item)}
                                                                            </div>
                                                                            <span className="truncate max-w-[100px]" title={taskAssigneeNamesList(item).join(', ')}>
                                                                                {taskAssigneeNamesList(item).join(', ') || '—'}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                )}
                                                                <td className="px-4 py-2 font-mono" style={{ color: colors.textMuted }}>{item.date}</td>
                                                                <td className="px-4 py-2 text-right">
                                                                    {feedTab === 'Requests' ? <StatusBadge status={item.status} theme={theme} /> : (
                                                                        feedTab === 'Tasks' ? <StatusBadge status={item.priority} theme={theme} /> : <span className="text-[10px]" style={{ color: colors.textMuted }}>{item.result}</span>
                                                                    )}
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            </div>

                            <div className="col-span-1 md:col-span-4 h-64 md:h-64">
                                <Card className="h-full" title="Request Distribution" actionIcon={Filter} colors={colors}>
                                    <div className="w-full h-full p-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={dashboardRequestDistributionData}
                                                    cx="50%"
                                                    cy="48%"
                                                    innerRadius={40}
                                                    outerRadius={60}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                    label={false}
                                                >
                                                    {dashboardRequestDistributionData.map((entry, index) => (
                                                        <Cell key={`req-dist-${entry.name}-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    {...rechartsTooltipThemeProps(colors)}
                                                    formatter={(value: any, _n: any, item: any) => [
                                                        `${value} request${value === 1 ? '' : 's'}`,
                                                        item?.payload?.name ?? 'Type',
                                                    ]}
                                                />
                                                <Legend
                                                    verticalAlign="bottom"
                                                    height={44}
                                                    iconType="circle"
                                                    wrapperStyle={{ fontSize: '10px', color: colors.textMuted }}
                                                    formatter={(value: any, entry: any) => {
                                                        const pct = Number(entry?.payload?.percent ?? 0);
                                                        return `${value} ${pct}%`;
                                                    }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card>
                            </div>
                            </DashboardHubShell>
                        </div>
                    )}
                    {calendarDetailModal && (
                        <div
                            className="fixed inset-0 z-[225] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300"
                            onClick={(e) => {
                                if (e.target === e.currentTarget) setCalendarDetailModal(null);
                            }}
                            role="presentation"
                        >
                            <div
                                className="w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 max-h-[85vh]"
                                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                onClick={(e) => e.stopPropagation()}
                                role="dialog"
                                aria-modal="true"
                            >
                                <div className="p-5 border-b flex items-center justify-between shrink-0" style={{ borderColor: colors.border }}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="p-2 rounded-xl shrink-0" style={{ backgroundColor: colors.primaryDim }}>
                                            {calendarDetailModal.kind === 'request' ? (
                                                <FileText size={20} style={{ color: colors.primary }} />
                                            ) : (
                                                <Phone size={20} style={{ color: colors.primary }} />
                                            )}
                                        </div>
                                        <h3 className="font-bold text-xl truncate" style={{ color: colors.textMain }}>
                                            {calendarDetailModal.kind === 'request' ? 'Request details' : 'Sales call details'}
                                        </h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setCalendarDetailModal(null)}
                                        className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
                                        style={{ color: colors.textMuted }}
                                        aria-label="Close"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                                    {calendarDetailModal.kind === 'request' ? (
                                        calendarModalResolvedRequest ? (
                                            <>
                                                <div>
                                                    <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Name</p>
                                                    <p className="font-bold text-lg" style={{ color: colors.textMain }}>
                                                        {calendarModalResolvedRequest.requestName || calendarModalResolvedRequest.confirmationNo || `Request #${calendarModalResolvedRequest.id}`}
                                                    </p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Confirmation</p>
                                                        <p className="text-sm font-medium" style={{ color: colors.textMain }}>{calendarModalResolvedRequest.confirmationNo || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Type</p>
                                                        <p className="text-sm font-medium" style={{ color: colors.textMain }}>{calendarModalResolvedRequest.requestType || '—'}</p>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Account</p>
                                                    <p className="text-sm font-medium" style={{ color: colors.textMain }}>{calendarModalResolvedRequest.accountName || calendarModalResolvedRequest.account || '—'}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Check-in / start</p>
                                                        <p className="text-sm font-medium" style={{ color: colors.textMain }}>{calendarModalResolvedRequest.checkIn || calendarModalResolvedRequest.eventStart || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Check-out / end</p>
                                                        <p className="text-sm font-medium" style={{ color: colors.textMain }}>{calendarModalResolvedRequest.checkOut || calendarModalResolvedRequest.eventEnd || '—'}</p>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Operational date (calendar)</p>
                                                    <p className="text-sm font-medium" style={{ color: colors.textMain }}>{getPrimaryOperationalDate(calendarModalResolvedRequest) || '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Status</p>
                                                    <StatusBadge status={String(calendarModalResolvedRequest.status || 'Inquiry')} theme={theme} />
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-sm" style={{ color: colors.textMuted }}>
                                                This request is not in the current list (it may have been removed or belongs to another property). Try refreshing or open Requests to search.
                                            </p>
                                        )
                                    ) : (
                                        (() => {
                                            const lead = calendarDetailModal.lead;
                                            const stageKey = String(lead?.stage || 'new').toLowerCase();
                                            const stMeta = crmCalendarStageMeta(stageKey, colors);
                                            const rev = Number(lead?.value ?? 0);
                                            return (
                                                <>
                                                    <div>
                                                        <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Company / account</p>
                                                        <p className="font-bold text-lg" style={{ color: colors.textMain }}>{lead?.company || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Subject</p>
                                                        <p className="text-sm font-medium" style={{ color: colors.textMain }}>{lead?.subject || '—'}</p>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Stage</p>
                                                            <p className="text-sm font-bold" style={{ color: stMeta.color }}>{stMeta.label}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Last contact</p>
                                                            <p className="text-sm font-medium" style={{ color: colors.textMain }}>{lead?.lastContact || lead?.date || '—'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>City</p>
                                                            <p className="text-sm font-medium" style={{ color: colors.textMain }}>{lead?.city || '—'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Expected revenue</p>
                                                            <p className="text-sm font-medium" style={{ color: colors.textMain }}>
                                                                {rev ? formatMoney(Number(rev), 0) : '—'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {lead?.nextStep ? (
                                                        <div>
                                                            <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Next step</p>
                                                            <p className="text-sm font-medium whitespace-pre-wrap" style={{ color: colors.textMain }}>{lead.nextStep}</p>
                                                        </div>
                                                    ) : null}
                                                    {lead?.description ? (
                                                        <div>
                                                            <p className="text-[10px] uppercase font-black tracking-widest mb-1 opacity-60" style={{ color: colors.textMuted }}>Description</p>
                                                            <p className="text-sm whitespace-pre-wrap" style={{ color: colors.textMuted }}>{lead.description}</p>
                                                        </div>
                                                    ) : null}
                                                </>
                                            );
                                        })()
                                    )}
                                </div>

                                <div className="p-5 border-t flex flex-wrap gap-3 justify-end shrink-0" style={{ borderColor: colors.border }}>
                                    <button
                                        type="button"
                                        onClick={() => setCalendarDetailModal(null)}
                                        className="px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        Close
                                    </button>
                                    {calendarDetailModal.kind === 'request' ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPendingOpenRequestId(String(calendarDetailModal.requestId));
                                                setRequestsSubView('list');
                                                setCurrentView('requests');
                                                setCalendarDetailModal(null);
                                            }}
                                            className="px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all hover:opacity-95"
                                            style={{ backgroundColor: colors.primary }}
                                        >
                                            Open in Requests
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={!calendarDetailModal.lead?.id}
                                            onClick={() => {
                                                const id = calendarDetailModal.lead?.id;
                                                if (!id) return;
                                                setPendingOpenCrmLeadId(String(id));
                                                setCurrentView('crm');
                                                setCalendarDetailModal(null);
                                            }}
                                            className="px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                            style={{ backgroundColor: colors.primary }}
                                        >
                                            Open in Sales Calls
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {showTaskModal && (
                        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
                            <div className="w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-primaryDim" style={{ backgroundColor: colors.primaryDim }}>
                                            <ClipboardList size={20} style={{ color: colors.primary }} />
                                        </div>
                                        <h3 className="font-bold text-xl" style={{ color: colors.textMain }}>
                                            {taskModalReadOnly ? 'View Task' : editingTask ? 'Edit Task' : 'New Task'}
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={taskModalReadOnly}
                                            onClick={() => setTaskFormData({ ...taskFormData, star: !taskFormData.star })}
                                            className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40"
                                            style={{ color: taskFormData.star ? colors.orange : colors.textMuted }}
                                        >
                                            <Star size={20} fill={taskFormData.star ? colors.orange : 'transparent'} />
                                        </button>
                                        <button onClick={() => setShowTaskModal(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors" style={{ color: colors.textMuted }}>
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh] custom-scrollbar">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] uppercase font-black mb-1.5 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>What needs to be done?</label>
                                            <input
                                                type="text"
                                                autoFocus={!taskModalReadOnly}
                                                readOnly={taskModalReadOnly}
                                                value={taskFormData.task}
                                                onChange={e => setTaskFormData({ ...taskFormData, task: e.target.value })}
                                                className="w-full px-4 py-3 rounded-2xl border focus:ring-4 transition-all text-lg font-bold shadow-sm outline-none"
                                                style={{
                                                    backgroundColor: colors.primaryDim,
                                                    borderColor: colors.primary + '40',
                                                    color: colors.textMain,
                                                    '--tw-ring-color': colors.primary + '20'
                                                } as any}
                                                placeholder="Task subject..."
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[10px] uppercase font-black mb-1.5 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>Description & Notes</label>
                                            <textarea
                                                rows={3}
                                                readOnly={taskModalReadOnly}
                                                value={taskFormData.description}
                                                onChange={e => setTaskFormData({ ...taskFormData, description: e.target.value })}
                                                className="w-full px-4 py-3 rounded-2xl border focus:ring-4 transition-all text-sm resize-none outline-none shadow-inner"
                                                style={{
                                                    backgroundColor: colors.textMuted + '10',
                                                    borderColor: colors.border,
                                                    color: colors.textMain,
                                                    '--tw-ring-color': colors.primary + '10'
                                                } as any}
                                                placeholder="Add more details about this task..."
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] uppercase font-black mb-1.5 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>Assigned users</label>
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {taskFormData.assignees.length === 0 ? (
                                                    <span className="text-xs opacity-50 italic" style={{ color: colors.textMuted }}>No assignees yet</span>
                                                ) : (
                                                    taskFormData.assignees.map((a, idx) => (
                                                        <span
                                                            key={`${a.id}-${idx}-${a.name}`}
                                                            className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full text-xs font-bold border"
                                                            style={{
                                                                backgroundColor: colors.orange + '15',
                                                                borderColor: colors.orange + '50',
                                                                color: colors.textMain,
                                                            }}
                                                        >
                                                            {a.name}
                                                            {!taskModalReadOnly && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setTaskFormData({
                                                                            ...taskFormData,
                                                                            assignees: taskFormData.assignees.filter((_, i) => i !== idx),
                                                                        })
                                                                    }
                                                                    className="p-1 rounded-full hover:bg-white/10"
                                                                    style={{ color: colors.textMuted }}
                                                                    aria-label={`Remove ${a.name}`}
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            )}
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                            {!taskModalReadOnly && (
                                                <div className="flex flex-wrap gap-2 items-stretch">
                                                    <select
                                                        value={taskAssigneePick}
                                                        onChange={(e) => setTaskAssigneePick(e.target.value)}
                                                        className="flex-1 min-w-[160px] px-4 py-2.5 rounded-2xl border outline-none transition-all text-sm appearance-none cursor-pointer font-medium"
                                                        style={{
                                                            backgroundColor: colors.orange + '10',
                                                            borderColor: colors.orange + '40',
                                                            color: colors.textMain,
                                                        }}
                                                    >
                                                        <option value="" className="bg-black">Select user…</option>
                                                        {taskAssignableUsers
                                                            .filter(
                                                                (user) =>
                                                                    !taskFormData.assignees.some(
                                                                        (a) => a.id === user.id || a.name === user.name
                                                                    )
                                                            )
                                                            .map((user) => (
                                                                <option key={user.id} value={user.id} className="bg-black">
                                                                    {user.name}
                                                                </option>
                                                            ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const u = taskAssignableUsers.find(
                                                                (x) => String(x.id) === String(taskAssigneePick)
                                                            );
                                                            if (!u) return;
                                                            if (
                                                                taskFormData.assignees.some(
                                                                    (a) => a.id === u.id || a.name === u.name
                                                                )
                                                            )
                                                                return;
                                                            setTaskFormData({
                                                                ...taskFormData,
                                                                assignees: [...taskFormData.assignees, { id: u.id, name: u.name }],
                                                            });
                                                            setTaskAssigneePick('');
                                                        }}
                                                        className="px-4 py-2.5 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shrink-0 hover:brightness-110 transition-all"
                                                        style={{
                                                            backgroundColor: colors.primary,
                                                            borderColor: colors.primary,
                                                            color: '#000',
                                                        }}
                                                    >
                                                        <UserPlus size={16} /> Assign user
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-black mb-1.5 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>Client/Account</label>
                                            <input
                                                type="text"
                                                readOnly={taskModalReadOnly}
                                                value={taskFormData.client}
                                                onChange={(e) => setTaskFormData({ ...taskFormData, client: e.target.value })}
                                                placeholder="e.g. Saudi Aramco"
                                                className="w-full px-4 py-2.5 rounded-2xl border outline-none transition-all text-sm font-medium shadow-sm"
                                                style={{
                                                    backgroundColor: colors.cyan + '10',
                                                    borderColor: colors.cyan + '40',
                                                    color: colors.textMain,
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-1">
                                            <label className="text-[10px] uppercase font-black mb-1.5 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>Due Date</label>
                                            <input
                                                type="date"
                                                readOnly={taskModalReadOnly}
                                                value={taskFormData.date}
                                                onChange={e => setTaskFormData({ ...taskFormData, date: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-2xl border outline-none transition-all text-sm font-bold shadow-inner"
                                                style={{
                                                    backgroundColor: colors.blue + '10',
                                                    borderColor: colors.blue + '30',
                                                    color: colors.textMain
                                                }}
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="text-[10px] uppercase font-black mb-1.5 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>Priority</label>
                                            <select
                                                disabled={taskModalReadOnly}
                                                value={taskFormData.priority}
                                                onChange={e => setTaskFormData({ ...taskFormData, priority: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-2xl border outline-none transition-all text-sm appearance-none cursor-pointer font-bold shadow-lg disabled:opacity-50"
                                                style={{
                                                    backgroundColor: taskFormData.priority === 'High' ? colors.red + '20' :
                                                        taskFormData.priority === 'Medium' ? colors.yellow + '20' :
                                                            colors.green + '20',
                                                    borderColor: taskFormData.priority === 'High' ? colors.red :
                                                        taskFormData.priority === 'Medium' ? colors.yellow :
                                                            colors.green,
                                                    color: taskFormData.priority === 'High' ? colors.red :
                                                        taskFormData.priority === 'Medium' ? colors.yellow :
                                                            colors.green
                                                }}
                                            >
                                                <option value="High" className="bg-black text-red-500">High 🔥</option>
                                                <option value="Medium" className="bg-black text-yellow-500">Medium ⚡</option>
                                                <option value="Low" className="bg-black text-green-500">Low ⚓</option>
                                            </select>
                                        </div>
                                        <div className="col-span-1">
                                            <label className="text-[10px] uppercase font-black mb-1.5 block tracking-widest opacity-60" style={{ color: colors.textMuted }}>Category</label>
                                            <select
                                                disabled={taskModalReadOnly}
                                                value={taskFormData.category}
                                                onChange={e => setTaskFormData({ ...taskFormData, category: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-2xl border outline-none transition-all text-sm appearance-none cursor-pointer font-bold disabled:opacity-50"
                                                style={{
                                                    backgroundColor: colors.purple + '10',
                                                    borderColor: colors.purple + '30',
                                                    color: colors.textMain
                                                }}
                                            >
                                                {TASK_CATEGORIES.map(cat => (
                                                    <option key={cat} value={cat} className="bg-black">{cat}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 bg-black/40 flex flex-wrap gap-4 justify-end items-center">
                                    {editingTask && canDeleteTasks(currentUser) && !taskModalReadOnly && (
                                        <button
                                            type="button"
                                            onClick={handleDeleteTask}
                                            className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 text-red-500 hover:bg-red-500/10"
                                        >
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setShowTaskModal(false)}
                                        className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all hover:bg-white/5"
                                        style={{ color: colors.textMuted }}
                                    >
                                        Cancel
                                    </button>
                                    {!taskModalReadOnly && (
                                        <button
                                            type="button"
                                            onClick={handleSaveTask}
                                            className="px-10 py-2.5 rounded-xl text-sm font-bold uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl"
                                            style={{ backgroundColor: colors.primary, color: '#000', boxShadow: `0 8px 25px ${colors.primary}40` }}
                                        >
                                            {editingTask ? 'Update Task' : 'Add Task'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    </Suspense>
                    </div>
                    <footer
                        role="contentinfo"
                        className="w-full mt-12 pt-6 pb-4 text-center border-t shrink-0"
                        style={{ borderColor: colors.border }}
                    >
                        <p className="text-[10px] uppercase tracking-widest opacity-50 font-medium" style={{ color: colors.textMuted }}>
                            All rights reserved to AS @2026
                        </p>
                    </footer>
                </main>
            </div>

            {/* Events & Catering: embedded MICE request wizard (saves via same API as Requests) */}
            <Suspense fallback={null}>
            {showEventsRequestModal && eventsEmbeddedRequestType && (
                <div
                    className="fixed inset-0 z-[210] flex items-center justify-center p-3 md:p-6"
                    style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
                    onClick={() => {
                        setShowEventsRequestModal(false);
                        setEventsEmbeddedRequestType(null);
                    }}
                >
                    <div className="w-full max-w-5xl max-h-[95vh] min-h-0 flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <RequestsManager
                            key={`emb-${eventsEmbeddedRequestType}`}
                            embedded
                            theme={theme}
                            subView="new_request"
                            searchParams={eventsModalSearchParams}
                            setSearchParams={(p: any) => setEventsModalSearchParams((prev) => ({ ...prev, ...p }))}
                            initialRequestType={eventsEmbeddedRequestType}
                            activeProperty={activeProperty}
                            accounts={accounts}
                            setAccounts={setAccounts}
                            onAfterRequestsMutate={refreshSharedRequests}
                            onEmbeddedComplete={() => {
                                setShowEventsRequestModal(false);
                                setEventsEmbeddedRequestType(null);
                            }}
                            onEmbeddedCancel={() => {
                                setShowEventsRequestModal(false);
                                setEventsEmbeddedRequestType(null);
                            }}
                            segmentOptions={propertySegmentLabels}
                            accountTypeOptions={propertyAccountTypeLabels}
                            canDeleteRequest={canDeleteRequests(currentUser)}
                            readOnlyOperational={!canMutateOperational(currentUser)}
                            currentUser={currentUser}
                            currency={currentCurrency}
                            promotionOptions={promotions}
                            canLinkRequestPromotions={canLinkRequestPromotions(currentUser)}
                        />
                    </div>
                </div>
            )}

            {/* Events & Catering: in-place request OPTS (same modal as Requests list) */}
            {currentView === 'events' && eventsOptsHostMounted && (
                <RequestsManager
                    key="events-opts-headless"
                    optsHeadless
                    theme={theme}
                    subView="list"
                    searchParams={eventsOptsSearchParams}
                    setSearchParams={(p: any) => setEventsOptsSearchParams((prev) => ({ ...prev, ...p }))}
                    activeProperty={activeProperty}
                    accounts={accounts}
                    setAccounts={setAccounts}
                    pendingOpenOptsRequestId={eventsOptsBootstrapId}
                    onConsumedPendingOpenOpts={() => setEventsOptsBootstrapId(null)}
                    onOptsHeadlessDismiss={() => setEventsOptsHostMounted(false)}
                    onHeadlessModifyDetails={(requestId: string) => {
                        setEventsOptsHostMounted(false);
                        setEventsOptsBootstrapId(null);
                        setRequestSearchParams((p: any) => ({
                            ...(p || {}),
                            subView: 'new_request',
                            editRequestId: requestId,
                            duplicateFromRequestId: undefined,
                        }));
                        setRequestsSubView('new_request');
                        setRequestsNavNonce((n) => n + 1);
                        setCurrentView('requests');
                    }}
                    onHeadlessDuplicateRequest={(requestId: string) => {
                        setEventsOptsHostMounted(false);
                        setEventsOptsBootstrapId(null);
                        setRequestSearchParams((p: any) => ({
                            ...(p || {}),
                            subView: 'new_request',
                            editRequestId: undefined,
                            duplicateFromRequestId: requestId,
                        }));
                        setRequestsSubView('new_request');
                        setRequestsNavNonce((n) => n + 1);
                        setCurrentView('requests');
                    }}
                    onAfterRequestsMutate={refreshSharedRequests}
                    segmentOptions={propertySegmentLabels}
                    accountTypeOptions={propertyAccountTypeLabels}
                    canDeleteRequest={canDeleteRequests(currentUser)}
                    canDeleteRequestPayments={canDeleteRequestPayments(currentUser)}
                    readOnlyOperational={!canMutateOperational(currentUser)}
                    currentUser={currentUser}
                    currency={currentCurrency}
                    promotionOptions={promotions}
                    canLinkRequestPromotions={canLinkRequestPromotions(currentUser)}
                />
            )}

            {/* New Event Modal */}
            {showNewEventModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                    onClick={() => { setShowNewEventModal(false); setSelectedEventType(null); }}>
                    <div className="w-full max-w-2xl rounded-2xl border-2 shadow-2xl p-6 animate-in fade-in zoom-in duration-300"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        onClick={(e) => e.stopPropagation()}>

                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold" style={{ color: colors.textMain }}>Create New Event</h2>
                            <button
                                onClick={() => { setShowNewEventModal(false); setSelectedEventType(null); }}
                                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                style={{ color: colors.textMuted }}>
                                <X size={24} />
                            </button>
                        </div>

                        {!selectedEventType ? (
                            <>
                                <p className="text-sm mb-6" style={{ color: colors.textMuted }}>
                                    Select the type of event you want to create:
                                </p>

                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        {
                                            type: 'Group Accommodation',
                                            label: 'Event with Accommodation',
                                            color: colors.blue,
                                            icon: '🏨',
                                            desc: 'Event including hotel bookings',
                                            showIn: ['calendar'],
                                            action: () => {
                                                setPendingRequestType('event_rooms');
                                                setRequestsSubView('new_request');
                                                setCurrentView('requests');
                                                setShowNewEventModal(false);
                                            }
                                        },
                                        {
                                            type: 'Accommodation Only',
                                            label: 'Accommodation Only',
                                            color: colors.cyan,
                                            icon: '🛏️',
                                            desc: 'Room blocks without events',
                                            showIn: ['calendar'],
                                            action: () => {
                                                setPendingRequestType('accommodation');
                                                setRequestsSubView('new_request');
                                                setCurrentView('requests');
                                                setShowNewEventModal(false);
                                            }
                                        },
                                        {
                                            type: 'Series Group',
                                            label: 'Series Group',
                                            color: colors.purple,
                                            icon: '📅',
                                            desc: 'Recurring group events',
                                            showIn: ['calendar'],
                                            action: () => {
                                                setPendingRequestType('series');
                                                setRequestsSubView('new_request');
                                                setCurrentView('requests');
                                                setShowNewEventModal(false);
                                            }
                                        },
                                        {
                                            type: 'Events',
                                            label: 'Event',
                                            color: '#ff6b35',
                                            icon: '🎉',
                                            desc: 'Special events and occasions',
                                            showIn: ['calendar'],
                                            action: () => {
                                                setPendingRequestType('event');
                                                setRequestsSubView('new_request');
                                                setCurrentView('requests');
                                                setShowNewEventModal(false);
                                            }
                                        },
                                        {
                                            type: 'Sales Calls',
                                            label: 'Sales Calls',
                                            color: colors.green,
                                            icon: '📞',
                                            desc: 'Client sales meetings',
                                            showIn: ['calendar'],
                                            className: 'col-span-2 mx-auto w-[calc(50%-0.5rem)]',
                                            action: () => {
                                                setShowSalesCallModal(true);
                                                setShowNewEventModal(false);
                                            }
                                        },
                                    ]
                                        .filter(item => item.showIn.includes(eventModalSource))
                                        .map((item) => (
                                            <button
                                                key={item.type}
                                                onClick={item.action}
                                                className={`p-6 rounded-xl border-2 text-left transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-current/20 ${item.className || ''}`}
                                                style={{
                                                    backgroundColor: item.color + '15',
                                                    borderColor: item.color,
                                                    boxShadow: `0 0 0 ${item.color}00`
                                                }}>
                                                <div className="text-4xl mb-3">{item.icon}</div>
                                                <div className="font-bold text-lg mb-1" style={{ color: colors.textMain }}>{item.label}</div>
                                                <div className="text-xs" style={{ color: colors.textMuted }}>{item.desc}</div>
                                            </button>
                                        ))}
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-4 rounded-lg border-2"
                                    style={{
                                        backgroundColor: (() => {
                                            switch (selectedEventType) {
                                                case 'Group Accommodation': return colors.blue + '15';
                                                case 'Series Group': return colors.purple + '15';
                                                case 'Events': return '#ff6b3515';
                                                case 'Sales Calls': return colors.green + '15';
                                                default: return colors.bg;
                                            }
                                        })(),
                                        borderColor: (() => {
                                            switch (selectedEventType) {
                                                case 'Group Accommodation': return colors.blue;
                                                case 'Series Group': return colors.purple;
                                                case 'Events': return '#ff6b35';
                                                case 'Sales Calls': return colors.green;
                                                default: return colors.border;
                                            }
                                        })()
                                    }}>
                                    <button
                                        onClick={() => setSelectedEventType(null)}
                                        className="p-1 rounded hover:bg-white/10"
                                        style={{ color: colors.textMuted }}>
                                        <ChevronLeft size={20} />
                                    </button>
                                    <div>
                                        <div className="text-xs uppercase font-bold tracking-wide" style={{ color: colors.textMuted }}>Creating</div>
                                        <div className="font-bold text-lg" style={{ color: colors.textMain }}>
                                            {eventModalSource === 'events_page' ?
                                                (selectedEventType === 'Events' ? 'Event' : 'Event with Accommodation') :
                                                selectedEventType}
                                        </div>
                                    </div>
                                </div>

                                {/* Event Form */}
                                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                                    <div>
                                        <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>Event Title</label>
                                        <input
                                            type="text"
                                            placeholder="Enter event title..."
                                            className="w-full px-4 py-3 rounded-lg border-2 text-sm transition-colors focus:outline-none focus:border-current"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>Start Date</label>
                                            <input
                                                type="date"
                                                className="w-full px-4 py-3 rounded-lg border-2 text-sm"
                                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>End Date</label>
                                            <input
                                                type="date"
                                                className="w-full px-4 py-3 rounded-lg border-2 text-sm"
                                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                            />
                                        </div>
                                    </div>

                                    {selectedEventType === 'Group Accommodation' && (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>Number of PAX</label>
                                                <input
                                                    type="number"
                                                    placeholder="Enter number of guests..."
                                                    className="w-full px-4 py-3 rounded-lg border-2 text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>Hotel/Accommodation</label>
                                                <input
                                                    type="text"
                                                    placeholder="Enter hotel name..."
                                                    className="w-full px-4 py-3 rounded-lg border-2 text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {selectedEventType === 'Series Group' && (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>Recurrence Pattern</label>
                                                <select className="w-full px-4 py-3 rounded-lg border-2 text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}>
                                                    <option>Daily</option>
                                                    <option>Weekly</option>
                                                    <option>Monthly</option>
                                                    <option>Yearly</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>Number of Occurrences</label>
                                                <input
                                                    type="number"
                                                    placeholder="How many times?"
                                                    className="w-full px-4 py-3 rounded-lg border-2 text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {selectedEventType === 'Sales Calls' && (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>Client Name</label>
                                                <input
                                                    type="text"
                                                    placeholder="Enter client name..."
                                                    className="w-full px-4 py-3 rounded-lg border-2 text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>Call Type</label>
                                                <select className="w-full px-4 py-3 rounded-lg border-2 text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}>
                                                    <option>Initial Contact</option>
                                                    <option>Follow-up</option>
                                                    <option>Proposal Presentation</option>
                                                    <option>Closing</option>
                                                </select>
                                            </div>
                                        </>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>Status</label>
                                        <select className="w-full px-4 py-3 rounded-lg border-2 text-sm"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}>
                                            <option>Tentative</option>
                                            <option>Confirmed</option>
                                            <option>Definite</option>
                                            <option>Paid/Active</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: colors.textMuted }}>Notes</label>
                                        <textarea
                                            rows={4}
                                            placeholder="Add any additional notes..."
                                            className="w-full px-4 py-3 rounded-lg border-2 text-sm resize-none"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4 border-t-2" style={{ borderColor: colors.border }}>
                                    <button
                                        onClick={() => { setShowNewEventModal(false); setSelectedEventType(null); }}
                                        className="flex-1 px-6 py-3 rounded-lg font-bold text-sm uppercase tracking-wide transition-all hover:bg-white/10"
                                        style={{ backgroundColor: colors.bg, color: colors.textMuted }}>
                                        Cancel
                                    </button>
                                    <button
                                        className="flex-1 px-6 py-3 rounded-lg font-bold text-sm uppercase tracking-wide transition-all hover:scale-105 active:scale-95"
                                        style={{ backgroundColor: colors.primary, color: '#000' }}>
                                        Create Event
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Request preview from alerts */}
            {alertDetailRequest ? (
                <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        aria-label="Close"
                        onClick={() => setAlertDetailRequest(null)}
                    />
                    <div
                        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border shadow-2xl p-5"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <div className="flex items-start justify-between gap-2 mb-4">
                            <h3 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textMain }}>
                                Request details
                            </h3>
                            <button
                                type="button"
                                onClick={() => setAlertDetailRequest(null)}
                                className="p-1 rounded-lg border"
                                style={{ borderColor: colors.border, color: colors.textMuted }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        {(() => {
                            const r = alertDetailRequest;
                            const ev = getEventDateWindow(r);
                            const rows: { label: string; value: string }[] = [
                                { label: 'Confirmation', value: String(r.confirmationNo || r.id || '—') },
                                { label: 'Request name', value: String(r.requestName || '—') },
                                { label: 'Account', value: String(r.account || r.accountName || '—') },
                                { label: 'Type', value: String(r.requestType || '—') },
                                { label: 'Status', value: String(r.status || '—') },
                                { label: 'Offer deadline', value: String(r.offerDeadline || '—') },
                                { label: 'Deposit deadline', value: String(r.depositDeadline || '—') },
                                { label: 'Payment deadline', value: String(r.paymentDeadline || '—') },
                                { label: 'Check-in', value: String(r.checkIn || '—') },
                                { label: 'Check-out', value: String(r.checkOut || '—') },
                                { label: 'Event / agenda start', value: String(ev.start || '—') },
                                { label: 'Event / agenda end', value: String(ev.end || '—') },
                            ];
                            return (
                                <dl className="space-y-2 text-sm">
                                    {rows.map((row) => (
                                        <div key={row.label} className="flex gap-2 border-b pb-2 last:border-0" style={{ borderColor: colors.border }}>
                                            <dt className="w-[40%] shrink-0 text-[10px] font-black uppercase opacity-50" style={{ color: colors.textMuted }}>
                                                {row.label}
                                            </dt>
                                            <dd className="font-bold" style={{ color: colors.textMain }}>
                                                {row.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            );
                        })()}
                        <div className="flex gap-2 mt-5">
                            <button
                                type="button"
                                onClick={() => setAlertDetailRequest(null)}
                                className="flex-1 py-2.5 rounded-xl border text-xs font-bold"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const id = String(alertDetailRequest.id ?? '');
                                    setAlertDetailRequest(null);
                                    setCurrentView('requests');
                                    setRequestsSubView('list');
                                    setPendingOpenRequestId(id);
                                    setRequestsNavNonce((n) => n + 1);
                                }}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-black"
                                style={{ backgroundColor: colors.primary }}
                            >
                                Open full request
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Sales Call Modal (Calendar Overlay) */}
            <AddSalesCallModal
                isOpen={showSalesCallModal}
                onClose={() => setShowSalesCallModal(false)}
                onSave={handleSalesCallSave}
                accounts={accounts}
                theme={theme}
                configurationProperty={activeProperty || undefined}
                configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                stages={[
                    { id: 'new', title: 'New Calls', color: colors.blue },
                    { id: 'waiting', title: 'Waiting list', color: '#94a3b8' },
                    { id: 'qualified', title: 'QUALIFIED', color: colors.cyan },
                    { id: 'proposal', title: 'PROPOSAL', color: colors.yellow },
                    { id: 'negotiation', title: 'NEGOTIATION', color: colors.orange },
                    { id: 'won', title: 'WON', color: colors.green },
                    { id: 'notInterested', title: 'Not Interested', color: '#8b0000' }
                ]}
                onCreateAccount={handleCreateAccount}
            />

            {/* Create Account Modal (Overlay) */}
            <AddAccountModal
                isOpen={showAddAccountModal}
                onClose={() => setShowAddAccountModal(false)}
                onSave={handleSaveAccount}
                theme={theme}
                configurationProperty={activeProperty || undefined}
                configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                accountTypeOptions={propertyAccountTypeLabels}
                duplicateCheckAccounts={accounts.filter((a: any) => {
                    const pid = String(activeProperty?.id || '').trim();
                    if (!pid) return true;
                    const p = String(a?.propertyId || '').trim();
                    return !p || p === 'P-GLOBAL' || p === pid;
                })}
                duplicateCheckPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
            />

            <MessengerWidget
                colors={colors}
                propertyId={activeProperty?.id ? String(activeProperty.id) : ''}
                currentUserId={currentUser?.id ? String(currentUser.id) : ''}
            />
            </Suspense>
        </div>
    );
}
