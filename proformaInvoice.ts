import {
    calculateNights,
    inclusiveCalendarDays,
    normalizeRequestTypeKey,
    transportRowCount,
} from './beoShared';

export type ProformaLineKind = 'room' | 'event' | 'transport';

export type ProformaLine = {
    date: string;
    description: string;
    quantity: number;
    price: number;
    amount: number;
    kind: ProformaLineKind;
};

export type ProformaTaxRow = {
    label: string;
    rate: number;
    amount: number;
};

export type ProformaInvoice = {
    title: 'Pro-Forma Invoice';
    issuedOn: string;
    currency: string;
    fromName: string;
    hotelVat: string;
    hotelAddress: string;
    toName: string;
    clientVat: string;
    clientAddress: string;
    lines: ProformaLine[];
    net: number;
    taxes: ProformaTaxRow[];
    total: number;
    bankAccountName: string;
    bankName: string;
    bankAccountNumber: string;
    iban: string;
    bankAddress: string;
    financeDepartmentLabel: string;
    logoUrl: string;
    fileStem: string;
    invoiceNumber: string;
    poNumber: string;
};

type ProformaBag = { [key: string]: unknown };

export type ProformaInvoiceInput = {
    property?: ProformaBag;
    account?: ProformaBag;
    request?: ProformaBag;
    taxes?: ProformaBag[];
    currency?: string;
    issuedOn?: string;
    invoiceNumber?: string;
    poNumber?: string;
    /** Property room-type names, in the same order as the request editor. */
    roomTypeNames?: string[];
};

function asBag(value: unknown): ProformaBag {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as ProformaBag;
    return {};
}

function bagList(value: unknown): ProformaBag[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ProformaBag => !!item && typeof item === 'object' && !Array.isArray(item));
}

