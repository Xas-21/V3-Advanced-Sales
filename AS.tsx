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
import { ErrorBoundary } from './ErrorBoundary';
import CalendarView, { crmCalendarStageMeta } from './CalendarView';
import EventsView, { computeRequestCostBreakdown, isEventsCateringEligibleRequest } from './EventsView';
import MainChart from './MainChart';
import ToDoView, {
    normalizeTaskAssignees,
    taskAssigneeNamesList,
    taskAssigneesAvatarLetters,
    type TaskAssigneeForm,
} from './ToDoView';
import DistributionChart from './DistributionChart';
import AlertsBell from './AlertsBell';
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
import { ChartLegend, rechartsTooltipThemeProps } from './rechartsChartLegend';
import { CURRENCY_OPTIONS, type CurrencyCode, formatCurrencyAmount, resolveCurrencyCode } from './currency';
import { useCurrencyFormatters } from './useCurrencyFormatters';
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

// --- View Components ---

// --- Extracted Components (Memoization Optimization) ---

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
            setActiveProperty((prev: any) =>
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
    const userProfileMobileRef = useRef<HTMLButtonElement>(null);
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
                        <ErrorBoundary variant="section">
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
                        </ErrorBoundary>
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
                        <ErrorBoundary variant="section">
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
                        </ErrorBoundary>
                    ) : (
                        /* DASHBOARD VIEW */
                        <ErrorBoundary variant="section">
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
                        </ErrorBoundary>
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
