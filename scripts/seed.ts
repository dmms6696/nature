import { FileStore } from "../functions/src/store.js";
import { hash } from "../functions/src/domain.js";
import { ITEMS, type Session } from "../functions/src/types.js";
const store = new FileStore(".local/database.json");
const now = Date.now();
const s: Session = {
  id: "demo",
  owner: "local-teacher",
  title: "동백꽃 · 1학년 자연 탐구 (가상 데이터)",
  phase: "INDIVIDUAL_OPEN",
  createdAt: now,
  updatedAt: now,
  students: [],
  responses: {},
  groups: [],
  groupsPublished: false,
  groupResults: {},
  audit: [],
};
for (let i = 1; i <= 15; i++) {
  const id = "student" + String(i).padStart(2, "0");
  s.students.push({
    id,
    name: "학생 " + String(i).padStart(2, "0"),
    codeHash: hash("demo-code-" + i),
    zepId: null,
    bindingVersion: 0,
    lastActiveAt: 0,
    excluded: false,
  });
  s.responses[id] = {};
  for (const item of ITEMS)
    s.responses[id]![item] = {
      q1: `[가상 응답 ${i}] ${item}의 장면을 보며 인물의 감정과 행동에 영향을 준다고 생각했다.`,
      q2: `[가상 응답 ${i}] 자연과 인간의 관계를 생각하고 필요한 만큼 이용하며 생명을 존중해야 한다.`,
      firstSubmittedAt: now,
      updatedAt: now,
      submitted: true,
      version: 1,
      requestId: "seed-" + item,
      nickname: "학생 " + String(i).padStart(2, "0"),
      zepId: "local",
    };
}
await store.update<Session, void>("sessions/demo", (v) => {
  if (v)
    throw new Error(
      "demo 수업이 이미 있습니다. 덮어쓰지 않습니다. 교사 화면에서 삭제 후 다시 실행하세요.",
    );
  return { value: s, result: undefined };
});
console.log("가상 학생 15명·개인 응답 60개 생성: demo");
