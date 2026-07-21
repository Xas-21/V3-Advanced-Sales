import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  writeNewRequestDraft,
  readNewRequestDraft,
  clearNewRequestDraft,
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

describe('clearNewRequestDraft', () => {
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

  it('removes a seeded draft so the next new request starts fresh', () => {
    seedDraft();
    expect(readNewRequestDraft(PID)?.requestType).toBe('accommodation');
    clearNewRequestDraft();
    expect(readNewRequestDraft(PID)).toBeNull();
  });
});
