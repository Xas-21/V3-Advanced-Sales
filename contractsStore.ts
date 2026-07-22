import PizZip from 'pizzip';
import { deleteFileLocal, mediaUrl, uploadFileLocal } from './localUpload';
import { apiUrl } from './backendApi';

export type ContractStatus = 'Generated' | 'Signed' | 'Expired';
export type ContractOutputType = 'word' | 'pdf';

export interface ContractTemplate {
    id: string;
    propertyId?: string;
    name: string;
    originalFileName: string;
    mimeType: string;
    uploadedAt: string;
    uploadedBy: string;
    variableCount: number;
    variables: string[];
    templateBase64: string;
    templateUrl?: string;
    templatePublicId?: string;
}

export interface ContractRecord {
    id: string;
    propertyId?: string;
    templateId: string;
    templateName: string;
    accountId?: string;
    accountName?: string;
    contractType: string;
    agreementFileName: string;
    outputType: ContractOutputType;
    status: ContractStatus;
    startDate: string;
    endDate: string;
    termNumber: number;
    parentContractId?: string;
    fieldValues: Record<string, string>;
    generatedWordBase64?: string;
    generatedPdfBase64?: string;
    signedFileName?: string;
    signedFileBase64?: string;
    signedFileUrl?: string;
    signedFilePublicId?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

const TEMPLATE_KEY = 'visatour_contract_templates_v1';
const RECORD_KEY = 'visatour_contract_records_v1';
/** Per-property flag: localStorage→server migration already attempted (idempotent). */
const RECORDS_MIGRATED_KEY = 'visatour_contract_records_migrated_v1';
export const CONTRACTS_CHANGED_EVENT = 'visatour-contracts-changed';

/** In-memory mirror of last successful server (or local fallback) fetch. */
let recordsCache: ContractRecord[] = [];

function readJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function writeJson<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* ignore storage errors */
    }
}

function dispatchContractsChanged() {
    try {
        window.dispatchEvent(new CustomEvent(CONTRACTS_CHANGED_EVENT));
    } catch {
        /* noop */
    }
}

function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        const sub = bytes.subarray(i, i + chunk);
        binary += String.fromCharCode(...sub);
    }
    return btoa(binary);
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
}

function formatDateYmd(d = new Date()): string {
    return d.toISOString().slice(0, 10);
}

function formatDateLong(value: string): string {
    const v = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const [y, m, d] = v.split('-').map((x) => Number(x));
    if (!y || !m || !d) return v;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (Number.isNaN(dt.getTime())) return v;
    const day = dt.getUTCDate();
    const suffix = (n: number) => {
        if (n % 100 >= 11 && n % 100 <= 13) return 'th';
        if (n % 10 === 1) return 'st';
        if (n % 10 === 2) return 'nd';
        if (n % 10 === 3) return 'rd';
        return 'th';
    };
    const month = dt.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    return `${day}${suffix(day)} ${month} ${dt.getUTCFullYear()}`;
}

function isDateLikeKey(rawKey: string): boolean {
    const n = normalizeLookupKey(rawKey);
    return n === 'today' || n === 'currentdate' || n.includes('startdate') || n.includes('fromdate') || n.includes('enddate') || n.includes('todate') || n.includes('expirydate') || n.includes('expirationdate') || n === 'date';
}

function autoExpire(record: ContractRecord): ContractRecord {
    if (!record.endDate) return record;
    if (record.status === 'Signed' || record.status === 'Generated') {
        if (record.endDate < formatDateYmd()) {
            return { ...record, status: 'Expired' };
        }
    }
    return record;
}

