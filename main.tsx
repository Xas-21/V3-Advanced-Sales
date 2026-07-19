import React, { Component, type ReactNode, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AdvancedSalesDashboard from './AS';
import './index.css';

type RootBoundaryState = { error: Error | null };

/** Catches runtime render errors from the main app shell (shows message instead of a blank root). */
class RootErrorBoundary extends Component<{ children: ReactNode }, RootBoundaryState> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error: unknown): RootBoundaryState {
        const normalized =
            error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
        return { error: normalized };
    }
    componentDidCatch(error: unknown) {
        // Intentional: surface white-screen faults in the console.
        console.error('[Advanced Sales]', error);
    }
    render() {
        const { error } = this.state;
        if (error) {
            return (
                <div
                    style={{
                        minHeight: '100vh',
                        padding: 28,
                        background: '#0f172a',
                        color: '#e2e8f0',
                        fontFamily: 'system-ui, sans-serif',
                    }}
                >
                    <p style={{ color: '#f87171', fontWeight: 'bold', fontSize: '1.125rem' }}>The application failed to load</p>
                    <p style={{ marginTop: 10, opacity: 0.9 }}>{error.message}</p>
                    <pre style={{ marginTop: 18, overflow: 'auto', fontSize: 12 }}>{error.stack ?? ''}</pre>
                    <div style={{ marginTop: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            style={{ padding: '10px 16px', fontWeight: 'bold', cursor: 'pointer' }}
                            onClick={() => window.location.reload()}
                        >
                            Reload
                        </button>
                        <button
                            type="button"
                            style={{ padding: '10px 16px', fontWeight: 600, cursor: 'pointer', opacity: 0.92 }}
                            onClick={() => {
                                try {
                                    localStorage.removeItem('as_currentView');
                                } catch {
                                    /* ignore */
                                }
                                window.location.reload();
                            }}
                        >
                            Reset cached page & reload
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

window.addEventListener('unhandledrejection', (e) => {
    console.error('[Unhandled promise rejection]', e.reason);
});

/** Stops mouse-wheel from changing values while a number input is focused (scroll still moves the page when unfocused). */
function BlockWheelOnFocusedNumberInputs() {
    useEffect(() => {
        const onWheel = (e: WheelEvent) => {
            const el = e.target;
            if (!(el instanceof HTMLInputElement) || el.type !== 'number') return;
            if (document.activeElement !== el) return;
            e.preventDefault();
        };
        document.addEventListener('wheel', onWheel, { passive: false });
        return () => document.removeEventListener('wheel', onWheel);
    }, []);
    return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <BlockWheelOnFocusedNumberInputs />
            <RootErrorBoundary>
                <AdvancedSalesDashboard />
            </RootErrorBoundary>
        </BrowserRouter>
    </React.StrictMode>
);
