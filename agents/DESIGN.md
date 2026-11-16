# Design spec – 260804 (measured from the PDF)

Source: `reference/design-260804.pdf`. Values below are read from the **vector data** of the PDF
(PyMuPDF: text spans, drawings, patterns, shadings, soft masks) – not from the JPG frames, which are
lossy and show rendering glitches. Measured 2026-09-25.

**Scale:** the phone screen is 205.3 pt wide in the PDF; at an iPhone width of 393 CSS px,
**1 pt ≈ 1.914 px**. All px values below use that factor.

---

## 1. Colors

### Gold = a gradient, never a flat color
Every "gold" text in the PDF is **black text used as a clip for one gradient pattern** (the text color
itself is `#000000`). One linear gradient is used on all 40 pages:

| Position | Color | |
|---|---|---|
| 0 – 3.8 % | `#f5e7c8` | pale champagne (flat) |
| 3.8 → 31.5 % | `#f5e7c8` → `#7f6032` | down to dark bronze |
| 31.5 → 57 % | `#7f6032` → `#d2ae5a` | up to gold |
| 57 → 73.6 % | `#d2ae5a` → `#f3cc94` | up to light gold |
| 73.6 – 100 % | `#f3cc94` | light gold (flat) |

- Direction: **horizontal, left → right**.
- Span: **per element**, not per page. The gradient box is the element's width: text blocks ≈ 129 pt
  (247 px, ~63 % of the screen, centred), buttons 79 pt (151 px), pills 39–52 pt, the entries list
  181 pt (the whole list) – so list titles start near-white on the left and turn gold towards the
  right (frames 17/19/24: not a "consulted" marker).
- CSS equivalent:
  ```css
  --gold-gradient: linear-gradient(90deg,
    #f5e7c8 0%, #f5e7c8 3.8%, #7f6032 31.5%, #d2ae5a 57%, #f3cc94 73.6%, #f3cc94 100%);
  ```
- Note on p.1 (designers): "for now, instead of 'gold', please use a flashy color such as R100% – final
  color still has to be defined". The PDF nevertheless contains this gradient → **question Q1**.

### Greys, white, black
| Token | Value | Used for |
|---|---|---|
| muted | `#8b8d8c` | scan counter "12 / 150", "Pages activated:", consultation labels (Entry name, Access page …), 0.5 pt rules |
| inactive | `#d6d8d8` | spread menu items that are not active |
| text-on-dark | `#ffffff` | consultation values, entry body, Info text |
| black | `#000000` | onboarding button body, shadows |

### Backgrounds
- **App** (behind the camera and every page): black `#000` (`--app-background`, `html`/`body`, `color-scheme: dark`).
- **Consultation** (entries, entry, Info): black `#000` at **82 % opacity** over the camera image.
- **Onboarding**: black, faded by a **radial luminosity mask**: ellipse ≈ 222 × 404 pt (≈ 425 × 773 px,
  i.e. the whole screen), centre opaque → edge transparent, falloff exponent 2.14. What shows at the edges
  is the layer underneath → **Q3**. CSS approximation:
  `radial-gradient(ellipse 50% 50% at 50% 50%, #000 0%, rgba(0,0,0,.93) 40%, rgba(0,0,0,.65) 70%, rgba(0,0,0,0) 100%)` over the base color.

### Buttons, pills, glass
| Element | Body | Effect | Size |
|---|---|---|---|
| Onboarding button ("Continue", "Grant access", "Access scan") | **opaque black** `#000` | **white glow**: a white shape ~15 px larger on each side, soft-masked by a blurred image (Gaussian) | 79 × 16 pt → 151 × 31 px |
| Consultation pill ("Entries", category) | white shape inside a **Multiply** group → effectively **transparent** | **black drop shadow at 50 %**, blurred (~19 px spread) | 31 × 15 pt → 60 × 29 px |
| "i" button | circle, same Multiply construction → transparent | black shadow, blurred (~15 px) | Ø 17.9 pt → 34 px |
| Spread menu active item (scan) | same Multiply construction | black shadow 50 %, blurred | ~60 × 29 px |

The PDF cannot express a backdrop blur; the **frosted glass** look is confirmed by Tilman (§6, Q4).

---

