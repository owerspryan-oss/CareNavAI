# DESIGN_SYSTEM.md

The single source of truth for how CareNav AI looks, feels and moves. Derived from the **agreed, product-owner-approved mockups and logo in `Brand/`** — this file does not invent a new aesthetic, it codifies the one already agreed, so every epic builds consistent UI without re-deriving style decisions screen by screen.

Read this alongside `CONTEXT.md` (what to build) and `CLAUDE.md` (engineering rules) before touching any UI code. The Apple Design skill (`.claude/skills/apple-design/SKILL.md`) supplies the *interaction/motion* layer on top of the static system described here — see §8.

**Source files:**
- `Brand/CareNav AI Heart Chat Logo.png` — logo lockup
- `Brand/CareNav AI App Walkthrough Screens.png` — four agreed mockup screens (landing, guided prep step, post-appointment result, urgent message)

**On precision:** colors below were extracted by pixel-sampling the agreed PNG mockups (no Figma/export file exists yet in this repo). They're accurate enough to build from and visually match the mockups, but buttons in the source images carry a subtle glossy/gradient shading, so sampled hex varies by a few percent depending on exact pixel. Treat the values here as the system; if a designer later supplies exact brand hex (e.g. from a design tool), update `design/tokens.css` and this file together rather than letting them drift apart.

---

## 1. Brand identity

**Logo:** a coral, rounded-square speech bubble containing a white heart, overlapped behind by a teal speech bubble (the "second voice" — the app listening back), followed by the wordmark "CareNav" in dark ink and "AI" in coral.

- **Icon mark alone** (bubble + heart, no wordmark) is used as the app icon / favicon and small UI badges.
- **Full lockup** (icon + wordmark) is used on the landing/guest screen header and anywhere the product is introduced standalone.
- **Clear space:** keep at least the height of the heart icon as empty margin on all sides of the lockup.
- **Don'ts:** never recolor the heart or bubbles, never place the lockup on a busy illustration, never stretch non-uniformly, never use the coral "AI" wordmark color for body text (reserve it for the brand mark itself).

**Brand personality:** warm, calm, reassuring, plain-spoken — closer to a caring companion than a clinical system. The illustration style (soft rounded figures, leafy plant motifs) reinforces this on low-stakes screens; it never appears on safety-critical screens (follow-up questions, results, urgent messages), which stay typographic and iconographic only.

---

## 2. Color system

All values are light-mode. **Dark mode has not been designed** — flag this as an open item (see §10) before building a dark theme; don't improvise one.

### Core palette

| Token | Hex | Used for |
| --- | --- | --- |
| `--color-bg` | `#F8F3EC` | App background (cream) |
| `--color-surface` | `#FDFAF5` | Cards, input fields, banners-on-cream |
| `--color-surface-muted` | `#F3EFE8` | Secondary pills (language picker, back button), dividers |
| `--color-ink` | `#0B1216` | Primary text (headings, body) — near-black, not pure black |
| `--color-ink-muted` | `#5B6670` | Secondary/helper text, captions |
| `--color-border` | `#E4DED3` | Hairline borders on cards/inputs |

### Brand accents

| Token | Hex | Used for |
| --- | --- | --- |
| `--color-coral-100` | `#FBDED1` | Pale coral tint (icon badges, highlight chips) |
| `--color-coral-400` | `#FD8A6E` | Hover/active tints, progress-bar filled segments |
| `--color-coral-500` | `#F2654B` | **Primary accent** — primary buttons, active tab, links on dark |
| `--color-coral-600` | `#E8543E` | Primary button pressed state, urgent CTA ("I understand, continue") |
| `--color-teal-100` | `#D6EDE6` | Pale teal tint (info banners, secondary icon badges) |
| `--color-teal-500` | `#1F6F6B` | **Secondary accent** — secondary button fill ("Understand what I was told"), secondary links ("Start again") |
| `--color-teal-700` | `#14504C` | Secondary button pressed state |

### Semantic / status colors

