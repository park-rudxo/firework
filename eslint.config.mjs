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
  {
    rules: {
      // Server Action 은 useActionState 가 요구하는 (prevState, formData) 모양을
      // 지켜야 해서 쓰지 않는 인자가 생긴다. 코드베이스가 _ 접두사로 그것을
      // 표시하고 있으므로 규칙에도 알려준다.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
