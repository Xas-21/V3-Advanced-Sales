import { useCallback, useRef } from 'react';

/** Mutable token holder (typically `useRef<PropertyLoadGate>({ current: '' }).current`). */
export type PropertyLoadGate = { current: string };

/** Call before await. Returns false if propertyId is empty (caller must not fetch). */
export function beginPropertyLoad(
  gate: PropertyLoadGate,
  propertyId: string | undefined | null
): boolean {
  const pid = String(propertyId ?? '').trim();
  if (!pid) {
    gate.current = '';
    return false;
  }
  gate.current = pid;
  return true;
}

/** Call after await, before setState. Returns false if property switched or cleared mid-flight. */
export function isPropertyLoadCurrent(
  gate: PropertyLoadGate,
  propertyId: string | undefined | null
): boolean {
  const pid = String(propertyId ?? '').trim();
  if (!pid) return false;
  return gate.current === pid;
}

/** Optional React hook wrapping a ref + the two helpers. */
export function usePropertyLoadGate(): {
  gate: PropertyLoadGate;
  begin: (propertyId: string | undefined | null) => boolean;
  isCurrent: (propertyId: string | undefined | null) => boolean;
} {
  const gateRef = useRef<PropertyLoadGate>({ current: '' });
  const begin = useCallback(
    (propertyId: string | undefined | null) => beginPropertyLoad(gateRef.current, propertyId),
    []
  );
  const isCurrent = useCallback(
    (propertyId: string | undefined | null) => isPropertyLoadCurrent(gateRef.current, propertyId),
    []
  );
  return { gate: gateRef.current, begin, isCurrent };
}
