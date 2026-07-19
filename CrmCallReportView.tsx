import React, { useMemo, useState } from 'react';
import { Download, Settings } from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { CrmSalesPeriod } from './crmActivitiesUtils';
import { toLocalYmd } from './crmActivitiesUtils';
import { crmLeadAttributedToUser } from './userProfileMetrics';
import {
    buildCallReportChartBuckets,
    buildCallReportExportFilename,
    buildCallReportRows,
    crmSalesPeriodLabel,
    downloadCallReportFile,
    exportCallReportCsv,
    exportCallReportExcelHtml,
    formatCallReportDateLabel,
    type CallReportSort,
    type CallReportStatusFilter,
} from './crmCallReportUtils';

export type CrmCallReportViewProps = {
    theme: any;
    salesCalls: any[];
    crmSalesPeriod: CrmSalesPeriod;
    createdByUserFilterId: string;
    crmFilterUsers?: { id: string; name: string }[];
    activePropertyId?: string;
    accounts?: any[];
    todayOnly?: boolean;
    onOpenAccountProfile?: (accountId: string, accountName?: string) => void;
};

function chartTooltipTheme(colors: any) {
    return {
        contentStyle: {
            backgroundColor: colors.tooltip || colors.card,
            borderColor: colors.border,
            borderRadius: 8,
            color: colors.textMain,
        },
        labelStyle: { color: colors.textMain, fontWeight: 700 },
        itemStyle: { color: colors.textMain },
    };
}

