import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Phone, Mail, MapPin, X, Plus, Edit, Trash2, ChevronDown,
    PhoneCall, Send, FileText, MessageSquare, History, CalendarDays, GitMerge, Search, Camera,
} from 'lucide-react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';
import {
    computeAccountMetrics,
    buildAccountTimeline,
    filterInquiryToTentativeRequests,
    formatRequestStatusLabel,
    type TimelineItem
} from './accountProfileData';
import { computeRequestRevenueBreakdownNoTax } from './operationalSegmentRevenue';
import { formatSarCompact } from './formatSar';
import { getTagColor, setTagColorForName, TAG_COLORS_EVENT, readTagColors, writeTagColors } from './tagColorSettings';
import type { ContractRecord, ContractStatus } from './contractsStore';
import { type CurrencyCode } from './currency';
import { useCurrencyFormatters } from './useCurrencyFormatters';
import { getPrimaryOperationalDate } from './userProfileMetrics';
import {
    buildAccountProfileChartData,
    getDefaultAccountPerformanceRange,
} from './accountProfileChartData';
import AccountProfilePerformanceChart, {
    ACCOUNT_PROFILE_CHART_TABS,
    type AccountProfileChartTab,
} from './AccountProfilePerformanceChart';
import ChartVsCompareControls, { defaultChartVsYear } from './ChartVsCompareControls';
import {
    chartTabSupportsVs,
    mergeChartRowsWithLyComparison,
    shiftRangeToComparisonYear,
} from './chartVsYearCompare';
import AccountRatesModal from './AccountRatesModal';

export interface CRMProfileViewProps {
    lead: any;
    theme: any;
    onClose: () => void;
    onLeadChange: (next: any) => void;
    linkedRequests?: any[];
    salesCalls?: any[];
    currentUser?: any;
    onOpenRequest?: (requestId: string) => void;
    onViewAccountRequests?: () => void;
    onEditAccount?: () => void;
    /** Property context for Rates (room types / segments / occupancy). */
    activeProperty?: any;
    segmentOptions?: string[];
    /** View-only profile: hide all create/edit/delete controls. */
    readOnly?: boolean;
    /** Delete account (Head of Sales + Admin). */
    canDeleteAccount?: boolean;
    /** Edit/delete manual timeline entries (Head of Sales + Admin). */
    canManageManualTimeline?: boolean;
    /** Rename/remove tags & colors (Admin only). */
    canManageAccountTags?: boolean;
    appendAuditLog?: (action: string, details: string) => void;
    onDeleteAccount?: () => void;
    accountContracts?: ContractRecord[];
    onUpdateContractStatus?: (contractId: string, status: ContractStatus) => void;
    onUpdateContractMeta?: (contractId: string, patch: { startDate?: string; endDate?: string }) => void;
    onUploadSignedContract?: (contractId: string, file: File) => Promise<void> | void;
    onDownloadContractFile?: (contractId: string, kind: 'word' | 'pdf' | 'signed') => void;
    onStartNewContractForAccount?: () => void;
    canDeleteContractRecords?: boolean;
    onDeleteContractRecord?: (contractId: string) => void;
    currency?: CurrencyCode;
    /** When set with onShellAccountPerformanceRangeChange, range is controlled from the app shell (Accounts nav header). */
    shellAccountPerformanceRange?: { from: string; to: string };
    onShellAccountPerformanceRangeChange?: (r: { from: string; to: string }) => void;
    /** Merge another account into this profile (requests, CRM, contracts). */
    canMergeAccountsAndAssignOwner?: boolean;
    accountOwnerUserOptions?: { id: string; name: string }[];
    allAccountsForMergeSearch?: any[];
    onMergeAccountIntoCurrent?: (sourceAccountId: string) => void;
    onAssignAccountOwner?: (userId: string, ownerDisplayName: string) => void;
    onScanContactCard?: (file: File) => Promise<any> | void;
}

