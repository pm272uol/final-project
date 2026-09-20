import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".venv-asr/**", ".venv-video/**", ".cache/**", ".next/**", ".next-e2e/**", ".next-build/**", ".next-video/**", "node_modules/**", "out/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
