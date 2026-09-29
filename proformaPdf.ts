import type { ProformaInvoice, ProformaLine } from './proformaInvoice';

function money(n: number): string {
    return (Number(n) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function qty(n: number): string {
    const value = Number(n) || 0;
    return Number.isInteger(value) ? String(value) : money(value);
}

function rateLabel(rate: number): string {
    const rounded = Math.round((Number(rate) || 0) * 100) / 100;
    return String(rounded);
}

function displayDate(iso: string): string {
    const [year, month, day] = String(iso || '').slice(0, 10).split('-');
    if (!year || !month || !day) return iso || '';
    return `${Number(month)}/${Number(day)}/${year}`;
}

export function proformaFileName(model: ProformaInvoice): string {
    const stem = String(model.fileStem || 'invoice').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
    return `Proforma-${stem || 'invoice'}.pdf`;
}

async function imageDataUrl(url: string): Promise<{ data: string; format: 'PNG' | 'JPEG' } | null> {
    const raw = String(url || '').trim();
    if (!raw) return null;
    try {
        let data = raw;
        if (!raw.startsWith('data:')) {
            const res = await fetch(raw);
            if (!res.ok) return null;
            const blob = await res.blob();
            data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
        }
        if (!data.startsWith('data:image/')) return null;
        return { data, format: /image\/jpe?g/i.test(data) ? 'JPEG' : 'PNG' };
    } catch {
        return null;
    }
}

export async function renderProformaPdf(model: ProformaInvoice): Promise<Blob> {
    const jspdfMod = await import('jspdf');
    const jsPDF = jspdfMod.jsPDF;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const margin = 16;
    const right = pageW - margin;
    const contentW = right - margin;
    let y = 18;

    const logo = await imageDataUrl(model.logoUrl);
    if (logo) {
        try {
            pdf.addImage(logo.data, logo.format, right - 36, 14, 36, 18);
        } catch {
            /* logo is optional */
        }
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(20);
    pdf.text(model.title, margin, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Date: ${displayDate(model.issuedOn)}`, margin, y);
    pdf.text(`Currency: ${model.currency || 'SAR'}`, margin + 70, y);
    y += 6;
    if (model.invoiceNumber) {
        pdf.text(`Invoice No: ${model.invoiceNumber}`, margin, y);
        y += 8;
    } else {
        y += 2;
    }

    const colW = contentW / 2;
    const fromX = margin;
    const toX = margin + colW + 4;
    const blockTop = y;
    const writeBlock = (x: number, heading: string, rows: [string, string][]) => {
        let yy = blockTop;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(heading, x, yy);
        yy += 6;
        pdf.setFontSize(9);
        for (const [label, value] of rows) {
            pdf.setFont('helvetica', 'bold');
            pdf.text(label, x, yy);
            pdf.setFont('helvetica', 'normal');
            const lines = pdf.splitTextToSize(value || ' ', colW - 28);
            pdf.text(lines, x + 24, yy);
            yy += Math.max(5, lines.length * 4);
        }
        return yy;
    };
    const fromBottom = writeBlock(fromX, 'From', [
        ['Name', model.fromName],
        ['Vat No', model.hotelVat],
        ['Address', model.hotelAddress],
    ]);
    const toRows: [string, string][] = [
        ['Name', model.toName],
        ['Vat No', model.clientVat],
        ['Address', model.clientAddress],
    ];
    if (String(model.poNumber || '').trim()) {
        toRows.push(['PO Number', String(model.poNumber).trim()]);
    }
    const toBottom = writeBlock(toX, 'To', toRows);
    y = Math.max(fromBottom, toBottom) + 4;

    const cols = [
        { key: 'date', label: 'Date', w: 42, align: 'left' as const },
        { key: 'description', label: 'Description', w: 62, align: 'left' as const },
        { key: 'quantity', label: 'Quantity', w: 22, align: 'right' as const },
        { key: 'price', label: 'Price', w: 27, align: 'right' as const },
        { key: 'amount', label: 'Amount', w: contentW - 153, align: 'right' as const },
    ];

    const drawHeader = () => {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(margin, y, contentW, 7, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        let x = margin;
        for (const col of cols) {
            const tx = col.align === 'right' ? x + col.w - 1 : x + 1;
            pdf.text(col.label, tx, y + 4.8, { align: col.align });
            x += col.w;
        }
        y += 9;
    };

    const newPage = () => {
        pdf.addPage();
        y = 18;
        drawHeader();
    };

    drawHeader();

    const cell = (line: ProformaLine, key: string) => {
        if (key === 'date') return line.date;
        if (key === 'description') return line.description;
        if (key === 'quantity') return qty(line.quantity);
        if (key === 'price') return money(line.price);
        return money(line.amount);
    };

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    for (const line of model.lines) {
        const wrapped = cols.map((col) => pdf.splitTextToSize(cell(line, col.key), col.w - 2));
        const rowH = Math.max(6, ...wrapped.map((part) => part.length * 3.6)) + 1.5;
        if (y + rowH > 275) newPage();
        let x = margin;
        wrapped.forEach((part, idx) => {
            const col = cols[idx];
            const tx = col.align === 'right' ? x + col.w - 1 : x + 1;
            pdf.text(part, tx, y + 4, { align: col.align });
            x += col.w;
        });
        y += rowH;
    }
    if (model.lines.length === 0) {
        pdf.setFontSize(9);
        pdf.text('No billable lines', margin + 1, y + 4);
        y += 8;
    }

    y += 2;
    const totals: [string, string][] = [
        ['Net amount', money(model.net)],
        ...model.taxes.map((row) => [`${row.label} ${rateLabel(row.rate)}%`, money(row.amount)] as [string, string]),
        ['Total', money(model.total)],
    ];
    if (y + totals.length * 6 + 36 > 280) {
        pdf.addPage();
        y = 18;
    }
    for (const [label, value] of totals) {
        const isTotal = label === 'Total';
        pdf.setFont('helvetica', isTotal ? 'bold' : 'normal');
        pdf.setFontSize(isTotal ? 11 : 9);
        pdf.text(label, right - 70, y);
        pdf.text(value, right, y, { align: 'right' });
        y += isTotal ? 7 : 5.5;
    }

    y += 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Bank details', margin, y);
    y += 6;
    pdf.setFontSize(9);
    const bankRows: [string, string][] = [
        ['Account Name', model.bankAccountName],
        ['Bank Name', model.bankName],
        ['Account Number', model.bankAccountNumber],
        ['IBAN', model.iban],
        ['Address', model.bankAddress],
    ];
    for (const [label, value] of bankRows) {
        pdf.setFont('helvetica', 'bold');
        pdf.text(label, margin, y);
        pdf.setFont('helvetica', 'normal');
        const lines = pdf.splitTextToSize(value || ' ', contentW - 36);
        pdf.text(lines, margin + 36, y);
        y += Math.max(5, lines.length * 4);
    }

    y += 8;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(model.financeDepartmentLabel || 'Finance Department', pageW / 2, Math.min(y, 285), { align: 'center' });

    return pdf.output('blob');
}

export async function downloadProformaPdf(model: ProformaInvoice): Promise<void> {
    const blob = await renderProformaPdf(model);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = proformaFileName(model);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
