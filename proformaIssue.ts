export const INVOICE_NUMBER_RE = /^[A-Z]\d{7}$/;

export type ProformaExtraItem = {
    id: string;
    description: string;
    quantity: number;
    price: number;
    vatPercent: number;
};

export type ProformaIssue = {
    invoiceNumber: string;
    poNumber: string;
    issuedOn: string;
    issuedById: string;
    issuedByName: string;
    fingerprint: string;
    extraItems: ProformaExtraItem[];
};

export type InvoiceParts = { letter: string; digits: string };

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomParts(): InvoiceParts {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const letter = LETTERS[bytes[0] % 26];
    const n = (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    const digits = String(n % 10_000_000).padStart(7, '0');
    return { letter, digits };
}

export function isInvoiceNumber(value: unknown): boolean {
    return INVOICE_NUMBER_RE.test(String(value || '').trim().toUpperCase());
}

export function mintInvoiceNumber(taken: Iterable<string>, pick: () => InvoiceParts = randomParts): string {
    const used = new Set(
        [...taken].map((v) =>
            String(v || '')
                .trim()
                .toUpperCase()
        )
    );
    for (let i = 0; i < 64; i += 1) {
        const parts = pick();
        const letter = String(parts.letter || '')
            .trim()
            .toUpperCase()
            .slice(0, 1);
        const digits = String(parts.digits || '').replace(/\D/g, '').padStart(7, '0').slice(-7);
        const value = `${letter}${digits}`;
        if (!INVOICE_NUMBER_RE.test(value)) continue;
        if (!used.has(value)) return value;
    }
    throw new Error('Could not mint a unique invoice number');
}

type FingerprintModel = {
    issuedOn?: unknown;
    fromName?: unknown;
    hotelVat?: unknown;
    hotelAddress?: unknown;
    toName?: unknown;
    clientVat?: unknown;
    clientAddress?: unknown;
    lines?: unknown;
    net?: unknown;
    taxes?: unknown;
    total?: unknown;
};

/** Billable content only. PO and invoice number are excluded. */
export function proformaFingerprint(model: FingerprintModel | null | undefined): string {
    const payload = {
        fromName: String(model?.fromName || ''),
        hotelVat: String(model?.hotelVat || ''),
        hotelAddress: String(model?.hotelAddress || ''),
        toName: String(model?.toName || ''),
        clientVat: String(model?.clientVat || ''),
        clientAddress: String(model?.clientAddress || ''),
        lines: model?.lines ?? [],
        net: model?.net ?? 0,
        taxes: model?.taxes ?? [],
        total: model?.total ?? 0,
    };
    return JSON.stringify(payload);
}

export function figuresUnchanged(stored: string | null | undefined, current: string | null | undefined): boolean {
    const a = String(stored || '');
    const b = String(current || '');
    return Boolean(a) && a === b;
}

export function emptyProformaExtraItem(): ProformaExtraItem {
    return {
        id: `xi-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        description: '',
        quantity: 1,
        price: 0,
        vatPercent: 0,
    };
}

export function normalizeExtraItems(raw: unknown): ProformaExtraItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item, i) => {
        const doc = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const quantity = Number(doc.quantity);
        const price = Number(doc.price);
        const vat = Number(doc.vatPercent ?? doc.vat);
        return {
            id: String(doc.id || `xi-${i}`),
            description: String(doc.description || '').trim(),
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
            price: Number.isFinite(price) ? price : 0,
            vatPercent: Number.isFinite(vat) && vat > 0 ? vat : 0,
        };
    });
}

export function normalizeProforma(raw: unknown): ProformaIssue | null {
    if (!raw || typeof raw !== 'object') return null;
    const doc = raw as Record<string, unknown>;
    const invoiceNumber = String(doc.invoiceNumber || '')
        .trim()
        .toUpperCase();
    if (!INVOICE_NUMBER_RE.test(invoiceNumber)) return null;
    return {
        invoiceNumber,
        poNumber: String(doc.poNumber || '').trim(),
        issuedOn: String(doc.issuedOn || '').trim().slice(0, 10),
        issuedById: String(doc.issuedById || '').trim(),
        issuedByName: String(doc.issuedByName || '').trim(),
        fingerprint: String(doc.fingerprint || ''),
        extraItems: normalizeExtraItems(doc.extraItems),
    };
}
