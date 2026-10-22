# frogmouth brand

The symbol is a tawny frogmouth seen head on. Tawny frogmouths are often mistaken for owls, so the drawing leans on what is only theirs: a broad, flat head with no ear tufts, pale brow stripes, a gape almost as wide as the face, a horn-coloured hooked beak with a bristle tuft, and heavy lids over amber eyes. The heavy lids give it its expression: calm, unimpressed, watching. A fair attitude for something that guards your secrets.

The wordmark is set in JetBrains Mono ExtraBold, the app's own typeface. Its two o's are the bird's eyes, with the same lids.

## Files

| File | Use |
|---|---|
| `frogmouth-mark.svg` | The symbol alone. Favicons, avatars, small spaces. Works on dark and light. |
| `frogmouth-lockup-on-dark.svg`, `-on-light.svg` | Symbol and wordmark side by side; the wordmark's eyes sit level with the symbol's. The default logo. |
| `frogmouth-stacked-on-dark.svg`, `-on-light.svg` | Symbol above wordmark, for square or centred layouts. |
| `frogmouth-wordmark-on-dark.svg`, `-on-light.svg` | The wordmark alone, where the symbol already appears nearby. |
| `frogmouth-app-icon.svg` | The symbol on a slate rounded square, 512 × 512. |

The lockups blink every few seconds when shown as images (CSS inside the SVG; still for people who prefer reduced motion). In the app the eyes are live: they follow the pointer or the text caret, squint when idle, and close while a secret or passphrase is typed. Click the bird and it does what real tawny frogmouths do when startled: eyes wide, and the beak drops open to show a bright yellow mouth.

## Colours

| | Hex | Where |
|---|---|---|
| Iris | `#F2B33D` | The eyes, and the app's only accent colour |
| Plumage | `#5F6866` | The head |
| Lid | `#454D4B` | Eyelids |
| Brow | `#D3D9D6` | Brow stripes, bristles |
| Horn | `#B8AE90` | The beak |
| Night slate | `#121A1D` | Dark background |
| Leaf grey | `#DCE6E3` | Wordmark on dark |
| Ink | `#17232A` | Wordmark on light |
| Eucalyptus mist | `#EDF2F0` | Light background |

## Use

- Keep clear space around the logo of at least the height of one eye in the wordmark.
- Use the `on-dark` files on dark backgrounds and `on-light` on light ones; the symbol works on both.
- Do not recolour the bird, stretch it, add ear tufts, or swap the eye-o's for plain o's.
- Below 24 px, use the symbol alone.

## Editing

The symbol's shapes and colours live in `src/brand/mark.json`; the app draws its live bird from it. After changing it, regenerate the files here and the favicon:

```sh
pip install fonttools brotli
python3 tools/brand.py
npm run build
```
