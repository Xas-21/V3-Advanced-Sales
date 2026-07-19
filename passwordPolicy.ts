/** Mirror backend `security.check_password_policy` for client-side validation. */

export function checkPasswordPolicy(pwd: string): { ok: true } | { ok: false; message: string } {
    if (!pwd || pwd.length < 8) {
        return { ok: false, message: 'Password must be at least 8 characters.' };
    }
    const lower = /[a-z]/.test(pwd);
    const upper = /[A-Z]/.test(pwd);
    const digit = /\d/.test(pwd);
    const symbol = /[^A-Za-z0-9]/.test(pwd);
    const categories = [lower, upper, digit, symbol].filter(Boolean).length;
    if (categories < 3) {
        return {
            ok: false,
            message: 'Use at least 3 of: lowercase, uppercase, digit, symbol.',
        };
    }
    return { ok: true };
}
