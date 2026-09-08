import { z } from "zod";

import { parseRepoUrl } from "@/lib/github";

export const CATEGORIES = [
  "WEB",
  "MOBILE",
  "AI",
  "GAME",
  "TOOL",
  "EMBEDDED",
  "DATA",
  "ETC",
] as const;

export const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  WEB: "웹",
  MOBILE: "앱",
  AI: "AI",
  GAME: "게임",
  TOOL: "개발도구",
  EMBEDDED: "임베디드",
  DATA: "데이터",
  ETC: "기타",
};

/** github.com 저장소 URL만 받는다. 다른 호스트는 파서 단계에서 걸린다. */
const repoUrl = z.string().refine((v) => parseRepoUrl(v) !== null, {
  message: "https://github.com/{소유자}/{저장소} 형태의 주소여야 합니다.",
});

/**
 * 외부로 나가는 링크는 https 만 받는다.
 * javascript: 나 data: 스킴이 링크로 들어오는 경로를 여기서 끊는다.
 */
const httpsUrl = z
  .string()
  .refine(
    (v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "https:// 로 시작하는 주소여야 합니다." },
  );

const optionalHttpsUrl = z
  .union([httpsUrl, z.literal("")])
  .transform((v) => (v === "" ? null : v))
  .nullable();

export const projectInputSchema = z.object({
  name: z.string().trim().min(2, "2자 이상 입력해주세요.").max(60),
  tagline: z
    .string()
    .trim()
    .min(5, "한 줄 소개는 5자 이상 적어주세요.")
    .max(120, "한 줄 소개는 120자를 넘길 수 없습니다."),
  description: z.string().trim().max(20_000).default(""),
  category: z.enum(CATEGORIES),
  tags: z
    .array(z.string().trim().min(1).max(20))
    .max(8, "태그는 최대 8개까지입니다.")
    .default([]),
  /**
   * 저장소는 선택이다. 공개 저장소가 없는 프로젝트도 공유할 만한 결과물이다 —
   * 배포된 웹서비스, 스토어에 올라간 앱, 사내 코드로 만든 것.
   */
  repoUrl: z
    .union([repoUrl, z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  demoUrl: optionalHttpsUrl,
  iconUrl: optionalHttpsUrl,
  screenshots: z.array(httpsUrl).max(6, "스크린샷은 최대 6장까지입니다.").default([]),
})
  /**
   * 둘 다 비면 방문자가 이 프로젝트를 써볼 방법이 없다. 써보고 피드백을 남기는
   * 것이 이 서비스의 전부이므로, 최소한 한쪽은 있어야 등록을 받는다.
   */
  .refine((v) => Boolean(v.repoUrl) || Boolean(v.demoUrl), {
    path: ["repoUrl"],
    message: "저장소 주소나 서비스 주소 중 최소 하나는 넣어주세요.",
  });

export type ProjectInput = z.infer<typeof projectInputSchema>;

/**
 * 폼에서 오는 FormData 를 스키마가 기대하는 모양으로 옮긴다.
 * 태그는 쉼표 구분 한 줄, 스크린샷은 줄바꿈 구분으로 받는다.
 */
export function projectInputFromFormData(form: FormData) {
  const splitLines = (v: FormDataEntryValue | null) =>
    String(v ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    name: String(form.get("name") ?? ""),
    tagline: String(form.get("tagline") ?? ""),
    description: String(form.get("description") ?? ""),
    category: String(form.get("category") ?? "ETC"),
    tags: String(form.get("tags") ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean),
    repoUrl: String(form.get("repoUrl") ?? ""),
    demoUrl: String(form.get("demoUrl") ?? ""),
    iconUrl: String(form.get("iconUrl") ?? ""),
    screenshots: splitLines(form.get("screenshots")),
  };
}

/** 사람이 읽을 수 있는 슬러그. 한글 프로젝트명이 많아서 영숫자만 남기면 비게 된다. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "project";
}
