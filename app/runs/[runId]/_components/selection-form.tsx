"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Candidates } from "@/lib/candidates/schema";
import { submitSelection } from "../actions";

interface Props {
  runId: string;
  candidates: Candidates;
}

const FORMULA_LABEL: Record<string, string> = {
  shock: "충격·반전",
  question: "의문·미스터리",
  contrast: "대비·비교",
  list: "숫자 나열",
  storytelling: "서사·감정",
};

function RadioCardGroup<T extends { index: 1 | 2 | 3 }>({
  name,
  options,
  value,
  onChange,
  render,
}: {
  name: string;
  options: T[];
  value: number | null;
  onChange: (v: 1 | 2 | 3) => void;
  render: (opt: T) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const checked = value === opt.index;
        return (
          <label
            key={opt.index}
            className={`block cursor-pointer rounded-lg border p-4 transition ${
              checked
                ? "border-emerald-500 bg-emerald-500/5"
                : "border-neutral-800 hover:border-neutral-600"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.index}
              checked={checked}
              onChange={() => onChange(opt.index)}
              className="sr-only"
            />
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border ${
                  checked
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-neutral-600"
                }`}
              >
                {checked && <div className="h-2 w-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1 min-w-0">{render(opt)}</div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

export function SelectionForm({ runId, candidates }: Props) {
  const [topicIndex, setTopicIndex] = useState<1 | 2 | 3 | null>(null);
  const [audienceIndex, setAudienceIndex] = useState<1 | 2 | 3 | null>(null);
  const [titleIndex, setTitleIndex] = useState<1 | 2 | 3 | null>(null);
  const [customNote, setCustomNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready =
    topicIndex !== null && audienceIndex !== null && titleIndex !== null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ready) {
      setError("주제·타겟·제목을 각각 1개씩 선택해주세요.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("topicIndex", String(topicIndex));
    fd.set("audienceIndex", String(audienceIndex));
    fd.set("titleIndex", String(titleIndex));
    if (customNote.trim()) fd.set("customNote", customNote.trim());
    startTransition(async () => {
      try {
        await submitSelection(runId, fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section>
        <h3 className="text-lg font-semibold mb-3">
          1) 주제 <span className="text-xs text-neutral-500">(3개 중 1개 선택)</span>
        </h3>
        <RadioCardGroup
          name="topicIndex"
          options={candidates.topics}
          value={topicIndex}
          onChange={setTopicIndex}
          render={(t) => (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{t.index}</Badge>
                <div className="font-medium">{t.title}</div>
              </div>
              <p className="text-sm text-neutral-300">{t.description}</p>
              <p className="text-xs text-neutral-500">왜? — {t.rationale}</p>
            </div>
          )}
        />
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">
          2) 타겟 <span className="text-xs text-neutral-500">(3개 중 1개 선택)</span>
        </h3>
        <RadioCardGroup
          name="audienceIndex"
          options={candidates.audiences}
          value={audienceIndex}
          onChange={setAudienceIndex}
          render={(a) => (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{a.index}</Badge>
                <div className="font-medium">{a.label}</div>
                <span className="text-xs text-neutral-500">· {a.ageRange}</span>
              </div>
              {a.interests.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {a.interests.map((i, k) => (
                    <span
                      key={k}
                      className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300"
                    >
                      #{i}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-neutral-500">동기 — {a.motivation}</p>
            </div>
          )}
        />
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-3">
          3) 제목 <span className="text-xs text-neutral-500">(3개 중 1개 선택)</span>
        </h3>
        <RadioCardGroup
          name="titleIndex"
          options={candidates.titles}
          value={titleIndex}
          onChange={setTitleIndex}
          render={(t) => (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{t.index}</Badge>
                <Badge variant="secondary">
                  {FORMULA_LABEL[t.formula] ?? t.formula}
                </Badge>
                <span className="text-xs text-neutral-500">{t.text.length}자</span>
              </div>
              <div className="font-medium text-base">{t.text}</div>
              <p className="text-xs text-neutral-500">왜? — {t.rationale}</p>
            </div>
          )}
        />
      </section>

      <section className="space-y-2">
        <Label htmlFor="customNote">
          메모 <span className="text-xs text-neutral-500">(선택)</span>
        </Label>
        <Textarea
          id="customNote"
          name="customNote"
          rows={3}
          placeholder="예: 제목 1번이지만 '~로' 부분을 빼고 싶음"
          value={customNote}
          onChange={(e) => setCustomNote(e.target.value)}
          maxLength={500}
        />
      </section>

      {error && (
        <div className="text-sm text-red-400 border border-red-900/50 rounded p-3 bg-red-950/20">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!ready || pending}>
          {pending ? "제출 중..." : "이 조합으로 다음 단계 진행"}
        </Button>
        <span className="text-xs text-neutral-500">
          {ready ? "선택 완료" : "주제·타겟·제목 각각 1개씩 선택해야 합니다."}
        </span>
      </div>
    </form>
  );
}
