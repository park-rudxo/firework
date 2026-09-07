import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      // server-only 는 RSC 밖에서 import 되면 던지도록 만들어진 가드다.
      // 테스트에서는 그 가드가 목적이 아니므로 빈 모듈로 바꿔 끼운다.
      "server-only": resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
});
