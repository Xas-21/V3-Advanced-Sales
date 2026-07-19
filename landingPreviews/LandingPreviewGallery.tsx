/**
 * Landing preview shell — live LandingPage.tsx stays default.
 * Preview: Taste + GSAP + shadcn (LandingPageTasteMotionPreview).
 */
import React from 'react';
import LandingPageTasteMotionPreview from './LandingPageTasteMotionPreview';

type Props = {
  themes: any;
  currentThemeId: string;
  onOpenLogin: () => void;
  onThemeChange: () => void;
  onBackToLanding: () => void;
};

function withAlpha(hexOrRgba: string, alpha: number): string {
  const c = String(hexOrRgba || '').trim();
  if (c.startsWith('rgba(')) {
    return c.replace(/rgba?\(([^)]+)\)/, (_m, inner) => {
      const parts = String(inner).split(',').map((p: string) => p.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    });
  }
  if (c.startsWith('rgb(')) return `rgba(${c.slice(4, -1)}, ${alpha})`;
  const hex = c.replace('#', '');
  if (hex.length === 3 || hex.length === 6) {
    const full = hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(192, 154, 78, ${alpha})`;
}

export default function LandingPreviewGallery({
  themes,
  currentThemeId,
  onOpenLogin,
  onThemeChange,
  onBackToLanding,
}: Props) {
  const theme = themes[currentThemeId] || themes.light;
  const colors = theme.colors;

  return (
    <div className="min-h-[100dvh]" style={{ background: colors.bg, color: colors.textMain }}>
      <div
        className="sticky top-0 z-50 border-b"
        style={{
          background: withAlpha(colors.primary, 0.12),
          borderColor: withAlpha(colors.primary, 0.28),
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: colors.primary }}>
              Landing preview
            </p>
            <p className="text-xs truncate" style={{ color: colors.textMuted }}>
              Live landing unchanged · Taste layout · GSAP ScrollTrigger · shadcn
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onThemeChange}
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: colors.card, color: colors.primary }}
            >
              Theme: {theme.name}
            </button>
            <button
              type="button"
              onClick={onBackToLanding}
              className="text-xs font-semibold underline-offset-2 hover:underline"
              style={{ color: colors.textMuted }}
            >
              Back to live landing
            </button>
          </div>
        </div>
      </div>

      <LandingPageTasteMotionPreview
        themes={themes}
        currentThemeId={currentThemeId}
        onOpenLogin={onOpenLogin}
        onThemeChange={onThemeChange}
        onBackToLanding={onBackToLanding}
        embedded
      />
    </div>
  );
}
