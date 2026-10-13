import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balancedGroups,
  saveAnswer,
  saveResult,
  transition,
  validateGroups,
  csvCell,
} from "../functions/src/domain.js";
import type { Session } from "../functions/src/types.js";
export function fixture(n = 15): Session {
  return {
    id: "classroom",
    owner: "local-teacher",
    title: "테스트",
    phase: "INDIVIDUAL_OPEN",
    createdAt: 1,
    updatedAt: 1,
    students: Array.from({ length: n }, (_, i) => ({
      id: "s" + i,
      name: "학생 " + i,
      codeHash: "",
      zepId: null,
      bindingVersion: 0,
      lastActiveAt: 0,
      excluded: false,
    })),
    responses: {},
    groups: [],
    groupsPublished: false,
    groupResults: {},
    audit: [],
  };
}
test("15명 균등 편성, 중복 누락 없음", () => {
  const s = fixture();
  const groups = balancedGroups(
    s.students.map((x) => x.id),
    5,
    (max) => max - 1,
  );
  assert.deepEqual(
    groups.map((x) => x.members.length),
    [3, 3, 3, 3, 3],
  );
  validateGroups(s, groups);
});
test("1~30명 모든 모둠 수에서 균등, 입력 명단 불변", () => {
  for (let n = 1; n <= 30; n++)
    for (let k = 1; k <= n; k++) {
      const ids = Array.from({ length: n }, (_, i) => String(i));
      const copy = [...ids];
      const groups = balancedGroups(ids, k, () => 0);
      assert.deepEqual(ids, copy);
      assert.equal(new Set(groups.flatMap((x) => x.members)).size, n);
      const sizes = groups.map((x) => x.members.length);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    }
});
test("무효 모둠 수와 중복 학생 차단", () => {
  assert.throws(() => balancedGroups(["a"], 0));
  assert.throws(() => balancedGroups(["a", "a"], 1));
});
test("개인 응답 수정·재시도·충돌·최초 시각 유지", () => {
  const s = fixture();
  const a = saveAnswer(s, "s0", "potato", {
    q1: "첫째",
    q2: "둘째",
    version: 0,
    requestId: "one",
  });
  assert.equal(a.version, 1);
  assert.equal(
    saveAnswer(s, "s0", "potato", {
      q1: "첫째",
      q2: "둘째",
      version: 0,
      requestId: "one",
    }).version,
    1,
  );
  assert.throws(() =>
    saveAnswer(s, "s0", "potato", {
      q1: "새",
      q2: "새",
      version: 0,
      requestId: "two",
    }),
  );
  const b = saveAnswer(s, "s0", "potato", {
    q1: "수정",
    q2: "수정",
    version: 1,
    requestId: "two",
  });
  assert.equal(b.version, 2);
  assert.equal(b.firstSubmittedAt, a.firstSubmittedAt);
  saveAnswer(s, "s1", "potato", {
    q1: "학생B",
    q2: "다른 응답",
    version: 0,
    requestId: "three",
  });
  assert.equal(Object.keys(s.responses).length, 2);
});
test("공백·과도한 입력·마감 수정 차단", () => {
  const s = fixture();
  for (const q1 of [" ", "가".repeat(1501)])
    assert.throws(() =>
      saveAnswer(s, "s0", "flower", {
        q1,
        q2: "정상",
        version: 0,
        requestId: "x",
      }),
    );
  s.phase = "INDIVIDUAL_CLOSED";
  assert.throws(() =>
    saveAnswer(s, "s0", "flower", {
      q1: "정상",
      q2: "정상",
      version: 0,
      requestId: "x",
    }),
  );
});
test("단계 전환 및 기록 담당자 권한·결론 충돌", () => {
  const s = fixture(3);
  transition(s, "INDIVIDUAL_CLOSED");
  assert.throws(() => transition(s, "GROUP_OPEN"));
  s.groups = balancedGroups(
    s.students.map((x) => x.id),
    1,
    () => 0,
  );
  s.groupsPublished = true;
  transition(s, "GROUP_OPEN");
  const g = s.groups[0];
  assert.throws(() =>
    saveResult(s, g.members.find((x) => x !== g.recorder)!, {
      q1: "하나",
      q2: "둘",
      version: 0,
      requestId: "r",
    }),
  );
  const result = saveResult(s, g.recorder, {
    q1: "하나",
    q2: "둘",
    version: 0,
    requestId: "r",
  });
  assert.equal(result.version, 1);
  assert.throws(() =>
    saveResult(s, g.recorder, {
      q1: "다른",
      q2: "둘",
      version: 0,
      requestId: "new",
    }),
  );
  transition(s, "COMPLETED");
  assert.throws(() =>
    saveResult(s, g.recorder, {
      q1: "하나",
      q2: "둘",
      version: 1,
      requestId: "r2",
    }),
  );
});
test("CSV 수식 삽입 방지와 따옴표 이스케이프", () => {
  assert.equal(csvCell("=SUM(1,2)"), '"\'=SUM(1,2)"');
  assert.equal(csvCell('말 "한글"'), '"말 ""한글"""');
});
