import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2, X, Search } from 'lucide-react';
import AddAccountModal from './AddAccountModal';
import { resolveUserAttributionId } from './userProfileMetrics';
import { apiUrl } from './backendApi';
import { getEventDateWindow } from './beoShared';
import { formatCurrencyAmount, resolveCurrencyCode, type CurrencyCode } from './currency';

type LinkedAccountRow = { accountId: string; note: string };
type PromotionRow = {
    id: string;
    propertyId: string;
    name: string;
    linkedAccounts: LinkedAccountRow[];
    segments: string[];
    startDate: string;
    endDate: string;
    status?: 'Draft' | 'Active' | 'Expired';
    terms?: string;
    includeRoomsRevenue?: boolean;
    includeEventsRevenue?: boolean;
};

const newPromotionDraft = (propertyId: string): PromotionRow => ({
    id: '',
    propertyId,
    name: '',
    linkedAccounts: [],
    segments: [''],
    startDate: '',
    endDate: '',
    status: 'Draft',
    terms: '',
    includeRoomsRevenue: true,
    includeEventsRevenue: true,
});

const statusColor = (status: string, colors: any) => {
    if (status === 'Active') return { bg: `${colors.green}20`, text: colors.green };
    if (status === 'Expired') return { bg: `${colors.red}20`, text: colors.red };
    return { bg: `${colors.yellow}20`, text: colors.yellow };
};

const normalize = (v: unknown) => String(v || '').trim().toLowerCase();

const getRequestDateWindow = (req: any) => {
    const ev = getEventDateWindow(req);
    const start = String(ev.start || req.checkIn || req.eventStart || '').slice(0, 10);
    const end = String(ev.end || ev.start || req.checkOut || req.eventEnd || start).slice(0, 10);
    return { start, end: end || start };
};

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return !(aEnd < bStart || bEnd < aStart);
};

const requestRevenue = (req: any) => Number(req?.totalCost || 0) || 0;

