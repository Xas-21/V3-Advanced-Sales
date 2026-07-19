import React, { useState } from 'react';
import {
    List, Star, CalendarDays, User, CheckCircle2, Activity, Plus, Check, Briefcase, Calendar,
} from 'lucide-react';
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { rechartsTooltipThemeProps } from './rechartsChartLegend';
import { taskAssignedToUser } from './userProfileMetrics';

const TASK_CATEGORIES = ['Follow-up', 'Contract', 'Payment', 'Event Prep', 'Internal'];

export type ToDoViewProps = {
    tasks: any[];
    setTasks: (updater: any) => void;
    handleOpenTaskModal: (...args: any[]) => any;
    handleToggleTaskComplete: (...args: any[]) => any;
    colors: any;
    theme: any;
    activePropertyId?: string | null;
    canMutateOperational?: boolean;
    currentUser?: any;
};

export type TaskAssigneeForm = { id: string; name: string };

export function normalizeTaskAssignees(task: any): TaskAssigneeForm[] {
    if (Array.isArray(task?.assignees) && task.assignees.length) {
        return task.assignees
            .map((a: any) => ({
                id: String(a?.id ?? a?.userId ?? '').trim(),
                name: String(a?.name ?? '').trim(),
            }))
            .filter((a: TaskAssigneeForm) => a.name);
    }
    const raw = String(task?.assignedTo || '').trim();
    if (!raw) return [];
    return raw
        .split(/\s*,\s*/)
        .map((name) => ({ id: '', name: name.trim() }))
        .filter((a: TaskAssigneeForm) => a.name);
}

export function taskAssigneeNamesList(task: any): string[] {
    return normalizeTaskAssignees(task).map((a) => a.name);
}

export function taskAssigneesAvatarLetters(task: any): string {
    const names = taskAssigneeNamesList(task);
    if (!names.length) return '??';
    if (names.length === 1) {
        return names[0]
            .split(/\s+/)
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
    }
    const a = names[0].split(/\s+/)[0]?.[0] || '';
    const b = names[1].split(/\s+/)[0]?.[0] || '';
    return `${a}${b}`.toUpperCase() || '••';
}

