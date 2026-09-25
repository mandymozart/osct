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
- **Consultation** (entries, entry, Info): black `#000` at **82 % opacity** over the camera image.
- **Onboarding**: black, faded by a **radial luminosity mask**: ellipse ≈ 222 × 404 pt (≈ 425 × 773 px,
  i.e. the whole screen), centre opaque → edge transparent, falloff exponent 2.14. What shows at the edges
  is the layer underneath → **Q4**. CSS approximation:
  `radial-gradient(ellipse 50% 50% at 50% 50%, #000 0%, rgba(0,0,0,.93) 40%, rgba(0,0,0,.65) 70%, rgba(0,0,0,0) 100%)` over the base color.

### Buttons, pills, glass
| Element | Body | Effect | Size |
|---|---|---|---|
| Onboarding button ("Continue", "Grant access", "Access scan") | **opaque black** `#000` | **white glow**: a white shape ~15 px larger on each side, soft-masked by a blurred image (Gaussian) | 79 × 16 pt → 151 × 31 px |
| Consultation pill ("Entries", category) | white shape inside a **Multiply** group → effectively **transparent** | **black drop shadow at 50 %**, blurred (~19 px spread) | 31 × 15 pt → 60 × 29 px |
| "i" button | circle, same Multiply construction → transparent | black shadow, blurred (~15 px) | Ø 17.9 pt → 34 px |
| Spread menu active item (scan) | same Multiply construction | black shadow 50 %, blurred | ~60 × 29 px |

The PDF cannot express a backdrop blur; the **glass** look is Tilman's rule (below, §5).

---

## 2. Typography
- Arial (Regular, Italic for the book title), **8 pt ≈ 15 px**, tracking 0.02 em (Tc 0.02).
- Line height: body **1.25**; table rows and list rows **12.5 pt ≈ 24 px**.
- Rules: 0.5 pt ≈ **1 px**, `#8b8d8c`.

## 3. Sizes and placement
| Element | Measured |
|---|---|
| Mark | **99 × 96 px** on every screen. Onboarding: 88 px from the screen top. Scan: top at −11 px (partly above the edge). Consultation: a **separate, cropped 129 × 20 px image**, 99 × 15 px at the top edge → **Q2** |
| Found indicator image | 171 × 212 px, ~234 px from the top |
| Onboarding text block | gradient box 247 px, centred |

## 4. Differences to the current build (to fix once decided)
- Gold is a flat `--color-accent` today → gradient text (§5).
- Mark 64 px → 99 px; scan position; consultation variant → after Q2.
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

**Recommendation:** A as the default (`.gold` utility) – it is what the PDF does. C if we want a
page-wide sweep later; B only for desktop.

## 6. Buttons and glass (Tilman's rule)
- Body almost transparent: `background: rgba(255,255,255,0.001)` – a **non-zero alpha is required**,
  otherwise browsers skip the backdrop and the layers below are not blurred.
- `backdrop-filter: blur(…)` + `-webkit-backdrop-filter` for the glass.
- Depth only by a **drop shadow**: black on light backgrounds (scan, consultation), white (glow) on the
  black onboarding.
- Text: gold gradient (A).

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
2. **Mark in consultation:** the frames embed a separate, cropped Mark image (only its lower 20 px) at the
   top edge. Intended (Mark "hides" when consulting) or should Mark look the same in both modes?
3. **Mark in scan mode** sits partly above the top edge (−11 px). Intended?
4. **Onboarding background:** black with a radial fade – what color is behind it at the edges?
5. **Glass:** should pills / "i" / the spread-menu highlight blur what is behind them (backdrop blur)? The
   PDF shows transparent bodies with a soft black shadow only.
6. **Spread menu:** inactive items are light grey `#d6d8d8` on the camera image – enough contrast on
   white book pages? Active item: gold gradient text?
7. **Found indicator:** exact shadow (the ellipse below the image) and the "New entry unlocked"
   animation (duration, scale, rotation)?
8. **Type:** Arial 15 px / 0.02 em on all phones, or a smaller size for small screens?
9. **Counter:** grey in scan mode, and in consultation "12 / 150 Entries consulted" – gold or grey?
10. **Final accent color** for the flat uses (focus rings, selection) if any.
