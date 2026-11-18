// Zod's fast path compiles parsers with `new Function`. In the browser the CSP has no
// 'unsafe-eval' (architecture §7), so Zod's probe for it is refused and Chrome lists that as an
// issue on every page. Zod reads the setting as each schema is built, and these schemas are built
// as their modules load, in the same bundle chunk as Zod itself: an app-side setting runs too
// late. So it's set here, first. The server loses a parsing speed-up it doesn't need.
import { z } from 'zod';

z.config({ jitless: true });
