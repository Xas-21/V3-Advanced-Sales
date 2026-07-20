import React, { useEffect, useMemo, useState } from 'react';
import {
    FileText,
    Upload,
    Download,
    Eye,
    ChevronLeft,
    Plus,
    CheckCircle2,
    RefreshCw,
    Trash2,
} from 'lucide-react';
import AddAccountModal from './AddAccountModal';
import { resolveUserAttributionId, recordVisibleOnProperty } from './userProfileMetrics';
import { usePropertyLoadGate } from './propertyScopedLoad';
import {
    CONTRACTS_CHANGED_EVENT,
    attachSignedContractFile,
    downloadContractArtifact,
    deleteContractTemplate,
    deleteContractRecord,
    generateContractFromTemplate,
    getContractRecords,
    getContractTemplates,
    triggerBlobDownload,
    updateContractRecordMeta,
    updateContractRecordStatus,
    uploadContractTemplate,
    type ContractOutputType,
    type ContractRecord,
    type ContractStatus,
    type ContractTemplate,
} from './contractsStore';

interface ContractsProps {
    theme: any;
    activeProperty?: any;
    accounts: any[];
    setAccounts: React.Dispatch<React.SetStateAction<any[]>>;
    currentUser?: any;
    accountTypeOptions?: string[];
    canDeleteContracts?: boolean;
    canDeleteContractTemplates?: boolean;
    initialAccountId?: string | null;
    onConsumedInitialAccountId?: () => void;
    onAgreementGenerated?: (templateName: string, accountId: string) => void;
}

const statusOptions: ContractStatus[] = ['Generated', 'Signed', 'Expired'];

const todayYmd = () => new Date().toISOString().slice(0, 10);
const normalizeVarKey = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isCompanyNameVariable = (v: string) => normalizeVarKey(v) === 'companyname';
const isTodayVariable = (v: string) => {
    const n = normalizeVarKey(v);
    return n === 'today' || n === 'currentdate' || n === 'dateoftoday';
};
const isStartDateVariable = (v: string) => {
    const n = normalizeVarKey(v);
    return n.includes('startdate') || n.includes('fromdate') || n.includes('effectivedate') || n.includes('commencementdate');
};
const isEndDateVariable = (v: string) => {
    const n = normalizeVarKey(v);
    return n.includes('enddate') || n.includes('todate') || n.includes('expirydate') || n.includes('expirationdate');
};
const isDateLikeVariable = (v: string) =>
    isTodayVariable(v) || isStartDateVariable(v) || isEndDateVariable(v) || normalizeVarKey(v) === 'date';