export default function PromotionsPage({
    theme,
    activeProperty,
    promotions,
    setPromotions,
    accounts,
    sharedRequests,
    segmentOptions = [],
    currency = 'SAR',
    canCreate = false,
    canEdit = false,
    canDelete = false,
    currentUser,
    setAccounts,
    accountTypeOptions,
}: any) {
    const colors = theme.colors;
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [draft, setDraft] = useState<PromotionRow>(() => newPromotionDraft(String(activeProperty?.id || '')));
    /** Search text — never stores raw account id (avoids uuid showing after pick). */
    const [linkedAccountSearch, setLinkedAccountSearch] = useState('');
    /** Last account selected from the dropdown row (preferred when adding). Cleared when the user edits the box. */
    const [linkedAccountPickId, setLinkedAccountPickId] = useState<string | null>(null);
    const [showAccountDropdown, setShowAccountDropdown] = useState(false);
    const linkedAccountComboRef = useRef<HTMLDivElement>(null);
    const [showAddAccountModal, setShowAddAccountModal] = useState(false);

    useEffect(() => {
        if (!showAccountDropdown) return;
        const onPointerDown = (e: PointerEvent) => {
            const root = linkedAccountComboRef.current;
            if (!root || root.contains(e.target as Node)) return;
            setShowAccountDropdown(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [showAccountDropdown]);
    const [expandedAccountKey, setExpandedAccountKey] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    const currencyCode = resolveCurrencyCode(currency as CurrencyCode);
    const formatMoney = (n: number) => formatCurrencyAmount(n, currencyCode, { maximumFractionDigits: 0 });

    const promotionsForProperty = useMemo(() => {
        const pid = String(activeProperty?.id || '').trim();
        if (!pid) return [];
        return (Array.isArray(promotions) ? promotions : []).filter(
            (p: any) => String(p?.propertyId || '').trim() === pid
        );
    }, [promotions, activeProperty?.id]);

    const effectiveStatus = (promo: PromotionRow) => {
        if (promo.status === 'Draft') return 'Draft';
        const now = new Date().toISOString().slice(0, 10);
        if (promo.endDate && promo.endDate < now) return 'Expired';
        if (promo.startDate && promo.endDate && promo.startDate <= now && now <= promo.endDate) return 'Active';
        return promo.status || 'Draft';
    };

    const reqToPromotionId = useMemo(() => {
        const map = new Map<string, string>();
        const activePromos = promotionsForProperty;
        for (const req of sharedRequests || []) {
            if (normalize(req?.status) === 'cancelled') continue;
            const reqId = String(req?.id || '').trim();
            if (!reqId) continue;
            const explicit = String(req?.promotionId || '').trim();
            if (explicit) {
                map.set(reqId, explicit);
                continue;
            }
            const reqSeg = normalize(req?.segment);
            const reqAcc = String(req?.accountId || '').trim();
            if (!reqSeg || !reqAcc) continue;
            const window = getRequestDateWindow(req);
            const matches = activePromos.filter((p: PromotionRow) => {
                if (!p?.startDate || !p?.endDate) return false;
                const segmentOk = (p.segments || []).some((s) => normalize(s) === reqSeg);
                if (!segmentOk) return false;
                const accountOk = (p.linkedAccounts || []).some((a) => String(a?.accountId || '') === reqAcc);
                if (!accountOk) return false;
                return overlaps(window.start, window.end, p.startDate, p.endDate);
            });
            if (matches.length === 1) map.set(reqId, String(matches[0].id));
        }
        return map;
    }, [sharedRequests, promotionsForProperty]);

    const metricsByPromotion = useMemo(() => {
        const out = new Map<string, { revenue: number; requests: number; byAccount: Map<string, { revenue: number; requests: number }> }>();
        for (const promo of promotionsForProperty) {
            out.set(String(promo.id), { revenue: 0, requests: 0, byAccount: new Map() });
        }
        for (const req of sharedRequests || []) {
            if (normalize(req?.status) === 'cancelled') continue;
            const reqId = String(req?.id || '');
            const promoId = reqToPromotionId.get(reqId);
            if (!promoId || !out.has(promoId)) continue;
            const bucket = out.get(promoId)!;
            const rev = requestRevenue(req);
            bucket.revenue += rev;
            bucket.requests += 1;
            const accountId = String(req?.accountId || '');
            if (accountId) {
                const acc = bucket.byAccount.get(accountId) || { revenue: 0, requests: 0 };
                acc.revenue += rev;
                acc.requests += 1;
                bucket.byAccount.set(accountId, acc);
            }
        }
        return out;
    }, [sharedRequests, promotionsForProperty, reqToPromotionId]);

    const requestsByPromotionAndAccount = useMemo(() => {
        const out = new Map<string, any[]>();
        for (const req of sharedRequests || []) {
            if (normalize(req?.status) === 'cancelled') continue;
            const reqId = String(req?.id || '');
            const promoId = reqToPromotionId.get(reqId);
            if (!promoId) continue;
            const accountId = String(req?.accountId || '');
            if (!accountId) continue;
            const key = `${promoId}::${accountId}`;
            const list = out.get(key) || [];
            list.push(req);
            out.set(key, list);
        }
        return out;
    }, [sharedRequests, reqToPromotionId]);

    const countRooms = (req: any) => {
        const typeKey = normalize(String(req?.requestType || '')).replace(/\s+/g, '_');
        if (typeKey === 'event') return 0;
        if (Array.isArray(req?.rooms) && req.rooms.length) {
            return req.rooms.reduce((sum: number, r: any) => sum + Math.max(0, Number(r?.count || 0)), 0);
        }
        return Math.max(0, Number(req?.totalRooms || 0));
    };

    const countPax = (req: any) => {
        if (!Array.isArray(req?.agenda)) return 0;
        return req.agenda.reduce((sum: number, row: any) => sum + Math.max(0, Number(row?.pax || 0)), 0);
    };

    const filteredPromotions = useMemo(() => {
        const q = normalize(searchQuery);
        return promotionsForProperty.filter((promo: PromotionRow) => {
            const st = effectiveStatus(promo);
            const statusMatch = statusFilter === 'all' || st === statusFilter;
            const nameMatch = !q || normalize(promo.name).includes(q);
            return statusMatch && nameMatch;
        });
    }, [promotionsForProperty, statusFilter, searchQuery]);

    const totals = useMemo(() => {
        let totalRevenue = 0;
        let totalRequests = 0;
        for (const promo of filteredPromotions) {
            const m = metricsByPromotion.get(String(promo.id));
            totalRevenue += Number(m?.revenue || 0);
            totalRequests += Number(m?.requests || 0);
        }
        return {
            totalPromotions: filteredPromotions.length,
            totalRevenue,
            totalRequests,
        };
    }, [filteredPromotions, metricsByPromotion]);

    const openCreate = () => {
        setDraft(newPromotionDraft(String(activeProperty?.id || '')));
        setLinkedAccountSearch('');
        setLinkedAccountPickId(null);
        setShowAccountDropdown(false);
        setShowModal(true);
    };

    const openEdit = (promo: PromotionRow) => {
        setDraft({
            ...promo,
            linkedAccounts: Array.isArray(promo.linkedAccounts) ? promo.linkedAccounts : [],
            segments: Array.isArray(promo.segments) && promo.segments.length ? promo.segments : [''],
        });
        setLinkedAccountSearch('');
        setLinkedAccountPickId(null);
        setShowAccountDropdown(false);
        setShowModal(true);
    };

    const handleSaveAccountFromModal = (accountData: any) => {
        if (!setAccounts || typeof setAccounts !== 'function') return;
        if (!accountData?.name) return;
        const u = currentUser?.name || currentUser?.username || currentUser?.email || 'User';
        const act = {
            id: `acct-${Date.now()}`,
            at: new Date().toISOString(),
            title: 'Account created',
            body: 'Account created from Promotions.',
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
        setAccounts((prev: any[]) => [newAccount, ...(Array.isArray(prev) ? prev : [])]);
        setShowAddAccountModal(false);
        setLinkedAccountSearch(newAccount.name);
        setLinkedAccountPickId(String(newAccount.id));
        setShowAccountDropdown(false);
        setDraft((p: PromotionRow) => {
            if ((p.linkedAccounts || []).some((x) => String(x.accountId) === String(newAccount.id))) return p;
            return { ...p, linkedAccounts: [...(p.linkedAccounts || []), { accountId: String(newAccount.id), note: '' }] };
        });
    };

    const effectiveAccountTypeOpts = Array.isArray(accountTypeOptions) && accountTypeOptions.length ? accountTypeOptions : undefined;

    const dupCheckAccounts =
        typeof setAccounts === 'function'
            ? (accounts || []).filter((a: any) => {
                  const pid = String(activeProperty?.id || '').trim();
                  if (!pid) return true;
                  const p = String(a?.propertyId || '').trim();
                  return !p || p === 'P-GLOBAL' || p === pid;
              })
            : [];

    const savePromotion = async () => {
        const payload: PromotionRow = {
            ...draft,
            propertyId: String(activeProperty?.id || ''),
            name: String(draft.name || '').trim(),
            linkedAccounts: (draft.linkedAccounts || []).filter((a) => String(a?.accountId || '').trim()),
            segments: (draft.segments || []).map((s) => String(s || '').trim()).filter(Boolean),
        };
        if (!payload.name) return;
        const res = await fetch(apiUrl('/api/promotions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) return;
        const saved = await res.json();
        setPromotions((prev: any[]) => {
            const list = Array.isArray(prev) ? [...prev] : [];
            const idx = list.findIndex((x: any) => String(x?.id) === String(saved?.id) && String(x?.propertyId) === String(saved?.propertyId));
            if (idx >= 0) list[idx] = saved;
            else list.unshift(saved);
            return list;
        });
        setShowModal(false);
    };

    const removePromotion = async (promo: PromotionRow) => {
        const pid = String(activeProperty?.id || '');
        if (!pid) return;
        const res = await fetch(apiUrl(`/api/promotions/${encodeURIComponent(String(promo.id))}?propertyId=${encodeURIComponent(pid)}`), {
            method: 'DELETE',
        });
        if (!res.ok) return;
        setPromotions((prev: any[]) => (Array.isArray(prev) ? prev.filter((x: any) => !(String(x?.id) === String(promo.id) && String(x?.propertyId) === pid)) : []));
        if (expandedId === String(promo.id)) setExpandedId(null);
    };

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold" style={{ color: colors.primary }}>Promotions</h2>
                    <p className="text-xs opacity-70" style={{ color: colors.textMuted }}>Track promotion performance by linked accounts and request segments.</p>
                </div>
                {canCreate ? (
                    <button
                        type="button"
                        onClick={openCreate}
                        className="px-4 py-2 rounded-xl font-bold flex items-center gap-2"
                        style={{ backgroundColor: colors.primary, color: '#000' }}
                    >
                        <Plus size={16} /> Add Promotion
                    </button>
                ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <p className="text-[11px] uppercase font-bold opacity-70" style={{ color: colors.textMuted }}>Total Promotions</p>
                    <p className="text-2xl font-black mt-1" style={{ color: colors.textMain }}>{totals.totalPromotions}</p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <p className="text-[11px] uppercase font-bold opacity-70" style={{ color: colors.textMuted }}>Total Revenue</p>
                    <p className="text-2xl font-black mt-1" style={{ color: colors.textMain }}>{formatMoney(totals.totalRevenue)}</p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <p className="text-[11px] uppercase font-bold opacity-70" style={{ color: colors.textMuted }}>Total Requests</p>
                    <p className="text-2xl font-black mt-1" style={{ color: colors.textMain }}>{totals.totalRequests}</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-end">
                <div className="w-full md:w-56">
                    <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: colors.textMuted }}>Promotion Status</label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all text-sm"
                        style={{ borderColor: colors.border, color: colors.textMain }}
                    >
                        <option value="all">All statuses</option>
                        <option value="Draft">Draft</option>
                        <option value="Active">Active</option>
                        <option value="Expired">Expired</option>
                    </select>
                </div>
                <div className="w-full md:flex-1">
                    <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: colors.textMuted }}>Search</label>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search promotion name..."
                        className="w-full px-3 py-2 rounded border bg-black/20 outline-none focus:border-primary transition-all text-sm"
                        style={{ borderColor: colors.border, color: colors.textMain }}
                    />
                </div>
            </div>

            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: colors.border }}>
                <table className="w-full text-left">
                    <thead style={{ backgroundColor: colors.card }}>
                        <tr className="text-xs uppercase opacity-70" style={{ color: colors.textMuted }}>
                            <th className="px-3 py-3">Promotion</th><th className="px-3 py-3">Accounts</th><th className="px-3 py-3">Segments</th>
                            <th className="px-3 py-3">Revenue</th><th className="px-3 py-3">Start</th><th className="px-3 py-3">End</th>
                            <th className="px-3 py-3">Requests</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredPromotions.map((promo: PromotionRow) => {
                            const m = metricsByPromotion.get(String(promo.id)) || { revenue: 0, requests: 0, byAccount: new Map() };
                            const st = effectiveStatus(promo);
                            const stColor = statusColor(st, colors);
                            const isOpen = expandedId === String(promo.id);
                            return (
                                <React.Fragment key={`${promo.id}-${promo.propertyId}`}>
                                    <tr className="border-t" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                        <td className="px-3 py-3">
                                            <button type="button" onClick={() => setExpandedId(isOpen ? null : String(promo.id))} className="flex items-center gap-2 font-semibold" style={{ color: colors.textMain }}>
                                                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{promo.name}
                                            </button>
                                        </td>
                                        <td className="px-3 py-3">{(promo.linkedAccounts || []).length}</td>
                                        <td className="px-3 py-3 truncate max-w-[220px]" title={(promo.segments || []).join(', ')}>{(promo.segments || []).join(', ') || '—'}</td>
                                        <td className="px-3 py-3">{formatMoney(m.revenue)}</td>
                                        <td className="px-3 py-3">{promo.startDate || '—'}</td>
                                        <td className="px-3 py-3">{promo.endDate || '—'}</td>
                                        <td className="px-3 py-3">{m.requests}</td>
                                        <td className="px-3 py-3">
                                            <span className="px-2 py-1 rounded-lg text-xs font-bold" style={{ backgroundColor: stColor.bg, color: stColor.text }}>{st}</span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex items-center gap-2">
                                                {canEdit ? <button type="button" onClick={() => openEdit(promo)} className="p-1 rounded hover:bg-white/10"><Pencil size={14} /></button> : null}
                                                {canDelete ? <button type="button" onClick={() => removePromotion(promo)} className="p-1 rounded hover:bg-white/10"><Trash2 size={14} /></button> : null}
                                            </div>
                                        </td>
                                    </tr>
                                    {isOpen ? (
                                        <tr>
                                            <td className="px-4 py-3 border-t" style={{ borderColor: colors.border }} colSpan={9}>
                                                <div className="rounded-xl border p-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                                                    <p className="text-xs font-bold uppercase opacity-70 mb-2" style={{ color: colors.textMuted }}>Linked accounts performance</p>
                                                    <div className="space-y-2">
                                                        {(promo.linkedAccounts || []).map((a) => {
                                                            const acc = (accounts || []).find((x: any) => String(x?.id) === String(a.accountId));
                                                            const perAcc = m.byAccount.get(String(a.accountId)) || { revenue: 0, requests: 0 };
                                                            const accountKey = `${promo.id}::${a.accountId}`;
                                                            const accountOpen = expandedAccountKey === accountKey;
                                                            const requestRows = requestsByPromotionAndAccount.get(accountKey) || [];
                                                            return (
                                                                <div key={`${promo.id}-${a.accountId}`} className="space-y-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setExpandedAccountKey(accountOpen ? null : accountKey)}
                                                                        className="w-full text-left grid grid-cols-1 md:grid-cols-4 gap-2 text-sm hover:bg-white/5 rounded p-1.5 transition-colors"
                                                                    >
                                                                    <div className="font-semibold">{acc?.name || `Account ${a.accountId}`}</div>
                                                                    <div>Requests: <b>{perAcc.requests}</b></div>
                                                                    <div>Revenue: <b>{formatMoney(perAcc.revenue)}</b></div>
                                                                    <div className="opacity-80">Note: {a.note || '—'}</div>
                                                                    </button>
                                                                    {accountOpen ? (
                                                                        <div className="rounded-lg border overflow-x-auto" style={{ borderColor: colors.border }}>
                                                                            <table className="w-full text-left text-xs">
                                                                                <thead style={{ backgroundColor: colors.bg }}>
                                                                                    <tr style={{ color: colors.textMuted }}>
                                                                                        <th className="px-2 py-2">Request Name</th>
                                                                                        <th className="px-2 py-2">Dates Start</th>
                                                                                        <th className="px-2 py-2">Dates End</th>
                                                                                        <th className="px-2 py-2">Check-in</th>
                                                                                        <th className="px-2 py-2">Check-out</th>
                                                                                        <th className="px-2 py-2">Rooms</th>
                                                                                        <th className="px-2 py-2">Pax</th>
                                                                                        <th className="px-2 py-2">Total Revenue</th>
                                                                                        <th className="px-2 py-2">Status</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {requestRows.map((req: any) => {
                                                                                        const window = getRequestDateWindow(req);
                                                                                        const pax = countPax(req);
                                                                                        return (
                                                                                            <tr key={String(req?.id)} className="border-t" style={{ borderColor: colors.border }}>
                                                                                                <td className="px-2 py-2">{String(req?.requestName || req?.confirmationNo || req?.id || '—')}</td>
                                                                                                <td className="px-2 py-2">{window.start || '—'}</td>
                                                                                                <td className="px-2 py-2">{window.end || '—'}</td>
                                                                                                <td className="px-2 py-2">{String(req?.checkIn || '—')}</td>
                                                                                                <td className="px-2 py-2">{String(req?.checkOut || '—')}</td>
                                                                                                <td className="px-2 py-2">{countRooms(req)}</td>
                                                                                                <td className="px-2 py-2">{pax > 0 ? pax : '—'}</td>
                                                                                                <td className="px-2 py-2">{formatMoney(requestRevenue(req))}</td>
                                                                                                <td className="px-2 py-2">{String(req?.status || '—')}</td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                    {requestRows.length === 0 ? (
                                                                                        <tr>
                                                                                            <td className="px-2 py-3 opacity-60" style={{ color: colors.textMuted }} colSpan={9}>No linked requests for this account.</td>
                                                                                        </tr>
                                                                                    ) : null}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : null}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {showModal ? (
                <div className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border p-5 space-y-4 custom-scrollbar" style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.textMain }}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold">{draft.id ? 'Edit Promotion' : 'Add Promotion'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-white/10"><X size={16} /></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div><label className="text-xs font-bold opacity-70">Promotion Name</label><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full mt-1 px-3 py-2 rounded border bg-black/20" style={{ borderColor: colors.border }} /></div>
                            <div><label className="text-xs font-bold opacity-70">Status</label><select value={draft.status || 'Draft'} onChange={(e) => setDraft({ ...draft, status: e.target.value as any })} className="w-full mt-1 px-3 py-2 rounded border bg-black/20" style={{ borderColor: colors.border }}><option value="Draft">Draft</option><option value="Active">Active</option><option value="Expired">Expired</option></select></div>
                            <div><label className="text-xs font-bold opacity-70">Start Date</label><input type="date" value={draft.startDate || ''} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className="w-full mt-1 px-3 py-2 rounded border bg-black/20" style={{ borderColor: colors.border }} /></div>
                            <div><label className="text-xs font-bold opacity-70">End Date</label><input type="date" value={draft.endDate || ''} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} className="w-full mt-1 px-3 py-2 rounded border bg-black/20" style={{ borderColor: colors.border }} /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="flex items-center gap-2 text-sm" style={{ color: colors.textMain }}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(draft.includeRoomsRevenue ?? true)}
                                    onChange={(e) => setDraft({ ...draft, includeRoomsRevenue: e.target.checked })}
                                    className="w-4 h-4 rounded"
                                    style={{ accentColor: colors.primary }}
                                />
                                Rooms
                            </label>
                            <label className="flex items-center gap-2 text-sm" style={{ color: colors.textMain }}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(draft.includeEventsRevenue ?? true)}
                                    onChange={(e) => setDraft({ ...draft, includeEventsRevenue: e.target.checked })}
                                    className="w-4 h-4 rounded"
                                    style={{ accentColor: colors.primary }}
                                />
                                Events
                            </label>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold opacity-70">Linked Request Segments</label>
                            {(draft.segments || []).map((seg, idx) => (
                                <div key={`seg-${idx}`} className="flex items-center gap-2">
                                    <select value={seg} onChange={(e) => setDraft((p) => ({ ...p, segments: p.segments.map((x, i) => (i === idx ? e.target.value : x)) }))} className="flex-1 px-3 py-2 rounded border bg-black/20" style={{ borderColor: colors.border }}>
                                        <option value="">Select segment...</option>
                                        {(segmentOptions || []).map((s: string) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <button type="button" onClick={() => setDraft((p) => ({ ...p, segments: p.segments.filter((_, i) => i !== idx) || [''] }))} className="p-2 rounded border" style={{ borderColor: colors.border }}><X size={14} /></button>
                                </div>
                            ))}
                            <button type="button" onClick={() => setDraft((p) => ({ ...p, segments: [...(p.segments || []), ''] }))} className="px-3 py-1.5 rounded border text-xs font-bold" style={{ borderColor: colors.border }}>Add Another Segment</button>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold opacity-70">Linked Accounts</label>
                            <div className="flex gap-2">
                                <div ref={linkedAccountComboRef} className="relative flex-1">
                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                                    <input
                                        value={linkedAccountSearch}
                                        onChange={(e) => {
                                            setLinkedAccountSearch(e.target.value);
                                            setLinkedAccountPickId(null);
                                            setShowAccountDropdown(true);
                                        }}
                                        onFocus={() => setShowAccountDropdown(true)}
                                        placeholder="Search account..."
                                        className="w-full pl-9 pr-3 py-1.5 rounded border bg-black/20 outline-none focus:border-primary transition-all text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    />
                                    {showAccountDropdown ? (
                                        <div className="absolute z-50 top-full mt-1 left-0 right-0 max-h-60 overflow-y-auto rounded border shadow-xl"
                                            style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                                            {(accounts || [])
                                                .filter((a: any) =>
                                                    String(a?.name || '')
                                                        .toLowerCase()
                                                        .includes(String(linkedAccountSearch || '').toLowerCase()),
                                                )
                                                .map((a: any) => (
                                                    <button
                                                        key={a.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setLinkedAccountSearch(String(a.name || ''));
                                                            setLinkedAccountPickId(String(a.id));
                                                            setShowAccountDropdown(false);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                                                        style={{ color: colors.textMain }}
                                                    >
                                                        {a.name}
                                                        {a.type ? (
                                                            <span className="text-[10px] opacity-40 ml-1"> ({a.type})</span>
                                                        ) : null}
                                                    </button>
                                                ))}
                                        </div>
                                    ) : null}
                                </div>
                                <button type="button" onClick={() => {
                                    const q = String(linkedAccountSearch || '').trim();
                                    const byPick =
                                        linkedAccountPickId &&
                                        (accounts || []).some((a: any) => String(a?.id) === linkedAccountPickId)
                                            ? linkedAccountPickId
                                            : undefined;
                                    const selectedId =
                                        byPick ||
                                        (accounts || []).find((a: any) => String(a?.name || '').toLowerCase() === q.toLowerCase())?.id ||
                                        (accounts || []).find((a: any) => String(a?.id) === q)?.id;
                                    if (!selectedId) return;
                                    setDraft((p) => {
                                        if ((p.linkedAccounts || []).some((x) => String(x.accountId) === String(selectedId))) return p;
                                        return {
                                            ...p,
                                            linkedAccounts: [...(p.linkedAccounts || []), { accountId: String(selectedId), note: '' }],
                                        };
                                    });
                                    setLinkedAccountSearch('');
                                    setLinkedAccountPickId(null);
                                    setShowAccountDropdown(false);
                                }} className="px-3 py-1.5 rounded border text-xs font-bold shrink-0" style={{ borderColor: colors.border }}>Add Account</button>
                                {setAccounts && (canCreate || canEdit) ? (
                                    <button
                                        type="button"
                                        title="Create new account"
                                        onClick={() => setShowAddAccountModal(true)}
                                        className="px-3 py-1.5 rounded border text-xs font-bold shrink-0 flex items-center gap-1"
                                        style={{ borderColor: colors.border }}
                                    >
                                        <Plus size={14} />
                                    </button>
                                ) : null}
                            </div>
                            <div className="max-h-[26vh] overflow-y-auto pr-1 custom-scrollbar space-y-1.5">
                            {(draft.linkedAccounts || []).map((a, idx) => {
                                const acc = (accounts || []).find((x: any) => String(x.id) === String(a.accountId));
                                return (
                                    <div key={`${a.accountId}-${idx}`} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-1.5">
                                        <div className="px-2.5 py-1.5 rounded border bg-black/20 text-sm leading-tight flex flex-wrap items-baseline gap-x-2" style={{ borderColor: colors.border }}>
                                            <span>{acc?.name || a.accountId}</span>
                                            {acc?.type ? (
                                                <span className="text-[10px] opacity-40">({acc.type})</span>
                                            ) : null}
                                        </div>
                                        <input value={a.note || ''} onChange={(e) => setDraft((p) => ({ ...p, linkedAccounts: p.linkedAccounts.map((row, i) => i === idx ? { ...row, note: e.target.value } : row) }))} placeholder="Account feedback note..." className="px-2.5 py-1.5 rounded border bg-black/20 text-sm" style={{ borderColor: colors.border }} />
                                        <button type="button" onClick={() => setDraft((p) => ({ ...p, linkedAccounts: p.linkedAccounts.filter((_, i) => i !== idx) }))} className="px-2 rounded border" style={{ borderColor: colors.border }}><X size={13} /></button>
                                    </div>
                                );
                            })}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold opacity-70">Terms & Conditions</label>
                            <textarea value={draft.terms || ''} onChange={(e) => setDraft({ ...draft, terms: e.target.value })} className="w-full mt-1 px-3 py-2 rounded border bg-black/20 min-h-[100px]" style={{ borderColor: colors.border }} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded border text-sm font-bold" style={{ borderColor: colors.border }}>Cancel</button>
                            <button type="button" onClick={savePromotion} className="px-4 py-2 rounded text-sm font-bold" style={{ backgroundColor: colors.primary, color: '#000' }}>Save Promotion</button>
                        </div>
                    </div>
                </div>
            ) : null}
            <AddAccountModal
                isOpen={showAddAccountModal}
                onClose={() => setShowAddAccountModal(false)}
                onSave={handleSaveAccountFromModal}
                theme={theme}
                accountTypeOptions={effectiveAccountTypeOpts}
                duplicateCheckAccounts={dupCheckAccounts}
                duplicateCheckPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                configurationProperty={activeProperty || undefined}
                configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
            />
        </div>
    );
}
