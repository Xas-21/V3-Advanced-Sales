import { describe, expect, it, vi } from 'vitest';
import {
    getAccountProfileGaps,
    isAccountProfileIncomplete,
} from './accountProfileCompleteness';
import * as formConfigurations from './formConfigurations';

describe('accountProfileCompleteness schema reuse', () => {
    it('matches resolve-per-call gaps when using a preloaded schema', () => {
        const account = {
            id: 'A1',
            name: 'Acme',
            type: 'Corporate',
            city: '',
            contacts: [{ firstName: 'Pat', email: 'pat@example.com', phone: '0500000000' }],
        };
        const schema = formConfigurations.getResolvedFormSchema(undefined, 'account_new', undefined);
        const viaResolve = getAccountProfileGaps(account, undefined, undefined);
        const viaPreload = getAccountProfileGaps(account, undefined, undefined, schema);
        expect(viaPreload).toEqual(viaResolve);
        expect(isAccountProfileIncomplete(account, undefined, undefined, schema)).toBe(viaResolve.length > 0);
    });

    it('does not re-resolve schema when resolvedSchema is passed for many accounts', () => {
        const spy = vi.spyOn(formConfigurations, 'getResolvedFormSchema');
        const schema = formConfigurations.getResolvedFormSchema(undefined, 'account_new', undefined);
        spy.mockClear();

        const accounts = [
            { id: 'A1', name: 'One', type: 'T', city: 'Riyadh', contacts: [{ firstName: 'A', email: 'a@x.com', phone: '0501111111' }] },
            { id: 'A2', name: 'Two', type: 'T', city: '', contacts: [{ firstName: 'B', email: 'b@x.com', phone: '0502222222' }] },
        ];
        for (const a of accounts) {
            getAccountProfileGaps(a, 'P1', undefined, schema);
        }
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
