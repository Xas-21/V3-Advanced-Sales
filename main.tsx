import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AdvancedSalesDashboard from './AS';
import { ErrorBoundary } from './ErrorBoundary';
import './index.css';

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
            <ErrorBoundary variant="root">
                <AdvancedSalesDashboard />
            </ErrorBoundary>
        </BrowserRouter>
    </React.StrictMode>
);
