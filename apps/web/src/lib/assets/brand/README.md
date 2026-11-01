# Brand assets

The mark is the **TB monogram** from the AI-assisted design board (Monogram Iteration B,
`ui.md` §6.4 Logo): rounded "TB" letters, four toe beans above, and a heart-shaped bean in the
B. It was traced from the board's primary light logo and cleaned up: the toes are fitted
ellipses and the letters and heart are smoothed curves, 100 units high.

`mark.ts` holds the geometry. `Logo.svelte` draws it from there, and the SVG files below embed
the same paths (`mark.test.ts` fails if they drift). To change the mark, change `mark.ts` and
the four files together.

| File | Use |
|---|---|
| `mark.svg` | The mark alone: brown letters (`primary`), tan beans (`accent`) |
| `favicon.svg` | Browser tab icon: the app-icon tile (cream letters, light tan beans on a brown rounded square), which reads on light and dark tabs alike |
| `maskable.svg` | Source for the maskable app icon: the same tile, full bleed, with the mark inside the 80% safe zone |
| `badge.svg` | Source for Android's notification badge: white silhouette on transparent |

The light tan `#F2B461` on the tiles is icon-only (decorative, on brown); the design board's
`#DE9844`/`#844313` are mapped to the `accent` and `primary` tokens elsewhere.

The PNG sizes the manifest and push need (192, 512, maskable 512, badge 96) are exported from
these in S13.1, with the manifest.
