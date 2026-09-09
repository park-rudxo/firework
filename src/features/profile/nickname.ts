/**
 * 닉네임 형식의 순수 로직.
 *
 * 이 서비스의 닉네임은 자기소개가 아니라 **소속 표기**다. 프로젝트 등록자와 일정
 * 작성자가 누구인지 한 줄로 드러나야 하고, 같은 반 사람끼리 서로를 찾을 수 있어야
 * 한다. "김싸피" 만으로는 그게 안 되고, 동명이인이 생기면 구별할 방법도 없다.
 * 그래서 형식을 하나로 못박는다.
 *
 *     기수_지역_반_이름     예) 16_구미_1반_김싸피
 *
 * DB 와 화면에서 떼어놓아야 "어느 칸이 왜 틀렸는지" 를 테스트로 못박을 수 있다.
 * 저장은 features/profile/actions.ts 가, 강제는 lib/session.ts 와 app/layout.tsx 가 맡는다.
 */

/** SSAFY 캠퍼스. 여기 없는 지역은 통과시키지 않는다. */
export const CAMPUSES = ["서울", "대전", "광주", "구미", "부울경"] as const;
export type Campus = (typeof CAMPUSES)[number];

export const NICKNAME_FORMAT = "기수_지역_반_이름";
export const NICKNAME_EXAMPLE = "16_구미_1반_김싸피";

/** 기수는 SSAFY 기수 범위. 프로필의 ssafyGeneration 과 같은 범위를 쓴다. */
const MAX_GENERATION = 50;
/** 반은 캠퍼스마다 다르지만 두 자리를 넘은 적이 없다. */
const MAX_CLASS_NO = 99;

export type ParsedNickname = {
  generation: number;
  campus: Campus;
  classNo: number;
  name: string;
  /** 정규화된 전체 문자열. 저장은 항상 이 값으로 한다. */
  nickname: string;
};

export type NicknameResult =
  | { ok: true; value: ParsedNickname }
  | { ok: false; error: string };

const HELP = `${NICKNAME_FORMAT} 형식으로 적어주세요. 예) ${NICKNAME_EXAMPLE}`;

/**
 * 어느 칸이 왜 틀렸는지까지 돌려준다.
 *
 * "형식이 올바르지 않습니다" 한 줄만 주면 사용자는 네 칸 중 무엇을 고쳐야 하는지
 * 모른 채 같은 값을 계속 넣는다. 가입 첫 화면에서 그러면 그대로 이탈이다.
 */
export function parseNickname(input: unknown): NicknameResult {
  if (typeof input !== "string") return { ok: false, error: HELP };

  const raw = input.trim();
  if (raw === "") return { ok: false, error: `닉네임을 입력해주세요. ${HELP}` };

  // 공백은 어디에 있든 걸러낸다. 눈에 보이지 않는 차이로 동명이인이 갈리면 안 된다.
  if (/\s/.test(raw)) {
    return { ok: false, error: `띄어쓰기 없이 붙여 적어주세요. 예) ${NICKNAME_EXAMPLE}` };
  }

  const parts = raw.split("_");
  if (parts.length !== 4) {
    return {
      ok: false,
      error: `밑줄로 네 칸을 나눠주세요 (지금은 ${parts.length}칸). ${HELP}`,
    };
  }

  // 바로 위에서 길이를 4로 확인했다. 인덱스 접근이 undefined 를 섞지 않도록 좁혀둔다.
  const [generationPart, campusPart, classPart, namePart] = parts as [
    string,
    string,
    string,
    string,
  ];

  if (!/^\d{1,2}$/.test(generationPart)) {
    return { ok: false, error: `기수는 숫자만 적어주세요 (예: 13). 지금은 "${generationPart}" 입니다.` };
  }
  const generation = Number(generationPart);
  if (generation < 1 || generation > MAX_GENERATION) {
    return { ok: false, error: `기수는 1에서 ${MAX_GENERATION} 사이여야 합니다.` };
  }

  if (!(CAMPUSES as readonly string[]).includes(campusPart)) {
    return {
      ok: false,
      error: `지역은 ${CAMPUSES.join(" · ")} 중 하나여야 합니다. 지금은 "${campusPart}" 입니다.`,
    };
  }

  const classMatch = /^(\d{1,2})반$/.exec(classPart);
  if (!classMatch) {
    return { ok: false, error: `반은 숫자 뒤에 "반" 을 붙여주세요 (예: 1반). 지금은 "${classPart}" 입니다.` };
  }
  const classNo = Number(classMatch[1]);
  if (classNo < 1 || classNo > MAX_CLASS_NO) {
    return { ok: false, error: `반은 1반에서 ${MAX_CLASS_NO}반 사이여야 합니다.` };
  }

  if (!/^[가-힣]{2,10}$/.test(namePart)) {
    return {
      ok: false,
      error: `이름은 한글 2~10자로 적어주세요. 지금은 "${namePart}" 입니다.`,
    };
  }

  return {
    ok: true,
    value: {
      generation,
      campus: campusPart as Campus,
      classNo,
      name: namePart,
      nickname: `${generation}_${campusPart}_${classNo}반_${namePart}`,
    },
  };
}

/**
 * 형식을 갖췄는지만 본다.
 *
 * 세션과 레이아웃이 매 요청마다 부르는 자리라 DB 도 예외도 거치지 않는다.
 */
export function isValidNickname(input: unknown): boolean {
  return parseNickname(input).ok;
}
