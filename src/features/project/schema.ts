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

/** 저장소는 선택이다. 비워두면 null 로 떨어뜨린다. */
const optionalRepoUrl = z
  .union([repoUrl, z.literal("")])
  .transform((v) => (v === "" ? null : v))
  .nullable();

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

/**
 * 필드 순서가 곧 등록 화면의 순서다.
 *
 * 필수 다섯 개를 앞에 몰아두고 선택을 뒤로 뺀다. 데모 주소가 필수 자리에 있는 것이
 * 이 서비스의 성격을 그대로 말해준다 — "둘러본다 → 써본다 → 피드백" 에서 써볼 곳이
 * 없으면 나머지가 성립하지 않는다. 저장소는 반대로 없을 수도 있어서 선택이다.
 */
export const projectInputSchema = z.object({
  // ── 필수 ──
  name: z.string().trim().min(2, "2자 이상 입력해주세요.").max(60),
  tagline: z
    .string()
    .trim()
    .min(5, "한 줄 소개는 5자 이상 적어주세요.")
    .max(120, "한 줄 소개는 120자를 넘길 수 없습니다."),
  demoUrl: httpsUrl,
  category: z.enum(CATEGORIES),
  description: z
    .string()
    .trim()
    .min(1, "소개를 적어주세요.")
    .max(20_000, "소개가 너무 깁니다."),

  // ── 선택 ──
  repoUrl: optionalRepoUrl,
  tags: z
    .array(z.string().trim().min(1).max(20))
    .max(8, "태그는 최대 8개까지입니다.")
    .default([]),
  iconUrl: optionalHttpsUrl,
  screenshots: z.array(httpsUrl).max(6, "스크린샷은 최대 6장까지입니다.").default([]),
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
    demoUrl: String(form.get("demoUrl") ?? "").trim(),
    category: String(form.get("category") ?? "ETC"),
    description: String(form.get("description") ?? ""),
    repoUrl: String(form.get("repoUrl") ?? "").trim(),
    tags: String(form.get("tags") ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean),
    iconUrl: String(form.get("iconUrl") ?? "").trim(),
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
