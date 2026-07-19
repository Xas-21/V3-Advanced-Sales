import { describe, expect, it } from 'vitest';
import {
    canOpenDashboardHubTab,
    isDashboardHubAdmin,
    isDashboardHubTabLive,
} from './dashboardHubTabs';

describe('dashboard hub tab access', () => {
    it('allows feed and dashboard for everyone', () => {
        const gm = { role: 'General Manager' };
        expect(canOpenDashboardHubTab('feed', gm)).toBe(true);
        expect(canOpenDashboardHubTab('dashboard', gm)).toBe(true);
        expect(isDashboardHubTabLive('feed')).toBe(true);
        expect(isDashboardHubTabLive('dashboard')).toBe(true);
    });

    it('treats only Admin as hub admin — not General Manager', () => {
        expect(isDashboardHubAdmin({ role: 'Admin' })).toBe(true);
        expect(isDashboardHubAdmin({ role: 'admin' })).toBe(true);
        expect(isDashboardHubAdmin({ role: 'super_admin' })).toBe(true);
        expect(isDashboardHubAdmin({ role: 'General Manager' })).toBe(false);
        expect(isDashboardHubAdmin({ role: 'Head of Sales' })).toBe(false);
        expect(isDashboardHubAdmin({ name: 'Ahmed Hishma', role: 'General Manager' })).toBe(false);
    });

    it('locks incomplete tabs for GM and opens them for Admin', () => {
        const gm = { role: 'General Manager', name: 'Ahmed Hishma' };
        const admin = { role: 'Admin' };
        expect(canOpenDashboardHubTab('requests', gm)).toBe(false);
        expect(canOpenDashboardHubTab('crm', gm)).toBe(false);
        expect(canOpenDashboardHubTab('sales-performance', gm)).toBe(false);
        expect(canOpenDashboardHubTab('requests', admin)).toBe(true);
        expect(canOpenDashboardHubTab('sales-performance', admin)).toBe(true);
    });
});
