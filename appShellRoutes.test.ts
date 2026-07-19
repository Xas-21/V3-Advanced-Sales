import { describe, expect, it } from 'vitest';
import { normalizePathname, parseAppPath, viewToPath } from './appShellRoutes';

describe('appShellRoutes', () => {
    it('maps main modules both ways', () => {
        expect(parseAppPath('/requests')).toEqual({ view: 'requests', hubTab: 'dashboard' });
        expect(viewToPath('crm')).toBe('/crm');
        expect(parseAppPath('/settings/')).toEqual({ view: 'settings', hubTab: 'dashboard' });
    });

    it('treats / and /dashboard as KPI hub home', () => {
        expect(parseAppPath('/')).toEqual({ view: 'dashboard', hubTab: 'dashboard' });
        expect(parseAppPath('/dashboard')).toEqual({ view: 'dashboard', hubTab: 'dashboard' });
        expect(viewToPath('dashboard')).toBe('/dashboard');
    });

    it('maps hub tabs under /hub/:tab', () => {
        expect(parseAppPath('/hub/rooms')).toEqual({ view: 'dashboard', hubTab: 'rooms' });
        expect(viewToPath('dashboard', 'revenue-mix')).toBe('/hub/revenue-mix');
        expect(parseAppPath('/hub')).toEqual({ view: 'dashboard', hubTab: 'dashboard' });
    });

    it('falls back unknown paths to dashboard', () => {
        expect(parseAppPath('/nope')).toEqual({ view: 'dashboard', hubTab: 'dashboard' });
        expect(normalizePathname('/a/')).toBe('/a');
    });
});
