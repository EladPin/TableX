# Mintlify — Style Reference
> Cloud garden over a glass desk. A hand-illustrated sky and a documentation product share the same frame — the only place color and concept collide before the page settles into monastic white.

**Theme:** light

---

## How TableX applies this  *(read this part first)*

TableX was redesigned onto this system on 2026-09-04. The tokens below are the
source of truth and live in `TableX/css/main.css` as CSS custom properties.
Five deliberate deviations, all forced by the app's context:

1. **Heebo carries Hebrew.** Inter is the system's only family, but it has **no
   Hebrew glyphs** — an all-Hebrew UI would silently fall back to whatever the OS
   offers, which is exactly the kind of drift this system exists to prevent.
   Heebo (a neutral grotesque, same skeleton logic as Inter) is loaded alongside
   it and routed by `unicode-range`, so each script picks its own face with no
   markup or class switching. Both are **self-hosted** in `TableX/fonts/` —
   never a CDN, because the machines this runs on have no internet.
   Regenerate with `python tools/build_fonts.py`.

2. **The hero teal is defined here, not taken from the spec.** The spec's
   `--surface-hero-teal: #0c8c5` is a five-digit hex — not a valid color. TableX
   uses a dark teal gradient, `#07281e → #0b4d37`, which is what the reference
   hero actually reads as. Mint `#0c8c5e` stays an accent only, per the rules.

3. **The generated report table is NOT restyled.** Its purple
   (`#4a3f8c` / `#6b5fb5` / `#f0eeff`) is the *deliverable's* palette — it has to
   match what commanders already see in the deck. The Mintlify system governs the
   **app around** the document, not the document itself. Do not "fix" the table
   to match the UI; see CLAUDE.md.

4. **Illustration lives in exactly two places: the hero, and the loader.**
   The spec says "do not use illustration style outside the hero".

   **The hero is not a deviation — it is the spec.** The reference hero *is*
   a hand-illustrated landscape with the product floating in front of it, and
   TableX's hero was a bare gradient until 2026-09-06. It now carries a 184px
   pixel landscape of cell sites at night (`TableX/js/scene.js`), drawn in
   nothing but the hero's own teal ramp and one mint, with the paste card
   planted on its horizon line. Subject matter is the point: hilltop lattice
   towers, a rooftop site, an analysis-point pin and the coverage arcs that
   answer it — the app's own data, not decoration borrowed from elsewhere.

   **The loader is the deviation**: a pixel ghost in mint on white, for the
   2.5 s before the app appears. It is *transient* — the app it uncovers stays
   austere.

   Both are bounded. Do not take either as licence to illustrate the working
   UI below the hero; the whole reason this redesign happened is that the old
   UI read as childish. The scene has a settings switch (**תפאורה / Hero
   scene**) so anyone who disagrees can turn it off, and turning it off
   returns the hero to exactly the height it had before.

5. **There is a dark theme.** The spec is explicit: "Do not set page background
   to anything other than white — no off-white canvas, no dark mode surfaces in
   the content sections." TableX has one anyway, on request. It is implemented
   as a token swap only (`:root[data-theme="dark"]`), so every component still
   has exactly one definition and the light theme remains the reference.

   Two things the swap must never touch, both learned by breaking them:
   - **`--hero-fg`** — the hero band is dark in *both* themes, so text on it
     cannot follow `--paper`. It did at first, and in dark mode the headline
     turned near-black and vanished into the gradient.
   - **`.doc-page`** — hardcoded `#ffffff`, never `var(--paper)`. It is a
     preview of a white PowerPoint slide; in dark mode the chrome inverts
     around it but the sheet stays white, the way a PDF viewer works.

   `--ink` and `--paper` deliberately *swap* roles rather than both darkening:
   `--ink` is the filled-button surface, `--paper` the text on it, so swapping
   inverts the button correctly with no per-component rule.

Everything else follows the spec as written: white canvas (in light theme), one
green, 4px controls / 16px cards / 24px large containers, whisper shadows, no
gradients or glassmorphism outside the hero.

---

