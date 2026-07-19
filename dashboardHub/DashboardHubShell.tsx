import React, { useEffect, useState, Suspense, lazy } from 'react';
import DashboardHubTabBar from './DashboardHubTabBar';
import {
    canOpenDashboardHubTab,
    dashboardHubTabLabel,
    type DashboardHubTabId,
} from './dashboardHubTabs';
import { HubDataProvider, type HubData } from './HubDataContext';
import { Skeleton } from '@/components/ui/skeleton';
import DashboardHubComingSoon from './DashboardHubComingSoon';

const DashboardHubFeedPage = lazy(() => import('./pages/DashboardHubFeedPage'));
const DashboardHubRequestsPage = lazy(() => import('./pages/DashboardHubRequestsPage'));
const DashboardHubRoomsPage = lazy(() => import('./pages/DashboardHubRoomsPage'));
const DashboardHubMicePage = lazy(() => import('./pages/DashboardHubMicePage'));
const DashboardHubRevenueMixPage = lazy(() => import('./pages/DashboardHubRevenueMixPage'));
const DashboardHubCrmPage = lazy(() => import('./pages/DashboardHubCrmPage'));
const DashboardHubAccountsPage = lazy(() => import('./pages/DashboardHubAccountsPage'));
const DashboardHubPromotionsPage = lazy(() => import('./pages/DashboardHubPromotionsPage'));
const DashboardHubAgreementsPage = lazy(() => import('./pages/DashboardHubAgreementsPage'));
const DashboardHubActivitiesPage = lazy(() => import('./pages/DashboardHubActivitiesPage'));
const DashboardHubSalesPerformancePage = lazy(() => import('./pages/DashboardHubSalesPerformancePage'));

type DashboardHubShellProps = {
    colors: any;
    /** Property-scoped data supplied by the parent dashboard (AS.tsx). */
    data: Omit<HubData, 'colors'>;
    children: React.ReactNode;
    /** Controlled hub tab (URL-synced from AS.tsx). */
    activeTab?: DashboardHubTabId;
    onTabChange?: (tabId: DashboardHubTabId) => void;
};

function HubTabLoadFallback({ colors }: { colors: any }) {
    const sk = (opacity: string) => ({ backgroundColor: `${colors.border}${opacity}` });
    return (
        <div className="flex flex-col gap-4 py-2" aria-busy="true">
            <div className="flex items-center gap-3">
                <Skeleton className="size-11 shrink-0 rounded-xl" style={sk('88')} />
                <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-5 w-48 max-w-full" style={sk('88')} />
                    <Skeleton className="h-3 w-64 max-w-full" style={sk('66')} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 rounded-2xl" style={sk('55')} />
                ))}
            </div>
        </div>
    );
}

function DashboardHubTabPage({
    tabId,
    colors,
    currentUser,
}: {
    tabId: DashboardHubTabId;
    colors: any;
    currentUser: any;
}) {
    if (!canOpenDashboardHubTab(tabId, currentUser)) {
        return <DashboardHubComingSoon tabLabel={dashboardHubTabLabel(tabId)} colors={colors} />;
    }

    let page: React.ReactNode = null;
    switch (tabId) {
        case 'feed':
            page = <DashboardHubFeedPage colors={colors} />;
            break;
        case 'requests':
            page = <DashboardHubRequestsPage colors={colors} />;
            break;
        case 'rooms':
            page = <DashboardHubRoomsPage colors={colors} />;
            break;
        case 'mice':
            page = <DashboardHubMicePage colors={colors} />;
            break;
        case 'revenue-mix':
            page = <DashboardHubRevenueMixPage colors={colors} />;
            break;
        case 'crm':
            page = <DashboardHubCrmPage colors={colors} />;
            break;
        case 'accounts':
            page = <DashboardHubAccountsPage colors={colors} />;
            break;
        case 'promotions':
            page = <DashboardHubPromotionsPage colors={colors} />;
            break;
        case 'agreements':
            page = <DashboardHubAgreementsPage colors={colors} />;
            break;
        case 'activities':
            page = <DashboardHubActivitiesPage colors={colors} />;
            break;
        case 'sales-performance':
            page = <DashboardHubSalesPerformancePage colors={colors} />;
            break;
        default:
            page = null;
    }
    return <Suspense fallback={<HubTabLoadFallback colors={colors} />}>{page}</Suspense>;
}

export default function DashboardHubShell({
    colors,
    data,
    children,
    activeTab: controlledTab,
    onTabChange,
}: DashboardHubShellProps) {
    const [internalTab, setInternalTab] = useState<DashboardHubTabId>('dashboard');
    const activeTab = controlledTab ?? internalTab;
    const currentUser = data.currentUser;
    const userKey = String(currentUser?.id ?? currentUser?.username ?? '');

    // Reset hub navigation whenever the signed-in user changes (uncontrolled only).
    useEffect(() => {
        if (controlledTab != null) return;
        setInternalTab('dashboard');
    }, [userKey, controlledTab]);

    const handleTabClick = (tabId: DashboardHubTabId) => {
        if (tabId === activeTab) return;
        if (onTabChange) onTabChange(tabId);
        else setInternalTab(tabId);
    };

    return (
        <HubDataProvider value={{ colors, ...data }}>
            <div className="col-span-1 md:col-span-12 min-w-0">
                <DashboardHubTabBar activeTab={activeTab} onTabClick={handleTabClick} colors={colors} />
            </div>

            {activeTab === 'dashboard' ? (
                children
            ) : (
                <div className="col-span-1 md:col-span-12 min-w-0">
                    <DashboardHubTabPage tabId={activeTab} colors={colors} currentUser={currentUser} />
                </div>
            )}
        </HubDataProvider>
    );
}
