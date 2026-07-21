import React, { useState, useEffect } from 'react';
import { X, Check, PhoneCall, Plus, Tag, Info } from 'lucide-react';
import { getTagColor, setTagColorForName } from './tagColorSettings';
import { isRequestDeadlineAutoCall, toLocalYmd } from './crmActivitiesUtils';

export type LogCallInterest = 'waiting' | 'interested' | 'not_interested' | '';

export type LogCallFormData = {
    date: string;
    subject: string;
    description: string;
    nextStep: string;
    clientFeedback: string;
    interest: LogCallInterest;
    followUpRequired: boolean;
    followUpDate: string;
    newRequest: boolean;
    newAgreement: boolean;
    tags: string[];
};

const emptyForm = (lead?: any): LogCallFormData => ({
    date: toLocalYmd(),
    subject: String(lead?.subject || '').trim(),
    description: '',
    nextStep: '',
    clientFeedback: '',
    interest: '',
    followUpRequired: false,
    followUpDate: '',
    newRequest: false,
    newAgreement: false,
    tags: Array.isArray(lead?.tags) ? [...lead.tags] : [],
});

export interface LogCallModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (data: LogCallFormData) => void;
    lead: any | null;
    theme: any;
    readOnly?: boolean;
}

export default function LogCallModal({ open, onClose, onSave, lead, theme, readOnly = false }: LogCallModalProps) {
    const colors = theme.colors;
    const [form, setForm] = useState<LogCallFormData>(emptyForm);
    const [showTagInput, setShowTagInput] = useState(false);
    const [tagDraft, setTagDraft] = useState('');
    const [tagColorTick, setTagColorTick] = useState(0);
    const [showDeadlineFollowUpHint, setShowDeadlineFollowUpHint] = useState(false);

    const isDeadlineAutoCall = isRequestDeadlineAutoCall(lead);

    useEffect(() => {
        if (!open) {
            setForm(emptyForm());
            setShowTagInput(false);
            setTagDraft('');
            setShowDeadlineFollowUpHint(false);
            return;
        }
        setForm(emptyForm(lead));
        setShowTagInput(false);
        setTagDraft('');
        setShowDeadlineFollowUpHint(false);
    }, [open, lead?.id]);

    if (!open || !lead) return null;

    const deadlineFollowUpMessage =
        'No need to set a follow-up date. Change the deadline on the request to automatically create another call based on the new deadline.';

    const handleSave = () => {
        if (!String(form.date || '').trim()) {
            window.alert('Select a call date.');
            return;
        }
        if (!form.description.trim()) {
            window.alert('Description is required.');
            return;
        }
        if (form.followUpRequired && !String(form.followUpDate || '').trim()) {
            window.alert('Select a follow-up date.');
            return;
        }
        onSave(form);
    };

    const addTag = (tagName: string) => {
        const t = tagName.trim();
        if (!t || form.tags.includes(t)) return;
        setForm({ ...form, tags: [...form.tags, t] });
    };

    const removeTag = (idx: number) => {
        setForm({ ...form, tags: form.tags.filter((_, i) => i !== idx) });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div
                className="w-full max-w-lg rounded-xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
                <div
                    className="flex items-center justify-between px-5 py-4 border-b shrink-0"
                    style={{ borderColor: colors.border }}
                >
                    <div className="flex items-center gap-2">
                        <PhoneCall size={18} style={{ color: colors.primary }} />
                        <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: colors.textMain }}>
                            Log Call
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Close">
                        <X size={18} style={{ color: colors.textMuted }} />
                    </button>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    <div>
                        <p className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: colors.textMuted }}>
                            Account
                        </p>
                        <p className="text-sm font-semibold" style={{ color: colors.textMain }}>
                            {lead.company || '—'}
                        </p>
                        {lead.contact ? (
                            <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                                {lead.contact}
                                {lead.position ? ` · ${lead.position}` : ''}
                            </p>
                        ) : null}
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: colors.textMuted }}>
                            Call date
                        </label>
                        <input
                            type="date"
                            value={form.date}
                            onChange={(e) => setForm({ ...form, date: e.target.value })}
                            disabled={readOnly}
                            className="w-full px-3 py-2 rounded-lg border text-sm"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: colors.textMuted }}>
                            Subject
                        </label>
                        <textarea
                            value={form.subject}
                            onChange={(e) => setForm({ ...form, subject: e.target.value })}
                            rows={2}
                            disabled={readOnly}
                            className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            placeholder="Call subject…"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: colors.textMuted }}>
                            Description *
                        </label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            rows={4}
                            disabled={readOnly}
                            className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            placeholder="Call notes…"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: colors.textMuted }}>
                            Client Feedback & Concerns
                        </label>
                        <textarea
                            value={form.clientFeedback}
                            onChange={(e) => setForm({ ...form, clientFeedback: e.target.value })}
                            rows={3}
                            disabled={readOnly}
                            className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            placeholder="Client feedback, concerns, objections…"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: colors.textMuted }}>
                            Next Step
                        </label>
                        <textarea
                            value={form.nextStep}
                            onChange={(e) => setForm({ ...form, nextStep: e.target.value })}
                            rows={2}
                            disabled={readOnly}
                            className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            placeholder="What's the next action…"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold tracking-wider mb-2 block" style={{ color: colors.textMuted }}>
                            Tags
                        </label>
                        <div className="flex flex-wrap gap-1.5 items-center" key={tagColorTick}>
                            {form.tags.map((tag, idx) => {
                                const tc = getTagColor(tag, colors.primary);
                                return (
                                    <span
                                        key={`${tag}-${idx}`}
                                        className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-medium border"
                                        style={{ backgroundColor: `${tc}22`, color: tc, borderColor: `${tc}40` }}
                                    >
                                        {tag}
                                        {!readOnly && (
                                            <input
                                                type="color"
                                                value={tc.length === 7 ? tc : '#c09a4e'}
                                                onChange={(e) => {
                                                    setTagColorForName(tag, e.target.value);
                                                    setTagColorTick((t) => t + 1);
                                                }}
                                                className="w-4 h-4 rounded cursor-pointer border-0 p-0 bg-transparent"
                                                title="Change tag color"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        )}
                                        {!readOnly && (
                                            <button
                                                type="button"
                                                onClick={() => removeTag(idx)}
                                                className="p-0.5 rounded hover:bg-red-500/20"
                                                style={{ color: '#ef4444' }}
                                                title="Remove tag"
                                            >
                                                <X size={10} />
                                            </button>
                                        )}
                                    </span>
                                );
                            })}
                            {!readOnly && (showTagInput ? (
                                <span className="inline-flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={tagDraft}
                                        onChange={(e) => setTagDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                addTag(tagDraft);
                                                setTagDraft('');
                                                setShowTagInput(false);
                                            }
                                        }}
                                        placeholder="Tag name"
                                        className="px-2 py-1 rounded text-xs border min-w-[90px]"
                                        style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.textMain }}
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        className="text-[10px] font-bold"
                                        style={{ color: colors.primary }}
                                        onClick={() => {
                                            addTag(tagDraft);
                                            setTagDraft('');
                                            setShowTagInput(false);
                                        }}
                                    >
                                        Add
                                    </button>
                                    <button
                                        type="button"
                                        className="text-[10px]"
                                        style={{ color: colors.textMuted }}
                                        onClick={() => { setShowTagInput(false); setTagDraft(''); }}
                                    >
                                        Cancel
                                    </button>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowTagInput(true)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border hover:bg-white/5"
                                    style={{ borderColor: colors.border, color: colors.textMuted }}
                                >
                                    <Plus size={10} /> Add Tag
                                </button>
                            ))}
                        </div>
                    </div>
                    {isDeadlineAutoCall ? (
                        <div
                            className="flex gap-2 p-3 rounded-lg border text-xs leading-relaxed"
                            style={{ borderColor: colors.border, backgroundColor: `${colors.primary}10`, color: colors.textMuted }}
                        >
                            <Info size={16} className="shrink-0 mt-0.5" style={{ color: colors.primary }} />
                            <span>
                                This call was auto-created from a request deadline. To schedule another call, update the
                                deadline on the request — the system will create it automatically.
                            </span>
                        </div>
                    ) : null}
                    <div className={isDeadlineAutoCall ? 'opacity-50 pointer-events-none' : ''}>
                        <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: colors.textMuted }}>
                            Client Interest
                        </label>
                        <select
                            value={form.interest}
                            onChange={(e) => setForm({ ...form, interest: e.target.value as LogCallInterest })}
                            disabled={readOnly || isDeadlineAutoCall}
                            className="w-full px-3 py-2 rounded-lg border text-sm"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                        >
                            <option value="">— Select —</option>
                            <option value="waiting">Lead</option>
                            <option value="interested">Interested</option>
                            <option value="not_interested">Not Interested</option>
                        </select>
                        {form.interest === 'waiting' && (
                            <p className="text-[10px] mt-1" style={{ color: colors.orange || '#f59e0b' }}>
                                Card will be moved to Leads stage.
                            </p>
                        )}
                        {form.interest === 'not_interested' && (
                            <p className="text-[10px] mt-1" style={{ color: colors.red || '#ef4444' }}>
                                Card will be moved to Not Interested stage.
                            </p>
                        )}
                        {form.interest === 'interested' && (
                            <p className="text-[10px] mt-1" style={{ color: colors.green || '#22c55e' }}>
                                {form.newRequest || form.newAgreement
                                    ? 'Card will be moved to Proposal stage.'
                                    : 'Card will be moved to Qualified stage.'}
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <div
                            className={`flex items-center gap-2 select-none ${isDeadlineAutoCall ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            onClick={() => {
                                if (readOnly) return;
                                if (isDeadlineAutoCall) {
                                    setShowDeadlineFollowUpHint(true);
                                    return;
                                }
                                setForm({ ...form, followUpRequired: !form.followUpRequired });
                            }}
                        >
                            <div
                                className="w-5 h-5 rounded border-2 flex items-center justify-center"
                                style={{
                                    borderColor: form.followUpRequired && !isDeadlineAutoCall ? colors.primary : colors.border,
                                    backgroundColor: form.followUpRequired && !isDeadlineAutoCall ? colors.primary : 'transparent',
                                }}
                            >
                                {form.followUpRequired && !isDeadlineAutoCall && <Check size={14} color="#000" strokeWidth={4} />}
                            </div>
                            <span className="text-xs font-medium" style={{ color: colors.textMain }}>
                                Follow-up required
                            </span>
                        </div>
                        {showDeadlineFollowUpHint && isDeadlineAutoCall ? (
                            <p className="text-xs p-2 rounded-lg border" style={{ borderColor: colors.orange || '#f59e0b', color: colors.textMain, backgroundColor: `${colors.orange || '#f59e0b'}15` }}>
                                {deadlineFollowUpMessage}
                            </p>
                        ) : null}
                        {form.followUpRequired && !isDeadlineAutoCall && (
                            <input
                                type="date"
                                value={form.followUpDate}
                                onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                                disabled={readOnly}
                                className="w-full px-3 py-1.5 rounded-lg border text-sm"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            />
                        )}
                    </div>
                    <div className={`space-y-3 pt-2 border-t ${isDeadlineAutoCall ? 'opacity-50 pointer-events-none' : ''}`} style={{ borderColor: colors.border }}>
                        <ToggleRow
                            label="New Request"
                            value={form.newRequest}
                            onChange={(v) => setForm({ ...form, newRequest: v })}
                            colors={colors}
                            disabled={readOnly || isDeadlineAutoCall}
                        />
                        <ToggleRow
                            label="New Agreement"
                            value={form.newAgreement}
                            onChange={(v) => setForm({ ...form, newAgreement: v })}
                            colors={colors}
                            disabled={readOnly || isDeadlineAutoCall}
                        />
                    </div>
                </div>
                <div
                    className="flex justify-end gap-2 px-5 py-4 border-t shrink-0"
                    style={{ borderColor: colors.border }}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border text-xs font-bold uppercase"
                        style={{ borderColor: colors.border, color: colors.textMuted }}
                    >
                        Cancel
                    </button>
                    {!readOnly && (
                        <button
                            type="button"
                            onClick={handleSave}
                            className="px-4 py-2 rounded-lg text-xs font-bold uppercase"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            Save
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function ToggleRow({
    label,
    value,
    onChange,
    colors,
    disabled,
}: {
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
    colors: any;
    disabled?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium" style={{ color: colors.textMain }}>
                {label}
            </span>
            <div className="flex rounded-lg border overflow-hidden text-[10px] font-bold uppercase" style={{ borderColor: colors.border }}>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(true)}
                    className="px-3 py-1.5 transition-colors"
                    style={{
                        backgroundColor: value ? colors.primary : 'transparent',
                        color: value ? '#000' : colors.textMuted,
                    }}
                >
                    Yes
                </button>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(false)}
                    className="px-3 py-1.5 transition-colors border-l"
                    style={{
                        borderColor: colors.border,
                        backgroundColor: !value ? colors.primary + '40' : 'transparent',
                        color: !value ? colors.textMain : colors.textMuted,
                    }}
                >
                    No
                </button>
            </div>
        </div>
    );
}
