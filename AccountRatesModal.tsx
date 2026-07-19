import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, Plus, Trash2, X } from 'lucide-react';
import { apiUrl } from './backendApi';
import {
    normalizeAccountRatePeriod,
    type AccountRatePeriod,
    type AccountRateRow,
} from './accountRates';
import {
    resolveOccupancyTypesForProperty,
    OCCUPANCY_TYPES_CHANGED_EVENT,
} from './propertyOccupancyTypes';
import { resolveSegmentsForProperty } from './propertyTaxonomy';

type Props = {
    open: boolean;
    onClose: () => void;
    theme: any;
    accountId: string;
    accountName?: string;
    propertyId: string;
    activeProperty?: any;
    segmentOptions?: string[];
    readOnly?: boolean;
};

type View = 'list' | 'period' | 'periodForm';

function newRowId() {
    return `rr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function AccountRatesModal({
    open,
    onClose,
    theme,
    accountId,
    accountName,
    propertyId,
    activeProperty,
    segmentOptions: segmentOptionsProp,
    readOnly = false,
}: Props) {
    const colors = theme.colors;
    const [periods, setPeriods] = useState<AccountRatePeriod[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [view, setView] = useState<View>('list');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [roomNames, setRoomNames] = useState<string[]>([]);
    const [occRev, setOccRev] = useState(0);

    const [periodDraft, setPeriodDraft] = useState({
        id: '',
        startDate: '',
        endDate: '',
        segments: [''] as string[],
    });

    const [rowModalOpen, setRowModalOpen] = useState(false);
    const [rowDraft, setRowDraft] = useState({ roomType: '', occupancy: '', rate: 0 });
    const [editingRowId, setEditingRowId] = useState<string | null>(null);

    const segmentOptions = useMemo(() => {
        if (Array.isArray(segmentOptionsProp) && segmentOptionsProp.length) return segmentOptionsProp;
        return resolveSegmentsForProperty(propertyId, activeProperty);
    }, [segmentOptionsProp, propertyId, activeProperty]);

    const occupancyOptions = useMemo(() => {
        void occRev;
        return resolveOccupancyTypesForProperty(propertyId, activeProperty);
    }, [propertyId, activeProperty, occRev]);

    useEffect(() => {
        const onOcc = () => setOccRev((n) => n + 1);
        window.addEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, onOcc);
        return () => window.removeEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, onOcc);
    }, []);

    const selected = useMemo(
        () => periods.find((p) => p.id === selectedId) || null,
        [periods, selectedId]
    );

    const reload = useCallback(async () => {
        const pid = String(propertyId || '').trim();
        const aid = String(accountId || '').trim();
        if (!pid || !aid) return;
        setLoading(true);
        setError('');
        try {
            const [ratesRes, roomsRes] = await Promise.all([
                fetch(
                    apiUrl(
                        `/api/account-rates?propertyId=${encodeURIComponent(pid)}&accountId=${encodeURIComponent(aid)}`
                    )
                ),
                fetch(apiUrl(`/api/rooms?propertyId=${encodeURIComponent(pid)}`)),
            ]);
            const ratesData = ratesRes.ok ? await ratesRes.json() : [];
            const roomsData = roomsRes.ok ? await roomsRes.json() : [];
            const next = (Array.isArray(ratesData) ? ratesData : [])
                .map(normalizeAccountRatePeriod)
                .filter(Boolean) as AccountRatePeriod[];
            next.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
            setPeriods(next);
            setRoomNames(
                (Array.isArray(roomsData) ? roomsData : [])
                    .map((r: any) => String(r?.name || '').trim())
                    .filter(Boolean)
            );
        } catch {
            setError('Could not load rates.');
        } finally {
            setLoading(false);
        }
    }, [accountId, propertyId]);

    useEffect(() => {
        if (!open) return;
        setView('list');
        setSelectedId(null);
        setRowModalOpen(false);
        setError('');
        void reload();
    }, [open, reload]);

    const savePeriod = async (doc: AccountRatePeriod) => {
        const res = await fetch(apiUrl('/api/account-rates'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(doc),
        });
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            throw new Error(t || `Save failed (${res.status})`);
        }
        const saved = normalizeAccountRatePeriod(await res.json());
        if (!saved) throw new Error('Invalid save response');
        setPeriods((prev) => {
            const others = prev.filter((p) => p.id !== saved.id);
            return [saved, ...others].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
        });
        return saved;
    };

    const openNewPeriod = () => {
        setPeriodDraft({ id: '', startDate: '', endDate: '', segments: [segmentOptions[0] || ''] });
        setView('periodForm');
    };

    const openEditPeriodMeta = (p: AccountRatePeriod) => {
        setPeriodDraft({
            id: p.id,
            startDate: p.startDate,
            endDate: p.endDate,
            segments: p.segments.length ? [...p.segments] : [''],
        });
        setView('periodForm');
    };

    const submitPeriodForm = async () => {
        const startDate = String(periodDraft.startDate || '').slice(0, 10);
        const endDate = String(periodDraft.endDate || '').slice(0, 10);
        const segments = periodDraft.segments.map((s) => s.trim()).filter(Boolean);
        if (!startDate || !endDate) {
            setError('Start and end dates are required.');
            return;
        }
        if (endDate < startDate) {
            setError('End date must be on or after start date.');
            return;
        }
        if (!segments.length) {
            setError('Select at least one request segment.');
            return;
        }
        setError('');
        try {
            const existing = periodDraft.id ? periods.find((p) => p.id === periodDraft.id) : null;
            const doc: AccountRatePeriod = {
                id: periodDraft.id || `AR${Date.now().toString(36)}`,
                propertyId: String(propertyId).trim(),
                accountId: String(accountId).trim(),
                startDate,
                endDate,
                segments,
                rows: existing?.rows || [],
            };
            const saved = await savePeriod(doc);
            setSelectedId(saved.id);
            setView('period');
        } catch (e: any) {
            setError(String(e?.message || e || 'Save failed'));
        }
    };

    const deletePeriod = async (id: string) => {
        if (!window.confirm('Delete this rate period and all its room rates?')) return;
        const res = await fetch(
            apiUrl(
                `/api/account-rates/${encodeURIComponent(id)}?propertyId=${encodeURIComponent(propertyId)}`
            ),
            { method: 'DELETE' }
        );
        if (!res.ok) {
            setError('Could not delete period.');
            return;
        }
        setPeriods((prev) => prev.filter((p) => p.id !== id));
        if (selectedId === id) {
            setSelectedId(null);
            setView('list');
        }
    };

    const openAddRow = () => {
        setEditingRowId(null);
        setRowDraft({
            roomType: roomNames[0] || '',
            occupancy: occupancyOptions[0] || 'Single',
            rate: 0,
        });
        setRowModalOpen(true);
    };

    const openEditRow = (row: AccountRateRow) => {
        setEditingRowId(row.id);
        setRowDraft({ roomType: row.roomType, occupancy: row.occupancy, rate: row.rate });
        setRowModalOpen(true);
    };

    const submitRow = async () => {
        if (!selected) return;
        const roomType = String(rowDraft.roomType || '').trim();
        const occupancy = String(rowDraft.occupancy || '').trim();
        const rate = Math.max(0, Number(rowDraft.rate) || 0);
        if (!roomType || !occupancy) {
            setError('Room type and occupancy are required.');
            return;
        }
        setError('');
        const nextRows = [...(selected.rows || [])];
        if (editingRowId) {
            const idx = nextRows.findIndex((r) => r.id === editingRowId);
            if (idx >= 0) nextRows[idx] = { ...nextRows[idx], roomType, occupancy, rate };
        } else {
            const dup = nextRows.find(
                (r) =>
                    r.roomType.toLowerCase() === roomType.toLowerCase() &&
                    r.occupancy.toLowerCase() === occupancy.toLowerCase()
            );
            if (dup) {
                dup.rate = rate;
            } else {
                nextRows.push({ id: newRowId(), roomType, occupancy, rate });
            }
        }
        try {
            const saved = await savePeriod({ ...selected, rows: nextRows });
            setSelectedId(saved.id);
            setRowModalOpen(false);
        } catch (e: any) {
            setError(String(e?.message || e || 'Save failed'));
        }
    };

    const deleteRow = async (rowId: string) => {
        if (!selected) return;
        if (!window.confirm('Remove this room rate?')) return;
        try {
            const saved = await savePeriod({
                ...selected,
                rows: selected.rows.filter((r) => r.id !== rowId),
            });
            setSelectedId(saved.id);
        } catch (e: any) {
            setError(String(e?.message || e || 'Save failed'));
        }
    };

    if (!open) return null;

    const title =
        view === 'list'
            ? 'Account Rates'
            : view === 'periodForm'
              ? periodDraft.id
                  ? 'Edit period'
                  : 'Add period'
              : 'Period rates';

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl animate-in zoom-in-95 duration-200"
                style={{
                    backgroundColor: colors.card,
                    borderColor: colors.primary + '55',
                    boxShadow: `0 0 32px ${colors.primary}33`,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3 border-b" style={{ borderColor: colors.border }}>
                    <div className="flex items-center gap-2 min-w-0">
                        {view !== 'list' && (
                            <button
                                type="button"
                                onClick={() => {
                                    setError('');
                                    if (view === 'periodForm' && selectedId) setView('period');
                                    else {
                                        setView('list');
                                        setSelectedId(null);
                                    }
                                }}
                                className="p-1 rounded-lg hover:opacity-70"
                                style={{ color: colors.textMuted }}
                                aria-label="Back"
                            >
                                <ChevronLeft size={20} />
                            </button>
                        )}
                        <div className="min-w-0">
                            <h3 className="text-lg font-bold truncate" style={{ color: colors.textMain }}>
                                {title}
                            </h3>
                            {accountName ? (
                                <p className="text-[11px] truncate" style={{ color: colors.textMuted }}>
                                    {accountName}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-lg hover:opacity-70"
                        style={{ color: colors.textMuted }}
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {error ? (
                        <p className="text-xs font-bold" style={{ color: colors.danger || '#f87171' }}>
                            {error}
                        </p>
                    ) : null}
                    {loading && view === 'list' ? (
                        <p className="text-sm" style={{ color: colors.textMuted }}>
                            Loading…
                        </p>
                    ) : null}

                    {view === 'list' && !loading && (
                        <>
                            {periods.length === 0 ? (
                                <p className="text-sm text-center py-6" style={{ color: colors.textMuted }}>
                                    No rate periods yet. Add dates and room rates for this account.
                                </p>
                            ) : (
                                <ul className="space-y-2">
                                    {periods.map((p) => (
                                        <li key={p.id}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedId(p.id);
                                                    setView('period');
                                                }}
                                                className="w-full text-left px-3 py-3 rounded-xl border hover:opacity-90 transition-opacity"
                                                style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                                            >
                                                <div className="flex items-center gap-2 font-bold text-sm" style={{ color: colors.textMain }}>
                                                    <Calendar size={14} style={{ color: colors.primary }} />
                                                    {p.startDate || '—'} → {p.endDate || '—'}
                                                </div>
                                                <div className="mt-1 text-[11px]" style={{ color: colors.textMuted }}>
                                                    {(p.segments || []).join(', ') || 'No segments'} · {p.rows.length} room rate
                                                    {p.rows.length === 1 ? '' : 's'}
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}

                    {view === 'periodForm' && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.textMuted }}>
                                        From
                                    </label>
                                    <input
                                        type="date"
                                        value={periodDraft.startDate}
                                        onChange={(e) => setPeriodDraft((d) => ({ ...d, startDate: e.target.value }))}
                                        className="w-full mt-1 px-3 py-2 rounded border bg-black/20 text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.textMuted }}>
                                        To
                                    </label>
                                    <input
                                        type="date"
                                        value={periodDraft.endDate}
                                        onChange={(e) => setPeriodDraft((d) => ({ ...d, endDate: e.target.value }))}
                                        className="w-full mt-1 px-3 py-2 rounded border bg-black/20 text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.textMuted }}>
                                    Request segments
                                </label>
                                {periodDraft.segments.map((seg, idx) => (
                                    <div key={`seg-${idx}`} className="flex items-center gap-2">
                                        <select
                                            value={seg}
                                            onChange={(e) =>
                                                setPeriodDraft((d) => ({
                                                    ...d,
                                                    segments: d.segments.map((x, i) => (i === idx ? e.target.value : x)),
                                                }))
                                            }
                                            className="flex-1 px-3 py-2 rounded border bg-black/20 text-sm"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        >
                                            <option value="">Select segment…</option>
                                            {segmentOptions.map((s) => (
                                                <option key={s} value={s}>
                                                    {s}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setPeriodDraft((d) => ({
                                                    ...d,
                                                    segments: d.segments.filter((_, i) => i !== idx).length
                                                        ? d.segments.filter((_, i) => i !== idx)
                                                        : [''],
                                                }))
                                            }
                                            className="p-2 rounded border"
                                            style={{ borderColor: colors.border, color: colors.textMuted }}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setPeriodDraft((d) => ({ ...d, segments: [...d.segments, ''] }))}
                                    className="px-3 py-1.5 rounded border text-xs font-bold"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                >
                                    Add another segment
                                </button>
                            </div>
                        </div>
                    )}

                    {view === 'period' && selected && (
                        <>
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="font-bold text-sm" style={{ color: colors.textMain }}>
                                        {selected.startDate} → {selected.endDate}
                                    </div>
                                    <div className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>
                                        {(selected.segments || []).join(', ') || '—'}
                                    </div>
                                </div>
                                {!readOnly && (
                                    <button
                                        type="button"
                                        onClick={() => openEditPeriodMeta(selected)}
                                        className="text-xs font-bold underline"
                                        style={{ color: colors.primary }}
                                    >
                                        Edit dates/segments
                                    </button>
                                )}
                            </div>
                            {selected.rows.length === 0 ? (
                                <p className="text-sm py-4 text-center" style={{ color: colors.textMuted }}>
                                    No room rates in this period yet.
                                </p>
                            ) : (
                                <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr style={{ backgroundColor: colors.bg, color: colors.textMuted }}>
                                                <th className="text-left px-3 py-2 font-bold text-[10px] uppercase">Room</th>
                                                <th className="text-left px-3 py-2 font-bold text-[10px] uppercase">Occ.</th>
                                                <th className="text-right px-3 py-2 font-bold text-[10px] uppercase">Rate</th>
                                                {!readOnly && <th className="w-16" />}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selected.rows.map((row) => (
                                                <tr key={row.id} className="border-t" style={{ borderColor: colors.border }}>
                                                    <td className="px-3 py-2" style={{ color: colors.textMain }}>
                                                        <button
                                                            type="button"
                                                            className="font-bold hover:underline"
                                                            onClick={() => !readOnly && openEditRow(row)}
                                                            disabled={readOnly}
                                                        >
                                                            {row.roomType}
                                                        </button>
                                                    </td>
                                                    <td className="px-3 py-2" style={{ color: colors.textMuted }}>
                                                        {row.occupancy}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono" style={{ color: colors.textMain }}>
                                                        {Number(row.rate).toLocaleString()}
                                                    </td>
                                                    {!readOnly && (
                                                        <td className="px-2 py-2 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => deleteRow(row.id)}
                                                                className="p-1 rounded hover:opacity-70"
                                                                style={{ color: colors.textMuted }}
                                                                aria-label="Delete row"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-5 py-4 border-t flex flex-wrap gap-2" style={{ borderColor: colors.border }}>
                    {view === 'list' && !readOnly && (
                        <button
                            type="button"
                            onClick={openNewPeriod}
                            className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            <Plus size={16} /> Add period
                        </button>
                    )}
                    {view === 'periodForm' && !readOnly && (
                        <button
                            type="button"
                            onClick={() => void submitPeriodForm()}
                            className="flex-1 py-2.5 rounded-lg font-bold text-sm"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            Save period
                        </button>
                    )}
                    {view === 'period' && selected && !readOnly && (
                        <>
                            <button
                                type="button"
                                onClick={openAddRow}
                                className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                            >
                                <Plus size={16} /> Add room rates
                            </button>
                            <button
                                type="button"
                                onClick={() => void deletePeriod(selected.id)}
                                className="px-3 py-2.5 rounded-lg border font-bold text-sm"
                                style={{ borderColor: colors.border, color: colors.textMuted }}
                            >
                                <Trash2 size={16} />
                            </button>
                        </>
                    )}
                    {view === 'list' && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-lg border font-bold text-sm"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>

            {rowModalOpen && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setRowModalOpen(false)}
                >
                    <div
                        className="w-full max-w-xs p-5 rounded-2xl border shadow-2xl space-y-3"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold" style={{ color: colors.textMain }}>
                                {editingRowId ? 'Edit room rate' : 'Add room rate'}
                            </h4>
                            <button type="button" onClick={() => setRowModalOpen(false)} style={{ color: colors.textMuted }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.textMuted }}>
                                Room type
                            </label>
                            <select
                                value={rowDraft.roomType}
                                onChange={(e) => setRowDraft((d) => ({ ...d, roomType: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded border bg-black/20 text-sm"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                <option value="">Select…</option>
                                {roomNames.map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                                {rowDraft.roomType && !roomNames.includes(rowDraft.roomType) ? (
                                    <option value={rowDraft.roomType}>{rowDraft.roomType}</option>
                                ) : null}
                            </select>
                            {!roomNames.length ? (
                                <p className="text-[10px] mt-1" style={{ color: colors.textMuted }}>
                                    Add room types in Property Settings first.
                                </p>
                            ) : null}
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.textMuted }}>
                                Occupancy
                            </label>
                            <select
                                value={rowDraft.occupancy}
                                onChange={(e) => setRowDraft((d) => ({ ...d, occupancy: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded border bg-black/20 text-sm"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                {occupancyOptions.map((o) => (
                                    <option key={o} value={o}>
                                        {o}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.textMuted }}>
                                Rate
                            </label>
                            <input
                                type="number"
                                min={0}
                                step={1}
                                value={rowDraft.rate}
                                onChange={(e) => setRowDraft((d) => ({ ...d, rate: Number(e.target.value) }))}
                                className="w-full mt-1 px-3 py-2 rounded border bg-black/20 text-sm font-mono"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => void submitRow()}
                            className="w-full py-2.5 rounded-lg font-bold text-sm"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            Save rate
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
