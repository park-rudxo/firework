import { z } from "zod";

/** 설문 문항. jsonb 컬럼에 이 모양으로 들어간다. */
export const questionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("rating"),
    label: z.string().trim().min(1).max(200),
    required: z.boolean().default(true),
    max: z.number().int().min(3).max(10).default(5),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("choice"),
    label: z.string().trim().min(1).max(200),
    required: z.boolean().default(true),
    options: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
    multiple: z.boolean().default(false),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("text"),
    label: z.string().trim().min(1).max(200),
    required: z.boolean().default(false),
    // 길수록 문체로 신원이 드러나기 쉬워 상한을 둔다.
    maxLength: z.number().int().min(50).max(2000).default(1000),
  }),
]);

export type Question = z.infer<typeof questionSchema>;

export const surveyInputSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
  questions: z.array(questionSchema).min(1, "문항을 최소 하나 만들어주세요.").max(15),
  closesAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), { message: "날짜 형식이 올바르지 않습니다." }),
});

export type SurveyInput = z.infer<typeof surveyInputSchema>;

/** 제작자가 처음 설문을 만들 때 채워지는 기본 문항. */
export const DEFAULT_QUESTIONS: Question[] = [
  { id: "overall", type: "rating", label: "전반적으로 얼마나 만족하셨나요?", required: true, max: 5 },
  { id: "usability", type: "rating", label: "쓰기 편했나요?", required: true, max: 5 },
  {
    id: "recommend",
    type: "choice",
    label: "다른 사람에게 추천하시겠어요?",
    required: true,
    options: ["추천한다", "보통이다", "추천하지 않는다"],
    multiple: false,
  },
  { id: "good", type: "text", label: "좋았던 점은 무엇인가요?", required: false, maxLength: 1000 },
  {
    id: "improve",
    type: "text",
    label: "고쳤으면 하는 점은 무엇인가요?",
    required: false,
    maxLength: 1000,
  },
];

/**
 * 응답 검증. 문항 정의에 맞는 답만 통과시킨다.
 * 정의에 없는 키는 버려서 응답 jsonb 에 임의 데이터가 섞이지 않게 한다.
 */
export function buildAnswerSchema(questions: Question[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const q of questions) {
    let field: z.ZodTypeAny;
    switch (q.type) {
      case "rating":
        field = z.number().int().min(1).max(q.max);
        break;
      case "choice":
        field = q.multiple
          ? z.array(z.enum(q.options as [string, ...string[]])).min(q.required ? 1 : 0)
          : z.enum(q.options as [string, ...string[]]);
        break;
      case "text":
        field = z.string().trim().max(q.maxLength);
        break;
    }
    shape[q.id] = q.required ? field : field.optional().nullable();
  }

  return z.object(shape).strip();
}

/** 폼 데이터를 문항 정의에 맞춰 파싱한다. */
export function answersFromFormData(questions: Question[], form: FormData) {
  const answers: Record<string, unknown> = {};

  for (const q of questions) {
    switch (q.type) {
      case "rating": {
        const raw = form.get(q.id);
        answers[q.id] = raw ? Number(raw) : q.required ? Number.NaN : null;
        break;
      }
      case "choice": {
        if (q.multiple) {
          answers[q.id] = form.getAll(q.id).map(String);
        } else {
          const raw = form.get(q.id);
          answers[q.id] = raw ? String(raw) : null;
        }
        break;
      }
      case "text": {
        const raw = String(form.get(q.id) ?? "").trim();
        answers[q.id] = raw || (q.required ? "" : null);
        break;
      }
    }
  }

  return answers;
}