Mintlify operates on a near-total monochrome discipline: white canvas, near-black text, and a single vivid green as the only chromatic spark across the entire interface. The hero is the deliberate exception — a hand-illustrated cloud landscape on a dark teal gradient, with the documentation product floating in the foreground as living proof. Everything downstream reverts to austere white surfaces, tight Inter typography, and component geometry that stays square (4px button radii, 16–24px card radii) rather than pill-shaped or overly rounded. Color appears as functional punctuation: green for active states, brand links, and decorative icons; black for the sole filled button variant. Elevation is whispered, never declared — shadows sit at 0.03–0.05 opacity and are felt more than seen.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Mint Green | `#0c8c5e` | `--color-mint-green` | Brand links, active nav state, feature icons, decorative dots in eyebrow labels, the thin underline on inline code references — the only chromatic accent in a monochrome system, applied sparingly to make functional moments feel switched on |
| Ink Black | `#08090a` | `--color-ink-black` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| True Black | `#000000` | `--color-true-black` | Body text, link defaults before hover, icon strokes, and footer rules — the workhorse neutral that carries most of the typography load |
| Paper White | `#ffffff` | `--color-paper-white` | Page canvas, card surfaces, button text on dark fills, input fields — the base layer everything else sits on |
| Mist Gray | `#f2f2f2` | `--color-mist-gray` | Subtle dividers, hairline strokes on cards, low-emphasis backgrounds, and the faintest hover wash |
| Cloud Gray | `#dddddd` | `--color-cloud-gray` | Input borders, card outlines on hover states, secondary divider lines that need a step more visibility than Mist |

## Tokens — Typography

### Inter — Universal typeface · `--font-inter`
- **Substitute:** Inter (Google Fonts) — also try IBM Plex Sans or General Sans.
- **Weights:** 400, 500, 600
- **Sizes:** 13, 14, 15, 16, 18, 20, 24, 40, 57
- **Line height:** 1.10, 1.15, 1.30, 1.33, 1.50, 1.71
- **Letter spacing:** Tight at large sizes: -0.02em at 57px, -0.01em at 40px down through 16px, neutral at 13–14px, +0.05em on the smallest uppercase eyebrow labels
- **OpenType features:** `"ss01" on, "cv11" on`
- **Role:** Universal typeface — headlines, body, nav, buttons, inputs, and code. No display face, no mono override.

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 13px | 1.5 | 0.65px | `--text-caption` |
| body | 16px | 1.5 | -0.16px | `--text-body` |
| subheading | 20px | 1.3 | -0.2px | `--text-subheading` |
| heading-sm | 24px | 1.33 | -0.24px | `--text-heading-sm` |
| heading | 40px | 1.15 | -0.4px | `--text-heading` |
| display | 57px | 1.1 | -1.14px | `--text-display` |

## Tokens — Spacing & Shapes

**Density:** comfortable

Spacing scale: 4, 5, 6, 7, 8, 10, 12, 16, 24, 28, 32, 48, 64, 72, 96, 201 px.

### Border Radius

| Element | Value |
|---------|-------|
| tags | 4px |
| cards | 16px |
| inputs | 4px |
| buttons | 4px |
| largeContainers | 24px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| sm | `lab(2.42579 -0.165291 -0.470081 / 0.03) 0px 2px 4px 0px` | `--shadow-sm` |
| sm-2 | `lab(100 0 0 / 0.05) 0px 2px 4px 0px` | `--shadow-sm-2` |

### Layout

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

## Components

