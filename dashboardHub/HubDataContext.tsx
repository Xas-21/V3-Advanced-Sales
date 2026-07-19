import React, { createContext, useContext, useMemo } from 'react';

/**
 * Shared data for every Dashboard Hub tab. The parent (AS.tsx) already loads all
 * of this state scoped to the ACTIVE property, so tabs consume it directly:
 *  - no redundant /api refetching
 *  - automatically per-property (follows the property switcher)
 *  - live-update aware (parent state updates via the WebSocket layer)
 */
export type HubData = {
    colors: any;
    currency: string;
    activeProperty: { id: string; name?: string } | null;
    properties: any[];
    /** Requests already scoped to the active property. */
    requests: any[];
    /** Accounts already scoped to the active property. */
    accounts: any[];
    /** CRM pipeline + sales calls for the active property. */
    crmState: { pipeline?: Record<string, any[]>; salesCalls?: any[] } | null;
    promotions: any[];
    financials: any[];
    taxes: any[];
    users: any[];
    currentUser: any;
    /** Bumped by the WebSocket layer when a feed post/comment/reaction changes. */
    feedLiveVersion?: number;
    /** Users with an active WebSocket session for the active property (real online). */
    onlineUsers?: any[];
};

const HubDataContext = createContext<HubData | null>(null);

export function HubDataProvider({ value, children }: { value: HubData; children: React.ReactNode }) {
    // Stabilize identity so consumers don't re-render on unrelated parent renders.
    const memo = useMemo(
        () => value,
        [
            value.colors,
            value.currency,
            value.activeProperty?.id,
            value.properties,
            value.requests,
            value.accounts,
            value.crmState,
            value.promotions,
            value.financials,
            value.taxes,
            value.users,
            value.currentUser,
            value.feedLiveVersion,
            value.onlineUsers,
        ]
    );
    return <HubDataContext.Provider value={memo}>{children}</HubDataContext.Provider>;
}

export function useHubData(): HubData {
    const ctx = useContext(HubDataContext);
    if (!ctx) {
        // Defensive default so a tab never crashes if rendered outside the provider.
        return {
            colors: {},
            currency: 'SAR',
            activeProperty: null,
            properties: [],
            requests: [],
            accounts: [],
            crmState: null,
            promotions: [],
            financials: [],
            taxes: [],
            users: [],
            currentUser: null,
            feedLiveVersion: 0,
            onlineUsers: [],
        };
    }
    return ctx;
}
