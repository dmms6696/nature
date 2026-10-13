import { randomInt, randomBytes, createHash } from "node:crypto";
import {
  ITEMS,
  type Session,
  type Group,
  type Phase,
  type Answer,
  type Result,
} from "./types.js";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(
  ok: unknown,
  status: number,
  message: string,
): asserts ok {
  if (!ok) throw new ApiError(status, message);
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export const id = () => randomBytes(12).toString("hex");
export function text(value: unknown, max = 1500) {
  assert(typeof value === "string", 400, "문자열을 입력하세요.");
  const s = value.trim();
  assert(
    s.length > 0 && s.length <= max,
    400,
    `공백 없이 1~${max}자를 입력하세요.`,
  );
  return s;
}
export function balancedGroups(
  ids: string[],
  count: number,
  rng: (max: number) => number = randomInt,
): Group[] {
  assert(
    Number.isInteger(count) && count >= 1 && count <= ids.length,
    400,
    "모둠 수를 확인하세요.",
  );
  assert(new Set(ids).size === ids.length, 400, "중복 학생입니다.");
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    assert(j >= 0 && j <= i, 500, "무작위 함수 오류");
    [a[i], a[j]] = [a[j], a[i]];
  }
  return Array.from({ length: count }, (_, n) => {
    const members = a.filter((_, i) => i % count === n);
    return { id: id(), number: n + 1, members, recorder: members[0] };
  });
}
export function validateGroups(s: Session, groups: Group[]) {
  const ids = s.students.filter((x) => !x.excluded).map((x) => x.id);
  const assigned = groups.flatMap((g) => g.members);
  assert(
    groups.length > 0 &&
      groups.every((g) => g.members.length && g.members.includes(g.recorder)),
    400,
    "빈 모둠 또는 잘못된 기록 담당자입니다.",
  );
  assert(
    new Set(groups.map((g) => g.id)).size === groups.length,
    400,
    "중복 모둠 ID입니다.",
  );
  assert(
    assigned.length === ids.length &&
      new Set(assigned).size === ids.length &&
      assigned.every((x) => ids.includes(x)),
    400,
    "학생 중복·누락·제외 명단을 확인하세요.",
  );
}
export function transition(s: Session, next: Phase) {
  const allowed: Record<Phase, Phase[]> = {
    PREPARING: ["INDIVIDUAL_OPEN"],
    INDIVIDUAL_OPEN: ["INDIVIDUAL_CLOSED"],
    INDIVIDUAL_CLOSED: ["INDIVIDUAL_OPEN", "GROUP_OPEN"],
    GROUP_OPEN: ["COMPLETED"],
    COMPLETED: [],
  };
  assert(
    allowed[s.phase].includes(next),
    409,
    "허용되지 않는 단계 전환입니다.",
  );
  if (next === "GROUP_OPEN")
    assert(s.groupsPublished, 409, "먼저 모둠을 확정·공개하세요.");
  if (next === "INDIVIDUAL_OPEN")
    assert(
      !s.groupsPublished,
      409,
      "공개한 모둠을 재설정한 뒤 개인 탐구를 재개하세요.",
    );
  s.phase = next;
}
export function saveAnswer(
  s: Session,
  studentId: string,
  item: string,
  input: { q1: unknown; q2: unknown; version: unknown; requestId: unknown },
): Answer {
  assert(
    ITEMS.includes(item as (typeof ITEMS)[number]),
    400,
    "잘못된 자연물입니다.",
  );
  const student = s.students.find((x) => x.id === studentId);
  assert(student, 403, "학생이 등록되지 않았습니다.");
  const answers = (s.responses[studentId] ??= {});
  const key = item as (typeof ITEMS)[number];
  const old = answers[key];
  const requestId = text(input.requestId, 100);
  if (old?.requestId === requestId) return old;
  assert(
    s.phase === "INDIVIDUAL_OPEN",
    423,
    "개인 탐구가 마감되어 수정할 수 없습니다.",
  );
  assert(
    input.version === (old?.version ?? 0),
    409,
    "다른 화면에서 수정되었습니다. 저장된 답변을 다시 확인하세요. 작성 내용은 임시 보존됩니다.",
  );
  const now = Date.now();
  const a: Answer = {
    q1: text(input.q1),
    q2: text(input.q2),
    version: (old?.version ?? 0) + 1,
    firstSubmittedAt: old?.firstSubmittedAt ?? now,
    updatedAt: now,
    submitted: true,
    requestId,
    nickname: student.name,
    zepId: student.zepId ?? "local",
  };
  answers[key] = a;
  return a;
}
export function saveResult(
  s: Session,
  studentId: string,
  input: { q1: unknown; q2: unknown; version: unknown; requestId: unknown },
): Result {
  assert(
    s.groupsPublished && s.phase === "GROUP_OPEN",
    423,
    "모둠 활동을 작성할 수 있는 단계가 아닙니다.",
  );
  const group = s.groups.find((x) => x.members.includes(studentId));
  assert(
    group && group.recorder === studentId,
    403,
    "기록 담당자만 공동 결론을 제출할 수 있습니다.",
  );
  const old = s.groupResults[group.id];
  const requestId = text(input.requestId, 100);
  if (old?.requestId === requestId) return old;
  assert(
    input.version === (old?.version ?? 0),
    409,
    "다른 화면에서 결론이 수정되었습니다. 새로고침 후 확인하세요.",
  );
  const now = Date.now();
  return (s.groupResults[group.id] = {
    q1: text(input.q1),
    q2: text(input.q2),
    version: (old?.version ?? 0) + 1,
    firstSubmittedAt: old?.firstSubmittedAt ?? now,
    updatedAt: now,
    submittedBy: studentId,
    requestId,
  });
}
export function publicSession(s: Session) {
  return {
    id: s.id,
    title: s.title,
    phase: s.phase,
    groupsPublished: s.groupsPublished,
    updatedAt: s.updatedAt,
  };
}
export function teacherSession(s: Session) {
  return {
    ...s,
    students: s.students.map(({ codeHash, ...student }) => student),
  };
}
export function audit(s: Session, action: string, actor: string) {
  s.updatedAt = Math.max(Date.now(), s.updatedAt + 1);
  s.audit.push({ at: s.updatedAt, action, actor });
  s.audit = s.audit.slice(-100);
}
export function csvCell(v: unknown) {
  const s = String(v ?? "");
  return (
    '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
  );
}
