/**
 * Advanced Sales marketing landing — Taste layout + GSAP + shadcn.
 * Wired as the default unauthenticated landing from AS.tsx.
 * Classic landing remains available via onBackToLanding → LandingPage.tsx.
 */
import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, Check, BarChart3, Zap, Globe2, Users, Clock3, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ProductExperienceDemo } from './productDemoKit';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const LOGO =
  'https://res.cloudinary.com/dmydt1xa9/image/upload/v1769032168/Gemini_Generated_Image_4hqpsz4hqpsz4hqp_ukfn6c.png';
const HERO_BG =
  'https://picsum.photos/seed/advanced-sales-hotel-alula/1920/1080';
const SUBSCRIBE_EMAIL = 'Abdullah.saleh-@hotmail.com';

const TEAMS = [
  'Sales',
  'Revenue',
  'Reservations',
  'Meetings & Events',
];

const HERO_FEATURES = [
  {
    icon: BarChart3,
    title: 'Real-time analytics',
    text: 'KPIs, rooms, and MICE revenue in one cockpit — spot softness before stand-up.',
  },
  {
    icon: Zap,
    title: 'Request workflows',
    text: 'Rooms and events move from inquiry to definite without spreadsheet chase.',
  },
  {
    icon: Globe2,
    title: 'Multi-property ready',
    text: 'Switch properties with shared accounts, pipeline, and commercial visibility.',
  },
  {
    icon: Users,
    title: 'Team collaboration',
    text: 'Sales, revenue, and reservations work from the same requests and notes.',
  },
  {
    icon: Clock3,
    title: 'Task follow-through',
    text: 'Owned follow-ups and deadlines stay attached to the deal, not lost in chat.',
  },
  {
    icon: Target,
    title: 'Precision pipeline',
    text: 'CRM funnel and MICE stages that match how hotel commercial teams actually sell.',
  },
] as const;

const PRICING = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49',
    period: '/month',
    blurb: 'Perfect for a single property just getting started.',
    features: ['1 property', 'Up to 5 users', 'Requests & CRM basics', 'Standard support', '1,000 accounts'],
    cta: 'Start Free Trial',
    featured: false,
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$99',
    period: '/month',
    blurb: 'Ideal for growing commercial teams that need more power.',
    features: [
      'Up to 3 properties',
      'Up to 20 users',
      'Advanced analytics & reporting',
      'Priority 24/7 support',
      'MICE & contracts',
      'API access',
    ],
    cta: 'Get Started',
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    blurb: 'For hotel groups with complex portfolios and compliance needs.',
    features: [
      'Unlimited properties & users',
      'Custom reporting dashboards',
      'Dedicated success manager',
      'Advanced security & compliance',
      'SSO integration',
    ],
    cta: 'Contact Sales',
    featured: false,
  },
] as const;

interface Props {
  themes: any;
  currentThemeId: string;
  onOpenLogin: () => void;
  onThemeChange: () => void;
  onBackToLanding?: () => void;
  embedded?: boolean;
}

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

