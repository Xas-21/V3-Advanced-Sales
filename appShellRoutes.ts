/**
 * Thin path ↔ shell-view map for plan 033 (react-router).
 * Keep in sync with APP_SHELL_VIEW_IDS in AS.tsx.
 */
import {
    DASHBOARD_HUB_TABS,
    type DashboardHubTabId,
} from './dashboardHub/dashboardHubTabs';

export const APP_VIEW_PATHS: Record<string, string> = {
    dashboard: '/dashboard',
    calendar: '/calendar',
    events: '/events',
    requests: '/requests',
    crm: '/crm',
    contracts: '/contracts',
    accounts: '/accounts',
    promotions: '/promotions',
    reports: '/reports',
    todo: '/todo',
    settings: '/settings',
};

const PATH_TO_VIEW: Record<string, string> = Object.fromEntries(
    Object.entries(APP_VIEW_PATHS).map(([view, path]) => [path, view]),
);

const HUB_TAB_IDS = new Set<string>(DASHBOARD_HUB_TABS.map((t) => t.id));

export function isHubTabId(value: string): value is DashboardHubTabId {
    return HUB_TAB_IDS.has(value);
}

export type ParsedAppPath = {
    view: string;
    hubTab: DashboardHubTabId;
};

/** Normalize pathname (no trailing slash except root). */
export function normalizePathname(pathname: string): string {
    if (!pathname) return '/';
    if (pathname === '/') return '/';
    return pathname.replace(/\/+$/, '') || '/';
}

export function parseAppPath(pathname: string): ParsedAppPath {
    const p = normalizePathname(pathname);
    if (p === '/' || p === '/dashboard') {
        return { view: 'dashboard', hubTab: 'dashboard' };
    }
    const hubMatch = /^\/hub(?:\/([^/]+))?$/.exec(p);
    if (hubMatch) {
        const raw = String(hubMatch[1] || 'dashboard');
        const hubTab: DashboardHubTabId = isHubTabId(raw) ? raw : 'dashboard';
        return { view: 'dashboard', hubTab };
    }
    const view = PATH_TO_VIEW[p];
    if (view) return { view, hubTab: 'dashboard' };
    return { view: 'dashboard', hubTab: 'dashboard' };
}

export function viewToPath(view: string, hubTab: DashboardHubTabId = 'dashboard'): string {
    if (view === 'dashboard') {
        if (!hubTab || hubTab === 'dashboard') return '/dashboard';
        return `/hub/${hubTab}`;
    }
    return APP_VIEW_PATHS[view] || '/dashboard';
}
