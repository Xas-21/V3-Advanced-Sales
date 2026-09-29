import React, { useEffect, useState } from 'react';
import type { ProformaIssue } from './proformaIssue';

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
};

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
}: Props) {
    const [poDraft, setPoDraft] = useState('');
    const [editingPo, setEditingPo] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPoDraft(issued?.poNumber || '');
        setEditingPo(false);
    }, [open, issued?.poNumber, firstIssue]);

    if (!open) return null;

    const fieldStyle = {
        borderColor: colors.border,
        color: colors.textMain,
        background: 'transparent',
    };

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()} />
            <div
                className="relative w-full max-w-md rounded-2xl border shadow-2xl p-5"
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
                        <div className="flex flex-wrap justify-end gap-2">
                            {!editingPo ? (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setEditingPo(true)}
                                    className="px-4 py-2 rounded-xl border text-sm font-semibold"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                >
                                    Edit PO
                                </button>
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
