import { useCallback, useEffect, useRef, useState } from 'react';

type Point = { x: number; y: number };
type Size = { w: number; h: number };

const FAB_SIZE = 56;
const FAB_MARGIN = 20;
const WIN_MIN_W = 480;
const WIN_MIN_H = 360;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Draggable launcher button; defaults to bottom-right of the viewport. */
export function useDraggableFab(storageKey: string) {
  const [pos, setPos] = useState<Point>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { x: -1, y: -1 }; // sentinel: compute on mount
  });
  const dragging = useRef(false);
  const offset = useRef<Point>({ x: 0, y: 0 });

  useEffect(() => {
    if (pos.x >= 0 && pos.y >= 0) return;
    setPos({
      x: window.innerWidth - FAB_SIZE - FAB_MARGIN,
      y: window.innerHeight - FAB_SIZE - FAB_MARGIN,
    });
  }, [pos.x, pos.y]);

  useEffect(() => {
    if (pos.x < 0) return;
    try { localStorage.setItem(storageKey, JSON.stringify(pos)); } catch { /* ignore */ }
  }, [pos, storageKey]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPos({
      x: clamp(e.clientX - offset.current.x, FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN),
      y: clamp(e.clientY - offset.current.y, FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN),
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  return { pos, fabProps: { onPointerDown, onPointerMove, onPointerUp } };
}

type WindowGeom = { x: number; y: number; w: number; h: number };

/** Draggable + resizable floating panel (messenger window). */
export function useFloatingWindow(storageKey: string, defaultW = 1080, defaultH = 720) {
  const [geom, setGeom] = useState<WindowGeom>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    const w = Math.min(defaultW, window.innerWidth - 40);
    const h = Math.min(defaultH, window.innerHeight - 100);
    return {
      x: Math.max(20, (window.innerWidth - w) / 2),
      y: Math.max(20, (window.innerHeight - h) / 2),
      w,
      h,
    };
  });

  const dragRef = useRef<{ active: boolean; ox: number; oy: number }>({ active: false, ox: 0, oy: 0 });
  const resizeRef = useRef<{ active: boolean; sx: number; sy: number; gw: number; gh: number }>({
    active: false, sx: 0, sy: 0, gw: 0, gh: 0,
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(geom)); } catch { /* ignore */ }
  }, [geom, storageKey]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { active: true, ox: e.clientX - geom.x, oy: e.clientY - geom.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [geom.x, geom.y]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    setGeom((g) => ({
      ...g,
      x: clamp(e.clientX - dragRef.current.ox, 0, window.innerWidth - g.w),
      y: clamp(e.clientY - dragRef.current.oy, 0, window.innerHeight - g.h),
    }));
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    resizeRef.current = { active: true, sx: e.clientX, sy: e.clientY, gw: geom.w, gh: geom.h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [geom.w, geom.h]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current.active) return;
    const dx = e.clientX - resizeRef.current.sx;
    const dy = e.clientY - resizeRef.current.sy;
    setGeom((g) => ({
      ...g,
      w: clamp(resizeRef.current.gw + dx, WIN_MIN_W, window.innerWidth - g.x - 8),
      h: clamp(resizeRef.current.gh + dy, WIN_MIN_H, window.innerHeight - g.y - 8),
    }));
  }, []);

  const endResize = useCallback((e: React.PointerEvent) => {
    resizeRef.current.active = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  return {
    geom,
    headerProps: { onPointerDown: startDrag, onPointerMove: onDragMove, onPointerUp: endDrag },
    resizeProps: { onPointerDown: startResize, onPointerMove: onResizeMove, onPointerUp: endResize },
  };
}
