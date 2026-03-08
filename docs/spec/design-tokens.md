# VoiceVault Design Token Reference

_Source of truth: `frontend/src/app/globals.css`_
_Tailwind v4: tokens in `@theme inline` are available as Tailwind color/shadow/etc utilities._

---

## Surface Stack

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0c0c0c` | Page background |
| `--surface` | `#141414` | Card/panel background |
| `--surface-2` | `#1c1c1c` | Nested card, input background |
| `--surface-3` | `#252525` | Table header, hover state |

## Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `#2a2a2a` | Default border |
| `--border-2` | `#3d3d3d` | Elevated border |
| `--border-3` | `#555555` | Focus / active border |

## Typography Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--fg` | `#e2e2e2` | Primary text |
| `--fg-2` | `#8c8c8c` | Secondary / muted text |
| `--fg-3` | `#4c4c4c` | Placeholder / disabled text |

## Accent Palette

| Token | Hex | Dim | Glow | Usage |
|-------|-----|-----|------|-------|
| `--cyan` | `#00ccff` | `#003d4d` | rgba(0,204,255,0.15) | Audio, mic, live, primary accent |
| `--green` | `#00e87a` | `#003d20` | rgba(0,232,122,0.12) | Connected, success |
| `--amber` | `#ffaa00` | `#3d2800` | rgba(255,170,0,0.12) | Processing, warning |
| `--red` | `#ff3b3b` | `#3d0a0a` | rgba(255,59,59,0.15) | Error, stop recording |
| `--purple` | `#b48eff` | `#1e0a3d` | rgba(180,142,255,0.12) | Obsidian export |

## Semantic Status

| Token | Alias of | Usage |
|-------|----------|-------|
| `--status-pass` | `--green` | Test pass, health OK |
| `--status-pass-dim` | `--green-dim` | Pass background tint |
| `--status-warn` | `--amber` | Warning, degraded |
| `--status-warn-dim` | `--amber-dim` | Warn background tint |
| `--status-fail` | `--red` | Test fail, error |
| `--status-fail-dim` | `--red-dim` | Fail background tint |
| `--status-info` | `--cyan` | Info, neutral status |
| `--status-info-dim` | `--cyan-dim` | Info background tint |

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.4)` | Subtle card elevation |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.5)` | Dropdown, modal backdrop |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.6)` | Overlay, toast |
| `--shadow-glow-cyan` | `0 0 12px var(--cyan-glow)` | Active/focused cyan element |
| `--shadow-glow-green` | `0 0 12px var(--green-glow)` | Success state glow |
| `--shadow-glow-red` | `0 0 12px var(--red-glow)` | Error state glow |

## Animation

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | `100ms` | Micro-interactions (hover border color) |
| `--duration-normal` | `200ms` | Standard transitions (expand, fade) |
| `--duration-slow` | `300ms` | Panel open/close |
| `--easing-default` | `cubic-bezier(0.4,0,0.2,1)` | General easing |
| `--easing-snap` | `cubic-bezier(0,0,0.2,1)` | Snappy deceleration |

## Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--z-base` | `0` | Default document flow |
| `--z-raised` | `10` | Floating elements |
| `--z-dropdown` | `100` | Dropdowns, tooltips |
| `--z-sticky` | `150` | Sticky headers |
| `--z-modal` | `200` | Modal overlays |
| `--z-toast` | `300` | Toast notifications |

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `0.25rem / 4px` | Tight gaps |
| `--space-2` | `0.5rem / 8px` | Small gaps |
| `--space-3` | `0.75rem / 12px` | Component inner padding |
| `--space-4` | `1rem / 16px` | Standard spacing |
| `--space-6` | `1.5rem / 24px` | Section spacing |
| `--space-8` | `2rem / 32px` | Large section gaps |
| `--space-12` | `3rem / 48px` | Hero spacing |
| `--space-16` | `4rem / 64px` | Page top padding |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | `0` | Default — brutalist, sharp |
| `--radius-sm` | `2px` | Minimal rounding (badges only) |
| `--radius-pill` | `9999px` | Status pills, tags |

---

## Typography Utility Classes

Defined in `frontend/src/app/globals.css`. Use these instead of ad-hoc Tailwind chains.

| Class | Font size | Weight | Transform | Color | Usage |
|-------|-----------|--------|-----------|-------|-------|
| `.text-prompt` | 10px | normal | uppercase | `--fg-3` | Terminal prompt labels (`$ SYSTEM.INIT`) |
| `.text-section-label` | 12px | bold | uppercase | `--fg-2` | Section headers (`// MODULES`) |
| `.text-metric` | 30px | bold | none | `--fg` | Large stat numbers |
| `.text-metric-sm` | 20px | bold | none | `--fg` | Medium stat numbers |
| `.text-body-mono` | 14px | normal | none | `--fg-2` | Body content, descriptions |
| `.text-caption` | 10px | normal | none | `--fg-3` | Labels, metadata, timestamps |
| `.text-code` | 13px | normal | none | `--fg` | Inline code, terminal output |

### Accent Modifiers (compose with any `.text-*`)

| Class | Color |
|-------|-------|
| `.text-accent-cyan` | `--cyan` |
| `.text-accent-green` | `--green` |
| `.text-accent-amber` | `--amber` |
| `.text-accent-red` | `--red` |
| `.text-accent-purple` | `--purple` |
| `.text-status-pass` | `--status-pass` (green) |
| `.text-status-warn` | `--status-warn` (amber) |
| `.text-status-fail` | `--status-fail` (red) |
| `.text-status-info` | `--status-info` (cyan) |

---

_Last updated: v0.6.0 Phase 0_
_Maintained by: Claw 🦀_
