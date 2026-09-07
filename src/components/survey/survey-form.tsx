"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, Info, Star } from "lucide-react";

import { submitSurveyResponse, type SurveyState } from "@/features/survey/actions";
import { FREE_TEXT_WARNING } from "@/features/survey/anonymity";
import type { Question } from "@/features/survey/schema";

const INITIAL: SurveyState = { ok: false, error: null };

export function SurveyForm({
  surveyId,
  questions,
  slug,
}: {
  surveyId: string;
  questions: Question[];
  slug: string;
}) {
  const [state, formAction, pending] = useActionState(
    submitSurveyResponse.bind(null, surveyId),
    INITIAL,
  );

  if (state.ok) {
    return (
      <div className="rounded-card border border-success/40 bg-success/5 p-5">
        <CheckCircle2 className="size-6 text-success" aria-hidden />
        <p className="mt-3 font-medium">응답 완료. 고맙습니다.</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          제작자에게 익명으로 전달됩니다.
          {state.enteredRaffle ? " 추첨에도 응모되었습니다." : ""}
        </p>
        <Link
          href={`/projects/${slug}`}
          className="mt-5 inline-block rounded-xl border border-border px-4 py-2 text-sm"
        >
          프로젝트로 돌아가기
        </Link>
      </div>
    );
  }

  const hasFreeText = questions.some((q) => q.type === "text");

  return (
    <form action={formAction} className="flex flex-col gap-7">
      {questions.map((q) => (
        <QuestionField key={q.id} question={q} />
      ))}

      {hasFreeText ? (
        <p className="flex items-start gap-2 rounded-xl bg-surface-muted p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {FREE_TEXT_WARNING}
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-xl border border-danger/40 bg-danger/5 p-3.5 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "제출 중…" : "익명으로 제출"}
      </button>
    </form>
  );
}

function QuestionField({ question }: { question: Question }) {
  const label = (
    <span className="text-sm font-medium">
      {question.label}
      {question.required ? <span className="text-danger"> *</span> : null}
    </span>
  );

  switch (question.type) {
    case "rating":
      return (
        <fieldset>
          <legend className="mb-2.5">{label}</legend>
          <div className="flex gap-1.5">
            {Array.from({ length: question.max }, (_, i) => i + 1).map((value) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="radio"
                  name={question.id}
                  value={value}
                  required={question.required}
                  className="peer sr-only"
                />
                <span className="flex size-11 items-center justify-center rounded-xl border border-border text-sm transition peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2">
                  {value}
                </span>
              </label>
            ))}
            <span className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="size-3.5" aria-hidden />
              {question.max}점 만점
            </span>
          </div>
        </fieldset>
      );

    case "choice":
      return (
        <fieldset>
          <legend className="mb-2.5">{label}</legend>
          <div className="flex flex-col gap-1.5">
            {question.options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5 text-sm transition hover:bg-surface-muted has-checked:border-primary"
              >
                <input
                  type={question.multiple ? "checkbox" : "radio"}
                  name={question.id}
                  value={option}
                  required={question.required && !question.multiple}
                  className="accent-[var(--primary)]"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
      );

    case "text":
      return (
        <label className="flex flex-col gap-2">
          {label}
          <textarea
            name={question.id}
            rows={4}
            required={question.required}
            maxLength={question.maxLength}
            className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
      );
  }
}
