import React, { useEffect, useState } from 'react';
import {
    emptyProformaExtraItem,
    type ProformaExtraItem,
    type ProformaIssue,
} from './proformaIssue';

type Colors = Record<string, string>;

type Props = {
    open: boolean;
    colors: Colors;
    firstIssue: boolean;
    issued: ProformaIssue | null;
    figuresUnchangedNote: boolean;
    busy: boolean;
    error: string;
    onClose: () => void;
    onSkip: () => void;
    onContinue: (poNumber: string) => void;
    onDownload: () => void;
    onReissue: () => void;
    onSavePo: (poNumber: string) => void;
    onSaveItems: (items: ProformaExtraItem[]) => void;
};

function cloneItems(items: ProformaExtraItem[] | undefined): ProformaExtraItem[] {
    return (items || []).map((row) => ({ ...row }));
}

export default function ProformaIssueModal({
    open,
    colors,
    firstIssue,
    issued,
    figuresUnchangedNote,
    busy,
    error,
    onClose,
    onSkip,
    onContinue,
    onDownload,
    onReissue,
    onSavePo,
    onSaveItems,
}: Props) {
    const [poDraft, setPoDraft] = useState('');
    const [editingPo, setEditingPo] = useState(false);
    const [editingItems, setEditingItems] = useState(false);
    const [itemsDraft, setItemsDraft] = useState<ProformaExtraItem[]>([]);

    const extraKey = JSON.stringify(issued?.extraItems || []);

    useEffect(() => {
        if (!open) return;
        setPoDraft(issued?.poNumber || '');
        setEditingPo(false);
        setEditingItems(false);
        setItemsDraft(cloneItems(issued?.extraItems));
    }, [open, issued?.poNumber, extraKey, firstIssue]);

    if (!open) return null;

    const fieldStyle = {
        borderColor: colors.border,
        color: colors.textMain,
        background: 'transparent',
    };

    const updateItem = (id: string, patch: Partial<ProformaExtraItem>) => {
        setItemsDraft((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    };

    const itemsEditor = (
        <div className="mb-3 space-y-2">
            <p className="text-xs" style={{ color: colors.textMuted }}>
                Extra lines appear on this invoice only. They do not change the request total.
            </p>
            {itemsDraft.map((row) => (
                <div key={row.id} className="space-y-2">
                <div className="grid grid-cols-12 gap-2 items-end">
                    <label className="col-span-12 sm:col-span-5 text-[10px] font-bold uppercase" style={{ color: colors.textMuted }}>
                        Description
                        <input
                            value={row.description}
                            onChange={(e) => updateItem(row.id, { description: e.target.value })}
                            className="mt-1 w-full px-2 py-1.5 rounded border outline-none text-sm font-normal"
                            style={fieldStyle}
                            disabled={busy}
                        />
                    </label>
                    <label className="col-span-4 sm:col-span-2 text-[10px] font-bold uppercase" style={{ color: colors.textMuted }}>
                        Qty
                        <input
                            type="number"
                            min={0}
                            value={row.quantity}
                            onChange={(e) => updateItem(row.id, { quantity: Number(e.target.value) || 0 })}
                            className="mt-1 w-full px-2 py-1.5 rounded border outline-none text-sm font-normal"
                            style={fieldStyle}
                            disabled={busy}
                        />
                    </label>
                    <label className="col-span-4 sm:col-span-2 text-[10px] font-bold uppercase" style={{ color: colors.textMuted }}>
                        Price
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.price}
                            onChange={(e) => updateItem(row.id, { price: Number(e.target.value) || 0 })}
                            className="mt-1 w-full px-2 py-1.5 rounded border outline-none text-sm font-normal"
                            style={fieldStyle}
                            disabled={busy}
                        />
                    </label>
                    <label className="col-span-4 sm:col-span-2 text-[10px] font-bold uppercase" style={{ color: colors.textMuted }}>
                        VAT %
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.vatPercent}
                            onChange={(e) => updateItem(row.id, { vatPercent: Number(e.target.value) || 0 })}
                            className="mt-1 w-full px-2 py-1.5 rounded border outline-none text-sm font-normal"
                            style={fieldStyle}
                            disabled={busy}
                        />
                    </label>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => setItemsDraft((prev) => prev.filter((item) => item.id !== row.id))}
                        className="col-span-12 sm:col-span-1 px-2 py-1.5 rounded-xl border text-xs"
                        style={{ borderColor: colors.border, color: colors.textMain }}
                    >
                        Delete
                    </button>
                </div>
                <div className="grid grid-cols-12 gap-2">
                    <label className="col-span-6 sm:col-span-3 text-[10px] font-bold uppercase" style={{ color: colors.textMuted }}>
                        From
                        <input
                            type="date"
                            value={row.startDate || ''}
                            onChange={(e) => updateItem(row.id, { startDate: e.target.value })}
                            className="mt-1 w-full px-2 py-1.5 rounded border outline-none text-sm font-normal"
                            style={fieldStyle}
                            disabled={busy}
                        />
                    </label>
                    <label className="col-span-6 sm:col-span-3 text-[10px] font-bold uppercase" style={{ color: colors.textMuted }}>
                        To
                        <input
                            type="date"
                            value={row.endDate || ''}
                            onChange={(e) => updateItem(row.id, { endDate: e.target.value })}
                            className="mt-1 w-full px-2 py-1.5 rounded border outline-none text-sm font-normal"
                            style={fieldStyle}
                            disabled={busy}
                        />
                    </label>
                </div>
                </div>
            ))}
            <div className="flex flex-wrap justify-end gap-2">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => setItemsDraft((prev) => [...prev, emptyProformaExtraItem()])}
                    className="px-3 py-1.5 rounded-xl border text-sm"
                    style={{ borderColor: colors.border, color: colors.textMain }}
                >
                    Add item
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                        setEditingItems(false);
                        setItemsDraft(cloneItems(issued?.extraItems));
                    }}
                    className="px-3 py-1.5 rounded-xl border text-sm"
                    style={{ borderColor: colors.border, color: colors.textMain }}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSaveItems(itemsDraft)}
                    className="px-3 py-1.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: colors.primary }}
                >
                    Save
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()} />
            <div
                className={`relative w-full rounded-2xl border shadow-2xl p-5 ${editingItems ? 'max-w-3xl' : 'max-w-md'}`}
                style={{ borderColor: colors.border, background: colors.cardBg || colors.bg }}
            >
                <h3 className="text-base font-bold mb-3" style={{ color: colors.textMain }}>
                    {firstIssue ? 'Proforma invoice' : 'Issued proforma'}
                </h3>
                {firstIssue ? (
                    <>
                        <label className="text-xs font-bold uppercase opacity-70 mb-1 block" style={{ color: colors.textMuted }}>
                            PO Number
                        </label>
                        <input
                            value={poDraft}
                            onChange={(e) => setPoDraft(e.target.value)}
                            className="w-full px-3 py-2 rounded border outline-none text-sm mb-3"
                            style={fieldStyle}
                            placeholder="Optional"
                            disabled={busy}
                        />
                        <p className="text-xs mb-4" style={{ color: colors.textMuted }}>
                            Continue with a PO, or skip. Closing this page does not download an invoice.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl border text-sm font-semibold"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onSkip}
                                className="px-4 py-2 rounded-xl border text-sm font-semibold"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                Skip
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => onContinue(poDraft)}
                                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                                style={{ background: colors.primary }}
                            >
                                Continue
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <dl className="text-sm space-y-2 mb-3" style={{ color: colors.textMain }}>
                            <div className="flex justify-between gap-3">
                                <dt className="opacity-70">Invoice number</dt>
                                <dd className="font-mono font-bold">{issued?.invoiceNumber || '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="opacity-70">PO number</dt>
                                <dd>{issued?.poNumber ? issued.poNumber : 'None added'}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="opacity-70">Date</dt>
                                <dd>{issued?.issuedOn || '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="opacity-70">Issued by</dt>
                                <dd>{issued?.issuedByName || issued?.issuedById || '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="opacity-70">Added items</dt>
                                <dd>{issued?.extraItems?.length ? `${issued.extraItems.length}` : 'None'}</dd>
                            </div>
                        </dl>
                        {figuresUnchangedNote ? (
                            <p className="text-xs mb-3" style={{ color: colors.textMuted }}>
                                Invoice figures have not changed since the last issue.
                            </p>
                        ) : null}
                        {editingPo ? (
                            <div className="mb-3">
                                <input
                                    value={poDraft}
                                    onChange={(e) => setPoDraft(e.target.value)}
                                    className="w-full px-3 py-2 rounded border outline-none text-sm mb-2"
                                    style={fieldStyle}
                                    placeholder="PO number"
                                    disabled={busy}
                                />
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                            setEditingPo(false);
                                            setPoDraft(issued?.poNumber || '');
                                        }}
                                        className="px-3 py-1.5 rounded-xl border text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => onSavePo(poDraft)}
                                        className="px-3 py-1.5 rounded-xl text-sm font-semibold text-white"
                                        style={{ background: colors.primary }}
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        {editingItems ? itemsEditor : null}
                        <div className="flex flex-wrap justify-end gap-2">
                            {!editingPo && !editingItems ? (
                                <>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                            setEditingItems(true);
                                            setItemsDraft((prev) => (prev.length ? prev : [emptyProformaExtraItem()]));
                                        }}
                                        className="px-4 py-2 rounded-xl border text-sm font-semibold"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        Add item
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                            setEditingItems(true);
                                            setItemsDraft((prev) => (prev.length ? prev : [emptyProformaExtraItem()]));
                                        }}
                                        className="px-4 py-2 rounded-xl border text-sm font-semibold"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        Edit items
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => setEditingPo(true)}
                                        className="px-4 py-2 rounded-xl border text-sm font-semibold"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        Edit PO
                                    </button>
                                </>
                            ) : null}
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onReissue}
                                className="px-4 py-2 rounded-xl border text-sm font-semibold"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                            >
                                Re-issue
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onDownload}
                                className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                                style={{ background: colors.primary }}
                            >
                                Download
                            </button>
                        </div>
                    </>
                )}
                {error ? (
                    <p className="text-xs mt-3" style={{ color: colors.red || '#ef4444' }}>
                        {error}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
