# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Nail Shop Management
**Generated:** 2026-10-07 21:16:36
**Category:** Nail salon and spa operations
**Design Dials:** Variance 4/10 (Balanced / Modern) | Motion 3/10 (Subtle) | Density 6/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#E8BFC5` | `--color-primary` |
| Primary hover/pressed | `#D3A1AB` / `#C8949F` | `--color-primary-hover` / `--color-primary-pressed` |
| On Primary | `#51464A` | `--color-on-primary` |
| Secondary | `#DCD6F7` | `--color-secondary` |
| On Secondary | `#51464A` | `--color-foreground` |
| Accent/CTA | `#C8D8C0` | `--color-accent` |
| On Accent/CTA | `#536D4D` | `--color-accent-strong` |
| Background | `#FFF9F5` | `--color-background` |
| Foreground | `#51464A` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#51464A` | `--color-card-foreground` |
| Muted | `#F7EFEB` | `--color-muted` |
| Muted Foreground | `#756A6D` | `--color-muted-foreground` |
| Border | `#F0E6E1` | `--color-border` |
| Success | `#A8C9A0` | `--color-success` |
| Warning | `#F2D49B` | `--color-warning` |
| Error | `#D98989` | `--color-danger` |
| Ring | `#8F5360` | `--color-primary-strong` |

**Color Notes:** Dusty pink + lavender + sage with warm-charcoal text for readable pastel contrast.

### Typography

- **Heading Font:** Manrope
- **Body Font:** DM Sans
- **Mood:** warm, premium, calm, clear, tablet-friendly
- **Google Fonts:** [Manrope + DM Sans](https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');
```

### Spacing Variables

*Density: 6/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 2px 8px rgb(81 70 74 / 0.05)` | Subtle lift |
| `--shadow-md` | `0 10px 24px rgb(81 70 74 / 0.09)` | Cards, buttons |
| `--shadow-lg` | `0 20px 48px rgb(81 70 74 / 0.14)` | Modals, dropdowns |
| `--touch-min` | `48px` | Minimum tablet touch target |
| `--touch-primary` | `56px` | Primary operational action |
| `--touch-kiosk` | `64px` | Customer kiosk action |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #E8BFC5;
  color: #51464A;
  min-height: 56px;
  padding: 0 20px;
  border-radius: 14px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  background: #D3A1AB;
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #8F5360;
  border: 1px solid #F0E6E1;
  min-height: 48px;
  padding: 0 18px;
  border-radius: 14px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FFFFFF;
  border: 1px solid #F0E6E1;
  border-radius: 18px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  min-height: 56px;
  padding: 0 16px;
  border: 1px solid #F0E6E1;
  border-radius: 14px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #D3A1AB;
  outline: none;
  box-shadow: 0 0 0 3px rgb(143 83 96 / 0.18);
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Minimalism & Swiss Style

**Keywords:** Clean, simple, spacious, functional, white space, high contrast, geometric, sans-serif, grid-based, essential

**Best For:** Enterprise apps, dashboards, documentation sites, SaaS platforms, professional tools

**Key Effects:** Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading

### Page Pattern

**Pattern Name:** Hero + Features + CTA

- **Conversion Strategy:** Deep CTA placement. For CTA label text, verify at least 4.5:1 against the button fill; use 7:1 only when the product explicitly targets AAA normal-text contrast. Keep focus and component boundaries independently visible. Disable hero parallax under reduced motion and render its static final state.
- **CTA Placement:** Hero (sticky) + Bottom
- **Section Order:** Hero with headline/image > Value prop > Key features (3-5) > CTA section > Footer

---

## Motion

**Scroll Reveal** (Subtle) — Trigger: scroll (viewport enter) | Duration: 300-400ms | Easing: `power1.out`

```js
gsap.from(el, { opacity: 0, y: 12, duration: 0.35, ease: 'power1.out', scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
```

**Framework notes:** Requires the ScrollTrigger plugin registered once via gsap.registerPlugin(ScrollTrigger); Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Keep the y offset small (8-16px) so it reads as a fade, not a slide
- ❌ Don't reveal below-the-fold content needed for SEO/crawlers as invisible-by-default without a no-JS fallback
- ⚡ toggleActions 'play none none reverse' avoids re-triggering on every scroll direction change

---

## Anti-Patterns (Do NOT Use)


### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