### Primary Filled Button
**Role:** Highest-weight action — the single dark filled button variant in the system.
4px radius, Ink Black (#08090a) background, Paper White text, Inter 14–15px weight 500, padding 8px 16px, the 0.03-opacity shadow.

### Ghost Navigation Button
Transparent background, True Black text, no border, 14px weight 500, hover adds a subtle Mist Gray wash.

### Documentation Product Card
16px radius, white surface, the 0.05-opacity shadow, ~24px internal padding. The product UI rendered as a floating card that bridges the hero into the white page below.

### Feature Capability Card
16px radius, light Mint-tinted background wash, 24px padding, eyebrow label in small-caps Mint Green at 13px letter-spacing +0.05em, body copy in Ink Black at 16px.

### Top Navigation Bar
White background, no bottom border — the nav reads as floating on the page. Logo far left (Mint mark + black wordmark), links in Inter 14px weight 500, ghost + filled buttons right-aligned.

### Eyebrow Label
13px Inter weight 500, Mint Green, letter-spacing +0.05em, uppercase. A category tag, not a heading — always paired with a larger heading below.

## Do's and Don'ts

### Do
- Use Inter for everything — there is no display face or mono override in the system.
- Apply Mint Green (#0c8c5e) only for active states, brand links, decorative icons, and eyebrow labels — never as a large surface fill or button background.
- Set button radius to 4px and card radius to 16px — the system is square, not pill-shaped.
- Tighten letter-spacing to -0.02em at 57px and -0.01em at 40–16px; loosen to +0.05em only on uppercase 13px eyebrow labels.
- Use Ink Black (#08090a) for the filled button background and true black (#000000) for body text — keep these two neutrals in their separate roles.
- Let the hero be the only colorful moment on the page — revert to white surfaces and black text for everything below the fold.
- Limit shadows to 2px offset at 3–5% opacity; if a component needs more separation, use a 1px #dddddd border instead.

### Don't
- Do not introduce pill buttons, 9999px radii, or rounded avatars — the system commits to 4px / 16px / 24px.
- Do not place Mint Green on button fills, large backgrounds, or hero text — it loses identity when used at scale.
- Do not use a second accent color — the monochrome-plus-one-green rule is the brand's anchor.
- Do not set body text below 14px or use a line-height looser than 1.5 — readability is non-negotiable.
- Do not add gradients, glassmorphism, or colored shadows — the elevation language is flat and forensic.
- Do not use illustration style outside the hero — the rest of the site is pure UI.
- Do not set page background to anything other than white — no off-white canvas, no dark mode surfaces in the content sections.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Paper White | `#ffffff` | Page canvas and the dominant background for all content sections after the hero |
| 1 | Mist Gray | `#f2f2f2` | Faint card wash and subtle section separators |
| 2 | Hero Teal | `#07281e → #0b4d37` | The dark hero band — the only colored surface (see deviation 2 above) |
| 3 | Ink Black | `#08090a` | Filled button surface and the darkest UI element |

## Layout

The page opens with a dark hero (teal gradient) carrying a centered headline stack, with a large floating card that overlaps the hero's bottom edge into the white section below — the card acts as the visual bridge between the expressive hero and the austere content sections. Below, a 1200px max-width centered container with 80px section gaps: centered headline + paragraph + card grids (3-column). Navigation is a single horizontal top bar, sticky on scroll, white. The page is spacious — comfortable density, generous breathing room.

## Quick Start — CSS Custom Properties

```css
:root {
  --color-mint-green:  #0c8c5e;
  --color-ink-black:   #08090a;
  --color-true-black:  #000000;
  --color-paper-white: #ffffff;
  --color-mist-gray:   #f2f2f2;
  --color-cloud-gray:  #dddddd;

  --font-inter: 'Inter', ui-sans-serif, system-ui, -apple-system,
                BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  --text-caption: 13px;    --leading-caption: 1.5;    --tracking-caption: 0.65px;
  --text-body: 16px;       --leading-body: 1.5;       --tracking-body: -0.16px;
  --text-subheading: 20px; --leading-subheading: 1.3; --tracking-subheading: -0.2px;
  --text-heading-sm: 24px; --leading-heading-sm: 1.33;--tracking-heading-sm: -0.24px;
  --text-heading: 40px;    --leading-heading: 1.15;   --tracking-heading: -0.4px;
  --text-display: 57px;    --leading-display: 1.1;    --tracking-display: -1.14px;

  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  --page-max-width: 1200px;
  --section-gap: 80px;
  --card-padding: 24px;
  --element-gap: 12px;

  --radius-tags: 4px;
  --radius-cards: 16px;
  --radius-inputs: 4px;
  --radius-buttons: 4px;
  --radius-largecontainers: 24px;

  --shadow-sm:   lab(2.42579 -0.165291 -0.470081 / 0.03) 0px 2px 4px 0px;
  --shadow-sm-2: lab(100 0 0 / 0.05) 0px 2px 4px 0px;
}
```

## Similar Brands

- **Linear** — same single-accent discipline, Inter typography, square-cornered buttons, forensic shadows
- **Vercel** — same near-black ink on pure white, single chromatic moment per page, 4px button radii
- **Resend** — same monochrome-plus-one-accent pattern, product-as-hero composition
- **Notion** — same clean white sections and restrained use of color for functional states only
