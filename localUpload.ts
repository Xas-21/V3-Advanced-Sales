import { apiUrl } from './backendApi';

/** Upload result stored on the backend Docker volume (as-uploads-data). */
export interface LocalUploadResult {
    secure_url: string;
    public_id: string;
    original_filename?: string;
    bytes?: number;
    format?: string;
    resource_type?: string;
}

/** Local public_id shape: folder/uuid.ext */
const LOCAL_PUBLIC_ID_RE = /^[a-z0-9_-]+\/[a-f0-9]{32}\.[a-z0-9]{1,8}$/i;

function parseErrorText(raw: string): string {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.detail) {
            if (typeof parsed.detail === 'string') return parsed.detail;
            if (Array.isArray(parsed.detail)) {
                return parsed.detail.map((d: any) => d?.msg || String(d)).join('; ');
            }
        }
        if (parsed?.error?.message) return String(parsed.error.message);
    } catch {
        /* keep original */
    }
    return trimmed;
}

/**
 * Upload a file to the backend Docker volume.
 * folder: 'feed' | 'chat' | 'contracts' | 'requests' | 'general'
 */
export async function uploadFileLocal(
    file: File,
    options?: { folder?: string },
): Promise<LocalUploadResult> {
    const folder = (options?.folder || 'general').split('/').pop() || 'general';
    const form = new FormData();
    form.append('file', file);
    form.append('folder', folder);

    const res = await fetch(apiUrl('/api/uploads/local'), {
        method: 'POST',
        credentials: 'include',
        body: form,
    });
    if (!res.ok) {
        const text = parseErrorText(await res.text());
        throw new Error(text || `Upload failed (${res.status})`);
    }
    return res.json();
}

/** Delete a local upload. No-ops for legacy Cloudinary public ids. */
export async function deleteFileLocal(publicId: string): Promise<void> {
    const pid = String(publicId || '').trim();
    if (!pid || !LOCAL_PUBLIC_ID_RE.test(pid)) return;

    const res = await fetch(apiUrl(`/api/uploads/local?publicId=${encodeURIComponent(pid)}`), {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!res.ok) {
        const text = parseErrorText(await res.text());
        throw new Error(text || `Delete failed (${res.status})`);
    }
}

/** Resolve attachment URLs for display (relative /api/... or absolute https). */
export function mediaUrl(url: string | null | undefined): string {
    if (!url) return '';
    const u = String(url);
    if (/^(https?:|data:|blob:)/i.test(u)) return u;
    return apiUrl(u.startsWith('/') ? u : `/${u}`);
}