export default function ToDoView({
    tasks,
    setTasks,
    handleOpenTaskModal,
    handleToggleTaskComplete,
    colors,
    theme,
    activePropertyId,
    canMutateOperational: canMutateTodo,
    currentUser,
}: ToDoViewProps) {
    const [activeList, setActiveList] = useState('All');

    const scopedTasks = (tasks || []).filter(
        (t: any) => !activePropertyId || !t.propertyId || t.propertyId === activePropertyId
    );

    const lists = [
        { id: 'All', icon: List, label: 'All Tasks' },
        { id: 'Important', icon: Star, label: 'Important', color: colors.orange },
        { id: 'Planned', icon: CalendarDays, label: 'Planned', color: colors.blue },
        { id: 'Assigned', icon: User, label: 'Assigned to me', color: colors.green },
        { id: 'Completed', icon: CheckCircle2, label: 'Completed' },
        { id: 'Progress', icon: Activity, label: 'Progress Insights', color: colors.cyan }
    ];

    const isAssignedToCurrentUser = (t: any) => !!currentUser && taskAssignedToUser(t, currentUser);

    const filteredTasks = scopedTasks.filter((t: any) => {
        if (activeList === 'Important') return t.star && !t.completed;
        if (activeList === 'Planned') return t.date && !t.completed;
        if (activeList === 'Assigned') return isAssignedToCurrentUser(t) && !t.completed;
        if (activeList === 'Completed') return t.completed;
        return !t.completed;
    });

    const toggleStar = (id: string | number, e: any) => {
        e.stopPropagation();
        if (!canMutateTodo) return;
        setTasks((prev: any) => prev.map((t: any) => String(t.id) === String(id) ? { ...t, star: !t.star } : t));
    };

    return (
        <div className="flex flex-1 h-full overflow-hidden rounded-2xl border bg-black/5" style={{ borderColor: colors.border }}>
            {/* To Do Sidebar */}
            <div className="w-60 border-r flex flex-col p-4 space-y-1 hidden md:flex" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                {lists.map(list => (
                    <button
                        key={list.id}
                        onClick={() => setActiveList(list.id)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeList === list.id ? 'bg-white/5 font-bold shadow-sm' : 'hover:bg-white/5 opacity-70'}`}
                        style={{ color: activeList === list.id ? colors.primary : colors.textMain }}
                    >
                        <list.icon size={18} style={{ color: list.color || (activeList === list.id ? colors.primary : colors.textMuted) }} />
                        <span className="text-sm">{list.label}</span>
                        <span className="ml-auto text-[10px] font-mono opacity-60">
                            {scopedTasks.filter((t: any) => {
                                if (list.id === 'Important') return t.star && !t.completed;
                                if (list.id === 'Planned') return t.date && !t.completed;
                                if (list.id === 'Assigned') return isAssignedToCurrentUser(t) && !t.completed;
                                if (list.id === 'Completed') return t.completed;
                                return !t.completed;
                            }).length}
                        </span>
                    </button>
                ))}
            </div>

            {/* To Do Main List Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
                <div className="p-8 pb-4 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-3xl font-black tracking-tight flex items-center gap-4" style={{ color: colors.textMain }}>
                            {lists.find(l => l.id === activeList)?.label}
                        </h2>
                        <p className="text-sm font-medium opacity-50 mt-1" style={{ color: colors.textMuted }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    </div>
                    {activeList !== 'Progress' && canMutateTodo && (
                        <button
                            onClick={() => handleOpenTaskModal()}
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-105 active:scale-95 shadow-2xl hover:brightness-110"
                            style={{ backgroundColor: colors.primary, color: '#000', boxShadow: `0 8px 30px ${colors.primary}40` }}
                        >
                            <Plus size={18} strokeWidth={3} />
                            Add Task
                        </button>
                    )}
                </div>

                {activeList === 'Progress' ? (
                    <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
                            {/* Summary Cards */}
                            <div className="md:col-span-2 grid grid-cols-3 gap-4">
                                <div className="p-6 rounded-3xl border-2 flex flex-col items-center justify-center text-center gap-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                    <div className="text-3xl font-black" style={{ color: colors.primary }}>{scopedTasks.filter((t: any) => t.completed).length}</div>
                                    <div className="text-[10px] uppercase font-bold tracking-widest opacity-60" style={{ color: colors.textMuted }}>Completed</div>
                                </div>
                                <div className="p-6 rounded-3xl border-2 flex flex-col items-center justify-center text-center gap-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                    <div className="text-3xl font-black" style={{ color: colors.blue }}>{scopedTasks.filter((t: any) => !t.completed).length}</div>
                                    <div className="text-[10px] uppercase font-bold tracking-widest opacity-60" style={{ color: colors.textMuted }}>Active</div>
                                </div>
                                <div className="p-6 rounded-3xl border-2 flex flex-col items-center justify-center text-center gap-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                    <div className="text-3xl font-black" style={{ color: colors.orange }}>{scopedTasks.filter((t: any) => t.star && !t.completed).length}</div>
                                    <div className="text-[10px] uppercase font-bold tracking-widest opacity-60" style={{ color: colors.textMuted }}>Critical</div>
                                </div>
                            </div>

                            {/* Circular Progress */}
                            <div className="p-6 rounded-3xl border-2 flex flex-col items-center justify-center relative bg-gradient-to-br from-black/20 to-transparent" style={{ borderColor: colors.border }}>
                                <div className="relative w-32 h-32 flex items-center justify-center">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="64" cy="64" r="54" stroke="currentColor" strokeWidth="8" fill="transparent" className="opacity-10" style={{ color: colors.primary }} />
                                        <circle cx="64" cy="64" r="54" stroke="currentColor" strokeWidth="8" fill="transparent"
                                            strokeDasharray={2 * Math.PI * 54}
                                            strokeDashoffset={2 * Math.PI * 54 * (1 - (scopedTasks.filter((t: any) => t.completed).length / (scopedTasks.length || 1)))}
                                            strokeLinecap="round"
                                            className="transition-all duration-1000 ease-out"
                                            style={{ color: colors.primary }}
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-black" style={{ color: colors.textMain }}>
                                            {Math.round((scopedTasks.filter((t: any) => t.completed).length / (scopedTasks.length || 1)) * 100)}%
                                        </span>
                                        <span className="text-[8px] uppercase font-bold opacity-40">Total</span>
                                    </div>
                                </div>
                                <p className="mt-4 text-[10px] uppercase font-bold tracking-tighter opacity-70">Overall Completion</p>
                            </div>

                            {/* Priority Breakdown Chart */}
                            <div className="md:col-span-1 p-6 rounded-3xl border-2 h-64" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <h3 className="text-sm font-black mb-4 uppercase tracking-widest opacity-70" style={{ color: colors.textMuted }}>Priority Mix</h3>
                                <ResponsiveContainer width="100%" height="80%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'High', value: scopedTasks.filter((t: any) => t.priority === 'High').length, fill: colors.red },
                                                { name: 'Medium', value: scopedTasks.filter((t: any) => t.priority === 'Medium').length, fill: colors.yellow },
                                                { name: 'Low', value: scopedTasks.filter((t: any) => t.priority === 'Low').length, fill: colors.green }
                                            ]}
                                            innerRadius={50}
                                            outerRadius={70}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {[0, 1, 2].map((i) => <Cell key={i} />)}
                                        </Pie>
                                        <Tooltip {...rechartsTooltipThemeProps(colors, { borderRadius: '12px' })} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Category Distribution */}
                            <div className="md:col-span-2 p-6 rounded-3xl border-2 h-64" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <h3 className="text-sm font-black mb-4 uppercase tracking-widest opacity-70" style={{ color: colors.textMuted }}>Category Load</h3>
                                <ResponsiveContainer width="100%" height="80%">
                                    <BarChart data={TASK_CATEGORIES.map(cat => ({
                                        name: cat,
                                        count: scopedTasks.filter((t: any) => t.category === cat).length
                                    }))}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.border} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: colors.textMuted }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: colors.textMuted }} />
                                        <Tooltip cursor={{ fill: 'white', opacity: 0.05 }} {...rechartsTooltipThemeProps(colors, { borderRadius: '12px' })} />
                                        <Bar dataKey="count" radius={[10, 10, 0, 0]} barSize={30}>
                                            {TASK_CATEGORIES.map((_, i) => (
                                                <Cell key={i} fill={[colors.primary, colors.blue, colors.purple, colors.cyan, colors.orange][i % 5]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>


                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto px-8 py-4 space-y-3 custom-scrollbar">
                        {filteredTasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 italic">
                                <CheckCircle2 size={64} strokeWidth={1} className="mb-4" />
                                <p className="text-lg font-light tracking-widest">Everything is caught up</p>
                            </div>
                        ) : (
                            filteredTasks.map((task: any) => {
                                const assigneeNames = taskAssigneeNamesList(task);
                                return (
                                <div
                                    key={task.id}
                                    onClick={() => handleOpenTaskModal(task)}
                                    className="group flex items-center gap-5 p-5 rounded-2xl border-2 transition-all cursor-pointer hover:shadow-xl hover:-translate-y-0.5 animate-in slide-in-from-bottom-4"
                                    style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                >
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleToggleTaskComplete(task.id, e); }}
                                        disabled={!canMutateTodo}
                                        className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 shrink-0 shadow-inner disabled:opacity-40 disabled:pointer-events-none"
                                        style={{ borderColor: task.completed ? colors.green : colors.primary + '30' }}
                                    >
                                        {task.completed && <Check size={14} strokeWidth={4} style={{ color: colors.green }} />}
                                        {!task.completed && <div className="w-3 h-3 rounded-full opacity-0 group-hover:opacity-30" style={{ backgroundColor: colors.primary }} />}
                                    </button>

                                    <div className="flex-1 min-w-0">
                                        <h4 className={`text-base font-bold truncate transition-all ${task.completed ? 'line-through opacity-30 italic' : ''}`} style={{ color: colors.textMain }}>{task.task}</h4>
                                        <div className="flex items-center gap-4 mt-1.5">
                                            <span className="text-xs font-medium opacity-60 flex items-center gap-1" style={{ color: colors.textMuted }}>
                                                <Briefcase size={12} />
                                                {task.client}
                                            </span>
                                            {task.date && (
                                                <span className="flex items-center gap-1.5 text-xs font-black tracking-tighter" style={{ color: new Date(task.date) < new Date() && !task.completed ? colors.red : colors.blue }}>
                                                    <Calendar size={12} strokeWidth={3} />
                                                    {task.date}
                                                </span>
                                            )}
                                            {task.category && (
                                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-[0.1em]" style={{ backgroundColor: colors.primary + '15', color: colors.primary }}>
                                                    {task.category}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-5 shrink-0">
                                        <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/5 max-w-[min(100%,22rem)]">
                                            <div className="w-6 h-6 rounded-full flex shrink-0 items-center justify-center text-[10px] font-black text-black"
                                                style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.orange})` }}>
                                                {taskAssigneesAvatarLetters(task)}
                                            </div>
                                            <span
                                                className="text-[10px] font-bold opacity-70 hidden lg:flex flex-wrap items-center gap-x-1 gap-y-0.5 justify-end text-right leading-snug"
                                                style={{ color: colors.textMain }}
                                            >
                                                {assigneeNames.length === 0 ? (
                                                    '—'
                                                ) : (
                                                    assigneeNames.map((nm, i) => (
                                                        <React.Fragment key={`${nm}-${i}`}>
                                                            {i > 0 && <span className="opacity-40 shrink-0">·</span>}
                                                            <span className="whitespace-nowrap">{nm}</span>
                                                        </React.Fragment>
                                                    ))
                                                )}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => toggleStar(task.id, e)}
                                            disabled={!canMutateTodo}
                                            className="p-1 hover:scale-125 transition-transform disabled:opacity-30 disabled:pointer-events-none"
                                            style={{ color: task.star ? colors.orange : colors.textMuted + '20' }}
                                        >
                                            <Star size={22} fill={task.star ? colors.orange : 'transparent'} strokeWidth={task.star ? 0 : 2} />
                                        </button>
                                    </div>
                                </div>
                            );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
