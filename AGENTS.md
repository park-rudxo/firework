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

## 역할이 나뉘어 있다

| | 맡는 것 |
| --- | --- |
| **Astra** | 계획, 설계 결정, 브랜치를 나누고 합치는 일 |
| **Claude** | 구현, 테스트, 검증, 버그 수정 |

그래서 이렇게 움직인다.

- **브랜치는 Astra 가 만들고 이름을 정한다.** Claude 는 `HANDOFF.md` 에 적힌 브랜치에서
  작업하고, 자기 브랜치에 푸시한 뒤 끝났다고 적는다.
- **`main` 병합은 Astra 가 한다.** Claude 는 병합하지 않는다.
- **설계를 정하는 것은 Astra 다.** Claude 가 구현하다 갈림길을 만나면, 작은 것은 정하고
  `HANDOFF.md` 에 한 줄 남긴다. 방향이 갈리는 것은 정하지 말고 질문으로 적어둔다.
- **묻는 것은 모아서 한 번에.** Astra 는 한 번 부를 때마다 비용이 크다. 갈림길 하나마다
  세우지 말고, 진행할 수 있는 데까지 가고 나서 남은 질문을 함께 적는다.

**계획에 문제가 보이면 그대로 따르지 않는다.** 구현하다 보면 계획을 세울 때 보이지 않던
것이 나온다. 발견한 것을 `HANDOFF.md` 에 적고, 막히지 않는 부분은 마저 끝낸 뒤 넘긴다.
말없이 따르다 실패하는 것보다 낫다.

## 충돌을 막는 규칙 셋

1. **`main` 에서 분기하고 빨리 병합한다.** 오래 들고 있을수록 섞을 수 없게 된다.
   이미 한 번, 양쪽이 같은 기능(구독·알림·버그 제보)을 따로 만들어 하나를 버려야 했다.
   시작한 지 이틀 만에 그랬다 — 오래 걸려야 벌어지는 일이 아니다.
2. **`prisma/schema.prisma` 는 한 번에 한 명만 만진다.** 마이그레이션이 갈라지면
   가장 고치기 어렵다. 만지기 전에 `HANDOFF.md` 에 적어 자리를 잡는다.
3. **같은 파일을 동시에 고치지 않는다.** 담당 영역은 `HANDOFF.md` 에 있다.

## 끝낼 때

`HANDOFF.md` 를 현재 상태로 덮어쓰고, 새로 정한 것이 있으면 `DECISIONS.md` 에 덧붙인다.
둘 다 짧게 유지한다 — 매 세션 읽히는 파일이라 길어지면 그만큼 비용이 된다.
자세한 경위는 커밋 메시지에 있으니 여기 옮기지 않는다.
