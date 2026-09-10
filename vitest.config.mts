import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // DB 를 쓰는 테스트는 같은 테이블을 지우고 채운다. 병렬로 돌리면 서로의 데이터를
    // 지워버리므로 한 프로세스에서 순서대로 돌린다.
    fileParallelism: false,
    setupFiles: ["tests/setup.ts"],
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
