import { describe, expect, it } from 'vitest';
import { stripForcedTextColors } from './dashboardHub/richText';

describe('stripForcedTextColors', () => {
    it('removes color and -webkit-text-fill-color from style attrs', () => {
        const html = '<span style="color: rgb(0, 0, 0); font-weight: 600">hi</span>';
        expect(stripForcedTextColors(html)).toBe('<span style="font-weight: 600">hi</span>');
    });

    it('drops empty style attributes', () => {
        const html = '<p style="color:#000000">Marhaba</p>';
        expect(stripForcedTextColors(html)).toBe('<p>Marhaba</p>');
    });

    it('keeps mention markup intact', () => {
        const html = '<span class="rt-mention-chip" data-mention="u1" style="color:#000">@Alice</span>';
        expect(stripForcedTextColors(html)).toContain('data-mention="u1"');
        expect(stripForcedTextColors(html)).not.toMatch(/color\s*:/i);
    });
});