function timelineIcon(item: TimelineItem, colors: any) {
    const wrap = (child: React.ReactNode, bg: string) => (
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${bg}20` }}>
            {child}
        </div>
    );
    switch (item.icon) {
        case 'call':
            return wrap(<PhoneCall size={18} style={{ color: colors.blue }} />, colors.blue);
        case 'request':
            return wrap(<FileText size={18} style={{ color: colors.cyan }} />, colors.cyan);
        case 'note':
            return wrap(<MessageSquare size={18} style={{ color: colors.purple }} />, colors.purple);
        default:
            return wrap(<Send size={18} style={{ color: colors.orange }} />, colors.orange);
    }
}

export default function CRMProfileView({
    lead,
    theme,
    onClose,
    onLeadChange,
    linkedRequests = [],
    salesCalls = [],
    currentUser,
    onOpenRequest,
    onViewAccountRequests,
    onEditAccount,
    readOnly = false,
    canDeleteAccount = false,
    canManageManualTimeline = false,
    canManageAccountTags = false,
    appendAuditLog,
    onDeleteAccount,
    accountContracts = [],
    onUpdateContractStatus,
    onUpdateContractMeta,
    onUploadSignedContract,
    onDownloadContractFile,
    onStartNewContractForAccount,
    canDeleteContractRecords = false,
    onDeleteContractRecord,
    currency = 'SAR',
    shellAccountPerformanceRange,
    onShellAccountPerformanceRangeChange,
    canMergeAccountsAndAssignOwner = false,
    accountOwnerUserOptions = [],
    allAccountsForMergeSearch = [],
    onMergeAccountIntoCurrent,
    onAssignAccountOwner,
    onScanContactCard,
    activeProperty,
    segmentOptions,
}: CRMProfileViewProps) {
    const colors = theme.colors;
    const { selectedCurrency, formatCurrencyAmount } = useCurrencyFormatters(currency);
    const isShellPerformanceRange =
        shellAccountPerformanceRange != null && onShellAccountPerformanceRangeChange != null;
    const [internalPerformanceDateRange, setInternalPerformanceDateRange] = useState(getDefaultAccountPerformanceRange);
    const performanceDateRange = isShellPerformanceRange
        ? shellAccountPerformanceRange!
        : internalPerformanceDateRange;
    const [perfDraftFrom, setPerfDraftFrom] = useState(() => getDefaultAccountPerformanceRange().from);
    const [perfDraftTo, setPerfDraftTo] = useState(() => getDefaultAccountPerformanceRange().to);
    const [accountChartTab, setAccountChartTab] = useState<AccountProfileChartTab>('Revenue');
    const [accountChartVsEnabled, setAccountChartVsEnabled] = useState(false);
    const [accountChartVsYear, setAccountChartVsYear] = useState(defaultChartVsYear);
    const [showAccountPerfDatePicker, setShowAccountPerfDatePicker] = useState(false);
    const [timelineShowAll, setTimelineShowAll] = useState(false);
    const accountPerfPickerRef = useRef<HTMLDivElement>(null);

    const leadIdentityKey = String(lead?.accountId || lead?.id || lead?.company || '');

    useEffect(() => {
        setAccountChartTab('Revenue');
        setTimelineShowAll(false);
        setShowAccountPerfDatePicker(false);
        setShowMergeModal(false);
        setMergeSearch('');
        setMergePickId(null);
        if (!isShellPerformanceRange) {
            const d = getDefaultAccountPerformanceRange();
            setInternalPerformanceDateRange(d);
            setPerfDraftFrom(d.from);
            setPerfDraftTo(d.to);
        }
    }, [leadIdentityKey, isShellPerformanceRange]);

    useEffect(() => {
        if (!showAccountPerfDatePicker) return;
        const onDown = (e: MouseEvent) => {
            const el = accountPerfPickerRef.current;
            if (el && !el.contains(e.target as Node)) setShowAccountPerfDatePicker(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [showAccountPerfDatePicker]);

    const performanceLinkedRequests = useMemo(() => {
        const list = linkedRequests || [];
        const { from, to } = performanceDateRange;
        if (!from || !to || from > to) return list;
        return list.filter((r) => {
            const ymd = getPrimaryOperationalDate(r);
            if (!ymd) return false;
            return ymd >= from && ymd <= to;
        });
    }, [linkedRequests, performanceDateRange]);

    const accountChartOperationalRange = useMemo(
        () => ({ start: performanceDateRange.from, end: performanceDateRange.to }),
        [performanceDateRange.from, performanceDateRange.to]
    );

    const accountChartData = useMemo(
        () => buildAccountProfileChartData(linkedRequests || [], accountChartOperationalRange),
        [linkedRequests, accountChartOperationalRange]
    );

    const accountChartVsRange = useMemo(() => {
        if (!accountChartVsEnabled) return null;
        return shiftRangeToComparisonYear(accountChartOperationalRange, accountChartVsYear);
    }, [accountChartVsEnabled, accountChartVsYear, accountChartOperationalRange]);

    const accountChartDataLy = useMemo(() => {
        if (!accountChartVsRange) return [];
        return buildAccountProfileChartData(linkedRequests || [], accountChartVsRange);
    }, [linkedRequests, accountChartVsRange]);

    const accountChartDataDisplay = useMemo(() => {
        if (!accountChartVsEnabled) return accountChartData;
        if (!chartTabSupportsVs(accountChartTab)) return accountChartData;
        return mergeChartRowsWithLyComparison(accountChartData, accountChartDataLy, accountChartTab);
    }, [accountChartData, accountChartDataLy, accountChartVsEnabled, accountChartTab]);

    const [expandedContact, setExpandedContact] = useState<number | null>(0);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [newContactData, setNewContactData] = useState({
        firstName: '', lastName: '', position: '', email: '', phone: '', city: '', country: ''
    });
    const [editingContactIdx, setEditingContactIdx] = useState<number | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; idx: number | null; name: string }>({
        isOpen: false, idx: null, name: ''
    });

    const [ownerUserIdDraft, setOwnerUserIdDraft] = useState('');
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [mergeSearch, setMergeSearch] = useState('');
    const [mergePickId, setMergePickId] = useState<string | null>(null);
    const [mergeBusy, setMergeBusy] = useState(false);
    const [scanBusy, setScanBusy] = useState(false);
    const contactScanInputRef = useRef<HTMLInputElement | null>(null);

    const destAccountId = String(lead.accountId || lead.id || '');
    const mergeCandidates = useMemo(() => {
        const q = mergeSearch.trim().toLowerCase();
        const list = Array.isArray(allAccountsForMergeSearch) ? allAccountsForMergeSearch : [];
        return list.filter((a: any) => {
            if (!a?.id || String(a.id) === destAccountId) return false;
            if (!q) return true;
            const n = String(a.name || '').toLowerCase();
            return n.includes(q);
        });
    }, [allAccountsForMergeSearch, destAccountId, mergeSearch]);

    useEffect(() => {
        if (!canMergeAccountsAndAssignOwner) return;
        const cid = String((lead as any).createdByUserId || '').trim();
        if (cid && accountOwnerUserOptions.some((o) => String(o.id) === cid)) {
            setOwnerUserIdDraft(cid);
            return;
        }
        const name = String((lead as any).accountOwnerName || '').trim().toLowerCase();
        if (!name) {
            setOwnerUserIdDraft('');
            return;
        }
        const hit = accountOwnerUserOptions.find((o) => String(o.name || '').trim().toLowerCase() === name);
        setOwnerUserIdDraft(hit ? hit.id : '');
    }, [leadIdentityKey, canMergeAccountsAndAssignOwner, lead, accountOwnerUserOptions]);

    const tags = lead.tags || [];
    const metrics = useMemo(() => computeAccountMetrics(performanceLinkedRequests), [performanceLinkedRequests]);
    const activeOpportunityRequests = useMemo(
        () => filterInquiryToTentativeRequests(performanceLinkedRequests),
        [performanceLinkedRequests]
    );
    const timelineItems = useMemo(
        () =>
            buildAccountTimeline({
                requestsForAccount: linkedRequests,
                salesCalls,
                manualActivities: lead.activities || []
            }),
        [linkedRequests, salesCalls, lead.activities]
    );

    const TIMELINE_PAGE = 10;
    const timelineVisibleItems = useMemo(
        () => (timelineShowAll ? timelineItems : timelineItems.slice(0, TIMELINE_PAGE)),
        [timelineItems, timelineShowAll]
    );
    const winRate = metrics.winRate;
    const cancellationRate = metrics.cancellationRate;
    const totalSpend = metrics.totalSpend;
    const totalRequests = metrics.totalRequests;
    const winBarPct = totalRequests > 0 ? (metrics.wonCount / totalRequests) * 100 : 0;
    const cancelBarPct = totalRequests > 0 ? (metrics.cancelledCount / totalRequests) * 100 : 0;
    const otherBarPct = totalRequests > 0 ? (metrics.otherCount / totalRequests) * 100 : 0;
    const preferredBusiness = useMemo(() => {
        const counts: Record<string, number> = {
            Group: 0,
            Series: 0,
            MICE: 0,
            Accom: 0,
        };
        for (const req of performanceLinkedRequests || []) {
            const t = String(req?.requestType || '').toLowerCase().trim();
            if (!t) continue;
            if (t === 'series' || t.includes('series')) {
                counts.Series += 1;
            } else if (
                t === 'event' ||
                t === 'event only' ||
                t === 'event_rooms' ||
                t === 'event with rooms' ||
                t === 'event with room' ||
                t.includes('event with room')
            ) {
                counts.MICE += 1;
            } else if (t === 'group' || t === 'group_acc' || t.includes('group')) {
                counts.Group += 1;
            } else if (t === 'accommodation' || t === 'accommodation only' || t.includes('accommodation')) {
                counts.Accom += 1;
            } else {
                counts.Accom += 1;
            }
        }
        const palette: Record<string, string> = {
            Group: colors.blue,
            Series: colors.cyan,
            MICE: colors.purple,
            Accom: colors.orange,
        };
        const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
        const data = Object.entries(counts)
            .filter(([, value]) => value > 0)
            .map(([name, value]) => ({
                name,
                value,
                color: palette[name] || colors.textMuted,
                pct: total > 0 ? `${Math.round((value / total) * 100)}%` : '0%',
            }));
        return { total, data };
    }, [performanceLinkedRequests, colors.blue, colors.cyan, colors.purple, colors.orange, colors.textMuted]);
    const initial = (lead.company || '?').toString().charAt(0) || '?';

    const [showActivityModal, setShowActivityModal] = useState(false);
    const [showRatesModal, setShowRatesModal] = useState(false);
    const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
    const [activityForm, setActivityForm] = useState({ title: '', body: '' });
    const [tagDraft, setTagDraft] = useState('');
    const [showTagField, setShowTagField] = useState(false);
    const [tagColorTick, setTagColorTick] = useState(0);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [editingTagIdx, setEditingTagIdx] = useState<number | null>(null);
    const [tagRenameDraft, setTagRenameDraft] = useState('');

    useEffect(() => {
        const h = () => setTagColorTick((t) => t + 1);
        window.addEventListener(TAG_COLORS_EVENT, h);
        return () => window.removeEventListener(TAG_COLORS_EVENT, h);
    }, []);

    const auditLog = lead.profileAuditLog || [];

    const handleSaveContact = () => {
        if (!newContactData.firstName || !newContactData.lastName) return;
        const fullName = `${newContactData.firstName} ${newContactData.lastName}`;

        const currentContacts = lead.contacts || [{
            name: lead.contact, position: lead.position,
            email: lead.email, phone: lead.phone,
            city: lead.city, country: lead.country
        }];

        const contactData = {
            name: fullName,
            position: newContactData.position,
            email: newContactData.email,
            phone: newContactData.phone,
            city: newContactData.city,
            country: newContactData.country
        };

        let updatedContacts;
        if (editingContactIdx !== null) {
            updatedContacts = [...currentContacts];
            updatedContacts[editingContactIdx] = contactData;
        } else {
            updatedContacts = [...currentContacts, contactData];
        }

        const primary = updatedContacts[0];
        onLeadChange({
            ...lead,
            contacts: updatedContacts,
            contact: primary?.name ?? lead.contact,
            position: primary?.position ?? lead.position,
            email: primary?.email ?? lead.email,
            phone: primary?.phone ?? lead.phone
        });
        appendAuditLog?.(editingContactIdx !== null ? 'Contact updated' : 'Contact added', fullName);
        setNewContactData({ firstName: '', lastName: '', position: '', email: '', phone: '', city: '', country: '' });
        setIsContactModalOpen(false);
        setEditingContactIdx(null);
        if (editingContactIdx === null) setExpandedContact(updatedContacts.length - 1);
    };

    const handleDeleteContact = () => {
        if (deleteConfirm.idx === null) return;
        const currentContacts = lead.contacts || [{
            name: lead.contact, position: lead.position,
            email: lead.email, phone: lead.phone,
            city: lead.city, country: lead.country
        }];

        const updatedContacts = currentContacts.filter((_: any, i: number) => i !== deleteConfirm.idx);
        const primary = updatedContacts[0];
        onLeadChange({
            ...lead,
            contacts: updatedContacts,
            contact: primary?.name ?? '',
            position: primary?.position ?? '',
            email: primary?.email ?? '',
            phone: primary?.phone ?? ''
        });
        appendAuditLog?.('Contact removed', deleteConfirm.name);
        setDeleteConfirm({ isOpen: false, idx: null, name: '' });
        setExpandedContact(null);
    };

    const handlePickContactScanFile = () => {
        if (scanBusy) return;
        contactScanInputRef.current?.click();
    };

    const handleContactScanFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !onScanContactCard) return;
        setScanBusy(true);
        try {
            await onScanContactCard(file);
        } catch (err: any) {
            window.alert(err?.message || 'Could not scan this business card right now.');
        } finally {
            setScanBusy(false);
        }
    };

    const contactList = lead.contacts || [{
        name: lead.contact, position: lead.position,
        email: lead.email, phone: lead.phone,
        city: lead.city, country: lead.country
    }];

    const runAssignOwner = () => {
        if (!onAssignAccountOwner || !ownerUserIdDraft) return;
        const row = accountOwnerUserOptions.find((o) => o.id === ownerUserIdDraft);
        if (!row) return;
        onAssignAccountOwner(row.id, row.name);
        appendAuditLog?.('Account owner set', `Owner set to ${row.name}.`);
    };

    const runMerge = () => {
        if (!onMergeAccountIntoCurrent || !mergePickId) return;
        setMergeBusy(true);
        try {
            onMergeAccountIntoCurrent(mergePickId);
            setShowMergeModal(false);
            setMergeSearch('');
            setMergePickId(null);
        } finally {
            setMergeBusy(false);
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: colors.bg }}>
            <div className="shrink-0 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="p-6 flex justify-between items-start gap-4">
                <div className="flex items-start gap-4 min-w-0">
                    <button type="button" onClick={onClose} className="p-2 rounded hover:bg-white/5 shrink-0" style={{ color: colors.textMuted }}>
                        <X size={20} />
                    </button>
                    <div className="flex items-start gap-4 min-w-0">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shrink-0"
                            style={{ backgroundColor: colors.primary }}>
                            {initial}
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                                <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>{lead.company}</h1>
                                <span className="text-sm" style={{ color: colors.textMuted }}>
                                    Account owner:{' '}
                                    <span className="font-semibold" style={{ color: colors.textMain }}>
                                        {String((lead as any).accountOwnerName || '').trim() || '—'}
                                    </span>
                                </span>
                            </div>
                            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>
                                Client TAX ID:{' '}
                                <span className="font-mono normal-case tracking-normal" style={{ color: colors.textMain }}>
                                    {String(lead.clientTaxId ?? (lead as any).taxId ?? '').trim() || '—'}
                                </span>
                            </p>
                            <p className="text-sm" style={{ color: colors.textMuted }}>{lead.contact} • {lead.position}</p>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
                    {!isShellPerformanceRange && (
                    <div
                        className="relative flex items-center gap-2 px-2 py-1 rounded-lg border transition-colors"
                        ref={accountPerfPickerRef}
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                if (!showAccountPerfDatePicker) {
                                    setPerfDraftFrom(performanceDateRange.from);
                                    setPerfDraftTo(performanceDateRange.to);
                                }
                                setShowAccountPerfDatePicker((v) => !v);
                            }}
                            className="p-1 rounded hover:bg-white/10 transition-colors"
                            title="Performance date range (operational dates)"
                        >
                            <CalendarDays
                                size={14}
                                style={{ color: showAccountPerfDatePicker ? colors.primary : colors.textMuted }}
                                className="shrink-0"
                            />
                        </button>
                        <span
                            className="text-[10px] font-bold uppercase tracking-wide max-w-[min(12rem,28vw)] truncate hidden sm:inline font-mono"
                            style={{ color: colors.textMuted }}
                            title={`${performanceDateRange.from} → ${performanceDateRange.to}`}
                        >
                            {performanceDateRange.from} → {performanceDateRange.to}
                        </span>
                        {showAccountPerfDatePicker && (
                            <div
                                className="absolute top-full right-0 mt-2 p-4 rounded-xl border shadow-2xl z-[130] w-[min(100vw-2rem,20rem)] flex flex-col gap-3"
                                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                            >
                                <div>
                                    <label className="text-[9px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>From</label>
                                    <input
                                        type="date"
                                        value={perfDraftFrom}
                                        onChange={(e) => setPerfDraftFrom(e.target.value)}
                                        className="w-full px-2 py-1.5 rounded border text-xs"
                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>To</label>
                                    <input
                                        type="date"
                                        value={perfDraftTo}
                                        onChange={(e) => setPerfDraftTo(e.target.value)}
                                        className="w-full px-2 py-1.5 rounded border text-xs"
                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="w-full py-2 rounded text-[10px] font-black uppercase tracking-wide"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                    onClick={() => {
                                        const f = perfDraftFrom.trim().slice(0, 10);
                                        const t = perfDraftTo.trim().slice(0, 10);
                                        if (!f || !t || f > t) return;
                                        setInternalPerformanceDateRange({ from: f, to: t });
                                        setShowAccountPerfDatePicker(false);
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
                                        setInternalPerformanceDateRange(d);
                                        setPerfDraftFrom(d.from);
                                        setPerfDraftTo(d.to);
                                        setShowAccountPerfDatePicker(false);
                                    }}
                                >
                                    RESET TO CURRENT YEAR
                                </button>
                            </div>
                        )}
                    </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setShowHistoryModal(true)}
                        className="px-3 py-2 rounded border hover:bg-white/5 flex items-center gap-2 text-sm"
                        style={{ borderColor: colors.border, color: colors.textMain }}
                        title="Profile history and user actions"
                    >
                        <History size={16} /> History
                    </button>
                    {!readOnly && onEditAccount && (
                        <button
                            type="button"
                            onClick={onEditAccount}
                            className="px-4 py-2 rounded border hover:bg-white/5 flex items-center gap-2"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                        >
                            <Edit size={16} /> Edit
                        </button>
                    )}
                    {!readOnly && canDeleteAccount && onDeleteAccount && (
                        <button
                            type="button"
                            onClick={onDeleteAccount}
                            className="px-4 py-2 rounded border flex items-center gap-2 text-red-500 hover:bg-red-500/10"
                            style={{ borderColor: 'rgba(239,68,68,0.35)' }}
                        >
                            <Trash2 size={16} /> Delete account
                        </button>
                    )}
                    {onViewAccountRequests ? (
                        <button
                            type="button"
                            onClick={onViewAccountRequests}
                            className="px-3 py-2 rounded border hover:bg-white/5 flex items-center gap-2 text-sm font-bold"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                        >
                            View Requests
                        </button>
                    ) : null}
                    {!readOnly && (
                        <button
                            type="button"
                            onClick={() => {
                                setEditingActivityId(null);
                                setActivityForm({ title: '', body: '' });
                                setShowActivityModal(true);
                            }}
                            className="px-4 py-2 rounded font-bold flex items-center gap-2"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            <Plus size={16} /> New Activity
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setShowRatesModal(true)}
                        className="px-4 py-2 rounded border font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
                        style={{
                            borderColor: colors.primary,
                            color: colors.primary,
                            boxShadow: `0 0 16px ${colors.primary}44`,
                        }}
                    >
                        Rates
                    </button>
                </div>
                </div>
            </div>

            {canMergeAccountsAndAssignOwner && !readOnly && (onMergeAccountIntoCurrent || onAssignAccountOwner) && (
                <div
                    className="shrink-0 px-6 py-3 border-b flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                >
                    <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.textMuted }}>
                        Admin — account maintenance
                    </div>
                    {onAssignAccountOwner && accountOwnerUserOptions.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="text-xs font-bold" style={{ color: colors.textMuted }}>
                                Account owner
                            </label>
                            <select
                                value={ownerUserIdDraft}
                                onChange={(e) => setOwnerUserIdDraft(e.target.value)}
                                className="text-sm font-semibold px-3 py-2 rounded-lg border min-w-[12rem]"
                                style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.textMain }}
                                aria-label="Select account owner"
                            >
                                <option value="">— No owner selected —</option>
                                {accountOwnerUserOptions.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                disabled={!ownerUserIdDraft}
                                onClick={runAssignOwner}
                                className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                            >
                                Apply owner
                            </button>
                        </div>
                    )}
                    {onMergeAccountIntoCurrent && (
                        <button
                            type="button"
                            onClick={() => {
                                setMergeSearch('');
                                setMergePickId(null);
                                setShowMergeModal(true);
                            }}
                            className="px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-2 sm:ml-auto"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                        >
                            <GitMerge size={14} /> Merge duplicate account into this profile
                        </button>
                    )}
                </div>
            )}

            {showMergeModal && canMergeAccountsAndAssignOwner && onMergeAccountIntoCurrent && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
                    <div
                        className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[min(90vh,32rem)]"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: colors.border }}>
                            <h3 className="text-base font-bold" style={{ color: colors.textMain }}>
                                Merge into “{lead.company}”
                            </h3>
                            <button
                                type="button"
                                onClick={() => !mergeBusy && setShowMergeModal(false)}
                                className="p-2 rounded-lg hover:bg-white/10"
                                style={{ color: colors.textMuted }}
                                aria-label="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 space-y-3 flex-1 min-h-0 flex flex-col">
                            <p className="text-xs leading-relaxed" style={{ color: colors.textMuted }}>
                                Search and select the duplicate account. Its requests, CRM opportunities, and
                                contracts will be linked to this profile; contacts will be merged without
                                duplicates (missing fields are filled in). The duplicate account row will be
                                removed.
                            </p>
                            <div className="relative">
                                <Search
                                    size={14}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                    style={{ color: colors.textMuted }}
                                />
                                <input
                                    type="text"
                                    value={mergeSearch}
                                    onChange={(e) => setMergeSearch(e.target.value)}
                                    placeholder="Search account name…"
                                    className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                            <div
                                className="flex-1 min-h-0 overflow-y-auto rounded-lg border divide-y"
                                style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                            >
                                {mergeCandidates.length === 0 ? (
                                    <div className="p-4 text-xs italic" style={{ color: colors.textMuted }}>
                                        No accounts match this search.
                                    </div>
                                ) : (
                                    mergeCandidates.map((a: any) => {
                                        const id = String(a.id);
                                        const selected = mergePickId === id;
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => setMergePickId(id)}
                                                className="w-full text-left px-3 py-2.5 text-sm font-semibold transition-colors"
                                                style={{
                                                    backgroundColor: selected ? colors.primary + '22' : 'transparent',
                                                    color: colors.textMain,
                                                }}
                                            >
                                                {a.name || id}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                            <p className="text-[11px] font-semibold" style={{ color: '#dc2626' }}>
                                This cannot be undone. Only merge accounts you are sure are the same client.
                            </p>
                        </div>
                        <div className="p-4 border-t flex gap-2" style={{ borderColor: colors.border }}>
                            <button
                                type="button"
                                disabled={mergeBusy}
                                onClick={() => setShowMergeModal(false)}
                                className="flex-1 py-2.5 rounded-xl border text-sm font-bold"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={mergeBusy || !mergePickId}
                                onClick={runMerge}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                                style={{ backgroundColor: colors.orange || '#ea580c', color: '#fff' }}
                            >
                                {mergeBusy ? 'Merging…' : 'Merge into this profile'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="p-6 rounded-xl border flex flex-col" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Contact Information</h3>
                                {!readOnly && (
                                    <div className="flex items-center gap-2">
                                        {onScanContactCard && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={handlePickContactScanFile}
                                                    className="px-2 py-1 rounded border text-[11px] font-bold flex items-center gap-1.5 hover:bg-white/10 transition-colors disabled:opacity-60"
                                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                                    title="Scan or upload business card"
                                                    disabled={scanBusy}
                                                >
                                                    <Camera size={13} />
                                                    {scanBusy ? 'Scanning...' : 'Scan / Upload'}
                                                </button>
                                                <input
                                                    ref={contactScanInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    capture="environment"
                                                    className="hidden"
                                                    onChange={handleContactScanFileChange}
                                                />
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingContactIdx(null);
                                                setNewContactData({ firstName: '', lastName: '', position: '', email: '', phone: '', city: '', country: '' });
                                                setIsContactModalOpen(true);
                                            }}
                                            className="p-1 rounded hover:bg-white/10 transition-colors"
                                            title="Add Contact Person"
                                            style={{ color: colors.primary }}>
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1">
                                {contactList.map((contact: any, idx: number) => (
                                    <div key={idx} className="border-b last:border-0" style={{ borderColor: colors.border }}>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedContact(expandedContact === idx ? null : idx)}
                                            className="w-full flex items-center justify-between py-3 text-left group hover:bg-white/5 px-2 rounded-lg transition-colors"
                                        >
                                            <div>
                                                <p className="font-bold text-sm" style={{ color: colors.textMain }}>{contact.name}</p>
                                                <p className="text-[10px] uppercase tracking-wider opacity-70" style={{ color: colors.textMuted }}>{contact.position}</p>
                                            </div>
                                            <ChevronDown size={14} className={`transition-transform duration-300 ${expandedContact === idx ? 'rotate-180' : ''}`} style={{ color: colors.textMuted }} />
                                        </button>

                                        {expandedContact === idx && (
                                            <div className="pb-4 px-2 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                                <div className="flex items-center gap-3">
                                                    <Mail size={14} style={{ color: colors.primary }} />
                                                    <div className="flex-1">
                                                        <p className="text-[10px] uppercase font-bold opacity-70 mb-0.5" style={{ color: colors.textMuted }}>Email</p>
                                                        <p className="text-sm font-medium break-all" style={{ color: colors.textMain }}>{contact.email || 'N/A'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Phone size={14} style={{ color: colors.primary }} />
                                                    <div className="flex-1">
                                                        <p className="text-[10px] uppercase font-bold opacity-70 mb-0.5" style={{ color: colors.textMuted }}>Phone</p>
                                                        <p className="text-sm font-medium" style={{ color: colors.textMain }}>{contact.phone || 'N/A'}</p>
                                                    </div>
                                                </div>
                                                {(contact.city || contact.country) && (
                                                    <div className="flex items-center gap-3">
                                                        <MapPin size={14} style={{ color: colors.primary }} />
                                                        <div className="flex-1">
                                                            <p className="text-[10px] uppercase font-bold opacity-70 mb-0.5" style={{ color: colors.textMuted }}>Address</p>
                                                            <p className="text-sm font-medium" style={{ color: colors.textMain }}>{[contact.city, contact.country].filter(Boolean).join(', ')}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {!readOnly && (
                                                    <div className="pt-2 mt-2 flex justify-end items-center gap-2 border-t" style={{ borderColor: colors.border }}>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const names = contact.name.split(' ');
                                                                setNewContactData({
                                                                    firstName: names[0] || '',
                                                                    lastName: names.slice(1).join(' ') || '',
                                                                    position: contact.position || '',
                                                                    email: contact.email || '',
                                                                    phone: contact.phone || '',
                                                                    city: contact.city || '',
                                                                    country: contact.country || ''
                                                                });
                                                                setEditingContactIdx(idx);
                                                                setIsContactModalOpen(true);
                                                            }}
                                                            className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold border hover:bg-white/5 transition-colors"
                                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                                        >
                                                            <Edit size={12} /> Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteConfirm({ isOpen: true, idx, name: contact.name })}
                                                            className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors"
                                                        >
                                                            <Trash2 size={12} /> Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                    <div
                        className="lg:col-span-2 p-6 rounded-xl border flex flex-col min-h-[300px]"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <div className="flex flex-col gap-3 mb-2 shrink-0">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                                    Account performance
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <ChartVsCompareControls
                                    chartTab={accountChartTab}
                                    enabled={accountChartVsEnabled}
                                    onEnabledChange={setAccountChartVsEnabled}
                                    year={accountChartVsYear}
                                    onYearChange={setAccountChartVsYear}
                                    colors={colors}
                                />
                                <div className="flex flex-wrap gap-1 p-1 rounded-lg border shrink-0" style={{ backgroundColor: 'rgba(0,0,0,0.12)', borderColor: colors.border }}>
                                    {ACCOUNT_PROFILE_CHART_TABS.map((tab) => (
                                        <button
                                            key={tab}
                                            type="button"
                                            onClick={() => setAccountChartTab(tab)}
                                            className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all ${
                                                accountChartTab === tab ? 'shadow-md' : 'opacity-55 hover:opacity-95'
                                            }`}
                                            style={{
                                                backgroundColor: accountChartTab === tab ? colors.primary : 'transparent',
                                                color: accountChartTab === tab ? '#000' : colors.textMain,
                                            }}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 w-full min-h-[220px]">
                            <AccountProfilePerformanceChart
                                chartTab={accountChartTab}
                                chartData={accountChartDataDisplay}
                                colors={colors}
                                currency={currency}
                                chartVsEnabled={accountChartVsEnabled}
                                chartVsYear={accountChartVsYear}
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-6">
                        <div className="p-6 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.textMuted }}>Tags</h3>
                            {!isShellPerformanceRange && (
                                <p className="text-[10px] mb-3 opacity-80" style={{ color: colors.textMuted }}>
                                    Pick a color for each tag (saved for everyone). CRM cards use the same colors.
                                </p>
                            )}
                            <div className="flex flex-wrap gap-2 items-center" key={tagColorTick}>
                                {tags.map((tag: string, idx: number) => {
                                    const tc = getTagColor(tag, colors.primary);
                                    return (
                                        <span
                                            key={`${tag}-${idx}`}
                                            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium border"
                                            style={{ backgroundColor: `${tc}22`, color: tc, borderColor: `${tc}40` }}
                                        >
                                            {editingTagIdx === idx ? (
                                                <input
                                                    type="text"
                                                    value={tagRenameDraft}
                                                    onChange={(e) => setTagRenameDraft(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const nt = tagRenameDraft.trim();
                                                            if (nt && nt !== tag && !tags.includes(nt)) {
                                                                const next = [...tags];
                                                                const oldTag = next[idx];
                                                                next[idx] = nt;
                                                                const prevColor = getTagColor(oldTag, colors.primary);
                                                                const map = { ...readTagColors() };
                                                                delete map[oldTag];
                                                                map[nt] = prevColor;
                                                                writeTagColors(map);
                                                                onLeadChange({ ...lead, tags: next });
                                                                appendAuditLog?.('Tag renamed', `${oldTag} → ${nt}`);
                                                            }
                                                            setEditingTagIdx(null);
                                                            setTagRenameDraft('');
                                                        }
                                                    }}
                                                    className="w-24 px-1 py-0.5 rounded text-[10px] bg-black/20 border"
                                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                                    autoFocus
                                                />
                                            ) : (
                                                <span>{tag}</span>
                                            )}
                                            {canManageAccountTags && !readOnly && (
                                                <input
                                                    type="color"
                                                    value={tc.length === 7 ? tc : '#c09a4e'}
                                                    onChange={(e) => {
                                                        setTagColorForName(tag, e.target.value);
                                                        setTagColorTick((t) => t + 1);
                                                    }}
                                                    className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                                                    title="Tag color"
                                                />
                                            )}
                                            {canManageAccountTags && !readOnly && editingTagIdx !== idx && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="p-0.5 rounded hover:bg-white/10"
                                                        style={{ color: colors.textMuted }}
                                                        title="Rename tag"
                                                        onClick={() => {
                                                            setEditingTagIdx(idx);
                                                            setTagRenameDraft(tag);
                                                        }}
                                                    >
                                                        <Edit size={12} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="p-0.5 rounded hover:bg-red-500/20"
                                                        style={{ color: colors.red || '#ef4444' }}
                                                        title="Remove tag"
                                                        onClick={() => {
                                                            const next = tags.filter((_: string, i: number) => i !== idx);
                                                            onLeadChange({ ...lead, tags: next });
                                                            appendAuditLog?.('Tag removed', tag);
                                                        }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </>
                                            )}
                                        </span>
                                    );
                                })}
                                {canManageAccountTags && !readOnly && (showTagField ? (
                                    <span className="inline-flex items-center gap-1">
                                        <input
                                            type="text"
                                            value={tagDraft}
                                            onChange={(e) => setTagDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const t = tagDraft.trim();
                                                    if (t && !tags.includes(t)) {
                                                        onLeadChange({ ...lead, tags: [...tags, t] });
                                                        appendAuditLog?.('Tag added', t);
                                                    }
                                                    setTagDraft('');
                                                    setShowTagField(false);
                                                }
                                            }}
                                            placeholder="Tag"
                                            className="px-2 py-1 rounded text-xs border min-w-[100px]"
                                            style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.textMain }}
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            className="text-[10px] font-bold"
                                            style={{ color: colors.primary }}
                                            onClick={() => {
                                                const t = tagDraft.trim();
                                                if (t && !tags.includes(t)) {
                                                    onLeadChange({ ...lead, tags: [...tags, t] });
                                                    appendAuditLog?.('Tag added', t);
                                                }
                                                setTagDraft('');
                                                setShowTagField(false);
                                            }}
                                        >
                                            Add
                                        </button>
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setShowTagField(true)}
                                        className="px-3 py-1 rounded-full text-xs border hover:bg-white/5"
                                        style={{ borderColor: colors.border, color: colors.textMuted }}
                                    >
                                        + Add Tag
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-6 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3
                                className="text-xs font-bold uppercase tracking-wider mb-1"
                                style={{ color: colors.textMuted }}
                                title="Win rate = Definite or Actual ÷ all linked requests. Cancellation rate = Cancelled or Lost ÷ all linked requests. Spend = sum of paid amounts on linked requests."
                            >
                                Performance
                            </h3>
                            <p className="text-[10px] mb-3 leading-snug" style={{ color: colors.textMuted }}>
                                Range:{' '}
                                <span style={{ color: colors.primary }} className="font-mono">
                                    {performanceDateRange.from} → {performanceDateRange.to}
                                </span>
                                {!isShellPerformanceRange && (
                                    <span className="opacity-70"> — KPIs use the same operational date filter as the chart bar above.</span>
                                )}
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-center gap-2 mb-1">
                                        <span className="text-xs" style={{ color: colors.textMuted }}>Win rate (Definite / Actual)</span>
                                        <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: colors.green }}>{winRate}%</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2 mb-2">
                                        <span className="text-xs" style={{ color: colors.textMuted }}>Cancellation rate</span>
                                        <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: colors.red }}>{cancellationRate}%</span>
                                    </div>
                                    <div className="h-2.5 rounded-full bg-black/25 overflow-hidden flex w-full" title="Green = Definite/Actual, red = Cancelled/Lost, muted = other statuses (e.g. pipeline).">
                                        {winBarPct > 0 && (
                                            <div className="h-full shrink-0" style={{ width: `${winBarPct}%`, backgroundColor: colors.green }} />
                                        )}
                                        {cancelBarPct > 0 && (
                                            <div className="h-full shrink-0" style={{ width: `${cancelBarPct}%`, backgroundColor: colors.red }} />
                                        )}
                                        {otherBarPct > 0 && (
                                            <div className="h-full shrink-0" style={{ width: `${otherBarPct}%`, backgroundColor: `${colors.textMuted}45` }} />
                                        )}
                                    </div>
                                    {!isShellPerformanceRange && (
                                        <p className="text-[10px] mt-1.5 opacity-70 leading-snug" style={{ color: colors.textMuted }}>
                                            Each linked request counts once. Win = Definite or Actual; cancellation = Cancelled or Lost; other = Inquiry, Tentative, Accepted, Draft, etc.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs mb-1" style={{ color: colors.textMuted }}>Total spend (paid)</p>
                                    <p className="text-xl font-bold font-mono" style={{ color: colors.primary }}>
                                        {formatCurrencyAmount(totalSpend, 0)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs mb-1" style={{ color: colors.textMuted }}>Total requests</p>
                                    <p className="text-xl font-bold" style={{ color: colors.textMain }}>{totalRequests}</p>
                                </div>
                                <div>
                                    <p className="text-xs mb-1" style={{ color: colors.textMuted }}>Open pipeline (bookings)</p>
                                    <p className="text-lg font-bold" style={{ color: colors.textMain }}>{metrics.openPipelineCount}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: colors.textMuted }}>Preferred Business</h3>
                            {preferredBusiness.total === 0 ? (
                                <p className="text-sm italic py-6 text-center" style={{ color: colors.textMuted }}>
                                    No requests under this account yet.
                                </p>
                            ) : (
                                <>
                                    <ResponsiveContainer width="100%" height={150}>
                                        <PieChart>
                                            <Pie data={preferredBusiness.data} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value">
                                                {preferredBusiness.data.map((item) => (
                                                    <Cell key={item.name} fill={item.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ backgroundColor: colors.tooltip, borderColor: colors.border, color: colors.textMain }}
                                                labelStyle={{ color: colors.textMain, fontWeight: 700 }}
                                                itemStyle={{ color: colors.textMain }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        {preferredBusiness.data.map((item) => (
                                            <div key={item.name} className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                                                <span className="text-[10px]" style={{ color: colors.textMuted }}>{item.name}</span>
                                                <span className="text-[10px] font-bold ml-auto" style={{ color: colors.textMain }}>{item.pct}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="col-span-2 space-y-6">
                        <div className="p-6 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Active Opportunities</h3>
                                <div className="flex flex-wrap items-center gap-3">
                                    {onViewAccountRequests ? (
                                        <button
                                            type="button"
                                            onClick={onViewAccountRequests}
                                            className="text-xs font-bold hover:opacity-70"
                                            style={{ color: colors.textMain }}
                                        >
                                            View Requests
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                            <div className="space-y-3">
                                {activeOpportunityRequests.length === 0 ? (
                                    <p className="text-sm italic py-6 text-center" style={{ color: colors.textMuted }}>
                                        No requests in Inquiry or Tentative for this account.
                                    </p>
                                ) : (
                                    activeOpportunityRequests.map((req: any) => {
                                        const total = Number(
                                            computeRequestRevenueBreakdownNoTax(req).totalLineNoTax || 0
                                        );
                                        return (
                                            <div key={req.id} className="p-4 rounded-lg border" style={{ borderColor: colors.border }}>
                                                <div className="flex justify-between items-start gap-3">
                                                    <div className="min-w-0">
                                                        <h4 className="font-bold mb-1 truncate" style={{ color: colors.textMain }}>
                                                            {req.requestName || req.id || 'Request'}
                                                        </h4>
                                                        <p className="text-xs" style={{ color: colors.textMuted }}>
                                                            {String(req.requestType || 'Request').trim()} ·{' '}
                                                            {formatRequestStatusLabel(req.status)}
                                                        </p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span
                                                            className="px-2 py-1 rounded text-xs font-medium"
                                                            style={{ backgroundColor: `${colors.orange}20`, color: colors.orange }}
                                                        >
                                                            {formatRequestStatusLabel(req.status)}
                                                        </span>
                                                        <p className="text-sm font-bold font-mono mt-1" style={{ color: colors.primary }}>
                                                            {formatSarCompact(total)}
                                                        </p>
                                                        {onOpenRequest ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => onOpenRequest(String(req.id))}
                                                                className="text-xs font-bold underline mt-1 block ml-auto"
                                                                style={{ color: colors.primary }}
                                                            >
                                                                Open request
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="p-6 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Contracts</h3>
                                {onStartNewContractForAccount && (
                                    <button
                                        type="button"
                                        onClick={onStartNewContractForAccount}
                                        className="text-xs font-bold px-3 py-1.5 rounded border hover:bg-white/5"
                                        style={{ borderColor: colors.border, color: colors.primary }}
                                    >
                                        + New Contract
                                    </button>
                                )}
                            </div>
                            {!accountContracts.length ? (
                                <p className="text-sm italic py-2" style={{ color: colors.textMuted }}>
                                    No contracts linked to this account yet.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {accountContracts.map((c) => (
                                        <div key={c.id} className="p-3 rounded-lg border" style={{ borderColor: colors.border }}>
                                            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                                                <div className="md:col-span-2">
                                                    <p className="text-sm font-bold" style={{ color: colors.textMain }}>
                                                        {c.agreementFileName} · term {c.termNumber}
                                                    </p>
                                                    <p className="text-[10px]" style={{ color: colors.textMuted }}>
                                                        {c.templateName} · {new Date(c.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase opacity-60" style={{ color: colors.textMuted }}>Start</label>
                                                    <input
                                                        type="date"
                                                        value={c.startDate || ''}
                                                        onChange={(e) => onUpdateContractMeta?.(c.id, { startDate: e.target.value })}
                                                        className="w-full p-1.5 rounded border bg-black/20 text-xs"
                                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase opacity-60" style={{ color: colors.textMuted }}>End</label>
                                                    <input
                                                        type="date"
                                                        value={c.endDate || ''}
                                                        onChange={(e) => onUpdateContractMeta?.(c.id, { endDate: e.target.value })}
                                                        className="w-full p-1.5 rounded border bg-black/20 text-xs"
                                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase opacity-60" style={{ color: colors.textMuted }}>Status</label>
                                                    <select
                                                        value={c.status}
                                                        onChange={(e) => onUpdateContractStatus?.(c.id, e.target.value as ContractStatus)}
                                                        className="w-full p-1.5 rounded border bg-black/20 text-xs"
                                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                                    >
                                                        <option>Generated</option>
                                                        <option>Signed</option>
                                                        <option>Expired</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                <button
                                                    type="button"
                                                    onClick={() => onDownloadContractFile?.(c.id, 'word')}
                                                    className="text-[10px] px-2 py-1 rounded border hover:bg-white/5"
                                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                                >
                                                    Word
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onDownloadContractFile?.(c.id, 'pdf')}
                                                    className="text-[10px] px-2 py-1 rounded border hover:bg-white/5"
                                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                                >
                                                    PDF
                                                </button>
                                                <label
                                                    className="text-[10px] px-2 py-1 rounded border hover:bg-white/5 cursor-pointer"
                                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                                >
                                                    Upload Signed
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        onChange={async (e) => {
                                                            const f = e.target.files?.[0];
                                                            if (!f) return;
                                                            await onUploadSignedContract?.(c.id, f);
                                                        }}
                                                    />
                                                </label>
                                                {c.signedFileName && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onDownloadContractFile?.(c.id, 'signed')}
                                                        className="text-[10px] px-2 py-1 rounded border hover:bg-white/5"
                                                        style={{ borderColor: colors.border, color: colors.primary }}
                                                    >
                                                        Signed: {c.signedFileName}
                                                    </button>
                                                )}
                                                {canDeleteContractRecords && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (!window.confirm('Delete this contract record permanently?')) return;
                                                            onDeleteContractRecord?.(c.id);
                                                        }}
                                                        className="text-[10px] px-2 py-1 rounded border text-red-500 hover:bg-red-500/10"
                                                        style={{ borderColor: 'rgba(239,68,68,0.35)' }}
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-6 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: colors.textMuted }}>Activity Timeline</h3>
                            <div className="space-y-4">
                                {timelineItems.length === 0 && (
                                    <p className="text-sm italic py-6 text-center" style={{ color: colors.textMuted }}>
                                        No sales calls, request logs, or manual activities yet.
                                    </p>
                                )}
                                {timelineVisibleItems.map((item) => {
                                    const isManual = item.meta?.source === 'manual';
                                    const actId = item.meta?.activityId;
                                    return (
                                        <div key={item.id} className="flex gap-4">
                                            {timelineIcon(item, colors)}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-1 gap-2">
                                                    <h4 className="font-bold text-sm" style={{ color: colors.textMain }}>{item.title}</h4>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {!readOnly && canManageManualTimeline && isManual && actId && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="text-[10px] font-bold px-2 py-0.5 rounded border hover:bg-white/5"
                                                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                                                    onClick={() => {
                                                                        const act = (lead.activities || []).find(
                                                                            (a: any) => String(a.id) === String(actId)
                                                                        );
                                                                        if (!act) return;
                                                                        setEditingActivityId(String(act.id));
                                                                        setActivityForm({
                                                                            title: act.title || '',
                                                                            body: act.body || ''
                                                                        });
                                                                        setShowActivityModal(true);
                                                                    }}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="text-[10px] font-bold px-2 py-0.5 rounded border text-red-500 hover:bg-red-500/10"
                                                                    style={{ borderColor: 'rgba(239,68,68,0.35)' }}
                                                                    onClick={() => {
                                                                        if (!window.confirm('Remove this activity from the timeline?')) return;
                                                                        const next = (lead.activities || []).filter(
                                                                            (a: any) => String(a.id) !== String(actId)
                                                                        );
                                                                        onLeadChange({ ...lead, activities: next });
                                                                        appendAuditLog?.('Activity removed', item.title || '');
                                                                    }}
                                                                >
                                                                    Delete
                                                                </button>
                                                            </>
                                                        )}
                                                        <span className="text-xs" style={{ color: colors.textMuted }}>{item.whenLabel}</span>
                                                    </div>
                                                </div>
                                                <p className="text-sm mb-1 whitespace-pre-wrap" style={{ color: colors.textMuted }}>{item.body || '—'}</p>
                                                <p className="text-xs" style={{ color: colors.textMuted }}>by {item.by}</p>
                                                {item.meta?.requestId && onOpenRequest && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenRequest(String(item.meta!.requestId))}
                                                        className="text-[10px] font-bold mt-1 underline"
                                                        style={{ color: colors.primary }}
                                                    >
                                                        View request
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {timelineItems.length > TIMELINE_PAGE && (
                                    <div className="pt-2 flex justify-center">
                                        {!timelineShowAll ? (
                                            <button
                                                type="button"
                                                onClick={() => setTimelineShowAll(true)}
                                                className="text-[10px] font-black uppercase tracking-wide px-4 py-2 rounded-lg border hover:bg-white/5 transition-colors"
                                                style={{ borderColor: colors.border, color: colors.primary }}
                                            >
                                                View more ({timelineItems.length - TIMELINE_PAGE} more)
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setTimelineShowAll(false)}
                                                className="text-[10px] font-bold uppercase tracking-wide px-4 py-2 rounded-lg border hover:bg-white/5 transition-colors"
                                                style={{ borderColor: colors.border, color: colors.textMuted }}
                                            >
                                                Show less
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>

            {isContactModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 border"
                        style={{ backgroundColor: colors.card, borderColor: colors.primary + '40' }}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold" style={{ color: colors.textMain }}>{editingContactIdx !== null ? 'Edit Contact Person' : 'Add Contact Person'}</h3>
                            <button type="button" onClick={() => setIsContactModalOpen(false)} style={{ color: colors.textMuted }} className="hover:text-white transition-colors"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>First Name</label>
                                    <input type="text"
                                        value={newContactData.firstName}
                                        onChange={e => setNewContactData({ ...newContactData, firstName: e.target.value })}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="First Name"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Last Name</label>
                                    <input type="text"
                                        value={newContactData.lastName}
                                        onChange={e => setNewContactData({ ...newContactData, lastName: e.target.value })}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="Last Name"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Position</label>
                                <input type="text"
                                    value={newContactData.position}
                                    onChange={e => setNewContactData({ ...newContactData, position: e.target.value })}
                                    className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                    placeholder="Job Title"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Email</label>
                                <input type="email"
                                    value={newContactData.email}
                                    onChange={e => setNewContactData({ ...newContactData, email: e.target.value })}
                                    className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                    placeholder="email@example.com"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Phone</label>
                                <input type="text"
                                    value={newContactData.phone}
                                    onChange={e => setNewContactData({ ...newContactData, phone: e.target.value })}
                                    className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                    placeholder="966 ..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>City</label>
                                    <input type="text"
                                        value={newContactData.city}
                                        onChange={e => setNewContactData({ ...newContactData, city: e.target.value })}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="City"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Country</label>
                                    <input type="text"
                                        value={newContactData.country}
                                        onChange={e => setNewContactData({ ...newContactData, country: e.target.value })}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="Country"
                                    />
                                </div>
                            </div>
                            <div className="pt-4">
                                <button
                                    type="button"
                                    onClick={handleSaveContact}
                                    className="w-full py-3 rounded-lg font-bold text-black hover:opacity-90 transition-opacity"
                                    style={{ backgroundColor: colors.primary }}
                                >
                                    {editingContactIdx !== null ? 'Save Changes' : 'Save Contact'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showHistoryModal && (
                <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg max-h-[80vh] flex flex-col p-6 rounded-2xl shadow-2xl border"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: colors.textMain }}>
                                <History size={20} /> Profile history
                            </h3>
                            <button type="button" onClick={() => setShowHistoryModal(false)} className="p-1" style={{ color: colors.textMuted }}><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-3 text-left text-sm pr-1">
                            {auditLog.length === 0 ? (
                                <p className="italic text-center py-8" style={{ color: colors.textMuted }}>No logged actions yet.</p>
                            ) : (
                                [...auditLog].reverse().map((entry: any) => (
                                    <div key={entry.id} className="p-3 rounded-lg border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                        <div className="flex justify-between gap-2 mb-1">
                                            <span className="font-bold text-xs" style={{ color: colors.primary }}>{entry.action}</span>
                                            <span className="text-[10px] opacity-70" style={{ color: colors.textMuted }}>
                                                {entry.at ? new Date(entry.at).toLocaleString() : ''}
                                            </span>
                                        </div>
                                        <p className="text-xs" style={{ color: colors.textMain }}>{entry.details}</p>
                                        <p className="text-[10px] mt-1 opacity-60" style={{ color: colors.textMuted }}>by {entry.userName || '—'}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            <AccountRatesModal
                open={showRatesModal}
                onClose={() => setShowRatesModal(false)}
                theme={theme}
                accountId={destAccountId}
                accountName={String(lead.company || lead.name || '')}
                propertyId={String(lead.propertyId || activeProperty?.id || '').trim()}
                activeProperty={activeProperty}
                segmentOptions={segmentOptions}
                readOnly={readOnly}
            />

            {showActivityModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md p-6 rounded-2xl shadow-2xl border animate-in zoom-in-95 duration-200"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold" style={{ color: colors.textMain }}>{editingActivityId ? 'Edit activity' : 'New activity'}</h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowActivityModal(false);
                                    setEditingActivityId(null);
                                    setActivityForm({ title: '', body: '' });
                                }}
                                className="p-1"
                                style={{ color: colors.textMuted }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>Title</label>
                                <input
                                    type="text"
                                    value={activityForm.title}
                                    onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>Details</label>
                                <textarea
                                    rows={3}
                                    value={activityForm.body}
                                    onChange={(e) => setActivityForm({ ...activityForm, body: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    const title = activityForm.title.trim();
                                    if (!title) return;
                                    if (editingActivityId) {
                                        const next = (lead.activities || []).map((a: any) =>
                                            String(a.id) === editingActivityId
                                                ? {
                                                      ...a,
                                                      title,
                                                      body: activityForm.body.trim()
                                                  }
                                                : a
                                        );
                                        onLeadChange({ ...lead, activities: next });
                                        appendAuditLog?.('Activity updated', title);
                                    } else {
                                        const row = {
                                            id: `act-${Date.now()}`,
                                            at: new Date().toISOString(),
                                            title,
                                            body: activityForm.body.trim(),
                                            user: currentUser?.name || currentUser?.email || 'Staff'
                                        };
                                        onLeadChange({
                                            ...lead,
                                            activities: [...(lead.activities || []), row]
                                        });
                                        appendAuditLog?.('Activity added', title);
                                    }
                                    setShowActivityModal(false);
                                    setEditingActivityId(null);
                                    setActivityForm({ title: '', body: '' });
                                }}
                                className="w-full py-3 rounded-lg font-bold text-black"
                                style={{ backgroundColor: colors.primary }}
                            >
                                {editingActivityId ? 'Save changes' : 'Save activity'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteConfirm.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 border"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4" style={{ color: colors.red }}>
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-lg font-bold mb-2" style={{ color: colors.textMain }}>Delete Contact</h3>
                            <p className="text-sm" style={{ color: colors.textMuted }}>Are you sure you want to delete <span className="font-bold text-white">{deleteConfirm.name}</span>? This action cannot be undone.</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm({ isOpen: false, idx: null, name: '' })}
                                className="flex-1 py-2.5 rounded-lg font-bold border hover:bg-white/5 transition-colors"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteContact}
                                className="flex-1 py-2.5 rounded-lg font-bold bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
