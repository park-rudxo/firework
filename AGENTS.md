<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# 두 에이전트가 함께 쓰는 저장소다

이 저장소는 Claude 와 GPT(Astra) 가 번갈아 만진다. 서로의 세션을 볼 수 없으므로,
남겨둔 파일이 유일한 연락 수단이다. **작업을 시작하기 전에 두 파일을 먼저 읽는다.**

| 파일 | 무엇이 있나 | 언제 쓰나 |
| --- | --- | --- |
| `docs/HANDOFF.md` | 지금 누가 무엇을 하고 있는지, 무엇이 막혀 있는지 | 작업을 시작할 때와 끝낼 때 |
| `docs/DECISIONS.md` | 이미 정해진 것과 그 이유 | 설계를 정할 때. 여기 있으면 다시 논의하지 않는다 |

`DECISIONS.md` 에 있는 항목을 뒤집으려면 **먼저 사람에게 묻는다.** 상대 에이전트가
그 결정 위에 코드를 쌓아뒀을 수 있고, 그걸 모른 채 뒤집으면 둘 다 버려진다.

## 충돌을 막는 규칙 셋

1. **`main` 에서 분기하고 빨리 병합한다.** 오래 들고 있을수록 섞을 수 없게 된다.
   이미 한 번, 양쪽이 같은 기능(구독·알림·버그 제보)을 따로 만들어 하나를 버려야 했다.
2. **`prisma/schema.prisma` 는 한 번에 한 명만 만진다.** 마이그레이션이 갈라지면
   가장 고치기 어렵다. 만지기 전에 `HANDOFF.md` 에 적어 자리를 잡는다.
3. **같은 파일을 동시에 고치지 않는다.** 담당 영역은 `HANDOFF.md` 에 있다.

## 끝낼 때

`HANDOFF.md` 를 현재 상태로 덮어쓰고, 새로 정한 것이 있으면 `DECISIONS.md` 에 덧붙인다.
둘 다 짧게 유지한다 — 매 세션 읽히는 파일이라 길어지면 그만큼 비용이 된다.
자세한 경위는 커밋 메시지에 있으니 여기 옮기지 않는다.
