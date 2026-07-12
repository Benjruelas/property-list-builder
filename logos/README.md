# KnockScout brand assets

Curated from the designer logo pack. Runtime web assets live in `public/brand/` and `public/icon-*.png`.

## Emblem (fist mark)
| File | Use |
|------|-----|
| `emblem-white.svg` | Dark backgrounds (boot splash, dark UI) |
| `emblem-black.svg` | Light backgrounds |
| `emblem-blue.svg` (`#1151ef`) | Default brand mark / light & dark |

## Wordmarks & lockups
- `wordmark-on-light.svg` — KnockScout wordmark + “Doors will open”
- `lockup-blue.svg` — Emblem + wordmark lockup
- `wordmark-variant-*.svg` / `lockup-variant-*.svg` — alternate colorways

## App icons
Generated squares with **black emblem on white** (from `emblem-black.svg`):
- `/favicon-16.png`, `/favicon-32.png` — browser tab / bookmark
- `/icon-180.png` (180×180) — iOS Add to Home Screen (`/apple-touch-icon.png` rewrites here)
- `/icon-192.png`, `/icon-512.png` — Android / PWA install

Manifest uses `?v=6` cache bust and white `theme_color` / `background_color`.

Boot / loading screens use `/brand/lockup-variant-2.svg` (white lockup on dark).

Source design files (AI/PSD/PDF) are not checked in; keep the zip for archival. `logos/source/` holds high-res PNG/SVG masters.
