import { contactDisplayName } from './accountLeadMapping';
import {
    getResolvedFormSchema,
    type FormConfigurationPropertySource,
    type FormSchema,
} from './formConfigurations';

/** True when value is empty or only placeholder punctuation (e.g. ".", "-", "—"). */
export function isPlaceholderOnlyValue(v: unknown): boolean {
    if (v === null || v === undefined) return true;
    const s = String(v).trim();
    if (!s) return true;
    return /^[\s.\-–—_,;:*#@!?/\\|~`"'`+]+$/u.test(s);
}

export function meaningfulAccountValue(v: unknown): boolean {
    return !isPlaceholderOnlyValue(v);
}

/** Normalized email for duplicate matching; empty when placeholder-only. */
export function meaningfulContactEmail(v: unknown): string {
    if (!meaningfulAccountValue(v)) return '';
    return String(v).trim().toLowerCase();
}

/** Normalized phone digits for duplicate matching; empty when placeholder-only. */
export function meaningfulContactPhone(v: unknown): string {
    if (!meaningfulAccountValue(v)) return '';
    const digits = String(v).replace(/\D+/g, '');
    return digits.length >= 6 ? digits : '';
}
function pushGap(gaps: string[], seen: Set<string>, label: string, ok: boolean) {
    if (ok || seen.has(label)) return;
    seen.add(label);
    gaps.push(label);
}

/** Missing profile fields for an account (visible list columns + property-required fields). */
export function getAccountProfileGaps(
    account: any,
    propertyId?: string | null,
    property?: FormConfigurationPropertySource,
    /** When provided, skips getResolvedFormSchema (avoids recloning form config per account). */
    resolvedSchema?: FormSchema | null
): string[] {
    const gaps: string[] = [];
    const seen = new Set<string>();
    const c0 = (account?.contacts && account.contacts[0]) || {};

    pushGap(gaps, seen, 'Account name', meaningfulAccountValue(account?.name));
    pushGap(gaps, seen, 'Segment', meaningfulAccountValue(account?.type));
    pushGap(gaps, seen, 'City', meaningfulAccountValue(account?.city));
    pushGap(gaps, seen, 'Contact person', meaningfulAccountValue(contactDisplayName(c0)));
    pushGap(gaps, seen, 'Phone', meaningfulAccountValue(c0?.phone));
    pushGap(gaps, seen, 'Email', meaningfulAccountValue(c0?.email));

    const schema = resolvedSchema ?? getResolvedFormSchema(propertyId, 'account_new', property);
    for (const sec of schema.sections) {
        for (const field of sec.fields) {
            if (!field.required) continue;
            let ok = true;
            switch (field.id) {
                case 'name':
                    ok = meaningfulAccountValue(account?.name);
                    break;
                case 'type':
                    ok = meaningfulAccountValue(account?.type);
                    break;
                case 'client_tax_id':
                    ok = meaningfulAccountValue(account?.clientTaxId);
                    break;
                case 'city':
                    ok = meaningfulAccountValue(account?.city);
                    break;
                case 'country':
                    ok = meaningfulAccountValue(account?.country);
                    break;
                case 'street':
                    ok = meaningfulAccountValue(account?.street);
                    break;
                case 'website':
                    ok = meaningfulAccountValue(account?.website);
                    break;
                case 'notes':
                    ok = meaningfulAccountValue(account?.notes);
                    break;
                case 'contact_first_name':
                    ok = meaningfulAccountValue(c0?.firstName);
                    break;
                case 'contact_last_name':
                    ok = meaningfulAccountValue(c0?.lastName);
                    break;
                case 'contact_position':
                    ok = meaningfulAccountValue(c0?.position);
                    break;
                case 'contact_email':
                    ok = meaningfulAccountValue(c0?.email);
                    break;
                case 'contact_phone':
                    ok = meaningfulAccountValue(c0?.phone);
                    break;
                case 'contact_city':
                    ok = meaningfulAccountValue(c0?.city);
                    break;
                case 'contact_country':
                    ok = meaningfulAccountValue(c0?.country);
                    break;
                default:
                    ok = true;
            }
            pushGap(gaps, seen, field.label, ok);
        }
    }

    return gaps;
}

export function isAccountProfileIncomplete(
    account: any,
    propertyId?: string | null,
    property?: FormConfigurationPropertySource,
    resolvedSchema?: FormSchema | null
): boolean {
    return getAccountProfileGaps(account, propertyId, property, resolvedSchema).length > 0;
}
