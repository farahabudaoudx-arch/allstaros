// Node's --experimental-strip-types runs .ts files but does NOT resolve
// extensionless relative imports inside them, so `import { shell } from
// "./_layout"` in src/lib/emails/*.ts dies with ERR_MODULE_NOT_FOUND. Every
// script that renders an email template hits this.
//
// This hook fills that one gap: for a relative, extensionless specifier, try
// "<specifier>.ts" (then "/index.ts") and use it if the file exists. Everything
// else falls through to Node's normal resolution untouched.
//
// Load it before the script:
//   node --experimental-strip-types --import ./scripts/_ts-resolve.mjs …

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const hasExtension = (specifier) => /\.[a-zA-Z0-9]+$/.test(specifier);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !hasExtension(specifier) && context.parentURL) {
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          const url = new URL(candidate, context.parentURL);
          if (existsSync(fileURLToPath(url))) {
            return { url: url.href, format: "module-typescript", shortCircuit: true };
          }
        } catch {
          // Not resolvable as a file URL; fall through to Node.
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
