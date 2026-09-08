"use client";

import { useActionState } from "react";

import { createProject, updateProject, type ActionState } from "@/features/project/actions";
import { CATEGORIES, CATEGORY_LABEL } from "@/features/project/schema";

const INITIAL: ActionState = { error: null };

export type ProjectFormValues = {
  name: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  repoUrl: string | null;
  demoUrl: string | null;
  iconUrl: string | null;
  screenshots: string[];
};

export function ProjectForm({
  mode,
  slug,
  githubLogin,
  values,
}: {
  mode: "create" | "edit";
  slug?: string;
  /** GitHub 계정을 연결하지 않았으면 null. 저장소 칸의 안내가 달라진다. */
  githubLogin: string | null;
  values?: ProjectFormValues;
}) {
  const action =
    mode === "create"
      ? createProject
      : updateProject.bind(null, slug!);

  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error ? (
        <p className="rounded-xl border border-danger/40 bg-danger/5 p-3.5 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {mode === "edit" && !state.error && !pending ? null : null}

      <Field
        label="GitHub 저장소"
        name="repoUrl"
        defaultValue={values?.repoUrl ?? ""}
        placeholder={`https://github.com/${githubLogin ?? "my-name"}/my-project`}
        hint={
          githubLogin
            ? "선택입니다. 넣으면 스타·언어·README 를 가져오고 소유 확인 배지가 붙습니다. 공개 저장소여야 합니다."
            : "선택입니다. 저장소를 넣으려면 위에서 GitHub 계정을 먼저 연결해주세요."
        }
        errors={state.fieldErrors?.repoUrl}
      />

      <Field
        label="프로젝트 이름"
        name="name"
        required
        defaultValue={values?.name}
        errors={state.fieldErrors?.name}
      />

      <Field
        label="한 줄 소개"
        name="tagline"
        required
        defaultValue={values?.tagline}
        placeholder="무엇을 하는 프로젝트인지 한 문장으로"
        hint="목록 카드에 그대로 보입니다."
        errors={state.fieldErrors?.tagline}
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">카테고리</span>
        <select
          name="category"
          defaultValue={values?.category ?? "WEB"}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      <Field
        label="태그"
        name="tags"
        defaultValue={values?.tags.join(", ")}
        placeholder="React, 협업툴, 관통프로젝트"
        hint="쉼표로 구분, 최대 8개."
        errors={state.fieldErrors?.tags}
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">소개 (마크다운)</span>
        <textarea
          name="description"
          rows={8}
          defaultValue={values?.description}
          placeholder="어떤 문제를 풀었는지, 어떻게 써보면 되는지 적어주세요. README 는 자동으로 함께 표시됩니다."
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <Field
        label="서비스 주소"
        name="demoUrl"
        defaultValue={values?.demoUrl ?? ""}
        placeholder="https://my-project.vercel.app"
        hint="배포된 웹사이트, 앱스토어·구글플레이 링크, 데모 무엇이든 됩니다. 저장소를 넣지 않았다면 이 주소가 필요합니다. https 만 가능합니다."
        errors={state.fieldErrors?.demoUrl}
      />

      <Field
        label="아이콘 이미지 주소"
        name="iconUrl"
        defaultValue={values?.iconUrl ?? ""}
        placeholder="https://…/icon.png"
        errors={state.fieldErrors?.iconUrl}
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">스크린샷 주소</span>
        <textarea
          name="screenshots"
          rows={3}
          defaultValue={values?.screenshots.join("\n")}
          placeholder={"https://…/shot1.png\nhttps://…/shot2.png"}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">한 줄에 하나씩, 최대 6장.</span>
        {state.fieldErrors?.screenshots ? (
          <span className="text-xs text-danger">{state.fieldErrors.screenshots.join(" ")}</span>
        ) : null}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition disabled:opacity-60"
      >
        {pending
          ? mode === "create"
            ? "등록하는 중…"
            : "저장 중…"
          : mode === "create"
            ? "등록하기"
            : "저장"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  hint,
  errors,
  ...props
}: {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {props.required ? <span className="text-danger"> *</span> : null}
      </span>
      <input
        name={name}
        className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        {...props}
      />
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      {errors ? <span className="text-xs text-danger">{errors.join(" ")}</span> : null}
    </label>
  );
}
