/** Pure date / axis helpers used by the Advanced Sales dashboard shell (AS.tsx). */

export const MONTH_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export type DashboardAxisGranularity = 'month' | 'day';
export type DashboardAxisPoint = { key: string; month: string };

export const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const parseYmd = (value: any): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return toYmd(dt);
};

export const getCurrentYearRange = () => {
    const now = new Date();
    const y = now.getFullYear();
    return {
        start: `${y}-01-01`,
        end: `${y}-12-31`,
    };
};

/** Month-to-date through the anchor day (local calendar). */
export const getMtdRange = (anchor: Date) => {
    const y = anchor.getFullYear();
    const m = anchor.getMonth() + 1;
    return {
        start: `${y}-${String(m).padStart(2, '0')}-01`,
        end: toYmd(anchor),
    };
};

/** Calendar year-to-date: Jan 1 of anchor’s year through anchor day (local). */
export const getYtdRange = (anchor: Date) => ({
    start: `${anchor.getFullYear()}-01-01`,
    end: toYmd(anchor),
});

export const shiftRangeByYears = (range: { start: string; end: string }, years: number) => {
    const s = parseYmd(range.start);
    const e = parseYmd(range.end);
    if (!s || !e) return range;
    const sd = new Date(`${s}T00:00:00`);
    const ed = new Date(`${e}T00:00:00`);
    sd.setFullYear(sd.getFullYear() + years);
    ed.setFullYear(ed.getFullYear() + years);
    return { start: toYmd(sd), end: toYmd(ed) };
};

export const isIsoInRange = (iso: string, range: { start: string; end: string }) => {
    if (!iso) return false;
    return iso >= range.start && iso <= range.end;
};

export const fmtMd = (iso: string) => {
    const parsed = parseYmd(iso);
    if (!parsed) return '—';
    const dt = new Date(`${parsed}T00:00:00`);
    return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
};

export const formatPeriodLabel = (range: { start: string; end: string }) =>
    `${fmtMd(range.start)} - ${fmtMd(range.end)}`;

export const getMonthKey = (iso: string) => {
    const parsed = parseYmd(iso);
    return parsed ? parsed.slice(0, 7) : '';
};

export const monthNameToIndex = (name: any) => {
    const num = Number(name);
    if (Number.isFinite(num) && num >= 1 && num <= 12) return num - 1;
    const raw = String(name || '').trim().toLowerCase();
    const names = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const fullIdx = names.indexOf(raw);
    if (fullIdx >= 0) return fullIdx;
    const short = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return short.indexOf(raw);
};

export const buildDashboardAxis = (
    range: { start: string; end: string }
): { granularity: DashboardAxisGranularity; points: DashboardAxisPoint[] } => {
    const startIso = parseYmd(range.start);
    const endIso = parseYmd(range.end);
    if (!startIso || !endIso || startIso > endIso) return { granularity: 'month', points: [] };
    const start = new Date(`${startIso}T00:00:00`);
    const end = new Date(`${endIso}T00:00:00`);
    const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
    if (sameMonth) {
        const points: DashboardAxisPoint[] = [];
        const cursor = new Date(start);
        while (cursor <= end) {
            const iso = toYmd(cursor);
            points.push({
                key: iso,
                month: String(cursor.getDate()).padStart(2, '0'),
            });
            cursor.setDate(cursor.getDate() + 1);
        }
        return { granularity: 'day', points };
    }
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endBoundary = new Date(end.getFullYear(), end.getMonth(), 1);
    const singleYear = start.getFullYear() === end.getFullYear();
    const out: DashboardAxisPoint[] = [];
    while (cursor <= endBoundary) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const label = singleYear
            ? MONTH_SHORT[cursor.getMonth()]
            : `${MONTH_SHORT[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`;
        out.push({ key, month: label });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return { granularity: 'month', points: out };
};

export const getDashboardAxisKey = (iso: string, granularity: DashboardAxisGranularity) => {
    const parsed = parseYmd(iso);
    if (!parsed) return '';
    return granularity === 'day' ? parsed : getMonthKey(parsed);
};
