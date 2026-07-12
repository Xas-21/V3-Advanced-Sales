export type DashboardHubTabId =
    | 'feed'
    | 'dashboard'
    | 'requests'
    | 'rooms'
    | 'mice'
    | 'revenue-mix'
    | 'crm'
    | 'accounts'
    | 'promotions'
    | 'agreements'
    | 'activities'
    | 'sales-performance';

export type DashboardHubTabDef = {
    id: DashboardHubTabId;
    label: string;
    /** Live analysis page (not coming-soon). */
    live: boolean;
};

export const DASHBOARD_HUB_TABS: DashboardHubTabDef[] = [
    { id: 'feed', label: 'Feed', live: true },
    { id: 'dashboard', label: 'Dashboard', live: true },
    { id: 'requests', label: 'Requests', live: false },
    { id: 'rooms', label: 'Rooms', live: false },
    { id: 'mice', label: 'MICE', live: false },
    { id: 'revenue-mix', label: 'Revenue Mix', live: false },
    { id: 'crm', label: 'CRM', live: false },
    { id: 'accounts', label: 'Accounts', live: false },
    { id: 'promotions', label: 'Promotions', live: false },
    { id: 'agreements', label: 'Agreements', live: false },
    { id: 'activities', label: 'Activities', live: false },
    { id: 'sales-performance', label: 'Sales Performance', live: false },
];

export function dashboardHubTabLabel(tabId: DashboardHubTabId): string {
    return DASHBOARD_HUB_TABS.find((t) => t.id === tabId)?.label ?? tabId;
}

export function isDashboardHubTabLive(tabId: DashboardHubTabId): boolean {
    return DASHBOARD_HUB_TABS.find((t) => t.id === tabId)?.live ?? false;
}
