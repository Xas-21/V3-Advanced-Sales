import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { computeBalance, requestOwed, type LedgerEntry } from './accountBalance';
import {
    deleteLedgerEntry,
    fetchLedger,
    postLedgerEntry,
    transferAllocation,
} from './accountLedgerApi';
import { formatCompactCurrency } from './formatCompactCurrency';
import type { CurrencyCode } from './currency';
import { resolvePaymentMethodsForProperty } from './propertyPaymentMethods';

export type AccountBillingPanelProps = {
    account: any;
    linkedRequests: any[];
    propertyId: string;
    currency: CurrencyCode;
    theme: any;
    canEdit: boolean;
    onClose: () => void;
};

function requestTotal(req: any): number {
    return parseFloat(String(req?.totalCost ?? req?.grandTotalWithTax ?? '0').replace(/,/g, '')) || 0;
}

function requestLabel(req: any): string {
    return String(req?.confirmationNo || req?.requestName || req?.id || 'Request').trim();
}

function requestLabelById(requests: any[], requestId?: string): string {
    if (!requestId) return '—';
    const hit = (requests || []).find((r) => String(r?.id) === String(requestId));
    return hit ? requestLabel(hit) : String(requestId);
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

export default function AccountBillingPanel({
    account,
    linkedRequests,
    propertyId,
    currency,
    theme,
    canEdit,
    onClose,
}: AccountBillingPanelProps) {
    const colors = theme.colors;
    const accountId = String(account?.id || '').trim();
    const accountName = String(account?.name || account?.company || 'Account').trim();

    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const paymentMethods = useMemo(
        () => resolvePaymentMethodsForProperty(propertyId),
        [propertyId]
    );

    const [depositAmount, setDepositAmount] = useState('');
    const [depositMethod, setDepositMethod] = useState('');
    const [depositNote, setDepositNote] = useState('');
    const [depositDate, setDepositDate] = useState(todayIso);

    useEffect(() => {
        setDepositMethod((prev) => prev || paymentMethods[0] || 'Cash');
    }, [paymentMethods]);

    const reload = useCallback(async () => {
        if (!accountId) {
            setEntries([]);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const rows = await fetchLedger(accountId, propertyId || undefined);
            setEntries(rows);
        } catch {
            setEntries([]);
            setError('Could not load ledger.');
        } finally {
            setLoading(false);
        }
    }, [accountId, propertyId]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const balance = useMemo(() => computeBalance(entries), [entries]);
    const balanceOk = balance >= 0;

    const history = useMemo(() => {
        return [...entries].sort((a, b) => {
            const da = String(a.date || '');
            const db = String(b.date || '');
            if (da !== db) return db.localeCompare(da);
            return String(b.id || '').localeCompare(String(a.id || ''));
        });
    }, [entries]);

    const addDeposit = async () => {
        if (!canEdit || !accountId) return;
        const amount = Number(depositAmount);
        if (!(amount > 0)) {
            setError('Enter a deposit amount greater than zero.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await postLedgerEntry({
                type: 'deposit',
                amount,
                accountId,
                propertyId: propertyId || undefined,
                method: depositMethod || paymentMethods[0] || 'Cash',
                note: depositNote || undefined,
                date: depositDate || todayIso(),
            });
            setDepositAmount('');
            setDepositNote('');
            setDepositDate(todayIso());
            await reload();
        } catch {
            setError('Deposit failed.');
        } finally {
            setBusy(false);
        }
    };

    const undoEntry = async (entryId: string) => {
        if (!canEdit) return;
        setBusy(true);
        setError('');
        try {
            await deleteLedgerEntry(entryId, propertyId || undefined);
            await reload();
        } catch {
            setError('Delete failed.');
        } finally {
            setBusy(false);
        }
    };

    const moveEntry = async (entryId: string, toRequestId: string) => {
        if (!canEdit || !toRequestId) return;
        setBusy(true);
        setError('');
        try {
            await transferAllocation(entryId, toRequestId);
            await reload();
        } catch {
            setError('Transfer failed.');
        } finally {
            setBusy(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        backgroundColor: colors.bg,
        borderColor: colors.border,
        color: colors.textMain,
    };

    return (
        <div
            className="fixed inset-0 z-[220] flex flex-col p-3 md:p-4 overflow-hidden"
            style={{ backgroundColor: 'rgba(0,0,0,0.78)' }}
            onClick={onClose}
        >
            <div
                className="mx-auto w-full max-w-[min(96vw,720px)] flex-1 min-h-0 max-h-full flex flex-col rounded-2xl border overflow-hidden"
                style={{ backgroundColor: colors.bg, borderColor: colors.border, maxHeight: '92vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b"
                    style={{ borderColor: colors.border, backgroundColor: colors.card }}
                >
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: colors.textMain }}>
                            Billing — {accountName}
                        </h2>
                        <p className="text-xs" style={{ color: colors.textMuted }}>
                            Account balance, deposits, and request allocations
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg border hover:bg-white/5"
                        style={{ borderColor: colors.border, color: colors.textMuted }}
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-5">
                    {error ? (
                        <p className="text-xs font-semibold" style={{ color: colors.red }}>
                            {error}
                        </p>
                    ) : null}

                    <div
                        className="p-4 rounded-xl border"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>
                            {balanceOk ? 'Prepaid credit' : 'Outstanding to collect'}
                        </p>
                        <p
                            className="text-3xl font-mono font-bold"
                            style={{ color: balanceOk ? colors.green : colors.red }}
                        >
                            {formatCompactCurrency(Math.abs(balance), currency)}
                        </p>
                        {loading ? (
                            <p className="text-xs mt-2" style={{ color: colors.textMuted }}>
                                Loading ledger…
                            </p>
                        ) : null}
                    </div>

                    {canEdit ? (
                        <div
                            className="p-4 rounded-xl border space-y-3"
                            style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        >
                            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                                Add Deposit
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="block text-xs space-y-1">
                                    <span style={{ color: colors.textMuted }}>Amount</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={depositAmount}
                                        onChange={(e) => setDepositAmount(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
                                        style={inputStyle}
                                    />
                                </label>
                                <label className="block text-xs space-y-1">
                                    <span style={{ color: colors.textMuted }}>Method</span>
                                    <select
                                        value={depositMethod}
                                        onChange={(e) => setDepositMethod(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border text-sm"
                                        style={inputStyle}
                                    >
                                        {paymentMethods.map((m) => (
                                            <option key={m} value={m}>
                                                {m}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block text-xs space-y-1">
                                    <span style={{ color: colors.textMuted }}>Date</span>
                                    <input
                                        type="date"
                                        value={depositDate}
                                        onChange={(e) => setDepositDate(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border text-sm"
                                        style={inputStyle}
                                    />
                                </label>
                                <label className="block text-xs space-y-1">
                                    <span style={{ color: colors.textMuted }}>Note</span>
                                    <input
                                        type="text"
                                        value={depositNote}
                                        onChange={(e) => setDepositNote(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border text-sm"
                                        style={inputStyle}
                                    />
                                </label>
                            </div>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void addDeposit()}
                                className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                            >
                                Post deposit
                            </button>
                        </div>
                    ) : null}

                    <div
                        className="p-4 rounded-xl border space-y-3"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                            Linked requests
                        </h3>
                        {(linkedRequests || []).length === 0 ? (
                            <p className="text-xs" style={{ color: colors.textMuted }}>
                                No linked requests.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {(linkedRequests || []).map((req) => {
                                    const total = requestTotal(req);
                                    const owed = requestOwed(entries, String(req.id), total);
                                    return (
                                        <li
                                            key={String(req.id)}
                                            className="flex flex-wrap items-baseline justify-between gap-2 py-2 border-b last:border-0"
                                            style={{ borderColor: colors.border }}
                                        >
                                            <div>
                                                <span className="text-sm font-semibold" style={{ color: colors.textMain }}>
                                                    {requestLabel(req)}
                                                </span>
                                                <span className="text-xs ml-2" style={{ color: colors.textMuted }}>
                                                    Total {formatCompactCurrency(total, currency)}
                                                </span>
                                            </div>
                                            {owed > 0 ? (
                                                <span className="text-sm font-mono font-bold" style={{ color: colors.red }}>
                                                    Owed {formatCompactCurrency(owed, currency)}
                                                </span>
                                            ) : (
                                                <span className="text-xs" style={{ color: colors.textMuted }}>
                                                    No CL owed
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <div
                        className="p-4 rounded-xl border space-y-3"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                            History
                        </h3>
                        {history.length === 0 ? (
                            <p className="text-xs" style={{ color: colors.textMuted }}>
                                No ledger entries yet.
                            </p>
                        ) : (
                            <ul className="space-y-3">
                                {history.map((entry) => {
                                    const amt = Number(entry.amount) || 0;
                                    const canTransfer =
                                        canEdit && (entry.type === 'allocation' || entry.type === 'cl_charge');
                                    return (
                                        <li
                                            key={entry.id}
                                            className="py-2 border-b last:border-0 space-y-2"
                                            style={{ borderColor: colors.border }}
                                        >
                                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                                <div className="min-w-0">
                                                    <span
                                                        className="text-xs font-bold uppercase tracking-wide"
                                                        style={{ color: colors.textMuted }}
                                                    >
                                                        {String(entry.type || '').replace('_', ' ')}
                                                    </span>
                                                    <span className="text-sm ml-2" style={{ color: colors.textMain }}>
                                                        {requestLabelById(linkedRequests, entry.requestId)}
                                                    </span>
                                                    {entry.date ? (
                                                        <span className="text-xs ml-2" style={{ color: colors.textMuted }}>
                                                            {entry.date}
                                                        </span>
                                                    ) : null}
                                                    {entry.user ? (
                                                        <span className="text-xs ml-2" style={{ color: colors.textMuted }}>
                                                            · {entry.user}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="text-sm font-mono font-bold"
                                                        style={{ color: amt >= 0 ? colors.green : colors.red }}
                                                    >
                                                        {amt >= 0 ? '+' : ''}
                                                        {formatCompactCurrency(amt, currency)}
                                                    </span>
                                                    {canEdit ? (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => void undoEntry(entry.id)}
                                                            className="text-xs font-bold px-2 py-1 rounded border hover:bg-white/5 disabled:opacity-50"
                                                            style={{ borderColor: colors.border, color: colors.textMuted }}
                                                            title="Undo / delete entry"
                                                        >
                                                            Undo
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {canTransfer ? (
                                                <label className="flex flex-wrap items-center gap-2 text-xs">
                                                    <span style={{ color: colors.textMuted }}>Move to request</span>
                                                    <select
                                                        defaultValue=""
                                                        disabled={busy}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            e.target.value = '';
                                                            if (v) void moveEntry(entry.id, v);
                                                        }}
                                                        className="px-2 py-1 rounded border text-xs max-w-[16rem]"
                                                        style={inputStyle}
                                                    >
                                                        <option value="">Select…</option>
                                                        {(linkedRequests || []).map((req) => (
                                                            <option key={String(req.id)} value={String(req.id)}>
                                                                {requestLabel(req)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            ) : null}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