export default function CrmCallReportView({
    theme,
    salesCalls,
    crmSalesPeriod,
    createdByUserFilterId,
    crmFilterUsers,
    activePropertyId,
    accounts,
    todayOnly = false,
    onOpenAccountProfile,
}: CrmCallReportViewProps) {
    const colors = theme.colors;
    const [statusFilter, setStatusFilter] = useState<CallReportStatusFilter>('all');
    const [sort, setSort] = useState<CallReportSort>('newest');

    const rows = useMemo(
        () =>
            buildCallReportRows(salesCalls, {
                crmSalesPeriod,
                activePropertyId,
                accounts,
                createdByUserFilterId,
                crmFilterUsers,
                statusFilter,
                sort,
                todayOnly,
                crmLeadAttributedToUser,
            }),
        [salesCalls, crmSalesPeriod, activePropertyId, accounts, createdByUserFilterId, crmFilterUsers, statusFilter, sort, todayOnly]
    );

    const chartBuckets = useMemo(
        () => buildCallReportChartBuckets(rows, crmSalesPeriod, todayOnly),
        [rows, crmSalesPeriod, todayOnly]
    );

    const chartData = useMemo(
        () =>
            chartBuckets.map((b) => ({
                name: b.label,
                count: b.count,
                key: b.key,
            })),
        [chartBuckets]
    );

    const totalRecords = rows.length;
    const periodLabel = todayOnly
        ? `Today (${formatCallReportDateLabel(toLocalYmd())})`
        : crmSalesPeriodLabel(crmSalesPeriod);
    const highlightKey =
        crmSalesPeriod.mode === 'month'
            ? `${crmSalesPeriod.year}-${String(crmSalesPeriod.month).padStart(2, '0')}`
            : '';

    const handleExportCsv = () => {
        if (!rows.length) return;
        const csv = exportCallReportCsv(rows);
        downloadCallReportFile(
            csv,
            buildCallReportExportFilename(crmSalesPeriod, 'csv', todayOnly),
            'text/csv;charset=utf-8;'
        );
    };

    const handleExportExcel = () => {
        if (!rows.length) return;
        const title = `CRM Call Report — ${periodLabel}`;
        const html = exportCallReportExcelHtml(rows, title);
        downloadCallReportFile(
            html,
            buildCallReportExportFilename(crmSalesPeriod, 'xls', todayOnly),
            'application/vnd.ms-excel'
        );
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as CallReportStatusFilter)}
                        className="text-[10px] font-bold px-2 py-1.5 rounded-lg border outline-none"
                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                        aria-label="Completion status filter"
                    >
                        <option value="all">All calls</option>
                        <option value="completed">Completed</option>
                        <option value="not_completed">Active</option>
                    </select>
                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as CallReportSort)}
                        className="text-[10px] font-bold px-2 py-1.5 rounded-lg border outline-none"
                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                        aria-label="Sort order"
                    >
                        <option value="newest">Newest to Oldest</option>
                        <option value="oldest">Oldest to Newest</option>
                    </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        disabled={!rows.length}
                        onClick={handleExportCsv}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border disabled:opacity-40"
                        style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.card }}
                        title={rows.length ? 'Export table as CSV' : 'No records in this period'}
                    >
                        <Download size={12} /> Export CSV
                    </button>
                    <button
                        type="button"
                        disabled={!rows.length}
                        onClick={handleExportExcel}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border disabled:opacity-40"
                        style={{ borderColor: colors.primary, color: '#000', backgroundColor: colors.primary }}
                        title={rows.length ? 'Export table as Excel' : 'No records in this period'}
                    >
                        <Download size={12} /> Export Excel
                    </button>
                </div>
            </div>

            <p className="text-[10px]" style={{ color: colors.textMuted }}>
                Exports {totalRecords} record{totalRecords === 1 ? '' : 's'} for {periodLabel} (table only, no chart).
            </p>

            <div
                className="rounded-xl border p-4 shrink-0"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                        <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: colors.textMuted }}>
                            Total Records
                        </p>
                        <p className="text-2xl font-black" style={{ color: colors.textMain }}>
                            {totalRecords}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="p-1.5 rounded border opacity-60"
                        style={{ borderColor: colors.border, color: colors.textMuted }}
                        title="Chart uses CRM header date filter"
                        aria-hidden
                    >
                        <Settings size={14} />
                    </button>
                </div>
                <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                            <XAxis
                                dataKey="name"
                                tick={{ fill: colors.textMuted, fontSize: 9 }}
                                angle={-35}
                                textAnchor="end"
                                height={56}
                                interval={0}
                            />
                            <YAxis
                                allowDecimals={false}
                                tick={{ fill: colors.textMuted, fontSize: 10 }}
                                label={{
                                    value: 'Record Count',
                                    angle: -90,
                                    position: 'insideLeft',
                                    fill: colors.textMuted,
                                    fontSize: 10,
                                }}
                            />
                            <Tooltip
                                cursor={{ fill: `${colors.primary}18` }}
                                {...chartTooltipTheme(colors)}
                                formatter={(value) => {
                                    const count = Number(value) || 0;
                                    const pct =
                                        totalRecords > 0
                                            ? ((count / totalRecords) * 100).toFixed(2)
                                            : '0.00';
                                    return [`${count} (${pct}% of ${totalRecords})`, 'Record Count'];
                                }}
                                labelFormatter={(label) => `Date: ${label}`}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]} activeBar={{ fill: colors.blue || '#1e3a5f' }}>
                                {chartData.map((entry) => (
                                    <Cell
                                        key={entry.key}
                                        fill={
                                            highlightKey && entry.key === highlightKey
                                                ? colors.blue || '#1e40af'
                                                : colors.primary
                                        }
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div
                className="flex-1 min-h-0 rounded-xl border overflow-hidden flex flex-col"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
                <div className="flex-1 min-h-0 overflow-auto">
                    <table className="w-full text-left border-collapse min-w-[960px]">
                        <thead
                            className="sticky top-0 z-10 text-[10px] uppercase tracking-wider font-semibold"
                            style={{ backgroundColor: colors.bg, color: colors.textMuted }}
                        >
                            <tr>
                                <th className="px-3 py-2.5">Month</th>
                                <th className="px-3 py-2.5">Date of the Call</th>
                                <th className="px-3 py-2.5">Subject</th>
                                <th className="px-3 py-2.5">Account</th>
                                <th className="px-3 py-2.5">Contact person</th>
                                <th className="px-3 py-2.5">Call Description</th>
                                <th className="px-3 py-2.5">Client Concern & Feedback</th>
                                <th className="px-3 py-2.5">Next Step</th>
                                <th className="px-3 py-2.5">Assigned User</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="px-3 py-8 text-center text-xs"
                                        style={{ color: colors.textMuted }}
                                    >
                                        No call records for {periodLabel}. Try another date filter or switch to &quot;All in period&quot;.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        className="border-t text-xs"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        <td className="px-3 py-2 whitespace-nowrap">{row.monthLabel}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{row.atLabel}</td>
                                        <td className="px-3 py-2 font-medium max-w-[140px] truncate" title={row.subject}>
                                            {row.subject}
                                        </td>
                                        <td className="px-3 py-2 max-w-[140px] truncate" title={row.account}>
                                            {onOpenAccountProfile && (row.accountId || row.account) && row.account !== '—' ? (
                                                <button
                                                    type="button"
                                                    className="font-semibold hover:underline text-left truncate max-w-full"
                                                    style={{ color: colors.primary }}
                                                    onClick={() => onOpenAccountProfile(row.accountId, row.account)}
                                                >
                                                    {row.account}
                                                </button>
                                            ) : (
                                                row.account
                                            )}
                                        </td>
                                        <td className="px-3 py-2 max-w-[120px] truncate" title={row.contactPerson}>
                                            {row.contactPerson}
                                        </td>
                                        <td className="px-3 py-2 max-w-[200px]">
                                            <span className="line-clamp-2" title={row.callDescription}>
                                                {row.callDescription || '—'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 max-w-[200px]">
                                            <span className="line-clamp-2" title={row.clientFeedback}>
                                                {row.clientFeedback || '—'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 max-w-[160px]">
                                            <span className="line-clamp-2" title={row.nextStep}>
                                                {row.nextStep || '—'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">{row.assignedUser}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