## 2. Typography
Measured from the design of 2026-11-13 (`261113_Application_AR_Rudy.pdf`, p. 1, 2, 5 and the frames that use
Areal: 8–16, 23). The phone screenshots there are 204.5 pt wide for a 393 px screen → **1 pt ≈ 1.92 px**.

- Font **ABC Areal** by Dinamo (`ABCArealSuperfamilyVariable` in the PDF), extra tracking **40** = **0.04 em**
  (Tc 0.04, p. 5). The reader loads the variable WOFF2 (weights 400–700) and the Regular Italic from the CDN font
  folder (`docs/content-cdn.md`, #278); **Arial** is the fallback until they load or when they cannot. Latin only:
  the Japanese release needs its own font (open). Before 2026-11-16: Arial, tracking 0.02 em.
- **Two sizes only** (p. 2):

  | Size | Measured | Token | Used for |
  |---|---|---|---|
  | **Medium** | 8 pt ≈ 15.4 px → **1 rem (16 px)** | `--text-size` | titles, body text, buttons, the category menu labels, the "i" |
  | **Small** | 6 pt ≈ 11.5 px → **0.75 rem (12 px)** | `--text-size-small` | captions, the consulted counter under the Mark, the install note and settings hints, the "skip" link |

  Medium is rounded up to 1 rem – "type size slightly bigger" than the old 15 px (p. 1). Before 2026-11-16: 15 / 13 px.
- Line height ("leading slightly bigger", p. 1): body **11 pt on 8 pt = 1.375** (`--text-line`, entry text p. 23);
  centred short texts – onboarding steps, camera notices – **12.5 pt on 8 pt = 1.5625** (`--text-line-loose`, p. 8–16);
  Small lines measure 8 pt on 6 pt (1.33) – they keep the line height of their parent. Table rows and list rows
  **12.5 pt ≈ 24 px** (`--row-height`). Before 2026-11-16: 1.25.
- Rules: 0.5 pt ≈ **1 px**, `#8b8d8c`.

## 3. Sizes and placement
| Element | Measured |
|---|---|
| Mark | **99 × 96 px** on every screen, the **same Mark** in scan and consultation (the cropped 129 × 20 px image in the consultation frames is a PDF export error – Tilman). Onboarding: 88 px from the screen top. Scan: top at −11 px (partly above the edge) → **Q2**. Scan and consultation: top **1 rem** below the top of the page area, level with the "i" (Tilman, 2026-09-27) |
| Info button "i" | Ø 34 px, top right corner, **the same gap above and to the right** (≈ 16 px, frame 20); the gap counts from the top of the page area, below the status bar (Tilman, 2026-09-27 – the earlier 4.55 rem was measured from the device top, status bar included) |
| "Entries" pill | top edge **3.75 rem** below the top of the page area (centre ≈ 4.7 rem), left 1.25 rem = the text column (frame 20, Tilman 2026-09-27 – the earlier 6.4 rem was measured from the device top) |
| Consultation content top | the same on every consultation screen, from the top of the page area: entry and Info **8.5 rem** (first rule; frames 15, 20, 21, 33); entries list **10.75 rem**, 1 rem below the "Entries consulted" counter (frame 17) – `--consultation-top`, `--consultation-top-counter` (Tilman, 2026-09-27; was 11.5 rem) |
| Found indicator image | 171 × 212 px, ~234 px from the top |
| Onboarding text block | gradient box 247 px, centred |

### 3a. Vertical grid – six rows (#295, measured 2026-11-16)
From `261113_Application_AR_Rudy.pdf`, frames 6–14 (splash and onboarding; 1 pt ≈ 1.92 px). The page area runs from
below the status bar (y 90 pt) to the top of the browser's bottom bar (y 434 pt): **344 pt ≈ 661 px**, divided into
**six equal rows of 57.3 pt ≈ 110 px** – no gutters, no extra margins; the safe areas lie outside.

| Row | Holds (measured) |
|---|---|
| 1 | the icon, centred horizontally, its centre at 24.5 pt of the 57.3 pt row (`--onboarding-icon-centre` .43); the eye placeholder measures 102.75 × 44 pt with its glow → 12.33 × 5.28 rem (`--onboarding-icon-width/-height`, #281) |
| 2 | empty – the onboarding illustration where a step has one (the intro's drawing; the camera drawing is gone since #281) |
| 3–4 | title and text from the **top of row 3** (first line box at 203 pt vs. the row at 204.7 pt): book title + author, the onboarding texts |
| 5 | the button (label at 320.7 pt) or the footer "Building Fictions" (317.6 pt) from the **top of row 5** (319.3 pt) |
| 6 | empty |

Tokens (`main.css`): `--grid-row` = max(`--grid-row-min`, (100dvh − safe areas) / `--grid-rows`); `--grid-top`,
`--grid-bottom` = the safe-area insets. **Minimum row 6 rem** (the Mark's 96 px): on short or landscape screens the
rows stop shrinking and the page scrolls. A text longer than rows 3–4 pushes the button down (1.5 rem gap).
The rest of the app (header, scroller, consultation, Info) only where it comes naturally (later issues).
Debug overlay: dev tools → "Grid" (`<html data-row-grid>`).

**Icon and motion (#281, design p. 4–14):** splash and onboarding show the eye placeholder
(`public/assets/ui/onboarding/icon.png`, cut from the PDF's eye with its soft shadow; replace the file when Kévin's icon
arrives), the header keeps the Mark. The splash shows icon and title at once; author and publisher fade in together
after 1 s, over 1 s. The onboarding steps do not fade: the button shows the next step at once. The camera notice during
onboarding uses the same grid (icon row 1, text from row 3, buttons from row 5).

### Details (moved from code comments, 2026-09-28)
| Element | Value |
|---|---|
| Category pill and its open menu | width **52.5 pt ≈ 100 px** (`--category-width`, frames 17, 18); menu corner radius **12 pt** (1.45 rem) |
| Pill / "i" glow | bronze `#957149` (frame 17) → `--shadow-bronze`; open category menu: grey `#8b8d8c` (frame 18) → `--shadow-grey` |
| Mark image margin | the drawing starts 14 of 125 px below the top of `scan.png` → `--mark-inset-top`; the header pulls the Mark up by it |
| Entries list top | 1 rem below the "Marginalia consulted" counter (#283: close under the icon, small, gold; consultation only), which ends at 9.75 rem under the Mark. Info uses the list's positions: the "Entries" pill where the category pill is, the text where the list starts |
| Info page groups | the first section of a group has no top padding (sits right below the group title); the last has no bottom rule (the next group title brings its own) |
| Switch rows | `.switch-row` min-height 4 rem, .5 rem padding top/bottom – each option stands alone, two text lines fit |
| Language options | the current choice: thin gold inset ring on top of the bronze pill glow (`aria-current="true"`) |
| Info logo | `bf.svg` is white on transparent – only works on the black page |
| Debug line (dev) | lies over the page and moves nothing, as in the final app |

## 4. Differences to the build before 2026-09-25 (applied on 2026-09-25 unless noted)
- Gold is a flat `--color-accent` today → gradient text (§5).
- Mark 64 px → 99 px (same Mark in all modes) ✓; scan position (−11 px) → after Q2 (kept at the top edge).
- Consultation background `rgba(38,38,38,.94)` → `rgba(0,0,0,.82)`.
- Pills/"i" have a dark fill today → transparent body + blurred black shadow (+ glass, §5).
- Onboarding button: body black ✓, glow approximated with `box-shadow` → keep, tune to ~15 px spread.
- Body text size 13.6 px → 15 px; list rows 24 px; rules `#8b8d8c`.
- Spread menu: inactive `#d6d8d8`, active = gold gradient text in a glass pill.
- Scan counter is **grey** `#8b8d8c`, not gold.

---

## 5. Gold text – options
All options use `--gold-gradient` from §1.

| # | Technique | Matches the PDF | Notes |
|---|---|---|---|
| A | `background: var(--gold-gradient); background-clip: text; color: transparent` **per element** | ✅ exactly (per-element span) | Simple, works everywhere (`-webkit-background-clip`). Multi-line text: the gradient spans the box width, each line gets the same left→right sweep – as in the PDF. |
| B | Same as A + `background-attachment: fixed` → one **page-wide** gradient | – (page-wide) | Neat, but `fixed` is ignored / broken on iOS Safari and inside transformed or scrolling containers. Not reliable on phones. |
| C | Page-wide via offset: `background-size: 100vw 100%` and `background-position-x: calc(-1 * var(--x))`, where `--x` = the element's left edge (tiny helper with `ResizeObserver` / on layout) | – (page-wide) | Works on iOS; needs a few lines of JS per gold element (or one observer for all). |
| D | Mask a page-wide gradient layer with the text (`mask-image` of an SVG/canvas text rendering) | – | Heavy, fragile with dynamic text. Not recommended. |
| E | White text + a full-screen gradient layer on top with `mix-blend-mode: multiply` | – | Tints everything under the layer, not only text; needs isolation. Not recommended. |
| F | SVG `<text>` / icons with `gradientUnits="userSpaceOnUse"` | ✅ for SVG | Only for SVG content – used for the camera icon and illustrations (gold chrome + sweep). |

**Animated variant** (like the camera): a second, narrow highlight gradient over A, moved with
`background-position` (`@keyframes`), off with `prefers-reduced-motion`. Use sparingly (e.g. "New entry
unlocked", illustrations), not for body text.

**Shimmer (#280, design p. 5 "animated gold … on the font")**: `.gold.shimmer` – the light band
`--gold-shimmer` (110°, transparent → `rgba(255, 248, 230, .95)` → transparent over 20 % of a 300 % wide layer) laid
over `--gold-gradient` and moved left → right with `background-position` only: one sweep in 60 % of
`--shimmer-duration` (4 s), then a pause. Used on the book title of the splash and "New marginalia unlocked"; all
other gold text stays still. Primary labels use the same band without a pause (`--shine-duration`, 1.8 s, §6).
Reduced motion: no band.

**Recommendation:** A as the default (`.gold` utility) – it is what the PDF does. C if we want a
page-wide sweep later; B only for desktop.

## 6. Buttons and glass (Tilman's rule)
- Body almost transparent: `background: rgba(255,255,255,0.001)` – a **non-zero alpha is required**,
  otherwise browsers skip the backdrop and the layers below are not blurred.
- `backdrop-filter: blur(…)` + `-webkit-backdrop-filter` for the glass.
- Depth only by a **drop shadow**: black on light backgrounds (scan, consultation), white (glow) on the
  black onboarding.
- Text: gold gradient (A).

### Primary / secondary (Tilman, 2026-09-25)
- **Primary** (Continue, Grant access, Access scan, Start, Resume): `.primary` on `.button` / `.pill` – the
  gold label **shines** (highlight band sweeping through the gradient, like the gold illustrations) and a
  gold highlight **runs along the border** (skeleton-loader sweep), 1.8 s; off with reduced motion.
- **Secondary** (Tutorial, Dismiss, Skip, Entries, category): no animation; the black onboarding
  button gets the softer glow (`--shadow-glow-soft`).

## 6b. Loading
Startup loader (`index.html`) and loading page: `--loading-background` (the consultation darkness with a
slight vignette) + `.gold-spinner` (gold gradient ring) in the centre – Tilman, 2026-09-25. The tracking
engine shows no loading UI of its own.

**Scanning indicator** (Tilman, 2026-09-25; it replaced MindAR's white corner brackets): a thin circle whose
gold fades in from transparent and sweeps around (`.gold-scanning`, `#osct-scanning` in index.html). The AR
scene reports `scanning` and `<ar-bridge>` toggles `.hidden` on it (shown while no target is in view); it only shows while the scene runs
(`body.scene-active`).

## 7. Style architecture (no CSS mess)
- **Tokens** only in `main.css` (`:root`): gold stops + `--gold-gradient`, greys, backgrounds, shadows,
  blur, type scale, spacing. No literal colors in components.
- **One shared stylesheet** of primitives (`.gold`, `.button` (onboarding), `.pill` / `.icon-button`
  (glass), `.rule-table`, `.muted`, `.section-title`) as a constructable `CSSStyleSheet`, adopted by
  every shadow root (`shadowRoot.adoptedStyleSheets = [designSheet, …]`) – one definition, no copies.
- Components keep **layout only** (position, spacing).
- **`<gold-illustration>`**: one component for animated gold SVG art (camera icon, onboarding
  illustrations): path data in, gold chrome + sweep out.

---

## 8. Questions for the designers
1. **Gold:** the PDF uses a gold gradient (`#f5e7c8 → #7f6032 → #d2ae5a → #f3cc94`, left → right per
   element), p.1 asks for a flashy placeholder instead. Is this gradient the intended final look? Per
   element (as in the PDF) or one gradient across the whole screen?
2. **Mark in scan mode** sits partly above the top edge (−11 px). Intended?
3. ~~**Onboarding background:** black with a radial fade – what color is behind it at the edges?~~
   **Measured from the frames (2026-09-26):** #000 centre, #070707 half way, #0c0c0c at the side edges,
   #1a1a1a in the corners → `--onboarding-background` (radial, farthest-corner). The former guess (#1c1c1e
   behind a screen-sized ellipse) showed grey at the sides (Tilman).
4. ~~**Glass:**~~ **answered (Tilman, 2026-09-25): yes, frosted look** – pills, "i" and the spread-menu
   highlight blur what is behind them (`--glass-blur`).
5. **Spread menu:** inactive items are light grey `#d6d8d8` on the camera image – enough contrast on
   white book pages? Active item: gold gradient text?
6. **Found indicator:** exact shadow (the ellipse below the image) and the "New entry unlocked"
   animation (duration, scale, rotation)?
7. **Type:** Arial 15 px / 0.02 em on all phones, or a smaller size for small screens? → since 2026-11-16 Areal 16 / 12 px, 0.04 em, the same on all phones (§2, #279).
8. **Counter:** grey in scan mode, and in consultation "12 / 150 Entries consulted" – gold or grey?
9. **Final accent color** for the flat uses (focus rings, selection) if any.

---

## 9. Editor: sections and toggles (Tilman, 2026-10-31, #233)
*"In principle in the UI: such things can be collapsed and, where possible, toggled."* The editor's own rule, next to
RULES #32 (the Scutoons dogma, the editor tokens):
- **A group of settings is a collapsible section** (`editor/src/lib/components/Section.svelte`): a head with the chevron
  and the group's name; closed, the head adds its values in one line (*bloom · strength 0.35* – the values set away from
  the default, at most two, else the first), so closed hides nothing that matters. The open state is kept per section.
- **What can be switched as a whole has a toggle in its head** (`Section` with `enabled` / `onenabled`): the switch
  (`Toggle.svelte` – the editor's one boolean control, the same in a row) sits in the head before the group's other
  actions (↑ ↓, remove), and works without opening the section. Off dims the name and keeps every
  value – in the content it is `enabled: false`, never a removal.
- **Nested** (a section inside a section, `nested`): the name reads as a name (the text colour, normal case), the line
  above it dotted – the outer heads stay the small capitals.
- **Every on/off is a switch** (#241): a boolean row, an option in a confirmation, a role per user, a snap target – the
  `Toggle`, never an on/off `Segmented`, a pressed pill, a pill that reads *on* / *off* or an icon button. Its label is the
  row's word; `words` only where the value has its own (a variable's *false* / *true*, a quiet value after the track).
- **The switch is a track with a knob** (#243, the reader's `<gold-switch>` is its model): a `<button role="switch">`
  with `aria-checked`; Space and Enter flip it, once per press. The track 1.875 × 1.125rem with a 1px `--line` border on
  `--control-background`, fully round – the one round control in the square editor; the knob a .75rem circle .125rem from
  the edge, `--muted` while off. On: the track fills with `--text`, the knob turns `--surface` and slides right by
  .875rem (.15s, none with reduced motion) – so it inverts with the scheme. Hover (a pointer) darkens the off track's
  border to `--muted`; the focus ring (2px `--text`) goes round the track; disabled dims to .45 with a not-allowed cursor.
  The button is the hit area: `--control-height` high and at least as wide (44px on touch), the track at its start. Choices stay `Segmented`, actions stay buttons, open / closed
  stays the chevron. The reader's dev tools use the same shape in their green (`debugSwitch`: a `#0f0`
  track, filled while on, the knob `#070` → black), the reader's settings `<gold-switch>`.
- Applied so far: each post-processing pass (head toggle); the #241 rows (`agents/MEMORY.md`, 2026-10-31). The other
  section toggles are follow-ups (`agents/MEMORY.md`, 2026-10-31, #233).
