import {
  PROVIDER_CONSOLE_URL,
  PROVIDER_ENV_KEYS,
  PROVIDER_LABEL,
  PROVIDER_ORDER,
  callbackPath,
  type ProviderId,
} from "@/lib/providers";

/**
 * 개발 중에만 뜨는 안내.
 *
 * 자격증명이 없는 프로바이더는 버튼 자체가 사라진다. 그게 사용자에게는 옳지만
 * 만드는 사람에게는 "왜 카카오가 없지"만 남는다. 무엇을 어디에 넣어야 하는지를
 * 그 자리에 적어둔다. 값이 아니라 키 이름과 공개 URL 뿐이라 새어나갈 것이 없다.
 */
export function ProviderSetupHint({ missing }: { missing: ProviderId[] }) {
  const list = PROVIDER_ORDER.filter((p) => missing.includes(p));
  if (list.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-dashed border-border bg-surface-muted/60 p-4 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">
        아직 켜지지 않은 로그인 {list.length}개 (개발 중에만 보입니다)
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {list.map((provider) => {
          const [idKey, secretKey] = PROVIDER_ENV_KEYS[provider];
          return (
            <li key={provider}>
              <span className="font-medium text-foreground">{PROVIDER_LABEL[provider]}</span>{" "}
              —{" "}
              <a
                href={PROVIDER_CONSOLE_URL[provider]}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                콘솔에서 앱 만들기
              </a>
              <br />
              콜백 <code className="rounded bg-surface px-1 py-0.5">{callbackPath(provider)}</code>{" "}
              등록 후 <code className="rounded bg-surface px-1 py-0.5">{idKey}</code>,{" "}
              <code className="rounded bg-surface px-1 py-0.5">{secretKey}</code> 를{" "}
              <code className="rounded bg-surface px-1 py-0.5">.env</code> 에 넣으세요.
            </li>
          );
        })}
      </ul>
      <p className="mt-3">
        고친 뒤에는 개발 서버를 다시 시작해야 반영됩니다. 자세한 절차는{" "}
        <code className="rounded bg-surface px-1 py-0.5">npm run doctor</code> 가 알려줍니다.
      </p>
    </div>
  );
}
