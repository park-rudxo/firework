"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { createSurvey, type SurveyAdminState } from "@/features/survey/actions";
import { DEFAULT_QUESTIONS, type Question } from "@/features/survey/schema";

const INITIAL: SurveyAdminState = { error: null };

export function CreateSurveyForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>(DEFAULT_QUESTIONS);
  const [state, formAction, pending] = useActionState(createSurvey.bind(null, slug), INITIAL);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
      >
        <Plus className="size-4" aria-hidden />
        설문 만들기
      </button>
    );
  }

  return (
    <form
      action={async (form) => {
        await formAction(form);
        router.refresh();
      }}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">설문 제목</span>
        <input
          name="title"
          required
          defaultValue="써보고 느낀 점을 알려주세요"
          className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">설명 (선택)</span>
        <textarea
          name="description"
          rows={2}
          className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">마감일 (선택)</span>
        <input
          type="date"
          name="closesAt"
          className="w-fit rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">문항</legend>
        <ul className="flex flex-col gap-2">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm"
            >
              <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {q.type === "rating" ? "점수" : q.type === "choice" ? "선택" : "서술"}
              </span>
              <input
                value={q.label}
                onChange={(e) => {
                  const next = [...questions];
                  next[i] = { ...q, label: e.target.value };
                  setQuestions(next);
                }}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
              <button
                type="button"
                onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))}
                aria-label="문항 삭제"
                className="text-muted-foreground hover:text-danger"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex flex-wrap gap-2">
          <AddQuestionButton
            label="점수 문항"
            onAdd={() =>
              setQuestions([
                ...questions,
                { id: `q${Date.now()}`, type: "rating", label: "새 문항", required: true, max: 5 },
              ])
            }
          />
          <AddQuestionButton
            label="서술 문항"
            onAdd={() =>
              setQuestions([
                ...questions,
                {
                  id: `q${Date.now()}`,
                  type: "text",
                  label: "새 문항",
                  required: false,
                  maxLength: 1000,
                },
              ])
            }
          />
        </div>
      </fieldset>

      <input type="hidden" name="questions" value={JSON.stringify(questions)} />

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-border px-4 py-2.5 text-sm"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={pending || questions.length === 0}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? "만드는 중…" : "설문 열기"}
        </button>
      </div>
    </form>
  );
}

function AddQuestionButton({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-muted"
    >
      <Plus className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}
