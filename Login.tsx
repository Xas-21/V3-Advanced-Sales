import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, Palette, X, ShieldAlert } from 'lucide-react';
import { apiUrl } from './backendApi';

const OFFICIAL_APP_URL = 'https://as-saas.com/';

function isOfficialAppHost(): boolean {
    return true;
}

type ConnectionNotice = 'wrong-domain' | 'server-unavailable' | 'config' | null;

interface LoginProps {
    onLogin: (user: any) => void;
    themes: any;
    currentThemeId: string;
    onThemeChange: () => void;
    onBackToLanding?: () => void;
}

export default function Login({ onLogin, themes, currentThemeId, onThemeChange, onBackToLanding }: LoginProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [keepSignedIn, setKeepSignedIn] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [connectionNotice, setConnectionNotice] = useState<ConnectionNotice>(null);

    const theme = themes[currentThemeId] || themes.light;
    const colors = theme.colors;


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError(null);
        setConnectionNotice(null);

        try {
            const response = await fetch(apiUrl('/api/login'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                setLoginError(String(errorData.detail || 'Login failed. Please check your username and password.'));
                return;
            }

            const data = await response.json();
            onLogin(data.user ?? data);
        } catch (error) {
            console.error('Login error:', error);
            const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
            if (!apiBase) {
                setConnectionNotice('config');
                return;
            }
            setConnectionNotice(isOfficialAppHost() ? 'server-unavailable' : 'wrong-domain');
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-8" style={{ backgroundColor: colors.bg }}>
            <div className="w-full max-w-md">
                <div className="mb-6 text-center">
                    <img
                        src="https://res.cloudinary.com/dmydt1xa9/image/upload/v1769032168/Gemini_Generated_Image_4hqpsz4hqpsz4hqp_ukfn6c.png"
                        alt="Advanced Sales Logo"
                        className="h-20 w-auto object-contain mx-auto mb-3"
                    />
                    <h2 className="text-2xl font-black" style={{ color: colors.primary }}>Advanced Sales</h2>
                    {onBackToLanding && (
                        <button onClick={onBackToLanding} className="text-xs mt-2 underline" style={{ color: colors.textMuted }}>
                            Back to landing page
                        </button>
                    )}
                </div>

                {/* Login Card */}
                    <div className="p-8 rounded-2xl border shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700"
                        style={{
                            backgroundColor: colors.card,
                            borderColor: colors.border
                        }}>

                        <div className="mb-8">
                            <h2 className="text-3xl font-bold mb-2" style={{ color: colors.textMain }}>
                                Welcome Back
                            </h2>
                            <p className="text-sm" style={{ color: colors.textMuted }}>
                                Sign in to access your dashboard
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Username/Email */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider mb-2"
                                    style={{ color: colors.textMuted }}>
                                    Email or Username
                                </label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Enter your username"
                                    className="w-full px-4 py-3 rounded-lg border bg-black/20 outline-none focus:border-opacity-100 transition-all"
                                    style={{
                                        borderColor: colors.border,
                                        color: colors.textMain
                                    }}
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider mb-2"
                                    style={{ color: colors.textMuted }}>
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter your password"
                                        className="w-full px-4 py-3 pr-12 rounded-lg border bg-black/20 outline-none focus:border-opacity-100 transition-all"
                                        style={{
                                            borderColor: colors.border,
                                            color: colors.textMain
                                        }}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:opacity-70 transition-opacity"
                                        style={{ color: colors.textMuted }}
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>

                            {/* Keep Signed In */}
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={keepSignedIn}
                                        onChange={(e) => setKeepSignedIn(e.target.checked)}
                                        className="w-4 h-4 rounded"
                                        style={{ accentColor: colors.primary }}
                                    />
                                    <span className="text-sm" style={{ color: colors.textMain }}>
                                        Keep me signed in
                                    </span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowForgotPassword(true)}
                                    className="text-sm hover:underline"
                                    style={{ color: colors.primary }}
                                >
                                    Forgot password?
                                </button>
                            </div>

                            {loginError && (
                                <p
                                    className="text-sm rounded-lg px-4 py-3 border"
                                    style={{
                                        color: colors.textMain,
                                        borderColor: '#ef444460',
                                        backgroundColor: '#ef444415',
                                    }}
                                    role="alert"
                                >
                                    {loginError}
                                </p>
                            )}

                            {/* Submit Button */}
                            <button
                                type="submit"
                                className="w-full py-3 rounded-lg font-bold uppercase tracking-wide flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg"
                                style={{
                                    backgroundColor: colors.primary,
                                    color: '#000',
                                    boxShadow: `0 0 20px -5px ${colors.primary}`
                                }}
                            >
                                <LogIn size={18} />
                                Sign In
                            </button>
                        </form>

                    </div>

                {/* Theme Selector */}
                <div className="mt-6 p-4 rounded-xl border text-center animate-in fade-in slide-in-from-bottom-2 duration-500 hover:scale-[1.02] transition-all"
                    style={{
                        backgroundColor: colors.card,
                        borderColor: colors.border
                    }}>
                    <button
                        onClick={onThemeChange}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg border hover:bg-white/5 transition-all"
                        style={{
                            borderColor: colors.primary + '40',
                            color: colors.primary
                        }}
                    >
                        <Palette size={18} />
                        <span className="text-sm font-medium">
                            Current Theme: {theme.name}
                        </span>
                    </button>
                    <p className="text-xs mt-2" style={{ color: colors.textMuted }}>
                        Click to switch themes
                    </p>
                </div>
            </div>

            {connectionNotice && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="connection-notice-title"
                    onClick={() => setConnectionNotice(null)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border shadow-2xl p-6 relative"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setConnectionNotice(null)}
                            className="absolute top-4 right-4 p-1 rounded-lg hover:opacity-70 transition-opacity"
                            style={{ color: colors.textMuted }}
                            aria-label="Close"
                        >
                            <X size={22} />
                        </button>

                        <div className="flex items-start gap-3 pr-8 mb-4">
                            <div
                                className="p-2 rounded-lg shrink-0"
                                style={{ backgroundColor: `${colors.primary}20`, color: colors.primary }}
                            >
                                <ShieldAlert size={22} />
                            </div>
                            <div>
                                <h3 id="connection-notice-title" className="text-xl font-bold mb-2" style={{ color: colors.textMain }}>
                                    {connectionNotice === 'wrong-domain' ? 'Please use the official link' : 'Unable to connect'}
                                </h3>
                                {connectionNotice === 'wrong-domain' ? (
                                    <p className="text-sm leading-relaxed" style={{ color: colors.textMuted }}>
                                        Sorry — for your security, you must access Advanced Sales through our official link only.
                                        This address is not authorized to sign in.
                                    </p>
                                ) : connectionNotice === 'server-unavailable' ? (
                                    <p className="text-sm leading-relaxed" style={{ color: colors.textMuted }}>
                                        We could not reach the server right now. Please try again in a moment.
                                    </p>
                                ) : (
                                    <p className="text-sm leading-relaxed" style={{ color: colors.textMuted }}>
                                        The application is not fully configured to reach the API. Please contact your administrator.
                                    </p>
                                )}
                            </div>
                        </div>

                        {connectionNotice === 'wrong-domain' && (
                            <div
                                className="rounded-xl border p-4 text-center"
                                style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                            >
                                <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>
                                    Click the link below to open the system
                                </p>
                                <a
                                    href={OFFICIAL_APP_URL}
                                    className="inline-block text-base font-bold underline hover:opacity-80 break-all"
                                    style={{ color: colors.primary }}
                                >
                                    {OFFICIAL_APP_URL}
                                </a>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setConnectionNotice(null)}
                            className="mt-6 w-full py-2.5 rounded-lg font-bold text-sm"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            {connectionNotice === 'wrong-domain' ? 'Close' : 'OK'}
                        </button>
                    </div>
                </div>
            )}

            {showForgotPassword && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="forgot-password-title"
                    onClick={() => setShowForgotPassword(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border shadow-2xl p-6 relative"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setShowForgotPassword(false)}
                            className="absolute top-4 right-4 p-1 rounded-lg hover:opacity-70 transition-opacity"
                            style={{ color: colors.textMuted }}
                            aria-label="Close"
                        >
                            <X size={22} />
                        </button>
                        <h3 id="forgot-password-title" className="text-xl font-bold pr-10 mb-3" style={{ color: colors.textMain }}>
                            Reset your password
                        </h3>
                        <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
                            Contact Abdullah Saleh to reset your password.
                        </p>
                        <div className="space-y-3 text-sm" style={{ color: colors.textMain }}>
                            <p>
                                <span className="font-semibold" style={{ color: colors.textMuted }}>Email: </span>
                                <a
                                    href="mailto:Abdullah.Saleh@as-saas.com"
                                    className="underline hover:opacity-80 break-all"
                                    style={{ color: colors.primary }}
                                >
                                    Abdullah.Saleh@as-saas.com
                                </a>
                            </p>
                            <p>
                                <span className="font-semibold" style={{ color: colors.textMuted }}>Phone: </span>
                                <a
                                    href="tel:+966559990187"
                                    className="underline hover:opacity-80"
                                    style={{ color: colors.primary }}
                                >
                                    +966 55 999 0187
                                </a>
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowForgotPassword(false)}
                            className="mt-6 w-full py-2.5 rounded-lg font-bold text-sm"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