export default function Contracts({
    theme,
    activeProperty,
    accounts,
    setAccounts,
    currentUser,
    accountTypeOptions,
    canDeleteContracts = false,
    canDeleteContractTemplates = false,
    initialAccountId,
    onConsumedInitialAccountId,
    onAgreementGenerated,
}: ContractsProps) {
    const colors = theme.colors;
    const accountsSameProperty = useMemo(() => {
        const pid = String(activeProperty?.id || '').trim();
        if (!pid) return [];
        return accounts.filter((a: any) => recordVisibleOnProperty(pid, a?.propertyId));
    }, [accounts, activeProperty?.id]);
    const [currentView, setCurrentView] = useState<'library' | 'generate' | 'history'>('library');
    const [templates, setTemplates] = useState<ContractTemplate[]>([]);
    const [records, setRecords] = useState<ContractRecord[]>([]);

    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadTemplateName, setUploadTemplateName] = useState('');
    const [uploadResult, setUploadResult] = useState<{ count: number; vars: string[] } | null>(null);
    const [uploading, setUploading] = useState(false);

    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [agreementFileName, setAgreementFileName] = useState('');
    const [outputType, setOutputType] = useState<ContractOutputType>('word');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [parentContractId, setParentContractId] = useState('');
    const [showAddAccountModal, setShowAddAccountModal] = useState(false);
    const [wizardStep, setWizardStep] = useState<1 | 2>(1); // 1 fill, 2 review
    const [generating, setGenerating] = useState(false);

    const propertyId = activeProperty?.id ? String(activeProperty.id) : undefined;
    const { begin: beginContractsLoad, isCurrent: isContractsLoadCurrent } = usePropertyLoadGate();

    const refreshContractsData = async () => {
        if (!beginContractsLoad(propertyId)) {
            setTemplates([]);
            setRecords([]);
            return;
        }
        const tpl = await getContractTemplates(propertyId);
        if (!isContractsLoadCurrent(propertyId)) return;
        setTemplates(tpl);
        setRecords(getContractRecords({ propertyId }));
    };

    useEffect(() => {
        void refreshContractsData();
        const onChanged = () => {
            void refreshContractsData();
        };
        window.addEventListener(CONTRACTS_CHANGED_EVENT, onChanged);
        return () => window.removeEventListener(CONTRACTS_CHANGED_EVENT, onChanged);
    }, [propertyId]);

    useEffect(() => {
        if (!initialAccountId) return;
        setSelectedAccountId(String(initialAccountId));
        setCurrentView('generate');
        onConsumedInitialAccountId?.();
    }, [initialAccountId, onConsumedInitialAccountId]);

    useEffect(() => {
        const tpl = templates.find((t) => t.id === selectedTemplateId) || null;
        setSelectedTemplate(tpl);
        if (!tpl) {
            setFieldValues({});
            return;
        }
        setFieldValues((prev) => {
            const next: Record<string, string> = {};
            tpl.variables.forEach((v) => {
                next[v] = prev[v] ?? '';
            });
            tpl.variables.forEach((v) => {
                if (!next[v] && isTodayVariable(v)) next[v] = todayYmd();
            });
            return next;
        });
    }, [selectedTemplateId, templates]);

    useEffect(() => {
        if (!selectedTemplate) return;
        const companyVar = selectedTemplate.variables.find(isCompanyNameVariable);
        if (!companyVar) return;
        const acc = accounts.find((a: any) => String(a.id) === String(selectedAccountId));
        if (!acc) return;
        setFieldValues((prev) => ({ ...prev, [companyVar]: String(acc.name || '') }));
    }, [selectedTemplate, selectedAccountId, accounts]);

    useEffect(() => {
        if (!selectedTemplate) return;
        setFieldValues((prev) => {
            const next = { ...prev };
            selectedTemplate.variables.forEach((v) => {
                if (!next[v] && isStartDateVariable(v) && startDate) next[v] = startDate;
                if (!next[v] && isEndDateVariable(v) && endDate) next[v] = endDate;
                if (!next[v] && isTodayVariable(v)) next[v] = todayYmd();
            });
            return next;
        });
    }, [selectedTemplate, startDate, endDate]);

    const accountList = useMemo(() => {
        return [...accounts].sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
    }, [accounts]);

    const canReview = useMemo(() => {
        if (!selectedTemplate) return false;
        if (!agreementFileName.trim() || !startDate || !endDate) return false;
        return selectedTemplate.variables.every((v) => String(fieldValues[v] || '').trim());
    }, [selectedTemplate, agreementFileName, startDate, endDate, fieldValues]);

    const handleUploadTemplate = async () => {
        if (!uploadFile || !uploadTemplateName.trim()) return;
        if (!uploadFile.name.toLowerCase().endsWith('.docx')) {
            window.alert('Please upload a DOCX template.');
            return;
        }
        setUploading(true);
        try {
            const tpl = await uploadContractTemplate({
                propertyId,
                file: uploadFile,
                templateName: uploadTemplateName,
                uploadedBy: currentUser?.name || currentUser?.email || 'User',
            });
            setUploadResult({ count: tpl.variableCount, vars: tpl.variables });
            setSelectedTemplateId(tpl.id);
            setCurrentView('generate');
            setAgreementFileName(tpl.name);
        } catch (e: any) {
            window.alert(e?.message || 'Failed to upload template.');
        } finally {
            setUploading(false);
        }
    };

    const handleGenerate = async () => {
        if (!selectedTemplate || !canReview) return;
        setGenerating(true);
        try {
            const acc = accountList.find((a: any) => String(a.id) === String(selectedAccountId));
            const companyVar = selectedTemplate.variables.find(isCompanyNameVariable);
            const resolvedFieldValues: Record<string, string> = { ...fieldValues };
            if (companyVar && !resolvedFieldValues[companyVar] && acc?.name) resolvedFieldValues[companyVar] = String(acc.name);
            selectedTemplate.variables.forEach((v) => {
                if (!resolvedFieldValues[v] && isStartDateVariable(v) && startDate) resolvedFieldValues[v] = startDate;
                if (!resolvedFieldValues[v] && isEndDateVariable(v) && endDate) resolvedFieldValues[v] = endDate;
                if (!resolvedFieldValues[v] && isTodayVariable(v)) resolvedFieldValues[v] = todayYmd();
            });
            const accountName = (companyVar ? resolvedFieldValues[companyVar] : '') || acc?.name || '';
            const { record, downloadBlob, downloadName } = await generateContractFromTemplate({
                propertyId,
                templateId: selectedTemplate.id,
                fieldValues: resolvedFieldValues,
                agreementFileName,
                outputType,
                accountId: selectedAccountId || undefined,
                accountName: accountName || undefined,
                startDate,
                endDate,
                createdBy: currentUser?.name || currentUser?.email || 'User',
                parentContractId: parentContractId || undefined,
            });
            triggerBlobDownload(downloadBlob, downloadName);
            if (selectedTemplate?.name && selectedAccountId) {
                onAgreementGenerated?.(String(selectedTemplate.name), String(selectedAccountId));
            }
            setCurrentView('history');
            setWizardStep(1);
            setParentContractId('');
            setStartDate('');
            setEndDate('');
            setAgreementFileName(record.agreementFileName);
            void refreshContractsData();
        } catch (e: any) {
            window.alert(e?.message || 'Failed to generate contract.');
        } finally {
            setGenerating(false);
        }
    };

    const handleAddAccount = (accountData: any) => {
        if (!accountData?.name) return;
        const u = currentUser?.name || currentUser?.username || currentUser?.email || 'User';
        const act = {
            id: `acct-${Date.now()}`,
            at: new Date().toISOString(),
            title: 'Account created',
            body: 'Account created from Contracts.',
            user: u,
        };
        const newAcc = {
            id: `A${Date.now()}`,
            ...accountData,
            propertyId: accountData.propertyId || activeProperty?.id || 'P-GLOBAL',
            createdByUserId: resolveUserAttributionId(currentUser) || undefined,
            accountOwnerName: u,
            activities: [...(accountData.activities || []), act],
        };
        setAccounts((prev: any[]) => [newAcc, ...prev]);
        setSelectedAccountId(String(newAcc.id));
        setShowAddAccountModal(false);
    };

    const linkedAccountContracts = useMemo(() => {
        if (!selectedAccountId) return [];
        return records.filter((r) => String(r.accountId || '') === String(selectedAccountId));
    }, [records, selectedAccountId]);

    const propertyBanner = activeProperty?.name ? (
        <div className="mb-4 px-4 py-2 rounded-lg border text-xs font-bold" style={{ borderColor: colors.border, color: colors.textMuted }}>
            Active property: <span style={{ color: colors.primary }}>{activeProperty.name}</span>
        </div>
    ) : null;

    if (currentView === 'library') {
        return (
            <div className="h-full flex flex-col p-6">
                {propertyBanner}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Contracts Manager</h1>
                        <p className="text-sm" style={{ color: colors.textMuted }}>Upload DOCX templates, detect variables, and generate agreements.</p>
                    </div>
                    <button
                        onClick={() => setCurrentView('history')}
                        className="px-4 py-2 rounded border hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ borderColor: colors.border, color: colors.textMain }}
                    >
                        <FileText size={16} /> View History
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 p-5 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Upload Template</h3>
                        <input
                            type="text"
                            value={uploadTemplateName}
                            onChange={(e) => setUploadTemplateName(e.target.value)}
                            placeholder="Template name"
                            className="w-full px-3 py-2 rounded border bg-black/20 outline-none"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                        />
                        <input
                            type="file"
                            accept=".docx"
                            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                            className="w-full text-sm"
                            style={{ color: colors.textMain }}
                        />
                        <button
                            onClick={handleUploadTemplate}
                            disabled={!uploadFile || !uploadTemplateName.trim() || uploading}
                            className="px-4 py-2 rounded font-bold hover:brightness-110 disabled:opacity-50 flex items-center gap-2"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            <Upload size={16} /> {uploading ? 'Uploading...' : 'Upload Template'}
                        </button>
                        {uploadResult && (
                            <div className="p-3 rounded border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                <p className="text-sm font-bold" style={{ color: colors.textMain }}>
                                    Variables detected: {uploadResult.count}
                                </p>
                                <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
                                    {uploadResult.vars.map((v) => `{${v}}`).join(', ')}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="p-5 rounded-xl border space-y-3" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Template Library</h3>
                        {!templates.length ? (
                            <p className="text-sm" style={{ color: colors.textMuted }}>No templates uploaded yet.</p>
                        ) : (
                            templates.map((t) => (
                                <div key={t.id} className="w-full p-3 rounded border" style={{ borderColor: colors.border }}>
                                    <button
                                        onClick={() => {
                                            setSelectedTemplateId(t.id);
                                            setAgreementFileName(t.name);
                                            setCurrentView('generate');
                                        }}
                                        className="w-full text-left hover:bg-white/5 rounded"
                                    >
                                        <p className="font-bold text-sm" style={{ color: colors.textMain }}>{t.name}</p>
                                        <p className="text-xs" style={{ color: colors.textMuted }}>{t.variableCount} variables</p>
                                    </button>
                                    {canDeleteContractTemplates && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!window.confirm(`Delete template "${t.name}" from library?`)) return;
                                                await deleteContractTemplate(t.id);
                                                if (selectedTemplateId === t.id) setSelectedTemplateId('');
                                                void refreshContractsData();
                                            }}
                                            className="mt-2 px-2 py-1 rounded border text-[11px]"
                                            style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#ef4444' }}
                                        >
                                            <Trash2 size={12} className="inline mr-1" /> Delete Template
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (currentView === 'generate') {
        return (
            <div className="h-full flex flex-col p-6 overflow-auto">
                {propertyBanner}
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setCurrentView('library')} className="p-2 rounded hover:bg-white/5" style={{ color: colors.textMuted }}>
                            <ChevronLeft size={18} />
                        </button>
                        <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Generate Contract</h1>
                    </div>
                    <button onClick={() => setCurrentView('history')} className="px-4 py-2 rounded border hover:bg-white/5" style={{ borderColor: colors.border, color: colors.textMain }}>
                        View History
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 p-5 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs uppercase font-bold opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Template</label>
                                <select
                                    value={selectedTemplateId}
                                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                                    className="w-full px-3 py-2 rounded border bg-black/20 outline-none"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                >
                                    <option value="">Select template</option>
                                    {templates.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Agreement file name</label>
                                <input
                                    value={agreementFileName}
                                    onChange={(e) => setAgreementFileName(e.target.value)}
                                    className="w-full px-3 py-2 rounded border bg-black/20 outline-none"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Start date</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded border bg-black/20 outline-none"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold opacity-60 mb-1 block" style={{ color: colors.textMuted }}>End date</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded border bg-black/20 outline-none"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Output</label>
                                <select
                                    value={outputType}
                                    onChange={(e) => setOutputType(e.target.value as ContractOutputType)}
                                    className="w-full px-3 py-2 rounded border bg-black/20 outline-none"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                >
                                    <option value="word">Word</option>
                                    <option value="pdf">PDF</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Renewal based on</label>
                                <select
                                    value={parentContractId}
                                    onChange={(e) => setParentContractId(e.target.value)}
                                    className="w-full px-3 py-2 rounded border bg-black/20 outline-none"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                >
                                    <option value="">None (term 1)</option>
                                    {linkedAccountContracts.map((r) => (
                                        <option key={r.id} value={r.id}>{r.agreementFileName} (term {r.termNumber})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedTemplate ? (
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                                    Variables ({selectedTemplate.variableCount})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {selectedTemplate.variables.map((v) => {
                                        const isCompanyName = isCompanyNameVariable(v);
                                        const label = v.replace(/\./g, ' ');
                                        return (
                                            <div key={v}>
                                                <label className="text-xs uppercase font-bold opacity-60 mb-1 block" style={{ color: colors.textMuted }}>
                                                    {label}
                                                </label>
                                                {isCompanyName ? (
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={selectedAccountId}
                                                            onChange={(e) => setSelectedAccountId(e.target.value)}
                                                            className="flex-1 px-3 py-2 rounded border bg-black/20 outline-none"
                                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                                        >
                                                            <option value="">Select account</option>
                                                            {accountList.map((a: any) => (
                                                                <option key={a.id} value={a.id}>{a.name}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowAddAccountModal(true)}
                                                            className="px-3 rounded font-bold"
                                                            style={{ backgroundColor: colors.primary, color: '#000' }}
                                                            title="Create account"
                                                        >
                                                            <Plus size={16} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <input
                                                        type={isDateLikeVariable(v) ? 'date' : 'text'}
                                                        value={fieldValues[v] || ''}
                                                        onChange={(e) => setFieldValues((prev) => ({ ...prev, [v]: e.target.value }))}
                                                        className="w-full px-3 py-2 rounded border bg-black/20 outline-none"
                                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm" style={{ color: colors.textMuted }}>Choose a template to load variables.</p>
                        )}
                    </div>

                    <div className="p-5 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Review & Generate</h3>
                        {wizardStep === 1 ? (
                            <>
                                <p className="text-sm" style={{ color: colors.textMuted }}>
                                    Fill all variables, then continue to review.
                                </p>
                                <button
                                    onClick={() => setWizardStep(2)}
                                    disabled={!canReview}
                                    className="w-full py-2 rounded font-bold disabled:opacity-50"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                >
                                    Review
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="max-h-[360px] overflow-auto p-3 rounded border bg-black/10 space-y-2" style={{ borderColor: colors.border }}>
                                    <p className="text-xs font-bold uppercase opacity-60" style={{ color: colors.textMuted }}>Contract type</p>
                                    <p className="text-sm font-bold" style={{ color: colors.textMain }}>
                                        {selectedTemplate?.name || '—'}
                                    </p>
                                    {Object.entries(fieldValues).map(([k, v]) => (
                                        <div key={k}>
                                            <p className="text-[10px] uppercase opacity-60" style={{ color: colors.textMuted }}>{k}</p>
                                            <p className="text-sm" style={{ color: colors.textMain }}>{v || '—'}</p>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setWizardStep(1)}
                                    className="w-full py-2 rounded border font-bold"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                >
                                    Back to edit
                                </button>
                                <button
                                    onClick={handleGenerate}
                                    disabled={!canReview || generating}
                                    className="w-full py-2 rounded font-bold disabled:opacity-50"
                                    style={{ backgroundColor: colors.green, color: '#000' }}
                                >
                                    {generating ? 'Generating...' : `Generate ${outputType === 'pdf' ? 'PDF' : 'Word'}`}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <AddAccountModal
                    isOpen={showAddAccountModal}
                    onClose={() => setShowAddAccountModal(false)}
                    onSave={handleAddAccount}
                    theme={theme}
                    accountTypeOptions={accountTypeOptions}
                    duplicateCheckAccounts={accountsSameProperty}
                    duplicateCheckPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                    configurationProperty={activeProperty || undefined}
                    configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-6 overflow-auto">
            {propertyBanner}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Generated Contracts</h1>
                <div className="flex gap-2">
                    <button onClick={() => void refreshContractsData()} className="px-3 py-2 rounded border hover:bg-white/5" style={{ borderColor: colors.border, color: colors.textMain }}>
                        <RefreshCw size={16} />
                    </button>
                    <button onClick={() => setCurrentView('library')} className="px-4 py-2 bg-primary text-black rounded font-bold">Upload / New</button>
                </div>
            </div>

            <div className="space-y-3">
                {!records.length ? (
                    <div className="p-8 rounded-xl border text-center" style={{ borderColor: colors.border, color: colors.textMuted }}>
                        No generated contracts yet.
                    </div>
                ) : (
                    records.map((r) => (
                        <div key={r.id} className="p-4 rounded-xl border space-y-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                <div>
                                    <p className="text-[10px] uppercase opacity-50" style={{ color: colors.textMuted }}>Agreement</p>
                                    <p className="font-bold text-sm" style={{ color: colors.textMain }}>{r.agreementFileName}</p>
                                    <p className="text-xs" style={{ color: colors.textMuted }}>
                                        {(r.contractType || r.templateName || 'Contract')} · term {r.termNumber}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase opacity-50" style={{ color: colors.textMuted }}>Account</p>
                                    <p className="text-sm" style={{ color: colors.textMain }}>{r.accountName || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase opacity-50" style={{ color: colors.textMuted }}>Period</p>
                                    <div className="flex gap-2">
                                        <input
                                            type="date"
                                            value={r.startDate || ''}
                                            onChange={(e) => updateContractRecordMeta(r.id, { startDate: e.target.value })}
                                            className="w-full px-2 py-1 rounded border bg-black/20 text-xs"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                        <input
                                            type="date"
                                            value={r.endDate || ''}
                                            onChange={(e) => updateContractRecordMeta(r.id, { endDate: e.target.value })}
                                            className="w-full px-2 py-1 rounded border bg-black/20 text-xs"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase opacity-50" style={{ color: colors.textMuted }}>Status</p>
                                    <select
                                        value={r.status}
                                        onChange={(e) => updateContractRecordStatus(r.id, e.target.value as ContractStatus)}
                                        className="w-full px-3 py-2 rounded border bg-black/20 text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase opacity-50" style={{ color: colors.textMuted }}>Actions</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => {
                                                const a = downloadContractArtifact(r, 'word');
                                                if (a) triggerBlobDownload(a.blob, a.fileName);
                                            }}
                                            className="px-2 py-1 rounded border text-xs"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        >
                                            <Download size={12} className="inline mr-1" /> Word
                                        </button>
                                        <button
                                            onClick={() => {
                                                const a = downloadContractArtifact(r, 'pdf');
                                                if (a) triggerBlobDownload(a.blob, a.fileName);
                                            }}
                                            className="px-2 py-1 rounded border text-xs"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        >
                                            <Eye size={12} className="inline mr-1" /> PDF
                                        </button>
                                        <label className="px-2 py-1 rounded border text-xs cursor-pointer" style={{ borderColor: colors.border, color: colors.textMain }}>
                                            <CheckCircle2 size={12} className="inline mr-1" /> Upload Signed
                                            <input
                                                type="file"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const f = e.target.files?.[0];
                                                    if (!f) return;
                                                    await attachSignedContractFile(r.id, f);
                                                    void refreshContractsData();
                                                }}
                                            />
                                        </label>
                                        <button
                                            onClick={() => {
                                                setCurrentView('generate');
                                                setSelectedTemplateId(r.templateId);
                                                setAgreementFileName(`${r.agreementFileName}-renewal`);
                                                setSelectedAccountId(r.accountId || '');
                                                setParentContractId(r.id);
                                                setFieldValues({ ...r.fieldValues });
                                                setStartDate('');
                                                setEndDate('');
                                                setWizardStep(1);
                                            }}
                                            className="px-2 py-1 rounded border text-xs"
                                            style={{ borderColor: colors.border, color: colors.primary }}
                                        >
                                            <Plus size={12} className="inline mr-1" /> Renewal
                                        </button>
                                        {canDeleteContracts && (
                                            <button
                                                onClick={() => {
                                                    if (!window.confirm('Delete this contract record permanently?')) return;
                                                    deleteContractRecord(r.id);
                                                    void refreshContractsData();
                                                }}
                                                className="px-2 py-1 rounded border text-xs"
                                                style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#ef4444' }}
                                            >
                                                <Trash2 size={12} className="inline mr-1" /> Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {r.signedFileName ? (
                                <button
                                    onClick={() => {
                                        const a = downloadContractArtifact(r, 'signed');
                                        if (a) triggerBlobDownload(a.blob, a.fileName);
                                    }}
                                    className="text-xs underline"
                                    style={{ color: colors.primary }}
                                >
                                    Signed file: {r.signedFileName}
                                </button>
                            ) : null}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

