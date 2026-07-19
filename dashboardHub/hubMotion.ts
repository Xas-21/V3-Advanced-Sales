import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** Tab-enter: opacity + slight y on root children with [data-hub-animate]. Honors prefers-reduced-motion. */
export function useHubPageEnter(deps: unknown[] = []) {
    const rootRef = useRef<HTMLDivElement>(null);
    useGSAP(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const q = rootRef.current?.querySelectorAll('[data-hub-animate]');
        if (!q?.length) return;
        if (reduced) {
            gsap.set(q, { opacity: 1, y: 0 });
            return;
        }
        gsap.fromTo(
            q,
            { opacity: 0, y: 8 },
            { opacity: 1, y: 0, duration: 0.35, stagger: 0.05, ease: 'power2.out', overwrite: 'auto' },
        );
    }, { scope: rootRef, dependencies: deps, revertOnUpdate: true });
    return rootRef;
}