export default function LandingPageTasteMotionPreview({
  themes,
  currentThemeId,
  onOpenLogin,
  onThemeChange,
  onBackToLanding,
  embedded = false,
}: Props) {
  const theme = themes[currentThemeId] || themes.light;
  const colors = theme.colors;
  const rootRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.tm-nav', { y: -20, opacity: 0, duration: 0.45 })
        .from('.tm-hero-bg', { scale: 1.08, duration: 1.4, ease: 'power2.out' }, 0)
        .from('.tm-hero-line', { y: 36, opacity: 0, stagger: 0.1, duration: 0.65 }, 0.15)
        .from('.tm-hero-cta', { y: 18, opacity: 0, duration: 0.45 }, '-=0.25')
        .from('.tm-hero-team', { y: 12, opacity: 0, stagger: 0.05, duration: 0.35 }, '-=0.2')
        .from('.tm-feature-card', {
          y: 28,
          opacity: 0,
          scale: 0.96,
          stagger: 0.07,
          duration: 0.55,
          ease: 'power2.out',
        }, '-=0.35');

      gsap.to('.tm-hero-bg', {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: {
          trigger: '.tm-hero',
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });

      gsap.utils.toArray<HTMLElement>('.tm-reveal').forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 86%', toggleActions: 'play none none none' },
          y: 40,
          opacity: 0,
          duration: 0.7,
          ease: 'power2.out',
        });
      });

      gsap.utils.toArray<HTMLElement>('.tm-shot').forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 80%' },
          y: 56,
          opacity: 0,
          scale: 0.97,
          duration: 0.85,
          ease: 'power3.out',
        });
      });

      gsap.from('.tm-price-card', {
        scrollTrigger: { trigger: '.tm-subscribe', start: 'top 78%' },
        y: 36,
        opacity: 0,
        stagger: 0.12,
        duration: 0.7,
        ease: 'power2.out',
      });
    },
    { scope: rootRef, dependencies: [currentThemeId] }
  );

  const scrollPricing = () => pricingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const choosePlan = (planId: string) => {
    const plan = PRICING.find((p) => p.id === planId);
    const subject = encodeURIComponent(`Advanced Sales — ${plan?.name ?? planId} plan`);
    const body = encodeURIComponent(
      `Hi,\n\nI'm interested in the ${plan?.name ?? planId} plan (${plan?.price}${plan?.period || ''}).\n\nHotel / property:\nName:\nEmail:\nPhone:\n`
    );
    window.open(`mailto:${SUBSCRIBE_EMAIL}?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div ref={rootRef} className="min-h-[100dvh]" style={{ background: colors.bg, color: colors.textMain }}>
      {!embedded && (
        <div
          className="sticky top-0 z-40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 sm:px-6 py-2.5 text-sm"
          style={{
            background: withAlpha(colors.primary, 0.14),
            borderBottom: `1px solid ${withAlpha(colors.primary, 0.3)}`,
            color: colors.textMain,
          }}
        >
          <p>
            <span className="font-semibold" style={{ color: colors.primary }}>Taste + GSAP + shadcn</span>
            <span style={{ color: colors.textMuted }}> — Taste layout · ScrollTrigger · shadcn</span>
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBackToLanding} className="text-xs font-semibold underline-offset-2 hover:underline" style={{ color: colors.textMuted }}>
              Back to live landing
            </button>
            <Button type="button" variant="secondary" size="sm" onClick={onThemeChange}>
              Theme: {theme.name}
            </Button>
          </div>
        </div>
      )}

      <header
        className="tm-nav relative z-30 border-b"
        style={{ borderColor: withAlpha(colors.border, 1), background: withAlpha(colors.bg, 0.92), backdropFilter: 'blur(10px)' }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={LOGO} alt="" className="h-8 w-auto object-contain" />
            <span className="font-semibold tracking-tight truncate" style={{ color: colors.textMain }}>Advanced Sales</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={scrollPricing}>
              Subscribe
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onOpenLogin}
              className="rounded-full font-semibold"
              style={{ background: colors.primary, color: '#111' }}
            >
              Login
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="tm-hero relative min-h-[min(88dvh,820px)] flex items-center overflow-hidden">
          <div
            className="tm-hero-bg absolute inset-0 will-change-transform"
            style={{
              backgroundImage: `url(${HERO_BG})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'saturate(0.85) brightness(0.72)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${withAlpha(colors.bg, 0.4)} 0%, ${withAlpha(colors.bg, 0.72)} 48%, ${withAlpha(colors.bg, 0.96)} 100%)`,
            }}
          />
          <div className="relative w-full max-w-6xl mx-auto px-5 sm:px-6 py-20 sm:py-24 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="text-left flex flex-col items-start w-full">
              <img
                src={LOGO}
                alt="Advanced Sales"
                className="tm-hero-line self-center mb-7 sm:mb-8 h-24 sm:h-28 w-auto object-contain drop-shadow-sm"
              />
              <p className="tm-hero-line text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase mb-4" style={{ color: colors.primary }}>
                Commercial intelligence for hotels
              </p>
              <h1
                className="tm-hero-line text-[2.55rem] sm:text-[3.55rem] font-semibold tracking-tight leading-[1.05] text-balance"
                style={{ color: colors.textMain }}
              >
                Run the hotel commercial floor from one system
              </h1>
              <p className="tm-hero-line mt-5 max-w-xl text-lg sm:text-xl leading-relaxed" style={{ color: colors.textMuted }}>
                Pipeline, rooms, MICE, and execution — built for sales, revenue, and events teams who are tired of chasing updates.
              </p>
              <div className="tm-hero-cta mt-8 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={scrollPricing}
                  className="rounded-full pl-6 pr-2 py-2.5 h-auto font-semibold gap-2"
                  style={{
                    background: colors.primary,
                    color: '#111',
                    boxShadow: `0 16px 40px -16px ${withAlpha(colors.primary, 0.7)}`,
                    transitionTimingFunction: EASE,
                  }}
                >
                  Subscribe
                  <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: withAlpha('#000', 0.12) }}>
                    <ArrowRight size={16} strokeWidth={2} />
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onOpenLogin}
                  className="rounded-full h-auto py-2.5 px-5 font-semibold"
                  style={{
                    color: colors.textMain,
                    background: withAlpha(colors.card, 0.55),
                    borderColor: withAlpha(colors.border, 1),
                  }}
                >
                  Team login
                </Button>
              </div>
              <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: colors.textMuted }}>
                {TEAMS.map((t) => (
                  <li key={t} className="tm-hero-team inline-flex items-center gap-1.5">
                    <Check size={14} strokeWidth={2.25} style={{ color: colors.primary }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {HERO_FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="tm-feature-card group rounded-2xl p-5 text-left transition-transform duration-300 hover:-translate-y-1"
                    style={{
                      background: withAlpha(colors.card, 0.92),
                      border: `1px solid ${withAlpha(colors.border, 1)}`,
                      boxShadow: `0 16px 40px -28px ${withAlpha(colors.primaryShadow || '#000', 0.55)}`,
                      transitionTimingFunction: EASE,
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    <div
                      className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: withAlpha(colors.primary, 0.16) }}
                    >
                      <Icon size={20} strokeWidth={2} style={{ color: colors.primary }} />
                    </div>
                    <h3 className="text-sm font-semibold tracking-tight" style={{ color: colors.textMain }}>
                      {f.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed" style={{ color: colors.textMuted }}>
                      {f.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="pt-2 sm:pt-4 pb-8 sm:pb-12" style={{ background: withAlpha(colors.card, 0.55) }}>
          <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-5">
            <div className="tm-shot space-y-5 sm:space-y-6">
              <div className="max-w-2xl mx-auto text-center px-2">
                <p className="text-[11px] font-semibold tracking-[0.16em] uppercase mb-2" style={{ color: colors.primary }}>
                  Product
                </p>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance" style={{ color: colors.textMain }}>
                  Dashboard, Requests &amp; CRM
                </h2>
              </div>
              <div className="w-full">
                <ProductExperienceDemo
                  theme={theme}
                  compact
                  initialTab="dashboard"
                  title="Advanced Sales"
                />
              </div>
            </div>
          </div>
        </section>

        <Separator className="opacity-40" />

        <section
          ref={pricingRef as any}
          className="tm-subscribe relative py-20 sm:py-24"
          style={{
            background: `linear-gradient(180deg, ${withAlpha(colors.primary, 0.08)} 0%, ${withAlpha(colors.bg, 1)} 100%)`,
          }}
        >
          <div className="max-w-5xl mx-auto px-5 sm:px-6">
            <div className="tm-reveal text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-balance" style={{ color: colors.textMain }}>
                Subscribe for your hotel
              </h2>
              <p className="mt-3 text-sm sm:text-base leading-relaxed" style={{ color: colors.textMuted }}>
                Choose the plan that best fits your commercial team. All plans include a 14-day free trial.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
              {PRICING.map((plan) => {
                const featured = plan.featured;
                return (
                  <div
                    key={plan.id}
                    className={`tm-price-card p-8 rounded-3xl flex flex-col ${featured ? 'md:-translate-y-4 shadow-2xl' : ''}`}
                    style={
                      featured
                        ? {
                            background: colors.primary,
                            boxShadow: `0 0 0 1px ${colors.primary}, 0 25px 50px -12px ${withAlpha(colors.primary, 0.5)}`,
                          }
                        : {
                            background: colors.card,
                            border: `1px solid ${withAlpha(colors.border, 1)}`,
                          }
                    }
                  >
                    <h3
                      className="text-xl font-semibold mb-2"
                      style={{ color: featured ? '#111' : colors.textMain }}
                    >
                      {plan.name}
                    </h3>
                    <div className="flex items-baseline gap-2 mb-4">
                      <span
                        className="text-4xl font-bold tracking-tight tabular-nums"
                        style={{ color: featured ? '#111' : colors.textMain }}
                      >
                        {plan.price}
                      </span>
                      {plan.period ? (
                        <span
                          className="text-sm"
                          style={{ color: featured ? withAlpha('#111', 0.65) : colors.textMuted }}
                        >
                          {plan.period}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className="text-sm mb-8 leading-relaxed"
                      style={{ color: featured ? withAlpha('#111', 0.72) : colors.textMuted }}
                    >
                      {plan.blurb}
                    </p>
                    <ul className="space-y-4 mb-8 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-3 text-sm">
                          <Check
                            className="w-5 h-5 shrink-0 mt-0.5"
                            strokeWidth={2.5}
                            style={{ color: featured ? '#111' : colors.primary }}
                          />
                          <span style={{ color: featured ? withAlpha('#111', 0.92) : colors.textMain }}>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => choosePlan(plan.id)}
                      className="w-full py-3 px-6 rounded-lg font-semibold transition-colors"
                      style={
                        featured
                          ? { background: '#fff', color: '#111' }
                          : {
                              background: withAlpha(colors.primary, 0.22),
                              color: colors.primary,
                            }
                      }
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = featured
                          ? withAlpha('#fff', 0.92)
                          : withAlpha(colors.primary, 0.32);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = featured
                          ? '#fff'
                          : withAlpha(colors.primary, 0.22);
                      }}
                    >
                      {plan.cta}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <footer className="border-t px-5 sm:px-6 py-8" style={{ borderColor: withAlpha(colors.border, 1) }}>
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm" style={{ color: colors.textMuted }}>
            <span>Advanced Sales</span>
            <div className="flex gap-4">
              {onBackToLanding && (
                <button type="button" onClick={onBackToLanding} className="hover:opacity-70">Classic landing</button>
              )}
              <button type="button" onClick={onOpenLogin} className="hover:opacity-70">Login</button>
              <button type="button" onClick={onThemeChange} className="hover:opacity-70">Cycle theme</button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
