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
  // Custom rule overrides for the codebase
  // Relaxed rules for practical React development patterns
  {
    rules: {
      // React hooks - keep critical ones as errors, relax overly strict ones
      "react-hooks/rules-of-hooks": "error", // Critical - must be followed
      "react-hooks/exhaustive-deps": "warn", // Useful but sometimes needs overriding
      // These new React compiler rules are too strict for many valid patterns
      "react-hooks/set-state-in-effect": "off", // Valid pattern for syncing with external state
      "react-hooks/static-components": "off", // Sometimes needed for performance
      "react-hooks/purity": "off", // Date.now() in hooks is a valid pattern
      "react-hooks/refs": "off", // Lazy initialization pattern is valid
      // Unescaped entities are common in text content
      "react/no-unescaped-entities": "warn",
      // Allow any in some cases (covered by root eslint config warnings)
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  // Custom rules for integration icons that load from dynamic external URLs
  {
    files: ["src/components/integration-icon.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
