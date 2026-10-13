import { useDialogs } from "./Dialogs";
import { useState } from "react";
import type { Answer, Result } from "../functions/src/types";
interface Props {
  draftKey: string;
  questions: [string, string];
  initial?: Answer | Result | null;
  save: (body: unknown) => Promise<Answer | Result>;
  notify: (message: string) => void;
}
interface Draft {
  q1: string;
  q2: string;
  version: number;
  expires: number;
  requestId: string;
}
function recover(key: string, initial: Props["initial"]): Draft {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const d = JSON.parse(raw) as Draft;
      if (d.expires > Date.now()) return d;
      localStorage.removeItem(key);
    }
  } catch {}
  return {
    q1: initial?.q1 ?? "",
    q2: initial?.q2 ?? "",
    version: initial?.version ?? 0,
    expires: Date.now() + 8 * 3600_000,
    requestId: crypto.randomUUID(),
  };
}
export function AnswerEditor({
  draftKey,
  questions,
  initial,
  save,
  notify,
}: Props) {
  const { confirm } = useDialogs();
  const [draft, setDraft] = useState(() => recover(draftKey, initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [durable, setDurable] = useState(true);
  const change = (field: "q1" | "q2", value: string) => {
    const next = {
      ...draft,
      [field]: value,
      expires: Date.now() + 8 * 3600_000,
      requestId: crypto.randomUUID(),
    };
    setDraft(next);
    setSaved(false);
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
      setDurable(true);
    } catch {
      setDurable(false);
    }
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await save(draft);
      setDraft({
        ...draft,
        version: result.version,
        requestId: crypto.randomUUID(),
      });
      localStorage.removeItem(draftKey);
      setSaved(true);
      notify("서버에 저장되었습니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const conflict = (initial?.version ?? 0) !== draft.version && !saved;
  return (
    <section className="editor" aria-label="응답 작성">
      {conflict && (
        <div className="notice warning">
          저장된 응답 버전이 변경되었습니다. 작성 중인 내용은 보존되어 있습니다.{" "}
          <button
            onClick={async () => {
              if (
                await confirm(
                  "현재 임시 작성 내용을 지우고 서버 응답을 불러올까요?",
                )
              ) {
                localStorage.removeItem(draftKey);
                setDraft(recover(draftKey, initial));
                setError("");
              }
            }}
          >
            서버 응답 다시 불러오기
          </button>
        </div>
      )}
      {questions.map((q, i) => (
        <div className="question" key={i}>
          <div className="eyebrow">질문 {i + 1}</div>
          <label htmlFor={draftKey + i}>{q}</label>
          <p className="muted">
            생각을 1~2문장으로 적어 보세요. 최대 1,500자까지 쓸 수 있습니다.
          </p>
          <textarea
            id={draftKey + i}
            value={i === 0 ? draft.q1 : draft.q2}
            onChange={(e) => change(i === 0 ? "q1" : "q2", e.target.value)}
            maxLength={1500}
            rows={5}
            disabled={busy}
          />
          <div className="count">
            {(i === 0 ? draft.q1 : draft.q2).length}/1,500
          </div>
        </div>
      ))}
      {error && (
        <div role="alert" className="notice error">
          {error} 다시 제출해도 같은 응답에 저장됩니다.
        </div>
      )}
      {!durable && (
        <div role="alert" className="notice warning">
          브라우저 임시 저장 공간을 사용할 수 없습니다. 이 화면을 닫기 전에
          답변을 복사하세요.
        </div>
      )}
      <div className="form-footer">
        <span className="muted">
          {saved
            ? "✓ 서버 저장 완료"
            : "작성 내용은 이 기기에 최대 8시간 임시 보존됩니다."}
        </span>
        <button
          className="primary"
          onClick={submit}
          disabled={busy || !draft.q1.trim() || !draft.q2.trim() || conflict}
        >
          {busy ? "저장 중…" : initial ? "수정하여 제출" : "제출하기"}
        </button>
      </div>
    </section>
  );
}
export function SavedAnswers({
  questions,
  answer,
}: {
  questions: [string, string];
  answer?: Answer | Result | null;
}) {
  return (
    <section>
      {questions.map((q, i) => (
        <div className="question" key={q}>
          <div className="eyebrow">질문 {i + 1}</div>
          <h3>{q}</h3>
          <p className="answer-text">
            {answer ? (i === 0 ? answer.q1 : answer.q2) : "미제출"}
          </p>
        </div>
      ))}
    </section>
  );
}
