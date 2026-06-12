import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Launch gate posture (see PRE_LAUNCH_ROADMAP §1 #4): the build's hard gate is
  // the typecheck (`next build` fails on TS errors). For ESLint we block on
  // genuine mistakes but keep the newer, opinionated react-hooks/compiler rules
  // and deliberate `any`s as *warnings* — they're advisory, fire on patterns the
  // app ships on purpose, and were verified non-breaking. They stay visible
  // without blocking deploys. Revisit (tighten to "error" + fix) post-launch.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow underscore-prefixed intentional throwaways and the
      // `{ _omit, ...rest } => rest` field-drop pattern.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
