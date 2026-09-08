"use client";

import { useState } from "react";

import {
  CAMPUSES,
  NICKNAME_FORMAT,
  parseNickname,
  type Campus,
} from "@/features/profile/nickname";

/**
 * 닉네임을 한 칸이 아니라 네 칸으로 받는다.
 *
 * "기수_지역_반_이름 으로 적어주세요" 라고 안내하고 자유 입력을 받으면, 밑줄을
 * 빠뜨리거나 지역을 제멋대로 적는 실패가 계속 나온다. 지역을 목록으로, 반을
 * 숫자로 받으면 그 실패가 애초에 생기지 않는다. 서버는 그래도 다시 검사한다 —
 * 여기는 편의고 방어는 features/profile/nickname.ts 다.
 *
 * 실제로 전송되는 값은 아래 hidden input 하나이고, 이름은 displayName 그대로다.
 */
export function NicknameFields({ defaultValue }: { defaultValue?: string }) {
  const parsed = parseNickname(defaultValue ?? "");
  const initial = parsed.ok ? parsed.value : null;

  const [generation, setGeneration] = useState(initial ? String(initial.generation) : "");
  const [campus, setCampus] = useState<Campus | "">(initial?.campus ?? "");
  const [classNo, setClassNo] = useState(initial ? String(initial.classNo) : "");
  const [name, setName] = useState(initial?.name ?? "");

  const nickname = `${generation}_${campus}_${classNo}반_${name}`;
  const complete = parseNickname(nickname).ok;

  const field = "rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary";

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="displayName" value={nickname} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">기수</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            required
            value={generation}
            onChange={(e) => setGeneration(e.target.value)}
            placeholder="13"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">지역</span>
          <select
            required
            value={campus}
            onChange={(e) => setCampus(e.target.value as Campus)}
            className={field}
          >
            <option value="" disabled>
              선택
            </option>
            {CAMPUSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">반</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            required
            value={classNo}
            onChange={(e) => setClassNo(e.target.value)}
            placeholder="1"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">이름</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="박경도"
            className={field}
          />
        </label>
      </div>

      {/* 저장될 값을 그대로 보여준다. 형식을 글로 설명하는 것보다 빠르다. */}
      <p className="text-xs text-muted-foreground">
        {NICKNAME_FORMAT} ·{" "}
        <strong className={complete ? "text-foreground" : "text-muted-foreground"}>
          {nickname}
        </strong>
      </p>
    </div>
  );
}