function parseVariablesFromDocxBytes(bytes: Uint8Array): string[] {
    const zip = new PizZip(bytes);
    const xml = zip.file('word/document.xml')?.asText() || '';
    const textNodes = Array.from(xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map((m) => m[1] || '');
    const fullText = textNodes.join('');
    const vars = Array.from(fullText.matchAll(/\{([^{}]+)\}/g))
        .map((m) => String(m[1] || '').trim())
        .filter(Boolean);
    return [...new Set(vars)];
}

function toNestedValues(values: Record<string, string>): Record<string, any> {
    const nested: Record<string, any> = {};
    Object.entries(values || {}).forEach(([rawKey, v]) => {
        const key = rawKey.replace(/^\{|\}$/g, '').trim();
        if (!key) return;
        const parts = key
            .split('.')
            .map((p) => p.trim())
            .filter(Boolean);
        let cur: any = nested;
        for (let i = 0; i < parts.length; i += 1) {
            const p = parts[i];
            if (!p) continue;
            if (i === parts.length - 1) {
                if (cur && typeof cur === 'object') cur[p] = v ?? '';
            } else {
                const nextVal = cur[p];
                if (nextVal == null) {
                    cur[p] = {};
                    cur = cur[p];
                } else if (typeof nextVal === 'object' && !Array.isArray(nextVal)) {
                    cur = nextVal;
                } else {
                    // Conflict between flat and dotted variables (e.g., name + name.position).
                    // Skip nested assignment and let normalized flat lookup resolve this tag.
                    break;
                }
            }
        }
    });
    return nested;
}

function normalizeLookupKey(k: string): string {
    return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getByPath(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    const parts = path.split('.').map((p) => p.trim()).filter(Boolean);
    let cur = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return cur;
}

async function pushTemplateToBackend(template: ContractTemplate): Promise<void> {
    const res = await fetch(apiUrl('/api/contracts/templates'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(template),
    });
    if (!res.ok) throw new Error(`Template sync failed (${res.status})`);
}

function migratedFlags(): Record<string, boolean> {
    return readJson<Record<string, boolean>>(RECORDS_MIGRATED_KEY, {});
}

function markMigrated(propertyId?: string): void {
    const flags = migratedFlags();
    flags[propertyId ? String(propertyId) : '__global__'] = true;
    writeJson(RECORDS_MIGRATED_KEY, flags);
}

function isMigrated(propertyId?: string): boolean {
    return Boolean(migratedFlags()[propertyId ? String(propertyId) : '__global__']);
}

async function pushRecordToBackend(record: ContractRecord): Promise<ContractRecord> {
    const res = await fetch(apiUrl('/api/contracts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`Contract sync failed (${res.status})`);
    return (await res.json()) as ContractRecord;
}

/**
 * One-time localStorage → server migration (plan 062).
 * Idempotent: (1) per-property migrated flag, (2) skip when server already has rows,
 * (3) upsert by stable record id so a re-run cannot create duplicates.
 */
async function migrateLocalRecordsOnce(propertyId?: string): Promise<void> {
    if (isMigrated(propertyId)) return;
    const localAll = readJson<ContractRecord[]>(RECORD_KEY, []);
    const local = localAll.filter((r) => {
        if (!propertyId) return true;
        if (!r.propertyId) return true;
        return String(r.propertyId) === String(propertyId);
    });
    try {
        const query = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
        const res = await fetch(apiUrl(`/api/contracts${query}`), { credentials: 'include' });
        if (!res.ok) throw new Error(`contracts list ${res.status}`);
        const remote = (await res.json()) as ContractRecord[];
        if (Array.isArray(remote) && remote.length > 0) {
            markMigrated(propertyId);
            return;
        }
        for (const rec of local) {
            // Upsert by id — safe if this loop is interrupted and re-run.
            await pushRecordToBackend(rec);
        }
        markMigrated(propertyId);
    } catch {
        // Keep local fallback; do not set migrated flag so a later load can retry.
    }
}

function mirrorRecordsLocally(records: ContractRecord[]): void {
    recordsCache = records.map(autoExpire);
    writeJson(RECORD_KEY, recordsCache);
}

export async function getContractTemplates(propertyId?: string): Promise<ContractTemplate[]> {
    const local = readJson<ContractTemplate[]>(TEMPLATE_KEY, []);
    try {
        const query = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
        const res = await fetch(apiUrl(`/api/contracts/templates${query}`), { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed templates fetch (${res.status})`);
        const remote = (await res.json()) as ContractTemplate[];
        writeJson(TEMPLATE_KEY, remote);
        return remote;
    } catch {
        return local.filter((x) => !propertyId || !x.propertyId || String(x.propertyId) === String(propertyId));
    }
}

export async function deleteContractTemplate(templateId: string): Promise<void> {
    const all = readJson<ContractTemplate[]>(TEMPLATE_KEY, []);
    const target = all.find((t) => String(t.id) === String(templateId));
    if (target?.templatePublicId) {
        try {
            await deleteFileLocal(target.templatePublicId);
        } catch {
            /* proceed with system delete even if file delete fails */
        }
    }
    try {
        await fetch(apiUrl(`/api/contracts/templates/${encodeURIComponent(templateId)}`), {
            method: 'DELETE',
            credentials: 'include',
        });
    } catch {
        /* keep local delete even if remote fails */
    }
    const next = all.filter((t) => String(t.id) !== String(templateId));
    writeJson(TEMPLATE_KEY, next);
    dispatchContractsChanged();
}

export async function uploadContractTemplate(params: {
    propertyId?: string;
    file: File;
    templateName: string;
    uploadedBy: string;
}): Promise<ContractTemplate> {
    const buf = await params.file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const variables = parseVariablesFromDocxBytes(bytes);
    const uploaded = await uploadFileLocal(params.file, { folder: 'contracts' });
    const t: ContractTemplate = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        propertyId: params.propertyId,
        name: params.templateName.trim(),
        originalFileName: params.file.name,
        mimeType: params.file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploadedAt: new Date().toISOString(),
        uploadedBy: params.uploadedBy || 'User',
        variableCount: variables.length,
        variables,
        templateBase64: toBase64(buf),
        templateUrl: uploaded.secure_url,
        templatePublicId: uploaded.public_id,
    };
    const all = readJson<ContractTemplate[]>(TEMPLATE_KEY, []);
    all.unshift(t);
    writeJson(TEMPLATE_KEY, all);
    try {
        await pushTemplateToBackend(t);
    } catch {
        /* keep local fallback */
    }
    dispatchContractsChanged();
    return t;
}

function filterRecords(all: ContractRecord[], filters: { propertyId?: string; accountId?: string } = {}): ContractRecord[] {
    return all.filter((r) => {
        if (filters.propertyId && r.propertyId && String(filters.propertyId) !== String(r.propertyId)) return false;
        if (filters.accountId && String(filters.accountId) !== String(r.accountId || '')) return false;
        return true;
    });
}

/** Sync read of cache / localStorage (AccountsPage and similar). Prefer loadContractRecords for fresh API data. */
export function getContractRecords(filters: { propertyId?: string; accountId?: string } = {}): ContractRecord[] {
    const all = (recordsCache.length ? recordsCache : readJson<ContractRecord[]>(RECORD_KEY, [])).map(autoExpire);
    return filterRecords(all, filters);
}

/** Fetch from /api/contracts (runs one-time localStorage migration first). */
export async function loadContractRecords(
    filters: { propertyId?: string; accountId?: string } = {}
): Promise<ContractRecord[]> {
    await migrateLocalRecordsOnce(filters.propertyId);
    try {
        const qs = new URLSearchParams();
        if (filters.propertyId) qs.set('propertyId', String(filters.propertyId));
        const q = qs.toString() ? `?${qs.toString()}` : '';
        const res = await fetch(apiUrl(`/api/contracts${q}`), { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed contracts fetch (${res.status})`);
        const remote = ((await res.json()) as ContractRecord[]).map(autoExpire);
        mirrorRecordsLocally(remote);
        return filterRecords(remote, filters);
    } catch {
        // Keep localStorage as fallback for one release (plan 062).
        const local = readJson<ContractRecord[]>(RECORD_KEY, []).map(autoExpire);
        recordsCache = local;
        return filterRecords(local, filters);
    }
}

export async function generateContractFromTemplate(params: {
    propertyId?: string;
    templateId: string;
    fieldValues: Record<string, string>;
    agreementFileName: string;
    outputType: ContractOutputType;
    accountId?: string;
    accountName?: string;
    startDate: string;
    endDate: string;
    createdBy: string;
    parentContractId?: string;
}): Promise<{ record: ContractRecord; downloadBlob: Blob; downloadName: string }> {
    const allTemplates = readJson<ContractTemplate[]>(TEMPLATE_KEY, []);
    const tpl = allTemplates.find((x) => x.id === params.templateId);
    if (!tpl) throw new Error('Template not found.');

    let docBytes: Uint8Array;
    if (tpl.templateUrl) {
        try {
            const response = await fetch(mediaUrl(tpl.templateUrl), { credentials: 'include' });
            if (!response.ok) throw new Error(`Template fetch failed (${response.status})`);
            docBytes = new Uint8Array(await response.arrayBuffer());
        } catch {
            docBytes = fromBase64(tpl.templateBase64);
        }
    } else {
        docBytes = fromBase64(tpl.templateBase64);
    }
    const zip = new PizZip(docBytes);
    const normalizedFieldValues: Record<string, string> = {};
    Object.entries(params.fieldValues || {}).forEach(([k, v]) => {
        const raw = String(v ?? '');
        normalizedFieldValues[k] = isDateLikeKey(k) ? formatDateLong(raw) : raw;
    });
    const nestedValues = toNestedValues(normalizedFieldValues);
    const normalizedLookup: Record<string, string> = {};
    Object.entries(normalizedFieldValues).forEach(([k, v]) => {
        normalizedLookup[normalizeLookupKey(k)] = String(v ?? '');
    });
    if (params.accountName) {
        normalizedLookup.companyname = String(params.accountName);
    }
    if (params.startDate) {
        const f = formatDateLong(String(params.startDate));
        normalizedLookup.startdate = f;
        normalizedLookup.fromdate = f;
        normalizedLookup.effectivedate = f;
    }
    if (params.endDate) {
        const f = formatDateLong(String(params.endDate));
        normalizedLookup.enddate = f;
        normalizedLookup.todate = f;
        normalizedLookup.expirydate = f;
        normalizedLookup.expirationdate = f;
    }
    const todayLong = formatDateLong(formatDateYmd());
    normalizedLookup.today = todayLong;
    normalizedLookup.currentdate = todayLong;

    // Lazy-load so docxtemplater is not in the Contracts chunk until generate runs.
    const docxtemplaterMod: any = await import('docxtemplater');
    const Docxtemplater = docxtemplaterMod?.default || docxtemplaterMod;
    const doc = new Docxtemplater(zip, {
        delimiters: { start: '{', end: '}' },
        paragraphLoop: true,
        linebreaks: true,
        parser: (tag: string) => {
            const rawTag = String(tag || '');
            const cleaned = rawTag.trim();
            return {
                get: (scope: any) => {
                    const exact = getByPath(scope, cleaned);
                    if (exact != null && exact !== undefined) return exact;
                    const fromNested = getByPath(nestedValues, cleaned);
                    if (fromNested != null && fromNested !== undefined) return fromNested;
                    const n = normalizeLookupKey(cleaned);
                    if (normalizedLookup[n] != null) return normalizedLookup[n];
                    return '';
                },
            };
        },
        nullGetter: () => '',
    });
    doc.render({});
    const outBuffer = doc.getZip().generate({ type: 'arraybuffer' }) as ArrayBuffer;
    const wordBlob = new Blob([outBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    // Plan 062 option 5b: mammoth+jspdf only dumps raw text into a fake "PDF".
    // Honest export is always the DOCX from docxtemplater (layout preserved).
    // Callers may still pass outputType 'pdf' for legacy UI; we emit Word.
    const effectiveOutput: ContractOutputType = 'word';

    const termNumber = (() => {
        if (!params.parentContractId) return 1;
        const all = getContractRecords({ propertyId: params.propertyId });
        const parent = all.find((x) => x.id === params.parentContractId);
        return Math.max(2, Number(parent?.termNumber || 1) + 1);
    })();

    const record: ContractRecord = {
        id: `ctr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        propertyId: params.propertyId,
        templateId: tpl.id,
        templateName: tpl.name,
        accountId: params.accountId,
        accountName: params.accountName,
        contractType: tpl.name || 'Contract',
        agreementFileName: params.agreementFileName.trim(),
        outputType: effectiveOutput,
        status: 'Generated',
        startDate: params.startDate,
        endDate: params.endDate,
        termNumber,
        parentContractId: params.parentContractId,
        fieldValues: { ...params.fieldValues },
        generatedWordBase64: toBase64(outBuffer),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: params.createdBy || 'User',
    };
    const allRecords = [record, ...getContractRecords()];
    mirrorRecordsLocally(allRecords);
    try {
        const saved = await pushRecordToBackend(record);
        const merged = { ...record, ...saved, generatedWordBase64: record.generatedWordBase64 };
        mirrorRecordsLocally([merged, ...getContractRecords().filter((r) => r.id !== record.id)]);
    } catch {
        /* local fallback kept for one release */
    }
    dispatchContractsChanged();

    return {
        record,
        downloadBlob: wordBlob,
        downloadName: `${record.agreementFileName || 'agreement'}.docx`,
    };
}

async function persistRecordPatch(recordId: string, patch: Partial<ContractRecord>): Promise<void> {
    const all = getContractRecords();
    const next = all.map((r) =>
        r.id === recordId ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r
    );
    mirrorRecordsLocally(next);
    const updated = next.find((r) => r.id === recordId);
    if (updated) {
        try {
            await pushRecordToBackend(updated);
        } catch {
            /* local fallback */
        }
    }
    dispatchContractsChanged();
}

export async function updateContractRecordStatus(recordId: string, status: ContractStatus): Promise<void> {
    await persistRecordPatch(recordId, { status });
}

export async function updateContractRecordMeta(
    recordId: string,
    patch: Partial<Pick<ContractRecord, 'startDate' | 'endDate' | 'agreementFileName'>>
): Promise<void> {
    await persistRecordPatch(recordId, patch);
}

/** After merging duplicate accounts: move contract records from source account to destination. */
export async function repointContractRecordsForAccountMerge(
    sourceAccountId: string,
    destAccountId: string,
    destAccountName: string
): Promise<void> {
    const sid = String(sourceAccountId || '').trim();
    const did = String(destAccountId || '').trim();
    if (!sid || !did || sid === did) return;
    const all = getContractRecords();
    const toPush: ContractRecord[] = [];
    const next = all.map((r) => {
        if (String(r.accountId || '') !== sid) return r;
        const updated = {
            ...r,
            accountId: did,
            accountName: destAccountName,
            updatedAt: new Date().toISOString(),
        };
        toPush.push(updated);
        return updated;
    });
    mirrorRecordsLocally(next);
    for (const r of toPush) {
        try {
            await pushRecordToBackend(r);
        } catch {
            /* local fallback */
        }
    }
    dispatchContractsChanged();
}

export async function deleteContractRecord(recordId: string): Promise<void> {
    const next = getContractRecords().filter((r) => String(r.id) !== String(recordId));
    mirrorRecordsLocally(next);
    try {
        await fetch(apiUrl(`/api/contracts/${encodeURIComponent(recordId)}`), {
            method: 'DELETE',
            credentials: 'include',
        });
    } catch {
        /* keep local delete */
    }
    dispatchContractsChanged();
}

export async function attachSignedContractFile(recordId: string, file: File): Promise<void> {
    const buf = await file.arrayBuffer();
    const uploaded = await uploadFileLocal(file, { folder: 'contracts' });
    await persistRecordPatch(recordId, {
        signedFileName: file.name,
        signedFileBase64: toBase64(buf),
        signedFileUrl: uploaded.secure_url,
        signedFilePublicId: uploaded.public_id,
        status: 'Signed',
    });
}

export function downloadContractArtifact(record: ContractRecord, kind: 'word' | 'pdf' | 'signed'): { blob: Blob; fileName: string } | null {
    // Plan 062 5b: 'pdf' kind is treated as Word — no raw-text PDF masquerade.
    if ((kind === 'word' || kind === 'pdf') && record.generatedWordBase64) {
        return {
            blob: new Blob([fromBase64(record.generatedWordBase64)], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }),
            fileName: `${record.agreementFileName || 'agreement'}.docx`,
        };
    }
    if (kind === 'signed' && record.signedFileBase64) {
        const ext = record.signedFileName || 'signed-contract';
        return {
            blob: new Blob([fromBase64(record.signedFileBase64)]),
            fileName: ext,
        };
    }
    return null;
}

export function triggerBlobDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

