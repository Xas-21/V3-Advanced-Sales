import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiUrl } from './backendApi';
import { formatCurrencyAmount, type CurrencyCode } from './currency';
import {
    OCCUPANCY_TYPES_CHANGED_EVENT,
    resolveOccupancyTypesForProperty,
} from './propertyOccupancyTypes';
import {
    MEALS_PACKAGES_CHANGED_EVENT,
    resolveMealPlansForProperty,
} from './propertyMealsPackages';
import {
    coverageStats,
    mergeRatePlanLines,
    normalizeRatePlan,
    pickRatePlanPeriod,
    planUseStats,
    priceChartRows,
    type RatePlan,
    type RatePlanLine,
    type RatePlanPeriod,
} from './ratePlans';

type Props = {
    theme: { colors: Record<string, string> };
    activeProperty?: { id?: string; occupancyTypes?: unknown; mealPlans?: unknown } | null;
    ratePlans: unknown[];
    setRatePlans: (next: unknown[]) => void;
    sharedRequests?: unknown[];
    canCreate?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    currency?: string;
};

const BAR_COLORS = ['#c4a574', '#6b8f71', '#4f7cac', '#b85c38', '#7d6b91', '#3d6b6a'];

function newId(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function monthRange(today = new Date()) {
    const y = today.getFullYear();
    const m = today.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const mm = String(m + 1).padStart(2, '0');
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

function todayYmd() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RateStructurePage({
    theme,
    activeProperty,
    ratePlans,
    setRatePlans,
    sharedRequests = [],
    canCreate = false,
    canEdit = false,
    canDelete = false,
    currency = 'SAR',
}: Props) {
    const colors = theme.colors;
    const propertyId = String(activeProperty?.id || '').trim();
    const plans = useMemo(
        () =>
            (Array.isArray(ratePlans) ? ratePlans : [])
                .map(normalizeRatePlan)
                .filter(Boolean) as RatePlan[],
        [ratePlans]
    );
    const [roomNames, setRoomNames] = useState<string[]>([]);
    const [occRev, setOccRev] = useState(0);
    const [mealsRev, setMealsRev] = useState(0);
    const [error, setError] = useState('');
    const [planModal, setPlanModal] = useState<{ id: string; code: string; name: string } | null>(null);
    const [periodModal, setPeriodModal] = useState<{ planId: string; id: string; startDate: string; endDate: string } | null>(null);
    const [ratesModal, setRatesModal] = useState<{ planId: string; periodId: string; lines: RatePlanLine[] } | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [chartPlanId, setChartPlanId] = useState('');
    const [chartPeriodId, setChartPeriodId] = useState('');
    const [chartMeal, setChartMeal] = useState('');
    const [useFrom, setUseFrom] = useState(() => monthRange().from);
    const [useTo, setUseTo] = useState(() => monthRange().to);

    const occupancies = useMemo(() => {
        void occRev;
        return resolveOccupancyTypesForProperty(propertyId, activeProperty);
    }, [propertyId, activeProperty, occRev]);

    const mealPlans = useMemo(() => {
        void mealsRev;
        return resolveMealPlansForProperty(propertyId, activeProperty);
    }, [propertyId, activeProperty, mealsRev]);

    useEffect(() => {
        const bumpOcc = () => setOccRev((n) => n + 1);
        const bumpMeals = () => setMealsRev((n) => n + 1);
        window.addEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, bumpOcc);
        window.addEventListener(MEALS_PACKAGES_CHANGED_EVENT, bumpMeals);
        return () => {
            window.removeEventListener(OCCUPANCY_TYPES_CHANGED_EVENT, bumpOcc);
            window.removeEventListener(MEALS_PACKAGES_CHANGED_EVENT, bumpMeals);
        };
    }, []);

    useEffect(() => {
        if (!propertyId) {
            setRoomNames([]);
            return;
        }
        let cancelled = false;
        fetch(apiUrl(`/api/rooms?propertyId=${encodeURIComponent(propertyId)}`))
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
                if (cancelled) return;
                const names = (Array.isArray(data) ? data : [])
                    .map((row) => {
                        const room = (row && typeof row === 'object' ? row : {}) as { name?: unknown; label?: unknown; roomType?: unknown };
                        return String(room.name ?? room.label ?? room.roomType ?? '').trim();
                    })
                    .filter(Boolean);
                setRoomNames([...new Set(names)]);
            })
            .catch(() => {
                if (!cancelled) setRoomNames([]);
            });
        return () => {
            cancelled = true;
        };
    }, [propertyId]);

    useEffect(() => {
        if (!chartPlanId && plans[0]) setChartPlanId(plans[0].id);
        if (chartPlanId && !plans.some((p) => p.id === chartPlanId)) setChartPlanId(plans[0]?.id || '');
    }, [plans, chartPlanId]);

    useEffect(() => {
        if (!chartMeal && mealPlans[0]) setChartMeal(mealPlans[0].code);
    }, [mealPlans, chartMeal]);

    const chartPlan = plans.find((p) => p.id === chartPlanId) || null;
    const chartPeriod = pickRatePlanPeriod(chartPlan, chartPeriodId, todayYmd());
    const priceRows = priceChartRows(chartPeriod, chartMeal, occupancies);
    const cover = coverageStats(chartPeriod, chartMeal, occupancies);
    const useRows = planUseStats(plans, sharedRequests, useFrom, useTo);

    const persist = async (body: Record<string, unknown>) => {
        setError('');
        const res = await fetch(apiUrl('/api/rate-plans'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, propertyId }),
        });
        if (!res.ok) {
            setError('Could not save the rate plan.');
            return null;
        }
        const saved = await res.json();
        const next = Array.isArray(ratePlans) ? [...ratePlans] : [];
        const idx = next.findIndex((p) => String((p as { id?: unknown })?.id) === String(saved?.id));
        if (idx >= 0) next[idx] = saved;
        else next.unshift(saved);
        setRatePlans(next);
        return saved;
    };

    const savePlanMeta = async () => {
        if (!planModal) return;
        const code = planModal.code.trim();
        const name = planModal.name.trim();
        if (!code || !name) {
            setError('Enter a code and a name.');
            return;
        }
        const existing = plans.find((p) => p.id === planModal.id);
        const saved = await persist({
            id: planModal.id || undefined,
            code,
            name,
            periods: existing?.periods || [],
        });
        if (saved) setPlanModal(null);
    };

    const savePeriod = async () => {
        if (!periodModal) return;
        const plan = plans.find((p) => p.id === periodModal.planId);
        if (!plan) return;
        if (!periodModal.startDate || !periodModal.endDate || periodModal.endDate < periodModal.startDate) {
            setError('The period needs a from date and a to date, and the to date cannot be earlier.');
            return;
        }
        const periods = plan.periods.map((p) => ({ ...p }));
        const idx = periods.findIndex((p) => p.id === periodModal.id);
        const row: RatePlanPeriod = {
            id: periodModal.id || newId('per'),
            startDate: periodModal.startDate,
            endDate: periodModal.endDate,
            lines: idx >= 0 ? periods[idx].lines : [],
            updatedAt: new Date().toISOString(),
        };
        if (idx >= 0) periods[idx] = row;
        else periods.push(row);
        const saved = await persist({ ...plan, periods });
        if (saved) setPeriodModal(null);
    };

    const saveRates = async () => {
        if (!ratesModal) return;
        const plan = plans.find((p) => p.id === ratesModal.planId);
        if (!plan) return;
        const lines = mergeRatePlanLines(ratesModal.lines);
        if (ratesModal.lines.some((line) => !String(line.roomType || '').trim() || !String(line.mealPlan || '').trim())) {
            setError('Each row needs a room type and a meal plan.');
            return;
        }
        const periods = plan.periods.map((p) =>
            p.id === ratesModal.periodId ? { ...p, lines, updatedAt: new Date().toISOString() } : p
        );
        const saved = await persist({ ...plan, periods });
        if (saved) setRatesModal(null);
    };

    const removePlan = async (plan: RatePlan) => {
        if (!window.confirm(`Delete ${plan.code || 'this'} rate plan? Requests that already used it keep their saved rates.`)) return;
        setError('');
        const res = await fetch(
            apiUrl(`/api/rate-plans/${encodeURIComponent(plan.id)}?propertyId=${encodeURIComponent(propertyId)}`),
            { method: 'DELETE' }
        );
        if (!res.ok) {
            setError('Could not delete the rate plan.');
            return;
        }
        setRatePlans((Array.isArray(ratePlans) ? ratePlans : []).filter((p) => String((p as { id?: unknown })?.id) !== plan.id));
    };

    const removePeriod = async (plan: RatePlan, periodId: string) => {
        if (!window.confirm('Remove this period and its prices?')) return;
        await persist({ ...plan, periods: plan.periods.filter((p) => p.id !== periodId) });
    };

    const fieldClass = 'w-full px-3 py-2 rounded border bg-black/20 outline-none text-sm';
    const fieldStyle = { borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg };

    return (
        <div className="p-6 space-y-6 overflow-y-auto h-full custom-scrollbar">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Rate Structure</h2>
                    <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
                        Rate plans for this property. A request uses a plan only when someone picks it.
                    </p>
                </div>
                {canCreate && (
                    <button
                        type="button"
                        onClick={() => {
                            setError('');
                            setPlanModal({ id: '', code: '', name: '' });
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold"
                        style={{ backgroundColor: colors.primary, color: colors.bg }}
                    >
                        <Plus size={16} /> Add Rate Plan
                    </button>
                )}
            </div>
            {error && (
                <p className="text-sm" style={{ color: colors.red || '#c45c4a' }}>{error}</p>
            )}

            <div className="space-y-3">
                {plans.length === 0 && (
                    <div className="p-6 rounded-xl border text-sm" style={{ borderColor: colors.border, color: colors.textMuted }}>
                        No rate plans yet.
                    </div>
                )}
                {plans.map((plan) => {
                    const open = expandedId === plan.id;
                    return (
                        <div key={plan.id} className="rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                            <div className="flex items-center justify-between gap-3 p-4">
                                <button type="button" className="text-left" onClick={() => setExpandedId(open ? null : plan.id)}>
                                    <div className="font-bold" style={{ color: colors.textMain }}>{plan.code || plan.id} Rate Plan</div>
                                    <div className="text-xs" style={{ color: colors.textMuted }}>{plan.name} · {plan.periods.length} period{plan.periods.length === 1 ? '' : 's'}</div>
                                </button>
                                <div className="flex items-center gap-2">
                                    {canEdit && (
                                        <button
                                            type="button"
                                            className="p-2 rounded hover:bg-white/5"
                                            title="Edit code and name"
                                            onClick={() => setPlanModal({ id: plan.id, code: plan.code, name: plan.name })}
                                        >
                                            <Pencil size={16} style={{ color: colors.textMuted }} />
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button type="button" className="p-2 rounded hover:bg-white/5" title="Delete plan" onClick={() => removePlan(plan)}>
                                            <Trash2 size={16} style={{ color: colors.red || '#c45c4a' }} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {open && (
                                <div className="px-4 pb-4 space-y-2">
                                    {plan.periods.map((period) => (
                                        <div key={period.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded border" style={{ borderColor: colors.border }}>
                                            <span className="text-sm" style={{ color: colors.textMain }}>{period.startDate} → {period.endDate}</span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="text-xs font-bold px-3 py-1.5 rounded"
                                                    style={{ backgroundColor: colors.primary, color: colors.bg }}
                                                    onClick={() =>
                                                        setRatesModal({
                                                            planId: plan.id,
                                                            periodId: period.id,
                                                            lines: period.lines.map((line) => ({ ...line, rates: { ...line.rates } })),
                                                        })
                                                    }
                                                >
                                                    Rates
                                                </button>
                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        className="p-1.5 rounded hover:bg-white/5"
                                                        title="Remove period"
                                                        onClick={() => removePeriod(plan, period.id)}
                                                    >
                                                        <Trash2 size={14} style={{ color: colors.textMuted }} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {canEdit && (
                                        <button
                                            type="button"
                                            className="text-xs font-bold flex items-center gap-1"
                                            style={{ color: colors.primary }}
                                            onClick={() => {
                                                setError('');
                                                setPeriodModal({ planId: plan.id, id: '', startDate: '', endDate: '' });
                                            }}
                                        >
                                            <Plus size={14} /> Add period
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <section className="p-4 rounded-xl border space-y-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <h3 className="font-bold text-sm" style={{ color: colors.textMain }}>Prices</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select className={fieldClass} style={fieldStyle} value={chartPlanId} onChange={(e) => { setChartPlanId(e.target.value); setChartPeriodId(''); }}>
                            {plans.map((p) => (
                                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                            ))}
                        </select>
                        <select className={fieldClass} style={fieldStyle} value={chartPeriod?.id || ''} onChange={(e) => setChartPeriodId(e.target.value)}>
                            {(chartPlan?.periods || []).map((p) => (
                                <option key={p.id} value={p.id}>{p.startDate} → {p.endDate}</option>
                            ))}
                        </select>
                        <select className={fieldClass} style={fieldStyle} value={chartMeal} onChange={(e) => setChartMeal(e.target.value)}>
                            {mealPlans.map((m) => (
                                <option key={m.id || m.code} value={m.code}>{m.code} — {m.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="h-64">
                        {priceRows.length === 0 ? (
                            <p className="text-xs" style={{ color: colors.textMuted }}>No period to chart yet.</p>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={priceRows}>
                                    <CartesianGrid stroke={colors.border} strokeDasharray="3 3" />
                                    <XAxis dataKey="roomType" stroke={colors.textMuted} fontSize={11} />
                                    <YAxis stroke={colors.textMuted} fontSize={11} />
                                    <Tooltip />
                                    <Legend />
                                    {occupancies.map((occ, i) => (
                                        <Bar key={occ} dataKey={occ} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </section>

                <section className="p-4 rounded-xl border space-y-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                    <h3 className="font-bold text-sm" style={{ color: colors.textMain }}>Coverage</h3>
                    <p className="text-2xl font-bold" style={{ color: colors.textMain }}>
                        {cover.filled} <span className="text-sm font-normal" style={{ color: colors.textMuted }}>/ {cover.total} prices</span>
                    </p>
                    <div className="h-3 rounded overflow-hidden" style={{ backgroundColor: colors.border }}>
                        <div
                            className="h-full"
                            style={{
                                width: cover.total ? `${Math.round((cover.filled / cover.total) * 100)}%` : '0%',
                                backgroundColor: colors.primary,
                            }}
                        />
                    </div>
                    <div className="text-xs space-y-1 max-h-40 overflow-y-auto" style={{ color: colors.textMuted }}>
                        {cover.missing.length === 0 ? (
                            <p>Every room type on this period has a price for {chartMeal || 'this meal plan'}.</p>
                        ) : (
                            cover.missing.map((row) => <p key={row}>{row}</p>)
                        )}
                    </div>
                </section>
            </div>

            <section className="p-4 rounded-xl border space-y-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <h3 className="font-bold text-sm" style={{ color: colors.textMain }}>Plan use</h3>
                    <div className="flex items-center gap-2">
                        <input type="date" className={fieldClass} style={fieldStyle} value={useFrom} onChange={(e) => setUseFrom(e.target.value)} />
                        <input type="date" className={fieldClass} style={fieldStyle} value={useTo} onChange={(e) => setUseTo(e.target.value)} />
                    </div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="h-64">
                        <p className="text-xs mb-1" style={{ color: colors.textMuted }}>Requests</p>
                        <ResponsiveContainer width="100%" height="90%">
                            <BarChart data={useRows}>
                                <CartesianGrid stroke={colors.border} strokeDasharray="3 3" />
                                <XAxis dataKey="label" stroke={colors.textMuted} fontSize={11} />
                                <YAxis stroke={colors.textMuted} fontSize={11} allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="requestCount" name="Requests" fill={colors.primary || BAR_COLORS[0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="h-64">
                        <p className="text-xs mb-1" style={{ color: colors.textMuted }}>Room revenue, before tax</p>
                        <ResponsiveContainer width="100%" height="90%">
                            <BarChart data={useRows}>
                                <CartesianGrid stroke={colors.border} strokeDasharray="3 3" />
                                <XAxis dataKey="label" stroke={colors.textMuted} fontSize={11} />
                                <YAxis stroke={colors.textMuted} fontSize={11} />
                                <Tooltip formatter={(value) => formatCurrencyAmount(Number(value) || 0, currency as CurrencyCode)} />
                                <Bar dataKey="roomRevenue" name="Room revenue" fill={BAR_COLORS[1]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>

            {planModal && (
                <Modal colors={colors} title={planModal.id ? 'Edit rate plan' : 'Add rate plan'} onClose={() => setPlanModal(null)}>
                    <label className="text-xs font-bold block mb-1" style={{ color: colors.textMuted }}>Code</label>
                    <input className={fieldClass} style={fieldStyle} value={planModal.code} onChange={(e) => setPlanModal({ ...planModal, code: e.target.value })} placeholder="TO" />
                    <label className="text-xs font-bold block mb-1 mt-3" style={{ color: colors.textMuted }}>Name</label>
                    <input className={fieldClass} style={fieldStyle} value={planModal.name} onChange={(e) => setPlanModal({ ...planModal, name: e.target.value })} placeholder="Tour Operator" />
                    <div className="flex justify-end mt-4">
                        <button type="button" className="px-4 py-2 rounded-lg text-sm font-bold" style={{ backgroundColor: colors.primary, color: colors.bg }} onClick={savePlanMeta}>Save</button>
                    </div>
                </Modal>
            )}

            {periodModal && (
                <Modal colors={colors} title="Add period" onClose={() => setPeriodModal(null)}>
                    <label className="text-xs font-bold block mb-1" style={{ color: colors.textMuted }}>From</label>
                    <input type="date" className={fieldClass} style={fieldStyle} value={periodModal.startDate} onChange={(e) => setPeriodModal({ ...periodModal, startDate: e.target.value })} />
                    <label className="text-xs font-bold block mb-1 mt-3" style={{ color: colors.textMuted }}>To</label>
                    <input type="date" className={fieldClass} style={fieldStyle} value={periodModal.endDate} onChange={(e) => setPeriodModal({ ...periodModal, endDate: e.target.value })} />
                    <div className="flex justify-end mt-4">
                        <button type="button" className="px-4 py-2 rounded-lg text-sm font-bold" style={{ backgroundColor: colors.primary, color: colors.bg }} onClick={savePeriod}>Save</button>
                    </div>
                </Modal>
            )}

            {ratesModal && (
                <Modal colors={colors} title="Rates" onClose={() => setRatesModal(null)} wide>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                        {ratesModal.lines.map((line, index) => (
                            <div key={line.id} className="p-3 rounded border space-y-2" style={{ borderColor: colors.border }}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <select
                                        className={fieldClass}
                                        style={fieldStyle}
                                        disabled={!canEdit}
                                        value={line.roomType}
                                        onChange={(e) => {
                                            const lines = ratesModal.lines.map((row, i) => (i === index ? { ...row, roomType: e.target.value } : row));
                                            setRatesModal({ ...ratesModal, lines });
                                        }}
                                    >
                                        <option value="">Room type</option>
                                        {roomNames.map((name) => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                        {line.roomType && !roomNames.includes(line.roomType) ? (
                                            <option value={line.roomType}>{line.roomType}</option>
                                        ) : null}
                                    </select>
                                    <select
                                        className={fieldClass}
                                        style={fieldStyle}
                                        disabled={!canEdit}
                                        value={line.mealPlan}
                                        onChange={(e) => {
                                            const lines = ratesModal.lines.map((row, i) => (i === index ? { ...row, mealPlan: e.target.value } : row));
                                            setRatesModal({ ...ratesModal, lines });
                                        }}
                                    >
                                        <option value="">Meal plan</option>
                                        {mealPlans.map((m) => (
                                            <option key={m.id || m.code} value={m.code}>{m.code} — {m.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {occupancies.map((occ) => (
                                        <label key={occ} className="text-[11px]" style={{ color: colors.textMuted }}>
                                            {occ}
                                            <input
                                                type="number"
                                                disabled={!canEdit}
                                                className={`${fieldClass} mt-1`}
                                                style={fieldStyle}
                                                value={line.rates[occ] == null ? '' : line.rates[occ]}
                                                onChange={(e) => {
                                                    const raw = e.target.value;
                                                    const price = raw === '' ? null : Number(raw);
                                                    const lines = ratesModal.lines.map((row, i) =>
                                                        i === index ? { ...row, rates: { ...row.rates, [occ]: price } } : row
                                                    );
                                                    setRatesModal({ ...ratesModal, lines });
                                                }}
                                            />
                                        </label>
                                    ))}
                                </div>
                                {canEdit && (
                                    <button
                                        type="button"
                                        className="text-xs"
                                        style={{ color: colors.red || '#c45c4a' }}
                                        onClick={() => setRatesModal({ ...ratesModal, lines: ratesModal.lines.filter((_, i) => i !== index) })}
                                    >
                                        Remove row
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    {canEdit && (
                        <button
                            type="button"
                            className="text-xs font-bold flex items-center gap-1 mt-3"
                            style={{ color: colors.primary }}
                            onClick={() =>
                                setRatesModal({
                                    ...ratesModal,
                                    lines: [
                                        ...ratesModal.lines,
                                        {
                                            id: newId('line'),
                                            roomType: roomNames[0] || '',
                                            mealPlan: mealPlans[0]?.code || 'RO',
                                            rates: {},
                                        },
                                    ],
                                })
                            }
                        >
                            <Plus size={14} /> Add row
                        </button>
                    )}
                    <p className="text-[11px] mt-2" style={{ color: colors.textMuted }}>
                        A blank price is no price. 0 is a real price. Saving again updates a row that uses the same room type and meal plan.
                    </p>
                    {canEdit && (
                        <div className="flex justify-end mt-4">
                            <button type="button" className="px-4 py-2 rounded-lg text-sm font-bold" style={{ backgroundColor: colors.primary, color: colors.bg }} onClick={saveRates}>Save</button>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
}

function Modal({
    colors,
    title,
    onClose,
    children,
    wide = false,
}: {
    colors: Record<string, string>;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    wide?: boolean;
}) {
    return (
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
            <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-xl border p-5`} style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold" style={{ color: colors.textMain }}>{title}</h3>
                    <button type="button" onClick={onClose} style={{ color: colors.textMuted }}><X size={18} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}
