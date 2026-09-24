import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { apiUrl } from './backendApi';
import {
    LayoutList, Search, Plus, Calendar, User, FileText, Check, DollarSign,
    Box, Users, Clock, Coffee, Utensils, Music, Bus, Car, BedDouble,
    Trash2, Save, ChevronDown, ChevronRight, Calculator, Filter,
    MoreHorizontal, Moon, Bed, Tag, X, Settings, CreditCard, RefreshCw, Printer, Download,
    Bell, AlertTriangle, Star, Copy, RotateCcw, MessageSquare
} from 'lucide-react';
import AddAccountModal from './AddAccountModal';
import ConfirmDialog from './ConfirmDialog';
import { contactDisplayName } from './accountLeadMapping';
import {
    resolveSegmentsForProperty,
    resolveAccountTypesForProperty,
} from './propertyTaxonomy';
import {
    resolveMealPlansForProperty,
    resolveEventPackagesForProperty,
    MEALS_PACKAGES_CHANGED_EVENT,
    getAgendaTimingSlotsForPackageName,
    defaultEventPackageName,
    normalizeAgendaRowTimes,
    DEFAULT_EVENT_PACKAGES,
} from './propertyMealsPackages';
import {
    resolveOccupancyTypesForProperty,
    OCCUPANCY_TYPES_CHANGED_EVENT,
} from './propertyOccupancyTypes';
import {
    resolvePaymentMethodsForProperty,
    defaultPaymentMethodForProperty,
    PAYMENT_METHODS_CHANGED_EVENT,
} from './propertyPaymentMethods';
import { canDeleteRequestPayments as userCanDeleteRequestPayments, canUseRequestAlerts } from './userPermissions';
import RequestAlertsModal from './RequestAlertsModal';
import { normalizeRequestAlerts, requestHasAlerts, type RequestAlert } from './requestAlerts';
import {
    sumPaymentAmounts,
    calculateNights,
    normalizeRequestTypeKey,
    calculateEventAgendaDays,
    inclusiveCalendarDays,
    getEventDateWindow,
    formatAgendaPackageSummary,
    formatAgendaRowCoffeeBreak,
    formatAgendaRowLunch,
    formatAgendaRowDinner,
    formatAgendaRowSessionNotes,
    formatBeoSpecialRequestsCombined,
    getAccountForRequest,
    printBeoDocument,
    calculateAccFinancialsForRequest,
    addCalendarDaysIso,
    getBeoScopeGrandTotalInclTax,
    deriveBeoPaymentView,
    findFirstAgendaVenueConflict,
    formatAgendaRowVenueDisplay,
    deriveRequestMealLabelFromRooms,
    paymentsMeetOrExceedTotal,
    shouldPromoteDefiniteToActual,
    requestSectionAddButtonStyle,
    REQUEST_SECTION_ADD_BTN_CLASS,
    REQUEST_SECTION_ADD_BTN_LG_CLASS,
    REQUEST_SECTION_ICON_ADD_BTN_CLASS,
} from './beoShared';
import { resolveUserAttributionId, createdByMatchesUser, requestInProperty, recordVisibleOnProperty } from './userProfileMetrics';
import { usePropertyLoadGate } from './propertyScopedLoad';
import { requestMatchesSearchDateRanges } from './operationalSegmentRevenue';
import { refreshRequestsWithDefiniteToActual } from './requestStatusAutomation';
import { requestMatchesAccount } from './accountProfileData';
import { convertSarToCurrency, type CurrencyCode } from './currency';
import { useCurrencyFormatters } from './useCurrencyFormatters';
import { contrastOn } from './dashboardHub/analyticsKit';
import { deleteFileLocal, mediaUrl, uploadFileLocal } from './localUpload';
import { collectRequestFormViolations } from './formConfigurations';
import {
    computeBalance,
    applicableFromBalance,
    isClPaymentMethod,
    type LedgerEntry,
    type LedgerType,
} from './accountBalance';
import { reverseBalancePaymentOnRequest, type SyncPayment, type SyncRequest } from './accountPaymentSync';
import {
    clearNewRequestDraft,
    readNewRequestDraft,
    writeNewRequestDraft,
} from './requestDraftStorage';
import {
    includesEventAgendaSection,
    logRequestDetailEventAgendaRender,
} from './requestDetailLayout';
import {
    buildInitialFeedbackAnswers,
    getFeedbackTemplateForRequestType,
    resolveFeedbackTemplatesForProperty,
    withPropertyName,
    type FeedbackAnswerValue,
    type FeedbackQuestion,
} from './requestFeedbackConfig';
import { lookupAccountRoomRate, type AccountRatePeriod } from './accountRates';
import { calculateEvtFinancials as calculateEvtFinancialsPure } from './requestFinancials';

const REQUEST_SEARCH_STATUS_OPTIONS = [
    'Inquiry',
    'Accepted',
    'Tentative',
    'Definite',
    'Actual',
    'Cancelled',
] as const;

function normalizeSearchStatusKey(status: unknown): string {
    const raw = String(status ?? '').trim().toLowerCase();
    if (raw === 'draft') return 'inquiry';
    return raw;
}

/** Empty selection = all statuses. Supports legacy `status: 'all' | 'Inquiry'`. */
function parseSearchStatusSelection(params: any): string[] {
    if (Array.isArray(params?.statuses)) {
        return params.statuses.map((s: unknown) => String(s).trim()).filter(Boolean);
    }
    const legacy = String(params?.status ?? '').trim();
    if (!legacy || legacy.toLowerCase() === 'all') return [];
    return [legacy];
}

function matchesSearchStatusFilter(req: any, selectedStatuses: string[]): boolean {
    if (!selectedStatuses.length) return true;
    const reqKey = normalizeSearchStatusKey(req?.status);
    return selectedStatuses.some((s) => normalizeSearchStatusKey(s) === reqKey);
}

function isBalanceOrClPaymentMethod(method: unknown): boolean {
    const m = String(method || '').trim().toLowerCase();
    return m === 'balance' || isClPaymentMethod(method);
}

function filterRequestsByAdvancedSearch(
    reqList: any[],
    params: any,
    assignableUsersForProperty: { id?: string }[] = []
) {
    return reqList.filter((req: any) => {
        const typeFilter = String(params?.type || 'all').toLowerCase();
        const requestType = String(req.requestType || '').toLowerCase();
        const typeMatch = typeFilter === 'all'
            || (typeFilter === 'event_rooms' ? requestType === 'event with rooms' : typeFilter === 'series group' ? requestType === 'series' || requestType === 'series group' : requestType === typeFilter);

        const statusMatch = matchesSearchStatusFilter(req, parseSearchStatusSelection(params));

        const accountFilter = String(params?.account || '').toLowerCase().trim();
        const accountMatch = !accountFilter || String(req.account || req.accountName || '').toLowerCase().includes(accountFilter);

        const requestNameFilter = String(params?.requestName || '').toLowerCase().trim();
        const requestNameMatch = !requestNameFilter || String(req.requestName || '').toLowerCase().includes(requestNameFilter);

        const confFilter = String(params?.confNumber || '').toLowerCase().trim();
        const confMatch = !confFilter || String(req.confirmationNo || '').toLowerCase().includes(confFilter);

        const dateMatch = requestMatchesSearchDateRanges(
            req,
            String(params?.arrival || '').trim(),
            String(params?.arrivalTo || '').trim(),
            String(params?.departure || '').trim(),
            String(params?.departureTo || '').trim()
        );

        const createdByFilter = String(params?.createdByUserId || '').trim();
        let createdByMatch = true;
        if (createdByFilter) {
            const creatorRow = assignableUsersForProperty.find((u) => String(u.id) === createdByFilter);
            if (creatorRow) {
                createdByMatch = createdByMatchesUser(req?.createdByUserId, creatorRow);
            } else {
                createdByMatch = String(req?.createdByUserId || '').trim() === createdByFilter;
            }
        }

        const segmentFilter = String(params?.segment || '').toLowerCase().trim();
        const segmentMatch = !segmentFilter || String(req?.segment || '').toLowerCase() === segmentFilter;

        return typeMatch && statusMatch && accountMatch && requestNameMatch && confMatch && dateMatch && createdByMatch && segmentMatch;
    });
}

interface RequestsManagerProps {
    theme: any;
    subView: string;
    searchParams: any;
    setSearchParams: (val: any) => void;
    initialRequestType?: string | null;
    /** Pre-select account when opening new request (e.g. from CRM Log Call). */
    initialAccountId?: string | null;
    /** Pre-select booker/contact from the logged sales call. */
    initialContactFromCall?: { name: string; contactId: string } | null;
    onConsumedInitialContactFromCall?: () => void;
    onConsumedInitialAccountId?: () => void;
    /** Fired after a request is saved (new or update). */
    onRequestSaved?: (request: any) => void;
    /** Fired after a request is deleted. */
    onRequestDeleted?: (requestId: string) => void;
    /** Fired when leaving the new-request wizard (save or navigate away). */
    onRequestWizardFinished?: () => void;
    activeProperty?: any;
    accounts: any[];
    setAccounts: React.Dispatch<React.SetStateAction<any[]>>;
    pendingOpenRequestId?: string | null;
    onConsumedPendingOpenRequest?: () => void;
    /** Open the same OPTS modal as the list row (used from Events kanban, etc.). */
    pendingOpenOptsRequestId?: string | null;
    onConsumedPendingOpenOpts?: () => void;
    onAfterRequestsMutate?: () => void;
    /** Parent-held requests (AS sharedRequests) — merged after fetch so saves are not lost on remount. */
    sharedRequestsSeed?: any[];
    /** Bumped by the parent on every live request WebSocket event; triggers a debounced refetch. */
    liveUpdateSignal?: number;
    /** When true, only the new-request wizard is shown (for modal overlay from Events page). */
    embedded?: boolean;
    onEmbeddedComplete?: () => void;
    onEmbeddedCancel?: () => void;
    /** Render only request OPTS / related modals (fixed overlay); no list UI. Used from Events & Catering. */
    optsHeadless?: boolean;
    /** Render request detail view in a fixed overlay (CRM pipeline "View request", etc.). */
    detailHeadless?: boolean;
    /** Pre-loaded request row so the detail overlay opens immediately (CRM sharedRequests). */
    headlessInitialRequest?: any | null;
    /** Fired when the user closes the detail overlay (back button or backdrop). */
    onDetailHeadlessDismiss?: () => void;
    /** Fired when the user closes the small Options popover (backdrop or X), not when opening sub-modals. */
    onOptsHeadlessDismiss?: () => void;
    /** From headless OPTS: navigate main app to Requests edit wizard for this request id. */
    onHeadlessModifyDetails?: (requestId: string) => void;
    /** From headless OPTS: open new-request wizard pre-filled from an existing request (duplicate). */
    onHeadlessDuplicateRequest?: (requestId: string) => void;
    /** Request segment choices for the active property (Settings). */
    segmentOptions?: string[];
    accountTypeOptions?: string[];
    /** Head of Sales + Admin: full logical delete from options menu. */
    canDeleteRequest?: boolean;
    /** General Manager style: hide modify/cancel/delete in request options. */
    readOnlyOperational?: boolean;
    currentUser?: any;
    /** Admin / Head of Sales (+ grants): remove payment lines from a request. */
    canDeleteRequestPayments?: boolean;
    currency?: CurrencyCode;
    /** Property staff (Settings assignments); used for "Created by" search filter. */
    assignableUsersForProperty?: { id: string; name: string }[];
    promotionOptions?: any[];
    canLinkRequestPromotions?: boolean;
    /** When set, All Requests list shows only rows linked to this account. */
    scopedAccountFilter?: { accountId?: string; accountName?: string };
}

const GRID_WEEKDAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

/** WCAG relative luminance for `#RRGGBB` — pick rooms-grid row palette from app background. */
function screenLuminanceFromHex(hex: string): number {
    const raw = String(hex || '').trim();
    const m = raw.match(/^#?([0-9a-f]{6})$/i);
    if (!m) return 0.5;
    const v = parseInt(m[1], 16);
    const r = ((v >> 16) & 255) / 255;
    const g = ((v >> 8) & 255) / 255;
    const b = (v & 255) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const REQUEST_FORM_STATUS_OPTIONS = ['Inquiry', 'Accepted', 'Tentative', 'Definite', 'Actual', 'Cancelled'] as const;

function generateRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `REQ-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    }
    return `REQ-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

const DEFAULT_CXL_REASONS = ['Price too high', 'Changed dates', 'Destination change', 'Budget issues', 'Group cancelled', 'Competitor offer', 'Other'];
const cxlStorageKey = (propertyId: string) => `visatour_cxl_reasons::${String(propertyId || '').trim()}`;
const REQUEST_DOC_IDS = ['inv1', 'inv2', 'inv3', 'agreement'] as const;
type RequestDocId = (typeof REQUEST_DOC_IDS)[number];

/** Pipeline statuses we auto-promote to Definite when fully paid. */
function canAutoDefiniteFromStatus(status: string): boolean {
    const s = String(status || '').trim();
    return s !== 'Definite' && s !== 'Actual' && s !== 'Cancelled';
}

const LOG_ACTUAL_FROM_DEFINITE =
    'Definite, fully paid, and today matches check-in or first event day — set to Actual.';

// Initial Form States
const initialAccommodation = {
    id: '',
    requestName: '',
    accountName: '',
    accountId: '',
    bookerName: '',
    bookerContactId: '',
    receivedDate: new Date().toISOString().split('T')[0],
    confirmationNo: '',
    checkIn: '',
    checkOut: '',
    nights: 0,
    offerDeadline: '',
    depositDeadline: '',
    paymentDeadline: '',
    mealPlan: 'RO',
    rooms: [{ id: Date.now(), type: '', occupancy: 'Single', count: 1, rate: 0, mealPlan: 'RO' }],
    transportation: [] as any[],
    agenda: [] as any[],
    invoices: {
        inv1: null,
        inv2: null,
        inv3: null,
        agreement: null
    },
    note: '',
    status: 'Inquiry',
    payments: [] as any[],
    logs: [] as any[],
    segment: '',
    promotionId: '',
    /** Set when payment source is Collect Later (CL). */
    collectLater: false as boolean,
    paymentStatus: '' as string,
};

/** Remove all-zero placeholder room rows (keeps series/event+rooms rows that have stay dates). */
function sanitizeRequestRoomsForSave(rooms: unknown): any[] {
    const raw = Array.isArray(rooms) ? rooms : [];
    const cleaned = raw.filter((r: any) => {
        const c = Number(r?.count ?? 0);
        const rt = Number(r?.rate ?? 0);
        if (c > 0 || rt > 0) return true;
        if (String(r?.arrival || '').trim() || String(r?.departure || '').trim()) return true;
        return false;
    });
    return cleaned;
}

const initialEvent = {
    requestName: '', leadId: '', accountId: '', confirmationNo: 'EVT-' + Math.floor(Math.random() * 10000), requestDate: new Date().toISOString().split('T')[0],
    bookerName: '', bookerContactId: '',
    status: 'Inquiry', offerDate: '', depositDate: '', paymentDate: '',
    agenda: [{
        id: 1,
        startDate: '', endDate: '', venue: '', shape: 'Theater',
        startTime: '', endTime: '',
        coffee1: '', coffee2: '', lunchTime: '', dinnerTime: '',
        rate: 0, pax: 0, rental: 0,
        package: DEFAULT_EVENT_PACKAGES[0].name,
        notes: '',
    }],
    payments: [] as any[],
    logs: [] as any[],
    segment: '',
    promotionId: ''
};

export default function RequestsManager({
    theme,
    subView,
    searchParams,
    setSearchParams,
    initialRequestType,
    initialAccountId,
    initialContactFromCall,
    onConsumedInitialContactFromCall,
    onConsumedInitialAccountId,
    onRequestSaved,
    onRequestDeleted,
    onRequestWizardFinished,
    activeProperty,
    accounts,
    setAccounts,
    pendingOpenRequestId,
    onConsumedPendingOpenRequest,
    pendingOpenOptsRequestId,
    onConsumedPendingOpenOpts,
    onAfterRequestsMutate,
    sharedRequestsSeed = [],
    liveUpdateSignal = 0,
    embedded = false,
    onEmbeddedComplete,
    onEmbeddedCancel,
    optsHeadless = false,
    detailHeadless = false,
    headlessInitialRequest = null,
    onDetailHeadlessDismiss,
    onOptsHeadlessDismiss,
    onHeadlessModifyDetails,
    onHeadlessDuplicateRequest,
    segmentOptions,
    accountTypeOptions,
    canDeleteRequest = false,
    readOnlyOperational = false,
    currentUser,
    canDeleteRequestPayments: canDeletePaymentsProp,
    currency = 'SAR',
    assignableUsersForProperty = [],
    promotionOptions = [],
    canLinkRequestPromotions = false,
    scopedAccountFilter,
}: RequestsManagerProps) {
    const colors = theme.colors;
    /** Saturated status row fills only when the shell is a dark theme (luxury / colorful). */
    const gridRoomsThemeDark = useMemo(
        () => screenLuminanceFromHex(String(colors.bg || '#ffffff')) < 0.34,
        [colors.bg]
    );
    const gridRoomsRowText = gridRoomsThemeDark ? '#f8fafc' : colors.textMain;
    const { selectedCurrency, formatCurrencyAmount: formatMoney } = useCurrencyFormatters(currency);
    const requestLogUser =
        currentUser?.name || currentUser?.username || currentUser?.email || 'User';
    const canDeletePayments =
        (canDeletePaymentsProp ?? userCanDeleteRequestPayments(currentUser)) && !readOnlyOperational;
    const canManageRequestAlerts = canUseRequestAlerts(currentUser) && !readOnlyOperational;

    const effectiveSegmentOptions = useMemo(() => {
        if (Array.isArray(segmentOptions)) return segmentOptions;
        return resolveSegmentsForProperty(activeProperty?.id || '', activeProperty);
    }, [segmentOptions, activeProperty]);
    const effectiveAccountTypeOptions = useMemo(() => {
        if (Array.isArray(accountTypeOptions)) return accountTypeOptions;
        return resolveAccountTypesForProperty(activeProperty?.id || '', activeProperty);
    }, [accountTypeOptions, activeProperty]);
    const effectivePromotionOptions = useMemo(
        () => (Array.isArray(promotionOptions) ? promotionOptions : []).filter((p: any) => String(p?.propertyId || '') === String(activeProperty?.id || '')),
        [promotionOptions, activeProperty?.id]
    );
    const reqWindowForPromotion = useCallback((formData: any, typeKeyRaw: string) => {
        const typeKey = normalizeRequestTypeKey(typeKeyRaw);
        if (typeKey === 'event') {
            const ev = getEventDateWindow(formData);
            const start = String(ev.start || formData.requestDate || '').slice(0, 10);
            const end = String(ev.end || ev.start || start).slice(0, 10);
            return { start, end };
        }
        const start = String(formData.checkIn || '').slice(0, 10);
        const end = String(formData.checkOut || start).slice(0, 10);
        return { start, end };
    }, []);
    const overlapsPromoWindow = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
        !!aStart && !!aEnd && !!bStart && !!bEnd && !(aEnd < bStart || bEnd < aStart);
    const matchingPromotionsForDraft = useCallback((formData: any, typeKeyRaw: string) => {
        const segmentKey = String(formData?.segment || '').trim().toLowerCase();
        const accountId = String(formData?.accountId || '').trim();
        const w = reqWindowForPromotion(formData, typeKeyRaw);
        return effectivePromotionOptions.filter((promo: any) => {
            if (!segmentKey || !accountId) return false;
            const segmentOk = (promo?.segments || []).some((s: string) => String(s || '').trim().toLowerCase() === segmentKey);
            if (!segmentOk) return false;
            const accountOk = (promo?.linkedAccounts || []).some((a: any) => String(a?.accountId || '').trim() === accountId);
            if (!accountOk) return false;
            const pStart = String(promo?.startDate || '').slice(0, 10);
            const pEnd = String(promo?.endDate || '').slice(0, 10);
            return overlapsPromoWindow(w.start, w.end, pStart, pEnd);
        });
    }, [effectivePromotionOptions, reqWindowForPromotion]);
    const autoPromotionForDraft = useCallback((formData: any, typeKeyRaw: string) => {
        const matches = matchingPromotionsForDraft(formData, typeKeyRaw);
        if (!matches.length) return '';
        const ordered = [...matches].sort((a: any, b: any) => String(a?.startDate || '').localeCompare(String(b?.startDate || '')));
        return String(ordered[0]?.id || '');
    }, [matchingPromotionsForDraft]);

    const [mealsPackagesRev, setMealsPackagesRev] = useState(0);
    useEffect(() => {
        const onMeals = () => setMealsPackagesRev((n) => n + 1);
        window.addEventListener(MEALS_PACKAGES_CHANGED_EVENT, onMeals);
        return () => window.removeEventListener(MEALS_PACKAGES_CHANGED_EVENT, onMeals);
    }, []);

    const [occupancyTypesRev, setOccupancyTypesRev] = useState(0);
    useEffect(() => {
        const onOcc = () => setOccupancyTypesRev((n) => n + 1);
        window.addEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, onOcc);
        return () => window.removeEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, onOcc);
    }, []);

    const occupancySelectOptions = useMemo(() => {
        void occupancyTypesRev;
        return resolveOccupancyTypesForProperty(String(activeProperty?.id || ''), activeProperty);
    }, [activeProperty, occupancyTypesRev]);

    const primaryOccupancyDefault = occupancySelectOptions[0] || 'Single';

    const [paymentMethodsRev, setPaymentMethodsRev] = useState(0);
    useEffect(() => {
        const onPay = () => setPaymentMethodsRev((n) => n + 1);
        window.addEventListener(PAYMENT_METHODS_CHANGED_EVENT, onPay);
        return () => window.removeEventListener(PAYMENT_METHODS_CHANGED_EVENT, onPay);
    }, []);

    const paymentMethodOptions = useMemo(() => {
        void paymentMethodsRev;
        return resolvePaymentMethodsForProperty(String(activeProperty?.id || ''), activeProperty);
    }, [activeProperty, paymentMethodsRev]);

    const emptyNewPayment = useCallback(
        () => ({
            method: defaultPaymentMethodForProperty(String(activeProperty?.id || ''), activeProperty),
            note: '',
            amount: 0,
            date: new Date().toISOString().split('T')[0],
        }),
        [activeProperty]
    );

    const mealPlansForProperty = useMemo(() => {
        void mealsPackagesRev;
        return resolveMealPlansForProperty(activeProperty?.id || '', activeProperty);
    }, [activeProperty, mealsPackagesRev]);

    const eventPackagesForProperty = useMemo(() => {
        void mealsPackagesRev;
        return resolveEventPackagesForProperty(activeProperty?.id || '', activeProperty);
    }, [activeProperty, mealsPackagesRev]);

    const accountsSameProperty = useMemo(() => {
        const pid = String(activeProperty?.id || '').trim();
        if (!pid) return [];
        return accounts.filter((a: any) => recordVisibleOnProperty(pid, a?.propertyId));
    }, [accounts, activeProperty?.id]);

    const [requests, setRequests] = useState<any[]>([]);
    // Ids deleted in this session. Excluded from the sharedRequestsSeed merge in
    // fetchRequests so a just-deleted request is never resurrected from the
    // parent's (possibly stale) seed before the parent state catches up.
    const deletedRequestIdsRef = useRef<Set<string>>(new Set());
    // Tracks prior sharedRequestsSeed ids so we can drop rows removed by delete events.
    const prevSeedIdsRef = useRef<Set<string>>(new Set());
    const requestsLoad = usePropertyLoadGate();
    const taxesLoad = usePropertyLoadGate();
    const [taxesList, setTaxesList] = useState<any[]>([]);
    const [propertyVenues, setPropertyVenues] = useState<any[]>([]);
    const [propertyRoomNames, setPropertyRoomNames] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // View State
    const [viewMode, setViewMode] = useState<'search' | 'list' | 'kanban'>('list');

    const draftPropertyId = String(activeProperty?.id || '').trim() || 'P-GLOBAL';
    const restoredNewRequestDraft =
        subView === 'new_request' &&
        !initialRequestType &&
        !searchParams?.editRequestId &&
        !searchParams?.duplicateFromRequestId
            ? readNewRequestDraft(draftPropertyId)
            : null;

    // Form Wizard State
    const [step, setStep] = useState(() => {
        if (initialRequestType) return 2;
        if (restoredNewRequestDraft?.requestType) {
            return Math.max(2, Number(restoredNewRequestDraft.step) || 2);
        }
        return 1;
    });
    const [requestType, setRequestType] = useState<string | null>(
        () => initialRequestType || restoredNewRequestDraft?.requestType || null
    );

    // React to prop changes
    useEffect(() => {
        if (initialRequestType) {
            setRequestType(initialRequestType);
            setStep(2);
        }
    }, [initialRequestType]);

    // Form Data States
    const [accForm, setAccForm] = useState(() =>
        restoredNewRequestDraft?.accForm
            ? { ...initialAccommodation, ...restoredNewRequestDraft.accForm }
            : initialAccommodation
    );
    const [evtForm, setEvtForm] = useState(() =>
        restoredNewRequestDraft?.evtForm
            ? { ...initialEvent, ...restoredNewRequestDraft.evtForm }
            : initialEvent
    );

    useEffect(() => {
        if (!canLinkRequestPromotions) return;
        const next = autoPromotionForDraft(accForm, requestType || 'accommodation');
        if (String(accForm?.promotionId || '') === next) return;
        setAccForm((prev: any) => ({ ...prev, promotionId: next }));
    }, [canLinkRequestPromotions, accForm.segment, accForm.accountId, accForm.checkIn, accForm.checkOut, requestType, autoPromotionForDraft]);

    useEffect(() => {
        if (!canLinkRequestPromotions) return;
        const next = autoPromotionForDraft(evtForm, 'event');
        if (String(evtForm?.promotionId || '') === next) return;
        setEvtForm((prev: any) => ({ ...prev, promotionId: next }));
        // Event window comes from agenda (+ requestDate fallback), not eventStart/eventEnd.
    }, [canLinkRequestPromotions, evtForm.segment, evtForm.accountId, evtForm.requestDate, evtForm.agenda, autoPromotionForDraft]);

    const primaryPropertyRoomType = useMemo(() => propertyRoomNames[0] || '', [propertyRoomNames]);

    /** Property-configured names plus any types already on rows (valid `<select>` values while lists load). */
    const roomTypeSelectOptions = useMemo(() => {
        const fromProp = propertyRoomNames.filter(Boolean);
        const seen = new Set(fromProp.map((s) => s.toLowerCase()));
        const out = [...fromProp];
        (accForm.rooms || []).forEach((r: any) => {
            const t = String(r?.type || '').trim();
            if (t && !seen.has(t.toLowerCase())) {
                seen.add(t.toLowerCase());
                out.push(t);
            }
        });
        return out;
    }, [propertyRoomNames, accForm.rooms]);

    /** If this property has no "Standard" room type, remap placeholder Standard rows to the first configured type. */
    useEffect(() => {
        if (!propertyRoomNames.length) return;
        const hasStandard = propertyRoomNames.some((n) => String(n).toLowerCase() === 'standard');
        const first = propertyRoomNames[0];
        if (!first || hasStandard) return;
        setAccForm((prev) => {
            let changed = false;
            const next = (prev.rooms || []).map((r: any) => {
                if (String(r?.type || '') === 'Standard') {
                    changed = true;
                    return { ...r, type: first };
                }
                return r;
            });
            return changed ? { ...prev, rooms: next } : prev;
        });
    }, [propertyRoomNames]);
    const [uploadingDocs, setUploadingDocs] = useState<Record<string, boolean>>({});
    // Combined/Series forms would use similar structures or composite

    // Table state for All Requests view
    const [columnOrder, setColumnOrder] = useState<string[]>([
        'options',
        'details',
        'requestName',
        'account',
        'account_type',
        'request_segment',
        'type',
        'meal',
        'status',
        'dates',
        'stay_info',
        'paid_amount',
        'total_cost',
    ]);
    const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
    /** Per-column visibility for the request list table (options column always shown). Toggled via gear on All Requests and Search. */
    const [listColumnVisible, setListColumnVisible] = useState<Record<string, boolean>>(() => {
        const o: Record<string, boolean> = {};
        for (const k of [
            'details',
            'requestName',
            'account',
            'account_type',
            'request_segment',
            'type',
            'meal',
            'status',
            'dates',
            'stay_info',
            'paid_amount',
            'total_cost',
        ]) {
            o[k] = k !== 'account_type' && k !== 'request_segment';
        }
        return o;
    });
    const [listColumnSettingsOpen, setListColumnSettingsOpen] = useState(false);
    const listColumnSettingsRef = useRef<HTMLDivElement | null>(null);
    /** All Requests list: sort + status/type (header Filter control). */
    const [listFilterOpen, setListFilterOpen] = useState(false);
    const listFilterRef = useRef<HTMLDivElement | null>(null);
    type AllRequestsListSort = 'activity' | 'start_newest' | 'start_oldest';
    const [listSortOrder, setListSortOrder] = useState<AllRequestsListSort>('activity');
    const [listFilterStatus, setListFilterStatus] = useState<string>('all');
    const [listFilterType, setListFilterType] = useState<string>('all');

    useEffect(() => {
        setColumnOrder((prev) => {
            if (prev.includes('account_type') && prev.includes('request_segment')) return prev;
            const i = prev.indexOf('account');
            const ins = i >= 0 ? i + 1 : prev.length;
            const next = prev.filter((c) => c !== 'account_type' && c !== 'request_segment');
            next.splice(ins, 0, 'account_type', 'request_segment');
            return next;
        });
    }, []);

    useEffect(() => {
        if (!listColumnSettingsOpen) return;
        const onDown = (e: PointerEvent) => {
            const el = listColumnSettingsRef.current;
            if (el && !el.contains(e.target as Node)) setListColumnSettingsOpen(false);
        };
        document.addEventListener('pointerdown', onDown, true);
        return () => document.removeEventListener('pointerdown', onDown, true);
    }, [listColumnSettingsOpen]);

    useEffect(() => {
        if (!listFilterOpen) return;
        const onDown = (e: PointerEvent) => {
            const el = listFilterRef.current;
            if (el && !el.contains(e.target as Node)) setListFilterOpen(false);
        };
        document.addEventListener('pointerdown', onDown, true);
        return () => document.removeEventListener('pointerdown', onDown, true);
    }, [listFilterOpen]);

    const listColumnVisibilityKeys = useMemo(
        () =>
            new Set([
                'details',
                'requestName',
                'account',
                'account_type',
                'request_segment',
                'type',
                'meal',
                'status',
                'dates',
                'stay_info',
                'paid_amount',
                'total_cost',
            ]),
        []
    );
    const visibleColumnOrder = useMemo(
        () =>
            columnOrder.filter((c) => {
                if (c === 'options') return true;
                if (listColumnVisibilityKeys.has(c)) return listColumnVisible[c] !== false;
                return true;
            }),
        [columnOrder, listColumnVisible, listColumnVisibilityKeys]
    );
    const [expandedLog, setExpandedLog] = useState<number | null>(null);
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [feedbackExpanded, setFeedbackExpanded] = useState(false);
    const [feedbackDraft, setFeedbackDraft] = useState<Record<string, FeedbackAnswerValue>>({});
    const [feedbackSaving, setFeedbackSaving] = useState(false);
    const [feedbackCopyState, setFeedbackCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
    const [activeOptionsMenu, setActiveOptionsMenu] = useState<number | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [accountRatePeriods, setAccountRatePeriods] = useState<AccountRatePeriod[]>([]);
    const skipNewRequestResetRef = useRef(false);
    const prevSubViewForNewRequestResetRef = useRef(subView);

    // Search and UI state
    const [accountSearch, setAccountSearch] = useState(
        () => restoredNewRequestDraft?.accountSearch || ''
    );
    const [showAccountDropdown, setShowAccountDropdown] = useState(false);
    const accountComboRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showAccountDropdown) return;
        const onPointerDown = (e: PointerEvent) => {
            const root = accountComboRef.current;
            if (!root || root.contains(e.target as Node)) return;
            setShowAccountDropdown(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [showAccountDropdown]);

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentModalSource, setPaymentModalSource] = useState<'form' | 'opts' | 'detail'>('opts');
    const [newPayment, setNewPayment] = useState({
        method: defaultPaymentMethodForProperty('', null),
        note: '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
    });
    const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
    const [paymentSource, setPaymentSource] = useState<'method' | 'balance' | 'cl'>('method');
    const [balanceMode, setBalanceMode] = useState<'full' | 'partial'>('full');

    useEffect(() => {
        setNewPayment((prev) => {
            if (paymentMethodOptions.includes(prev.method)) return prev;
            return {
                ...prev,
                method:
                    paymentMethodOptions[0] ||
                    defaultPaymentMethodForProperty(String(activeProperty?.id || ''), activeProperty),
            };
        });
    }, [paymentMethodOptions, activeProperty]);

    useEffect(() => {
        if (!showPaymentModal) return;
        const acctId =
            paymentModalSource === 'form'
                ? String(accForm.accountId || '')
                : String(
                      selectedRequest?.accountId ||
                          (activeOptionsMenu !== null ? requests[activeOptionsMenu]?.accountId : '') ||
                          ''
                  );
        if (!acctId) {
            setLedgerEntries([]);
            return;
        }
        import('./accountLedgerApi')
            .then(({ fetchLedger }) =>
                fetchLedger(acctId, String(activeProperty?.id || ''))
                    .then(setLedgerEntries)
                    .catch(() => setLedgerEntries([]))
            )
            .catch(() => setLedgerEntries([]));
    }, [
        showPaymentModal,
        paymentModalSource,
        accForm.accountId,
        selectedRequest,
        activeOptionsMenu,
        requests,
        activeProperty,
    ]);

    const accountBalance = useMemo(() => computeBalance(ledgerEntries), [ledgerEntries]);
    const [showLogs, setShowLogs] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchFormExpanded, setSearchFormExpanded] = useState(true);
    const [searchResults, setSearchResults] = useState<any[] | null>(null);
    const [gridYear, setGridYear] = useState(new Date().getFullYear());
    const [gridMode, setGridMode] = useState<'active' | 'cxl'>('active');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showDeleteRequestConfirm, setShowDeleteRequestConfirm] = useState(false);
    const [showDiscardDraftConfirm, setShowDiscardDraftConfirm] = useState(false);
    const [pendingDeleteRequest, setPendingDeleteRequest] = useState<any | null>(null);
    const [pendingPaymentRemove, setPendingPaymentRemove] = useState<{
        source: 'form' | 'detail';
        payment: SyncPayment;
        request?: SyncRequest;
    } | null>(null);
    const [cancelReason, setCancelReason] = useState('Price too high');
    const [cxlReasons, setCxlReasons] = useState<string[]>(DEFAULT_CXL_REASONS);
    const [cancelNote, setCancelNote] = useState('');
    const [showBeoModal, setShowBeoModal] = useState(false);
    const [beoTargetRequestId, setBeoTargetRequestId] = useState<string | null>(null);
    const [beoNotesDraft, setBeoNotesDraft] = useState('');
    const [showGisModal, setShowGisModal] = useState(false);
    const [gisTargetRequestId, setGisTargetRequestId] = useState<string | null>(null);
    const [gisBillingDraft, setGisBillingDraft] = useState('');
    const [gisOpsNotesDraft, setGisOpsNotesDraft] = useState('');
    /** `HH:MM` (24h) from `<input type="time" />`; persisted on request as `gisExpectedArrivalTime`. */
    const [gisExpectedArrivalTimeDraft, setGisExpectedArrivalTimeDraft] = useState('');
    /** Series only: map `rooms` row index → include in GIS / print (default true when opened). */
    const [gisSeriesRowInclude, setGisSeriesRowInclude] = useState<Record<number, boolean>>({});
    const [requestAlertsModalId, setRequestAlertsModalId] = useState<string | null>(null);
    const [requestAlertsModalAuto, setRequestAlertsModalAuto] = useState(false);
    /** In-app notice (replaces browser `alert` for consistent UI). */
    const [systemNotice, setSystemNotice] = useState<{ title: string; message: string } | null>(null);
    const prevDetailRequestIdRef = useRef<string | null>(null);
    const hydratedForEditIdRef = useRef<string | null>(null);
    const hydratedForDuplicateIdRef = useRef<string | null>(null);

    const getSearchOnlyParams = (params: any = {}) => {
        const { subView, ...rest } = params || {};
        return rest;
    };

    const updateSearchParams = (patch: any) => {
        setSearchParams({ ...getSearchOnlyParams(searchParams), ...patch });
    };

    const selectedSearchStatuses = parseSearchStatusSelection(searchParams);

    const toggleSearchStatusTab = (status: string) => {
        const key = normalizeSearchStatusKey(status);
        const current = parseSearchStatusSelection(searchParams);
        const has = current.some((s) => normalizeSearchStatusKey(s) === key);
        const next = has
            ? current.filter((s) => normalizeSearchStatusKey(s) !== key)
            : [...current, status];
        updateSearchParams({ statuses: next, status: undefined });
    };

    const matchesAllRequestsListFilter = (req: any, typeFilter: string, statusFilter: string) => {
        const typeFilterNorm = String(typeFilter || 'all').toLowerCase();
        const requestType = String(req.requestType || '').toLowerCase();
        const typeMatch =
            typeFilterNorm === 'all' ||
            (typeFilterNorm === 'event_rooms'
                ? requestType === 'event with rooms'
                : typeFilterNorm === 'series group'
                  ? requestType === 'series' || requestType === 'series group'
                  : requestType === typeFilterNorm);
        const statusFilterNorm = String(statusFilter || 'all').toLowerCase();
        const statusMatch = statusFilterNorm === 'all' || String(req.status || '').toLowerCase() === statusFilterNorm;
        return typeMatch && statusMatch;
    };

    /** Default list order: most recently touched first (`updatedAt`, then `createdAt`, then request date). */
    const getRequestActivitySortMs = (req: any): number => {
        const tryParse = (v: unknown) => {
            if (v == null || v === '') return NaN;
            const t = Date.parse(String(v));
            return Number.isNaN(t) ? NaN : t;
        };
        let ms = tryParse(req?.updatedAt);
        if (!Number.isNaN(ms)) return ms;
        ms = tryParse(req?.createdAt);
        if (!Number.isNaN(ms)) return ms;
        const ymd = String(req?.receivedDate || req?.requestDate || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
            ms = Date.parse(`${ymd}T12:00:00`);
            if (!Number.isNaN(ms)) return ms;
        }
        return 0;
    };

    /** Sort by operational start: agenda / event start / check-in, or earliest room arrival. */
    const getRequestOperationalStartMs = (req: any): number | null => {
        const ev = getEventDateWindow(req);
        let start = String(ev?.start || req?.checkIn || req?.eventStart || '').trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) && Array.isArray(req?.rooms)) {
            const fromRooms = req.rooms
                .map((r: any) => String(r?.arrival || r?.checkIn || '').trim().slice(0, 10))
                .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d))
                .sort();
            if (fromRooms.length) start = fromRooms[0];
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
            const ms = Date.parse(`${start}T12:00:00`);
            return Number.isNaN(ms) ? null : ms;
        }
        return null;
    };

    const listPageRequests = useMemo(() => {
        const quick = (searchTerm || '').toLowerCase().trim();
        const pid = String(activeProperty?.id || '').trim();
        let list: any[] = requests.filter((req: any) => requestInProperty(req, pid || undefined));
        if (!pid) list = [];
        if (scopedAccountFilter) {
            list = list.filter((req: any) =>
                requestMatchesAccount(
                    req,
                    scopedAccountFilter.accountId,
                    scopedAccountFilter.accountName
                )
            );
        }
        if (quick) {
            list = list.filter((req: any) =>
                String(req.id || '').toLowerCase().includes(quick) ||
                String(req.account || req.accountName || '').toLowerCase().includes(quick) ||
                String(req.confirmationNo || '').toLowerCase().includes(quick) ||
                String(req.requestName || '').toLowerCase().includes(quick)
            );
        }
        list = list.filter((req: any) => matchesAllRequestsListFilter(req, listFilterType, listFilterStatus));
        return [...list].sort((a, b) => {
            if (listSortOrder === 'activity') {
                return getRequestActivitySortMs(b) - getRequestActivitySortMs(a);
            }
            const ta = getRequestOperationalStartMs(a);
            const tb = getRequestOperationalStartMs(b);
            if (ta == null && tb == null) return 0;
            if (ta == null) return 1;
            if (tb == null) return -1;
            return listSortOrder === 'start_newest' ? tb - ta : ta - tb;
        });
    }, [requests, searchTerm, listFilterType, listFilterStatus, listSortOrder, scopedAccountFilter, activeProperty?.id]);

    const [listPageSize, setListPageSize] = useState<20 | 50 | 100>(20);
    const [listCurrentPage, setListCurrentPage] = useState(1);

    useEffect(() => {
        setListCurrentPage(1);
    }, [searchTerm, listFilterType, listFilterStatus, listSortOrder]);

    const listTotalPages = Math.max(1, Math.ceil(listPageRequests.length / listPageSize));

    useEffect(() => {
        setListCurrentPage((p) => Math.min(Math.max(1, p), listTotalPages));
    }, [listPageRequests.length, listPageSize, listTotalPages]);

    const listPagedRequests = useMemo(() => {
        const start = (listCurrentPage - 1) * listPageSize;
        return listPageRequests.slice(start, start + listPageSize);
    }, [listPageRequests, listCurrentPage, listPageSize]);

    const requestAlertsModalRequest = useMemo(() => {
        if (!requestAlertsModalId) return null;
        const id = String(requestAlertsModalId);
        const fromList = requests.find((r: any) => String(r.id) === id);
        if (fromList) return fromList;
        if (selectedRequest && String(selectedRequest.id) === id) return selectedRequest;
        return null;
    }, [requestAlertsModalId, requests, selectedRequest]);

    const showSystemNotice = useCallback((title: string, message: string) => {
        setSystemNotice({ title, message });
    }, []);

    const mergePatchedRequest = useCallback(
        (patched: SyncRequest) => {
            if (!patched?.id) return;
            const id = String(patched.id);
            setRequests((prev) =>
                prev.map((r) => (String(r.id) === id ? { ...r, ...patched } : r))
            );
            setSelectedRequest((prev: any) =>
                prev && String(prev.id) === id ? { ...prev, ...patched } : prev
            );
            onRequestSaved?.(patched);
            onAfterRequestsMutate?.();
        },
        [onAfterRequestsMutate, onRequestSaved]
    );

    const [showAddAccountModal, setShowAddAccountModal] = useState(false);
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [newContactDraft, setNewContactDraft] = useState({
        firstName: '',
        lastName: '',
        position: '',
        email: '',
        phone: '',
        city: '',
        country: '',
    });

    const getAccountContacts = useCallback((account: any) => {
        const contacts = Array.isArray(account?.contacts) ? account.contacts : [];
        return contacts
            .map((c: any, idx: number) => {
                const label = contactDisplayName(c) || String(c?.email || c?.phone || c?.position || `Contact ${idx + 1}`);
                return {
                    ...c,
                    _id: String(c?.id || c?.contactId || `contact-${idx + 1}`),
                    _label: label,
                };
            })
            .filter((c: any) => String(c._label || '').trim());
    }, []);

    const applyAccountSelectionToDraft = useCallback((account: any) => {
        const accountName = String(account?.name || '').trim();
        const accountId = String(account?.id || '').trim();
        const contacts = getAccountContacts(account);
        const first = contacts[0];
        setAccForm((prev: any) => ({
            ...prev,
            accountName,
            accountId,
            bookerContactId: String(first?._id || ''),
            bookerName: String(first?._label || ''),
        }));
    }, [getAccountContacts]);

    const selectedDraftAccount = useMemo(
        () => accountsSameProperty.find((a: any) => String(a?.id || '') === String(accForm.accountId || '')) || null,
        [accountsSameProperty, accForm.accountId]
    );
    const selectedDraftAccountContacts = useMemo(
        () => getAccountContacts(selectedDraftAccount),
        [getAccountContacts, selectedDraftAccount]
    );
    useEffect(() => {
        if (!accForm.accountId) return;
        if (accForm.bookerContactId || accForm.bookerName) return;
        const first = selectedDraftAccountContacts[0];
        if (!first) return;
        setAccForm((prev: any) => ({
            ...prev,
            bookerContactId: String(first._id || ''),
            bookerName: String(first._label || ''),
        }));
    }, [accForm.accountId, accForm.bookerContactId, accForm.bookerName, selectedDraftAccountContacts]);

    const handleSaveAccountFromModal = (accountData: any) => {
        if (readOnlyOperational) return;
        if (!accountData?.name) return;
        const u = currentUser?.name || currentUser?.username || currentUser?.email || 'User';
        const act = {
            id: `acct-${Date.now()}`,
            at: new Date().toISOString(),
            title: 'Account created',
            body: 'Account created from Requests.',
            user: u,
        };
        const newAccount = {
            id: `A${Date.now()}`,
            ...accountData,
            propertyId: accountData.propertyId || activeProperty?.id || 'P-GLOBAL',
            createdByUserId: resolveUserAttributionId(currentUser) || undefined,
            accountOwnerName: u,
            activities: [...(accountData.activities || []), act],
        };
        setAccounts((prev: any[]) => [newAccount, ...prev]);
        setShowAddAccountModal(false);
        setAccountSearch(newAccount.name);
        applyAccountSelectionToDraft(newAccount);
        const first = getAccountContacts(newAccount)[0];
        setEvtForm(prev => ({
            ...prev,
            leadId: newAccount.name,
            accountId: newAccount.id,
            bookerContactId: String(first?._id || ''),
            bookerName: String(first?._label || ''),
        }));
    };

    const openAddContactModal = () => {
        if (!accForm.accountId) {
            showSystemNotice('Select account first', 'Please select an account before adding a contact person.');
            return;
        }
        setNewContactDraft({ firstName: '', lastName: '', position: '', email: '', phone: '', city: '', country: '' });
        setShowAddContactModal(true);
    };

    const handleCreateContactForSelectedAccount = () => {
        if (readOnlyOperational) return;
        const selectedAccountId = String(accForm.accountId || '').trim();
        const account = accountsSameProperty.find((a: any) => String(a?.id || '') === selectedAccountId);
        if (!account) {
            showSystemNotice('Account not found', 'The selected account could not be found. Please reselect the account and try again.');
            return;
        }
        const firstName = String(newContactDraft.firstName || '').trim();
        const lastName = String(newContactDraft.lastName || '').trim();
        const email = String(newContactDraft.email || '').trim();
        const phone = String(newContactDraft.phone || '').trim();
        const position = String(newContactDraft.position || '').trim();
        const city = String(newContactDraft.city || '').trim();
        const country = String(newContactDraft.country || '').trim();
        if (!firstName && !lastName && !email && !phone) {
            showSystemNotice('Missing contact details', 'Please add at least a name, email, or phone number for the contact.');
            return;
        }
        const newContact = {
            id: `C${Date.now()}`,
            firstName,
            lastName,
            name: [firstName, lastName].filter(Boolean).join(' ').trim(),
            email,
            phone,
            position,
            city,
            country,
        };
        const contactName = contactDisplayName(newContact) || email || phone || 'New Contact';
        setAccounts((prev: any[]) =>
            prev.map((a: any) =>
                String(a?.id || '') === selectedAccountId
                    ? { ...a, contacts: [...(Array.isArray(a?.contacts) ? a.contacts : []), newContact] }
                    : a
            )
        );
        setAccForm((prev: any) => ({ ...prev, bookerContactId: String(newContact.id), bookerName: contactName }));
        setEvtForm((prev: any) => (
            String(prev?.accountId || '') === selectedAccountId
                ? { ...prev, bookerContactId: String(newContact.id), bookerName: contactName }
                : prev
        ));
        setShowAddContactModal(false);
    };

    // Reset workflow only when navigating into new_request (not on every accounts/property refresh).
    useEffect(() => {
        if (embedded || optsHeadless || detailHeadless) return;
        const prevSubView = prevSubViewForNewRequestResetRef.current;
        const enteredNewRequest = subView === 'new_request' && prevSubView !== 'new_request';
        prevSubViewForNewRequestResetRef.current = subView;

        if (readOnlyOperational && subView === 'new_request') {
            setIsEditing(false);
            setRequestType(null);
            setStep(1);
            clearNewRequestDraft();
            setSearchParams({
                ...searchParams,
                subView: 'list',
                editRequestId: undefined,
            });
            return;
        }
        if (
            enteredNewRequest &&
            !isEditing &&
            !searchParams?.editRequestId &&
            !searchParams?.duplicateFromRequestId
        ) {
            if (skipNewRequestResetRef.current) {
                skipNewRequestResetRef.current = false;
                return;
            }
            clearNewRequestDraft();
            setStep(1);
            setRequestType(null);
            
            // CLEAR FORM DATA FOR NEW REQUEST
            setAccForm({ 
                ...initialAccommodation, 
                id: '',
                rooms: [{ id: Date.now(), type: primaryPropertyRoomType || '', occupancy: primaryOccupancyDefault, count: 1, rate: 0, mealPlan: 'RO' }],
                payments: [],
                logs: [],
                transportation: [],
                agenda: [],
                requestName: '',
                accountName: '',
                accountId: '',
                bookerName: '',
                bookerContactId: '',
                confirmationNo: '',
                segment: '',
                promotionId: ''
            });

            const prefillAccountId = String(initialAccountId || '').trim();
            const prefillAccount = prefillAccountId
                ? accounts.find((a: any) => String(a.id) === prefillAccountId)
                : null;
            if (prefillAccount) {
                const contacts = getAccountContacts(prefillAccount);
                const callContactId = String(initialContactFromCall?.contactId || '').trim();
                const callContactName = String(initialContactFromCall?.name || '').trim();
                const matched =
                    (callContactId
                        ? contacts.find((c: any) => String(c?._id || c?.id || '') === callContactId)
                        : null) ||
                    (callContactName
                        ? contacts.find((c: any) => String(c?._label || '').trim() === callContactName)
                        : null);
                const first = matched || contacts[0];
                setAccForm({
                    ...initialAccommodation,
                    id: '',
                    rooms: [{ id: Date.now(), type: primaryPropertyRoomType || '', occupancy: primaryOccupancyDefault, count: 1, rate: 0, mealPlan: 'RO' }],
                    payments: [],
                    logs: [],
                    transportation: [],
                    agenda: [],
                    requestName: '',
                    accountName: String(prefillAccount.name || '').trim(),
                    accountId: prefillAccountId,
                    bookerName: String(first?._label || callContactName || ''),
                    bookerContactId: String(first?._id || callContactId || ''),
                    confirmationNo: '',
                    segment: '',
                    promotionId: '',
                });
                onConsumedInitialAccountId?.();
                onConsumedInitialContactFromCall?.();
            }

            setEvtForm({
                ...initialEvent,
                confirmationNo: 'EVT-' + Math.floor(Math.random() * 10000),
                requestName: '',
                leadId: '',
                accountId: prefillAccountId,
                bookerName: prefillAccount ? String(getAccountContacts(prefillAccount).find((c: any) => String(c?._id || '') === String(initialContactFromCall?.contactId || ''))?._label || getAccountContacts(prefillAccount)[0]?._label || initialContactFromCall?.name || '') : '',
                bookerContactId: prefillAccount ? String(getAccountContacts(prefillAccount).find((c: any) => String(c?._id || '') === String(initialContactFromCall?.contactId || ''))?._id || getAccountContacts(prefillAccount)[0]?._id || initialContactFromCall?.contactId || '') : '',
                segment: '',
                promotionId: '',
                agenda: [{
                    id: 1,
                    startDate: '', endDate: '', venue: '', shape: 'Theater',
                    startTime: '', endTime: '',
                    coffee1: '', coffee2: '', lunchTime: '', dinnerTime: '',
                    rate: 0, pax: 0, rental: 0,
                    package: defaultEventPackageName(
                        resolveEventPackagesForProperty(activeProperty?.id || '', activeProperty)
                    ),
                    notes: '',
                }],
            });

            // CLEAR UI STATE FOR NEW REQUEST
            setAccountSearch('');
            setShowAccountDropdown(false);
        }
        
        // Reset isEditing only when we are fully in the list view without any selection
        if (subView === 'list' && !selectedRequest) {
            setIsEditing(false);
        }
        setExpandedLog(null);
    }, [
        subView,
        isEditing,
        selectedRequest,
        readOnlyOperational,
        embedded,
        optsHeadless,
        searchParams?.editRequestId,
        searchParams?.duplicateFromRequestId,
        activeProperty,
        primaryPropertyRoomType,
        primaryOccupancyDefault,
        initialAccountId,
        initialContactFromCall,
        accounts,
        getAccountContacts,
        onConsumedInitialAccountId,
        onConsumedInitialContactFromCall,
    ]);

    useEffect(() => {
        if (embedded || optsHeadless || detailHeadless) return;
        if (subView !== 'new_request' || isEditing || searchParams?.editRequestId || searchParams?.duplicateFromRequestId) {
            return;
        }
        if (!requestType) return;
        const pid = String(activeProperty?.id || '').trim() || 'P-GLOBAL';
        const handle = window.setTimeout(() => {
            writeNewRequestDraft({
                propertyId: pid,
                step,
                requestType,
                accForm,
                evtForm,
                accountSearch,
                updatedAt: Date.now(),
            });
        }, 350);
        return () => window.clearTimeout(handle);
    }, [
        subView,
        isEditing,
        searchParams?.editRequestId,
        searchParams?.duplicateFromRequestId,
        step,
        requestType,
        accForm,
        evtForm,
        accountSearch,
        activeProperty?.id,
        embedded,
        optsHeadless,
    ]);

    const isDuplicateCreateFlow =
        Boolean(searchParams?.duplicateFromRequestId || hydratedForDuplicateIdRef.current);

    const handleDiscardNewRequestDraft = () => {
        if (embedded || optsHeadless || detailHeadless) return;
        setShowDiscardDraftConfirm(true);
    };

    const confirmDiscardNewRequestDraftAction = () => {
        clearNewRequestDraft();
        setShowDiscardDraftConfirm(false);
        setIsEditing(false);
        hydratedForDuplicateIdRef.current = null;
        setRequestType(null);
        setStep(1);
        const next = { ...getSearchOnlyParams(searchParams), subView: 'list' as const };
        delete next.editRequestId;
        delete next.duplicateFromRequestId;
        setSearchParams(next);
    };

    // New / edit / duplicate all use the same form layout; Discard abandons without saving.
    const showDiscardNewRequestDraft =
        !embedded &&
        !optsHeadless &&
        !detailHeadless;

    const prevSubViewRef = useRef(subView);
    useEffect(() => {
        if (embedded || optsHeadless || detailHeadless) {
            prevSubViewRef.current = subView;
            return;
        }
        if (prevSubViewRef.current === 'new_request' && subView !== 'new_request') {
            clearNewRequestDraft();
            hydratedForDuplicateIdRef.current = null;
            onRequestWizardFinished?.();
        }
        prevSubViewRef.current = subView;
    }, [subView, embedded, optsHeadless, detailHeadless, onRequestWizardFinished]);

    // Fetch Requests from Backend
    const applyRequestsPayload = (data: any[]) => {
        const serverIds = new Set(data.map((r: any) => String(r?.id || '')));
        // Locally-deleted rows must never be re-added by an authoritative refetch that
        // raced ahead of the backend commit. Filter tombstoned ids out of the server
        // list itself (not just the seed) to prevent the delete "flicker".
        let next = deletedRequestIdsRef.current.size
            ? data.filter((r: any) => !deletedRequestIdsRef.current.has(String(r?.id || '')))
            : data;
        if (Array.isArray(sharedRequestsSeed) && sharedRequestsSeed.length > 0) {
            const pid = String(activeProperty?.id || '').trim();
            const extras = sharedRequestsSeed.filter((r: any) => {
                const id = String(r?.id || '');
                if (!id || serverIds.has(id) || deletedRequestIdsRef.current.has(id)) return false;
                return requestInProperty(r, pid || undefined);
            });
            if (extras.length) next = [...extras, ...next];
        }
        // Retire a tombstone only once the server confirms the row is truly gone.
        if (deletedRequestIdsRef.current.size) {
            deletedRequestIdsRef.current.forEach((id) => {
                if (!serverIds.has(id)) deletedRequestIdsRef.current.delete(id);
            });
        }
        setRequests(next);
    };

    const fetchRequests = async () => {
        const pid = String(activeProperty?.id || '').trim();
        if (!requestsLoad.begin(pid)) {
            setRequests([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const url = apiUrl(`/api/requests?propertyId=${encodeURIComponent(pid)}`);
            const data = await refreshRequestsWithDefiniteToActual(url, {
                readOnly: readOnlyOperational,
                requestLogUser,
            });
            if (!requestsLoad.isCurrent(pid)) return;
            if (Array.isArray(data)) applyRequestsPayload(data);
        } catch (err) {
            console.error("Error fetching requests:", err);
        } finally {
            if (requestsLoad.isCurrent(pid)) setIsLoading(false);
        }
    };

    /** Lightweight refetch for live updates — skips Definite→Actual promotion loop. */
    const fetchRequestsLive = async () => {
        const pid = String(activeProperty?.id || '').trim();
        if (!requestsLoad.begin(pid)) return;
        try {
            const url = apiUrl(`/api/requests?propertyId=${encodeURIComponent(pid)}`);
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            if (!requestsLoad.isCurrent(pid)) return;
            if (Array.isArray(data)) applyRequestsPayload(data);
        } catch (err) {
            console.error('Error live-fetching requests:', err);
        }
    };

    const fetchTaxes = async () => {
        const pid = String(activeProperty?.id || '').trim();
        if (!taxesLoad.begin(pid)) {
            setTaxesList([]);
            return;
        }
        try {
            const url = apiUrl(`/api/taxes?propertyId=${encodeURIComponent(pid)}`);
            const res = await fetch(url);
            const data = await res.json();
            if (!taxesLoad.isCurrent(pid)) return;
            if (Array.isArray(data)) setTaxesList(data);
        } catch (err) {
            console.error("Error fetching taxes:", err);
        }
    };

    useEffect(() => {
        if (!activeProperty?.id) {
            setRequests([]);
            setTaxesList([]);
            return;
        }
        fetchRequests();
        fetchTaxes();
    }, [subView, activeProperty?.id]);

    // Instant list sync: mirror parent sharedRequests (updated immediately by WebSocket
    // and by local delete/save handlers) into this component's requests state.
    useEffect(() => {
        if (!Array.isArray(sharedRequestsSeed)) return;
        const pid = String(activeProperty?.id || '').trim();
        if (!pid) {
            setRequests([]);
            prevSeedIdsRef.current = new Set();
            return;
        }
        const seedForProp = sharedRequestsSeed.filter((r: any) => {
            const id = String(r?.id || '');
            if (!id || deletedRequestIdsRef.current.has(id)) return false;
            return requestInProperty(r, pid);
        });
        const seedIds = new Set(seedForProp.map((r: any) => String(r.id)));

        setRequests((prev) => {
            const byId = new Map(prev.map((r) => [String(r.id), r]));
            for (const row of seedForProp) {
                byId.set(String(row.id), row);
            }
            for (const id of prevSeedIdsRef.current) {
                if (!seedIds.has(id)) byId.delete(id);
            }
            return Array.from(byId.values()).filter((r) => requestInProperty(r, pid));
        });
        prevSeedIdsRef.current = seedIds;
    }, [sharedRequestsSeed, activeProperty?.id]);

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'visible') fetchRequests();
        };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, [activeProperty?.id]);

    // Live updates: refetch authoritative server data (fast path, no automation loop).
    const liveRefetchTimerRef = useRef<number | null>(null);
    const lastLiveSignalRef = useRef(liveUpdateSignal);
    useEffect(() => {
        if (liveUpdateSignal === lastLiveSignalRef.current) return;
        lastLiveSignalRef.current = liveUpdateSignal;
        if (liveRefetchTimerRef.current) clearTimeout(liveRefetchTimerRef.current);
        liveRefetchTimerRef.current = window.setTimeout(() => {
            fetchRequestsLive();
        }, 150);
        return () => {
            if (liveRefetchTimerRef.current) clearTimeout(liveRefetchTimerRef.current);
        };
    }, [liveUpdateSignal]);

    useEffect(() => {
        if (searchResults === null) return;
        setSearchResults(
            filterRequestsByAdvancedSearch(requests, getSearchOnlyParams(searchParams), assignableUsersForProperty)
        );
    }, [requests]);

    useEffect(() => {
        const loadVenuesRooms = async () => {
            if (!activeProperty?.id) {
                setPropertyVenues([]);
                setPropertyRoomNames([]);
                return;
            }
            try {
                const [vRes, rRes] = await Promise.all([
                    fetch(apiUrl(`/api/venues?propertyId=${encodeURIComponent(activeProperty.id)}`)),
                    fetch(apiUrl(`/api/rooms?propertyId=${encodeURIComponent(activeProperty.id)}`))
                ]);
                const vData = vRes.ok ? await vRes.json() : [];
                const rData = rRes.ok ? await rRes.json() : [];
                if (Array.isArray(vData)) setPropertyVenues(vData);
                if (Array.isArray(rData)) {
                    const names = rData
                        .map((x: any) => String(x?.name ?? x?.label ?? x?.roomType ?? '').trim())
                        .filter(Boolean);
                    setPropertyRoomNames(names);
                }
            } catch {
                setPropertyVenues([]);
                setPropertyRoomNames([]);
            }
        };
        loadVenuesRooms();
    }, [activeProperty?.id]);

    // Catalog rates for new drafts only (existing/edit/duplicate keep snapshotted room rates).
    const allowAccountRateAutofill =
        !isEditing && !searchParams?.editRequestId && !searchParams?.duplicateFromRequestId;

    useEffect(() => {
        if (!allowAccountRateAutofill) {
            setAccountRatePeriods([]);
            return;
        }
        const pid = String(activeProperty?.id || '').trim();
        const aid = String(accForm.accountId || '').trim();
        if (!pid || !aid) {
            setAccountRatePeriods([]);
            return;
        }
        let cancelled = false;
        fetch(
            apiUrl(
                `/api/account-rates?propertyId=${encodeURIComponent(pid)}&accountId=${encodeURIComponent(aid)}`
            )
        )
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
                if (cancelled) return;
                setAccountRatePeriods(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                if (!cancelled) setAccountRatePeriods([]);
            });
        return () => {
            cancelled = true;
        };
    }, [allowAccountRateAutofill, activeProperty?.id, accForm.accountId]);

    useEffect(() => {
        if (!allowAccountRateAutofill) return;
        if (requestType !== 'accommodation' && requestType !== 'series' && requestType !== 'event_rooms') {
            return;
        }
        const stayStart = String(accForm.checkIn || '').slice(0, 10);
        const stayEnd = String(accForm.checkOut || stayStart).slice(0, 10);
        const segment = String(accForm.segment || '').trim();
        const accountId = String(accForm.accountId || '').trim();
        if (!accountId || !segment || !stayStart) return;

        setAccForm((prev) => {
            const rooms = Array.isArray(prev.rooms) ? prev.rooms : [];
            let changed = false;
            const nextRooms = rooms.map((room: any) => {
                const looked = lookupAccountRoomRate({
                    periods: accountRatePeriods,
                    accountId,
                    segment,
                    stayStart,
                    stayEnd,
                    roomType: String(room?.type || ''),
                    occupancy: String(room?.occupancy || ''),
                });
                const nextRate = looked == null ? 0 : looked;
                if (Number(room?.rate || 0) === nextRate) return room;
                changed = true;
                return { ...room, rate: nextRate };
            });
            return changed ? { ...prev, rooms: nextRooms } : prev;
        });
    }, [
        allowAccountRateAutofill,
        requestType,
        accountRatePeriods,
        accForm.accountId,
        accForm.segment,
        accForm.checkIn,
        accForm.checkOut,
        // Re-run when room type/occupancy identity set changes (not when user types rate).
        JSON.stringify(
            (accForm.rooms || []).map((r: any) => `${r?.id}|${r?.type}|${r?.occupancy}`)
        ),
    ]);

    useEffect(() => {
        const loadCxlReasons = async () => {
            const mergeUniqueReasons = (base: string[], incoming: string[]) => {
                const out: string[] = [];
                const seen = new Set<string>();
                [...base, ...incoming].forEach((raw) => {
                    const v = String(raw || '').trim();
                    if (!v) return;
                    const key = v.toLowerCase();
                    if (seen.has(key)) return;
                    seen.add(key);
                    out.push(v);
                });
                return out;
            };
            if (!activeProperty?.id) {
                setCxlReasons(DEFAULT_CXL_REASONS);
                return;
            }
            let localReasons: string[] = [];
            try {
                const raw = localStorage.getItem(cxlStorageKey(activeProperty.id));
                const parsed = raw ? JSON.parse(raw) : [];
                localReasons = Array.isArray(parsed)
                    ? parsed
                          .map((row: any) => String(row?.label || row?.reason || row || '').trim())
                          .filter(Boolean)
                    : [];
                if (localReasons.length > 0) {
                    setCxlReasons(localReasons);
                }
            } catch {
                // Ignore local cache read errors.
            }
            try {
                const res = await fetch(apiUrl(`/api/cxl-reasons?propertyId=${encodeURIComponent(activeProperty.id)}`));
                const data = res.ok ? await res.json() : [];
                const backendReasons = Array.isArray(data)
                    ? data
                          .map((row: any) => String(row?.label || row?.reason || '').trim())
                          .filter(Boolean)
                    : [];
                const mergedReasons = mergeUniqueReasons(localReasons, backendReasons);
                if (mergedReasons.length) {
                    setCxlReasons(mergedReasons);
                    try {
                        localStorage.setItem(
                            cxlStorageKey(activeProperty.id),
                            JSON.stringify(mergedReasons.map((label) => ({ label, reason: label, propertyId: activeProperty.id })))
                        );
                    } catch {
                        // Ignore local cache write errors.
                    }
                } else {
                    setCxlReasons(DEFAULT_CXL_REASONS);
                }
            } catch {
                setCxlReasons((prev) => (prev.length ? prev : DEFAULT_CXL_REASONS));
            }
        };
        loadCxlReasons();
    }, [activeProperty?.id]);

    useEffect(() => {
        if (!Array.isArray(cxlReasons) || cxlReasons.length === 0) return;
        if (!cxlReasons.includes(cancelReason)) {
            setCancelReason(cxlReasons[0]);
        }
    }, [cxlReasons, cancelReason]);

    const venueOptions = propertyVenues.length
        ? propertyVenues
        : [{ id: 'placeholder', name: '— Add venues in Property Settings —' }];

    /** Venues flagged “Combined” in Settings → Venues (used for per-agenda combined room selection). */
    const combinedVenueOptions = useMemo(
        () => (propertyVenues || []).filter((v: any) => v && v.id !== 'placeholder' && Boolean(v.isCombined)),
        [propertyVenues]
    );

    const openRequestForEdit = (req: any) => {
        if (readOnlyOperational) return;
        if (!req?.id) return;
        setIsEditing(true);
        setSearchParams({
            ...getSearchOnlyParams(searchParams),
            subView: 'new_request',
            editRequestId: req.id,
            duplicateFromRequestId: undefined,
        });
        setActiveOptionsMenu(null);
    };

    const cloneRowsWithNewIds = (rows: unknown): any[] => {
        const arr = Array.isArray(rows) ? rows : [];
        const base = Date.now();
        return arr.map((row: any, i: number) => {
            if (row && typeof row === 'object') return { ...row, id: base + i };
            return row;
        });
    };

    const makeDuplicateIdentity = (typeKey: string) => {
        const id = generateRequestId();
        let confirmationNo = 'CNF-' + Math.floor(Math.random() * 100000);
        if (typeKey === 'event') confirmationNo = 'EVT-' + Math.floor(Math.random() * 10000);
        return { id, confirmationNo };
    };

    const hydrateFormsFromRequest = (req: any, opts?: { asDuplicate?: boolean }) => {
        if (!req) return;
        const type = normalizeRequestTypeKey(req.requestType);
        const accountName = req.accountName || req.account || '';
        const sourceRef = String(req.confirmationNo || req.id || '').trim() || 'source request';

        let savedPayments = Array.isArray(req.payments) && req.payments.length > 0
            ? JSON.parse(JSON.stringify(req.payments))
            : (parseFloat(req.paidAmount?.toString().replace(/,/g, '') || '0') > 0
                ? [{
                    id: Date.now(),
                    date: req.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
                    method: 'Bank Transfer',
                    note: 'Deposit on file',
                    amount: parseFloat(req.paidAmount?.toString().replace(/,/g, '') || '0'),
                }]
                : []);

        if (opts?.asDuplicate) {
            savedPayments = [];
        }

        setIsEditing(!opts?.asDuplicate);
        setRequestType(type);
        setStep(2);
        setAccountSearch(accountName);

        const duplicateIdentity = opts?.asDuplicate ? makeDuplicateIdentity(type) : null;
        const duplicateLogs = opts?.asDuplicate
            ? [{
                date: new Date().toISOString(),
                user: requestLogUser,
                action: 'Duplicated request',
                details: `Copied from ${sourceRef}. Adjust as needed and save as a new request.`,
            }]
            : (req.logs || []);

        if (type === 'event' || type === 'event_rooms' || type === 'series') {
            const rawRooms = Array.isArray(req.rooms) ? cloneRowsWithNewIds(req.rooms) : initialAccommodation.rooms;
            const roomsHydrated =
                type === 'series' || type === 'event_rooms'
                    ? rawRooms.map((r: any) => ({
                          ...r,
                          arrival: r.arrival || req.checkIn || '',
                          departure: r.departure || req.checkOut || '',
                      }))
                    : rawRooms;
            const ci = String(req.checkIn || '').slice(0, 10);
            const co = String(req.checkOut || '').slice(0, 10);
            const nightsHydrated = ci && co ? calculateNights(ci, co) : Math.max(0, Number(req.nights) || 0);
            const accPayload: any = {
                ...initialAccommodation,
                ...JSON.parse(JSON.stringify(req)),
                accountName,
                accountId: req.accountId || '',
                bookerName: req.bookerName || req.booker || '',
                bookerContactId: req.bookerContactId || '',
                receivedDate: req.receivedDate || req.requestDate || initialAccommodation.receivedDate,
                requestName: req.requestName || '',
                confirmationNo: req.confirmationNo || initialAccommodation.confirmationNo,
                nights: nightsHydrated,
                agenda: Array.isArray(req.agenda)
                    ? cloneRowsWithNewIds(req.agenda.map((row: any) => normalizeAgendaRowTimes(row)))
                    : initialAccommodation.agenda,
                rooms: roomsHydrated.map((r: any) => {
                    const a = String(r.arrival || ci || '').slice(0, 10);
                    const d = String(r.departure || co || '').slice(0, 10);
                    const n = a && d ? calculateNights(a, d) : Math.max(0, Number(r.nights) || 0);
                    return {
                        ...r,
                        nights: n,
                        mealPlan: String(r.mealPlan || req.mealPlan || 'RO').trim() || 'RO',
                    };
                }),
                transportation: cloneRowsWithNewIds(req.transportation),
                payments: savedPayments,
                logs: duplicateLogs,
                segment: req.segment || '',
                promotionId: req.promotionId || '',
                invoices: req.invoices ? JSON.parse(JSON.stringify(req.invoices)) : initialAccommodation.invoices,
            };
            if (duplicateIdentity) {
                accPayload.id = duplicateIdentity.id;
                accPayload.confirmationNo = duplicateIdentity.confirmationNo;
                accPayload.status = 'Inquiry';
                accPayload.payments = [];
                accPayload.paidAmount = '0';
                accPayload.paymentStatus = 'Unpaid';
                delete accPayload.feedback;
                delete accPayload.createdAt;
                delete accPayload.createdByUserId;
            }
            setAccForm(accPayload);
            if (type === 'event') {
                const evtPayload: any = {
                    ...initialEvent,
                    ...JSON.parse(JSON.stringify(req)),
                    leadId: req.account || req.accountName || accountName,
                    accountId: req.accountId || '',
                    bookerName: req.bookerName || req.booker || '',
                    bookerContactId: req.bookerContactId || '',
                    requestName: req.requestName || '',
                    requestDate: req.requestDate || req.receivedDate || new Date().toISOString().split('T')[0],
                    confirmationNo: req.confirmationNo || initialEvent.confirmationNo,
                    agenda: Array.isArray(req.agenda)
                        ? cloneRowsWithNewIds(req.agenda.map((row: any) => normalizeAgendaRowTimes(row)))
                        : initialEvent.agenda,
                    payments: savedPayments,
                    logs: duplicateLogs,
                    segment: req.segment || '',
                    promotionId: req.promotionId || '',
                };
                if (duplicateIdentity) {
                    evtPayload.id = duplicateIdentity.id;
                    evtPayload.confirmationNo = duplicateIdentity.confirmationNo;
                    evtPayload.status = 'Inquiry';
                    evtPayload.payments = [];
                    delete evtPayload.feedback;
                }
                setEvtForm(evtPayload);
            }
        } else {
            const ci2 = String(req.checkIn || '').slice(0, 10);
            const co2 = String(req.checkOut || '').slice(0, 10);
            const nightsAcc = ci2 && co2 ? calculateNights(ci2, co2) : Math.max(0, Number(req.nights) || 0);
            const accPayload: any = {
                ...initialAccommodation,
                ...JSON.parse(JSON.stringify(req)),
                accountName,
                accountId: req.accountId || '',
                bookerName: req.bookerName || req.booker || '',
                bookerContactId: req.bookerContactId || '',
                nights: nightsAcc,
                rooms: cloneRowsWithNewIds(Array.isArray(req.rooms) ? req.rooms : initialAccommodation.rooms).map((r: any) => ({
                    ...r,
                    mealPlan: String(r.mealPlan || req.mealPlan || 'RO').trim() || 'RO',
                })),
                transportation: cloneRowsWithNewIds(req.transportation),
                payments: savedPayments,
                logs: duplicateLogs,
                segment: req.segment || '',
                promotionId: req.promotionId || '',
                invoices: req.invoices ? JSON.parse(JSON.stringify(req.invoices)) : initialAccommodation.invoices,
            };
            if (duplicateIdentity) {
                accPayload.id = duplicateIdentity.id;
                accPayload.confirmationNo = duplicateIdentity.confirmationNo;
                accPayload.status = 'Inquiry';
                accPayload.payments = [];
                accPayload.paidAmount = '0';
                accPayload.paymentStatus = 'Unpaid';
                delete accPayload.feedback;
                delete accPayload.createdAt;
                delete accPayload.createdByUserId;
            }
            setAccForm(accPayload);
        }
    };

    const openRequestForDuplicate = (req: any) => {
        if (readOnlyOperational || !req?.id) return;
        if (optsHeadless && onHeadlessDuplicateRequest) {
            setActiveOptionsMenu(null);
            onHeadlessDuplicateRequest(String(req.id));
            return;
        }
        skipNewRequestResetRef.current = true;
        setActiveOptionsMenu(null);
        setSearchParams({
            ...getSearchOnlyParams(searchParams),
            subView: 'new_request',
            editRequestId: undefined,
            duplicateFromRequestId: req.id,
        });
    };

    useEffect(() => {
        if (!pendingOpenRequestId || isLoading) return;
        const r = requests.find((x: any) => String(x.id) === String(pendingOpenRequestId));
        if (r) {
            setSelectedRequest(r);
            onConsumedPendingOpenRequest?.();
        }
    }, [pendingOpenRequestId, requests, isLoading, onConsumedPendingOpenRequest]);

    useEffect(() => {
        if (!detailHeadless || !headlessInitialRequest?.id) return;
        setSelectedRequest(headlessInitialRequest);
    }, [detailHeadless, headlessInitialRequest]);

    useEffect(() => {
        if (!detailHeadless || !headlessInitialRequest?.id || isLoading) return;
        const fresh = requests.find((x: any) => String(x.id) === String(headlessInitialRequest.id));
        if (fresh) setSelectedRequest(fresh);
    }, [detailHeadless, headlessInitialRequest?.id, requests, isLoading]);

    useEffect(() => {
        if (!pendingOpenOptsRequestId || isLoading) return;
        const idx = requests.findIndex((x: any) => String(x.id) === String(pendingOpenOptsRequestId));
        if (idx !== -1) {
            setActiveOptionsMenu(idx);
            onConsumedPendingOpenOpts?.();
        } else if (requests.length > 0) {
            onConsumedPendingOpenOpts?.();
        }
    }, [pendingOpenOptsRequestId, requests, isLoading, onConsumedPendingOpenOpts]);

    /** When opening a request that has alerts, show the alerts modal shortly after the detail view mounts. */
    useEffect(() => {
        const id = selectedRequest?.id ?? null;
        if (!id) {
            prevDetailRequestIdRef.current = null;
            return;
        }
        const prev = prevDetailRequestIdRef.current;
        if (prev === id) return;
        prevDetailRequestIdRef.current = id;
        const list = normalizeRequestAlerts(selectedRequest);
        if (list.length === 0) return;
        const t = window.setTimeout(() => {
            setRequestAlertsModalId(String(id));
            setRequestAlertsModalAuto(true);
        }, 250);
        return () => clearTimeout(t);
    }, [selectedRequest]);

    useEffect(() => {
        if (!selectedRequest) {
            setFeedbackExpanded(false);
            setFeedbackDraft({});
            setFeedbackCopyState('idle');
            return;
        }
        const template = getFeedbackTemplateForRequestType(
            selectedRequest.requestType,
            resolveFeedbackTemplatesForProperty(activeProperty)
        );
        const base = buildInitialFeedbackAnswers(template);
        const savedAnswers =
            selectedRequest?.feedback && typeof selectedRequest.feedback === 'object' ? selectedRequest.feedback.answers : {};
        setFeedbackDraft({ ...base, ...(typeof savedAnswers === 'object' && savedAnswers ? savedAnswers : {}) });
        setFeedbackExpanded(false);
        setFeedbackCopyState('idle');
    }, [selectedRequest?.id]);

    useEffect(() => {
        if (readOnlyOperational) return;
        const editId = searchParams?.editRequestId;
        if (!editId) {
            hydratedForEditIdRef.current = null;
            return;
        }
        if (subView !== 'new_request' || !requests.length) return;
        if (hydratedForEditIdRef.current === editId) return;
        const req = requests.find((x: any) => String(x.id) === String(editId));
        if (!req) return;
        hydratedForEditIdRef.current = editId;
        hydrateFormsFromRequest(req, { asDuplicate: false });
        setSearchParams({
            ...getSearchOnlyParams(searchParams),
            subView: 'new_request',
        });
    }, [subView, searchParams?.editRequestId, requests, readOnlyOperational]);

    useEffect(() => {
        if (readOnlyOperational) return;
        const dupId = searchParams?.duplicateFromRequestId;
        if (!dupId) return;
        if (subView !== 'new_request' || !requests.length) return;
        if (hydratedForDuplicateIdRef.current === dupId) return;
        const req = requests.find((x: any) => String(x.id) === String(dupId));
        if (!req) return;
        hydratedForDuplicateIdRef.current = dupId;
        skipNewRequestResetRef.current = true;
        hydrateFormsFromRequest(req, { asDuplicate: true });
        setSearchParams({
            ...getSearchOnlyParams(searchParams),
            subView: 'new_request',
            duplicateFromRequestId: undefined,
        });
    }, [subView, searchParams?.duplicateFromRequestId, requests, readOnlyOperational]);

    const handleSaveRequest = async (formData: any, type: string) => {
        if (readOnlyOperational) return;
        const propertyId = String(activeProperty?.id || '').trim();
        if (!propertyId || propertyId === 'P-GLOBAL') {
            showSystemNotice('Cannot save request', 'Select an active property before saving. Requests saved without a property will not appear in your list.');
            return;
        }
        setIsLoading(true);
        try {
            // Always recalculate financial metrics to ensure they match current form state (handle updates)
            const normalizedType = normalizeRequestTypeKey(type);
            const agendaForVenueCheck =
                normalizedType === 'event' ? (formData.agenda || []) : normalizedType === 'event_rooms' ? (formData.agenda || []) : [];
            if (normalizedType === 'event' || normalizedType === 'event_rooms') {
                if (Array.isArray(agendaForVenueCheck) && agendaForVenueCheck.length) {
                    for (let i = 0; i < agendaForVenueCheck.length; i++) {
                        const row = agendaForVenueCheck[i];
                        if (row?.combined && !(Array.isArray(row.combinedVenueNames) && row.combinedVenueNames.length)) {
                            showSystemNotice(
                                'Cannot save request',
                                `Agenda row ${i + 1}: "Combined" is on but no meeting rooms are selected. Choose at least one room, or turn off Combined.`
                            );
                            return;
                        }
                    }
                    const conflict = findFirstAgendaVenueConflict({
                        agenda: agendaForVenueCheck,
                        requestId: formData.id || null,
                        propertyId: activeProperty?.id,
                        candidates: requests,
                    });
                    if (conflict) {
                        const r = conflict.ref;
                        const reqTitle = String(r.requestName || r.confirmationNo || r.id || 'another request').trim();
                        const acct = String(r.account || r.accountName || 'Unknown account').trim();
                        showSystemNotice(
                            'Venue not available',
                            `${conflict.venue} is not available on the selected dates. It is already booked for:\n\nRequest: ${reqTitle}\nAccount: ${acct}\n\nPlease check venue availability before confirming your booking.`
                        );
                        return;
                    }
                }
            }
            const reqCfgViol = collectRequestFormViolations(activeProperty?.id, normalizedType, formData, activeProperty);
            if (reqCfgViol.length) {
                showSystemNotice('Required fields', reqCfgViol.join('\n'));
                return;
            }
            const fin = normalizedType === 'event'
                ? (Array.isArray(formData?.agenda) ? calculateAccFinancials(formData) : calculateEvtFinancials(formData))
                : calculateAccFinancials(formData);
            const resolvedTotalCost = (fin.grandTotalWithTax !== undefined ? fin.grandTotalWithTax : fin.totalCostWithTax) || 0;
            const resolvedGrandTotalNoTax = Number(fin.grandTotalNoTax ?? fin.eventCostNoTax ?? 0) || 0;
            const resolvedNights = fin.nights || calculateNights(formData.checkIn, formData.checkOut);
            const selectedPromotionId = canLinkRequestPromotions
                ? String(autoPromotionForDraft(formData, normalizedType) || '').trim()
                : String(formData.promotionId || '').trim();
            
            const existingReq = formData.id ? requests.find((r: any) => r.id === formData.id) : null;
            // Duplicate must always create a new row — never update the source request.
            const isUpdate = !!existingReq && !isDuplicateCreateFlow;
            let updatedLogs = [...(formData.logs || [])];
            // Drop stale child PKs on create so backend idx-scoped ids stay unique.
            if (!isUpdate) {
                updatedLogs = updatedLogs.map((log: any) => {
                    if (!log || typeof log !== 'object') return log;
                    const { id: _drop, ...rest } = log;
                    return rest;
                });
            }

            if (!isUpdate) {
                updatedLogs.unshift({
                    date: new Date().toISOString(),
                    user: requestLogUser,
                    action: 'Request Created',
                    details: `Initial ${type} request created for ${formData.accountName || formData.account || 'Unknown'}.`
                });
            } else {
                const changes: string[] = [];
                const oldName = existingReq.requestName || '';
                const newName = formData.requestName || '';
                if (oldName !== newName) changes.push(`Name: ${oldName} -> ${newName}`);

                const oldAcc = existingReq.account || '';
                const newAcc = formData.accountName || formData.account || '';
                if (oldAcc !== newAcc) changes.push(`Account: ${oldAcc} -> ${newAcc}`);

                if (formData.checkIn !== existingReq.checkIn || formData.checkOut !== existingReq.checkOut) {
                    changes.push(`Dates: ${existingReq.checkIn}/${existingReq.checkOut} -> ${formData.checkIn}/${formData.checkOut}`);
                }
                if (Number(formData.nights) !== Number(existingReq.nights)) {
                    changes.push(`Nights: ${existingReq.nights} -> ${formData.nights}`);
                }
                if (Number(fin.totalRooms) !== Number(existingReq.totalRooms)) {
                    changes.push(`Total Rooms: ${existingReq.totalRooms} -> ${fin.totalRooms}`);
                }
                if (formData.status !== existingReq.status) {
                    changes.push(`Status: ${existingReq.status} -> ${formData.status}`);
                }

                // Robust Room Tracking (Handles additions/modifications/removals)
                if (Array.isArray(formData.rooms)) {
                    formData.rooms.forEach((room: any) => {
                        const oldRoom = Array.isArray(existingReq.rooms) 
                            ? existingReq.rooms.find((r: any) => r.type === room.type) 
                            : null;
                        
                        if (!oldRoom) {
                            changes.push(`Added Room Type: ${room.type} (${room.count} @ ${room.rate})`);
                        } else {
                            if (Number(room.rate) !== Number(oldRoom.rate)) {
                                changes.push(`${room.type} Price: ${oldRoom.rate} -> ${room.rate}`);
                            }
                            if (Number(room.count) !== Number(oldRoom.count)) {
                                changes.push(`${room.type} Count: ${oldRoom.count} -> ${room.count}`);
                            }
                        }
                    });
                    
                    // Track removed rooms
                    if (Array.isArray(existingReq.rooms)) {
                        existingReq.rooms.forEach((oldRoom: any) => {
                            const stillExists = formData.rooms.some((r: any) => r.type === oldRoom.type);
                            if (!stillExists) {
                                changes.push(`Removed Room Type: ${oldRoom.type}`);
                            }
                        });
                    }
                }

                // Track total cost changes with precision normalization
                const oldTotal = parseFloat(existingReq.totalCost?.toString().replace(/,/g, '') || '0');
                if (resolvedTotalCost.toFixed(2) !== oldTotal.toFixed(2)) {
                    changes.push(`Grand Total: ${oldTotal.toLocaleString()} -> ${resolvedTotalCost.toLocaleString()}`);
                }

                if (changes.length > 0) {
                    updatedLogs.unshift({
                        date: new Date().toISOString(),
                        user: requestLogUser,
                        action: 'Modified Details',
                        details: changes.join('\n')
                    });
                }
            }

            const resolvedAccountId = formData.accountId
                || (formData.accommodation && formData.accommodation.accountId)
                || '';
            const resolvedSegment = String(
                formData?.accommodation?.segment
                ?? formData?.event?.segment
                ?? formData?.segment
                ?? ''
            ).trim();
            const paymentsForStatus = Array.isArray(formData.payments)
                ? formData.payments
                : Array.isArray(formData.accommodation?.payments)
                    ? formData.accommodation.payments
                    : [];
            const paymentSum = paymentsForStatus.reduce((acc: number, p: any) => acc + Number(p?.amount || 0), 0);
            const defaultPipelineStatus = 'Inquiry';
            const initialPipelineStatus =
                String(formData.status || formData.accommodation?.status || defaultPipelineStatus).trim() ||
                defaultPipelineStatus;
            let resolvedStatus = initialPipelineStatus;
            if (
                paymentSum > 0 &&
                paymentsMeetOrExceedTotal(paymentSum, resolvedTotalCost) &&
                canAutoDefiniteFromStatus(initialPipelineStatus)
            ) {
                resolvedStatus = 'Definite';
                updatedLogs = [
                    {
                        date: new Date().toISOString(),
                        user: requestLogUser,
                        action: 'Status auto-updated',
                        details: `Full payment recorded while status was ${initialPipelineStatus} — set to Definite.`,
                    },
                    ...updatedLogs,
                ];
            } else if (paymentSum > 0 && canAutoDefiniteFromStatus(initialPipelineStatus)) {
                resolvedStatus = 'Definite';
                updatedLogs = [
                    {
                        date: new Date().toISOString(),
                        user: requestLogUser,
                        action: 'Status auto-updated',
                        details: `Deposit recorded while status was ${initialPipelineStatus} — set to Definite.`,
                    },
                    ...updatedLogs,
                ];
            }
            const becameDefiniteThisSave =
                paymentSum > 0 &&
                canAutoDefiniteFromStatus(initialPipelineStatus);
            const resolvedPaymentStatus = paymentsMeetOrExceedTotal(paymentSum, resolvedTotalCost)
                ? 'Paid'
                : paymentSum > 0
                  ? 'Deposit'
                  : 'Unpaid';
            const eventWindow = getEventDateWindow(formData || {});
            const requestTypeLabelForProbe =
                normalizedType === 'event_rooms'
                    ? 'Event with Rooms'
                    : normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1);
            const resolvedCheckInForProbe =
                normalizedType === 'event'
                    ? String(eventWindow.start || formData.checkIn || '').slice(0, 10)
                    : formData.checkIn;
            const actualProbe = {
                ...formData,
                requestType: formData.requestType || requestTypeLabelForProbe,
                status: 'Definite',
                totalCost: resolvedTotalCost.toFixed(2),
                payments: paymentsForStatus,
                paidAmount: paymentSum.toFixed(2),
                paymentStatus: resolvedPaymentStatus,
                checkIn: resolvedCheckInForProbe || formData.checkIn,
                eventStart: String(formData.eventStart || eventWindow.start || '').slice(0, 10),
            };
            if (
                resolvedStatus === 'Definite' &&
                !becameDefiniteThisSave &&
                shouldPromoteDefiniteToActual(actualProbe)
            ) {
                resolvedStatus = 'Actual';
                updatedLogs = [
                    {
                        date: new Date().toISOString(),
                        user: requestLogUser,
                        action: 'Status auto-updated',
                        details: LOG_ACTUAL_FROM_DEFINITE,
                    },
                    ...updatedLogs,
                ];
            }
            let createdByUserIdOut: string | undefined;
            if (!isUpdate) {
                createdByUserIdOut = resolveUserAttributionId(currentUser) || undefined;
            } else {
                const p = formData.createdByUserId;
                if (p != null && String(p).trim() !== '') createdByUserIdOut = String(p).trim();
            }

            const savedRooms = sanitizeRequestRoomsForSave(formData.rooms || []);
            const mealPlanForPayload =
                normalizedType === 'event'
                    ? String(formData.mealPlan ?? '').trim()
                    : deriveRequestMealLabelFromRooms(savedRooms, formData.mealPlan);

            const payload = {
                ...formData,
                rooms: savedRooms,
                mealPlan: mealPlanForPayload || String(formData.mealPlan ?? '').trim() || '—',
                id: isUpdate
                    ? String(formData.id || '').trim()
                    : (isDuplicateCreateFlow && String(formData.id || '').trim()
                        ? String(formData.id).trim()
                        : generateRequestId()),
                // Backend collision guard: existing ids need an explicit update flag (or matching createdAt).
                ...(isUpdate ? { _update: true } : {}),
                requestName: formData.requestName || 'Unnamed Request',
                account: formData.accountName || formData.leadId || formData.account || 'Unknown Account',
                accountId: resolvedAccountId,
                bookerName: String(formData.bookerName || '').trim(),
                bookerContactId: String(formData.bookerContactId || '').trim(),
                confirmationNo: formData.confirmationNo || 'N/A',
                requestType: normalizedType === 'event_rooms'
                    ? 'Event with Rooms'
                    : normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1),
                status: resolvedStatus,
                propertyId,
                createdAt: formData.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                totalCost: resolvedTotalCost.toFixed(2),
                grandTotalNoTax: resolvedGrandTotalNoTax,
                nights: resolvedNights,
                totalRooms: fin.totalRooms || 0,
                adr: fin.adr || 0,
                paidAmount: fin.paidAmount.toFixed(2),
                payments: formData.payments || [],
                eventStart: String(formData.eventStart || eventWindow.start || '').slice(0, 10),
                eventEnd: String(formData.eventEnd || eventWindow.end || eventWindow.start || '').slice(0, 10),
                checkIn:
                    normalizedType === 'event'
                        ? String(eventWindow.start || formData.checkIn || '').slice(0, 10)
                        : formData.checkIn,
                checkOut:
                    normalizedType === 'event'
                        ? String(eventWindow.end || eventWindow.start || formData.checkOut || '').slice(0, 10)
                        : formData.checkOut,
                logs: updatedLogs,
                paymentStatus: resolvedPaymentStatus,
                segment: resolvedSegment,
                promotionId: selectedPromotionId || '',
                ...(createdByUserIdOut != null ? { createdByUserId: createdByUserIdOut } : {}),
            };

            const url = apiUrl('/api/requests');

            const postRequest = (body: any) =>
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(body),
                });

            let res = await postRequest(payload);
            if (res.status === 409 && !isUpdate) {
                const retryPayload = {
                    ...payload,
                    id: generateRequestId(),
                    createdAt: new Date().toISOString(),
                };
                res = await postRequest(retryPayload);
                if (res.ok) {
                    Object.assign(payload, retryPayload);
                }
            }

            if (res.ok) {
                let saved: any = payload;
                try {
                    saved = await res.json();
                } catch {
                    /* use payload fallback */
                }
                setRequests((prev) => {
                    const id = String(saved?.id || payload.id);
                    const idx = prev.findIndex((r: any) => String(r?.id) === id);
                    if (idx >= 0) {
                        const next = [...prev];
                        next[idx] = saved;
                        return next;
                    }
                    return [saved, ...prev];
                });
                clearNewRequestDraft();
                await fetchRequests();
                onRequestSaved?.(saved);
                onAfterRequestsMutate?.();
                if (embedded) {
                    onEmbeddedComplete?.();
                } else {
                    setSearchParams({ ...getSearchOnlyParams(searchParams), subView: 'list' });
                    setStep(1);
                    setRequestType(null);
                }
            } else {
                let detail = '';
                try {
                    const errBody = await res.json();
                    detail = typeof errBody?.detail === 'string' ? errBody.detail : '';
                } catch {
                    /* ignore */
                }
                showSystemNotice(
                    'Save failed',
                    detail || `Failed to save request. Status: ${res.status}`
                );
            }
        } catch (err) {
            console.error("Error saving request:", err);
            showSystemNotice('Save error', 'Error saving request. Please check the console for details.');
        } finally {
            setIsLoading(false);
        }
    };

    // Reset when subView changes to list
    useEffect(() => {
        if (embedded || optsHeadless || detailHeadless) return;
        if (subView !== 'new_request') {
            setStep(1);
            setRequestType(null);
        }
    }, [subView, embedded, optsHeadless, detailHeadless]);

    const updateRequest = async (id: string, partialData: any) => {
        setIsLoading(true);
        try {
            // Find existing request to perform a full-payload update (Backend might be overwrite-only)
            const existing = requests.find(r => r.id === id);
            if (!existing) {
                console.warn("Attempted to update non-existent request:", id);
                return;
            }

            // `_update: true` is required — without it, mismatched createdAt strings yield HTTP 409.
            const payload = { ...existing, ...partialData, _update: true };
            
            const res = await fetch(apiUrl('/api/requests'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                await fetchRequests();
                onRequestSaved?.(payload);
                onAfterRequestsMutate?.();
            } else {
                let detail = '';
                try {
                    const errBody = await res.json();
                    detail = typeof errBody?.detail === 'string' ? errBody.detail : '';
                } catch {
                    /* ignore */
                }
                showSystemNotice(
                    'Update failed',
                    detail || `Failed to update. Status: ${res.status}`
                );
            }
        } catch (err) {
            console.error("Error updating request:", err);
            showSystemNotice('Update error', 'Error updating request.');
        } finally {
            setIsLoading(false);
        }
    };

    const executePendingPaymentRemove = async () => {
        const pending = pendingPaymentRemove;
        setPendingPaymentRemove(null);
        if (!pending?.payment?.id) return;
        const { payment, source, request } = pending;
        const propertyId = String(activeProperty?.id || '').trim();

        if (source === 'form') {
            if (isBalanceOrClPaymentMethod(payment.method)) {
                const accountId = String(accForm.accountId || '').trim();
                if (!accountId) {
                    showSystemNotice(
                        'Cannot remove payment',
                        'Link an account to this request before removing a Balance or CL payment.'
                    );
                    return;
                }
                if (!accForm?.id || !propertyId) {
                    showSystemNotice(
                        'Cannot remove payment',
                        'Save the request and select a property before removing Balance or CL payments.'
                    );
                    return;
                }
                try {
                    const { request: patched } = await reverseBalancePaymentOnRequest({
                        request: { ...accForm, payments: accForm.payments },
                        payment,
                        accountId,
                        propertyId,
                        mode: 'delete',
                    });
                    setAccForm({
                        ...accForm,
                        payments: patched.payments || [],
                        paymentStatus: String(patched.paymentStatus || accForm.paymentStatus || 'Unpaid'),
                        collectLater: !!patched.collectLater,
                        logs: [
                            ...(accForm.logs || []),
                            {
                                date: new Date().toISOString(),
                                user: requestLogUser,
                                action: 'Payment line removed',
                                details: `${formatMoney(Number(payment.amount || 0), 0)} — ${payment.method || ''} — ${payment.note || ''}`.trim(),
                            },
                        ],
                    });
                    mergePatchedRequest(patched);
                    showSystemNotice(
                        'Payment removed',
                        'Balance restored on the linked account.'
                    );
                } catch (e: unknown) {
                    showSystemNotice(
                        'Remove failed',
                        (e instanceof Error && e.message ? e.message : 'Could not reverse the Balance/CL payment on the ledger.')
                    );
                }
                return;
            }
            setAccForm({
                ...accForm,
                payments: (accForm.payments || []).filter((p: any) => p.id !== payment.id),
                logs: [
                    ...(accForm.logs || []),
                    {
                        date: new Date().toISOString(),
                        user: requestLogUser,
                        action: 'Payment line removed',
                        details: `${formatMoney(Number(payment.amount || 0), 0)} — ${payment.method || ''} — ${payment.note || ''}`.trim(),
                    },
                ],
            });
            return;
        }

        const req = request;
        if (!req?.id) return;
        if (isBalanceOrClPaymentMethod(payment.method)) {
            const accountId = String(req.accountId || '').trim();
            if (!accountId) {
                showSystemNotice(
                    'Cannot remove payment',
                    'Link an account to this request before removing a Balance or CL payment.'
                );
                return;
            }
            if (!propertyId) {
                showSystemNotice(
                    'Cannot remove payment',
                    'Select an active property before removing Balance or CL payments.'
                );
                return;
            }
            try {
                const { request: patched } = await reverseBalancePaymentOnRequest({
                    request: req,
                    payment,
                    accountId,
                    propertyId,
                    mode: 'delete',
                });
                mergePatchedRequest(patched);
                showSystemNotice(
                    'Payment removed',
                    'Balance restored on the linked account.'
                );
            } catch (e: unknown) {
                showSystemNotice(
                    'Remove failed',
                    (e instanceof Error && e.message ? e.message : 'Could not reverse the Balance/CL payment on the ledger.')
                );
            }
            return;
        }
        const newPayments = (req.payments || []).filter((p: any) => p.id !== payment.id);
        const paidSum = sumPaymentAmounts(newPayments);
        const totalCost = parseFloat(String(req.totalCost ?? '0').replace(/,/g, '')) || 0;
        let paymentStatus = 'Unpaid';
        if (totalCost > 0) {
            if (paymentsMeetOrExceedTotal(paidSum, totalCost)) paymentStatus = 'Paid';
            else if (paidSum > 0) paymentStatus = 'Deposit';
        }
        await updateRequest(String(req.id), {
            payments: newPayments,
            paidAmount: paidSum.toFixed(2),
            paymentStatus,
        });
        if (selectedRequest?.id === req.id) {
            setSelectedRequest((prev: any) =>
                prev
                    ? { ...prev, payments: newPayments, paidAmount: paidSum.toFixed(2), paymentStatus }
                    : null
            );
        }
    };

    const generateFeedbackToken = () => {
        try {
            const raw = crypto.randomUUID().replace(/-/g, '');
            return `${Date.now().toString(36)}${raw}`;
        } catch {
            return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
        }
    };

    const buildFeedbackShareLink = (token: string) => {
        const origin = window.location.origin;
        const path = window.location.pathname || '/';
        return `${origin}${path}?feedbackToken=${encodeURIComponent(token)}`;
    };

    const persistRequestAlerts = async (requestId: string, alerts: RequestAlert[]) => {
        const existing = requests.find((r: any) => String(r.id) === String(requestId));
        if (!existing) return;
        await updateRequest(String(requestId), { alerts });
        setSelectedRequest((prev: any) =>
            prev && String(prev.id) === String(requestId) ? { ...prev, alerts } : prev
        );
    };

    const renderActivities = (logs: any[]) => (
        <div className="p-8 rounded-[2rem] border-2 space-y-6 animate-in slide-in-from-top-4 duration-500" style={{ backgroundColor: colors.card, borderColor: colors.primary + '20' }}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock className="text-primary" size={18} />
                    <h4 className="text-sm font-black uppercase tracking-widest opacity-60">Activities</h4>
                </div>
            </div>
            <div className="space-y-4 text-left">
                {(!logs || logs.length === 0) ? (
                    <div className="text-center py-12 opacity-30 italic text-xs">
                        No activities found for this request.
                    </div>
                ) : (
                    logs.map((log: any, idx: number) => (
                        <div key={idx} 
                            onClick={() => log.details && setExpandedLog(expandedLog === idx ? null : idx)}
                            className={`flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/5 transition-all ${log.details ? 'cursor-pointer hover:bg-white/10' : ''}`}>
                            <div className="flex gap-4 items-start">
                                <span className="opacity-30 whitespace-nowrap pt-0.5 font-mono text-[9px]">
                                    {new Date(log.date).toLocaleString()}
                                </span>
                                <div className="flex flex-col gap-1 flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-primary text-[10px] uppercase tracking-wider">{log.user || 'System'}:</span>
                                        {log.details && (
                                            <span className="text-[9px] opacity-40 font-bold uppercase tracking-tighter">
                                                {expandedLog === idx ? 'Click to hide' : 'Click for details'}
                                            </span>
                                        )}
                                    </div>
                                    <span className="opacity-70 leading-relaxed text-[11px] font-medium">{log.action}</span>
                                </div>
                            </div>
                            {expandedLog === idx && log.details && (
                                <div className="mt-2 pt-3 border-t border-white/10 animate-in fade-in slide-in-from-top-1 duration-300">
                                    <pre className="text-[10px] opacity-60 leading-relaxed font-mono whitespace-pre-wrap py-2 px-3 rounded-lg bg-black/20">
                                        {log.details}
                                    </pre>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    const extractRequestDocPublicIds = (req: any): string[] => {
        const ids: string[] = [];
        const invoices = req?.invoices;
        if (!invoices || typeof invoices !== 'object') return ids;
        for (const value of Object.values(invoices as Record<string, any>)) {
            if (!value || typeof value !== 'object') continue;
            const pid = String((value as any).publicId || (value as any).public_id || '').trim();
            if (pid) ids.push(pid);
        }
        return ids;
    };

    const deleteRequest = async (id: string) => {
        if (readOnlyOperational) return;
        const rid = String(id);
        const snapshot = requests.find((r: any) => String(r.id) === rid);
        if (!snapshot) return;

        // Optimistic remove — match dashboard KPI speed (sharedRequests updates instantly).
        deletedRequestIdsRef.current.add(rid);
        setRequests((prev) => prev.filter((r: any) => String(r.id) !== rid));
        onRequestDeleted?.(rid);
        if (selectedRequest && String(selectedRequest.id) === rid) {
            setSelectedRequest(null);
        }

        try {
            const res = await fetch(apiUrl(`/api/requests/${id}`), {
                method: 'DELETE',
            });
            if (!res.ok) {
                throw new Error(`Delete failed (${res.status})`);
            }

            // Local volume cleanup after DB delete — do not block list UI.
            const publicIds = extractRequestDocPublicIds(snapshot);
            if (publicIds.length) {
                void Promise.all(
                    publicIds.map((pid) => deleteFileLocal(pid).catch(() => undefined))
                );
            }

            void fetchRequestsLive();
        } catch (err) {
            console.error('Error deleting request:', err);
            deletedRequestIdsRef.current.delete(rid);
            setRequests((prev) => {
                if (prev.some((r: any) => String(r.id) === rid)) return prev;
                return [snapshot, ...prev];
            });
            onAfterRequestsMutate?.();
            showSystemNotice('Delete error', 'Could not delete the request. It was restored to the list.');
        }
    };

    // --- Helpers ---

    /** Inclusive calendar span from earliest agenda start to latest agenda end (whole-event length). */
    const agendaSpanInclusiveDays = (agenda: any[] = []) => {
        if (!Array.isArray(agenda) || agenda.length === 0) return 0;
        let minD = '';
        let maxD = '';
        for (const item of agenda) {
            const s = String(item?.startDate || '').trim().slice(0, 10);
            const e = String(item?.endDate || item?.startDate || '').trim().slice(0, 10);
            if (!s) continue;
            if (!minD || s < minD) minD = s;
            const end = e || s;
            if (!maxD || end > maxD) maxD = end;
        }
        if (!minD || !maxD) return 0;
        return inclusiveCalendarDays(minD, maxD);
    };

    const calculateAccFinancials = (data?: any) =>
        calculateAccFinancialsForRequest(data ?? accForm, taxesList, requestType);

    const calculateEvtFinancials = (data?: any) =>
        calculateEvtFinancialsPure(data || evtForm, taxesList);

    // --- Render Components ---

    const renderTypeSelection = () => (
        <div className="flex flex-col items-center justify-center h-full p-8 animate-in zoom-in duration-300">
            <h2 className="text-2xl font-bold mb-8" style={{ color: colors.textMain }}>Select Request Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
                {[
                    { id: 'accommodation', label: 'Accommodation', icon: BedDouble, desc: 'Room bookings & transfers' },
                    { id: 'event', label: 'Event Only', icon: Music, desc: 'Venues, catering & setups' },
                    { id: 'event_rooms', label: 'Event with Rooms', icon: Box, desc: 'Combined accommodation & event' },
                    { id: 'series', label: 'Series Group', icon: Users, desc: 'Recurring groups & allocations' }
                ].map((type) => (
                    <button
                        key={type.id}
                        onClick={() => {
                            setRequestType(type.id);
                            setStep(2);
                            // Per-room stay dates (series + event with rooms)
                            if (type.id === 'series' || type.id === 'event_rooms') {
                                setAccForm(prev => ({
                                    ...prev,
                                    rooms: prev.rooms.map(r => ({
                                        ...r as any,
                                        arrival: (r as any).arrival || prev.checkIn || '',
                                        departure: (r as any).departure || prev.checkOut || ''
                                    }))
                                }));
                            }
                        }}
                        className="p-6 rounded-xl border flex flex-col items-center gap-4 hover:scale-[1.05] hover:shadow-xl hover:-translate-y-1 transition-all group text-center animate-in fade-in zoom-in duration-300"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-white/5 group-hover:bg-primary/20 transition-colors"
                            style={{ color: colors.primary }}>
                            <type.icon size={32} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg" style={{ color: colors.textMain }}>{type.label}</h3>
                            <p className="text-sm opacity-70" style={{ color: colors.textMuted }}>{type.desc}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderFormLayout = ({ title, icon: Icon, children, onBack, onSave, onDiscard, maxWidthClass }: any) => (
        <div className="h-full flex flex-col relative" style={{ backgroundColor: colors.bg }}>
            <div className="flex-1 overflow-y-auto p-6">
                <div className={`${maxWidthClass || 'max-w-4xl'} mx-auto w-full space-y-6 pb-12`}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-current/5" style={{ borderColor: colors.border }}>
                        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: colors.textMain }}>
                            <Icon /> {title}
                        </h2>
                        <span className="font-mono text-sm opacity-50" style={{ color: colors.textMuted }}>REQ-DRAFT</span>
                    </div>

                    {children}

                    {/* Footer Buttons integrated into form */}
                    <div className="flex items-center justify-end gap-3 pt-8 mt-8 border-t" style={{ borderColor: colors.border }}>
                        {typeof onDiscard === 'function' && (
                            <button
                                type="button"
                                onClick={onDiscard}
                                className="px-6 py-3 rounded-xl border font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                                style={{ borderColor: colors.border, color: '#ef4444' }}
                            >
                                Discard
                            </button>
                        )}
                        <button type="button" onClick={onBack} className="px-6 py-3 rounded-xl border font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                            style={{ borderColor: colors.border, color: colors.textMain }}>Back</button>
                        {!readOnlyOperational && (
                            <button type="button" onClick={onSave} className="px-10 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-2 hover:brightness-110 hover:-translate-y-0.5 transition-all active:scale-95"
                                style={{ backgroundColor: colors.primary, color: '#000' }}>
                                <Save size={16} /> Save Request
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderAccommodationForm = () => {
        const fin = calculateAccFinancials();
        const eventAgendaSpanDays = agendaSpanInclusiveDays(accForm.agenda || []);
        const eventDayDenomForm = Math.max(1, fin.totalEventDays || eventAgendaSpanDays || 1);
        const eventCostPerDayForm = fin.eventCostWithTax / eventDayDenomForm;
        const remainingBalanceForm = Math.max(0, (fin.grandTotalWithTax || 0) - (fin.paidAmount || 0));
        const roomGridLikeSeries = requestType === 'series' || requestType === 'event_rooms';

        const addRoom = () => {
            const rt = primaryPropertyRoomType || '';
            const defaultMeal = String(accForm.mealPlan || 'RO').trim() || 'RO';
            const newRoom =
                requestType === 'series' || requestType === 'event_rooms'
                    ? {
                          id: Date.now(),
                          arrival: accForm.checkIn || '',
                          departure: accForm.checkOut || '',
                          nights: 0,
                          type: rt,
                          occupancy: primaryOccupancyDefault,
                          count: 1,
                          rate: 0,
                          mealPlan: defaultMeal,
                      }
                    : { id: Date.now(), type: rt, occupancy: primaryOccupancyDefault, count: 1, rate: 0, mealPlan: defaultMeal };

            setAccForm({
                ...accForm,
                rooms: [...accForm.rooms, newRoom]
            });
        };

        const deleteRoom = (id: number) => {
            setAccForm({
                ...accForm,
                rooms: accForm.rooms.filter(r => r.id !== id)
            });
        };

        const updateRoom = (id: number, field: string, value: any) => {
            setAccForm({
                ...accForm,
                rooms: accForm.rooms.map(r => r.id === id ? { ...r, [field]: value } : r)
            });
        };

        const patchRoom = (id: number, patch: Record<string, any>) => {
            setAccForm({
                ...accForm,
                rooms: accForm.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
            });
        };

        const syncAccCheckIn = (v: string) => {
            setAccForm((prev) => {
                const next: any = { ...prev, checkIn: v };
                const n = Math.max(0, Math.floor(Number(prev.nights) || 0));
                if (v && n > 0) {
                    next.checkOut = addCalendarDaysIso(v, n);
                } else if (v && next.checkOut) {
                    next.nights = calculateNights(v, next.checkOut);
                }
                return next;
            });
        };

        const syncAccCheckOut = (v: string) => {
            setAccForm((prev) => {
                const next: any = { ...prev, checkOut: v };
                if (next.checkIn && v) {
                    next.nights = calculateNights(next.checkIn, v);
                }
                return next;
            });
        };

        const syncAccNights = (raw: number) => {
            const n = Math.max(0, Math.floor(Number(raw) || 0));
            setAccForm((prev) => {
                const next: any = { ...prev, nights: n };
                if (prev.checkIn && n > 0) {
                    next.checkOut = addCalendarDaysIso(prev.checkIn, n);
                }
                return next;
            });
        };

        const addTrip = () => {
            setAccForm({
                ...accForm,
                transportation: [...accForm.transportation, { id: Date.now(), type: 'Sedan', pax: 1, costPerWay: 0, timing: '', notes: '' }]
            });
        };

        const deleteTrip = (id: number) => {
            setAccForm({
                ...accForm,
                transportation: accForm.transportation.filter(t => t.id !== id)
            });
        };

        const updateTrip = (id: number, field: string, value: any) => {
            setAccForm({
                ...accForm,
                transportation: accForm.transportation.map(t => t.id === id ? { ...t, [field]: value } : t)
            });
        };

        const addAgendaRow = () => {
            const prev = accForm.agenda || [];
            const last = prev.length ? prev[prev.length - 1] : null;
            const defPkg = defaultEventPackageName(eventPackagesForProperty);
            const newRow = last
                ? {
                      ...last,
                      id: Date.now(),
                      combined: Boolean(last.combined),
                      combinedVenueNames: Array.isArray(last.combinedVenueNames) ? [...last.combinedVenueNames] : [],
                  }
                : {
                      id: Date.now(),
                      startDate: '',
                      endDate: '',
                      venue: '',
                      shape: 'Theater',
                      startTime: '',
                      endTime: '',
                      coffee1: '',
                      coffee2: '',
                      lunchTime: '',
                      dinnerTime: '',
                      rate: 0,
                      pax: 0,
                      rental: 0,
                      package: defPkg,
                      notes: '',
                      combined: false,
                      combinedVenueNames: [] as string[],
                  };
            setAccForm({
                ...accForm,
                agenda: [...prev, newRow],
            });
        };

        const deleteAgendaRow = (id: number) => {
            setAccForm({
                ...accForm,
                agenda: (accForm.agenda || []).filter((item: any) => item.id !== id)
            });
        };

        const updateAgendaRow = (id: number, field: string, value: any) => {
            setAccForm({
                ...accForm,
                agenda: (accForm.agenda || []).map((item: any) => item.id === id ? { ...item, [field]: value } : item)
            });
        };

        const patchAgendaRow = (id: number, patch: Record<string, any>) => {
            setAccForm({
                ...accForm,
                agenda: (accForm.agenda || []).map((item: any) => (item.id === id ? { ...item, ...patch } : item)),
            });
        };

        const onAgendaStartDateChange = (row: any, newStart: string) => {
            const oldS = String(row.startDate || '').slice(0, 10);
            const e = String(row.endDate || '').slice(0, 10);
            const patch: any = { startDate: newStart };
            if (newStart && e && oldS) {
                const span = inclusiveCalendarDays(oldS, e);
                patch.endDate = addCalendarDaysIso(newStart, span - 1);
            }
            patchAgendaRow(row.id, patch);
        };

        const onAgendaEndDateChange = (row: any, newEnd: string) => {
            patchAgendaRow(row.id, { endDate: newEnd });
        };

        const onAgendaInclusiveDaysChange = (row: any, raw: string) => {
            const num = Math.floor(Number(raw));
            if (!raw || Number.isNaN(num) || num < 1) return;
            const s = String(row.startDate || '').slice(0, 10);
            if (!s) return;
            patchAgendaRow(row.id, { endDate: addCalendarDaysIso(s, num - 1) });
        };

        const toggleAgendaCombinedVenue = (rowId: number, venueName: string) => {
            if (readOnlyOperational) return;
            setAccForm((prev) => ({
                ...prev,
                agenda: (prev.agenda || []).map((item: any) => {
                    if (item.id !== rowId) return item;
                    const cur = Array.isArray(item.combinedVenueNames) ? item.combinedVenueNames : [];
                    const has = cur.includes(venueName);
                    const combinedVenueNames = has ? cur.filter((n: string) => n !== venueName) : [...cur, venueName];
                    return { ...item, combinedVenueNames };
                }),
            }));
        };

        const handlePostPayment = () => {
            const amount = Number(newPayment.amount);
            if (isNaN(amount) || amount === 0) return;

            const st = String(accForm.status || '').trim();
            const mergedPayments = [...accForm.payments, { ...newPayment, id: Date.now(), amount }];
            const newPaid = sumPaymentAmounts(mergedPayments);
            const total = Number(fin.grandTotalWithTax ?? fin.totalCostWithTax ?? 0) || 0;
            const fullPayPromotion = paymentsMeetOrExceedTotal(newPaid, total) && canAutoDefiniteFromStatus(st);
            const bumpToDefinite = !fullPayPromotion && newPaid > 0 && canAutoDefiniteFromStatus(st);
            const requestTypeLabel =
                requestType === 'event_rooms'
                    ? 'Event with Rooms'
                    : String(requestType || 'accommodation').charAt(0).toUpperCase() +
                      String(requestType || 'accommodation').slice(1);
            const actualProbe = {
                ...accForm,
                payments: mergedPayments,
                status: 'Definite',
                totalCost: total.toFixed(2),
                paidAmount: newPaid.toFixed(2),
                paymentStatus: paymentsMeetOrExceedTotal(newPaid, total) ? 'Paid' : fin.paymentStatus,
                requestType: requestTypeLabel,
            };

            let nextStatus = accForm.status;
            let autoLog: any[] = [];
            if (st === 'Definite' && shouldPromoteDefiniteToActual(actualProbe)) {
                nextStatus = 'Actual';
                autoLog = [
                    {
                        date: new Date().toISOString(),
                        user: requestLogUser,
                        action: 'Status auto-updated',
                        details: LOG_ACTUAL_FROM_DEFINITE,
                    },
                ];
            } else if (fullPayPromotion) {
                nextStatus = 'Definite';
                autoLog = [
                    {
                        date: new Date().toISOString(),
                        user: requestLogUser,
                        action: 'Status auto-updated',
                        details: `Full payment recorded while status was ${st} — set to Definite.`,
                    },
                ];
            } else if (bumpToDefinite) {
                nextStatus = 'Definite';
                autoLog = [
                    {
                        date: new Date().toISOString(),
                        user: requestLogUser,
                        action: 'Status auto-updated',
                        details: `Deposit posted while status was ${st} — set to Definite.`,
                    },
                ];
            }

            setAccForm({
                ...accForm,
                payments: mergedPayments,
                status: nextStatus,
                logs: [
                    ...accForm.logs,
                    ...autoLog,
                    { date: new Date().toISOString(), user: requestLogUser, action: `Posted payment of ${amount} via ${newPayment.method}` },
                ],
            });
            setShowPaymentModal(false);
            setNewPayment(emptyNewPayment());
            setPaymentSource('method');
            setBalanceMode('full');
        };

        const offsetPayment = async (payment: SyncPayment) => {
            const amt = Number(payment.amount);
            if (!(amt > 0)) return;
            const netPaid = sumPaymentAmounts(accForm.payments);
            if (netPaid < amt) {
                showSystemNotice(
                    'Cannot offset payment',
                    'There is no remaining paid balance to offset for this amount.'
                );
                return;
            }
            if (isBalanceOrClPaymentMethod(payment.method)) {
                const accountId = String(accForm.accountId || '').trim();
                const propertyId = String(activeProperty?.id || '').trim();
                if (!accountId) {
                    showSystemNotice(
                        'Cannot offset payment',
                        'Link an account to this request before offsetting a Balance or CL payment.'
                    );
                    return;
                }
                if (!accForm?.id || !propertyId) {
                    showSystemNotice(
                        'Cannot offset payment',
                        'Save the request and select a property before offsetting Balance or CL payments.'
                    );
                    return;
                }
                try {
                    const { request: patched } = await reverseBalancePaymentOnRequest({
                        request: { ...accForm, payments: accForm.payments },
                        payment,
                        accountId,
                        propertyId,
                        mode: 'offset',
                    });
                    setAccForm({
                        ...accForm,
                        payments: patched.payments || accForm.payments,
                        paymentStatus: String(patched.paymentStatus || accForm.paymentStatus || 'Unpaid'),
                        collectLater: !!patched.collectLater,
                        logs: [
                            ...accForm.logs,
                            {
                                date: new Date().toISOString(),
                                user: requestLogUser,
                                action: `Offset payment of ${amt}`,
                            },
                        ],
                    });
                    mergePatchedRequest(patched);
                    showSystemNotice(
                        'Payment offset',
                        'Balance restored on the linked account.'
                    );
                } catch (e: unknown) {
                    showSystemNotice(
                        'Offset failed',
                        (e instanceof Error && e.message ? e.message : 'Could not reverse the Balance/CL payment on the ledger.')
                    );
                }
                return;
            }
            setAccForm({
                ...accForm,
                payments: [
                    ...accForm.payments,
                    {
                        ...payment,
                        id: Date.now(),
                        amount: -amt,
                        note: `Offset for payment #${payment.id}`,
                    },
                ],
                logs: [
                    ...accForm.logs,
                    {
                        date: new Date().toISOString(),
                        user: requestLogUser,
                        action: `Offset payment of ${amt}`,
                    },
                ],
            });
        };

        const removePaymentLine = (payment: SyncPayment) => {
            if (!payment?.id) return;
            setPendingPaymentRemove({ source: 'form', payment });
        };

        const getRequestDocMeta = (docId: RequestDocId): { name: string; url: string; publicId?: string } | null => {
            const docValue = (accForm as any)?.invoices?.[docId];
            if (!docValue) return null;
            if (typeof docValue === 'string') {
                return { name: docValue, url: docValue };
            }
            if (typeof docValue === 'object') {
                const url = String(docValue.url || docValue.secure_url || '');
                const name = String(docValue.name || docValue.original_filename || url || 'Uploaded file');
                const publicId = String(docValue.publicId || docValue.public_id || '');
                return { name, url, publicId: publicId || undefined };
            }
            return null;
        };

        const clearRequestDoc = async (docId: RequestDocId) => {
            const current = getRequestDocMeta(docId);
            if (current?.publicId) {
                try {
                    await deleteFileLocal(current.publicId);
                } catch {
                    /* keep system cleanup even if file delete fails */
                }
            }
            setAccForm((prev: any) => ({
                ...prev,
                invoices: {
                    ...(prev?.invoices || {}),
                    [docId]: null,
                },
            }));
        };

        const uploadRequestDoc = async (docId: RequestDocId, file: File) => {
            setUploadingDocs((prev) => ({ ...prev, [docId]: true }));
            try {
                const current = getRequestDocMeta(docId);
                if (current?.publicId) {
                    try {
                        await deleteFileLocal(current.publicId);
                    } catch {
                        /* continue with new upload */
                    }
                }
                const uploaded = await uploadFileLocal(file, { folder: 'requests' });
                setAccForm((prev: any) => ({
                    ...prev,
                    invoices: {
                        ...(prev?.invoices || {}),
                        [docId]: {
                            name: file.name,
                            url: uploaded.secure_url,
                            publicId: uploaded.public_id,
                            uploadedAt: new Date().toISOString(),
                        },
                    },
                }));
            } catch (e: unknown) {
                showSystemNotice('Upload failed', e instanceof Error && e.message ? e.message : 'Failed to upload file.');
            } finally {
                setUploadingDocs((prev) => ({ ...prev, [docId]: false }));
            }
        };

        const getFormTitle = () => {
            if (requestType === 'event') return 'Event Request';
            if (requestType === 'event_rooms') return 'Event with Rooms';
            if (requestType === 'series') return 'Series Group Request';
            return 'Accommodation Request';
        };

        const getFormIcon = () => {
            if (requestType === 'event') return Music;
            if (requestType === 'event_rooms') return Box;
            return BedDouble;
        };

        // ponytail: wide enough for SAR 9,999,999.00 in Section 6 4-up cards; was max-w-4xl for rooms/event
        const formMaxWidth = 'max-w-6xl';

        return renderFormLayout({
            title: getFormTitle(),
            icon: getFormIcon(),
            maxWidthClass: formMaxWidth,
            onBack: () => {
                setStep(1);
                setRequestType(null);
            },
            onDiscard: showDiscardNewRequestDraft ? handleDiscardNewRequestDraft : undefined,
            onSave: () => {
                handleSaveRequest(accForm, requestType || 'accommodation');
            },
            children: (
                <>

                {/* Section 1: Basic Information */}
                <div className="p-6 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                        <User size={16} /> Section 1: Basic Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div>
                            <label className="text-xs font-bold opacity-50 block mb-2" style={{ color: colors.textMain }}>REQUEST NAME</label>
                            <input
                                type="text"
                                value={accForm.requestName}
                                onChange={(e) => setAccForm({ ...accForm, requestName: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl border opacity-50 focus:opacity-100 transition-all font-bold"
                                style={{ backgroundColor: 'transparent', borderColor: colors.border, color: colors.textMain }}
                                placeholder="e.g. VIP Delegation"
                            />
                        </div>
                        <div className="relative" ref={accountComboRef}>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Account Name</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                                    <input
                                        className="w-full pl-10 pr-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all"
                                        placeholder="Search Account..."
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={accountSearch || accForm.accountName}
                                        onChange={(e) => {
                                            setAccountSearch(e.target.value);
                                            setShowAccountDropdown(true);
                                        }}
                                        onFocus={() => setShowAccountDropdown(true)}
                                        autoComplete="off"
                                    />
                                    {showAccountDropdown && (
                                        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-2xl z-50 max-h-48 overflow-y-auto custom-scrollbar"
                                            style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                            {accounts.filter((a: any) => String(a.name || '').toLowerCase().includes((accountSearch || '').toLowerCase())).map((acc: any) => (
                                                <button
                                                    key={acc.id}
                                                    type="button"
                                                    className="w-full px-4 py-2 text-left hover:bg-white/5 text-sm transition-colors"
                                                    onClick={() => {
                                                        applyAccountSelectionToDraft(acc);
                                                        setAccountSearch(acc.name);
                                                        setShowAccountDropdown(false);
                                                    }}
                                                >
                                                    {acc.name} <span className="text-[10px] opacity-40 ml-2">({acc.type})</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowAddAccountModal(true)}
                                    className={REQUEST_SECTION_ICON_ADD_BTN_CLASS}
                                    style={requestSectionAddButtonStyle(colors)}
                                    title="Create New Account"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>
                        {accForm.accountId ? (
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Contact Name</label>
                                <div className="flex gap-2">
                                    <select
                                        value={String(accForm.bookerContactId || '')}
                                        onChange={(e) => {
                                            const nextId = String(e.target.value || '');
                                            const selected = selectedDraftAccountContacts.find((c: any) => String(c._id || '') === nextId);
                                            setAccForm((prev: any) => ({
                                                ...prev,
                                                bookerContactId: nextId,
                                                bookerName: selected ? String(selected._label || '') : '',
                                            }));
                                        }}
                                        className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        <option value="">Select contact...</option>
                                        {selectedDraftAccountContacts.map((contact: any) => (
                                            <option key={contact._id} value={contact._id}>{contact._label}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={openAddContactModal}
                                        className={REQUEST_SECTION_ICON_ADD_BTN_CLASS}
                                        style={requestSectionAddButtonStyle(colors)}
                                        title="Add Contact to Account"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        <div>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Received Date</label>
                            <input type="date" value={accForm.receivedDate} onChange={e => setAccForm({ ...accForm, receivedDate: e.target.value })}
                                className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all" style={{ borderColor: colors.border, color: colors.textMain }} />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Confirmation Number</label>
                            <input type="text" value={accForm.confirmationNo} onChange={e => setAccForm({ ...accForm, confirmationNo: e.target.value })}
                                placeholder="Enter Confirmation #"
                                className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all" style={{ borderColor: colors.border, color: colors.textMain }} />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Segment</label>
                            <select
                                value={accForm.segment || ''}
                                onChange={(e) => setAccForm({ ...accForm, segment: e.target.value })}
                                className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all text-sm"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                <option value="">Select segment…</option>
                                {effectiveSegmentOptions.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Request status</label>
                            <select
                                value={accForm.status || 'Inquiry'}
                                onChange={(e) => setAccForm({ ...accForm, status: e.target.value })}
                                className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all text-sm"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                {REQUEST_FORM_STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        {canLinkRequestPromotions && matchingPromotionsForDraft(accForm, requestType || 'accommodation').length > 0 && (
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Promotion</label>
                                <input
                                    type="text"
                                    value={String(matchingPromotionsForDraft(accForm, requestType || 'accommodation').find((p: any) => String(p?.id) === String(accForm.promotionId || ''))?.name || matchingPromotionsForDraft(accForm, requestType || 'accommodation')[0]?.name || '')}
                                    readOnly
                                    className="w-full px-3 py-2 rounded border bg-black/20 outline-none text-sm"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Section 2: Stay and Deadline Date (standard for all request types) */}
                <div className="p-6 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                        <Calendar size={16} /> Section 2: Stay & Deadlines
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {requestType !== 'event' && (
                            <>
                                <div>
                                    <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>
                                        {requestType === 'series'
                                            ? 'Series Start'
                                            : requestType === 'event_rooms'
                                              ? 'Start Date'
                                              : 'Check-in Date'}
                                    </label>
                                    <input type="date" value={accForm.checkIn} onChange={e => syncAccCheckIn(e.target.value)}
                                        className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all" style={{ borderColor: colors.border, color: colors.textMain }} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>
                                        {requestType === 'series'
                                            ? 'Series End'
                                            : requestType === 'event_rooms'
                                              ? 'End Date'
                                              : 'Check-out Date'}
                                    </label>
                                    <input type="date" value={accForm.checkOut} onChange={e => syncAccCheckOut(e.target.value)}
                                        className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all" style={{ borderColor: colors.border, color: colors.textMain }} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>
                                        Total Nights
                                    </label>
                                    <div className="flex items-center gap-2 rounded border bg-black/10 overflow-hidden" style={{ borderColor: colors.border, color: colors.textMain }}>
                                        <Moon size={14} className="opacity-40 shrink-0 ml-3" />
                                        <input
                                            type="number"
                                            min={0}
                                            className="flex-1 min-w-0 py-2 pr-3 bg-transparent outline-none focus:border-primary border-0 font-bold text-sm tabular-nums text-center"
                                            style={{ color: colors.textMain }}
                                            value={
                                                accForm.checkIn && accForm.checkOut
                                                    ? calculateNights(accForm.checkIn, accForm.checkOut)
                                                    : (Number(accForm.nights) > 0 ? accForm.nights : '')
                                            }
                                            onChange={(e) => syncAccNights(Number(e.target.value))}
                                            placeholder="0"
                                        />
                                    </div>
                                    <p className="text-[10px] mt-1 opacity-50" style={{ color: colors.textMuted }}>Edits check-out from check-in + nights.</p>
                                </div>
                            </>
                        )}

                        <div>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Offer Acceptance Deadline</label>
                            <input type="date" value={accForm.offerDeadline} onChange={e => setAccForm({ ...accForm, offerDeadline: e.target.value })}
                                className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all" style={{ borderColor: colors.border, color: colors.textMain }} />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Deposit Deadline</label>
                            <input type="date" value={accForm.depositDeadline} onChange={e => setAccForm({ ...accForm, depositDeadline: e.target.value })}
                                className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all" style={{ borderColor: colors.border, color: colors.textMain }} />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Full Payment Deadline</label>
                            <input type="date" value={accForm.paymentDeadline} onChange={e => setAccForm({ ...accForm, paymentDeadline: e.target.value })}
                                className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all" style={{ borderColor: colors.border, color: colors.textMain }} />
                        </div>
                    </div>
                </div>

                {/* Section 3: Request Details - Hide for Event Only */}
                {requestType !== 'event' && (
                    <div className="p-6 rounded-xl border space-y-3" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex flex-wrap justify-between items-center gap-3">
                            <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                                <BedDouble size={16} /> Section 3: {requestType === 'series' ? 'Group Details' : 'Room Request Details'}
                            </h3>
                            <button
                                type="button"
                                onClick={addRoom}
                                className={REQUEST_SECTION_ADD_BTN_LG_CLASS}
                                style={requestSectionAddButtonStyle(colors)}
                            >
                                <Plus size={16} /> {requestType === 'series' ? 'Add Group' : 'Add Room'}
                            </button>
                        </div>

                        <div className="space-y-2">
                            {roomGridLikeSeries ? (
                                <div className="grid grid-cols-12 gap-2 sm:gap-3 px-2 sm:px-4 py-1.5 opacity-40 text-[10px] font-bold uppercase items-end">
                                    <div className="col-span-2 min-w-0">
                                        {requestType === 'event_rooms' ? 'Start Date' : 'Arrival'}
                                    </div>
                                    <div className="col-span-2 min-w-0">
                                        {requestType === 'event_rooms' ? 'End Date' : 'Departure'}
                                    </div>
                                    <div className="col-span-1 text-center">Nts</div>
                                    <div className="col-span-1 min-w-0">Room</div>
                                    <div className="col-span-1 text-center min-w-0">Meal</div>
                                    <div className="col-span-1 min-w-0">Occ</div>
                                    <div className="col-span-1 text-center">Qty</div>
                                    <div className="col-span-2 min-w-0 text-right">Rate</div>
                                    <div className="col-span-1 shrink-0" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-12 gap-3 px-3 py-1.5 opacity-40 text-[10px] font-bold uppercase">
                                    <div className="col-span-2 min-w-0">Room Type</div>
                                    <div className="col-span-1 text-center min-w-0">Meal</div>
                                    <div className="col-span-2 min-w-0">Occupancy</div>
                                    <div className="col-span-2 text-center">Qty</div>
                                    <div className="col-span-4 text-right">Rate / Night</div>
                                    <div className="col-span-1" />
                                </div>
                            )}

                            {accForm.rooms.map((room) => (
                                <div key={room.id} className="grid grid-cols-12 gap-2 sm:gap-3 items-center p-2 rounded-lg bg-black/10 border border-white/5 hover:border-white/10 transition-all group">
                                    {roomGridLikeSeries && (
                                        <>
                                            <div className="col-span-2 min-w-0">
                                                <input
                                                    type="date"
                                                    className="w-full min-w-[9rem] max-w-full box-border px-2 py-1 text-[11px] leading-tight rounded bg-black/20 border border-transparent focus:border-primary outline-none"
                                                    value={(room as any).arrival}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        const n = Math.max(0, Math.floor(Number((room as any).nights) || 0));
                                                        const dep = String((room as any).departure || '').slice(0, 10);
                                                        if (v && n > 0) {
                                                            patchRoom(room.id, { arrival: v, departure: addCalendarDaysIso(v, n) });
                                                        } else if (v && dep) {
                                                            patchRoom(room.id, { arrival: v, nights: calculateNights(v, dep) });
                                                        } else {
                                                            patchRoom(room.id, { arrival: v });
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div className="col-span-2 min-w-0">
                                                <input
                                                    type="date"
                                                    className="w-full min-w-[9rem] max-w-full box-border px-2 py-1 text-[11px] leading-tight rounded bg-black/20 border border-transparent focus:border-primary outline-none"
                                                    value={(room as any).departure}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        const a = String((room as any).arrival || '').slice(0, 10);
                                                        const patch: any = { departure: v };
                                                        if (a && v) patch.nights = calculateNights(a, v);
                                                        patchRoom(room.id, patch);
                                                    }}
                                                />
                                            </div>
                                            <div className="col-span-1 min-w-0">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    className="w-full min-w-0 py-1 px-1 text-[11px] rounded bg-black/20 border border-transparent focus:border-primary outline-none text-center font-bold tabular-nums"
                                                    value={(() => {
                                                        const ra = String((room as any).arrival || '').slice(0, 10);
                                                        const rd = String((room as any).departure || '').slice(0, 10);
                                                        if (ra && rd) return calculateNights(ra, rd);
                                                        return Number((room as any).nights) > 0 ? (room as any).nights : '';
                                                    })()}
                                                    onChange={(e) => {
                                                        const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                                        const a = String((room as any).arrival || '').slice(0, 10);
                                                        if (a && n > 0) {
                                                            patchRoom(room.id, { nights: n, departure: addCalendarDaysIso(a, n) });
                                                        } else {
                                                            patchRoom(room.id, { nights: n });
                                                        }
                                                    }}
                                                    title="Nights (updates departure from arrival + nights)"
                                                />
                                            </div>
                                        </>
                                    )}
                                    <div className={roomGridLikeSeries ? "col-span-1 min-w-0" : "col-span-2 min-w-0"}>
                                        <select className="w-full min-w-0 py-1.5 px-1 text-[11px] rounded bg-black/20 border border-transparent focus:border-primary outline-none transition-all truncate"
                                            title={room.type}
                                            value={room.type || ''}
                                            onChange={e => updateRoom(room.id, 'type', e.target.value)}
                                        >
                                            {roomTypeSelectOptions.length === 0 ? (
                                                <option value="">
                                                    {primaryPropertyRoomType ? primaryPropertyRoomType : '— Add room types in Property Settings —'}
                                                </option>
                                            ) : null}
                                            {roomTypeSelectOptions.map((name) => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-span-1 min-w-0">
                                        {(() => {
                                            const rowMeal =
                                                String((room as any).mealPlan ?? accForm.mealPlan ?? 'RO').trim() || 'RO';
                                            return (
                                        <select
                                            value={rowMeal}
                                            onChange={(e) => updateRoom(room.id, 'mealPlan', e.target.value)}
                                            className="w-full min-w-0 py-1.5 px-0.5 text-[11px] font-mono font-bold text-center rounded bg-black/20 border border-transparent focus:border-primary outline-none transition-all"
                                            title={
                                                mealPlansForProperty.find((m) => m.code === rowMeal)?.name ||
                                                rowMeal ||
                                                'Meal plan'
                                            }
                                        >
                                            {mealPlansForProperty.map((m) => (
                                                <option key={m.id} value={m.code}>{m.code}</option>
                                            ))}
                                            {rowMeal && !mealPlansForProperty.some((mm) => mm.code === rowMeal) ? (
                                                <option value={rowMeal}>{rowMeal}</option>
                                            ) : null}
                                        </select>
                                            );
                                        })()}
                                    </div>
                                    <div className={roomGridLikeSeries ? "col-span-1 min-w-0" : "col-span-2 min-w-0"}>
                                        <select className="w-full min-w-0 py-1.5 px-1 text-[11px] rounded bg-black/20 border border-transparent focus:border-primary outline-none transition-all"
                                            value={room.occupancy} onChange={e => updateRoom(room.id, 'occupancy', e.target.value)}>
                                            {occupancySelectOptions.map((o) => (
                                                <option key={o} value={o}>{o}</option>
                                            ))}
                                            {String(room.occupancy || '').trim() &&
                                            !occupancySelectOptions.includes(String(room.occupancy)) ? (
                                                <option value={String(room.occupancy)}>{String(room.occupancy)}</option>
                                            ) : null}
                                        </select>
                                    </div>
                                    <div className={roomGridLikeSeries ? "col-span-1 min-w-0" : "col-span-2 min-w-0"}>
                                        <input type="number" className="w-full min-w-0 py-1.5 px-1 text-[11px] rounded bg-black/20 border border-transparent focus:border-primary outline-none text-center"
                                            value={room.count} onChange={e => updateRoom(room.id, 'count', Number(e.target.value))} />
                                    </div>
                                    <div className={roomGridLikeSeries ? "col-span-2 min-w-0" : "col-span-4 min-w-0"}>
                                        <div className={`relative min-w-0 w-full max-w-[11rem] ${roomGridLikeSeries ? 'mx-auto' : 'mx-auto sm:ml-auto sm:mr-0'}`}>
                                            <input type="number" className="w-full min-w-0 py-1.5 px-2 text-[11px] rounded bg-black/20 border border-transparent focus:border-primary outline-none text-center font-mono tabular-nums"
                                                value={room.rate} onChange={e => updateRoom(room.id, 'rate', Number(e.target.value))} />
                                        </div>
                                    </div>
                                    <div className="col-span-1 flex justify-center shrink-0">
                                        <button onClick={() => deleteRoom(room.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors opacity-0 group-hover:opacity-100">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Section 4: Transportation Arrangements */}
                <div className="p-6 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                            <Car size={16} /> Section 4: Transportation
                        </h3>
                        <button
                            type="button"
                            onClick={addTrip}
                            className={REQUEST_SECTION_ADD_BTN_CLASS}
                            style={requestSectionAddButtonStyle(colors)}
                        >
                            <Plus size={14} /> Add Trip
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div className="grid grid-cols-12 gap-4 px-4 py-2 opacity-40 text-[10px] font-bold uppercase">
                            <div className="col-span-3">Vehicle Type</div>
                            <div className="col-span-2 text-center">Pax</div>
                            <div className="col-span-2 text-right">Cost / Way</div>
                            <div className="col-span-2">Timing</div>
                            <div className="col-span-2">Notes</div>
                            <div className="col-span-1"></div>
                        </div>
                        {accForm.transportation.map((trip) => (
                            <div key={trip.id} className="grid grid-cols-12 gap-4 items-center p-3 rounded-lg bg-black/10 border border-white/5 hover:border-white/10 transition-all group">
                                <div className="col-span-3">
                                    <select className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none"
                                        value={trip.type} onChange={e => updateTrip(trip.id, 'type', e.target.value)}>
                                        <option>Sedan</option><option>SUV</option><option>Luxury</option><option>Mini Bus</option><option>Coach</option>
                                    </select>
                                </div>
                                <div className="col-span-2 text-center">
                                    <input type="number" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none text-center"
                                        value={trip.pax} onChange={e => updateTrip(trip.id, 'pax', Number(e.target.value))} />
                                </div>
                                <div className="col-span-2">
                                    <input type="number" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none text-right font-mono"
                                        value={trip.costPerWay} onChange={e => updateTrip(trip.id, 'costPerWay', Number(e.target.value))} />
                                </div>
                                <div className="col-span-2">
                                    <input type="text" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none" placeholder="e.g. 14:00"
                                        value={trip.timing} onChange={e => updateTrip(trip.id, 'timing', e.target.value)} />
                                </div>
                                <div className="col-span-2">
                                    <input type="text" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent focus:border-primary outline-none" placeholder="..."
                                        value={trip.notes} onChange={e => updateTrip(trip.id, 'notes', e.target.value)} />
                                </div>
                                <div className="col-span-1 flex justify-center">
                                    <button onClick={() => deleteTrip(trip.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors opacity-0 group-hover:opacity-100">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Additional Section for Event/Series flows */}
                {(requestType === 'event' || requestType === 'event_rooms') && (
                    <div className="p-6 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                                <Users size={16} /> Section 5: Event Agenda
                            </h3>
                            <div className="flex items-center gap-3">
                                {(requestType === 'event' || requestType === 'event_rooms') && (
                                    <div className="px-3 py-2 rounded border bg-black/10 font-bold flex items-center gap-2 text-xs" style={{ borderColor: colors.border, color: colors.textMain }}>
                                        <Moon size={14} className="opacity-50" /> {eventAgendaSpanDays || 0} Day(s)
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={addAgendaRow}
                                    className={REQUEST_SECTION_ADD_BTN_LG_CLASS}
                                    style={requestSectionAddButtonStyle(colors)}
                                >
                                    <Plus size={16} /> Add Agenda Row
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {(accForm.agenda || []).map((row: any) => (
                                <div key={row.id} className="p-5 rounded-2xl bg-black/20 border border-white/5 space-y-5 relative group overflow-hidden">
                                    <button onClick={() => deleteAgendaRow(row.id)} className="absolute top-4 right-4 p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-all">
                                        <Trash2 size={16} />
                                    </button>

                                    <div className={`grid grid-cols-1 gap-4 ${row.combined ? 'md:grid-cols-5' : 'md:grid-cols-6'}`}>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Start Date</label>
                                            <input
                                                type="date"
                                                value={row.startDate}
                                                onChange={(e) => onAgendaStartDateChange(row, e.target.value)}
                                                className="w-full px-3 py-2 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Days</label>
                                            <input
                                                type="number"
                                                min={1}
                                                className="w-full px-3 py-2 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold text-center tabular-nums"
                                                value={
                                                    row.startDate && row.endDate
                                                        ? inclusiveCalendarDays(
                                                              String(row.startDate).slice(0, 10),
                                                              String(row.endDate).slice(0, 10)
                                                          )
                                                        : ''
                                                }
                                                onChange={(e) => onAgendaInclusiveDaysChange(row, e.target.value)}
                                                title="Inclusive calendar days (sets end date from start)"
                                                placeholder="—"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">End Date</label>
                                            <input
                                                type="date"
                                                value={row.endDate}
                                                onChange={(e) => onAgendaEndDateChange(row, e.target.value)}
                                                className="w-full px-3 py-2 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold"
                                            />
                                        </div>
                                        {!row.combined ? (
                                            <div>
                                                <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Meeting Room</label>
                                                <select value={row.venue} onChange={e => updateAgendaRow(row.id, 'venue', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold">
                                                    <option value="">Select meeting room</option>
                                                    {venueOptions.map((v: any) => <option key={v.id || v.name} value={v.name}>{v.name}</option>)}
                                                </select>
                                            </div>
                                        ) : null}
                                        <div className="flex flex-col justify-end pb-0.5">
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Combined</label>
                                            <label className="flex items-center gap-2 cursor-pointer select-none rounded-xl border-2 border-transparent px-3 py-2 bg-black/20 hover:border-primary/40 transition-all">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-white/20"
                                                    checked={Boolean(row.combined)}
                                                    disabled={readOnlyOperational}
                                                    onChange={(e) => {
                                                        const on = e.target.checked;
                                                        patchAgendaRow(
                                                            row.id,
                                                            on ? { combined: true, venue: '' } : { combined: false, combinedVenueNames: [] }
                                                        );
                                                    }}
                                                />
                                                <span className="text-xs font-bold" style={{ color: colors.textMain }}>Combined</span>
                                            </label>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Setup Style (Shape)</label>
                                            <select value={row.shape} onChange={e => updateAgendaRow(row.id, 'shape', e.target.value)}
                                                className="w-full px-3 py-2 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold">
                                                <option>Theater</option><option>Classroom</option><option>U-Shape</option><option>Banquet</option><option>Boardroom</option>
                                            </select>
                                        </div>
                                    </div>

                                    {row.combined ? (
                                        <div
                                            className="rounded-2xl border border-white/10 bg-black/15 p-4 space-y-3"
                                            style={{ borderColor: colors.border }}
                                        >
                                            <p className="text-[10px] font-black uppercase opacity-50 tracking-wider" style={{ color: colors.textMuted }}>
                                                Combined meeting rooms for this session
                                            </p>
                                            {combinedVenueOptions.length > 0 ? (
                                                <div className="flex flex-wrap gap-x-5 gap-y-2">
                                                    {combinedVenueOptions.map((v: any) => {
                                                        const name = String(v.name || '');
                                                        const selected = (Array.isArray(row.combinedVenueNames) ? row.combinedVenueNames : []).includes(name);
                                                        return (
                                                            <label
                                                                key={v.id || name}
                                                                className={`flex items-center gap-2 text-sm font-medium cursor-pointer select-none ${readOnlyOperational ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                                style={{ color: colors.textMain }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    className="rounded border-white/20"
                                                                    checked={selected}
                                                                    disabled={readOnlyOperational}
                                                                    onChange={() => toggleAgendaCombinedVenue(row.id, name)}
                                                                />
                                                                <span>{name}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-xs leading-relaxed opacity-60" style={{ color: colors.textMuted }}>
                                                    No venues are marked as combined yet. In Property Settings → Venues, edit a meeting room and enable “Combined” for halls that can be joined for one booking.
                                                </p>
                                            )}
                                        </div>
                                    ) : null}

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Start Time</label>
                                            <input type="time" value={row.startTime} onChange={e => updateAgendaRow(row.id, 'startTime', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">End Time</label>
                                            <input type="time" value={row.endTime} onChange={e => updateAgendaRow(row.id, 'endTime', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                                        <div className="relative">
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Rate / Person</label>
                                            <input type="number" value={row.rate} onChange={e => updateAgendaRow(row.id, 'rate', Number(e.target.value))}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold text-emerald-500" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Total Persons (Pax)</label>
                                            <input type="number" value={row.pax} onChange={e => updateAgendaRow(row.id, 'pax', Number(e.target.value))}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Rental Fees</label>
                                            <input type="number" value={row.rental} onChange={e => updateAgendaRow(row.id, 'rental', Number(e.target.value))}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold text-amber-500" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Package</label>
                                            <select value={row.package} onChange={e => updateAgendaRow(row.id, 'package', e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold">
                                                {eventPackagesForProperty.map((p) => (
                                                    <option key={p.id} value={p.name}>{p.name} ({p.code})</option>
                                                ))}
                                                {row.package && !eventPackagesForProperty.some((p) => p.name === row.package) ? (
                                                    <option value={row.package}>{row.package} (saved)</option>
                                                ) : null}
                                            </select>
                                        </div>
                                    </div>

                                    {getAgendaTimingSlotsForPackageName(String(row.package || ''), eventPackagesForProperty).length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                            {getAgendaTimingSlotsForPackageName(String(row.package || ''), eventPackagesForProperty).map((slot) => (
                                                <div key={slot.field}>
                                                    <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">{slot.label}</label>
                                                    <input
                                                        type="time"
                                                        value={String(row[slot.field] ?? '')}
                                                        onChange={(e) => updateAgendaRow(row.id, slot.field, e.target.value)}
                                                        className="w-full px-4 py-2.5 rounded-xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm font-bold"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}

                                    <div>
                                        <label className="text-[10px] font-black uppercase opacity-40 mb-1.5 block">Row Notes</label>
                                        <textarea value={row.notes} onChange={e => updateAgendaRow(row.id, 'notes', e.target.value)}
                                            placeholder="Specific setup requirements or catering notes for this session..."
                                            className="w-full px-5 py-3 rounded-2xl bg-black/20 border-2 border-transparent focus:border-primary outline-none transition-all text-sm h-20 resize-none font-medium" />
                                    </div>
                                </div>
                            ))}

                            {(!accForm.agenda || accForm.agenda.length === 0) && (
                                <div className="py-12 border-2 border-dashed border-white/5 rounded-3xl text-center opacity-30 italic text-sm">
                                    No agenda rows added yet. Click "Add Agenda Row" to begin.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Section 5: Documents & Note */}
                <div className="p-6 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: colors.primary }}>
                        <FileText size={16} /> Section 5: Documents & Notes
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            {[
                                { id: 'inv1', label: 'Invoice 1 Attached' },
                                { id: 'inv2', label: 'Invoice 2 Attached' },
                                { id: 'inv3', label: 'Invoice 3 Attached' },
                                { id: 'agreement', label: 'Agreement Attached' }
                            ].map((doc) => {
                                const docId = doc.id as RequestDocId;
                                const docMeta = getRequestDocMeta(docId);
                                const isUploading = !!uploadingDocs[docId];
                                return (
                                <div key={doc.id} className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold uppercase opacity-50 px-1">{doc.label}</label>
                                    <div className="group relative">
                                        <input
                                            type="file"
                                            className="hidden"
                                            id={`file-${doc.id}`}
                                            onChange={(e) => {
                                                const picked = e.target.files?.[0];
                                                if (picked) void uploadRequestDoc(docId, picked);
                                                e.target.value = '';
                                            }}
                                        />
                                        <label htmlFor={`file-${doc.id}`}
                                            className={`w-full px-4 py-2 rounded-lg border border-dashed border-white/20 bg-black/5 hover:bg-white/5 hover:border-primary/50 transition-all flex items-center justify-center gap-2 text-xs font-medium ${isUploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                            <Box size={14} className="opacity-40" /> {isUploading ? 'Uploading...' : 'Choose File / Drag here'}
                                        </label>
                                    </div>
                                    {docMeta ? (
                                        <div className="rounded-lg border px-2 py-1 text-[10px] space-y-1.5" style={{ borderColor: colors.border }}>
                                            <p className="truncate" style={{ color: colors.textMain }}>
                                                {docMeta.name}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={mediaUrl(docMeta.url) || '#'}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="px-2 py-0.5 rounded border"
                                                    style={{ borderColor: colors.primary, color: colors.primary }}
                                                >
                                                    Open
                                                </a>
                                                {!readOnlyOperational && (
                                                    <button
                                                        type="button"
                                                    onClick={() => void clearRequestDoc(docId)}
                                                        className="px-2 py-0.5 rounded border"
                                                        style={{ borderColor: colors.border, color: colors.textMuted }}
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )})}
                        </div>
                        <div className="flex flex-col h-full">
                            <label className="text-[10px] font-bold uppercase opacity-50 px-1 mb-1.5">Additional Note</label>
                            <textarea
                                className="flex-1 w-full p-4 rounded-xl border bg-black/20 outline-none focus:border-primary transition-all resize-none text-sm"
                                placeholder="Type any special requests or notes here..."
                                style={{ borderColor: colors.border, color: colors.textMain }}
                                value={accForm.note}
                                onChange={e => setAccForm({ ...accForm, note: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                {/* Section 6: Statistics & Payments */}
                <div className="p-8 rounded-2xl border-2 space-y-8 relative overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.primary + '40' }}>
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Calculator size={150} color={colors.primary} />
                    </div>

                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold flex items-center gap-2 mb-1" style={{ color: colors.textMain }}>
                                <Calculator size={20} className="text-primary" /> Section 6: Statistics & Financials
                            </h3>
                            <p className="text-xs opacity-50" style={{ color: colors.textMuted }}>Automated calculations based on request details</p>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black uppercase opacity-50 tracking-widest mb-1">Current Status</span>
                            {(accForm.collectLater || accForm.paymentStatus === 'CL') ? (
                                <div className="px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2"
                                    style={{
                                        backgroundColor: colors.red + '20',
                                        borderColor: colors.red,
                                        color: colors.red,
                                    }}>
                                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'currentColor' }} />
                                    CL · Collect Later
                                </div>
                            ) : (
                            <div className="px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2"
                                style={{
                                    backgroundColor: fin.paymentStatus === 'Paid' ? colors.green + '20' : (fin.paymentStatus === 'Partially Paid' || fin.paymentStatus === 'Deposit') ? colors.yellow + '20' : colors.red + '20',
                                    borderColor: fin.paymentStatus === 'Paid' ? colors.green : (fin.paymentStatus === 'Partially Paid' || fin.paymentStatus === 'Deposit') ? colors.yellow : colors.red,
                                    color: fin.paymentStatus === 'Paid' ? colors.green : (fin.paymentStatus === 'Partially Paid' || fin.paymentStatus === 'Deposit') ? colors.yellow : colors.red
                                }}>
                                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'currentColor' }} />
                                {fin.paymentStatus === 'Deposit' ? 'Partial / deposit' : fin.paymentStatus}
                            </div>
                            )}
                        </div>
                    </div>

                    {requestType === 'event_rooms' ? (
                        <>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8">
                                <div className="space-y-4 p-5 sm:p-6 rounded-xl border bg-black/5 min-w-0" style={{ borderColor: colors.border }}>
                                    <h4 className="text-xs font-black uppercase opacity-50 tracking-widest">Accommodation</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">ADR (Avg Daily Rate)</p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: colors.textMain }}>{formatMoney(fin.adr)}</p>
                                        </div>
                                        <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Total Room Nights</p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>{fin.totalRoomNights}</p>
                                        </div>
                                        <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Total Rooms</p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>{fin.totalRooms}</p>
                                        </div>
                                        <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Rooms (Incl. Tax)</p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: colors.primary }}>{formatMoney(fin.roomsCostWithTax)}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4 p-5 sm:p-6 rounded-xl border bg-black/5 min-w-0" style={{ borderColor: colors.border }}>
                                    <h4 className="text-xs font-black uppercase opacity-50 tracking-widest">Event</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">DDR (Per Person)</p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: colors.textMain }}>{formatMoney(fin.ddr)}</p>
                                        </div>
                                        <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Cost Per Day (Incl. Tax)</p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: colors.textMain }}>{formatMoney(eventCostPerDayForm)}</p>
                                        </div>
                                        <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Total Days</p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>{fin.totalEventDays || eventDayDenomForm}</p>
                                        </div>
                                        <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Total Attendees</p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>{fin.totalEventAttendeeDays ?? fin.totalEventPax}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                    <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Paid Amount</p>
                                    <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: (accForm.collectLater || accForm.paymentStatus === 'CL') ? colors.red : colors.green }}>{formatMoney(fin.paidAmount)}</p>
                                </div>
                                <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                    <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Remaining Balance</p>
                                    <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: remainingBalanceForm > 0 ? '#f87171' : colors.green }}>
                                        {formatMoney(remainingBalanceForm)}
                                    </p>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                            <div className="p-4 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                <p className="text-[10px] font-bold uppercase opacity-40 mb-1">
                                    {requestType === 'event' ? 'DDR (Daily Delegate Rate)' : 'ADR (Avg Daily Rate)'}
                                </p>
                                <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: colors.textMain }}>
                                    {formatMoney(requestType === 'event' ? fin.ddr : fin.adr)}
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                <p className="text-[10px] font-bold uppercase opacity-40 mb-1">
                                    {requestType === 'event' ? 'Total attendees' : 'Total Room Nights'}
                                </p>
                                <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>
                                    {requestType === 'event' ? (fin.totalEventAttendeeDays ?? fin.totalEventPax) : fin.totalRoomNights}
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                <p className="text-[10px] font-bold uppercase opacity-40 mb-1">
                                    {requestType === 'event' ? 'Total Days' : 'Total Rooms'}
                                </p>
                                <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>
                                    {requestType === 'event' ? fin.totalEventDays : fin.totalRooms}
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Paid Amount</p>
                                <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: (accForm.collectLater || accForm.paymentStatus === 'CL') ? colors.red : colors.green }}>{formatMoney(fin.paidAmount)}</p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-white/5">
                        <div className="space-y-4">
                            <h4 className="text-xs font-black uppercase opacity-30 tracking-widest pl-2">Cost Breakdown</h4>
                            {requestType === 'event_rooms' ? (
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <h5 className="text-[10px] font-black uppercase opacity-40 tracking-wider">Accommodation</h5>
                                        <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                            <span className="text-sm opacity-60 shrink-0">Rooms Cost (Before Tax)</span>
                                            <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.roomsCostNoTax)}</span>
                                        </div>
                                        <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                            <span className="text-sm opacity-60 shrink-0">Rooms Cost (Incl. Tax)</span>
                                            <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.roomsCostWithTax)}</span>
                                        </div>
                                        <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                            <span className="text-sm opacity-60 shrink-0">Transportation (Before Tax)</span>
                                            <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.transCostNoTax)}</span>
                                        </div>
                                        <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                            <span className="text-sm opacity-60 shrink-0">Transportation (Incl. Tax)</span>
                                            <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.transCostWithTax)}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <h5 className="text-[10px] font-black uppercase opacity-40 tracking-wider">Event</h5>
                                        <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                            <span className="text-sm opacity-60 shrink-0">Event Cost (Before Tax)</span>
                                            <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.eventCostNoTax)}</span>
                                        </div>
                                        <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                            <span className="text-sm opacity-60 shrink-0">Event Cost (Incl. Tax)</span>
                                            <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.eventCostWithTax)}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                            <div className="space-y-3">
                                {requestType !== 'event' && (
                                    <>
                                        <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                            <span className="text-sm opacity-60 shrink-0">Rooms Cost (Before Tax)</span>
                                            <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.roomsCostNoTax)}</span>
                                        </div>
                                        <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                            <span className="text-sm opacity-60 shrink-0">Rooms Cost (Incl. 15% Tax)</span>
                                            <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.roomsCostWithTax)}</span>
                                        </div>
                                    </>
                                )}
                                <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                    <span className="text-sm opacity-60 shrink-0">Transportation (Before Tax)</span>
                                    <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.transCostNoTax)}</span>
                                </div>
                                <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                    <span className="text-sm opacity-60 shrink-0">Transportation (Incl. 15% Tax)</span>
                                    <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.transCostWithTax)}</span>
                                </div>
                                <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                    <span className="text-sm opacity-60 shrink-0">Event Cost (Before Tax)</span>
                                    <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.eventCostNoTax)}</span>
                                </div>
                                <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                    <span className="text-sm opacity-60 shrink-0">Event Cost (Incl. 15% Tax)</span>
                                    <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.eventCostWithTax)}</span>
                                </div>
                            </div>
                            )}
                        </div>

                        <div className="flex flex-col justify-end gap-6 min-w-0">
                            <div className="p-6 rounded-2xl bg-primary/5 border border-primary/20 min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Grand Total Amount (Before Tax)</p>
                                <p className="text-xl sm:text-2xl font-mono font-bold opacity-60 leading-snug break-words">{formatMoney(fin.grandTotalNoTax)}</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-primary/10 border-2 border-primary/30 shadow-xl shadow-primary/5 min-w-0">
                                <p className="text-xs font-black uppercase tracking-widest text-primary mb-1">Grand Total Amount (Including Tax)</p>
                                <p className="text-2xl sm:text-3xl lg:text-4xl font-mono font-black leading-snug break-words" style={{ color: colors.textMain }}>{formatMoney(fin.grandTotalWithTax)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Payments record */}
                    <div className="pt-8 border-t border-white/5 space-y-4">
                        <div className="flex justify-between items-center">
                            <h4 className="text-xs font-black uppercase opacity-30 tracking-widest pl-2">Payment Records</h4>
                            <button onClick={() => {
                                setNewPayment(emptyNewPayment());
                                setPaymentSource('method');
                                setBalanceMode('full');
                                setPaymentModalSource('form');
                                setShowPaymentModal(true);
                            }}
                                className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-bold flex items-center gap-2 hover:bg-emerald-500/20 hover:scale-105 transition-all active:scale-95 shadow-lg shadow-emerald-500/10">
                                <Plus size={16} /> Add Deposit
                            </button>
                        </div>
                        <div className="bg-black/10 rounded-xl overflow-hidden border border-white/5">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/30">
                                        <th className="px-4 py-3 text-left">Date</th>
                                        <th className="px-4 py-3 text-left">Method</th>
                                        <th className="px-4 py-3 text-left">Notes</th>
                                        <th className="px-4 py-3 text-right">Amount</th>
                                        <th className="px-4 py-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accForm.payments.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-8 text-center opacity-20 italic">No payments recorded yet.</td>
                                        </tr>
                                    ) : (() => {
                                        const clOpen = !!(accForm.collectLater || accForm.paymentStatus === 'CL');
                                        return accForm.payments.map((p, idx) => (
                                            <tr key={p.id ?? `pay-${idx}`} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                                <td className="px-4 py-3 opacity-60">{p.date}</td>
                                                <td className="px-4 py-3 font-bold" style={{ color: isClPaymentMethod(p.method) && clOpen ? colors.red : undefined }}>{p.method}</td>
                                                <td className="px-4 py-3 opacity-60">{p.note || '-'}</td>
                                                <td
                                                    className="px-4 py-3 text-right font-mono font-bold"
                                                    style={{
                                                        color:
                                                            p.amount < 0 || (isClPaymentMethod(p.method) && clOpen)
                                                                ? colors.red
                                                                : colors.green,
                                                    }}
                                                >
                                                    {formatMoney(p.amount, 0)}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {p.amount > 0 && (
                                                            <button type="button" onClick={() => offsetPayment(p)} className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-md transition-all group relative" title="Offset payment">
                                                                <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                                                            </button>
                                                        )}
                                                        {canDeletePayments && (
                                                            <button
                                                                type="button"
                                                                onClick={() => removePaymentLine(p)}
                                                                className="p-1.5 hover:bg-red-500/15 text-red-500 rounded-md transition-all"
                                                                title="Delete payment line"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Floating Logs Button */}
                <div className="flex justify-center pt-8">
                    <button onClick={() => setShowLogs(!showLogs)}
                        className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-30 hover:opacity-100 hover:text-primary transition-all">
                        <Clock size={14} /> {showLogs ? 'Hide Activities' : 'View Activities (History)'}
                    </button>
                </div>

                {showLogs && (
                    <div className="mt-6">
                        {renderActivities(accForm.logs)}
                    </div>
                )}


                </>
            )
        });
    };

    const renderEventForm = () => {
        const fin = calculateEvtFinancials();

        return renderFormLayout({
            title: "New Event Request",
            icon: Music,
            onBack: () => { setStep(1); setRequestType(null); },
            onDiscard: showDiscardNewRequestDraft ? handleDiscardNewRequestDraft : undefined,
            onSave: () => { handleSaveRequest(evtForm, 'event'); },
            children: (
                <>
                {/* Basic Info */}
                <div className="p-6 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <h3 className="font-bold text-sm uppercase tracking-wider mb-4" style={{ color: colors.textMuted }}>Basic Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div>
                            <label className="text-xs font-bold opacity-50 block mb-2" style={{ color: colors.textMain }}>REQUEST NAME</label>
                            <input
                                type="text"
                                value={evtForm.requestName}
                                onChange={(e) => setEvtForm({ ...evtForm, requestName: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl border opacity-50 focus:opacity-100 transition-all font-bold"
                                style={{ backgroundColor: 'transparent', borderColor: colors.border, color: colors.textMain }}
                                placeholder="e.g. Annual Gala"
                            />
                        </div>
                        <div className="relative" ref={accountComboRef}>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Account / Lead</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                                    <input
                                        className="w-full pl-10 pr-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all"
                                        placeholder="Search Account..."
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={accountSearch || evtForm.leadId || ''}
                                        onChange={(e) => {
                                            setAccountSearch(e.target.value);
                                            setShowAccountDropdown(true);
                                        }}
                                        onFocus={() => setShowAccountDropdown(true)}
                                        autoComplete="off"
                                    />
                                    {showAccountDropdown && (
                                        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-2xl z-50 max-h-48 overflow-y-auto custom-scrollbar"
                                            style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                            {accounts.filter((a: any) => String(a.name || '').toLowerCase().includes((accountSearch || '').toLowerCase())).map((acc: any) => (
                                                <button
                                                    key={acc.id}
                                                    type="button"
                                                    className="w-full px-4 py-2 text-left hover:bg-white/5 text-sm transition-colors"
                                                    onClick={() => {
                                                        const contacts = getAccountContacts(acc);
                                                        const first = contacts[0];
                                                        setEvtForm({
                                                            ...evtForm,
                                                            leadId: acc.name,
                                                            accountId: acc.id,
                                                            bookerContactId: String(first?._id || ''),
                                                            bookerName: String(first?._label || ''),
                                                        });
                                                        setAccountSearch(acc.name);
                                                        setShowAccountDropdown(false);
                                                    }}
                                                >
                                                    {acc.name} <span className="text-[10px] opacity-40 ml-2">({acc.type})</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowAddAccountModal(true)}
                                    className={REQUEST_SECTION_ICON_ADD_BTN_CLASS}
                                    style={requestSectionAddButtonStyle(colors)}
                                    title="Create New Account"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Event Date</label>
                            <input type="date" value={evtForm.requestDate} onChange={e => setEvtForm({ ...evtForm, requestDate: e.target.value })}
                                className="w-full px-3 py-2 rounded border bg-black/20 outline-none" style={{ borderColor: colors.border, color: colors.textMain }} />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Segment</label>
                            <select
                                value={evtForm.segment || ''}
                                onChange={(e) => setEvtForm({ ...evtForm, segment: e.target.value })}
                                className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all text-sm"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                <option value="">Select segment…</option>
                                {effectiveSegmentOptions.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Request status</label>
                            <select
                                value={evtForm.status || 'Inquiry'}
                                onChange={(e) => setEvtForm({ ...evtForm, status: e.target.value })}
                                className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all text-sm"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                {REQUEST_FORM_STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        {canLinkRequestPromotions && matchingPromotionsForDraft(evtForm, 'event').length > 0 && (
                            <div>
                                <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>Promotion</label>
                                <input
                                    type="text"
                                    value={String(matchingPromotionsForDraft(evtForm, 'event').find((p: any) => String(p?.id) === String(evtForm.promotionId || ''))?.name || matchingPromotionsForDraft(evtForm, 'event')[0]?.name || '')}
                                    readOnly
                                    className="w-full px-3 py-2 rounded border bg-black/20 outline-none text-sm"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Agenda */}
                <div className="p-6 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: colors.textMuted }}>Event Agenda & Venues</h3>
                        <button onClick={() => setEvtForm({ ...evtForm, agenda: [...evtForm.agenda, { ...initialEvent.agenda[0], id: Date.now() }] })}
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors" style={{ color: colors.primary }}>
                            <Plus size={12} /> Add Session
                        </button>
                    </div>
                    <div className="space-y-4">
                        {evtForm.agenda.map((item, idx) => (
                            <div key={item.id} className="p-4 rounded bg-black/5 border border-transparent hover:border-white/10 transition-colors">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                    <div>
                                        <label className="text-[10px] font-bold uppercase opacity-50 block mb-1">Time</label>
                                        <div className="flex gap-2">
                                            <input type="time" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent outline-none" />
                                            <input type="time" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent outline-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase opacity-50 block mb-1">Venue</label>
                                        <select className="w-full p-2 text-sm rounded bg-black/20 border border-transparent outline-none">
                                            <option value="">Select meeting room</option>
                                            {venueOptions.map((v: any) => <option key={v.id || v.name} value={v.name}>{v.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase opacity-50 block mb-1">Setup Style</label>
                                        <select className="w-full p-2 text-sm rounded bg-black/20 border border-transparent outline-none">
                                            <option>Theater</option><option>Classroom</option><option>Banquet</option><option>U-Shape</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase opacity-50 block mb-1">Pax</label>
                                        <input type="number" className="w-full p-2 text-sm rounded bg-black/20 border border-transparent outline-none" defaultValue={100} />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button onClick={() => {
                                        const newAgenda = evtForm.agenda.filter((_, i) => i !== idx);
                                        setEvtForm({ ...evtForm, agenda: newAgenda });
                                    }} className="text-red-500 text-xs hover:underline flex items-center gap-1"><Trash2 size={12} /> Remove Session</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Floating Activities Button */}
                <div className="flex justify-center pt-8">
                    <button onClick={() => setShowLogs(!showLogs)}
                        className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-30 hover:opacity-100 hover:text-primary transition-all">
                        <Clock size={14} /> {showLogs ? 'Hide Activities' : 'View Activities (History)'}
                    </button>
                </div>

                {showLogs && (
                    <div className="mt-6">
                        {renderActivities(evtForm.logs || [])}
                    </div>
                )}
                </>
            )
        });
    };

    const renderCombinedForm = () => renderFormLayout({
        title: "New Request (Event + Rooms)",
        icon: Box,
        onBack: () => { setStep(1); setRequestType(null); },
        onDiscard: showDiscardNewRequestDraft ? handleDiscardNewRequestDraft : undefined,
        onSave: () => { handleSaveRequest({ accommodation: accForm, event: evtForm }, 'event_rooms'); },
        children: (
            <>
                <div className="bg-yellow-500/10 p-4 rounded text-yellow-500 text-sm mb-4">
                    Note: This form combines both Accommodation and Event sections.
                </div>
                <div className="text-center opacity-50 py-10">Combined Form Sections Placeholder</div>
            </>
        )
    });

    // --- Main Render ---
    const agendaPackageTimingSummary = (row: any) => {
        const slots = getAgendaTimingSlotsForPackageName(String(row?.package || ''), eventPackagesForProperty);
        if (!slots.length) return '';
        const getVal = (field: string) => {
            if (field === 'coffee1') return String(row?.coffee1 ?? row?.coffeeTime ?? '').trim();
            if (field === 'coffee2') return String(row?.coffee2 ?? '').trim();
            if (field === 'lunchTime') return String(row?.lunchTime ?? row?.lunch ?? '').trim();
            if (field === 'dinnerTime') return String(row?.dinnerTime ?? row?.dinner ?? '').trim();
            return '';
        };
        return slots
            .map((slot) => {
                const v = getVal(slot.field);
                return v ? `${slot.label}: ${v}` : '';
            })
            .filter(Boolean)
            .join(' | ');
    };

    const renderRequestDetailView = ({ request, onClose }: { request: any, onClose: () => void }) => {
        const fin = calculateAccFinancials(request);
        const detailType = normalizeRequestTypeKey(request.requestType);
        const isEventOnly = detailType === 'event';
        const isEventRooms = detailType === 'event_rooms';
        const showEventAgendaSection = includesEventAgendaSection(detailType);
        const evWindow = getEventDateWindow(request);
        const agenda = request.agenda || [];
        const packageSummary = formatAgendaPackageSummary(agenda) || request.mealPlan || '—';
        const resolvedBookerName = (() => {
            const direct = String(request.bookerName || request.booker || '').trim();
            if (direct) return direct;
            const accountId = String(request.accountId || '').trim();
            if (!accountId) return '';
            const account = accountsSameProperty.find((a: any) => String(a?.id || '') === accountId);
            if (!account) return '';
            const contactId = String(request.bookerContactId || '').trim();
            if (!contactId) return '';
            const contact = getAccountContacts(account).find((c: any) => String(c?._id || '') === contactId);
            return String(contact?._label || '').trim();
        })();
        const displayEventDays = fin.totalEventDays > 0
            ? fin.totalEventDays
            : (evWindow.start && evWindow.end ? inclusiveCalendarDays(evWindow.start, evWindow.end) : 0);
        const dayDenomForEventCost = Math.max(1, fin.totalEventDays || (evWindow.start && evWindow.end ? inclusiveCalendarDays(evWindow.start, evWindow.end) : 1));
        const eventCostPerDay = fin.eventCostWithTax / dayDenomForEventCost;
        const renderAgendaSection = () => {
            logRequestDetailEventAgendaRender(request?.id);
            return (
            <div className="rounded-2xl border bg-current/5 overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="p-4 border-b bg-white/5 flex items-center gap-2" style={{ borderColor: colors.border }}>
                    <Calendar size={16} className="text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-widest opacity-60">Event agenda</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[900px]">
                        <thead>
                            <tr className="bg-black/20 text-[10px] font-bold uppercase opacity-40">
                                <th className="px-4 py-3">Start</th>
                                <th className="px-4 py-3">End</th>
                                <th className="px-4 py-3">Session time</th>
                                <th className="px-4 py-3">Package timing</th>
                                <th className="px-4 py-3">Venue</th>
                                <th className="px-4 py-3">Shape</th>
                                <th className="px-4 py-3">Package</th>
                                <th className="px-4 py-3 text-center">Pax</th>
                                <th className="px-4 py-3 text-right">Rate</th>
                                <th className="px-4 py-3 text-right">Rental</th>
                                <th className="px-4 py-3 text-right">Line</th>
                                <th className="px-4 py-3">Row notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {agenda.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="px-6 py-8 text-center opacity-40 italic">No agenda rows</td>
                                </tr>
                            ) : agenda.map((row: any, idx: number) => {
                                const line = (Number(row.rate || 0) * Number(row.pax || 0)) + Number(row.rental || 0);
                                return (
                                    <tr key={row.id ?? idx} className="align-top">
                                        <td className="px-4 py-3 font-bold whitespace-nowrap">{row.startDate || '—'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">{row.endDate || row.startDate || '—'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">{[row.startTime, row.endTime].filter(Boolean).join(' – ') || '—'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">{agendaPackageTimingSummary(row) || '—'}</td>
                                        <td className="px-4 py-3 opacity-80">{formatAgendaRowVenueDisplay(row) || '—'}</td>
                                        <td className="px-4 py-3 opacity-80">{row.shape || '—'}</td>
                                        <td className="px-4 py-3">{row.package || '—'}</td>
                                        <td className="px-4 py-3 text-center">{row.pax ?? '—'}</td>
                                        <td className="px-4 py-3 text-right font-mono">{formatMoney(Number(row.rate || 0), 0)}</td>
                                        <td className="px-4 py-3 text-right font-mono">{formatMoney(Number(row.rental || 0), 0)}</td>
                                        <td className="px-4 py-3 text-right font-bold text-primary">{formatMoney(line, 0)}</td>
                                        <td className="px-4 py-3 whitespace-pre-wrap max-w-[12rem] text-[10px] leading-snug opacity-90">{formatAgendaRowSessionNotes(row) || '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            );
        };

        const statCard = (label: string, value: React.ReactNode, borderClass: string = 'border-primary', valueClass?: string) => (
            <div className="min-w-0">
                <label className={`text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block ${valueClass || ''}`}>{label}</label>
                <div
                    className={`text-lg sm:text-xl md:text-2xl font-mono font-black border-l-4 pl-4 min-w-0 break-words leading-snug ${borderClass}`}
                    style={{ color: colors.textMain }}
                >
                    {value}
                </div>
            </div>
        );

        const feedbackTemplate = getFeedbackTemplateForRequestType(
            request.requestType,
            resolveFeedbackTemplatesForProperty(activeProperty)
        );
        const feedbackSaved =
            request?.feedback && typeof request.feedback === 'object' ? request.feedback : {};
        const feedbackSubmittedAt = String(feedbackSaved?.submittedAt || '').trim();
        const feedbackPublicToken = String(feedbackSaved?.publicToken || '').trim();
        const answerValue = (q: FeedbackQuestion) => feedbackDraft[q.id];

        const renderStarsInput = (qid: string, value: any) => {
            const score = typeof value === 'number' ? value : 0;
            return (
                <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                        <button
                            key={n}
                            type="button"
                            onClick={() => setFeedbackDraft((prev) => ({ ...prev, [qid]: n }))}
                            className="p-1 rounded transition-all hover:scale-110"
                        >
                            <Star
                                size={18}
                                className={n <= score ? 'text-amber-400' : 'text-slate-500'}
                                fill={n <= score ? 'currentColor' : 'none'}
                            />
                        </button>
                    ))}
                </div>
            );
        };

        const renderFeedbackQuestionInput = (q: FeedbackQuestion) => {
            const value = answerValue(q);
            if (q.type === 'stars') return renderStarsInput(q.id, value);
            if (q.type === 'stars_na') {
                const isNa = String(value || '').toUpperCase() === 'N/A';
                return (
                    <div className="flex items-center gap-3 flex-wrap">
                        {renderStarsInput(q.id, isNa ? null : value)}
                        <button
                            type="button"
                            onClick={() =>
                                setFeedbackDraft((prev) => ({ ...prev, [q.id]: isNa ? null : 'N/A' }))
                            }
                            className={`px-3 py-1 rounded-lg border text-xs font-bold ${isNa ? 'bg-amber-400 text-black border-amber-400' : 'border-white/20'}`}
                            style={{ color: isNa ? '#000' : colors.textMain }}
                        >
                            N/A
                        </button>
                    </div>
                );
            }
            if (q.type === 'yesno' || q.type === 'yesno_na') {
                const opts = q.type === 'yesno' ? ['Yes', 'No'] : ['Yes', 'No', 'N/A'];
                return (
                    <div className="flex gap-2 flex-wrap">
                        {opts.map((opt) => {
                            const active = String(value || '') === opt;
                            return (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setFeedbackDraft((prev) => ({ ...prev, [q.id]: opt }))}
                                    className={`px-3 py-1 rounded-lg border text-xs font-bold transition-all ${active ? 'bg-cyan-400 text-black border-cyan-400' : 'border-white/20'}`}
                                    style={{ color: active ? '#000' : colors.textMain }}
                                >
                                    {opt}
                                </button>
                            );
                        })}
                    </div>
                );
            }
            if (q.type === 'score10') {
                return (
                    <div className="flex gap-1.5 flex-wrap">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                            const active = Number(value || 0) === n;
                            return (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => setFeedbackDraft((prev) => ({ ...prev, [q.id]: n }))}
                                    className={`w-8 h-8 rounded-md border text-xs font-black transition-all ${active ? 'bg-violet-400 text-black border-violet-400' : 'border-white/20'}`}
                                    style={{ color: active ? '#000' : colors.textMain }}
                                >
                                    {n}
                                </button>
                            );
                        })}
                    </div>
                );
            }
            return (
                <textarea
                    value={String(value || '')}
                    onChange={(e) => setFeedbackDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Your Insights"
                    className="w-full rounded-xl border px-3 py-2 text-sm min-h-[110px]"
                    style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg }}
                />
            );
        };

        const handleCopyFeedbackLink = async () => {
            if (readOnlyOperational) return;
            const token = feedbackPublicToken || generateFeedbackToken();
            if (!feedbackPublicToken) {
                await updateRequest(request.id, {
                    feedback: {
                        ...(feedbackSaved || {}),
                        publicToken: token,
                        template: feedbackTemplate.type,
                        answers: feedbackDraft,
                        updatedAt: new Date().toISOString(),
                    },
                });
                if (selectedRequest?.id === request.id) {
                    setSelectedRequest((prev: any) =>
                        prev
                            ? {
                                  ...prev,
                                  feedback: {
                                      ...(prev.feedback || {}),
                                      publicToken: token,
                                      template: feedbackTemplate.type,
                                      answers: feedbackDraft,
                                      updatedAt: new Date().toISOString(),
                                  },
                              }
                            : prev
                    );
                }
            }
            const link = buildFeedbackShareLink(token);
            try {
                await navigator.clipboard.writeText(link);
                setFeedbackCopyState('copied');
                setTimeout(() => setFeedbackCopyState('idle'), 2000);
            } catch {
                setFeedbackCopyState('error');
            }
        };

        const handleSaveFeedback = async () => {
            if (readOnlyOperational) return;
            setFeedbackSaving(true);
            try {
                const token = feedbackPublicToken || generateFeedbackToken();
                const now = new Date().toISOString();
                const feedbackPayload = {
                    ...(feedbackSaved || {}),
                    publicToken: token,
                    template: feedbackTemplate.type,
                    answers: feedbackDraft,
                    updatedAt: now,
                    submittedAt: feedbackSubmittedAt || now,
                    source: 'internal',
                };
                await updateRequest(request.id, { feedback: feedbackPayload });
                if (selectedRequest?.id === request.id) {
                    setSelectedRequest((prev: any) => (prev ? { ...prev, feedback: feedbackPayload } : prev));
                }
                showSystemNotice('Feedback', 'Feedback saved successfully.');
            } finally {
                setFeedbackSaving(false);
            }
        };

        const handleResetFeedback = async () => {
            if (readOnlyOperational) return;
            const token = generateFeedbackToken();
            const nextAnswers = buildInitialFeedbackAnswers(feedbackTemplate);
            const payload = {
                publicToken: token,
                template: feedbackTemplate.type,
                answers: nextAnswers,
                updatedAt: new Date().toISOString(),
                submittedAt: '',
                source: 'internal',
            };
            await updateRequest(request.id, { feedback: payload });
            setFeedbackDraft(nextAnswers);
            if (selectedRequest?.id === request.id) {
                setSelectedRequest((prev: any) => (prev ? { ...prev, feedback: payload } : prev));
            }
            showSystemNotice('Feedback', 'Feedback form reset. Share the new link with the client.');
        };

        return (
            <div className="h-full flex flex-col relative animate-in fade-in slide-in-from-right-8 duration-500" style={{ backgroundColor: colors.bg }}>
                <div className="shrink-0 p-6 border-b flex justify-between items-center" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 transition-colors" style={{ color: colors.textMuted }}>
                            <ChevronRight size={20} className="rotate-180" />
                        </button>
                        <div>
                            <h1 className="text-xl font-black flex items-center gap-2" style={{ color: colors.textMain }}>
                                <FileText className="text-primary" /> Request Details: {request.confirmationNo}
                            </h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-mono opacity-40">SYSTEM ID: {request.id}</span>
                                <span className="w-1 h-1 rounded-full bg-white/10" />
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.primary }}>{request.account}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3 items-center">
                        {(canManageRequestAlerts || requestHasAlerts(request)) && (
                            <button
                                type="button"
                                title="Request alerts"
                                onClick={() => {
                                    setRequestAlertsModalId(String(request.id));
                                    setRequestAlertsModalAuto(false);
                                }}
                                className="relative p-2.5 rounded-xl border font-bold hover:bg-white/5 transition-all"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                <Bell size={18} />
                                {requestHasAlerts(request) ? (
                                    <span className="absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 shadow-sm pointer-events-none">
                                        <AlertTriangle size={8} className="text-white" fill="currentColor" />
                                    </span>
                                ) : null}
                            </button>
                        )}
                        {!readOnlyOperational && (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                const idx = requests.findIndex(r => r.id === request.id);
                                if (idx !== -1) setActiveOptionsMenu(idx);
                            }}
                            className="px-4 py-2 rounded-xl border font-bold text-xs flex items-center gap-2 hover:bg-white/5 transition-all"
                            style={{ borderColor: colors.border, color: colors.textMain }}>
                            <MoreHorizontal size={14} /> OPTS
                        </button>
                        )}
                        <button 
                            onClick={() => setShowLogs(!showLogs)}
                            className="px-4 py-2 rounded-xl border font-bold text-xs flex items-center gap-2 hover:bg-white/5 transition-all"
                            style={{ borderColor: colors.border, color: showLogs ? colors.primary : colors.textMain }}>
                            <RefreshCw size={14} /> Activities
                        </button>
                        <button onClick={onClose} className="p-2 rounded-xl border hover:bg-white/5 transition-all" style={{ borderColor: colors.border, color: colors.textMain }}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-black/5">
                    <div className="max-w-6xl mx-auto w-full min-w-0 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-6 rounded-2xl border bg-current/5 space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <h3 className="text-xs font-black uppercase opacity-30 tracking-widest">Section 1: Basic</h3>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase opacity-40">Account Name</p>
                                            <p className="font-bold text-sm">{request.account}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase opacity-40">Booker Name</p>
                                            <p className="font-bold text-sm">{resolvedBookerName || '—'}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase opacity-40">Received Date</p>
                                        <p className="font-bold text-sm">{request.receivedDate || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase opacity-40">Confirmation #</p>
                                        <p className="font-bold text-sm text-primary">{request.confirmationNo}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 rounded-2xl border bg-current/5 space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                {isEventOnly ? (
                                    <>
                                        <h3 className="text-xs font-black uppercase opacity-30 tracking-widest">Section 2: Dates</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[10px] font-bold uppercase opacity-40">Start</p>
                                                <p className="font-bold text-sm">{evWindow.start || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase opacity-40">End</p>
                                                <p className="font-bold text-sm">{evWindow.end || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase opacity-40">Days</p>
                                                <p className="font-bold text-sm">{displayEventDays || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase opacity-40">Package</p>
                                                <p className="font-bold text-sm">{packageSummary}</p>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="text-xs font-black uppercase opacity-30 tracking-widest">Section 2: Stay</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[10px] font-bold uppercase opacity-40">Check-in</p>
                                                <p className="font-bold text-sm">{request.checkIn}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase opacity-40">Check-out</p>
                                                <p className="font-bold text-sm">{request.checkOut}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase opacity-40">Nights</p>
                                                <p className="font-bold text-sm">{fin.nights}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase opacity-40">Meal Plan</p>
                                                <p className="font-bold text-sm">
                                                    {deriveRequestMealLabelFromRooms(request.rooms, request.mealPlan) || '—'}
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="p-6 rounded-2xl border bg-current/5 space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <h3 className="text-xs font-black uppercase opacity-30 tracking-widest">Deadlines</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="opacity-40 font-bold uppercase text-[9px]">Offer Acceptance</span>
                                        <span className="font-bold">{request.offerDeadline || "-"}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="opacity-40 font-bold uppercase text-[9px]">Deposit Due</span>
                                        <span className="font-bold">{request.depositDeadline || "-"}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2">
                                        <span className="opacity-40 font-bold uppercase text-[9px]">Full Payment</span>
                                        <span className="font-bold text-red-400">{request.paymentDeadline || "-"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {isEventRooms && (
                            <div className="p-5 rounded-2xl border grid grid-cols-2 md:grid-cols-4 gap-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">Event start</p>
                                    <p className="font-bold text-sm">{evWindow.start || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">Event end</p>
                                    <p className="font-bold text-sm">{evWindow.end || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">Event days</p>
                                    <p className="font-bold text-sm">{displayEventDays || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">Event package</p>
                                    <p className="font-bold text-sm">{packageSummary}</p>
                                </div>
                            </div>
                        )}

                        {!isEventOnly && (
                            <div className="rounded-2xl border bg-current/5 overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <div className="p-4 border-b bg-white/5 flex items-center gap-2" style={{ borderColor: colors.border }}>
                                    <BedDouble size={16} className="text-primary" />
                                    <h3 className="text-xs font-black uppercase tracking-widest opacity-60">Section 3: Request Details (Rooms)</h3>
                                </div>
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="bg-black/20 text-[10px] font-bold uppercase opacity-40">
                                            <th className="px-4 py-3 whitespace-nowrap">Room Type</th>
                                            <th className="px-4 py-3 whitespace-nowrap">Check-in</th>
                                            <th className="px-4 py-3 whitespace-nowrap">Check-out</th>
                                            <th className="px-4 py-3">Occupancy</th>
                                            <th className="px-4 py-3 text-center whitespace-nowrap">Rooms</th>
                                            <th className="px-4 py-3 text-right whitespace-nowrap">Rate</th>
                                            <th className="pl-5 pr-4 py-3 text-right whitespace-nowrap">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {(request.rooms || []).length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-8 text-center opacity-40 italic">No rooms on this request</td>
                                            </tr>
                                        ) : (request.rooms || []).map((r: any, idx: number) => {
                                            let rNights = fin.nights;
                                            if (detailType === 'series' || detailType === 'event_rooms') {
                                                const a = String(r.arrival || '').slice(0, 10);
                                                const d = String(r.departure || '').slice(0, 10);
                                                const perRow = a && d ? calculateNights(a, d) : 0;
                                                const manual = Number(r.nights);
                                                rNights =
                                                    perRow > 0 ? perRow : a && Number.isFinite(manual) && manual > 0 ? manual : fin.nights;
                                            }
                                            const subtotal = Number(r.rate || 0) * Number(r.count || 0) * rNights;
                                            const rowIn = String(r.arrival || '').trim().slice(0, 10) || String(request.checkIn || '').trim() || '—';
                                            const rowOut = String(r.departure || '').trim().slice(0, 10) || String(request.checkOut || '').trim() || '—';
                                            return (
                                                <tr key={idx}>
                                                    <td className="px-4 py-4 font-bold whitespace-nowrap">{r.type}</td>
                                                    <td className="px-4 py-4 font-mono text-[11px] whitespace-nowrap opacity-90">{rowIn}</td>
                                                    <td className="px-4 py-4 font-mono text-[11px] whitespace-nowrap opacity-90">{rowOut}</td>
                                                    <td className="px-4 py-4 opacity-70">{r.occupancy}</td>
                                                    <td className="px-4 py-4 text-center">{r.count}</td>
                                                    <td className="px-4 py-4 text-right font-mono">{formatMoney(Number(r.rate || 0), 0)}</td>
                                                    <td className="pl-5 pr-4 py-4 text-right font-bold text-primary tabular-nums">{formatMoney(subtotal, 0)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {showEventAgendaSection && renderAgendaSection()}

                        {(function renderDetailFinancials() {
                            const remainingBalance = Math.max(0, (fin.grandTotalWithTax || 0) - (fin.paidAmount || 0));
                            const handleOffsetPayment = async (payment: SyncPayment) => {
                                const amt = Number(payment.amount);
                                if (!(amt > 0)) return;
                                const netPaid = sumPaymentAmounts(request.payments || []);
                                if (netPaid < amt) {
                                    showSystemNotice('Cannot offset payment', 'There is no remaining paid balance to offset for this amount.');
                                    return;
                                }
                                if (isBalanceOrClPaymentMethod(payment.method)) {
                                    const accountId = String(request.accountId || '').trim();
                                    const propertyId = String(activeProperty?.id || '').trim();
                                    if (!accountId) {
                                        showSystemNotice(
                                            'Cannot offset payment',
                                            'Link an account to this request before offsetting a Balance or CL payment.'
                                        );
                                        return;
                                    }
                                    if (!propertyId) {
                                        showSystemNotice(
                                            'Cannot offset payment',
                                            'Select an active property before offsetting Balance or CL payments.'
                                        );
                                        return;
                                    }
                                    try {
                                        const { request: patched } = await reverseBalancePaymentOnRequest({
                                            request,
                                            payment,
                                            accountId,
                                            propertyId,
                                            mode: 'offset',
                                        });
                                        mergePatchedRequest(patched);
                                        showSystemNotice(
                                            'Payment offset',
                                            'Balance restored on the linked account.'
                                        );
                                    } catch (e: unknown) {
                                        showSystemNotice(
                                            'Offset failed',
                                            (e instanceof Error && e.message ? e.message : 'Could not reverse the Balance/CL payment on the ledger.')
                                        );
                                    }
                                    return;
                                }
                                const newPayments = [...(request.payments || []), {
                                    ...payment,
                                    id: Date.now(),
                                    amount: -amt,
                                    note: `Offset for payment #${payment.id}`,
                                }];
                                const paidSum = sumPaymentAmounts(newPayments);
                                const totalCost = parseFloat(String(request.totalCost ?? '0').replace(/,/g, '')) || 0;
                                let paymentStatus = 'Unpaid';
                                if (totalCost > 0) {
                                    if (paymentsMeetOrExceedTotal(paidSum, totalCost)) paymentStatus = 'Paid';
                                    else if (paidSum > 0) paymentStatus = 'Deposit';
                                }
                                await updateRequest(request.id, { payments: newPayments, paidAmount: paidSum.toFixed(2), paymentStatus });
                                if (selectedRequest?.id === request.id) {
                                    setSelectedRequest((prev: any) => prev ? { ...prev, payments: newPayments, paidAmount: paidSum.toFixed(2), paymentStatus } : null);
                                }
                            };
                            const handleDeletePayment = async (payment: SyncPayment) => {
                                if (!payment?.id) return;
                                setPendingPaymentRemove({ source: 'detail', payment, request });
                            };
                            return (
                            <div className="p-8 rounded-2xl border-2 space-y-8 relative overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.primary + '40' }}>
                                <div className="absolute top-0 right-0 p-8 opacity-5">
                                    <Calculator size={150} color={colors.primary} />
                                </div>

                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-xl font-bold flex items-center gap-2 mb-1" style={{ color: colors.textMain }}>
                                            <Calculator size={20} className="text-primary" /> Section 6: Statistics & Financials
                                        </h3>
                                        <p className="text-xs opacity-50" style={{ color: colors.textMuted }}>Automated calculations based on request details</p>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-black uppercase opacity-50 tracking-widest mb-1">Current Status</span>
                                        {(request.collectLater || request.paymentStatus === 'CL') ? (
                                            <div className="px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2"
                                                style={{
                                                    backgroundColor: colors.red + '20',
                                                    borderColor: colors.red,
                                                    color: colors.red,
                                                }}>
                                                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'currentColor' }} />
                                                CL · Collect Later
                                            </div>
                                        ) : (
                                        <div className="px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2"
                                            style={{
                                                backgroundColor: fin.paymentStatus === 'Paid' ? colors.green + '20' : (fin.paymentStatus === 'Partially Paid' || fin.paymentStatus === 'Deposit') ? colors.yellow + '20' : colors.red + '20',
                                                borderColor: fin.paymentStatus === 'Paid' ? colors.green : (fin.paymentStatus === 'Partially Paid' || fin.paymentStatus === 'Deposit') ? colors.yellow : colors.red,
                                                color: fin.paymentStatus === 'Paid' ? colors.green : (fin.paymentStatus === 'Partially Paid' || fin.paymentStatus === 'Deposit') ? colors.yellow : colors.red
                                            }}>
                                            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'currentColor' }} />
                                            {fin.paymentStatus === 'Deposit' ? 'Partial / deposit' : fin.paymentStatus}
                                        </div>
                                        )}
                                    </div>
                                </div>

                                {detailType === 'event_rooms' ? (
                                    <>
                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8">
                                            <div className="space-y-4 p-5 sm:p-6 rounded-xl border bg-black/5 min-w-0" style={{ borderColor: colors.border }}>
                                                <h4 className="text-xs font-black uppercase opacity-50 tracking-widest">Accommodation</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                                        <p className="text-[10px] font-bold uppercase opacity-40 mb-1">ADR (Avg Daily Rate)</p>
                                                        <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: colors.textMain }}>{formatMoney(fin.adr)}</p>
                                                    </div>
                                                    <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                                        <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Total Room Nights</p>
                                                        <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>{fin.totalRoomNights}</p>
                                                    </div>
                                                    <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                                        <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Total Rooms</p>
                                                        <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>{fin.totalRooms}</p>
                                                    </div>
                                                    <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                                        <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Rooms (Incl. Tax)</p>
                                                        <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: colors.primary }}>{formatMoney(fin.roomsCostWithTax)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-4 p-5 sm:p-6 rounded-xl border bg-black/5 min-w-0" style={{ borderColor: colors.border }}>
                                                <h4 className="text-xs font-black uppercase opacity-50 tracking-widest">Event</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                                        <p className="text-[10px] font-bold uppercase opacity-40 mb-1">DDR (Per Person)</p>
                                                        <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: colors.textMain }}>{formatMoney(fin.ddr)}</p>
                                                    </div>
                                                    <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                                        <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Cost Per Day (Incl. Tax)</p>
                                                        <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: colors.textMain }}>{formatMoney(eventCostPerDay)}</p>
                                                    </div>
                                                    <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                                        <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Total Days</p>
                                                        <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>{fin.totalEventDays || displayEventDays}</p>
                                                    </div>
                                                    <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                                        <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Total Attendees</p>
                                                        <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>{fin.totalEventAttendeeDays ?? fin.totalEventPax}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                                <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Paid Amount</p>
                                                <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: (request.collectLater || request.paymentStatus === 'CL') ? colors.red : colors.green }}>{formatMoney(fin.paidAmount)}</p>
                                            </div>
                                            <div className="p-4 sm:p-5 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                                <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Remaining Balance</p>
                                                <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: remainingBalance > 0 ? '#f87171' : colors.green }}>
                                                    {formatMoney(remainingBalance)}
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                                        <div className="p-4 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">
                                                {detailType === 'event' ? 'DDR (Daily Delegate Rate)' : 'ADR (Avg Daily Rate)'}
                                            </p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: colors.textMain }}>
                                                {formatMoney(detailType === 'event' ? fin.ddr : fin.adr)}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">
                                                {detailType === 'event' ? 'Total Attendees' : 'Total Room Nights'}
                                            </p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>
                                                {detailType === 'event' ? (fin.totalEventAttendeeDays ?? fin.totalEventPax) : fin.totalRoomNights}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">
                                                {detailType === 'event' ? 'Total Days' : 'Total Rooms'}
                                            </p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-bold leading-snug" style={{ color: colors.textMain }}>
                                                {detailType === 'event' ? fin.totalEventDays : fin.totalRooms}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-black/10 border border-white/5 min-w-0">
                                            <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Paid Amount</p>
                                            <p className="text-lg sm:text-xl lg:text-2xl font-mono font-bold leading-snug break-words" style={{ color: (request.collectLater || request.paymentStatus === 'CL') ? colors.red : colors.green }}>{formatMoney(fin.paidAmount)}</p>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-white/5">
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black uppercase opacity-30 tracking-widest pl-2">Cost Breakdown</h4>
                                        {detailType === 'event_rooms' ? (
                                            <div className="space-y-6">
                                                <div className="space-y-3">
                                                    <h5 className="text-[10px] font-black uppercase opacity-40 tracking-wider">Accommodation</h5>
                                                    <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                        <span className="text-sm opacity-60 shrink-0">Rooms Cost (Before Tax)</span>
                                                        <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.roomsCostNoTax)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                        <span className="text-sm opacity-60 shrink-0">Rooms Cost (Incl. Tax)</span>
                                                        <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.roomsCostWithTax)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                        <span className="text-sm opacity-60 shrink-0">Transportation (Before Tax)</span>
                                                        <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.transCostNoTax)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                        <span className="text-sm opacity-60 shrink-0">Transportation (Incl. Tax)</span>
                                                        <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.transCostWithTax)}</span>
                                                    </div>
                                                </div>
                                                <div className="space-y-3">
                                                    <h5 className="text-[10px] font-black uppercase opacity-40 tracking-wider">Event</h5>
                                                    <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                        <span className="text-sm opacity-60 shrink-0">Event Cost (Before Tax)</span>
                                                        <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.eventCostNoTax)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                        <span className="text-sm opacity-60 shrink-0">Event Cost (Incl. Tax)</span>
                                                        <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.eventCostWithTax)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                        <div className="space-y-3">
                                            {detailType !== 'event' && (
                                                <>
                                                    <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                        <span className="text-sm opacity-60 shrink-0">Rooms Cost (Before Tax)</span>
                                                        <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.roomsCostNoTax)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                        <span className="text-sm opacity-60 shrink-0">Rooms Cost (Incl. Tax)</span>
                                                        <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.roomsCostWithTax)}</span>
                                                    </div>
                                                </>
                                            )}
                                            <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                <span className="text-sm opacity-60 shrink-0">Transportation (Before Tax)</span>
                                                <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.transCostNoTax)}</span>
                                            </div>
                                            <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                <span className="text-sm opacity-60 shrink-0">Transportation (Incl. Tax)</span>
                                                <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.transCostWithTax)}</span>
                                            </div>
                                            <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                <span className="text-sm opacity-60 shrink-0">Event Cost (Before Tax)</span>
                                                <span className="font-mono font-bold text-right break-words min-w-0">{formatMoney(fin.eventCostNoTax)}</span>
                                            </div>
                                            <div className="flex justify-between items-center gap-3 p-3 rounded-lg bg-black/10 group min-w-0">
                                                <span className="text-sm opacity-60 shrink-0">Event Cost (Incl. Tax)</span>
                                                <span className="font-mono font-bold text-right break-words min-w-0" style={{ color: colors.primary }}>{formatMoney(fin.eventCostWithTax)}</span>
                                            </div>
                                        </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col justify-end gap-6 min-w-0">
                                        <div className="p-6 rounded-2xl bg-primary/5 border border-primary/20 min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Grand Total Amount (Before Tax)</p>
                                            <p className="text-xl sm:text-2xl font-mono font-bold opacity-60 leading-snug break-words">{formatMoney(fin.grandTotalNoTax)}</p>
                                        </div>
                                        <div className="p-6 rounded-2xl bg-primary/10 border-2 border-primary/30 shadow-xl shadow-primary/5 min-w-0">
                                            <p className="text-xs font-black uppercase tracking-widest text-primary mb-1">Grand Total Amount (Including Tax)</p>
                                            <p className="text-2xl sm:text-3xl lg:text-4xl font-mono font-black leading-snug break-words" style={{ color: colors.textMain }}>{formatMoney(fin.grandTotalWithTax)}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Payments record */}
                                <div className="pt-8 border-t border-white/5 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-xs font-black uppercase opacity-30 tracking-widest pl-2">Payment Records</h4>
                                        {!readOnlyOperational && (
                                        <button onClick={() => {
                                            setNewPayment(emptyNewPayment());
                                            setPaymentSource('method');
                                            setBalanceMode('full');
                                            setPaymentModalSource('detail');
                                            setShowPaymentModal(true);
                                        }}
                                            className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-bold flex items-center gap-2 hover:bg-emerald-500/20 hover:scale-105 transition-all active:scale-95 shadow-lg shadow-emerald-500/10">
                                            <Plus size={16} /> Add Deposit
                                        </button>
                                        )}
                                    </div>
                                    <div className="bg-black/10 rounded-xl overflow-hidden border border-white/5">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/30">
                                                    <th className="px-4 py-3 text-left">Date</th>
                                                    <th className="px-4 py-3 text-left">Method</th>
                                                    <th className="px-4 py-3 text-left">Notes</th>
                                                    <th className="px-4 py-3 text-right">Amount</th>
                                                    <th className="px-4 py-3 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(request.payments || []).length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="px-4 py-8 text-center opacity-20 italic">No payments recorded yet.</td>
                                                    </tr>
                                                ) : (() => {
                                                    const clOpen = !!(request.collectLater || request.paymentStatus === 'CL');
                                                    return (request.payments || []).map((p: any, idx: number) => (
                                                        <tr key={p.id ?? `pay-${idx}`} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                                            <td className="px-4 py-3 opacity-60">{p.date}</td>
                                                            <td className="px-4 py-3 font-bold" style={{ color: isClPaymentMethod(p.method) && clOpen ? colors.red : undefined }}>{p.method}</td>
                                                            <td className="px-4 py-3 opacity-60">{p.note || '-'}</td>
                                                            <td
                                                                className="px-4 py-3 text-right font-mono font-bold"
                                                                style={{
                                                                    color:
                                                                        p.amount < 0 || (isClPaymentMethod(p.method) && clOpen)
                                                                            ? colors.red
                                                                            : colors.green,
                                                                }}
                                                            >
                                                                {formatMoney(p.amount, 0)}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    {p.amount > 0 && (
                                                                        <button type="button" onClick={() => handleOffsetPayment(p)} className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-md transition-all group relative" title="Offset payment">
                                                                            <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                                                                        </button>
                                                                    )}
                                                                    {canDeletePayments && (
                                                                        <button type="button" onClick={() => handleDeletePayment(p)} className="p-1.5 hover:bg-red-500/15 text-red-500 rounded-md transition-all" title="Delete payment line">
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ));
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            );
                        })()}

                        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
                                <button
                                    type="button"
                                    onClick={() => setFeedbackExpanded((v) => !v)}
                                    className="flex items-center gap-2 text-left"
                                    style={{ color: colors.textMain }}
                                >
                                    <MessageSquare size={16} className="text-primary" />
                                    <div>
                                        <h3 className="text-xs font-black uppercase tracking-widest opacity-70">Feedback Form</h3>
                                        <p className="text-[10px] opacity-50">
                                            {feedbackSubmittedAt ? `Submitted ${new Date(feedbackSubmittedAt).toLocaleString()}` : 'Not submitted yet'}
                                        </p>
                                    </div>
                                </button>
                                <div className="flex items-center gap-2">
                                    {!readOnlyOperational && (
                                        <button
                                            type="button"
                                            onClick={handleCopyFeedbackLink}
                                            className="px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 hover:bg-white/5"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        >
                                            <Copy size={13} /> Copy link
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setFeedbackExpanded((v) => !v)}
                                        className="p-2 rounded-lg border"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        aria-label={feedbackExpanded ? 'Collapse feedback form' : 'Expand feedback form'}
                                    >
                                        <ChevronDown size={14} className={feedbackExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                    </button>
                                </div>
                            </div>
                            {feedbackExpanded && (
                                <div className="p-5 space-y-5">
                                    <p className="text-sm leading-relaxed opacity-90">
                                        {withPropertyName(feedbackTemplate.intro, String(activeProperty?.name || 'our property'))}
                                    </p>
                                    {feedbackTemplate.sections.map((section) => (
                                        <div key={section.title} className="space-y-3">
                                            <h4 className="text-[11px] font-black uppercase tracking-wider text-primary">{section.title}</h4>
                                            <div className="space-y-3">
                                                {section.questions.map((q) => (
                                                    <div key={q.id} className="rounded-xl border p-3 space-y-2" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                                        <p className="text-sm">{q.prompt}</p>
                                                        {renderFeedbackQuestionInput(q)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    {!readOnlyOperational && (
                                        <div className="flex flex-wrap items-center gap-2 pt-2">
                                            <button
                                                type="button"
                                                onClick={handleSaveFeedback}
                                                disabled={feedbackSaving}
                                                className="px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-60"
                                                style={{ backgroundColor: colors.primary, color: contrastOn(colors.primary) }}
                                            >
                                                {feedbackSaving ? 'Saving...' : feedbackSubmittedAt ? 'Save edits' : 'Save feedback'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleResetFeedback}
                                                className="px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                <RotateCcw size={13} /> Reset Form
                                            </button>
                                            {feedbackCopyState === 'copied' ? (
                                                <span className="text-xs text-emerald-400 font-bold">Link copied.</span>
                                            ) : feedbackCopyState === 'error' ? (
                                                <span className="text-xs text-red-400 font-bold">Copy failed. Try again.</span>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {showLogs && (
                            <div className="mt-8">
                                {renderActivities(request.logs)}
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-8">
                            <button onClick={onClose} className="px-8 py-3 rounded-xl border font-bold hover:bg-white/5 transition-all"
                                style={{ borderColor: colors.border, color: colors.textMain }}>
                                Back to List
                            </button>
                            {!readOnlyOperational && (
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowCancelModal(true)}
                                    className="px-8 py-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 font-bold hover:bg-red-500/20 transition-all">
                                    Cancel Request
                                </button>
                                <button
                                    onClick={() => {
                                        openRequestForEdit(request);
                                    }}
                                    className="px-12 py-3 rounded-xl font-black uppercase tracking-wider shadow-lg hover:scale-105 active:scale-95 transition-all"
                                    style={{
                                        backgroundColor: colors.primary,
                                        color: contrastOn(colors.primary),
                                        boxShadow: `0 10px 25px ${colors.primary}33`,
                                    }}
                                >
                                    Edit Request
                                </button>
                            </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Cancel Request Modal */}
                {showCancelModal && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowCancelModal(false)}></div>
                        <div className="relative w-full max-w-md rounded-[2.5rem] border-2 shadow-2xl overflow-hidden animate-in zoom-in duration-300"
                            style={{ backgroundColor: colors.card, borderColor: colors.border }}>

                            <div className="p-8 pb-4 flex justify-between items-center">
                                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
                                    <Trash2 size={24} />
                                </div>
                                <button onClick={() => setShowCancelModal(false)} className="p-2 rounded-full hover:bg-white/5 transition-colors opacity-40">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 pt-0 space-y-6">
                                <div>
                                    <h3 className="text-2xl font-black mb-2" style={{ color: colors.textMain }}>Cancel Request?</h3>
                                    <p className="text-sm opacity-50" style={{ color: colors.textMuted }}>Please let us know why you're cancelling this booking. This will be recorded in the system logs.</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 px-1">Reason for Cancellation</label>
                                    <select
                                        value={cancelReason}
                                        onChange={(e) => setCancelReason(e.target.value)}
                                        className="w-full px-5 py-4 rounded-2xl bg-black/20 border-2 outline-none focus:border-primary transition-all text-sm font-bold appearance-none"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        {cxlReasons.map((reason) => (
                                            <option key={reason} value={reason}>{reason}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 px-1">Cancellation Note</label>
                                    <textarea
                                        value={cancelNote}
                                        onChange={(e) => setCancelNote(e.target.value)}
                                        placeholder="Add more details about the cancellation..."
                                        className="w-full px-5 py-4 rounded-2xl bg-black/20 border-2 outline-none focus:border-primary transition-all text-sm h-32 resize-none"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <button
                                        onClick={() => setShowCancelModal(false)}
                                        className="py-4 rounded-2xl border font-black text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                                        style={{ borderColor: colors.border, color: colors.textMain }}>
                                        No, Keep It
                                    </button>
                                    <button
                                        onClick={async () => {
                                            const newLogs = [
                                                {
                                                    date: new Date().toISOString(),
                                                    user: requestLogUser,
                                                    action: 'Cancellation: financial totals reset',
                                                    details: 'Paid amount, payment lines, and total cost set to zero.',
                                                },
                                                {
                                                    date: new Date().toISOString(),
                                                    user: requestLogUser,
                                                    action: `Cancelled: ${cancelReason}`,
                                                    details: cancelNote || 'No additional notes provided.',
                                                },
                                                ...(request.logs || []),
                                            ];
                                            
                                            const updateData = {
                                                status: 'Cancelled',
                                                cancelReason,
                                                cancelNote,
                                                logs: newLogs,
                                                paidAmount: '0.00',
                                                payments: [] as any[],
                                                totalCost: '0.00',
                                                paymentStatus: 'Unpaid',
                                                grandTotalNoTax: 0,
                                            };
                                            
                                            // Update server
                                            await updateRequest(request.id, updateData);
                                            
                                            // Update local state if needed
                                            if (selectedRequest && selectedRequest.id === request.id) {
                                                setSelectedRequest({ ...selectedRequest, ...updateData });
                                            }
                                            
                                            setShowCancelModal(false);
                                            onClose();
                                        }}
                                        className="py-4 rounded-2xl bg-red-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-red-500/20 hover:brightness-110 hover:-translate-y-1 transition-all">
                                        Confirm Cancellation
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Shared Payment Modal - rendered in ALL views
    const paymentModal = showPaymentModal ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)} />
            <div className="relative w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden animate-in zoom-in duration-300"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
                    <h3 className="font-bold text-lg flex items-center gap-2" style={{ color: colors.textMain }}>
                        <DollarSign className="text-emerald-500" size={20} /> Add Deposit
                    </h3>
                    <button onClick={() => setShowPaymentModal(false)} className="opacity-30 hover:opacity-100 transition-opacity" style={{ color: colors.textMain }}>
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="grid grid-cols-3 gap-2">
                        {(['method', 'balance', 'cl'] as const).map((src) => (
                            <button
                                key={src}
                                type="button"
                                onClick={() => {
                                    if (src === 'balance' && accountBalance <= 0) {
                                        showSystemNotice(
                                            'No prepaid balance',
                                            'No prepaid balance on this account. Use Method for a normal payment, or CL to collect later.'
                                        );
                                        return;
                                    }
                                    setPaymentSource(src);
                                }}
                                className="py-2 rounded-xl border text-xs font-bold uppercase"
                                style={{
                                    borderColor: paymentSource === src ? colors.green : colors.border,
                                    color: paymentSource === src ? colors.green : colors.textMain,
                                    opacity: src === 'balance' && accountBalance <= 0 ? 0.4 : 1,
                                }}
                            >
                                {src === 'method' ? 'Method' : src === 'balance' ? 'Balance' : 'CL'}
                            </button>
                        ))}
                    </div>
                    {paymentSource === 'balance' && (
                        <div className="text-xs" style={{ color: colors.textMuted }}>
                            Available balance:{' '}
                            <span style={{ color: colors.green }}>{accountBalance.toLocaleString()}</span> — from
                            linked account
                            <div className="mt-2 flex gap-3">
                                <label className="flex items-center gap-1">
                                    <input
                                        type="radio"
                                        checked={balanceMode === 'full'}
                                        onChange={() => setBalanceMode('full')}
                                    />{' '}
                                    Deduct full request amount
                                </label>
                                <label className="flex items-center gap-1">
                                    <input
                                        type="radio"
                                        checked={balanceMode === 'partial'}
                                        onChange={() => setBalanceMode('partial')}
                                    />{' '}
                                    Deposit only
                                </label>
                            </div>
                        </div>
                    )}
                    {paymentSource === 'cl' && (
                        <div className="text-xs" style={{ color: colors.textMuted }}>
                            Collect Later — charges the full remaining amount to the account balance (may go
                            negative = owed).
                        </div>
                    )}
                    <div className={`grid gap-4 ${paymentSource === 'method' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <div>
                            <label className="text-xs font-black uppercase opacity-40 mb-2 block" style={{ color: colors.textMain }}>Payment Date</label>
                            <input type="date" value={newPayment.date} onChange={e => setNewPayment({ ...newPayment, date: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border bg-black/20 outline-none" style={{ borderColor: colors.border, color: colors.textMain }} />
                        </div>
                        {paymentSource === 'method' && (
                            <div>
                                <label className="text-xs font-black uppercase opacity-40 mb-2 block" style={{ color: colors.textMain }}>Method</label>
                                <select value={newPayment.method} onChange={e => setNewPayment({ ...newPayment, method: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border bg-black/20 outline-none" style={{ borderColor: colors.border, color: colors.textMain }}>
                                    {paymentMethodOptions.map((m) => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                    {(paymentSource === 'method' || (paymentSource === 'balance' && balanceMode === 'partial')) && (
                        <div>
                            <label className="text-xs font-black uppercase opacity-40 mb-2 block" style={{ color: colors.textMain }}>{`Amount (${selectedCurrency})`}</label>
                            <input type="number" value={newPayment.amount || ''} onChange={e => setNewPayment({ ...newPayment, amount: Number(e.target.value) })}
                                className="w-full px-4 py-4 rounded-xl border bg-black/20 outline-none text-2xl font-mono font-black text-center tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                style={{ borderColor: colors.border, color: '#10b981' }} />
                        </div>
                    )}
                    <div>
                        <label className="text-xs font-black uppercase opacity-40 mb-2 block" style={{ color: colors.textMain }}>Note (Optional)</label>
                        <textarea value={newPayment.note ?? ''} onChange={e => setNewPayment({ ...newPayment, note: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl border bg-black/20 outline-none h-20 resize-none text-sm"
                            placeholder="Reference number, details..." style={{ borderColor: colors.border, color: colors.textMain }} />
                    </div>
                </div>
                <div className="p-4 border-t flex gap-3" style={{ borderColor: colors.border }}>
                    <button onClick={() => setShowPaymentModal(false)}
                        className="flex-1 py-3 rounded-xl border font-bold text-sm transition-all hover:bg-white/5"
                        style={{ borderColor: colors.border, color: colors.textMain }}>
                        Cancel
                    </button>
                    <button
                        onClick={async () => {
                            const acctId =
                                paymentModalSource === 'form'
                                    ? String(accForm.accountId || '')
                                    : String(
                                          selectedRequest?.accountId ||
                                              (activeOptionsMenu !== null
                                                  ? requests[activeOptionsMenu]?.accountId
                                                  : '') ||
                                              ''
                                      );
                            const reqForAmt =
                                paymentModalSource === 'form'
                                    ? accForm
                                    : paymentModalSource === 'detail'
                                      ? selectedRequest
                                      : activeOptionsMenu !== null
                                        ? requests[activeOptionsMenu]
                                        : null;
                            if (
                                (paymentSource === 'balance' || paymentSource === 'cl') &&
                                !String(acctId || '').trim()
                            ) {
                                showSystemNotice(
                                    'Account required',
                                    'Link an account to this request before using Balance or CL.'
                                );
                                return;
                            }
                            const requestTotal =
                                paymentModalSource === 'form'
                                    ? Number(
                                          calculateAccFinancialsForRequest(accForm, taxesList, requestType)
                                              .grandTotalWithTax || 0
                                      )
                                    : parseFloat(
                                          String(
                                              reqForAmt?.totalCost ?? reqForAmt?.grandTotalWithTax ?? '0'
                                          ).replace(/,/g, '')
                                      ) || 0;
                            const alreadyPaid = sumPaymentAmounts(reqForAmt?.payments || []);
                            const requestDue = Math.max(0, requestTotal - alreadyPaid);

                            let clFlag = false;
                            const ledgerPosts: { type: LedgerType; amount: number; method: string }[] = [];
                            const extraPayments: any[] = [];
                            let logAmt = 0;
                            let logMethod = String(newPayment.method || 'Cash');

                            if (paymentSource === 'balance') {
                                const effectiveAmt =
                                    balanceMode === 'full'
                                        ? applicableFromBalance(accountBalance, requestDue)
                                        : applicableFromBalance(accountBalance, Number(newPayment.amount || 0));
                                if (effectiveAmt > 0) {
                                    ledgerPosts.push({ type: 'allocation', amount: effectiveAmt, method: 'Balance' });
                                    extraPayments.push({
                                        ...newPayment,
                                        method: 'Balance',
                                        id: Date.now(),
                                        amount: effectiveAmt,
                                    });
                                    logAmt = effectiveAmt;
                                    logMethod = 'Balance';
                                }
                            } else if (paymentSource === 'cl') {
                                // Covered prepaid → Balance payment + allocation; remainder → CL payment + cl_charge.
                                const covered = applicableFromBalance(accountBalance, requestDue);
                                const uncovered = Math.max(0, requestDue - covered);
                                if (covered > 0) {
                                    ledgerPosts.push({ type: 'allocation', amount: covered, method: 'Balance' });
                                    extraPayments.push({
                                        ...newPayment,
                                        method: 'Balance',
                                        id: Date.now(),
                                        amount: covered,
                                    });
                                }
                                if (uncovered > 0) {
                                    ledgerPosts.push({ type: 'cl_charge', amount: uncovered, method: 'CL' });
                                    extraPayments.push({
                                        ...newPayment,
                                        method: 'CL',
                                        id: Date.now() + 1,
                                        amount: uncovered,
                                        note: newPayment.note || 'Collect later',
                                    });
                                    clFlag = true;
                                }
                                logAmt = covered + uncovered;
                                logMethod = clFlag ? (covered > 0 ? 'Balance+CL' : 'CL') : 'Balance';
                            } else {
                                const effectiveAmt = Number(newPayment.amount || 0);
                                if (effectiveAmt > 0) {
                                    extraPayments.push({
                                        ...newPayment,
                                        id: Date.now(),
                                        amount: effectiveAmt,
                                    });
                                    logAmt = effectiveAmt;
                                    logMethod = String(newPayment.method || 'Cash');
                                }
                            }

                            if (acctId && ledgerPosts.length > 0) {
                                const { postLedgerEntry } = await import('./accountLedgerApi');
                                for (let i = 0; i < ledgerPosts.length; i++) {
                                    const p = ledgerPosts[i];
                                    const created = await postLedgerEntry({
                                        type: p.type,
                                        amount: p.amount,
                                        accountId: acctId,
                                        propertyId: String(activeProperty?.id || ''),
                                        requestId: String(reqForAmt?.id || ''),
                                        method: p.method,
                                        note: newPayment.note || '',
                                        date: newPayment.date,
                                        user: requestLogUser,
                                    });
                                    if (extraPayments[i] && created?.id) {
                                        extraPayments[i] = {
                                            ...extraPayments[i],
                                            ledgerEntryId: String(created.id),
                                        };
                                    }
                                }
                            }

                            const amt = logAmt;
                            const postingMethod = logMethod;

                            if (paymentModalSource === 'form') {
                                setAccForm((prev: any) => {
                                    const st = String(prev.status || '').trim();
                                    const newPayments = [...(prev.payments || []), ...extraPayments];
                                    const paidSum = sumPaymentAmounts(newPayments);
                                    const finAfter = calculateAccFinancialsForRequest(
                                        { ...prev, payments: newPayments },
                                        taxesList,
                                        requestType
                                    );
                                    const total =
                                        Number(finAfter.grandTotalWithTax ?? finAfter.totalCostWithTax ?? 0) || 0;
                                    const fullPayPromotion =
                                        paymentsMeetOrExceedTotal(paidSum, total) && canAutoDefiniteFromStatus(st);
                                    const bumpToDefinite = !fullPayPromotion && paidSum > 0 && canAutoDefiniteFromStatus(st);
                                    const requestTypeLabel =
                                        prev.requestType ||
                                        (requestType === 'event_rooms'
                                            ? 'Event with Rooms'
                                            : String(requestType || 'accommodation').charAt(0).toUpperCase() +
                                              String(requestType || 'accommodation').slice(1));
                                    const actualProbe = {
                                        ...prev,
                                        payments: newPayments,
                                        status: 'Definite',
                                        totalCost: total.toFixed(2),
                                        paidAmount: paidSum.toFixed(2),
                                        paymentStatus: clFlag ? 'CL' : finAfter.paymentStatus,
                                        requestType: requestTypeLabel,
                                    };
                                    let nextStatus = prev.status;
                                    let autoLog: any[] = [];
                                    if (st === 'Definite' && shouldPromoteDefiniteToActual(actualProbe)) {
                                        nextStatus = 'Actual';
                                        autoLog = [
                                            {
                                                date: new Date().toISOString(),
                                                user: requestLogUser,
                                                action: 'Status auto-updated',
                                                details: LOG_ACTUAL_FROM_DEFINITE,
                                            },
                                        ];
                                    } else if (fullPayPromotion) {
                                        nextStatus = 'Definite';
                                        autoLog = [
                                            {
                                                date: new Date().toISOString(),
                                                user: requestLogUser,
                                                action: 'Status auto-updated',
                                                details: `Full payment recorded while status was ${st} — set to Definite.`,
                                            },
                                        ];
                                    } else if (bumpToDefinite) {
                                        nextStatus = 'Definite';
                                        autoLog = [
                                            {
                                                date: new Date().toISOString(),
                                                user: requestLogUser,
                                                action: 'Status auto-updated',
                                                details: `Deposit posted while status was ${st} — set to Definite.`,
                                            },
                                        ];
                                    }
                                    return {
                                        ...prev,
                                        payments: newPayments,
                                        paidAmount: paidSum.toFixed(2),
                                        status: nextStatus,
                                        paymentStatus: clFlag
                                            ? 'CL'
                                            : paymentsMeetOrExceedTotal(paidSum, total)
                                              ? 'Paid'
                                              : paidSum > 0
                                                ? 'Deposit'
                                                : finAfter.paymentStatus,
                                        ...(clFlag ? { collectLater: true } : {}),
                                        logs: [
                                            ...(prev.logs || []),
                                            ...autoLog,
                                            {
                                                date: new Date().toISOString(),
                                                user: requestLogUser,
                                                action: `Posted deposit of ${amt} via ${postingMethod}`,
                                            },
                                        ],
                                    };
                                });
                            } else if (paymentModalSource === 'detail' && selectedRequest) {
                                const req = selectedRequest;
                                const newPayments = [...(req.payments || []), ...extraPayments];
                                const paidSum = sumPaymentAmounts(newPayments);
                                const totalCost = parseFloat(String(req.totalCost ?? '0').replace(/,/g, '')) || 0;
                                let paymentStatus = 'Unpaid';
                                if (totalCost > 0) {
                                    if (paymentsMeetOrExceedTotal(paidSum, totalCost)) paymentStatus = 'Paid';
                                    else if (paidSum > 0) paymentStatus = 'Deposit';
                                }
                                if (clFlag) paymentStatus = 'CL';
                                const st = String(req.status || '').trim();
                                const fullPayPromotion = paymentsMeetOrExceedTotal(paidSum, totalCost) && canAutoDefiniteFromStatus(st);
                                const bumpToDefinite = !fullPayPromotion && paidSum > 0 && canAutoDefiniteFromStatus(st);
                                const actualProbe = {
                                    ...req, payments: newPayments, status: 'Definite',
                                    paidAmount: paidSum.toFixed(2), totalCost: req.totalCost, paymentStatus,
                                };
                                let nextStatus = st;
                                let autoLog: any[] = [];
                                if (st === 'Definite' && shouldPromoteDefiniteToActual(actualProbe)) {
                                    nextStatus = 'Actual';
                                    autoLog = [{ date: new Date().toISOString(), user: requestLogUser, action: 'Status auto-updated', details: LOG_ACTUAL_FROM_DEFINITE }];
                                } else if (fullPayPromotion) {
                                    nextStatus = 'Definite';
                                    autoLog = [{ date: new Date().toISOString(), user: requestLogUser, action: 'Status auto-updated', details: `Full payment recorded while status was ${st} — set to Definite.` }];
                                } else if (bumpToDefinite) {
                                    nextStatus = 'Definite';
                                    autoLog = [{ date: new Date().toISOString(), user: requestLogUser, action: 'Status auto-updated', details: `Deposit posted while status was ${st} — set to Definite.` }];
                                }
                                const newLogs = [...autoLog, { date: new Date().toISOString(), user: requestLogUser, action: `Posted deposit of ${amt} via ${postingMethod}` }, ...(req.logs || [])];
                                const updateData: Record<string, unknown> = {
                                    paidAmount: paidSum.toFixed(2), paymentStatus, payments: newPayments,
                                    status: nextStatus, logs: newLogs,
                                    ...(clFlag ? { collectLater: true } : {}),
                                };
                                await updateRequest(req.id, updateData);
                                setSelectedRequest((prev: any) => prev ? { ...prev, ...updateData } : null);
                                setShowPaymentModal(false);
                                setNewPayment(emptyNewPayment());
                                setPaymentSource('method');
                                setBalanceMode('full');
                            } else {
                                const req = activeOptionsMenu !== null ? requests[activeOptionsMenu] : null;
                                if (req) {
                                    const newPayments = [...(req.payments || []), ...extraPayments];
                                    const paidSum = sumPaymentAmounts(newPayments);
                                    const totalCost = parseFloat(String(req.totalCost ?? '0').replace(/,/g, '')) || 0;
                                    let paymentStatus = 'Unpaid';
                                    if (totalCost > 0) {
                                        if (paymentsMeetOrExceedTotal(paidSum, totalCost)) paymentStatus = 'Paid';
                                        else if (paidSum > 0) paymentStatus = 'Deposit';
                                    }
                                    if (clFlag) paymentStatus = 'CL';
                                    const st = String(req.status || '').trim();
                                    const fullPayPromotion =
                                        paymentsMeetOrExceedTotal(paidSum, totalCost) &&
                                        canAutoDefiniteFromStatus(st);
                                    const bumpToDefinite = !fullPayPromotion && paidSum > 0 && canAutoDefiniteFromStatus(st);
                                    const actualProbe = {
                                        ...req,
                                        payments: newPayments,
                                        status: 'Definite',
                                        paidAmount: paidSum.toFixed(2),
                                        totalCost: req.totalCost,
                                        paymentStatus,
                                    };
                                    let nextStatus = st;
                                    let autoLog: any[] = [];
                                    if (st === 'Definite' && shouldPromoteDefiniteToActual(actualProbe)) {
                                        nextStatus = 'Actual';
                                        autoLog = [
                                            {
                                                date: new Date().toISOString(),
                                                user: requestLogUser,
                                                action: 'Status auto-updated',
                                                details: LOG_ACTUAL_FROM_DEFINITE,
                                            },
                                        ];
                                    } else if (fullPayPromotion) {
                                        nextStatus = 'Definite';
                                        autoLog = [
                                            {
                                                date: new Date().toISOString(),
                                                user: requestLogUser,
                                                action: 'Status auto-updated',
                                                details: `Full payment recorded while status was ${st} — set to Definite.`,
                                            },
                                        ];
                                    } else if (bumpToDefinite) {
                                        nextStatus = 'Definite';
                                        autoLog = [
                                            {
                                                date: new Date().toISOString(),
                                                user: requestLogUser,
                                                action: 'Status auto-updated',
                                                details: `Deposit posted while status was ${st} — set to Definite.`,
                                            },
                                        ];
                                    }
                                    const newLogs = [
                                        ...autoLog,
                                        { date: new Date().toISOString(), user: requestLogUser, action: `Posted deposit of ${amt} via ${postingMethod}` },
                                        ...(req.logs || []),
                                    ];
                                    const updateData: Record<string, unknown> = {
                                        paidAmount: paidSum.toFixed(2),
                                        paymentStatus,
                                        payments: newPayments,
                                        logs: newLogs,
                                        status: nextStatus,
                                        ...(clFlag ? { collectLater: true } : {}),
                                    };
                                    if (selectedRequest && selectedRequest.id === req.id) {
                                        setSelectedRequest((prev: any) => prev ? { ...prev, ...updateData } : null);
                                    }
                                    await updateRequest(req.id, updateData);
                                }
                                setActiveOptionsMenu(null);
                            }
                            if (
                                (paymentSource === 'balance' || paymentSource === 'cl') &&
                                extraPayments.length > 0
                            ) {
                                showSystemNotice(
                                    'Payment added',
                                    'Payment added successfully.'
                                );
                            }
                            setShowPaymentModal(false);
                            setNewPayment(emptyNewPayment());
                            setPaymentSource('method');
                            setBalanceMode('full');
                        }}
                        className="flex-1 py-3 rounded-xl font-bold text-sm bg-emerald-500 text-white transition-all hover:bg-emerald-600 active:scale-95">
                        Confirm Deposit
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    const parseNum = (val: any) => {
        if (val == null) return 0;
        const n = Number(String(val).replace(/,/g, ''));
        return Number.isFinite(n) ? n : 0;
    };

    const isGisEligibleType = (request: any) => {
        const type = normalizeRequestTypeKey(request?.requestType);
        return type === 'accommodation' || type === 'series' || type === 'event_rooms';
    };

    const buildGisRoomLines = (request: any) => {
        const type = normalizeRequestTypeKey(request?.requestType);
        const lines: Array<{
            checkIn: string;
            checkOut: string;
            roomType: string;
            occupancy: string;
            roomCount: number;
            rate: number;
            nights: number;
            roomNights: number;
            revenue: number;
            mealPlan: string;
            /** Index in `request.rooms` for series (checkbox / print scope). */
            seriesGroupIndex?: number;
        }> = [];

        if (type === 'series') {
            const groups = Array.isArray(request?.rooms) ? request.rooms : [];
            groups.forEach((g: any, gi: number) => {
                const checkIn = String(g?.arrival || request?.checkIn || '');
                const checkOut = String(g?.departure || request?.checkOut || '');
                const roomCount = Math.max(0, parseNum(g?.count));
                const nights = Math.max(0, calculateNights(checkIn, checkOut));
                const rate = Math.max(0, parseNum(g?.rate));
                lines.push({
                    checkIn,
                    checkOut,
                    roomType: String(g?.type || g?.roomType || '').trim() || (propertyRoomNames[0] || '—'),
                    occupancy: String(g?.occupancy || 'N/A'),
                    roomCount,
                    rate,
                    nights,
                    roomNights: roomCount * nights,
                    revenue: roomCount * nights * rate,
                    mealPlan: String(g?.mealPlan || request?.mealPlan || '—'),
                    seriesGroupIndex: gi,
                });
            });
            return lines.filter((l) => l.roomCount > 0 && l.nights > 0);
        }

        const checkIn = String(request?.checkIn || '');
        const checkOut = String(request?.checkOut || '');
        const nights = Math.max(0, calculateNights(checkIn, checkOut));
        const rows = Array.isArray(request?.rooms) ? request.rooms : [];
        rows.forEach((r: any) => {
            const roomCount = Math.max(0, parseNum(r?.count));
            const rate = Math.max(0, parseNum(r?.rate));
            lines.push({
                checkIn,
                checkOut,
                roomType: String(r?.type || r?.roomType || '').trim() || (propertyRoomNames[0] || '—'),
                occupancy: String(r?.occupancy || 'N/A'),
                roomCount,
                rate,
                nights,
                roomNights: roomCount * nights,
                revenue: roomCount * nights * rate,
                mealPlan: String(r?.mealPlan || request?.mealPlan || '—'),
            });
        });
        return lines.filter((l) => l.roomCount > 0 && l.nights > 0);
    };

    const closeOptsPopover = () => {
        setActiveOptionsMenu(null);
        if (optsHeadless) onOptsHeadlessDismiss?.();
    };

    const optionsModal = activeOptionsMenu !== null && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" onClick={closeOptsPopover}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
            <div className="relative w-full max-w-[260px] rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in duration-200"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                onClick={(e) => e.stopPropagation()}>

                <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-[11px] uppercase tracking-wider opacity-60" style={{ color: colors.textMain }}>Options</span>
                    </div>
                    <button onClick={closeOptsPopover} className="opacity-30 hover:opacity-100 transition-opacity" style={{ color: colors.textMain }}>
                        <X size={14} />
                    </button>
                </div>

                <div className="p-1.5 space-y-0.5">
                    {!readOnlyOperational && (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setNewPayment(emptyNewPayment());
                                setPaymentSource('method');
                                setBalanceMode('full');
                                setPaymentModalSource('opts');
                                setShowPaymentModal(true);
                            }}
                            className="w-full px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2.5 hover:bg-white/10 text-left transition-all active:scale-[0.98]" style={{ color: colors.textMain }}>
                            <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                <CreditCard size={12} />
                            </div>
                            <span>Add Deposit</span>
                        </button>
                    )}
                    {!readOnlyOperational && (
                        <button 
                            onClick={() => { setShowStatusModal(true); }}
                            className="w-full px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2.5 hover:bg-white/10 text-left transition-all active:scale-[0.98]" style={{ color: colors.textMain }}>
                            <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-500">
                                <RefreshCw size={12} />
                            </div>
                            <span>Change Status</span>
                        </button>
                    )}
                    {!readOnlyOperational && (
                        <button 
                            onClick={() => {
                                const req = activeOptionsMenu !== null ? requests[activeOptionsMenu] : null;
                                if (!req) return;
                                if (optsHeadless && onHeadlessModifyDetails) {
                                    setActiveOptionsMenu(null);
                                    onHeadlessModifyDetails(String(req.id));
                                    return;
                                }
                                openRequestForEdit(req);
                            }}
                            className="w-full px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2.5 hover:bg-white/10 text-left transition-all active:scale-[0.98]" style={{ color: colors.textMain }}>
                            <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-500">
                                <FileText size={12} />
                            </div>
                            <span>Modify Details</span>
                        </button>
                    )}
                    {!readOnlyOperational && (
                        <button
                            type="button"
                            onClick={() => {
                                const req = activeOptionsMenu !== null ? requests[activeOptionsMenu] : null;
                                if (!req) return;
                                openRequestForDuplicate(req);
                            }}
                            className="w-full px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2.5 hover:bg-white/10 text-left transition-all active:scale-[0.98]"
                            style={{ color: colors.textMain }}
                        >
                            <div className="w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                <Copy size={12} />
                            </div>
                            <span>Duplicate Request</span>
                        </button>
                    )}
                    {!readOnlyOperational &&
                        (() => {
                            const optReqAlerts = activeOptionsMenu !== null ? requests[activeOptionsMenu] : null;
                            if (!optReqAlerts) return null;
                            if (!canManageRequestAlerts && !requestHasAlerts(optReqAlerts)) return null;
                            return (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRequestAlertsModalId(String(optReqAlerts.id));
                                        setRequestAlertsModalAuto(false);
                                        setActiveOptionsMenu(null);
                                    }}
                                    className="w-full px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2.5 hover:bg-white/10 text-left transition-all active:scale-[0.98]"
                                    style={{ color: colors.textMain }}
                                >
                                    <div className="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center text-red-500 relative shrink-0">
                                        <Bell size={12} />
                                        {requestHasAlerts(optReqAlerts) ? (
                                            <AlertTriangle
                                                size={8}
                                                className="absolute bottom-0 right-0 text-red-500"
                                                fill="currentColor"
                                            />
                                        ) : null}
                                    </div>
                                    <span>Alert</span>
                                </button>
                            );
                        })()}
                    {!readOnlyOperational &&
                        (() => {
                            const optReq = activeOptionsMenu !== null ? requests[activeOptionsMenu] : null;
                            const optKind = optReq ? normalizeRequestTypeKey(optReq.requestType) : '';
                            if (optKind !== 'event' && optKind !== 'event_rooms' && optKind !== 'series') return null;
                            return (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const req = activeOptionsMenu !== null ? requests[activeOptionsMenu] : null;
                                        if (!req) return;
                                        setBeoTargetRequestId(req.id);
                                        setBeoNotesDraft(String(req.beoNotes ?? ''));
                                        setShowBeoModal(true);
                                        setActiveOptionsMenu(null);
                                    }}
                                    className="w-full px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2.5 hover:bg-white/10 text-left transition-all active:scale-[0.98]" style={{ color: colors.textMain }}>
                                    <div className="w-6 h-6 rounded-md bg-violet-500/10 flex items-center justify-center text-violet-500">
                                        <Printer size={12} />
                                    </div>
                                    <span>BEO</span>
                                </button>
                            );
                        })()}
                    {!readOnlyOperational &&
                        (() => {
                            const req = activeOptionsMenu !== null ? requests[activeOptionsMenu] : null;
                            if (!req || !isGisEligibleType(req)) return null;
                            return (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setGisTargetRequestId(req.id);
                                        setGisBillingDraft(String(req.gisBillingInstructions ?? ''));
                                        setGisOpsNotesDraft(String(req.gisOperationalNotes ?? ''));
                                        setGisExpectedArrivalTimeDraft(String(req.gisExpectedArrivalTime ?? '').trim());
                                        if (normalizeRequestTypeKey(req.requestType) === 'series') {
                                            const inc: Record<number, boolean> = {};
                                            (Array.isArray(req.rooms) ? req.rooms : []).forEach((g: any, gi: number) => {
                                                const rc = Math.max(0, Number(String(g?.count ?? 0).replace(/,/g, '')) || 0);
                                                const ci = String(g?.arrival || req?.checkIn || '');
                                                const co = String(g?.departure || req?.checkOut || '');
                                                const n = Math.max(0, calculateNights(ci, co));
                                                if (rc > 0 && n > 0) inc[gi] = true;
                                            });
                                            setGisSeriesRowInclude(inc);
                                        } else {
                                            setGisSeriesRowInclude({});
                                        }
                                        setShowGisModal(true);
                                        setActiveOptionsMenu(null);
                                    }}
                                    className="w-full px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2.5 hover:bg-white/10 text-left transition-all active:scale-[0.98]"
                                    style={{ color: colors.textMain }}
                                >
                                    <div className="w-6 h-6 rounded-md bg-cyan-500/10 flex items-center justify-center text-cyan-500">
                                        <Printer size={12} />
                                    </div>
                                    <span>GIS</span>
                                </button>
                            );
                        })()}
                    {!readOnlyOperational && (() => {
                        const optReq = activeOptionsMenu !== null ? requests[activeOptionsMenu] : null;
                        const isCancelled = String(optReq?.status || '').toLowerCase() === 'cancelled';
                        if (isCancelled) {
                            return (
                                <button
                                    onClick={async () => {
                                        if (!optReq) return;
                                        const newLogs = [
                                            {
                                                date: new Date().toISOString(),
                                                user: requestLogUser,
                                                action: 'Reinstated',
                                                details: 'Request status changed from Cancelled to Inquiry.',
                                            },
                                            ...(optReq.logs || []),
                                        ];
                                        await updateRequest(optReq.id, { status: 'Inquiry', logs: newLogs });
                                        setActiveOptionsMenu(null);
                                    }}
                                    className="w-full px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2.5 hover:bg-emerald-500/10 text-emerald-500 text-left transition-all active:scale-[0.98]"
                                >
                                    <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                        <RotateCcw size={12} />
                                    </div>
                                    <span>Reinstate</span>
                                </button>
                            );
                        }
                        return (
                            <button
                                onClick={() => { setShowCancelModal(true); }}
                                className="w-full px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2.5 hover:bg-red-500/10 text-red-500 text-left transition-all active:scale-[0.98]"
                            >
                                <div className="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center text-red-500">
                                    <Trash2 size={12} />
                                </div>
                                <span>Cancel</span>
                            </button>
                        );
                    })()}
                    {canDeleteRequest && !readOnlyOperational && (
                        <button 
                            onClick={() => {
                                const req = activeOptionsMenu !== null ? requests[activeOptionsMenu] : null;
                                if (!req) return;
                                setPendingDeleteRequest(req);
                                setShowDeleteRequestConfirm(true);
                                setActiveOptionsMenu(null);
                            }}
                            className="w-full px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-2.5 hover:bg-red-500/10 text-red-500 text-left transition-all active:scale-[0.98]">
                            <div className="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center text-red-500">
                                <Trash2 size={12} />
                            </div>
                            <span>Delete Request</span>
                        </button>
                    )}
                </div>
                <div className="p-2.5 bg-black/10 flex justify-center border-t border-white/5" style={{ borderColor: colors.border }}>
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-20" style={{ color: colors.textMain }}>
                        {activeOptionsMenu !== null ? requests[activeOptionsMenu]?.confirmationNo : ''}
                    </span>
                </div>
            </div>
        </div>
    );

    const renderGlobalModals = () => {
        const req = activeOptionsMenu !== null ? requests[activeOptionsMenu] : null;

        return (
            <>
                {paymentModal}

                {systemNotice && (
                    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="system-notice-title">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSystemNotice(null)} />
                        <div
                            className="relative w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden animate-in zoom-in duration-300"
                            style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        >
                            <div className="p-6 border-b flex items-start justify-between gap-3" style={{ borderColor: colors.border }}>
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="shrink-0 mt-0.5 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
                                        <AlertTriangle className="text-amber-500" size={22} aria-hidden />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1" style={{ color: colors.textMain }}>
                                            System message
                                        </p>
                                        <h3 id="system-notice-title" className="font-black text-lg leading-tight" style={{ color: colors.textMain }}>
                                            {systemNotice.title}
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSystemNotice(null)}
                                    className="shrink-0 opacity-30 hover:opacity-100 transition-opacity p-1"
                                    style={{ color: colors.textMain }}
                                    aria-label="Close"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6 max-h-[55vh] overflow-y-auto">
                                <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium" style={{ color: colors.textMuted }}>
                                    {systemNotice.message}
                                </p>
                            </div>
                            <div className="p-4 border-t" style={{ borderColor: colors.border }}>
                                <button
                                    type="button"
                                    onClick={() => setSystemNotice(null)}
                                    className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-[0.99]"
                                    style={{ backgroundColor: colors.primary, color: colors.card }}
                                >
                                    OK
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <AddAccountModal
                    isOpen={showAddAccountModal}
                    onClose={() => setShowAddAccountModal(false)}
                    onSave={handleSaveAccountFromModal}
                    theme={theme}
                    accountTypeOptions={effectiveAccountTypeOptions}
                    duplicateCheckAccounts={accountsSameProperty}
                    duplicateCheckPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                    configurationProperty={activeProperty || undefined}
                    configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                />
                {showAddContactModal && (
                    <div className="fixed inset-0 z-[225] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                        <div
                            className="w-full max-w-md p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 border"
                            style={{ backgroundColor: colors.card, borderColor: colors.primary + '40' }}
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold" style={{ color: colors.textMain }}>Add Contact Person</h3>
                                <button
                                    type="button"
                                    onClick={() => setShowAddContactModal(false)}
                                    className="hover:opacity-80 transition-opacity"
                                    style={{ color: colors.textMuted }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="space-y-4 text-left">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>First Name</label>
                                        <input
                                            type="text"
                                            value={newContactDraft.firstName}
                                            onChange={(e) => setNewContactDraft((prev) => ({ ...prev, firstName: e.target.value }))}
                                            className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                            placeholder="First Name"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Last Name</label>
                                        <input
                                            type="text"
                                            value={newContactDraft.lastName}
                                            onChange={(e) => setNewContactDraft((prev) => ({ ...prev, lastName: e.target.value }))}
                                            className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                            placeholder="Last Name"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Position</label>
                                    <input
                                        type="text"
                                        value={newContactDraft.position}
                                        onChange={(e) => setNewContactDraft((prev) => ({ ...prev, position: e.target.value }))}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="Job Title"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Email</label>
                                    <input
                                        type="email"
                                        value={newContactDraft.email}
                                        onChange={(e) => setNewContactDraft((prev) => ({ ...prev, email: e.target.value }))}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="email@example.com"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Phone</label>
                                    <input
                                        type="text"
                                        value={newContactDraft.phone}
                                        onChange={(e) => setNewContactDraft((prev) => ({ ...prev, phone: e.target.value }))}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="966 ..."
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>City</label>
                                        <input
                                            type="text"
                                            value={newContactDraft.city}
                                            onChange={(e) => setNewContactDraft((prev) => ({ ...prev, city: e.target.value }))}
                                            className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                            placeholder="City"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Country</label>
                                        <input
                                            type="text"
                                            value={newContactDraft.country}
                                            onChange={(e) => setNewContactDraft((prev) => ({ ...prev, country: e.target.value }))}
                                            className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                            placeholder="Country"
                                        />
                                    </div>
                                </div>
                                <div className="pt-4">
                                <button
                                    type="button"
                                    onClick={handleCreateContactForSelectedAccount}
                                    className="w-full py-3 rounded-lg font-bold text-black hover:opacity-90 transition-opacity"
                                    style={{ backgroundColor: colors.primary }}
                                >
                                    Save Contact
                                </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <ConfirmDialog
                    isOpen={showDiscardDraftConfirm}
                    title="Discard?"
                    message="Discard unsaved changes and leave this form?"
                    confirmLabel="Yes"
                    cancelLabel="Cancel"
                    danger
                    onConfirm={confirmDiscardNewRequestDraftAction}
                    onCancel={() => setShowDiscardDraftConfirm(false)}
                />

                <ConfirmDialog
                    isOpen={showDeleteRequestConfirm}
                    title="Confirm Request Deletion"
                    message={
                        pendingDeleteRequest
                            ? `You are about to delete this request permanently.\n\nRequest ID: ${pendingDeleteRequest.id || 'N/A'}\nRequest Name: ${pendingDeleteRequest.requestName || 'Unnamed request'}\n\nDo you wish to continue?`
                            : 'Do you wish to continue?'
                    }
                    confirmLabel="Delete Request"
                    danger
                    onConfirm={() => {
                        if (!pendingDeleteRequest) return;
                        const id = pendingDeleteRequest.id;
                        setPendingDeleteRequest(null);
                        setShowDeleteRequestConfirm(false);
                        void deleteRequest(id);
                    }}
                    onCancel={() => {
                        setPendingDeleteRequest(null);
                        setShowDeleteRequestConfirm(false);
                    }}
                />

                <ConfirmDialog
                    isOpen={!!pendingPaymentRemove}
                    title="Remove payment line?"
                    message={
                        pendingPaymentRemove?.payment
                            ? `Remove this payment line from the request?\n\n${formatMoney(Number(pendingPaymentRemove.payment.amount || 0), 0)} — ${pendingPaymentRemove.payment.method || ''} — ${pendingPaymentRemove.payment.note || ''}`.trim()
                            : 'Remove this payment line from the request?'
                    }
                    confirmLabel="Remove payment"
                    danger
                    onConfirm={() => {
                        void executePendingPaymentRemove();
                    }}
                    onCancel={() => setPendingPaymentRemove(null)}
                />

                <RequestAlertsModal
                    isOpen={Boolean(requestAlertsModalId && requestAlertsModalRequest)}
                    theme={theme}
                    request={requestAlertsModalRequest}
                    canManage={canManageRequestAlerts && !requestAlertsModalAuto}
                    autoOpened={requestAlertsModalAuto}
                    actorName={requestLogUser}
                    onClose={() => {
                        setRequestAlertsModalId(null);
                        setRequestAlertsModalAuto(false);
                    }}
                    onSave={async (alerts) => {
                        const id = requestAlertsModalId;
                        if (!id) return;
                        await persistRequestAlerts(String(id), alerts);
                    }}
                />
                
                {showStatusModal && req && (
                    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowStatusModal(false)}></div>
                        <div className="relative w-full max-w-sm rounded-[24px] border shadow-2xl p-6 overflow-hidden animate-in zoom-in duration-300"
                            style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="font-bold text-lg mb-4" style={{ color: colors.textMain }}>Change Status</h3>
                            <div className="flex flex-col gap-2">
                                {['Inquiry', 'Accepted', 'Tentative', 'Definite', 'Actual'].map(status => (
                                    <button
                                        key={status}
                                        onClick={async () => {
                                            const newLogs = [{ date: new Date().toISOString(), user: requestLogUser, action: `Status changed to ${status}` }, ...(req.logs || [])];
                                            const updateData = { status, logs: newLogs };
                                            if (selectedRequest && selectedRequest.id === req.id) {
                                                setSelectedRequest((prev: any) => prev ? { ...prev, ...updateData } : null);
                                            }
                                            await updateRequest(req.id, updateData);
                                            setShowStatusModal(false);
                                            setActiveOptionsMenu(null);
                                        }}
                                        className="px-4 py-3 rounded-xl border text-left font-bold transition-all hover:bg-white/5 active:scale-95 text-xs"
                                        style={{ borderColor: req.status === status ? colors.primary : colors.border, color: colors.textMain }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor(status) }}></div>
                                            {status}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {showCancelModal && req && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCancelModal(false)}></div>
                        <div className="relative w-full max-w-md rounded-[24px] border shadow-2xl p-6 overflow-hidden animate-in zoom-in duration-300"
                            style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="font-bold text-lg mb-6" style={{ color: colors.textMain }}>Cancel Request</h3>
                            <div className="space-y-4 mb-6">
                                <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="w-full px-4 py-3 rounded-xl border bg-black/20 font-bold" style={{ borderColor: colors.border, color: colors.textMain }}>
                                    {cxlReasons.map((reason) => (
                                        <option key={reason} value={reason}>{reason}</option>
                                    ))}
                                </select>
                                <textarea value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} className="w-full px-4 py-3 rounded-xl border bg-black/20 font-medium h-24" placeholder="Notes..." style={{ borderColor: colors.border, color: colors.textMain }} />
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowCancelModal(false)} className="flex-1 py-3 rounded-xl border font-bold text-xs" style={{ borderColor: colors.border, color: colors.textMain }}>Keep Request</button>
                                <button onClick={async () => {
                                    const newLogs = [
                                        {
                                            date: new Date().toISOString(),
                                            user: requestLogUser,
                                            action: 'Cancellation: financial totals reset',
                                            details: 'Paid amount, payment lines, and total cost set to zero.',
                                        },
                                        { date: new Date().toISOString(), user: requestLogUser, action: `Cancelled: ${cancelReason}`, details: cancelNote },
                                        ...(req.logs || []),
                                    ];
                                    const updateData = {
                                        status: 'Cancelled',
                                        cancelReason,
                                        cancelNote,
                                        logs: newLogs,
                                        paidAmount: '0.00',
                                        payments: [] as any[],
                                        totalCost: '0.00',
                                        paymentStatus: 'Unpaid',
                                        grandTotalNoTax: 0,
                                    };
                                    if (selectedRequest && selectedRequest.id === req.id) {
                                        setSelectedRequest((prev: any) => prev ? { ...prev, ...updateData } : null);
                                    }
                                    await updateRequest(req.id, updateData);
                                    setShowCancelModal(false);
                                    setActiveOptionsMenu(null);
                                }} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-xs">Confirm Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

                {showBeoModal && beoTargetRequestId && (() => {
                    const beoReq = requests.find((r: any) => r.id === beoTargetRequestId) || (selectedRequest?.id === beoTargetRequestId ? selectedRequest : null);
                    if (!beoReq) {
                        return (
                            <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
                                <div className="absolute inset-0 bg-black/50" onClick={() => { setShowBeoModal(false); setBeoTargetRequestId(null); }} />
                                <div className="relative rounded-2xl border p-6 max-w-sm" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                    <p className="text-sm font-bold mb-4" style={{ color: colors.textMain }}>Request not found.</p>
                                    <button type="button" onClick={() => { setShowBeoModal(false); setBeoTargetRequestId(null); }} className="w-full py-2 rounded-xl border font-bold text-xs" style={{ borderColor: colors.border, color: colors.textMain }}>Close</button>
                                </div>
                            </div>
                        );
                    }
                    const beoFin = calculateAccFinancials(beoReq);
                    const beoEv = getEventDateWindow(beoReq);
                    const beoAgenda = beoReq.agenda || [];
                    const beoPkg = formatAgendaPackageSummary(beoAgenda) || beoReq.mealPlan || '—';
                    const beoAcc = getAccountForRequest(beoReq, accounts);
                    const beoFallbackDays = beoEv.start && beoEv.end ? inclusiveCalendarDays(beoEv.start, beoEv.end) : 1;
                    const beoDayDenom = Math.max(1, beoFin.totalEventDays || beoFallbackDays);
                    const beoEventCostPerDay = beoFin.eventCostWithTax / beoDayDenom;
                    const beoScopeGrand = getBeoScopeGrandTotalInclTax(beoFin, beoReq.requestType);
                    const beoPaid = Number(beoFin.paidAmount || 0);
                    const { remaining: beoRemaining, payLabel: beoPayLabel } = deriveBeoPaymentView(beoPaid, beoScopeGrand);
                    const beoTypeKey = normalizeRequestTypeKey(beoReq.requestType);
                    return (
                        <>
                            <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
                                {/* Backdrop without click-to-close — avoids losing context after print preview / mis-clicks. Use X to close. */}
                                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
                                <div className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200"
                                    style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                    <div className="shrink-0 p-4 border-b flex flex-wrap items-center gap-2 justify-between" style={{ borderColor: colors.border }}>
                                        <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: colors.textMain }}>Banquet event order (BEO)</h3>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => printBeoDocument(beoReq, beoFin, beoNotesDraft, accounts, activeProperty)}
                                                className="px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2"
                                                style={{ backgroundColor: colors.primary, color: contrastOn(colors.primary) }}
                                            >
                                                <Printer size={14} /> Print
                                            </button>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    await updateRequest(beoTargetRequestId, { beoNotes: beoNotesDraft });
                                                    if (selectedRequest?.id === beoTargetRequestId) {
                                                        setSelectedRequest((prev: any) => prev ? { ...prev, beoNotes: beoNotesDraft } : null);
                                                    }
                                                }}
                                                className="px-4 py-2 rounded-xl border font-bold text-xs" style={{ borderColor: colors.border, color: colors.textMain }}>
                                                Save notes
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setShowBeoModal(false); setBeoTargetRequestId(null); }}
                                                className="p-2 rounded-xl border" style={{ borderColor: colors.border, color: colors.textMain }}>
                                                <X size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-6 text-left" style={{ color: colors.textMain }}>
                                        <div className="border-b pb-4 mb-4 flex flex-wrap items-start justify-between gap-4" style={{ borderColor: colors.border }}>
                                            <div>
                                                <h1 className="text-2xl font-black" style={{ color: colors.textMain }}>BEO — {beoReq.confirmationNo}</h1>
                                                <p className="text-sm mt-1 font-bold">{beoReq.account}</p>
                                                <p className="text-xs opacity-70 mt-2">Request status: <span className="font-bold">{beoReq.status || '—'}</span> · Type: <span className="font-bold">{beoReq.requestType || beoTypeKey}</span></p>
                                                <p className="text-xs font-mono opacity-50 mt-1">ID: {beoReq.id}</p>
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
                                                    {!beoAcc ? (
                                                        <tr>
                                                            <td className="py-2 pr-2">1</td>
                                                            <td className="py-2 pr-2 font-bold">Primary Contact</td>
                                                            <td className="py-2 pr-2">—</td>
                                                            <td className="py-2 pr-2">—</td>
                                                            <td className="py-2">—</td>
                                                        </tr>
                                                    ) : (
                                                        (() => {
                                                            const list = (Array.isArray(beoAcc.contacts) ? beoAcc.contacts : [])
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
                                                                    <td className="py-2 pr-2">{beoAcc?.phone || '—'}</td>
                                                                    <td className="py-2">{beoAcc?.email || '—'}</td>
                                                                </tr>
                                                            );
                                                        })()
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-6">
                                            <div><span className="font-bold uppercase text-[10px] opacity-50">Start</span><br />{beoEv.start || '—'}</div>
                                            <div><span className="font-bold uppercase text-[10px] opacity-50">End</span><br />{beoEv.end || '—'}</div>
                                            <div><span className="font-bold uppercase text-[10px] opacity-50">Package</span><br />{beoPkg}</div>
                                            <div><span className="font-bold uppercase text-[10px] opacity-50">Event days</span><br />{beoFin.totalEventDays || beoFallbackDays}</div>
                                            <div><span className="font-bold uppercase text-[10px] opacity-50">Total attendees (pax × days)</span><br />{beoFin.totalEventAttendeeDays ?? beoFin.totalEventPax} <span className="text-[10px] opacity-50">({beoFin.totalEventPax} pax)</span></div>
                                            <div><span className="font-bold uppercase text-[10px] opacity-50">DDR (per person)</span><br />{formatMoney(beoFin.ddr)}</div>
                                            <div className="md:col-span-2"><span className="font-bold uppercase text-[10px] opacity-50">Event cost per day (incl. tax)</span><br />{formatMoney(beoEventCostPerDay)}</div>
                                        </div>

                                        <h4 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Agenda</h4>
                                        <div className="overflow-x-auto mb-6">
                                            <table className="w-full text-xs border-collapse min-w-[900px]">
                                                <thead>
                                                    <tr className="border-b opacity-60" style={{ borderColor: colors.border }}>
                                                        <th className="text-left py-2 pr-2">Start</th>
                                                        <th className="text-left py-2 pr-2">End</th>
                                                        <th className="text-left py-2 pr-2">Session time</th>
                                                        <th className="text-left py-2 pr-2">Package timing</th>
                                                        <th className="text-left py-2 pr-2">Venue</th>
                                                        <th className="text-left py-2 pr-2">Shape</th>
                                                        <th className="text-left py-2 pr-2">Package</th>
                                                        <th className="text-center py-2">Pax</th>
                                                        <th className="text-right py-2">Rate</th>
                                                        <th className="text-right py-2">Rental</th>
                                                        <th className="text-right py-2">Line</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {beoAgenda.length === 0 ? (
                                                        <tr><td colSpan={11} className="py-4 italic opacity-50">No agenda</td></tr>
                                                    ) : beoAgenda.map((row: any, i: number) => {
                                                        const line = (Number(row.rate || 0) * Number(row.pax || 0)) + Number(row.rental || 0);
                                                        return (
                                                            <tr key={row.id ?? i} className="border-b align-top" style={{ borderColor: colors.border }}>
                                                                <td className="py-2 pr-2">{row.startDate || '—'}</td>
                                                                <td className="py-2 pr-2">{row.endDate || row.startDate || '—'}</td>
                                                                <td className="py-2 pr-2 whitespace-nowrap">{[row.startTime, row.endTime].filter(Boolean).join(' – ') || '—'}</td>
                                                                <td className="py-2 pr-2 whitespace-nowrap">{agendaPackageTimingSummary(row) || '—'}</td>
                                                                <td className="py-2 pr-2">{formatAgendaRowVenueDisplay(row) || '—'}</td>
                                                                <td className="py-2 pr-2">{row.shape || '—'}</td>
                                                                <td className="py-2 pr-2">{row.package || '—'}</td>
                                                                <td className="text-center py-2">{row.pax ?? '—'}</td>
                                                                <td className="text-right py-2 font-mono">{Number(row.rate || 0).toLocaleString()}</td>
                                                                <td className="text-right py-2 font-mono">{Number(row.rental || 0).toLocaleString()}</td>
                                                                <td className="text-right py-2 font-mono font-bold text-primary">{line.toLocaleString()}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {beoReq.note ? (
                                            <div className="mb-6 p-3 rounded-xl border text-sm" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                                <span className="font-bold uppercase text-[10px] opacity-50">Special requests</span>
                                                <p className="mt-1 whitespace-pre-wrap">{beoReq.note}</p>
                                            </div>
                                        ) : null}

                                        <div className="text-sm mb-4 space-y-1 p-4 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                            <p><span className="font-bold">Event total (incl. tax):</span> {formatMoney(beoScopeGrand)}</p>
                                        </div>

                                        <div className="p-4 rounded-xl border mb-4 space-y-2" style={{ borderColor: colors.primary + '40', backgroundColor: colors.primary + '08' }}>
                                            <h4 className="text-xs font-black uppercase tracking-widest opacity-70">Payment</h4>
                                            <p className="text-sm"><span className="font-bold">Status:</span> {beoPayLabel}</p>
                                            <p className="text-sm"><span className="font-bold">Amount paid:</span> {formatMoney(beoPaid)}</p>
                                            <p className="text-sm"><span className="font-bold">Remaining balance:</span> {formatMoney(beoRemaining)}</p>
                                        </div>

                                        <div className="mb-4">
                                            <label className="text-[10px] font-black uppercase opacity-50">Special requests (from request)</label>
                                            <div
                                                className="w-full mt-1 px-3 py-2 rounded-xl border min-h-[72px] text-sm whitespace-pre-wrap"
                                                style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg + '80' }}
                                            >
                                                {formatBeoSpecialRequestsCombined(beoReq) || '—'}
                                            </div>
                                        </div>
                                        <div className="mb-2">
                                            <label className="text-[10px] font-black uppercase opacity-50">Operations notes (BEO)</label>
                                            <textarea
                                                value={beoNotesDraft}
                                                onChange={(e) => setBeoNotesDraft(e.target.value)}
                                                className="w-full mt-1 px-3 py-2 rounded-xl border min-h-[100px] text-sm"
                                                style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg }}
                                                placeholder="Banquet / ops notes…"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    );
                })()}

                {showGisModal && gisTargetRequestId && (() => {
                    const gisReq = requests.find((r: any) => String(r.id) === String(gisTargetRequestId)) || (selectedRequest?.id === gisTargetRequestId ? selectedRequest : null);
                    if (!gisReq) return null;
                    const gisType = normalizeRequestTypeKey(gisReq.requestType);
                    if (!isGisEligibleType(gisReq)) return null;
                    const gisAcc = getAccountForRequest(gisReq, accounts);
                    const roomLines = buildGisRoomLines(gisReq);
                    const gisSeriesType = gisType === 'series';
                    const lineIncludedInGis = (l: (typeof roomLines)[0]) =>
                        !gisSeriesType || gisSeriesRowInclude[l.seriesGroupIndex ?? -1] !== false;
                    const selectedGisLines = roomLines.filter(lineIncludedInGis);
                    const gisRoomFin = calculateAccFinancialsForRequest(gisReq, taxesList, gisReq.requestType);
                    const totalRoomsGis = selectedGisLines.reduce((s, l) => s + l.roomCount, 0);
                    const totalRoomNightsGis = selectedGisLines.reduce((s, l) => s + l.roomNights, 0);
                    const totalRevenueExTaxGis = selectedGisLines.reduce((s, l) => s + l.revenue, 0);
                    const baseRoomsNoTax = gisRoomFin.roomsCostNoTax;
                    const totalRevenueInclTaxGis =
                        baseRoomsNoTax > 0
                            ? gisRoomFin.roomsCostWithTax * (totalRevenueExTaxGis / baseRoomsNoTax)
                            : totalRevenueExTaxGis;
                    const paidAmountGis = parseNum(gisReq.paidAmount);
                    const { remaining: gisRemaining, payLabel: gisPayLabel } = deriveBeoPaymentView(
                        paidAmountGis,
                        totalRevenueInclTaxGis
                    );
                    const gisPayColor =
                        gisPayLabel === 'Paid'
                            ? colors.green
                            : gisPayLabel === 'Partial / deposit'
                              ? colors.yellow
                              : colors.textMuted;
                    const seriesGroupIndices = gisSeriesType
                        ? [...new Set(roomLines.map((l) => l.seriesGroupIndex).filter((x): x is number => x !== undefined))]
                        : [];
                    const allSeriesPrintChecked =
                        !gisSeriesType ||
                        seriesGroupIndices.length === 0 ||
                        seriesGroupIndices.every((i) => gisSeriesRowInclude[i] !== false);
                    const contacts = (Array.isArray(gisAcc?.contacts) ? gisAcc.contacts : [])
                        .filter((c: any) => contactDisplayName(c) || c?.email || c?.phone);

                    return (
                        <div className="fixed inset-0 z-[165] flex items-center justify-center p-4">
                            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
                            <div className="relative w-full max-w-5xl max-h-[92vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200"
                                style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <div className="shrink-0 p-4 border-b flex flex-wrap items-center gap-2 justify-between" style={{ borderColor: colors.border }}>
                                    <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: colors.textMain }}>Group Information Sheet (GIS)</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (selectedGisLines.length === 0) {
                                                    showSystemNotice(
                                                        'GIS',
                                                        'Select at least one check-in block (series) or ensure room lines exist before printing.'
                                                    );
                                                    return;
                                                }
                                                const arrivalTime = String(gisExpectedArrivalTimeDraft || '').trim();
                                                if (!arrivalTime) {
                                                    showSystemNotice(
                                                        'GIS',
                                                        'Expected arrival time is required before printing the GIS.\n\n' +
                                                            'Enter the time the group is expected to arrive at the property, then try Print again.'
                                                    );
                                                    return;
                                                }
                                                const popup = window.open('', '_blank', 'width=1200,height=900');
                                                if (!popup) return;
                                                const esc = (v: any) =>
                                                    String(v ?? '')
                                                        .replace(/&/g, '&amp;')
                                                        .replace(/</g, '&lt;')
                                                        .replace(/>/g, '&gt;');
                                                const linesHtml = selectedGisLines.map((l, idx) => `
                                                    <tr>
                                                        <td>${idx + 1}</td>
                                                        <td>${esc(l.checkIn || '—')}</td>
                                                        <td>${esc(l.checkOut || '—')}</td>
                                                        <td>${esc(l.roomType)}</td>
                                                        <td>${esc(l.occupancy)}</td>
                                                        <td style="text-align:center;">${l.roomCount}</td>
                                                        <td style="text-align:center;">${l.nights}</td>
                                                        <td style="text-align:center;">${l.roomNights}</td>
                                                        <td style="text-align:right;">${formatMoney(l.rate, 0)}</td>
                                                        <td style="text-align:right;">${formatMoney(l.revenue, 0)}</td>
                                                        <td>${esc(l.mealPlan || '—')}</td>
                                                    </tr>
                                                `).join('');
                                                const contactRowsHtml = contacts.length
                                                    ? contacts.map((c: any, idx: number) => `
                                                        <tr>
                                                            <td>${idx + 1}</td>
                                                            <td>${esc(contactDisplayName(c) || 'Contact')}</td>
                                                            <td>${esc(c?.position || '—')}</td>
                                                            <td>${esc(c?.phone || '—')}</td>
                                                            <td>${esc(c?.email || '—')}</td>
                                                        </tr>
                                                    `).join('')
                                                    : `
                                                        <tr>
                                                            <td>1</td>
                                                            <td>Primary Contact</td>
                                                            <td>—</td>
                                                            <td>${esc(gisAcc?.phone || '—')}</td>
                                                            <td>${esc(gisAcc?.email || '—')}</td>
                                                        </tr>
                                                    `;
                                                popup.document.write(`
                                                    <html><head><title>GIS ${gisReq.confirmationNo || gisReq.id}</title>
                                                    <style>
                                                    body{font-family:Arial,sans-serif;padding:24px;color:#111}
                                                    table{width:100%;border-collapse:collapse;margin-top:8px}
                                                    th,td{border:1px solid #cfd4dc;padding:6px;font-size:12px}
                                                    th{background:#f6f7fa;text-align:left}
                                                    .box{border:1px solid #cfd4dc;border-radius:8px;padding:10px;margin-top:10px;white-space:pre-wrap}
                                                    .kpis{display:grid;grid-template-columns:repeat(2,minmax(200px,1fr));gap:8px;margin-top:10px}
                                                    .kpi{border:1px solid #cfd4dc;border-radius:8px;padding:10px;background:#fbfcff}
                                                    .kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;opacity:0.7;margin-bottom:4px}
                                                    .kpi-value{font-size:16px;font-weight:700}
                                                    </style>
                                                    </head><body>
                                                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
                                                        <div><h2 style="margin:0;">Group Information Sheet (GIS)</h2><div>${activeProperty?.name || 'Property'}</div></div>
                                                        ${activeProperty?.logoUrl ? `<img src="${activeProperty.logoUrl}" style="height:56px;max-width:160px;object-fit:contain;" />` : ''}
                                                    </div>
                                                    <p><b>Company:</b> ${esc(gisReq.account || gisReq.accountName || '—')}<br/><b>Group:</b> ${esc(gisReq.requestName || gisReq.confirmationNo || gisReq.id || '—')}<br/><b>Type:</b> ${esc(gisReq.requestType || gisType)}<br/><b>Status:</b> ${esc(gisReq.status || '—')}<br/><b>Expected arrival time:</b> ${esc(arrivalTime)}</p>
                                                    <div class="box">
                                                        <b>Contacts</b>
                                                        <table>
                                                            <thead><tr><th style="width:48px">#</th><th>Name</th><th>Position</th><th>Phone</th><th>Email</th></tr></thead>
                                                            <tbody>${contactRowsHtml}</tbody>
                                                        </table>
                                                    </div>
                                                    <table>
                                                        <thead><tr><th>#</th><th>Check-in</th><th>Check-out</th><th>Room Type</th><th>Occupancy</th><th>Rooms</th><th>Nights</th><th>Total RN</th><th>Rate / Night</th><th>Total Revenue</th><th>Meal Plan</th></tr></thead>
                                                        <tbody>${linesHtml || '<tr><td colspan="11">No room lines</td></tr>'}</tbody>
                                                    </table>
                                                    <div class="box"><b>Billing Instructions</b><br/>${esc(gisBillingDraft || '—')}</div>
                                                    <div class="box"><b>Special Operational Notes</b><br/>${esc(gisOpsNotesDraft || '—')}</div>
                                                    <div class="kpis">
                                                        <div class="kpi"><div class="kpi-label">Total rooms</div><div class="kpi-value">${totalRoomsGis}</div></div>
                                                        <div class="kpi"><div class="kpi-label">Total room nights</div><div class="kpi-value">${totalRoomNightsGis}</div></div>
                                                        <div class="kpi"><div class="kpi-label">Total revenue (excl. tax)</div><div class="kpi-value">${formatMoney(totalRevenueExTaxGis, 0)}</div></div>
                                                        <div class="kpi"><div class="kpi-label">Total revenue (incl. tax)</div><div class="kpi-value">${formatMoney(totalRevenueInclTaxGis, 0)}</div></div>
                                                        <div class="kpi"><div class="kpi-label">Payment status (for selection)</div><div class="kpi-value">${esc(gisPayLabel)}</div></div>
                                                        <div class="kpi"><div class="kpi-label">Paid amount</div><div class="kpi-value">${formatMoney(paidAmountGis, 0)}</div></div>
                                                        <div class="kpi"><div class="kpi-label">Remaining payment</div><div class="kpi-value">${formatMoney(gisRemaining, 0)}</div></div>
                                                    </div>
                                                    </body></html>
                                                `);
                                                popup.document.close();
                                                popup.focus();
                                                popup.print();
                                            }}
                                            className="px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2"
                                            style={{ backgroundColor: colors.primary, color: contrastOn(colors.primary) }}
                                        >
                                            <Printer size={14} /> Print
                                        </button>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                await updateRequest(gisTargetRequestId, {
                                                    gisBillingInstructions: gisBillingDraft,
                                                    gisOperationalNotes: gisOpsNotesDraft,
                                                    gisExpectedArrivalTime: String(gisExpectedArrivalTimeDraft || '').trim(),
                                                });
                                                if (selectedRequest?.id === gisTargetRequestId) {
                                                    setSelectedRequest((prev: any) => prev ? {
                                                        ...prev,
                                                        gisBillingInstructions: gisBillingDraft,
                                                        gisOperationalNotes: gisOpsNotesDraft,
                                                        gisExpectedArrivalTime: String(gisExpectedArrivalTimeDraft || '').trim(),
                                                    } : null);
                                                }
                                                setShowGisModal(false);
                                                setGisTargetRequestId(null);
                                                setGisSeriesRowInclude({});
                                                setGisExpectedArrivalTimeDraft('');
                                            }}
                                            className="px-4 py-2 rounded-xl border font-bold text-xs"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        >
                                            Save GIS informations
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowGisModal(false);
                                                setGisTargetRequestId(null);
                                                setGisSeriesRowInclude({});
                                                setGisExpectedArrivalTimeDraft('');
                                            }}
                                            className="px-4 py-2 rounded-xl border font-bold text-xs"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                                    <div
                                        className="p-4 rounded-xl border-2 mb-5"
                                        style={{ borderColor: colors.primary + '66', backgroundColor: colors.primary + '0d' }}
                                    >
                                        <label
                                            htmlFor="gis-expected-arrival-time"
                                            className="block text-xs font-black uppercase tracking-wide"
                                            style={{ color: colors.textMain }}
                                        >
                                            Expected arrival time{' '}
                                            <span className="text-red-500 normal-case font-black">(required to print GIS)</span>
                                        </label>
                                        <p className="text-[11px] mt-1 mb-2 leading-snug" style={{ color: colors.textMuted }}>
                                            The time the group is expected to arrive at the property. This value is saved with the GIS and must be set before you print.
                                        </p>
                                        <input
                                            id="gis-expected-arrival-time"
                                            type="time"
                                            value={gisExpectedArrivalTimeDraft}
                                            onChange={(e) => setGisExpectedArrivalTimeDraft(e.target.value)}
                                            className="w-full max-w-[220px] px-3 py-2 rounded-xl border text-sm font-bold"
                                            style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg }}
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                                        <div>
                                            <h2 className="text-2xl font-black" style={{ color: colors.textMain }}>GIS — {gisReq.confirmationNo || gisReq.id}</h2>
                                            <p className="text-sm mt-1 font-bold" style={{ color: colors.textMain }}>{gisReq.account || gisReq.accountName || '—'}</p>
                                            <p className="text-xs opacity-70 mt-1">Group: <span className="font-bold">{gisReq.requestName || '—'}</span> · Type: <span className="font-bold">{gisReq.requestType || gisType}</span></p>
                                        </div>
                                        <div className="text-right">
                                            {activeProperty?.logoUrl ? (
                                                <img src={activeProperty.logoUrl} alt="Property logo" className="h-14 ml-auto object-contain max-w-[180px]" />
                                            ) : null}
                                            <p className="text-xs font-bold mt-2" style={{ color: colors.textMain }}>{activeProperty?.name || 'Property'}</p>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-xl border mb-4" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                        <h4 className="text-[11px] font-black uppercase tracking-widest opacity-60 mb-2">Contact Details</h4>
                                        <div className="overflow-x-auto">
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
                                                    {contacts.length > 0 ? contacts.map((c: any, i: number) => (
                                                        <tr key={i} className="border-b" style={{ borderColor: colors.border }}>
                                                            <td className="py-2 pr-2">{i + 1}</td>
                                                            <td className="py-2 pr-2 font-bold">{contactDisplayName(c) || `Contact ${i + 1}`}</td>
                                                            <td className="py-2 pr-2">{c?.position || '—'}</td>
                                                            <td className="py-2 pr-2">{c?.phone || '—'}</td>
                                                            <td className="py-2">{c?.email || '—'}</td>
                                                        </tr>
                                                    )) : (
                                                        <tr>
                                                            <td className="py-2 pr-2">1</td>
                                                            <td className="py-2 pr-2 font-bold">Primary Contact</td>
                                                            <td className="py-2 pr-2">—</td>
                                                            <td className="py-2 pr-2">{gisAcc?.phone || '—'}</td>
                                                            <td className="py-2">{gisAcc?.email || '—'}</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto mb-5">
                                        {gisSeriesType ? (
                                            <p className="text-[10px] font-bold uppercase opacity-50 mb-2">
                                                Include in print — uncheck rows to exclude them from the printed GIS and from totals below.
                                            </p>
                                        ) : null}
                                        <table className="w-full text-xs border-collapse min-w-[980px]">
                                            <thead>
                                                <tr className="border-b opacity-70" style={{ borderColor: colors.border }}>
                                                    {gisSeriesType ? (
                                                        <th className="text-center py-2 pr-2 w-10" title="Include in print">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border cursor-pointer"
                                                                style={{ borderColor: colors.border }}
                                                                checked={allSeriesPrintChecked}
                                                                onChange={() => {
                                                                    setGisSeriesRowInclude((prev) => {
                                                                        const next = { ...prev };
                                                                        const on = seriesGroupIndices.every((i) => prev[i] !== false);
                                                                        seriesGroupIndices.forEach((i) => {
                                                                            next[i] = !on;
                                                                        });
                                                                        return next;
                                                                    });
                                                                }}
                                                            />
                                                        </th>
                                                    ) : null}
                                                    <th className="text-left py-2 pr-2">#</th>
                                                    <th className="text-left py-2 pr-2">Check-in</th>
                                                    <th className="text-left py-2 pr-2">Check-out</th>
                                                    <th className="text-left py-2 pr-2">Room Type</th>
                                                    <th className="text-left py-2 pr-2">Occupancy</th>
                                                    <th className="text-center py-2">Rooms</th>
                                                    <th className="text-center py-2">Nights</th>
                                                    <th className="text-center py-2">Total RN</th>
                                                    <th className="text-right py-2">Rate/Night</th>
                                                    <th className="text-right py-2">Revenue</th>
                                                    <th className="text-left py-2">Meal Plan</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {roomLines.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={gisSeriesType ? 12 : 11} className="py-4 italic opacity-50">
                                                            No room lines
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    roomLines.map((line, idx) => {
                                                        const gi = line.seriesGroupIndex;
                                                        const checked = !gisSeriesType || gisSeriesRowInclude[gi ?? -1] !== false;
                                                        return (
                                                            <tr
                                                                key={`${line.roomType}-${line.occupancy}-${gi ?? idx}`}
                                                                className="border-b"
                                                                style={{ borderColor: colors.border, opacity: gisSeriesType && !checked ? 0.45 : 1 }}
                                                            >
                                                                {gisSeriesType ? (
                                                                    <td className="text-center py-2 pr-2">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="rounded border cursor-pointer"
                                                                            style={{ borderColor: colors.border }}
                                                                            checked={checked}
                                                                            onChange={() => {
                                                                                if (gi === undefined) return;
                                                                                setGisSeriesRowInclude((prev) => ({
                                                                                    ...prev,
                                                                                    [gi]: prev[gi] === false,
                                                                                }));
                                                                            }}
                                                                        />
                                                                    </td>
                                                                ) : null}
                                                                <td className="py-2 pr-2">{idx + 1}</td>
                                                                <td className="py-2 pr-2">{line.checkIn || '—'}</td>
                                                                <td className="py-2 pr-2">{line.checkOut || '—'}</td>
                                                                <td className="py-2 pr-2 font-bold">{line.roomType}</td>
                                                                <td className="py-2 pr-2">{line.occupancy}</td>
                                                                <td className="text-center py-2">{line.roomCount}</td>
                                                                <td className="text-center py-2">{line.nights}</td>
                                                                <td className="text-center py-2 font-bold">{line.roomNights}</td>
                                                                <td className="text-right py-2">{formatMoney(line.rate, 0)}</td>
                                                                <td className="text-right py-2 font-bold">{formatMoney(line.revenue, 0)}</td>
                                                                <td className="py-2">{line.mealPlan || '—'}</td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {gisSeriesType && selectedGisLines.length === 0 && roomLines.length > 0 ? (
                                        <p className="text-xs font-bold text-amber-600 mb-3">Select at least one check-in block to show totals and print.</p>
                                    ) : null}

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-5">
                                        <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                            <span className="font-bold uppercase text-[10px] opacity-50">Total rooms</span>
                                            <p className="font-black text-lg mt-1" style={{ color: colors.textMain }}>{totalRoomsGis}</p>
                                        </div>
                                        <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                            <span className="font-bold uppercase text-[10px] opacity-50">Total room nights</span>
                                            <p className="font-black text-lg mt-1" style={{ color: colors.textMain }}>{totalRoomNightsGis}</p>
                                        </div>
                                        <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                            <span className="font-bold uppercase text-[10px] opacity-50">Total revenue (excl. tax)</span>
                                            <p className="font-black text-lg mt-1" style={{ color: colors.textMain }}>{formatMoney(totalRevenueExTaxGis, 0)}</p>
                                        </div>
                                        <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                            <span className="font-bold uppercase text-[10px] opacity-50">Total revenue (incl. tax)</span>
                                            <p className="font-black text-lg mt-1" style={{ color: colors.textMain }}>{formatMoney(totalRevenueInclTaxGis, 0)}</p>
                                        </div>
                                        <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                            <span className="font-bold uppercase text-[10px] opacity-50">Payment status</span>
                                            <p className="font-black text-lg mt-1" style={{ color: gisPayColor }}>{gisPayLabel}</p>
                                            {gisSeriesType ? (
                                                <p className="text-[9px] opacity-50 mt-1 font-bold uppercase">Vs. selected rooms (incl. tax)</p>
                                            ) : null}
                                        </div>
                                        <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                            <span className="font-bold uppercase text-[10px] opacity-50">Paid amount</span>
                                            <p className="font-black text-lg mt-1" style={{ color: colors.textMain }}>{formatMoney(paidAmountGis, 0)}</p>
                                        </div>
                                        <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                            <span className="font-bold uppercase text-[10px] opacity-50">Remaining payment</span>
                                            <p className="font-black text-lg mt-1" style={{ color: colors.textMain }}>{formatMoney(gisRemaining, 0)}</p>
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <label className="text-[10px] font-black uppercase opacity-50">Billing Instructions</label>
                                        <textarea
                                            value={gisBillingDraft}
                                            onChange={(e) => setGisBillingDraft(e.target.value)}
                                            className="w-full mt-1 px-3 py-2 rounded-xl border min-h-[90px] text-sm"
                                            style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg }}
                                            placeholder="Add billing instructions for operations / finance..."
                                        />
                                    </div>

                                    <div className="mb-2">
                                        <label className="text-[10px] font-black uppercase opacity-50">Special Operational Notes</label>
                                        <textarea
                                            value={gisOpsNotesDraft}
                                            onChange={(e) => setGisOpsNotesDraft(e.target.value)}
                                            className="w-full mt-1 px-3 py-2 rounded-xl border min-h-[90px] text-sm"
                                            style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg }}
                                            placeholder="Arrival prep, rooming notes, special handling..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {optionsModal}
            </>
        );
    };

    if (detailHeadless) {
        const closeDetailOverlay = () => {
            setSelectedRequest(null);
            onDetailHeadlessDismiss?.();
        };
        const detailRequest = selectedRequest || headlessInitialRequest;
        return (
            <>
                {detailRequest ? (
                    <div
                        className="fixed inset-0 z-[220] flex items-center justify-center p-3 md:p-6"
                        onClick={closeDetailOverlay}
                    >
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                        <div
                            className="relative w-full max-w-[96rem] max-h-[95vh] min-h-0 flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex-1 min-h-0 overflow-y-auto">
                                {renderRequestDetailView({
                                    request: detailRequest,
                                    onClose: closeDetailOverlay,
                                })}
                            </div>
                        </div>
                    </div>
                ) : null}
                {optionsModal}
                {renderGlobalModals()}
            </>
        );
    }

    if (optsHeadless) {
        return (
            <>
                {optionsModal}
                {renderGlobalModals()}
            </>
        );
    }

    // Workflow Screens
    if (subView === 'new_request') {
        let formContent: any;
        if (step === 1) formContent = renderTypeSelection();
        else if (requestType === 'accommodation') formContent = renderAccommodationForm();
        else if (requestType === 'event') formContent = renderAccommodationForm();
        else if (requestType === 'event_rooms') formContent = renderAccommodationForm();
        else if (requestType === 'series') formContent = renderAccommodationForm();
        else formContent = renderAccommodationForm();
        if (embedded) {
            return (
                <div className="flex flex-col h-full min-h-0 max-h-[88vh] rounded-2xl overflow-hidden border shadow-2xl" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                    <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: colors.textMain }}>
                            {requestType === 'event_rooms' ? 'Event with accommodation' : requestType === 'event' ? 'Event' : 'New request'}
                        </h2>
                        <button type="button" onClick={() => onEmbeddedCancel?.()} className="p-2 rounded-lg hover:bg-white/10 transition-colors" style={{ color: colors.textMuted }} aria-label="Close">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">{formContent}</div>
                    {renderGlobalModals()}
                </div>
            );
        }
        return <>{formContent}{renderGlobalModals()}</>;
    }

    if (selectedRequest) {
        return <>{renderRequestDetailView({ request: selectedRequest, onClose: () => setSelectedRequest(null) })}{renderGlobalModals()}</>;
    }

    // Mock requests data - No longer needed, using requests state

    const columnLabels: any = {
        options: '',
        details: 'Confirmation No.',
        requestName: 'Request Name',
        account: 'Account',
        account_type: 'Account Type',
        request_segment: 'Request Segment',
        type: 'Type',
        meal: 'Meal',
        status: 'Status',
        dates: 'Dates',
        stay_info: 'Info',
        paid_amount: 'Paid Amount',
        total_cost: 'Total Cost',
    };

    const accountTypeFromLinkedAccount = (req: any) => {
        const fromReq = String(req?.accountType || '').trim();
        const aid = String(req?.accountId || '').trim();
        const name = String(req?.accountName || req?.account || '')
            .trim()
            .toLowerCase();
        const acc = (accounts || []).find(
            (a: any) =>
                (aid && String(a.id) === aid) || (name && String(a.name || '').trim().toLowerCase() === name)
        );
        const fromAcc = String(acc?.type || '').trim();
        return fromAcc || fromReq || '—';
    };

    const requestSegmentListLabel = (req: any) => String(req?.segment || '').trim() || '—';

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    };

    const getAvatarColor = (name: string) => {
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    /** Status chroma for request list, kanban rows, and UI dots (theme tokens — not grid row fills). */
    const getStatusColor = (status: string) => {
        const s = String(status || '').trim().toLowerCase();
        switch (s) {
            case 'inquiry':
                return colors.textMuted;
            case 'accepted':
                return colors.yellow;
            case 'tentative':
                return colors.blue;
            case 'definite':
                return colors.green;
            case 'actual':
                return '#059669';
            case 'lost':
            case 'cancelled':
                return colors.red;
            default:
                return colors.primary;
        }
    };

    /** Bright accent for rooms grid only (left bar + status label on tinted row backgrounds). */
    const getGridRoomsStatusAccent = (status: string) => {
        const s = String(status || '').trim().toLowerCase();
        switch (s) {
            case 'inquiry':
                return '#cbd5e1';
            case 'accepted':
                return '#facc15';
            case 'tentative':
                return colors.blue;
            case 'definite':
                return '#4ade80';
            case 'actual':
                return '#4ade80';
            case 'lost':
            case 'cancelled':
                return colors.red;
            default:
                return colors.primary;
        }
    };

    /**
     * Solid fill for rooms grid: company, group, and day cells with room counts.
     * Dark themes: legacy browns/greens; light themes: soft pastels on blue/white/desert.
     */
    const getGridRoomsRowBackground = (status: string) => {
        const s = String(status || '').trim().toLowerCase();
        if (gridRoomsThemeDark) {
            switch (s) {
                case 'inquiry':
                    return '#2a3544';
                case 'accepted':
                    return '#63481D';
                case 'tentative':
                    return '#1e3a5f';
                case 'definite':
                    return '#1a452d';
                case 'actual':
                    return '#163020';
                case 'lost':
                case 'cancelled':
                    return '#3f1519';
                default:
                    return '#2a3544';
            }
        }
        switch (s) {
            case 'inquiry':
                return '#e2e8f0';
            case 'accepted':
                return '#fde68a';
            case 'tentative':
                return '#bfdbfe';
            case 'definite':
                return '#bbf7d0';
            case 'actual':
                return '#86efac';
            case 'lost':
            case 'cancelled':
                return '#fecaca';
            default:
                return '#e2e8f0';
        }
    };

    const toShortPackage = (pkg: string) => {
        const p = String(pkg || '').toLowerCase().trim();
        if (!p) return '';
        if (p === 'coffee break') return 'CB';
        if (p === 'full day') return 'FD';
        if (p === 'half day') return 'HD';
        return p.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 3);
    };

    const mealPlanShort = (meal: string) => {
        const m = String(meal || '').toUpperCase().trim();
        if (!m) return '';
        if (m === 'MIX') return 'MIX';
        if (m === 'RO' || m === 'BB' || m === 'HB' || m === 'FB') return m;
        if (m === 'BREAKFAST') return 'BB';
        if (m === 'HALF BOARD') return 'HB';
        if (m === 'FULL BOARD') return 'FB';
        return m.slice(0, 2);
    };

    const getMealCellValue = (request: any) => {
        const type = normalizeRequestTypeKey(request.requestType);
        const pkg = toShortPackage((request.agenda && request.agenda[0]?.package) || '');
        const roomMealsAgg = deriveRequestMealLabelFromRooms(request.rooms, request.mealPlan);
        const meal = roomMealsAgg === 'MIX' ? 'MIX' : mealPlanShort(roomMealsAgg);
        if (type === 'event') return pkg || '-';
        if (type === 'event_rooms') {
            if (meal && pkg) return `${meal}/${pkg}`;
            return meal || pkg || '-';
        }
        return meal || '-';
    };

    /** Same figure as the Total Cost column: grand total including tax. */
    const requestInclTaxTotal = (request: any) => {
        const fin = calculateAccFinancials(request);
        const fallbackEventTotal = (request.agenda || []).reduce((sum: number, item: any) => sum + (Number(item.rate || 0) * Number(item.pax || 0)) + Number(item.rental || 0), 0);
        const rawTotal = parseFloat(String(request.totalCost ?? '').replace(/,/g, '') || '0');
        return fin?.grandTotalWithTax || (rawTotal > 0 ? rawTotal : fallbackEventTotal);
    };

    const handleColumnDragStart = (column: string) => {
        setDraggedColumn(column);
    };

    const handleColumnDrop = (targetColumn: string) => {
        if (!draggedColumn || draggedColumn === targetColumn) return;

        const newOrder = [...columnOrder];
        const draggedIndex = newOrder.indexOf(draggedColumn);
        const targetIndex = newOrder.indexOf(targetColumn);

        newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, draggedColumn);

        setColumnOrder(newOrder);
        setDraggedColumn(null);
    };

    const handleSearchRequests = () => {
        const params = getSearchOnlyParams(searchParams);
        setSearchResults(filterRequestsByAdvancedSearch(requests, params, assignableUsersForProperty));
        setSearchFormExpanded(false);
    };

    const accountLabel = (req: any) => String(req.account || req.accountName || '').trim();

    const renderRequestRows = (requestList: any[], compact = false) => {
        const cpy = compact ? 'py-2' : 'py-5';
        const cpx = compact ? 'px-3' : 'px-6';
        const rFirst = compact ? 'rounded-l-xl' : 'rounded-l-2xl';
        const rLast = compact ? 'rounded-r-xl' : 'rounded-r-2xl';
        const borderAccent = compact ? '4px' : '6px';
        if (!requestList.length) {
            return (
                <tr>
                    <td colSpan={visibleColumnOrder.length} className={`${compact ? 'py-8 text-xs' : 'py-12 text-sm'} text-center opacity-50`} style={{ color: colors.textMuted }}>
                        No matching requests.
                    </td>
                </tr>
            );
        }
        return requestList.map((request, idx) => (
            <tr key={request.id || `row-${idx}`} className={`group transition-all duration-300 ${compact ? 'hover:translate-y-[-1px]' : 'hover:translate-y-[-2px]'}`}>
                {visibleColumnOrder.map((column, colIdx) => {
                    const cellStyle = {
                        backgroundColor: colors.card,
                        borderColor: colors.border
                    };

                    const isFirst = colIdx === 0;
                    const isLast = colIdx === visibleColumnOrder.length - 1;
                    const acct = accountLabel(request);

                    return (
                        <td key={column}
                            className={`${cpy} ${cpx} border-y ${isFirst ? `border-l ${rFirst}` : ''} ${isLast ? `border-r ${rLast}` : ''} ${column === 'total_cost' ? 'text-right' : column === 'dates' ? 'text-left whitespace-nowrap' : column === 'account_type' || column === 'request_segment' || column === 'account' || column === 'requestName' || column === 'details' ? 'text-left' : 'text-center'}`}
                            style={{
                                ...cellStyle,
                                borderLeft: isFirst ? `${borderAccent} solid ${getStatusColor(request.status)}` : `1px solid ${colors.border}`,
                                boxShadow: compact ? '0 2px 8px rgba(0,0,0,0.04)' : '0 4px 12px rgba(0,0,0,0.05)'
                            }}
                        >
                            {column === 'options' && (
                                <div className="relative flex items-center justify-center gap-1">
                                    {(canManageRequestAlerts || requestHasAlerts(request)) && (
                                        <button
                                            type="button"
                                            title="Request alerts"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRequestAlertsModalId(String(request.id));
                                                setRequestAlertsModalAuto(false);
                                            }}
                                            className={`relative flex items-center justify-center rounded-md border font-black transition-all hover:bg-white/10 active:scale-95 ${compact ? 'p-1' : 'p-1.5'}`}
                                            style={{ color: colors.textMain, borderColor: colors.border }}
                                        >
                                            <Bell size={compact ? 11 : 13} />
                                            {requestHasAlerts(request) ? (
                                                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-500">
                                                    <AlertTriangle size={6} className="text-white" fill="currentColor" />
                                                </span>
                                            ) : null}
                                        </button>
                                    )}
                                    {readOnlyOperational ? (
                                        !(canManageRequestAlerts || requestHasAlerts(request)) ? (
                                            <span className="text-[10px] opacity-30" style={{ color: colors.textMuted }}>—</span>
                                        ) : null
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const originalIndex = requests.findIndex(r => r.id === request.id);
                                                setActiveOptionsMenu(originalIndex !== -1 ? originalIndex : null);
                                            }}
                                            className={`flex items-center ${compact ? 'gap-1 px-1.5 py-0.5' : 'gap-1.5 px-2 py-1'} rounded-md border ${compact ? 'text-[8px]' : 'text-[9px]'} font-black transition-all hover:bg-white/10 active:scale-95 opacity-60 hover:opacity-100`}
                                            style={{ color: colors.textMain, borderColor: colors.border }}
                                        >
                                            <MoreHorizontal size={compact ? 10 : 12} />
                                            <span>OPTS</span>
                                        </button>
                                    )}
                                </div>
                            )}

                            {column === 'details' && (
                                <div className="flex flex-col gap-0.5">
                                    <button
                                        onClick={() => { setSelectedRequest(request); }}
                                        className={`font-black ${compact ? 'text-xs' : 'text-sm'} tracking-tight hover:underline text-left transition-all`}
                                        style={{ color: colors.primary }}
                                    >
                                        {request.confirmationNo}
                                    </button>
                                    <button
                                        onClick={() => { setSelectedRequest(request); }}
                                        className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-mono opacity-40 hover:opacity-100 text-left w-fit transition-opacity hover:underline`}
                                        style={{ color: colors.textMain }}
                                    >
                                        #{request.id}
                                    </button>
                                </div>
                            )}

                            {column === 'requestName' && (
                                 <span className={`${compact ? 'text-xs max-w-[120px]' : 'text-sm max-w-[150px]'} font-bold truncate inline-block`} style={{ color: colors.textMain }} title={request.requestName}>
                                    {request.requestName || 'Unnamed Request'}
                                 </span>
                            )}

                            {column === 'account' && (
                                <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
                                    <div className={`${compact ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'} rounded-full flex items-center justify-center font-bold text-white shadow-sm shrink-0`}
                                        style={{ backgroundColor: getAvatarColor(acct || '?') }}>
                                        {getInitials(acct || '? ?')}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold truncate`} style={{ color: colors.textMain }}>{acct || '-'}</span>
                                        <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} opacity-50 truncate`} style={{ color: colors.textMain }}>{request.accountType}</span>
                                    </div>
                                </div>
                            )}

                            {column === 'account_type' &&
                                (() => {
                                    const at = accountTypeFromLinkedAccount(request);
                                    return (
                                        <span
                                            className={`${compact ? 'text-xs' : 'text-sm'} font-medium truncate inline-block max-w-[160px]`}
                                            style={{ color: colors.textMain }}
                                            title={at}
                                        >
                                            {at}
                                        </span>
                                    );
                                })()}

                            {column === 'request_segment' && (
                                <span
                                    className={`${compact ? 'text-xs' : 'text-sm'} font-medium truncate inline-block max-w-[160px]`}
                                    style={{ color: colors.textMain }}
                                    title={requestSegmentListLabel(request)}
                                >
                                    {requestSegmentListLabel(request)}
                                </span>
                            )}

                            {column === 'type' && (
                                <span className={`${compact ? 'text-xs' : 'text-sm'} whitespace-nowrap`} style={{ color: colors.textMain }}>{request.requestType}</span>
                            )}

                            {column === 'meal' && (
                                <div className="flex">
                                    {getMealCellValue(request) !== '-' ? (
                                        <span className={`${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'} rounded-lg border font-bold`} style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: 'rgba(0,0,0,0.05)' }}>
                                            {getMealCellValue(request)}
                                        </span>
                                    ) : (
                                        <span className={`${compact ? 'text-[10px]' : 'text-xs'} opacity-30`} style={{ color: colors.textMain }}>-</span>
                                    )}
                                </div>
                            )}

                            {column === 'status' && (
                                <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
                                    <div className={`${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'} rounded-full shrink-0`} style={{ backgroundColor: getStatusColor(request.status) }}></div>
                                    <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold`} style={{ color: getStatusColor(request.status) }}>{request.status}</span>
                                </div>
                            )}

                            {column === 'dates' && (
                                <div className={`flex flex-col ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                                    {(() => {
                                        const rowType = normalizeRequestTypeKey(request.requestType);
                                        const evWindow = getEventDateWindow(request);
                                        // Prefer agenda-derived window over stale eventStart/eventEnd (saved fields can lag behind agenda edits).
                                        const startVal = String(evWindow.start || request.eventStart || '').trim();
                                        const endVal = String(
                                            evWindow.end || evWindow.start || request.eventEnd || request.eventStart || '',
                                        ).trim();
                                        const checkInVal = String(request.checkIn || '').trim();
                                        const checkOutVal = String(request.checkOut || '').trim();

                                        // Event-only: list dates follow event window, not legacy checkIn/checkOut.
                                        if (rowType === 'event') {
                                            return (
                                                <>
                                                    <div className="flex gap-2"><span className="opacity-50">Start:</span> <span className="font-medium" style={{ color: colors.textMain }}>{startVal || '-'}</span></div>
                                                    <div className="flex gap-2"><span className="opacity-50">End:</span> <span className="font-medium" style={{ color: colors.textMain }}>{endVal || '-'}</span></div>
                                                </>
                                            );
                                        }

                                        if (checkInVal && checkInVal !== '-') {
                                            return (
                                                <>
                                                    <div className="flex gap-2"><span className="opacity-50">In:</span> <span className="font-medium" style={{ color: colors.textMain }}>{checkInVal || '-'}</span></div>
                                                    <div className="flex gap-2"><span className="opacity-50">Out:</span> <span className="font-medium" style={{ color: colors.textMain }}>{checkOutVal || '-'}</span></div>
                                                </>
                                            );
                                        }
                                        return (
                                            <>
                                                <div className="flex gap-2"><span className="opacity-50">Start:</span> <span className="font-medium" style={{ color: colors.textMain }}>{startVal || '-'}</span></div>
                                                <div className="flex gap-2"><span className="opacity-50">End:</span> <span className="font-medium" style={{ color: colors.textMain }}>{endVal || '-'}</span></div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {column === 'stay_info' && (
                                <div className={`flex flex-col ${compact ? 'gap-0.5 text-[10px]' : 'gap-1 text-[11px]'}`}>
                                    {(() => {
                                        const type = normalizeRequestTypeKey(request.requestType);
                                        const isEventOnly = type === 'event';
                                        const isEventWithAccommodation = type === 'event_rooms';
                                        const nights = Number(request.nights || calculateNights(request.checkIn, request.checkOut) || 0);
                                        const rooms = request.rooms ? Object.values(request.rooms).reduce((sum: number, r: any) => sum + Number((r as any).count || 0), 0) : 0;
                                        const days = calculateEventAgendaDays(request.agenda || []);
                                        const ic = compact ? 10 : 12;
                                        if (isEventOnly) {
                                            return (
                                                <div className="flex items-center gap-1.5 opacity-60" style={{ color: colors.textMain }}>
                                                    <Calendar size={ic} /> {days}
                                                </div>
                                            );
                                        }
                                        return (
                                            <>
                                                <div className="flex items-center gap-1.5 opacity-60" style={{ color: colors.textMain }}><Moon size={ic} /> {nights}</div>
                                                <div className="flex items-center gap-1.5 opacity-60" style={{ color: colors.textMain }}>
                                                    <Bed size={ic} /> {rooms}
                                                </div>
                                                {isEventWithAccommodation && (
                                                    <div className="flex items-center gap-1.5 opacity-60" style={{ color: colors.textMain }}>
                                                        <Calendar size={ic} /> {days}
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                             {column === 'paid_amount' && (
                                <div className={`flex flex-col ${compact ? 'gap-1 min-w-[96px]' : 'gap-1.5 min-w-[120px]'}`}>
                                    {(() => {
                                        const fin = calculateAccFinancials(request);
                                        const tCost = requestInclTaxTotal(request);
                                        const pAmt = fin?.paidAmount ?? parseFloat(request.paidAmount?.toString().replace(/,/g, '') || '0');
                                        const percentage = tCost > 0 ? Math.round((pAmt / tCost) * 100) : 0;
                                        const clOpen = !!(request.collectLater || request.paymentStatus === 'CL');
                                        const paidColor = clOpen ? colors.red : percentage >= 100 ? colors.green : colors.textMain;
                                        const barColor = clOpen ? colors.red : percentage >= 100 ? colors.green : colors.primary;
                                        return (
                                            <>
                                                <div className="flex justify-between items-end">
                                                    <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-bold`} style={{ color: paidColor }}>{formatMoney(pAmt, 0)}</span>
                                                    <span className={`${compact ? 'text-[8px]' : 'text-[9px]'} opacity-40 font-bold`} style={{ color: colors.textMain }}>{percentage}%</span>
                                                </div>
                                                <div className={`${compact ? 'h-0.5' : 'h-1'} w-full rounded-full bg-white/5 overflow-hidden`}>
                                                    <div
                                                        className="h-full transition-all duration-500"
                                                        style={{
                                                            width: `${Math.min(percentage, 100)}%`,
                                                            backgroundColor: barColor
                                                        }}
                                                    ></div>
                                                </div>
                                            </>
                                        )
                                    })()}
                                </div>
                            )}

                            {column === 'total_cost' && (
                                <div className="flex flex-col items-end">
                                    <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} uppercase font-bold opacity-30`} style={{ color: colors.textMain }}>{selectedCurrency}</span>
                                    <span className={`${compact ? 'text-sm' : 'text-xl'} font-bold tabular-nums`} style={{ color: colors.textMain }}>
                                        {formatMoney(requestInclTaxTotal(request))}
                                    </span>
                                </div>
                            )}
                        </td>
                    );
                })}
            </tr>
        ));
    };

    type TableBlockScrollMode = 'fixed' | 'flow';

    type RequestTableBlockOptions = {
        /** Denser cells/padding like the paginated All Requests table (e.g. Search Results). */
        useCompactTable?: boolean;
        /** Search box, per-page, filter — only for All Requests. */
        allRequestsHeaderWidgets?: boolean;
        showColumnSettingsButton?: boolean;
        subtitleExtra?: React.ReactNode;
        headerAction?: React.ReactNode;
    };

    const renderRequestsTableBlock = (
        requestList: any[],
        title: string,
        subtitle: string,
        scrollMode: TableBlockScrollMode = 'fixed',
        listPagination?: {
            page: number;
            pageSize: 20 | 50 | 100;
            totalItems: number;
            totalPages: number;
            setPage: (p: number) => void;
            setPageSize: (s: 20 | 50 | 100) => void;
        } | null,
        blockOptions?: RequestTableBlockOptions
    ) => {
        const { useCompactTable = false, allRequestsHeaderWidgets = false, showColumnSettingsButton = true, subtitleExtra = null, headerAction = null } = blockOptions || {};
        const fixedHeight = scrollMode === 'fixed';
        const compact = !!listPagination || useCompactTable;
        const theadPx = compact ? 'px-3' : 'px-6';
        const theadPy = compact ? 'py-1.5' : 'py-2';
        const theadText = compact ? 'text-[10px]' : 'text-[11px]';
        const spacingY = compact ? 'border-spacing-y-2' : 'border-spacing-y-4';
        const headPad = compact ? 'p-4' : 'p-6';
        const bodyPad = compact ? 'p-4' : 'p-6';
        const showingFrom =
            listPagination && listPagination.totalItems > 0
                ? (listPagination.page - 1) * listPagination.pageSize + 1
                : 0;
        const showingTo =
            listPagination && listPagination.totalItems > 0
                ? Math.min(listPagination.page * listPagination.pageSize, listPagination.totalItems)
                : 0;
        const listColumnSettingsControl = showColumnSettingsButton ? (
            <div className="relative shrink-0" ref={listColumnSettingsRef}>
                <button
                    type="button"
                    className="p-2.5 rounded-xl border hover:bg-white/5 transition-colors flex items-center justify-center"
                    style={{ borderColor: colors.border, color: colors.textMain }}
                    title="List column settings"
                    onClick={() => {
                        setListColumnSettingsOpen((o) => !o);
                        setListFilterOpen(false);
                    }}
                >
                    <Settings size={18} />
                </button>
                {listColumnSettingsOpen ? (
                    <div
                        className="absolute right-0 top-full mt-2 z-50 w-[min(100vw-1.5rem,280px)] max-h-[min(70vh,22rem)] overflow-y-auto p-3 rounded-xl border shadow-xl"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.textMuted }}>
                            Visible columns
                        </p>
                        <p className="text-[9px] opacity-60 mb-2" style={{ color: colors.textMuted }}>
                            Row actions (OPTS) always stay visible. Drag column headers to reorder.
                        </p>
                        {columnOrder
                            .filter((c) => listColumnVisibilityKeys.has(c))
                            .map((colKey) => (
                                <label
                                    key={colKey}
                                    className="flex items-center gap-2 cursor-pointer py-1.5 text-sm"
                                    style={{ color: colors.textMain }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={listColumnVisible[colKey] !== false}
                                        onChange={(e) =>
                                            setListColumnVisible((prev) => ({
                                                ...prev,
                                                [colKey]: e.target.checked,
                                            }))
                                        }
                                        className="w-4 h-4 rounded shrink-0"
                                        style={{ accentColor: colors.primary }}
                                    />
                                    <span className="truncate" title={columnLabels[colKey]}>
                                        {columnLabels[colKey] || colKey}
                                    </span>
                                </label>
                            ))}
                    </div>
                ) : null}
            </div>
        ) : null;
        return (
        <div className={fixedHeight ? 'flex flex-col flex-1 min-h-0 w-full' : 'flex flex-col w-full'}>
            <div className={`shrink-0 ${headPad} border-b`} style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center">
                    <div>
                        <h1 className={`${compact ? 'text-xl' : 'text-2xl'} font-bold mb-1`} style={{ color: colors.textMain }}>{title}</h1>
                        <p className={compact ? 'text-xs' : 'text-sm'} style={{ color: colors.textMuted }}>
                            {subtitle}
                            {listPagination && listPagination.totalItems > 0 ? (
                                <span className="opacity-70"> · Showing {showingFrom}–{showingTo}</span>
                            ) : null}
                            {subtitleExtra}
                        </p>
                    </div>
                    {allRequestsHeaderWidgets && (
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative group flex-1 min-w-[200px] max-w-md">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30 group-focus-within:text-primary transition-colors" />
                                <input
                                    placeholder="Search confirmation, account or id..."
                                    className="w-full pl-10 pr-4 py-2 bg-black/20 border border-white/5 rounded-xl outline-none focus:border-primary/50 transition-all text-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            {listPagination && (
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] uppercase font-bold tracking-wider whitespace-nowrap opacity-60" style={{ color: colors.textMuted }}>
                                        Per page
                                    </label>
                                    <select
                                        value={listPagination.pageSize}
                                        onChange={(e) => listPagination.setPageSize(Number(e.target.value) as 20 | 50 | 100)}
                                        className="pl-3 pr-8 py-2 rounded-xl border bg-black/20 text-xs font-bold outline-none cursor-pointer"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                </div>
                            )}
                            {listColumnSettingsControl}
                            <div className="relative shrink-0" ref={listFilterRef}>
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-xl border hover:bg-white/5 transition-colors flex items-center gap-2 text-sm font-bold shrink-0"
                                    style={{
                                        borderColor: colors.border,
                                        color: colors.textMain,
                                        boxShadow:
                                            listFilterOpen || listFilterType !== 'all' || listFilterStatus !== 'all' || listSortOrder !== 'activity'
                                                ? `0 0 0 1px ${colors.primary}66`
                                                : undefined,
                                    }}
                                    onClick={() => {
                                        setListFilterOpen((o) => !o);
                                        setListColumnSettingsOpen(false);
                                    }}
                                >
                                    <Filter size={16} /> Filter
                                </button>
                                {listFilterOpen ? (
                                    <div
                                        className="absolute right-0 top-full mt-2 z-50 w-[min(100vw-1.5rem,300px)] p-3 rounded-xl border shadow-xl space-y-3"
                                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                    >
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                                            Sort and filter
                                        </p>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70" style={{ color: colors.textMuted }}>
                                                Sort
                                            </label>
                                            <select
                                                value={listSortOrder}
                                                onChange={(e) => setListSortOrder(e.target.value as AllRequestsListSort)}
                                                className="w-full pl-3 pr-8 py-2 rounded-xl border bg-black/20 text-xs font-bold outline-none cursor-pointer"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                <option value="activity">Most recent (updated / created first)</option>
                                                <option value="start_newest">Latest check-in / start first</option>
                                                <option value="start_oldest">Earliest check-in / start first</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70" style={{ color: colors.textMuted }}>
                                                Request type
                                            </label>
                                            <select
                                                value={listFilterType}
                                                onChange={(e) => setListFilterType(e.target.value)}
                                                className="w-full pl-3 pr-8 py-2 rounded-xl border bg-black/20 text-xs font-bold outline-none cursor-pointer"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                <option value="all">All request types</option>
                                                <option value="accommodation">Accommodation</option>
                                                <option value="event">Event</option>
                                                <option value="event_rooms">Event with Rooms</option>
                                                <option value="series group">Series Group</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70" style={{ color: colors.textMuted }}>
                                                Status
                                            </label>
                                            <select
                                                value={listFilterStatus}
                                                onChange={(e) => setListFilterStatus(e.target.value)}
                                                className="w-full pl-3 pr-8 py-2 rounded-xl border bg-black/20 text-xs font-bold outline-none cursor-pointer"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                <option value="all">All statuses</option>
                                                <option value="Inquiry">Inquiry</option>
                                                <option value="Accepted">Accepted</option>
                                                <option value="Tentative">Tentative</option>
                                                <option value="Definite">Definite</option>
                                                <option value="Actual">Actual</option>
                                                <option value="Cancelled">Cancelled</option>
                                            </select>
                                        </div>
                                        <button
                                            type="button"
                                            className="w-full py-2 rounded-lg text-xs font-bold border hover:bg-white/5 transition-colors"
                                            style={{ borderColor: colors.border, color: colors.textMuted }}
                                            onClick={() => {
                                                setListSortOrder('activity');
                                                setListFilterType('all');
                                                setListFilterStatus('all');
                                            }}
                                        >
                                            Reset to defaults
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                    {!allRequestsHeaderWidgets && (listColumnSettingsControl || headerAction) && (
                        <div className="flex flex-wrap items-center justify-end gap-2 w-full min-w-0 sm:w-auto">
                            {headerAction}
                            {listColumnSettingsControl}
                        </div>
                    )}
                </div>
            </div>

            <div className={fixedHeight ? `flex-1 overflow-auto ${bodyPad} min-h-0` : bodyPad}>
                <table className={`w-full text-left border-separate ${spacingY}`}>
                    <thead>
                        <tr>
                            {visibleColumnOrder.map((column) => (
                                <th key={column}
                                    draggable
                                    onDragStart={() => handleColumnDragStart(column)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => handleColumnDrop(column)}
                                    className={`${theadPx} ${theadPy} ${theadText} font-bold uppercase tracking-wider cursor-move opacity-50`}
                                    style={{ color: colors.textMain }}>
                                    {columnLabels[column as keyof typeof columnLabels]}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {renderRequestRows(requestList, compact)}
                    </tbody>
                </table>
            </div>

            {listPagination ? (
                <div className={`flex flex-col sm:flex-row items-center justify-center gap-3 ${compact ? 'p-4' : 'p-6'} border-t shrink-0`} style={{ borderColor: colors.border }}>
                    <span className="text-[10px] font-medium opacity-60" style={{ color: colors.textMuted }}>
                        Page {listPagination.page} of {listPagination.totalPages}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap justify-center max-w-full overflow-x-auto pb-1">
                        <button
                            type="button"
                            disabled={listPagination.page <= 1}
                            onClick={() => listPagination.setPage(listPagination.page - 1)}
                            className="p-2 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                            style={{ color: colors.textMain }}
                            aria-label="Previous page"
                        >
                            <ChevronRight size={16} className="rotate-180" />
                        </button>
                        {Array.from({ length: listPagination.totalPages }, (_, i) => i + 1).map((pageNum) => (
                            <button
                                type="button"
                                key={pageNum}
                                onClick={() => listPagination.setPage(pageNum)}
                                className={`min-w-[2.25rem] h-9 px-2 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${pageNum === listPagination.page ? 'shadow-lg' : 'hover:bg-white/5'}`}
                                style={{
                                    backgroundColor: pageNum === listPagination.page ? colors.primary : 'transparent',
                                    color: pageNum === listPagination.page ? '#000' : colors.textMain,
                                    boxShadow: pageNum === listPagination.page ? `0 4px 12px ${colors.primary}40` : 'none'
                                }}
                            >
                                {pageNum}
                            </button>
                        ))}
                        <button
                            type="button"
                            disabled={listPagination.page >= listPagination.totalPages}
                            onClick={() => listPagination.setPage(listPagination.page + 1)}
                            className="p-2 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                            style={{ color: colors.textMain }}
                            aria-label="Next page"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
        );
    };

    const renderGridView = () => {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const companyColWidth = 180;
        const groupColWidth = 220;
        const confirmationColWidth = 130;
        const pinnedColsWidth = companyColWidth + groupColWidth + confirmationColWidth;
        const parseYmdToDate = (raw: string): Date | null => {
            const v = String(raw || '').trim().slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
            const dt = new Date(`${v}T12:00:00`);
            if (Number.isNaN(dt.getTime())) return null;
            return dt;
        };
        const normalizeGridStatus = (raw: string) => {
            const v = String(raw || '').trim();
            if (!v) return 'Inquiry';
            if (v.toLowerCase() === 'lost') return 'Cancelled';
            return v;
        };
        const clipRowToGridMode = (status: string) => {
            const isCancelled = String(status).toLowerCase() === 'cancelled';
            return gridMode === 'cxl' ? isCancelled : !isCancelled;
        };

        type GridRow = {
            id: string;
            monthIndex: number;
            companyName: string;
            groupName: string;
            confirmationNo: string;
            dayCounts: Record<number, number>;
            totalRoomNights: number;
            status: string;
            paymentStatus: string;
            offerDeadline: string;
            depositDeadline: string;
            paymentDeadline: string;
        };

        const rowsByMonth = new Map<number, GridRow[]>();
        for (let m = 0; m < 12; m += 1) rowsByMonth.set(m, []);

        const pushMappedRows = (
            req: any,
            status: string,
            roomNightsByMonthDay: Map<number, Map<number, number>>,
            suffix: string
        ) => {
            roomNightsByMonthDay.forEach((dayMap, monthIndex) => {
                const totalRoomNights = Array.from(dayMap.values()).reduce((s, n) => s + (Number(n) || 0), 0);
                if (totalRoomNights <= 0) return;
                const counts: Record<number, number> = {};
                dayMap.forEach((value, day) => {
                    counts[day] = Number(value) || 0;
                });
                rowsByMonth.get(monthIndex)?.push({
                    id: `${req.id || 'REQ'}-${monthIndex}-${suffix}`,
                    monthIndex,
                    companyName: String(req.account || req.accountName || '—'),
                    groupName: String(req.requestName || req.id || '—'),
                    confirmationNo: String(req.confirmationNo || '—'),
                    dayCounts: counts,
                    totalRoomNights,
                    status,
                    paymentStatus: String(req.paymentStatus || 'Unpaid'),
                    offerDeadline: String(req.offerDeadline || '—'),
                    depositDeadline: String(req.depositDeadline || '—'),
                    paymentDeadline: String(req.paymentDeadline || '—'),
                });
            });
        };

        (requests || []).forEach((req: any) => {
            const typeKey = normalizeRequestTypeKey(req.requestType);
            if (!['accommodation', 'event_rooms', 'series'].includes(typeKey)) return;
            const status = normalizeGridStatus(String(req.status || 'Inquiry'));
            if (!clipRowToGridMode(status)) return;

            if (typeKey === 'series') {
                const groups = Array.isArray(req.rooms) ? req.rooms : [];
                groups.forEach((group: any, idx: number) => {
                    const arrival = parseYmdToDate(String(group?.arrival || req?.checkIn || ''));
                    const departure = parseYmdToDate(String(group?.departure || req?.checkOut || ''));
                    if (!arrival || !departure || departure <= arrival) return;
                    const count = Math.max(0, Number(group?.count || 0));
                    if (count <= 0) return;
                    const map = new Map<number, Map<number, number>>();
                    const cursor = new Date(arrival.getTime());
                    while (cursor < departure) {
                        const y = cursor.getFullYear();
                        const m = cursor.getMonth();
                        const d = cursor.getDate();
                        if (y === gridYear) {
                            if (!map.has(m)) map.set(m, new Map<number, number>());
                            const monthDays = map.get(m)!;
                            monthDays.set(d, (monthDays.get(d) || 0) + count);
                        }
                        cursor.setDate(cursor.getDate() + 1);
                    }
                    pushMappedRows(
                        {
                            ...req,
                            requestName: `${String(req.requestName || req.confirmationNo || req.id || '—')} (Group ${idx + 1})`,
                        },
                        status,
                        map,
                        `series-${idx}`
                    );
                });
                return;
            }

            /** accommodation + event_rooms: each room line can have its own stay window; sum counts per calendar night (same as series math). */
            const roomLines = Array.isArray(req.rooms) ? req.rooms : [];
            const mergedMap = new Map<number, Map<number, number>>();
            const addStayWindowToMap = (arrival: Date | null, departure: Date | null, count: number) => {
                if (!arrival || !departure || departure <= arrival || count <= 0) return;
                const cursor = new Date(arrival.getTime());
                while (cursor < departure) {
                    const y = cursor.getFullYear();
                    const m = cursor.getMonth();
                    const d = cursor.getDate();
                    if (y === gridYear) {
                        if (!mergedMap.has(m)) mergedMap.set(m, new Map<number, number>());
                        const monthDays = mergedMap.get(m)!;
                        monthDays.set(d, (monthDays.get(d) || 0) + count);
                    }
                    cursor.setDate(cursor.getDate() + 1);
                }
            };

            if (roomLines.length > 0) {
                for (const group of roomLines) {
                    const arrival = parseYmdToDate(String(group?.arrival || group?.checkIn || req?.checkIn || ''));
                    const departure = parseYmdToDate(String(group?.departure || group?.checkOut || req?.checkOut || ''));
                    const count = Math.max(0, Number(group?.count || 0));
                    addStayWindowToMap(arrival, departure, count);
                }
            }

            if (mergedMap.size === 0) {
                const checkIn = parseYmdToDate(String(req.checkIn || ''));
                const checkOut = parseYmdToDate(String(req.checkOut || ''));
                if (!checkIn || !checkOut || checkOut <= checkIn) return;
                const totalRoomsPerNight = roomLines.reduce((s: number, room: any) => s + Math.max(0, Number(room?.count || 0)), 0);
                if (totalRoomsPerNight <= 0) return;
                addStayWindowToMap(checkIn, checkOut, totalRoomsPerNight);
            }

            pushMappedRows(req, status, mergedMap, typeKey);
        });

        return (
            <div className="h-full flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: colors.bg }}>
                <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: colors.textMain }}>
                            {gridMode === 'cxl' ? 'CXL Grid' : 'Grid'}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold uppercase" style={{ color: colors.textMuted }}>Year</label>
                        <input
                            type="number"
                            min={2000}
                            max={2100}
                            value={gridYear}
                            onChange={(e) => {
                                const y = Number(e.target.value);
                                if (!Number.isFinite(y) || y < 2000 || y > 2100) return;
                                setGridYear(Math.floor(y));
                            }}
                            className="w-24 px-3 py-1.5 rounded border bg-black/20 text-sm outline-none"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-5">
                    {monthNames.map((monthName, monthIndex) => {
                        const daysInMonth = new Date(gridYear, monthIndex + 1, 0).getDate();
                        const monthRows = rowsByMonth.get(monthIndex) || [];
                        const pinnedBg = colors.card;
                        const pinnedHeadZ = 55;
                        const pinnedBodyZ = 50;
                        const dayCellZ = 1;
                        const totalRoomsByDay: number[] = Array.from({ length: daysInMonth }, (_, i) => {
                            const day = i + 1;
                            return monthRows.reduce((sum, r) => sum + (r.dayCounts[day] || 0), 0);
                        });
                        const totalRoomsRn = monthRows.reduce((sum, r) => sum + (r.totalRoomNights || 0), 0);
                        const totalRoomsFooterBg = gridRoomsThemeDark ? '#1a2332' : colors.bg;
                        return (
                            <div
                                key={`${gridYear}-${monthIndex}`}
                                className="rounded-xl border flex flex-col min-w-0"
                                style={{ borderColor: colors.border, backgroundColor: colors.card }}
                            >
                                <div
                                    className="shrink-0 px-3 py-2 border-b font-black text-sm"
                                    style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: pinnedBg }}
                                >
                                    {monthName} {gridYear}
                                </div>
                                <div className="overflow-x-auto min-w-0">
                                <table className="border-collapse text-[11px]" style={{ width: 'max-content', minWidth: '100%' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: pinnedBg }}>
                                            <th
                                                className="border pl-3 pr-2 py-1 text-left sticky left-0"
                                                style={{
                                                    borderColor: colors.border,
                                                    backgroundColor: pinnedBg,
                                                    color: colors.textMain,
                                                    minWidth: companyColWidth,
                                                    width: companyColWidth,
                                                    maxWidth: companyColWidth,
                                                    boxShadow: `4px 0 8px -2px rgba(0,0,0,0.35)`,
                                                    zIndex: pinnedHeadZ,
                                                }}
                                            >
                                                Company Name
                                            </th>
                                            <th
                                                className="border px-2 py-1 text-left sticky"
                                                style={{
                                                    left: companyColWidth,
                                                    borderColor: colors.border,
                                                    backgroundColor: pinnedBg,
                                                    color: colors.textMain,
                                                    minWidth: groupColWidth,
                                                    width: groupColWidth,
                                                    maxWidth: groupColWidth,
                                                    boxShadow: `4px 0 8px -2px rgba(0,0,0,0.35)`,
                                                    zIndex: pinnedHeadZ,
                                                }}
                                            >
                                                Group Name
                                            </th>
                                            <th
                                                className="border px-2 py-1 text-left sticky"
                                                style={{
                                                    left: companyColWidth + groupColWidth,
                                                    borderColor: colors.border,
                                                    backgroundColor: pinnedBg,
                                                    color: colors.textMain,
                                                    minWidth: confirmationColWidth,
                                                    width: confirmationColWidth,
                                                    maxWidth: confirmationColWidth,
                                                    boxShadow: `4px 0 8px -2px rgba(0,0,0,0.35)`,
                                                    zIndex: pinnedHeadZ,
                                                }}
                                            >
                                                Confirmation #
                                            </th>
                                            {Array.from({ length: daysInMonth }, (_, i) => (
                                                <th key={`dow-${i + 1}`} className="border px-1 py-1 text-center min-w-[34px] relative" style={{ borderColor: colors.border, color: colors.textMuted, zIndex: dayCellZ }}>
                                                    {GRID_WEEKDAY_CODES[new Date(gridYear, monthIndex, i + 1).getDay()]}
                                                </th>
                                            ))}
                                            <th className="border px-2 py-1 text-center min-w-[80px]" style={{ borderColor: colors.border, color: colors.textMain }}>Total RN</th>
                                            <th className="border px-2 py-1 text-center min-w-[80px]" style={{ borderColor: colors.border, color: colors.textMain }}>Status</th>
                                            <th className="border px-2 py-1 text-center min-w-[110px]" style={{ borderColor: colors.border, color: colors.textMain }}>Payment</th>
                                            <th className="border px-2 py-1 text-center min-w-[120px]" style={{ borderColor: colors.border, color: colors.textMain }}>Opt Date</th>
                                            <th className="border px-2 py-1 text-center min-w-[120px]" style={{ borderColor: colors.border, color: colors.textMain }}>Deposit</th>
                                            <th className="border px-2 py-1 text-center min-w-[120px]" style={{ borderColor: colors.border, color: colors.textMain }}>Full Payment</th>
                                        </tr>
                                        <tr style={{ backgroundColor: pinnedBg }}>
                                            <th
                                                className="border px-2 py-1 text-left sticky left-0"
                                                style={{
                                                    borderColor: colors.border,
                                                    backgroundColor: pinnedBg,
                                                    minWidth: companyColWidth,
                                                    width: companyColWidth,
                                                    maxWidth: companyColWidth,
                                                    boxShadow: `4px 0 8px -2px rgba(0,0,0,0.35)`,
                                                    zIndex: pinnedHeadZ,
                                                }}
                                            />
                                            <th
                                                className="border px-2 py-1 text-left sticky"
                                                style={{
                                                    left: companyColWidth,
                                                    borderColor: colors.border,
                                                    backgroundColor: pinnedBg,
                                                    minWidth: groupColWidth,
                                                    width: groupColWidth,
                                                    maxWidth: groupColWidth,
                                                    boxShadow: `4px 0 8px -2px rgba(0,0,0,0.35)`,
                                                    zIndex: pinnedHeadZ,
                                                }}
                                            />
                                            <th
                                                className="border px-2 py-1 text-left sticky"
                                                style={{
                                                    left: companyColWidth + groupColWidth,
                                                    borderColor: colors.border,
                                                    backgroundColor: pinnedBg,
                                                    minWidth: confirmationColWidth,
                                                    width: confirmationColWidth,
                                                    maxWidth: confirmationColWidth,
                                                    boxShadow: `4px 0 8px -2px rgba(0,0,0,0.35)`,
                                                    zIndex: pinnedHeadZ,
                                                }}
                                            />
                                            {Array.from({ length: daysInMonth }, (_, i) => (
                                                <th key={`day-${i + 1}`} className="border px-1 py-1 text-center relative" style={{ borderColor: colors.border, color: colors.textMain, zIndex: dayCellZ }}>
                                                    {i + 1}
                                                </th>
                                            ))}
                                            <th className="border px-2 py-1 text-center" style={{ borderColor: colors.border }} />
                                            <th className="border px-2 py-1 text-center" style={{ borderColor: colors.border }} />
                                            <th className="border px-2 py-1 text-center" style={{ borderColor: colors.border }} />
                                            <th className="border px-2 py-1 text-center" style={{ borderColor: colors.border }} />
                                            <th className="border px-2 py-1 text-center" style={{ borderColor: colors.border }} />
                                            <th className="border px-2 py-1 text-center" style={{ borderColor: colors.border }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {monthRows.map((row) => {
                                            const rowBg = getGridRoomsRowBackground(row.status);
                                            return (
                                            <tr key={row.id} className="hover:brightness-105 transition-all">
                                                <td
                                                    className="border pl-3 pr-2 py-1 sticky left-0 truncate font-semibold"
                                                    style={{
                                                        borderColor: colors.border,
                                                        backgroundColor: rowBg,
                                                        color: gridRoomsRowText,
                                                        minWidth: companyColWidth,
                                                        width: companyColWidth,
                                                        maxWidth: companyColWidth,
                                                        borderLeft: `3px solid ${getGridRoomsStatusAccent(row.status)}`,
                                                        boxShadow: `4px 0 8px -2px rgba(0,0,0,0.35)`,
                                                        zIndex: pinnedBodyZ,
                                                    }}
                                                >
                                                    {row.companyName}
                                                </td>
                                                <td
                                                    className="border px-2 py-1 sticky truncate font-semibold"
                                                    style={{
                                                        left: companyColWidth,
                                                        borderColor: colors.border,
                                                        backgroundColor: rowBg,
                                                        color: gridRoomsRowText,
                                                        minWidth: groupColWidth,
                                                        width: groupColWidth,
                                                        maxWidth: groupColWidth,
                                                        boxShadow: `4px 0 8px -2px rgba(0,0,0,0.35)`,
                                                        zIndex: pinnedBodyZ,
                                                    }}
                                                >
                                                    {row.groupName}
                                                </td>
                                                <td
                                                    className="border px-2 py-1 sticky truncate font-semibold"
                                                    style={{
                                                        left: companyColWidth + groupColWidth,
                                                        borderColor: colors.border,
                                                        backgroundColor: rowBg,
                                                        color: gridRoomsRowText,
                                                        minWidth: confirmationColWidth,
                                                        width: confirmationColWidth,
                                                        maxWidth: confirmationColWidth,
                                                        boxShadow: `4px 0 8px -2px rgba(0,0,0,0.35)`,
                                                        zIndex: pinnedBodyZ,
                                                    }}
                                                >
                                                    {row.confirmationNo}
                                                </td>
                                                {Array.from({ length: daysInMonth }, (_, i) => {
                                                    const day = i + 1;
                                                    const value = row.dayCounts[day] || 0;
                                                    return (
                                                        <td
                                                            key={`${row.id}-d${day}`}
                                                            className="border px-1 py-1 text-center relative font-semibold"
                                                            style={{
                                                                borderColor: colors.border,
                                                                color: value > 0 ? gridRoomsRowText : colors.textMuted,
                                                                backgroundColor: value > 0 ? rowBg : colors.bg,
                                                                zIndex: dayCellZ,
                                                            }}
                                                        >
                                                            {value > 0 ? value : ''}
                                                        </td>
                                                    );
                                                })}
                                                <td className="border px-2 py-1 text-center font-bold" style={{ borderColor: colors.border, color: gridRoomsRowText, backgroundColor: rowBg }}>{row.totalRoomNights}</td>
                                                <td className="border px-2 py-1 text-center font-bold" style={{ borderColor: colors.border, color: getGridRoomsStatusAccent(row.status), backgroundColor: rowBg }}>{row.status}</td>
                                                <td className="border px-2 py-1 text-center" style={{ borderColor: colors.border, color: gridRoomsRowText, backgroundColor: rowBg }}>{row.paymentStatus}</td>
                                                <td className="border px-2 py-1 text-center" style={{ borderColor: colors.border, color: gridRoomsRowText, backgroundColor: rowBg }}>{row.offerDeadline || '—'}</td>
                                                <td className="border px-2 py-1 text-center" style={{ borderColor: colors.border, color: gridRoomsRowText, backgroundColor: rowBg }}>{row.depositDeadline || '—'}</td>
                                                <td className="border px-2 py-1 text-center" style={{ borderColor: colors.border, color: gridRoomsRowText, backgroundColor: rowBg }}>{row.paymentDeadline || '—'}</td>
                                            </tr>
                                            );
                                        })}
                                        <tr className="shrink-0" style={{ borderTop: `2px solid ${colors.primary}` }}>
                                            <td
                                                colSpan={3}
                                                className="border px-2 py-1.5 sticky left-0 font-black text-center"
                                                style={{
                                                    borderColor: colors.border,
                                                    backgroundColor: totalRoomsFooterBg,
                                                    color: colors.primary,
                                                    minWidth: pinnedColsWidth,
                                                    width: pinnedColsWidth,
                                                    maxWidth: pinnedColsWidth,
                                                    textAlign: 'center',
                                                    borderLeft: `3px solid ${colors.primary}`,
                                                    boxShadow: `4px 0 8px -2px rgba(0,0,0,0.35)`,
                                                    zIndex: pinnedBodyZ,
                                                }}
                                            >
                                                Total Rooms
                                            </td>
                                            {Array.from({ length: daysInMonth }, (_, i) => {
                                                const day = i + 1;
                                                const value = totalRoomsByDay[i] || 0;
                                                return (
                                                    <td
                                                        key={`total-rooms-m${monthIndex}-d${day}`}
                                                        className="border px-1 py-1.5 text-center font-black"
                                                        style={{
                                                            borderColor: colors.border,
                                                            color: value > 0 ? colors.textMain : colors.textMuted,
                                                            backgroundColor: value > 0 ? totalRoomsFooterBg : colors.bg,
                                                            zIndex: dayCellZ,
                                                        }}
                                                    >
                                                        {value > 0 ? value : ''}
                                                    </td>
                                                );
                                            })}
                                            <td
                                                className="border px-2 py-1.5 text-center font-black"
                                                style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: totalRoomsFooterBg }}
                                            >
                                                {totalRoomsRn}
                                            </td>
                                            <td className="border px-2 py-1.5 text-center" colSpan={5} style={{ borderColor: colors.border, color: colors.textMuted, backgroundColor: totalRoomsFooterBg }} />
                                        </tr>
                                    </tbody>
                                </table>
                                </div>
                            </div>
                        );
                    })}

                    <div className="pt-2 flex items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={() => setGridMode('active')}
                            className="px-4 py-2 rounded border text-xs font-bold uppercase tracking-wide"
                            style={{
                                borderColor: gridMode === 'active' ? colors.primary : colors.border,
                                color: gridMode === 'active' ? colors.primary : colors.textMuted,
                                backgroundColor: gridMode === 'active' ? colors.primary + '15' : 'transparent',
                            }}
                        >
                            Active Grid
                        </button>
                        <button
                            type="button"
                            onClick={() => setGridMode('cxl')}
                            className="px-4 py-2 rounded border text-xs font-bold uppercase tracking-wide"
                            style={{
                                borderColor: gridMode === 'cxl' ? colors.red : colors.border,
                                color: gridMode === 'cxl' ? colors.red : colors.textMuted,
                                backgroundColor: gridMode === 'cxl' ? colors.red + '15' : 'transparent',
                            }}
                        >
                            CXL Grid
                        </button>
                    </div>
                </div>
                {renderGlobalModals()}
            </div>
        );
    };

    if (subView === 'grid') {
        return renderGridView();
    }

    // Show Search Form when subView = 'search'. The page scrolls; the table uses the full content width.
    if (subView === 'search') {
        const compactSearchForm = searchFormExpanded && searchResults !== null;
        const searchRevenueInclTax = (searchResults || []).reduce((sum: number, request: any) => sum + Number(requestInclTaxTotal(request) || 0), 0);
        const exportSearchResultsCsv = () => {
            const rows = searchResults || [];
            const cols = visibleColumnOrder.filter((column) => column !== 'options');
            const csvEscape = (value: unknown) => {
                const s = String(value ?? '');
                return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const cell = (request: any, column: string) => {
                if (column === 'details') return [request.confirmationNo || 'N/A', request.id ? `#${request.id}` : ''].filter(Boolean).join(' ');
                if (column === 'requestName') return request.requestName || 'Unnamed Request';
                if (column === 'account') return accountLabel(request);
                if (column === 'account_type') return accountTypeFromLinkedAccount(request);
                if (column === 'request_segment') return requestSegmentListLabel(request);
                if (column === 'type') return String(request.requestType || '');
                if (column === 'meal') return getMealCellValue(request);
                if (column === 'status') return String(request.status || '');
                if (column === 'dates') {
                    const rowType = normalizeRequestTypeKey(request.requestType);
                    const evWindow = getEventDateWindow(request);
                    const startVal = String(evWindow.start || request.eventStart || '').trim();
                    const endVal = String(evWindow.end || evWindow.start || request.eventEnd || request.eventStart || '').trim();
                    const checkInVal = String(request.checkIn || '').trim();
                    const checkOutVal = String(request.checkOut || '').trim();
                    if (rowType !== 'event' && checkInVal && checkInVal !== '-') return `In: ${checkInVal} Out: ${checkOutVal || '-'}`;
                    return `Start: ${startVal || '-'} End: ${endVal || '-'}`;
                }
                if (column === 'stay_info') {
                    const type = normalizeRequestTypeKey(request.requestType);
                    const nights = Number(request.nights || calculateNights(request.checkIn, request.checkOut) || 0);
                    const rooms = request.rooms ? Object.values(request.rooms).reduce((sum: number, r: any) => sum + Number((r as any).count || 0), 0) : 0;
                    const days = calculateEventAgendaDays(request.agenda || []);
                    if (type === 'event') return `${days} days`;
                    if (type === 'event_rooms') return `${nights} nights, ${rooms} rooms, ${days} days`;
                    return `${nights} nights, ${rooms} rooms`;
                }
                if (column === 'paid_amount') {
                    const fin = calculateAccFinancials(request);
                    const paid = fin?.paidAmount ?? parseFloat(String(request.paidAmount ?? '').replace(/,/g, '') || '0');
                    return formatMoney(paid, 0);
                }
                if (column === 'total_cost') {
                    const amount = convertSarToCurrency(Number(requestInclTaxTotal(request) || 0), selectedCurrency);
                    return amount.toFixed(2);
                }
                return '';
            };
            const lines = [
                cols.map((column) => csvEscape(columnLabels[column] || column)).join(','),
                ...rows.map((request: any) => cols.map((column) => csvEscape(cell(request, column))).join(',')),
            ];
            const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `request-search-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        };
        return (
            <div className="w-full min-h-full min-w-0" style={{ backgroundColor: colors.bg }}>
                <div
                    className={`shrink-0 border-b ${searchResults !== null ? 'pb-2' : ''}`}
                    style={{ borderColor: colors.border, backgroundColor: colors.card }}
                >
                    {searchFormExpanded ? (
                        <div className={`w-full max-w-4xl mx-auto ${compactSearchForm ? 'px-4 py-4 md:px-5 md:py-5 space-y-4' : 'p-6 md:p-8 space-y-6'}`}>
                            <div className={`text-center ${compactSearchForm ? 'mb-1' : 'mb-2'}`}>
                                <h2 className={`font-bold ${compactSearchForm ? 'text-lg mb-1' : 'text-2xl mb-2'}`} style={{ color: colors.primary }}>Requests Management Center</h2>
                            </div>

                            <div className={compactSearchForm ? 'space-y-4' : 'space-y-6'}>
                                <div className="max-w-2xl mx-auto md:max-w-none">
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Request Type</label>
                                    <select
                                        value={searchParams?.type || 'all'}
                                        onChange={(e) => updateSearchParams({ type: e.target.value })}
                                        className={`w-full rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors ${compactSearchForm ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`}
                                        style={{ borderColor: colors.border, color: colors.textMain }}>
                                        <option value="all">All Request Types</option>
                                        <option value="accommodation">Accommodation</option>
                                        <option value="event">Event</option>
                                        <option value="event_rooms">Event with Rooms</option>
                                        <option value="series group">Series Group</option>
                                    </select>
                                </div>

                                <div className="max-w-4xl mx-auto">
                                    <label className="text-xs font-bold uppercase tracking-wider mb-1 block text-center" style={{ color: colors.textMuted }}>Request Status</label>
                                    <p className="text-[10px] text-center mb-2 opacity-60" style={{ color: colors.textMuted }}>
                                        {selectedSearchStatuses.length === 0
                                            ? 'No status selected — all statuses'
                                            : `${selectedSearchStatuses.length} selected`}
                                    </p>
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {REQUEST_SEARCH_STATUS_OPTIONS.map((status) => {
                                            const active = selectedSearchStatuses.some(
                                                (s) => normalizeSearchStatusKey(s) === normalizeSearchStatusKey(status)
                                            );
                                            const accent = getStatusColor(status);
                                            return (
                                                <button
                                                    key={status}
                                                    type="button"
                                                    onClick={() => toggleSearchStatusTab(status)}
                                                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wide transition-colors ${compactSearchForm ? 'text-[10px] py-1' : ''}`}
                                                    style={{
                                                        borderColor: active ? accent : colors.border,
                                                        color: active ? accent : colors.textMuted,
                                                        backgroundColor: active ? `${accent}22` : 'transparent',
                                                        boxShadow: active ? `inset 0 0 0 1px ${accent}55` : undefined,
                                                    }}
                                                >
                                                    {status}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl mx-auto">
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Arrival / Start From Date</label>
                                        <input
                                            type="date"
                                            value={searchParams?.arrival || ''}
                                            onChange={(e) => updateSearchParams({ arrival: e.target.value })}
                                            className={`w-full rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors ${compactSearchForm ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`}
                                            style={{ borderColor: colors.border, color: colors.textMain }} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Arrival / Start To Date</label>
                                        <input
                                            type="date"
                                            value={searchParams?.arrivalTo || ''}
                                            onChange={(e) => updateSearchParams({ arrivalTo: e.target.value })}
                                            className={`w-full rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors ${compactSearchForm ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`}
                                            style={{ borderColor: colors.border, color: colors.textMain }} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Departure / End From Date</label>
                                        <input
                                            type="date"
                                            value={searchParams?.departure || ''}
                                            onChange={(e) => updateSearchParams({ departure: e.target.value })}
                                            className={`w-full rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors ${compactSearchForm ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`}
                                            style={{ borderColor: colors.border, color: colors.textMain }} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Departure / End To Date</label>
                                        <input
                                            type="date"
                                            value={searchParams?.departureTo || ''}
                                            onChange={(e) => updateSearchParams({ departureTo: e.target.value })}
                                            className={`w-full rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors ${compactSearchForm ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`}
                                            style={{ borderColor: colors.border, color: colors.textMain }} />
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row flex-wrap justify-center items-stretch sm:items-end gap-4 w-full max-w-xl sm:max-w-5xl mx-auto">
                                    <div className="w-full sm:flex-1 sm:min-w-[11rem] sm:max-w-[16rem]">
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block text-center sm:text-left" style={{ color: colors.textMuted }}>Created by</label>
                                        <select
                                            value={searchParams?.createdByUserId ?? ''}
                                            onChange={(e) => updateSearchParams({ createdByUserId: e.target.value })}
                                            className={`w-full rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors ${compactSearchForm ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`}
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        >
                                            <option value="">All users</option>
                                            {assignableUsersForProperty.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-full sm:flex-1 sm:min-w-[11rem] sm:max-w-[16rem]">
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block text-center sm:text-left" style={{ color: colors.textMuted }}>Segment</label>
                                        <select
                                            value={searchParams?.segment || ''}
                                            onChange={(e) => updateSearchParams({ segment: e.target.value })}
                                            className={`w-full rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors ${compactSearchForm ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`}
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        >
                                            <option value="">All segments</option>
                                            {effectiveSegmentOptions.map((segmentName: string) => (
                                                <option key={segmentName} value={segmentName}>
                                                    {segmentName}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Account Name</label>
                                        <div className="relative">
                                            <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 opacity-50" style={{ color: colors.textMuted }} />
                                            <input
                                                type="text"
                                                value={searchParams?.account || ''}
                                                onChange={(e) => updateSearchParams({ account: e.target.value })}
                                                className={`w-full pl-12 pr-4 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors ${compactSearchForm ? 'py-2 text-sm' : 'py-3'}`}
                                                style={{ borderColor: colors.border, color: colors.textMain }} placeholder="Search account..." />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Request Name</label>
                                        <input
                                            type="text"
                                            value={searchParams?.requestName || ''}
                                            onChange={(e) => updateSearchParams({ requestName: e.target.value })}
                                            className={`w-full px-4 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors ${compactSearchForm ? 'py-2 text-sm' : 'py-3'}`}
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                            placeholder="Search request name..."
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Confirmation Number</label>
                                        <input
                                            type="text"
                                            value={searchParams?.confNumber || ''}
                                            onChange={(e) => updateSearchParams({ confNumber: e.target.value })}
                                            className={`w-full px-4 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors ${compactSearchForm ? 'py-2 text-sm' : 'py-3'}`}
                                            style={{ borderColor: colors.border, color: colors.textMain }} placeholder="#REQ-..." />
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleSearchRequests}
                                    className={`w-full rounded-lg font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg ${compactSearchForm ? 'py-2.5 text-sm' : 'py-3'}`}
                                    style={{ backgroundColor: colors.primary, color: '#000' }}>
                                    <Search size={compactSearchForm ? 18 : 20} /> SEARCH REQUESTS
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold" style={{ color: colors.textMain }}>Search</h2>
                                <p className="text-xs opacity-60" style={{ color: colors.textMuted }}>
                                    {searchResults?.length ?? 0} result(s). Use Manage Search to edit criteria.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSearchFormExpanded(true)}
                                className="px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-wide flex items-center gap-2 hover:bg-white/5 transition-colors"
                                style={{ borderColor: colors.border, color: colors.primary }}
                            >
                                <ChevronDown size={16} /> Manage Search
                            </button>
                        </div>
                    )}
                </div>

                {searchResults !== null && (
                    <div className="mt-4 w-full min-w-0">
                        {renderRequestsTableBlock(
                            searchResults,
                            'Search Results',
                            `${searchResults.length} requests match your criteria`,
                            'flow',
                            null,
                            {
                                useCompactTable: true,
                                allRequestsHeaderWidgets: false,
                                showColumnSettingsButton: true,
                                subtitleExtra: (
                                    <span className="font-bold" style={{ color: colors.textMain }}>
                                        {' '}· Total revenue {formatMoney(searchRevenueInclTax)}
                                    </span>
                                ),
                                headerAction: (
                                    <button
                                        type="button"
                                        onClick={exportSearchResultsCsv}
                                        className="px-2.5 py-2 rounded-xl border hover:bg-white/5 transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        title="Export search results as CSV"
                                    >
                                        <Download size={14} /> CSV
                                    </button>
                                ),
                            }
                        )}
                    </div>
                )}

                {renderGlobalModals()}
            </div>
        );
    }

    // Show All Requests Table when subView = 'list' (or default)
    const accountScopedList = Boolean(scopedAccountFilter?.accountId || scopedAccountFilter?.accountName);
    const listTableScrollMode: TableBlockScrollMode = 'flow';
    return (
        <div className="w-full min-h-full min-w-0" style={{ backgroundColor: colors.bg }}>
            {renderRequestsTableBlock(
                listPagedRequests,
                accountScopedList ? `Requests — ${scopedAccountFilter?.accountName || 'Account'}` : 'All Requests',
                `${listPageRequests.length} total requests found`,
                listTableScrollMode,
                {
                    page: listCurrentPage,
                    pageSize: listPageSize,
                    totalItems: listPageRequests.length,
                    totalPages: listTotalPages,
                    setPage: setListCurrentPage,
                    setPageSize: (s) => {
                        setListPageSize(s);
                        setListCurrentPage(1);
                    },
                },
                { allRequestsHeaderWidgets: true, showColumnSettingsButton: true }
            )}
            {renderGlobalModals()}
        </div>
    );
}
