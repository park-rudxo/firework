import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// eslint-config-next 16 은 flat config 배열을 그대로 내보낸다.
// @eslint/eslintrc 의 FlatCompat 을 거치면 순환 참조로 터지므로 직접 편다.
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "src/generated/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
