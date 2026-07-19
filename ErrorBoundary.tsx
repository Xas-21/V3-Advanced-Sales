import { Component, type ReactNode } from 'react';

export type ErrorBoundaryState = { error: Error | null };

export type ErrorBoundaryProps = {
    children: ReactNode;
    /** `root` = full-app fallback with reload/reset; `section` = localized panel fallback. */
    variant?: 'root' | 'section';
    /** Optional section title; defaults to a generic friendly line. */
    label?: string;
    /**
     * When true, shows error.message + stack (development).
     * Defaults to `import.meta.env.DEV`. Production must leave this false/undefined.
     */
    showDetails?: boolean;
};

function resolveShowDetails(showDetails: boolean | undefined): boolean {
    return showDetails ?? Boolean(import.meta.env.DEV);
}

/** Reusable render-error boundary. Production fallbacks stay generic (no stack/paths/messages). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        const normalized =
            error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
        return { error: normalized };
    }

    componentDidCatch(error: unknown) {
        console.error('[Advanced Sales]', error);
    }

    private reset = () => {
        this.setState({ error: null });
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        const showDetails = resolveShowDetails(this.props.showDetails);
        const variant = this.props.variant ?? 'section';

        if (variant === 'root') {
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
                    {showDetails ? <p style={{ marginTop: 10, opacity: 0.9 }}>{error.message}</p> : null}
                    {showDetails ? (
                        <pre style={{ marginTop: 18, overflow: 'auto', fontSize: 12 }}>{error.stack ?? ''}</pre>
                    ) : null}
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

        const title = this.props.label?.trim() || 'This section failed to load';
        return (
            <div
                role="alert"
                style={{
                    padding: 24,
                    borderRadius: 12,
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    background: 'rgba(15, 23, 42, 0.04)',
                    fontFamily: 'system-ui, sans-serif',
                }}
            >
                <p style={{ fontWeight: 700, margin: 0 }}>{title}</p>
                <p style={{ marginTop: 8, opacity: 0.85 }}>Something went wrong. You can keep using the rest of the dashboard.</p>
                {showDetails ? <p style={{ marginTop: 10, opacity: 0.9 }}>{error.message}</p> : null}
                {showDetails ? (
                    <pre style={{ marginTop: 12, overflow: 'auto', fontSize: 12 }}>{error.stack ?? ''}</pre>
                ) : null}
                <button
                    type="button"
                    style={{ marginTop: 16, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}
                    onClick={this.reset}
                >
                    Try again
                </button>
            </div>
        );
    }
}
