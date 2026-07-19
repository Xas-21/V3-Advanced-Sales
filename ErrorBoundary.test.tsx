import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
    it('enters fallback state after an error', () => {
        const err = new Error('section exploded');
        err.stack = 'Error: section exploded\n    at /abs/path/Contracts.tsx:99:1';

        const state = ErrorBoundary.getDerivedStateFromError(err);
        expect(state.error?.message).toBe('section exploded');

        const boundary = new ErrorBoundary({
            children: <span>ok</span>,
            variant: 'section',
            showDetails: false,
        });
        boundary.state = state;
        const html = renderToStaticMarkup(<>{boundary.render()}</>);

        expect(html).toMatch(/this section failed to load/i);
        expect(html).not.toContain('ok');
    });

    it('hides stack and internal details when showDetails is false', () => {
        const err = new Error('db password=supersecret leaked');
        err.stack = 'Error: db password=supersecret leaked\n    at C:\\Users\\dev\\app\\RequestsManager.tsx:12:3';

        const boundary = new ErrorBoundary({
            children: null,
            variant: 'section',
            showDetails: false,
        });
        boundary.state = ErrorBoundary.getDerivedStateFromError(err);
        const html = renderToStaticMarkup(<>{boundary.render()}</>);

        expect(html).not.toContain(err.stack);
        expect(html).not.toContain('RequestsManager.tsx');
        expect(html).not.toContain('supersecret');
        expect(html).not.toContain('db password');
        expect(html).not.toContain('C:\\Users');
    });

    it('may show stack when showDetails is true (development)', () => {
        const err = new Error('dev only');
        err.stack = 'Error: dev only\n    at DashboardHubShell.tsx:1:1';

        const boundary = new ErrorBoundary({
            children: null,
            variant: 'root',
            showDetails: true,
        });
        boundary.state = ErrorBoundary.getDerivedStateFromError(err);
        const html = renderToStaticMarkup(<>{boundary.render()}</>);

        expect(html).toContain('DashboardHubShell.tsx');
        expect(html).toMatch(/reload/i);
        expect(html).toMatch(/reset cached page/i);
    });
});
