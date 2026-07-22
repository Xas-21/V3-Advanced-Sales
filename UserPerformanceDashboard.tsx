import React, { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import {
    Users, Upload, List, TrendingUp, Phone, User, CheckSquare, Zap, FileText,
    MapPin, CheckCircle2, Download, Clock, Building, Mail, X,
} from 'lucide-react';
import {
    PROFILE_MONTH_LABELS,
    PROFILE_ACTIVITY_PREVIEW_CAP,
    PROFILE_ACTIVITY_MODAL_CAP,
    buildProfileActivityLog,
    countCallsAllTime,
    countCallsInMonth,
    countCallsInYear,
    countOpenPipelineAttributed,
    countOpenPipelineInYmdRangeAttributed,
    countRequestsInYmdRangeAttributed,
    filterUserAccounts,
    filterUserCrmLeads,
    getProfileRecentRequests,
    monthlySalesCallTarget,
    recordVisibleOnProperty,
    requestAttributedToUser,
    requestInProperty,
    sumRevenueInYmdRangeAttributed,
    taskAssignedToUser,
    userAttributedOperationalDateBounds,
    ymdBoundsForCalendarMonth,
    ymdBoundsForCalendarYear,
    computeProfileRequestPreTax,
    type ProfileActivityRow,
} from './userProfileMetrics';
import { buildAccountProfileChartData } from './accountProfileChartData';
import ChartVsCompareControls, { defaultChartVsYear } from './ChartVsCompareControls';
import {
    chartTabSupportsVs,
    mergeChartRowsWithLyComparison,
    shiftRangeToComparisonYear,
} from './chartVsYearCompare';
import type { AccountProfileChartTab } from './AccountProfilePerformanceChart';
import { listAssignedProperties } from './userPropertyAccess';

const AccountProfilePerformanceChart = lazy(() => import('./AccountProfilePerformanceChart'));

type UserPerformanceChartTabKey = 'revenue' | 'requests' | 'rooms' | 'mice' | 'status';

const PERF_TAB_TO_ACCOUNT: Record<UserPerformanceChartTabKey, AccountProfileChartTab> = {
    revenue: 'Revenue',
    requests: 'Requests',
    rooms: 'Rooms',
    mice: 'MICE',
    status: 'Status',
};

const isPerfChartTab = (v: unknown): v is UserPerformanceChartTabKey =>
    v === 'revenue' || v === 'requests' || v === 'rooms' || v === 'mice' || v === 'status';

export type UserPerformanceDashboardProps = {
    user: any;
    isOwnProfile?: boolean;
    propertyId?: string;
    colors: any;
    properties: any[];
    users: any[];
    crmLeads: Record<string, any[]>;
    sharedRequests: any[];
    accounts: any[];
    tasks: any[];
    activeProperty?: any;
    formatMoney: (amountSar: number, maxFractionDigits?: number) => string;
    showResetPassword: boolean;
    setShowResetPassword: (v: boolean) => void;
    resetPasswordData: { current: string; new: string; confirm: string };
    setResetPasswordData: React.Dispatch<React.SetStateAction<{ current: string; new: string; confirm: string }>>;
    resetPasswordBusy: boolean;
    handleProfileChangePassword: () => Promise<void>;
    onOpenTasks?: () => void;
};

export function UserPerformanceDashboard({
    user,
    isOwnProfile = false,
    propertyId: scopePropId,
    colors,
    properties,
    users,
    crmLeads,
    sharedRequests,
    accounts,
    tasks,
    activeProperty,
    formatMoney,
    showResetPassword,
    setShowResetPassword,
    resetPasswordData,
    setResetPasswordData,
    resetPasswordBusy,
    handleProfileChangePassword,
    onOpenTasks,
}: UserPerformanceDashboardProps) {
        const mergedUser = useMemo(() => {
            const fromList = users.find((u: any) => String(u?.id) === String(user?.id));
            if (!fromList) return user;
            return {
                ...user,
                ...fromList,
                stats: {
                    ...(user?.stats || {}),
                    ...(fromList?.stats || {}),
                    yearlyTargets: {
                        ...(user?.stats?.yearlyTargets || {}),
                        ...(fromList?.stats?.yearlyTargets || {}),
                    },
                },
            };
        }, [users, user]);

        const assignedProperties = useMemo(
            () => listAssignedProperties(mergedUser, properties || []),
            [mergedUser, properties],
        );

        const rollingThreeMonthRange = (d: Date) => {
            const y = d.getFullYear();
            const m = d.getMonth();
            const from = new Date(y, m - 1, 1);
            const to = new Date(y, m + 1, 1);
            return {
                fromMonth: PROFILE_MONTH_LABELS[from.getMonth()],
                fromYear: String(from.getFullYear()),
                toMonth: PROFILE_MONTH_LABELS[to.getMonth()],
                toYear: String(to.getFullYear()),
            };
        };

        const defaultCalendarYearRange = () => {
            const y = String(new Date().getFullYear());
            return { fromMonth: 'Jan', fromYear: y, toMonth: 'Dec', toYear: y };
        };

        const perfStorageKey = useMemo(
            () => `visatour_user_profile_perf_v1_${String(mergedUser?.id ?? 'anon')}_${String(scopePropId ?? 'all')}`,
            [mergedUser?.id, scopePropId]
        );

        const [revenueDateRange, setRevenueDateRange] = useState(() => defaultCalendarYearRange());
        const [activityDayFilter, setActivityDayFilter] = useState('');
        const [activityModalOpen, setActivityModalOpen] = useState(false);
        const [activityModalLoading, setActivityModalLoading] = useState(false);
        const [activityModalLogs, setActivityModalLogs] = useState<ProfileActivityRow[] | null>(null);
        const [activitySearch, setActivitySearch] = useState('');
        const [activitySearchApplied, setActivitySearchApplied] = useState('');
        const [viewMode, setViewMode] = useState<'month' | 'year' | 'full'>('year');
        const [performanceChartTab, setPerformanceChartTab] = useState<UserPerformanceChartTabKey>('revenue');
        const [perfChartVsEnabled, setPerfChartVsEnabled] = useState(false);
        const [perfChartVsYear, setPerfChartVsYear] = useState(defaultChartVsYear);
        const [recentReqFrom, setRecentReqFrom] = useState('');
        const [recentReqTo, setRecentReqTo] = useState('');
        const [perfHydrated, setPerfHydrated] = useState(false);

        const months = [...PROFILE_MONTH_LABELS];
        const years = useMemo(() => {
            const cy = new Date().getFullYear();
            const endYear = Math.max(2030, cy + 1);
            const out: string[] = [];
            for (let y = cy - 5; y <= endYear; y++) out.push(String(y));
            return out;
        }, []);

        useEffect(() => {
            setPerfHydrated(false);
            const fallbackRange = defaultCalendarYearRange();
            try {
                const raw = localStorage.getItem(perfStorageKey);
                if (raw) {
                    const p = JSON.parse(raw);
                    if (p.viewMode === 'month' || p.viewMode === 'year' || p.viewMode === 'full') {
                        setViewMode(p.viewMode);
                    }
                    if (
                        p.revenueDateRange &&
                        typeof p.revenueDateRange.fromMonth === 'string' &&
                        typeof p.revenueDateRange.toMonth === 'string' &&
                        typeof p.revenueDateRange.fromYear === 'string' &&
                        typeof p.revenueDateRange.toYear === 'string'
                    ) {
                        setRevenueDateRange(p.revenueDateRange);
                    } else {
                        setRevenueDateRange(fallbackRange);
                    }
                    if (isPerfChartTab(p.performanceChartTab)) {
                        setPerformanceChartTab(p.performanceChartTab);
                    }
                    if (typeof p.recentReqFrom === 'string') setRecentReqFrom(p.recentReqFrom);
                    if (typeof p.recentReqTo === 'string') setRecentReqTo(p.recentReqTo);
                }
            } catch {
                /* keep initial state */
            }
            setPerfHydrated(true);
        }, [perfStorageKey]);

        useEffect(() => {
            if (!perfHydrated) return;
            try {
                localStorage.setItem(
                    perfStorageKey,
                    JSON.stringify({
                        viewMode,
                        revenueDateRange,
                        performanceChartTab,
                        recentReqFrom,
                        recentReqTo,
                    })
                );
            } catch {
                /* quota */
            }
        }, [perfHydrated, perfStorageKey, viewMode, revenueDateRange, performanceChartTab, recentReqFrom, recentReqTo]);

        const userLeads = useMemo(
            () => filterUserCrmLeads(crmLeads, scopePropId, mergedUser),
            [crmLeads, scopePropId, mergedUser]
        );

        const ALL_TIME_START = '1970-01-01';
        const ALL_TIME_END = '2100-12-31';

        const periodBounds = useMemo(() => {
            const now = new Date();
            const y = now.getFullYear();
            const mi = now.getMonth();
            if (viewMode === 'full')
                return {
                    start: ALL_TIME_START,
                    end: ALL_TIME_END,
                    year: y,
                    monthIndex: mi,
                };
            if (viewMode === 'month') return { ...ymdBoundsForCalendarMonth(y, mi), year: y, monthIndex: mi };
            return { ...ymdBoundsForCalendarYear(y), year: y, monthIndex: mi };
        }, [viewMode]);

        /** One property + attribution filter; KPIs / chart / recent list reuse this (Plan 011). */
        const userAttributedRequests = useMemo(
            () =>
                (sharedRequests || []).filter(
                    (r) => requestInProperty(r, scopePropId) && requestAttributedToUser(r, mergedUser)
                ),
            [sharedRequests, scopePropId, mergedUser]
        );

        const monthRevenue = useMemo(
            () =>
                sumRevenueInYmdRangeAttributed(userAttributedRequests, periodBounds.start, periodBounds.end),
            [userAttributedRequests, periodBounds.start, periodBounds.end]
        );
        const monthReqCount = useMemo(
            () =>
                countRequestsInYmdRangeAttributed(userAttributedRequests, periodBounds.start, periodBounds.end),
            [userAttributedRequests, periodBounds.start, periodBounds.end]
        );
        const activePipeInPeriod = useMemo(() => {
            if (viewMode === 'full') return countOpenPipelineAttributed(userAttributedRequests);
            return countOpenPipelineInYmdRangeAttributed(
                userAttributedRequests,
                periodBounds.start,
                periodBounds.end
            );
        }, [userAttributedRequests, periodBounds.start, periodBounds.end, viewMode]);
        const ymPrefix = `${periodBounds.year}-${String(periodBounds.monthIndex + 1).padStart(2, '0')}`;
        const monthCalls = useMemo(() => countCallsInMonth(userLeads, ymPrefix), [userLeads, ymPrefix]);
        const yearCalls = useMemo(() => countCallsInYear(userLeads, periodBounds.year), [userLeads, periodBounds.year]);

        const callsKpi =
            viewMode === 'full'
                ? countCallsAllTime(userLeads)
                : viewMode === 'year'
                  ? yearCalls
                  : monthCalls;

        const userAccountsCount = useMemo(() => {
            return filterUserAccounts(accounts || [], mergedUser).filter((a: any) =>
                recordVisibleOnProperty(scopePropId, a?.propertyId)
            ).length;
        }, [accounts, mergedUser, scopePropId]);

        const userTasks = useMemo(() => {
            return (tasks || []).filter(
                (t: any) =>
                    taskAssignedToUser(t, mergedUser) &&
                    (!scopePropId || !t.propertyId || String(t.propertyId) === String(scopePropId))
            );
        }, [tasks, mergedUser, scopePropId]);

        const taskDone = userTasks.filter((t: any) => t.completed).length;
        const taskOpen = userTasks.filter((t: any) => !t.completed);
        const isUrgentT = (t: any) => t.priority === 'High' || t.star;
        const isDueT = (t: any) => {
            if (!t.date) return false;
            const d = new Date(`${t.date}T12:00:00`);
            if (Number.isNaN(d.getTime())) return false;
            const end = new Date();
            end.setHours(23, 59, 59, 999);
            return d <= end;
        };
        const taskUrgent = taskOpen.filter(isUrgentT).length;
        const taskDue = taskOpen.filter((t: any) => !isUrgentT(t) && isDueT(t)).length;
        const taskPending = taskOpen.filter((t: any) => !isUrgentT(t) && !isDueT(t)).length;
        const taskTotal = userTasks.length;
        const taskPct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

        const annualTargetRaw = Number(
            mergedUser?.stats?.yearlyTargets?.[String(periodBounds.year)] ??
                mergedUser?.stats?.yearlyTargets?.[periodBounds.year] ??
                0
        );
        const monthlyTargetCalls = monthlySalesCallTarget(mergedUser, periodBounds.year);
        const progressCalls = monthlyTargetCalls > 0 ? Math.min(100, (monthCalls / monthlyTargetCalls) * 100) : 0;
        const precisionPct =
            viewMode === 'year' || viewMode === 'full'
                ? annualTargetRaw > 0
                    ? Math.min(100, Math.round((yearCalls / annualTargetRaw) * 100))
                    : 0
                : monthlyTargetCalls > 0
                  ? Math.min(100, Math.round((monthCalls / monthlyTargetCalls) * 100))
                  : 0;
        const precisionLabel =
            (viewMode === 'year' || viewMode === 'full' ? annualTargetRaw : monthlyTargetCalls) > 0
                ? `${precisionPct}%`
                : '—';

        /** Same operational date window as the chart date pickers / full-history mode; drives account-style series. */
        const profileOperationalChartRange = useMemo(() => {
            if (viewMode === 'full') {
                const b = userAttributedOperationalDateBounds(userAttributedRequests, scopePropId, mergedUser);
                if (!b) {
                    const y = new Date().getFullYear();
                    return { start: `${y}-01-01`, end: `${y}-12-31` };
                }
                return { start: b.min, end: b.max };
            }
            const mi = (label: string) => PROFILE_MONTH_LABELS.indexOf(label as (typeof PROFILE_MONTH_LABELS)[number]);
            let y0 = parseInt(revenueDateRange.fromYear, 10);
            let m0 = mi(revenueDateRange.fromMonth);
            let y1 = parseInt(revenueDateRange.toYear, 10);
            let m1 = mi(revenueDateRange.toMonth);
            if (!Number.isFinite(y0)) y0 = new Date().getFullYear();
            if (!Number.isFinite(y1)) y1 = y0;
            if (m0 < 0) m0 = 0;
            if (m1 < 0) m1 = 11;
            const pad = (n: number) => String(n).padStart(2, '0');
            const start = `${y0}-${pad(m0 + 1)}-01`;
            const endDate = new Date(y1, m1 + 1, 0);
            const end = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
            return { start, end };
        }, [
            viewMode,
            userAttributedRequests,
            scopePropId,
            mergedUser,
            revenueDateRange.fromMonth,
            revenueDateRange.fromYear,
            revenueDateRange.toMonth,
            revenueDateRange.toYear,
        ]);

        /** Defer night-proration chart series so KPI cards paint first (Plan 011). */
        const [chartSeriesReady, setChartSeriesReady] = useState(false);
        useEffect(() => {
            let cancelled = false;
            const enable = () => {
                if (!cancelled) setChartSeriesReady(true);
            };
            let idleHandle: number | undefined;
            let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
            if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
                idleHandle = window.requestIdleCallback(enable, { timeout: 500 });
            } else {
                timeoutHandle = setTimeout(enable, 0);
            }
            return () => {
                cancelled = true;
                if (idleHandle != null && typeof window.cancelIdleCallback === 'function') {
                    window.cancelIdleCallback(idleHandle);
                }
                if (timeoutHandle != null) clearTimeout(timeoutHandle);
            };
        }, []);

        const accountChartData = useMemo(() => {
            if (!chartSeriesReady) return [];
            return buildAccountProfileChartData(userAttributedRequests, profileOperationalChartRange);
        }, [chartSeriesReady, userAttributedRequests, profileOperationalChartRange]);

        const perfChartVsRange = useMemo(() => {
            if (!perfChartVsEnabled) return null;
            return shiftRangeToComparisonYear(profileOperationalChartRange, perfChartVsYear);
        }, [perfChartVsEnabled, perfChartVsYear, profileOperationalChartRange]);

        const accountChartDataLy = useMemo(() => {
            if (!chartSeriesReady || !perfChartVsRange) return [];
            return buildAccountProfileChartData(userAttributedRequests, perfChartVsRange);
        }, [chartSeriesReady, userAttributedRequests, perfChartVsRange]);

        const accountChartDataDisplay = useMemo(() => {
            if (!perfChartVsEnabled) return accountChartData;
            const tab = PERF_TAB_TO_ACCOUNT[performanceChartTab];
            if (!chartTabSupportsVs(tab)) return accountChartData;
            return mergeChartRowsWithLyComparison(accountChartData, accountChartDataLy, tab);
        }, [accountChartData, accountChartDataLy, perfChartVsEnabled, performanceChartTab]);

        const recentRequestsList = useMemo(
            () =>
                getProfileRecentRequests(
                    userAttributedRequests,
                    scopePropId,
                    mergedUser,
                    recentReqFrom,
                    recentReqTo,
                    10
                ),
            [userAttributedRequests, scopePropId, mergedUser, recentReqFrom, recentReqTo]
        );

        const SIXTY_DAYS_MS = 60 * 86400000;
        /** Profile strip only — never builds the modal-sized list on open. */
        const previewLogs = useMemo(
            () =>
                buildProfileActivityLog(
                    sharedRequests,
                    accounts,
                    tasks,
                    mergedUser,
                    scopePropId,
                    SIXTY_DAYS_MS,
                    PROFILE_ACTIVITY_PREVIEW_CAP,
                    undefined,
                    activityDayFilter || undefined
                ),
            [sharedRequests, accounts, tasks, mergedUser, scopePropId, activityDayFilter]
        );

        useEffect(() => {
            if (!activityModalOpen) return;
            const t = setTimeout(() => setActivitySearchApplied(activitySearch), 250);
            return () => clearTimeout(t);
        }, [activitySearch, activityModalOpen]);

        useEffect(() => {
            if (!activityModalOpen) return;
            let cancelled = false;
            setActivityModalLoading(true);
            setActivityModalLogs(null);
            const t = setTimeout(() => {
                if (cancelled) return;
                const rows = buildProfileActivityLog(
                    sharedRequests,
                    accounts,
                    tasks,
                    mergedUser,
                    scopePropId,
                    SIXTY_DAYS_MS,
                    PROFILE_ACTIVITY_MODAL_CAP,
                    activitySearchApplied.trim() || undefined
                );
                setActivityModalLogs(rows);
                setActivityModalLoading(false);
            }, 0);
            return () => {
                cancelled = true;
                clearTimeout(t);
            };
        }, [
            activityModalOpen,
            activitySearchApplied,
            sharedRequests,
            accounts,
            tasks,
            mergedUser,
            scopePropId,
        ]);

        const closeActivityModal = () => {
            setActivityModalOpen(false);
            setActivityModalLogs(null);
            setActivityModalLoading(false);
            setActivitySearch('');
            setActivitySearchApplied('');
        };

        const logIcon = (kind: string) => {
            if (kind === 'account') return MapPin;
            if (kind === 'task') return CheckCircle2;
            return FileText;
        };
        const logColor = (kind: string) => {
            if (kind === 'account') return '#10b981';
            if (kind === 'task') return colors.orange;
            return colors.primary;
        };

        const avatarKey =
            mergedUser?.id != null ? `visatour_profile_avatar_v1_${mergedUser.id}` : 'visatour_profile_avatar_v1_anon';
        const [avatarUrl, setAvatarUrl] = useState('');
        const fileRef = useRef<HTMLInputElement>(null);
        useEffect(() => {
            try {
                setAvatarUrl(localStorage.getItem(avatarKey) || '');
            } catch {
                setAvatarUrl('');
            }
        }, [avatarKey]);

        const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (!f || !f.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = () => {
                const data = String(reader.result || '');
                try {
                    localStorage.setItem(avatarKey, data);
                } catch {
                    /* storage full */
                }
                setAvatarUrl(data);
            };
            reader.readAsDataURL(f);
            e.target.value = '';
        };

        const displayName = String(mergedUser?.name || 'User');
        const initialLetter = displayName.trim().charAt(0).toUpperCase() || '?';

        const handleExportCSV = () => {
            const source = activityModalOpen && activityModalLogs ? activityModalLogs : previewLogs;
            const rows = source.map(
                (l) => `${l.date},"${String(l.title).replace(/"/g, '""')}","${String(l.desc).replace(/"/g, '""')}"`
            );
            const csv = 'Date,Activity,Description\n' + rows.join('\n');
            const link = document.createElement('a');
            link.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
            link.setAttribute(
                'download',
                `activity_${displayName.replace(/\s+/g, '_')}_${activitySearchApplied || activityDayFilter || 'recent'}.csv`
            );
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        /** Month / Year / Full + Revenue / Requests tab pills — theme primary when selected. */
        const pillToggleStyle = (selected: boolean) => ({
            backgroundColor: selected ? colors.primary : 'rgba(15, 23, 42, 0.45)',
            color: '#f8fafc',
            fontWeight: 800,
            border: `1px solid ${selected ? `${String(colors.primary)}cc` : 'rgba(248, 250, 252, 0.14)'}`,
            boxShadow: selected ? `0 2px 12px ${String(colors.primary)}55` : undefined,
        });

        return (
            <div className="space-y-3 pb-4">
                {/* Top Toggle Navigation - Exclusive to Profile Dashboard */}
                <div className="flex items-center justify-between bg-black/5 p-1 rounded-2xl border border-white/5 mb-2">
                    <div className="flex gap-1 flex-wrap">
                        <button
                            type="button"
                            onClick={() => {
                                setViewMode('month');
                                setRevenueDateRange(rollingThreeMonthRange(new Date()));
                            }}
                            className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors hover:brightness-110"
                            style={pillToggleStyle(viewMode === 'month')}
                            title="Rolling 3-month window"
                        >
                            Month View
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const y = String(new Date().getFullYear());
                                setViewMode('year');
                                setRevenueDateRange({ fromMonth: 'Jan', fromYear: y, toMonth: 'Dec', toYear: y });
                            }}
                            className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors hover:brightness-110"
                            style={pillToggleStyle(viewMode === 'year')}
                            title="Current calendar year"
                        >
                            Year View
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('full')}
                            className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors hover:brightness-110"
                            style={pillToggleStyle(viewMode === 'full')}
                            title="All dates — KPIs and chart use full history for this user"
                        >
                            Full
                        </button>
                    </div>
                    <div className="px-4 text-[9px] font-bold opacity-30 uppercase tracking-[0.2em]" style={{ color: colors.textMain }}>
                        Interactive Analytics Feed
                    </div>
                </div>

                {/* Header Profile Section - Compact */}
                <div className="p-4 rounded-[24px] border relative overflow-hidden shadow-xl"
                    style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="absolute top-0 right-0 p-4 opacity-[0.02]">
                        <Users size={120} style={{ color: colors.primary }} />
                    </div>

                    <div className="flex flex-col lg:flex-row gap-6 items-center lg:items-start relative z-10 text-center lg:text-left">
                        <div className="relative group">
                            {avatarUrl ? (
                                <img
                                    src={avatarUrl}
                                    alt=""
                                    className="w-16 h-16 rounded-[20px] object-cover shadow-xl border border-white/10"
                                />
                            ) : (
                                <div
                                    className="w-16 h-16 rounded-[20px] flex items-center justify-center text-3xl font-black shadow-xl"
                                    style={{ backgroundColor: colors.primaryDim, color: colors.primary }}
                                >
                                    {initialLetter}
                                </div>
                            )}
                            {isOwnProfile && (
                                <>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={onAvatarFile}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileRef.current?.click()}
                                        className="absolute -bottom-1 -right-1 p-1.5 rounded-lg bg-primary text-black shadow-lg"
                                    >
                                        <Upload size={12} />
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="flex-1">
                            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-1 justify-center lg:justify-start">
                                <h2 className="text-xl font-black italic tracking-tighter" style={{ color: colors.textMain }}>
                                    {displayName.toUpperCase()}
                                </h2>
                                <span className="px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border"
                                    style={{ borderColor: colors.primary + '30', color: colors.primary, backgroundColor: colors.primary + '10' }}>
                                    {mergedUser.role}
                                </span>
                            </div>

                                <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/10 border border-white/5 backdrop-blur-sm">
                                        <Mail size={12} className="text-blue-400" />
                                        <span className="text-[10px] font-medium opacity-70" style={{ color: colors.textMain }}>{mergedUser.email}</span>
                                    </div>
                                    {assignedProperties.length > 0 ? (
                                        assignedProperties.map(p => (
                                            <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/10 border backdrop-blur-sm ${activeProperty?.id === p.id ? 'border-primary/50' : 'border-white/5'}`}>
                                                <Building size={12} className="text-emerald-400" />
                                                <span className="text-[10px] font-medium opacity-70" style={{ color: colors.textMain }}>{p.name}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/10 border border-white/5 backdrop-blur-sm">
                                            <Building size={12} className="text-emerald-400 opacity-40" />
                                            <span className="text-[10px] font-medium opacity-70" style={{ color: colors.textMain }}>Unassigned</span>
                                        </div>
                                    )}
                                </div>

                        </div>

                        <div className="flex gap-2">
                            {isOwnProfile && (
                                <button onClick={() => setShowResetPassword(true)} className="px-4 py-2 rounded-xl border transition-all font-bold text-[10px] uppercase"
                                    style={{ borderColor: colors.border, color: colors.textMain, opacity: 0.6 }}>
                                    Reset Password
                                </button>
                            )}
                            {!isOwnProfile && (
                                <button className="px-6 py-2 rounded-xl bg-primary text-black font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all">
                                    Message
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick Stats Grid - 6 Items */}
                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        {[
                            {
                                label:
                                    viewMode === 'full'
                                        ? 'All-time revenue'
                                        : viewMode === 'year'
                                          ? 'Annual Total Revenue'
                                          : 'Curr. Month Revenue',
                                value: formatMoney(monthRevenue, 0),
                                icon: TrendingUp,
                                color: '#10b981',
                            },
                            {
                                label:
                                    viewMode === 'full'
                                        ? 'All-time requests'
                                        : viewMode === 'year'
                                          ? 'Annual Requests'
                                          : 'Monthly Requests',
                                value: String(monthReqCount),
                                icon: List,
                                color: '#8b5cf6',
                            },
                            {
                                label:
                                    viewMode === 'full'
                                        ? 'Open pipeline (all)'
                                        : viewMode === 'year'
                                          ? 'Active Pipeline'
                                          : 'Active Month',
                                value: String(activePipeInPeriod),
                                icon: Zap,
                                color: '#ec4899',
                            },
                            {
                                label:
                                    viewMode === 'full'
                                        ? 'Sales touches (all-time)'
                                        : viewMode === 'year'
                                          ? 'Annual Sales Calls'
                                          : 'Curr. Month Calls',
                                value: String(callsKpi),
                                icon: Phone,
                                color: '#3b82f6',
                            },
                            { label: 'Total Accounts', value: String(userAccountsCount), icon: User, color: '#06b6d4' },
                            {
                                label: 'Task Ratio',
                                value: `${taskDone}/${taskTotal}`,
                                icon: CheckSquare,
                                color: '#f59e0b',
                            },
                        ].map((stat, i) => (
                            <div key={i} className="px-3 py-1.5 rounded-xl bg-black/5 border border-white/[0.03]">
                                <p className="text-[8px] uppercase font-bold tracking-[0.1em] mb-0.5" style={{ color: colors.textMain, opacity: 0.5 }}>{stat.label}</p>
                                <div className="flex items-center gap-2">
                                    <stat.icon size={12} style={{ color: stat.color }} />
                                    <h4 className="text-base font-black italic tracking-tighter" style={{ color: colors.textMain }}>{stat.value}</h4>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Dashboard Grid - White backgrounds for charts */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Revenue Trend Chart */}
                    <div className="lg:col-span-8 p-4 rounded-[24px] border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex flex-col gap-3 mb-3">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-xs font-bold italic" style={{ color: colors.textMain }}>
                                        {String(mergedUser?.name || user?.name || 'User').trim() || 'User'} PERFORMANCE
                                    </h3>
                                    {viewMode === 'full' && (
                                        <p className="text-[8px] uppercase tracking-widest" style={{ color: colors.textMain, opacity: 0.4 }}>
                                            Full history: chart spans from first to last operational month for this user on this property.
                                        </p>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                <ChartVsCompareControls
                                    chartTab={PERF_TAB_TO_ACCOUNT[performanceChartTab]}
                                    enabled={perfChartVsEnabled}
                                    onEnabledChange={setPerfChartVsEnabled}
                                    year={perfChartVsYear}
                                    onYearChange={setPerfChartVsYear}
                                    colors={colors}
                                />
                                <div className="flex gap-1 flex-wrap p-1 rounded-xl bg-black/10 border border-white/5">
                                    {(
                                        [
                                            ['revenue', 'Revenue'],
                                            ['requests', 'Requests'],
                                            ['rooms', 'Rooms'],
                                            ['mice', 'MICE'],
                                            ['status', 'Status'],
                                        ] as const
                                    ).map(([key, label]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setPerformanceChartTab(key)}
                                            className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors hover:brightness-110"
                                            style={pillToggleStyle(performanceChartTab === key)}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                </div>
                            </div>

                            {viewMode !== 'full' && (
                                <div className="flex flex-wrap items-center gap-2 bg-black/10 p-1.5 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[7px] font-bold opacity-40 uppercase ml-1" style={{ color: colors.textMain }}>From</span>
                                        <select
                                            className="bg-transparent text-[9px] font-bold outline-none cursor-pointer"
                                            style={{ color: colors.primary }}
                                            value={revenueDateRange.fromMonth}
                                            onChange={(e) => setRevenueDateRange({ ...revenueDateRange, fromMonth: e.target.value })}
                                        >
                                            {months.map((m) => (
                                                <option key={m} value={m}>
                                                    {m}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            className="bg-transparent text-[9px] font-bold outline-none cursor-pointer"
                                            style={{ color: colors.primary }}
                                            value={revenueDateRange.fromYear}
                                            onChange={(e) => setRevenueDateRange({ ...revenueDateRange, fromYear: e.target.value })}
                                        >
                                            {years.map((y) => (
                                                <option key={y} value={y}>
                                                    {y}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-[1px] h-3 bg-white/10 mx-1" />
                                    <div className="flex items-center gap-1">
                                        <span className="text-[7px] font-bold opacity-40 uppercase" style={{ color: colors.textMain }}>To</span>
                                        <select
                                            className="bg-transparent text-[9px] font-bold outline-none cursor-pointer"
                                            style={{ color: colors.primary }}
                                            value={revenueDateRange.toMonth}
                                            onChange={(e) => setRevenueDateRange({ ...revenueDateRange, toMonth: e.target.value })}
                                        >
                                            {months.map((m) => (
                                                <option key={m} value={m}>
                                                    {m}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            className="bg-transparent text-[9px] font-bold outline-none cursor-pointer"
                                            style={{ color: colors.primary }}
                                            value={revenueDateRange.toYear}
                                            onChange={(e) => setRevenueDateRange({ ...revenueDateRange, toYear: e.target.value })}
                                        >
                                            {years.map((y) => (
                                                <option key={y} value={y}>
                                                    {y}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="h-[155px] w-full">
                            {!chartSeriesReady ? (
                                <div
                                    className="h-full w-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest opacity-40"
                                    style={{ color: colors.textMain }}
                                >
                                    Loading chart…
                                </div>
                            ) : (
                                <Suspense
                                    fallback={
                                        <div
                                            className="h-full w-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest opacity-40"
                                            style={{ color: colors.textMain }}
                                        >
                                            Loading chart…
                                        </div>
                                    }
                                >
                                    <AccountProfilePerformanceChart
                                        chartTab={PERF_TAB_TO_ACCOUNT[performanceChartTab]}
                                        chartData={accountChartDataDisplay}
                                        colors={colors}
                                        chartVsEnabled={perfChartVsEnabled}
                                        chartVsYear={perfChartVsYear}
                                    />
                                </Suspense>
                            )}
                        </div>
                    </div>

                    {/* Segment Distribution */}
                    <div className="lg:col-span-4 p-4 rounded-[24px] border flex flex-col justify-between" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div>
                            <h3 className="text-xs font-bold italic mb-3" style={{ color: colors.textMain }}>SALES CALLS: ACTUAL vs TARGET</h3>

                            <div className="space-y-4">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-[8px] uppercase font-bold opacity-40 mb-1" style={{ color: colors.textMain }}>
                                                {viewMode === 'full'
                                                    ? 'All-time (same property)'
                                                    : viewMode === 'year'
                                                      ? `Year ${periodBounds.year}`
                                                      : `Month (${PROFILE_MONTH_LABELS[periodBounds.monthIndex]} ${periodBounds.year})`}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-xl font-black italic tracking-tighter" style={{ color: colors.primary }}>
                                                    {viewMode === 'full' ? callsKpi : viewMode === 'year' ? yearCalls : monthCalls}
                                                </h4>
                                                <span className="text-[8px] font-bold opacity-30" style={{ color: colors.textMain }}>
                                                    /{' '}
                                                    {viewMode === 'full'
                                                        ? annualTargetRaw || '—'
                                                        : viewMode === 'year'
                                                          ? annualTargetRaw || '—'
                                                          : monthlyTargetCalls || '—'}{' '}
                                                    {viewMode === 'full' || viewMode === 'year' ? 'YEAR TARGET' : 'MO TARGET'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] uppercase font-bold opacity-40 mb-1" style={{ color: colors.textMain }}>Monthly target</p>
                                            <h4 className="text-sm font-black italic tracking-tighter" style={{ color: colors.textMain }}>
                                                {monthlyTargetCalls || '—'}
                                            </h4>
                                        </div>
                                    </div>

                                    <div className="h-2 bg-black/10 rounded-full overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-primary transition-all duration-1000 ease-out"
                                            style={{
                                                width: `${
                                                    viewMode === 'year' || viewMode === 'full'
                                                        ? annualTargetRaw > 0
                                                            ? Math.min(100, (yearCalls / annualTargetRaw) * 100)
                                                            : 0
                                                        : progressCalls
                                                }%`,
                                            }}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-black/5 p-2 rounded-xl border border-white/5">
                                            <p className="text-[7px] font-bold opacity-40 uppercase" style={{ color: colors.textMain }}>Annual remaining</p>
                                            <p className="text-xs font-black italic" style={{ color: colors.textMain }}>
                                                {Math.max(0, annualTargetRaw - yearCalls).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-black/5 p-2 rounded-xl border border-white/5">
                                            <p className="text-[7px] font-bold opacity-40 uppercase" style={{ color: colors.textMain }}>Run rate (YTD)</p>
                                            <p className="text-xs font-black italic" style={{ color: colors.textMain }}>
                                                {(() => {
                                                    const mel =
                                                        new Date().getFullYear() === periodBounds.year
                                                            ? new Date().getMonth() + 1
                                                            : 12;
                                                    return mel > 0 ? `${Math.round(yearCalls / mel)} / mo` : '—';
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t mt-4" style={{ borderColor: colors.border }}>
                            <div className="flex items-center justify-between">
                                <span className="text-[8px] font-bold opacity-40 uppercase" style={{ color: colors.textMain }}>Target attainment</span>
                                <span className="text-[10px] font-black italic text-emerald-400">{precisionLabel}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Row - Activity List & Export */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-7 p-4 rounded-[24px] border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-xs font-bold italic" style={{ color: colors.textMain }}>RECENT ACTIVITY LOG</h3>
                                <p className="text-[8px] uppercase tracking-widest opacity-40" style={{ color: colors.textMain }}>
                                    Latest {PROFILE_ACTIVITY_PREVIEW_CAP} · last 60 days
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                <input
                                    type="date"
                                    className="p-1 px-2 bg-black/10 border border-white/10 rounded-lg text-[9px] font-bold outline-none"
                                    style={{ color: colors.textMain }}
                                    value={activityDayFilter}
                                    onChange={(e) => setActivityDayFilter(e.target.value)}
                                    title="Filter the preview strip by day"
                                />
                                <button
                                    type="button"
                                    onClick={() => setActivityModalOpen(true)}
                                    className="p-1.5 px-3 rounded-lg bg-primary text-black hover:scale-105 transition-transform flex items-center gap-1.5"
                                    title={`Open up to ${PROFILE_ACTIVITY_MODAL_CAP} recent activities`}
                                >
                                    <List size={12} />
                                    <span className="text-[9px] font-black uppercase">View all</span>
                                </button>
                                <button onClick={handleExportCSV} className="p-1.5 px-3 rounded-lg border border-white/10 hover:bg-black/10 transition-colors flex items-center gap-1.5" style={{ color: colors.primary }}>
                                    <Download size={12} />
                                    <span className="text-[9px] font-black uppercase">CSV</span>
                                </button>
                            </div>
                        </div>
                        <p className="text-[8px] opacity-40 mb-2" style={{ color: colors.textMain }}>
                            Showing {previewLogs.length} newest
                            {activityDayFilter ? ` on ${activityDayFilter}` : ''} (max {PROFILE_ACTIVITY_PREVIEW_CAP}). Use View all for search + up to {PROFILE_ACTIVITY_MODAL_CAP}.
                        </p>
                        <div className="space-y-0.5 max-h-[180px] overflow-auto custom-scrollbar pr-2">
                            {previewLogs.length === 0 ? (
                                <p className="text-[10px] opacity-50 py-4 text-center" style={{ color: colors.textMuted }}>No activity in this range.</p>
                            ) : (
                                previewLogs.slice(0, PROFILE_ACTIVITY_PREVIEW_CAP).map((log) => {
                                    const Icon = logIcon(log.kind);
                                    const col = logColor(log.kind);
                                    return (
                                        <div key={log.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-black/5 border border-transparent hover:border-white/5 transition-all group">
                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: col + '15', color: col }}>
                                                <Icon size={12} />
                                            </div>
                                            <div className="flex-1 overflow-hidden min-w-0">
                                                <div className="flex justify-between items-center mb-0 gap-2">
                                                    <h4 className="text-[10px] font-bold uppercase tracking-tight truncate" style={{ color: colors.textMain }}>{log.title}</h4>
                                                    <span className="text-[8px] font-mono opacity-40 flex items-center gap-1 shrink-0" style={{ color: colors.textMain }}><Clock size={8} /> {log.date}</span>
                                                </div>
                                                <p className="text-[9px] opacity-50 break-words" style={{ color: colors.textMain }}>{log.desc}</p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-5 p-4 rounded-[24px] border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-xs font-bold italic" style={{ color: colors.textMain }}>TASK EXECUTION</h3>
                                <p className="text-[8px] uppercase tracking-widest opacity-40" style={{ color: colors.textMain }}>Pipeline Health Status</p>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-primary">{taskPct}% DONE</span>
                        </div>

                        <div className="space-y-3">
                            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${taskPct}%` }}></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                                    <p className="text-[7px] font-bold text-red-500/80 uppercase mb-0.5">Urgent</p>
                                    <h5 className="text-lg font-black italic tracking-tighter text-red-500">{String(taskUrgent).padStart(2, '0')}</h5>
                                </div>
                                <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
                                    <p className="text-[7px] font-bold text-orange-500/80 uppercase mb-0.5">Pending</p>
                                    <h5 className="text-lg font-black italic tracking-tighter text-orange-500">{String(taskPending).padStart(2, '0')}</h5>
                                </div>
                                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                    <p className="text-[7px] font-bold text-blue-500/80 uppercase mb-0.5">Due</p>
                                    <h5 className="text-lg font-black italic tracking-tighter text-blue-500">{String(taskDue).padStart(2, '0')}</h5>
                                </div>
                                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <p className="text-[7px] font-bold text-emerald-500/80 uppercase mb-0.5">Done</p>
                                    <h5 className="text-lg font-black italic tracking-tighter text-emerald-500">{String(taskDone).padStart(2, '0')}</h5>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => onOpenTasks?.()}
                                className="w-full py-2.5 rounded-xl bg-black/20 border border-white/10 text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-black/30 transition-all"
                            >
                                Open Tasks Page
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-[24px] border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div>
                            <h3 className="text-xs font-bold italic" style={{ color: colors.textMain }}>RECENT REQUESTS</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[7px] font-bold opacity-40 uppercase" style={{ color: colors.textMain }}>Created from</span>
                            <input
                                type="date"
                                className="p-1.5 px-2 bg-black/10 border border-white/10 rounded-lg text-[9px] font-bold outline-none"
                                style={{ color: colors.textMain }}
                                value={recentReqFrom}
                                onChange={(e) => setRecentReqFrom(e.target.value)}
                            />
                            <span className="text-[7px] font-bold opacity-40 uppercase" style={{ color: colors.textMain }}>to</span>
                            <input
                                type="date"
                                className="p-1.5 px-2 bg-black/10 border border-white/10 rounded-lg text-[9px] font-bold outline-none"
                                style={{ color: colors.textMain }}
                                value={recentReqTo}
                                onChange={(e) => setRecentReqTo(e.target.value)}
                            />
                            {(recentReqFrom || recentReqTo) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRecentReqFrom('');
                                        setRecentReqTo('');
                                    }}
                                    className="text-[8px] font-bold uppercase opacity-50 hover:opacity-100"
                                    style={{ color: colors.textMuted }}
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[10px] min-w-[640px]">
                            <thead>
                                <tr className="border-b opacity-50" style={{ borderColor: colors.border }}>
                                    <th className="py-2 pr-2">Created</th>
                                    <th className="py-2 pr-2">Name</th>
                                    <th className="py-2 pr-2">Conf.</th>
                                    <th className="py-2 pr-2">Status</th>
                                    <th className="py-2 text-right">Value (pre-tax)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentRequestsList.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-6 text-center opacity-40 italic">
                                            No requests in this range for this profile.
                                        </td>
                                    </tr>
                                ) : (
                                    recentRequestsList.map((r: any) => {
                                        const cd = String(r?.createdAt || '').split('T')[0] || '—';
                                        return (
                                            <tr key={String(r.id)} className="border-b border-white/5" style={{ borderColor: colors.border }}>
                                                <td className="py-2 pr-2 font-mono opacity-80">{cd}</td>
                                                <td className="py-2 pr-2 font-bold truncate max-w-[200px]">{r.requestName || '—'}</td>
                                                <td className="py-2 pr-2 font-mono opacity-70">{r.confirmationNo || '—'}</td>
                                                <td className="py-2 pr-2">{r.status || '—'}</td>
                                                <td className="py-2 text-right font-mono" style={{ color: colors.primary }}>
                                                    {formatMoney(computeProfileRequestPreTax(r), 0)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Activity log — loads up to 90 only after View all */}
                {activityModalOpen && (
                    <div
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                        onClick={closeActivityModal}
                        role="presentation"
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Activity log"
                            className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-[24px] border shadow-2xl"
                            style={{ backgroundColor: colors.card, borderColor: colors.border }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between gap-3 p-4 border-b" style={{ borderColor: colors.border }}>
                                <div>
                                    <h3 className="text-sm font-bold italic" style={{ color: colors.textMain }}>Activity log</h3>
                                    <p className="text-[8px] uppercase tracking-widest opacity-40" style={{ color: colors.textMain }}>
                                        Up to {PROFILE_ACTIVITY_MODAL_CAP} · last 60 days
                                    </p>
                                </div>
                                <button type="button" onClick={closeActivityModal} style={{ color: colors.textMuted }} aria-label="Close">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: colors.border }}>
                                <input
                                    type="search"
                                    placeholder="Search activity…"
                                    className="flex-1 p-2 px-3 bg-black/10 border border-white/10 rounded-xl text-[11px] font-medium outline-none"
                                    style={{ color: colors.textMain }}
                                    value={activitySearch}
                                    onChange={(e) => setActivitySearch(e.target.value)}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={handleExportCSV}
                                    className="p-2 px-3 rounded-xl bg-primary text-black flex items-center gap-1.5 shrink-0"
                                >
                                    <Download size={12} />
                                    <span className="text-[9px] font-black uppercase">CSV</span>
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto custom-scrollbar p-3 space-y-0.5 min-h-[200px]">
                                {activityModalLoading || activityModalLogs == null ? (
                                    <p className="text-[10px] opacity-50 py-10 text-center uppercase tracking-widest" style={{ color: colors.textMuted }}>
                                        Loading…
                                    </p>
                                ) : activityModalLogs.length === 0 ? (
                                    <p className="text-[10px] opacity-50 py-10 text-center" style={{ color: colors.textMuted }}>
                                        {activitySearchApplied.trim() ? 'No matches for that search.' : 'No activity in the last 60 days.'}
                                    </p>
                                ) : (
                                    activityModalLogs.map((log) => {
                                        const Icon = logIcon(log.kind);
                                        const col = logColor(log.kind);
                                        return (
                                            <div
                                                key={log.id}
                                                className="flex items-center gap-3 p-2 rounded-xl hover:bg-black/5 border border-transparent hover:border-white/5 transition-all"
                                            >
                                                <div
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                                    style={{ backgroundColor: col + '15', color: col }}
                                                >
                                                    <Icon size={12} />
                                                </div>
                                                <div className="flex-1 overflow-hidden min-w-0">
                                                    <div className="flex justify-between items-center mb-0 gap-2">
                                                        <h4
                                                            className="text-[10px] font-bold uppercase tracking-tight truncate"
                                                            style={{ color: colors.textMain }}
                                                        >
                                                            {log.title}
                                                        </h4>
                                                        <span
                                                            className="text-[8px] font-mono opacity-40 flex items-center gap-1 shrink-0"
                                                            style={{ color: colors.textMain }}
                                                        >
                                                            <Clock size={8} /> {log.date}
                                                        </span>
                                                    </div>
                                                    <p className="text-[9px] opacity-50 break-words" style={{ color: colors.textMain }}>
                                                        {log.desc}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Reset Password Form overlay */}
                {showResetPassword && isOwnProfile && (
                    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div className="w-full max-w-sm space-y-4">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold" style={{ color: colors.primary }}>Security Credentials</h3>
                                <button onClick={() => setShowResetPassword(false)} style={{ color: colors.textMuted }}><X size={24} /></button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Current Password</label>
                                    <input type="password" placeholder="••••••••" className="w-full p-3 bg-black/40 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={resetPasswordData.current} onChange={e => setResetPasswordData({ ...resetPasswordData, current: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">New Password</label>
                                    <input type="password" placeholder="••••••••" className="w-full p-3 bg-black/40 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={resetPasswordData.new} onChange={e => setResetPasswordData({ ...resetPasswordData, new: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Confirm New Password</label>
                                    <input type="password" placeholder="••••••••" className="w-full p-3 bg-black/40 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={resetPasswordData.confirm} onChange={e => setResetPasswordData({ ...resetPasswordData, confirm: e.target.value })} />
                                </div>
                                <button
                                    type="button"
                                    disabled={resetPasswordBusy}
                                    className="w-full py-4 rounded-xl font-bold transition-all disabled:opacity-50"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                    onClick={() => void handleProfileChangePassword()}
                                >
                                    {resetPasswordBusy ? 'Saving…' : 'Save New Credentials'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
}