| Token | Hex | Used for |
| --- | --- | --- |
| `--color-info-bg` | `--color-teal-100` (`#D6EDE6`) | "This is a draft to help you prepare" style informational banners |
| `--color-info-icon` | `--color-teal-500` | Info banner icon |
| `--color-caution-bg` | `#FBEAC4` | "Draft — please check with a pharmacist or GP" banner |
| `--color-caution-icon` | `#ED9F33` | Caution banner icon/text |
| `--color-highlight-bg` | `#F8E3AA` | Inline highlighted phrase background (grounded claims in result view) |
| `--color-urgent-bg` | `#FBDED5` | Urgent message top banner + warning illustration tint |
| `--color-urgent-icon` | `--color-coral-600` (`#E8543E`) | Urgent triangle icon, urgent CTA button |

**Deliberate brand choice:** CareNav AI does not use a separate "danger red" hue. Urgent/caution states are built from the *same warm coral/amber family* at higher saturation, paired with a pale tinted banner and an exclamation icon — reinforcing "concern" rather than "alarm," consistent with the product's reassuring tone (and with `CLAUDE.md` rule #3: urgent messages are static content, never AI-styled, so the color system must carry the seriousness on its own).

### Contrast check (WCAG AA, 4.5:1 for body text)

| Pairing | Ratio | Pass? |
| --- | --- | --- |
| `--color-ink` on `--color-bg` | ~17.8:1 | ✅ |
| White text on `--color-coral-500` | ~3.1:1 | ⚠️ borderline — use white text only at ≥18px/bold (large-text threshold is 3:1), or darken to `--color-coral-600` for small text on buttons |
| `--color-caution-icon` on `--color-caution-bg` | ~2.6:1 | ❌ fails for text — only ever use this pairing for the icon glyph, not for caution body copy (body copy on caution banners must use `--color-ink`, as in the mockup) |
| `--color-ink` on `--color-urgent-bg` | ~15.9:1 | ✅ |

This table itself is a deliverable of "thorough" — don't let a future component accidentally pair caution-icon color with caution-bg for text.

---

## 3. Typography

The mockups use a **bold geometric sans for headings** and a **clean humanist sans for body/UI text** — not a single rounded display face. Per the Apple Design skill's typography guidance (§15 of that skill), default to the system font stack rather than shipping a custom webfont, since it already ships correct optical sizing and legibility tuning, and keeps the app fast on a demo machine:

```css
:root {
  --font-sans: -apple-system, "SF Pro Text", "Segoe UI", system-ui, "Inter", sans-serif;
}
```

