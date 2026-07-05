import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/.alchemy/**",
    "repos/**",
  ],
  rules: {
    "func-names": "off",
    "jsdoc/check-tag-names": "off",
    "max-classes-per-file": "off",
    "no-shadow": "off",
    "no-use-before-define": "off",
    "oxc/no-barrel-file": "off",
    "promise/prefer-await-to-callbacks": "off",
    "typescript/ban-types": "off",
    "typescript/no-empty-object-type": "off",
    "unicorn/filename-case": "off",
    "unicorn/no-array-for-each": "off",
    "unicorn/no-array-method-this-argument": "off",
  },
});
