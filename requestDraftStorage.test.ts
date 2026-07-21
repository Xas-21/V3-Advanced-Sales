import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  writeNewRequestDraft,
  readNewRequestDraft,
  clearNewRequestDraft,
  confirmDiscardNewRequestDraft,
} from './requestDraftStorage';

const PID = 'P-TEST';

function seedDraft() {
  writeNewRequestDraft({
    propertyId: PID,
    step: 2,
    requestType: 'accommodation',
    accForm: { accountName: 'Acme' },
    evtForm: {},
    updatedAt: Date.now(),
  });
}

describe('confirmDiscardNewRequestDraft', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    clearNewRequestDraft();
  });

  it('returns false and keeps draft when confirm is cancelled', () => {
    seedDraft();
    const ok = confirmDiscardNewRequestDraft(() => false);
    expect(ok).toBe(false);
    expect(readNewRequestDraft(PID)?.requestType).toBe('accommodation');
  });

  it('clears draft and returns true when confirm is accepted', () => {
    seedDraft();
    const messages: string[] = [];
    const ok = confirmDiscardNewRequestDraft((msg) => {
      messages.push(msg);
      return true;
    });
    expect(ok).toBe(true);
    expect(messages).toEqual(['Discard this draft?']);
    expect(readNewRequestDraft(PID)).toBeNull();
  });
});