function money(n: number): number {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function text(value: unknown): string {
    return String(value ?? '').trim();
}

/** Saved room type, or the first property room type the editor shows when the row is blank. */
export function roomTypeLabel(room: ProformaBag | null | undefined, catalogNames: string[] = []): string {
    const saved = text(room?.type) || text(room?.roomType) || text(room?.name);
    if (saved) return saved;
    return text(catalogNames?.[0]);
}

function joinAddress(parts: unknown[]): string {
    return parts.map(text).filter(Boolean).join(', ');
}

function stayRange(start: string, end: string): string {
    const a = text(start).slice(0, 10);
    const b = text(end).slice(0, 10);
    if (a && b && a !== b) return `${a} – ${b}`;
    return a || b;
}

function roomNights(request: ProformaBag, room: ProformaBag): number {
    const kind = normalizeRequestTypeKey(text(request.requestType));
    if (kind === 'series' || kind === 'event_rooms') {
        const arrival = text(room?.arrival).slice(0, 10);
        const departure = text(room?.departure).slice(0, 10);
        if (arrival && departure) return calculateNights(arrival, departure);
        const manual = Number(room?.nights);
        if (arrival && Number.isFinite(manual) && manual > 0) return manual;
    }
    return calculateNights(text(request.checkIn), text(request.checkOut));
}

function roomDate(request: ProformaBag, room: ProformaBag): string {
    const kind = normalizeRequestTypeKey(text(request.requestType));
    if (kind === 'series' || kind === 'event_rooms') {
        const arrival = text(room?.arrival).slice(0, 10);
        const departure = text(room?.departure).slice(0, 10);
        if (arrival || departure) return stayRange(arrival, departure);
    }
    return stayRange(text(request.checkIn), text(request.checkOut));
}

function buildLines(request: ProformaBag, roomTypeNames: string[] = []): ProformaLine[] {
    const lines: ProformaLine[] = [];
    for (const room of bagList(request.rooms)) {
        const nights = roomNights(request, room);
        const count = Number(room?.count) || 0;
        const price = Number(room?.rate) || 0;
        const quantity = count * nights;
        const amount = money(quantity * price);
        if (amount <= 0) continue;
        lines.push({
            date: roomDate(request, room),
            description: roomTypeLabel(room, roomTypeNames) || 'Room',
            quantity,
            price,
            amount,
            kind: 'room',
        });
    }
    for (const item of bagList(request.agenda)) {
        const start = text(item?.startDate).slice(0, 10);
        const end = text(item?.endDate || item?.startDate).slice(0, 10);
        const days = start && end ? Math.max(1, inclusiveCalendarDays(start, end) || 1) : 1;
        const rate = Number(item?.rate) || 0;
        const pax = Number(item?.pax) || 0;
        const rental = Number(item?.rental) || 0;
        const date = stayRange(start, end);
        const pkg = text(item?.package);
        const venue = text(item?.venue);
        if (rate > 0 && pax > 0) {
            lines.push({
                date,
                description: `${pkg || 'Package'} (${pax} pax)`,
                quantity: pax * days,
                price: money(rate),
                amount: money(pax * days * rate),
                kind: 'event',
            });
        }
        if (rental > 0) {
            lines.push({
                date,
                description: venue ? `${venue} rental` : 'Meeting rental',
                quantity: days,
                price: money(rental),
                amount: money(days * rental),
                kind: 'event',
            });
        }
    }
    for (const trip of bagList(request.transportation)) {
        const price = Number(trip?.costPerWay) || 0;
        const quantity = transportRowCount(trip);
        const amount = money(price * quantity);
        if (amount <= 0) continue;
        const vehicle = text(trip?.type) || 'Transfer';
        const notes = text(trip?.notes);
        const timing = text(trip?.timing);
        lines.push({
            date: timing || stayRange(text(request.checkIn), text(request.checkOut)),
            description: notes ? `Transfer · ${vehicle} — ${notes}` : `Transfer · ${vehicle}`,
            quantity,
            price: money(price),
            amount,
            kind: 'transport',
        });
    }
    return lines;
}

function buildTaxRows(lines: ProformaLine[], taxes: ProformaBag[]): ProformaTaxRow[] {
    const roomBase = money(lines.filter((line) => line.kind === 'room').reduce((sum, line) => sum + line.amount, 0));
    const eventBase = money(lines.filter((line) => line.kind === 'event').reduce((sum, line) => sum + line.amount, 0));
    const transportBase = money(lines.filter((line) => line.kind === 'transport').reduce((sum, line) => sum + line.amount, 0));
    const rows: ProformaTaxRow[] = [];
    for (const tax of taxes) {
        const rate = Number(tax?.rate) || 0;
        if (rate <= 0) continue;
        const scope = asBag(tax.scope);
        let base = 0;
        if (scope.accommodation) base += roomBase;
        if (scope.events) base += eventBase;
        if (scope.transport) base += transportBase;
        if (base <= 0) continue;
        rows.push({
            label: text(tax.label) || text(tax.name) || 'Tax',
            rate,
            amount: money((base * rate) / 100),
        });
    }
    return rows;
}

export function buildProformaInvoice(input: ProformaInvoiceInput): ProformaInvoice {
    const property = asBag(input.property);
    const account = asBag(input.account);
    const request = asBag(input.request);
    const roomTypeNames = Array.isArray(input.roomTypeNames) ? input.roomTypeNames : [];
    const lines = buildLines(request, roomTypeNames);
    const taxes = buildTaxRows(lines, bagList(input.taxes));
    const net = money(lines.reduce((sum, line) => sum + line.amount, 0));
    const total = money(net + taxes.reduce((sum, row) => sum + row.amount, 0));
    const finance = text(property.financeDepartmentLabel) || 'Finance Department';
    const stem = text(request.confirmationNo || request.id) || 'invoice';
    return {
        title: 'Pro-Forma Invoice',
        issuedOn: text(input.issuedOn).slice(0, 10),
        currency: text(input.currency) || 'SAR',
        fromName: text(property.legalName),
        hotelVat: text(property.vatNumber),
        hotelAddress: text(property.legalAddress),
        toName: text(account.name),
        clientVat: text(account.clientTaxId),
        clientAddress: joinAddress([account.street, account.city, account.country]),
        lines,
        net,
        taxes,
        total,
        bankAccountName: text(property.bankAccountName),
        bankName: text(property.bankName),
        bankAccountNumber: text(property.bankAccountNumber),
        iban: text(property.iban),
        bankAddress: text(property.bankAddress),
        financeDepartmentLabel: finance,
        logoUrl: text(property.logoUrl),
        fileStem: stem,
        invoiceNumber: text(input.invoiceNumber).toUpperCase(),
        poNumber: text(input.poNumber),
    };
}