If a closer match to the mockup's heading face is wanted later, **Inter** or **Manrope** at weight 700–800 are the nearest open-license substitutes — don't introduce a webfont without checking this against the product owner first (it's a visible brand decision, not a code-level one).

### Scale

| Token | Size / Line-height | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `--text-display` | 28px / 1.15 | 700 | -0.01em | Screen headline ("Let's get ready for your appointment.") |
| `--text-title` | 20px / 1.25 | 700 | -0.005em | Section headings ("Here's what your letter means…") |
| `--text-body` | 16px / 1.5 | 400–500 | 0 | Body copy, questions, banner text |
| `--text-caption` | 13px / 1.4 | 400 | 0.01em | Helper text, timestamps, "Guest mode — nothing is saved" |
| `--text-button` | 16px / 1 | 600 | 0 | Button labels |

Follows the Apple Design rule: tighten tracking as size increases, loosen (slightly positive) at caption size, build hierarchy from weight + size + leading together rather than size alone. Scale with `rem`, not fixed `px`, so the layout survives the user's OS text-size setting.

---

## 4. Spacing & layout

8pt base grid, inferred from the mockup's button/card paddings:

| Token | Value |
| --- | --- |
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |

- Screen horizontal margin: `--space-4` (16px) on mobile.
- Stack spacing between major blocks (heading → body → actions): `--space-5`–`--space-6`.
- Button internal padding: `--space-4` vertical-ish (≈14px) × `--space-5` horizontal.

## 5. Corner radius & elevation

| Token | Value | Use |
| --- | --- | --- |
| `--radius-pill` | 999px | Primary/secondary buttons, chips, segmented control, language picker |
| `--radius-card` | 20px | Cards, banners, input boxes, illustration frame |
| `--radius-badge` | 999px (circle) | Icon badges (lungs/pill/heart circles) |

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-button` | `0 6px 16px rgba(242,101,75,0.28)` | Under filled coral/teal buttons — colored, soft, matches the button hue (not a generic gray shadow) |
| `--shadow-card` | `0 2px 8px rgba(11,18,22,0.06)` | Cards/banners on cream background |

---

## 6. Iconography & illustration

- **Icons:** simple rounded-stroke line icons (SF Symbols-style weight), always inside a filled circular "badge" sized ~36px, tinted with the relevant accent (`--color-teal-100` for clinical/neutral topics, `--color-coral-100` for medication, a soft rose tint for care/follow-up topics). One icon per list row in the result view, never decorative icons on safety-critical copy.
- **Illustration:** flat, rounded, warm character illustration (the guest-screen portrait + plant motifs) is reserved for **low-stakes onboarding/empty states only** — per `CLAUDE.md` rule #3, it must never appear anywhere near urgent messaging or AI-generated result content, to keep "static safety content" visually distinct from "friendly app chrome."

---

## 7. Components

Each entry: what the mockups show, states to design for beyond what's pictured, and which epic owns it.

### Buttons
- **Primary** (coral-500 fill, white text, pill radius, colored shadow): main CTA per screen ("Prepare for my appointment", "Next", "I understand, continue"). Pressed → coral-600, shadow flattens (see motion §8).
- **Secondary** (teal-500 fill, white text): the "other" journey choice on landing; also usable as a secondary action alongside a primary one.
- **Tertiary/outline** ("Back", "Save as PDF"): surface-muted fill or 1px border, ink text — never competes visually with the primary button on the same row.
- **Text link** ("Start again"): teal-500, no fill, used only for low-commitment/reversible actions (Apple Design principle: agency + forgiveness).
- *States needed beyond mockup:* disabled (ink-muted text, surface-muted fill, no shadow), loading (spinner replaces label, same footprint — no layout shift).
- *Owners:* shared component, used by all epics; defined once in a common UI package, not re-implemented per epic.

### Chips / suggestion pills
Rounded pill, surface-muted fill, ink text, used for example follow-up questions. Tappable → fills the input above. **Epic: `epic-prepare`.**

### Segmented control / tabs
"Simple English" / "English (for your doctor)" — pill-shaped two-way switch, active segment gets coral-500 fill + white text, inactive gets surface-muted + ink text. Thumb slides (don't cross-fade) between the two — see motion §8. **Epic: `epic-understand`, reused by `epic-language` for any other toggle between output modes.**

### Progress stepper
Row of short pill segments, filled coral-400 up to current step, surface-muted beyond. Paired with "Step X of Y" caption below, left-aligned. **Epic: `epic-prepare`.**

### Banners (info / caution / urgent)
Full-width rounded card, icon + text, color per §2 semantic table. Urgent banner is **pinned, persistent** (per `CLAUDE.md` rule #4/#11 — stays visible on result + PDF, carries the "DRAFT — NOT CLINICALLY APPROVED" label). Never mix banner types on one screen. **Epic: `epic-safety`** owns the component and all copy; other epics only consume it, never restyle or regenerate its text.

### Input field with voice capture
Surface card, placeholder text, inline mic button (coral circle, white mic icon) anchored bottom-right. Mic press → see motion §8 (continuous waveform/listening feedback, not just a static icon swap). **Epic: `epic-prepare`** (text/voice intake), reused by **`epic-understand`** for letter-text confirmation.

### List item with grounding disclosure
Icon badge + headline sentence with an inline highlighted phrase (`--color-highlight-bg`) + a "Show source ⌄" disclosure chip that expands to the quoted source. This is the visual contract for `CLAUDE.md` rule #7 (every `sourceQuote` must be grounded) — ungrounded items must **never** render in this component; they go to a separate, clearly-labeled "we couldn't confirm this" affordance instead (not yet in the mockups — flag for product-owner review before building). **Epic: `epic-understand`.**

### Quote card ("From your letter" / "What you told us")
Muted surface card, quote-mark icon, source text verbatim in quotes. Used both for grounding (result view) and for showing the user's own input back to them on the urgent screen. **Epics: `epic-understand`, `epic-safety`.**

### Top nav bar
Back chevron + centered "CareNav AI" wordmark (text only, no icon, once past the landing screen), translucent per Apple Design materials guidance once scrolling is involved (`backdrop-filter: blur()`, content scrolls underneath) — the mockups show it opaque/flat because they're static images, but implement it as a translucent material per §8.

### Language picker
Pill, globe icon + current language + chevron, surface-muted fill, lives only on the landing screen per the mockup. **Epic: `epic-language`.**

---

## 8. Motion (Apple Design skill applied to this system)

Load `.claude/skills/apple-design/SKILL.md` before implementing any of this — these are CareNav-specific concrete values, not a replacement for that reference.

| Interaction | Spec |
| --- | --- |
| Button press | `transform: scale(0.97)` on pointer-down (not release), critically damped spring back, `damping 1.0 / response 0.3` |
| Segmented control thumb slide | Spring, `damping 1.0 / response 0.3`, anchored/width-matched to the active label, never a cross-fade |
| Step-to-step transition (guided prep) | Enter/exit along the same horizontal axis (forward = slides in from right/out to left; Back mirrors it exactly) — satisfies the "symmetric paths" rule |
| Urgent message appearing | **No slide-in flourish.** Materialize in place (opacity + slight scale from 0.98→1, `damping 1.0 / response 0.4`) — arriving gently, not dramatically, matches the "concern not alarm" tone, and must never be skippable/rushed by animation timing (the user must read it) |
| Banner/card appearance | Materialize (blur+scale together), not a flat fade — per materials guidance §12 of the skill |
| Mic button while listening | Continuous, real-time feedback (waveform or pulsing ring) synced to actual audio input — never a looping decorative animation that's disconnected from real mic state |
| Reduced motion | All of the above degrade to opacity cross-fades only, no scale/slide, per `prefers-reduced-motion` |

---

## 9. Accessibility

- Minimum 4.5:1 contrast for all body text (§2 table flags the one exception to design around).
- All interactive targets ≥44×44px (pill buttons at the mockup's height already satisfy this).
- Respect `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast` per the Apple Design skill §14 — translucent nav/banners fall back to solid fill, not just "less blur."
- Layout must survive the user's OS text-size setting (`rem`-based spacing, §3) without truncating safety-critical copy (urgent message, draft label) — this is non-negotiable per `CLAUDE.md` rule #11.
- The "DRAFT, NOT CLINICALLY APPROVED" label must remain at full contrast and not be affected by any theming/translucency experiment.

---

## 10. Open items (need product-owner input before extending this system)

- **Dark mode** is undesigned. Don't invent one — ask, or ship light-mode-only for the pilot and say so explicitly.
- **Ungrounded-claim treatment** (§7, list item component) isn't in the mockups — needs a design decision, not just an engineering one.
- **Exact brand hex** — current values are sampled from PNGs, not sourced from a design file. Fine to build with; revisit if the product owner supplies exact values later (update `design/tokens.css` + this file together).
- Only four screens are agreed (landing, guided step, result, urgent). Every other screen (account/login, admin usage page, feedback prompt, photo capture, PDF layout) must be designed **by extension of this system**, not freely — and should go back to the product owner for a quick look before being treated as final, same as prompt/static-content files per `CLAUDE.md`'s orchestration rules.

---

## 11. Implementation

Token values above are mirrored as CSS custom properties in `design/tokens.css`, ready to import once the Next.js app is scaffolded. Don't hand-roll hex values in component code — reference the tokens, so a later palette correction is a one-file change.
