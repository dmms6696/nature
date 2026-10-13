import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../functions/src/app.js";
import { FileStore } from "../functions/src/store.js";
import { hash } from "../functions/src/domain.js";
import type { Session, Launch } from "../functions/src/types.js";
function fixture(n = 15): Session {
  return {
    id: "classroom",
    owner: "local-teacher",
    title: "테스트",
    phase: "INDIVIDUAL_OPEN",
    createdAt: 1,
    updatedAt: 1,
    students: Array.from({ length: n }, (_, i) => ({
      id: "s" + i,
      name: i < 2 ? "동명이인" : "학생 " + i,
      codeHash: hash("code-" + i),
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
const origin = "http://127.0.0.1:5173",
  secret = "s".repeat(40);
const headers = { "X-Classroom-Request": "1", Origin: origin };
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "nature-"));
  const store = new FileStore(join(dir, "db.json"));
  await store.update<Session, void>("sessions/classroom", () => ({
    value: fixture(),
    result: undefined,
  }));
  const app = createApp(store, {
    local: true,
    origin,
    bridgeSecret: () => secret,
    teacherUids: () => [],
  });
  const teacher = request.agent(app);
  await teacher
    .post("/api/dev/login")
    .set(headers)
    .send({ role: "teacher" })
    .expect(200);
  return {
    dir,
    store,
    app,
    teacher,
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
}
async function launch(
  app: ReturnType<typeof createApp>,
  name: string,
  playerId: string,
  route = "potato",
) {
  const r = await request(app)
    .post("/api/zep/launch")
    .set("X-Zep-Secret", secret)
    .send({ sessionId: "classroom", name, playerId, route })
    .expect(200);
  return new URL(r.body.url).hash.slice("#launch=".length);
}
test("ZEP 자동 이름·동명이인 코드·단일 사용·재접속·위조 차단", async () => {
  const t = await setup();
  try {
    const a = request.agent(t.app);
    let token = await launch(t.app, "동명이인", "player-a");
    await a
      .post("/api/redeem")
      .set(headers)
      .send({ token })
      .expect(200)
      .expect((r) => assert.equal(r.body.needsCode, true));
    await a
      .post("/api/redeem")
      .set(headers)
      .send({ token, code: "wrong" })
      .expect(403);
    await a
      .post("/api/redeem")
      .set(headers)
      .send({ token, code: "code-1" })
      .expect(200);
    await request(t.app)
      .post("/api/redeem")
      .set(headers)
      .send({ token, code: "code-1" })
      .expect(401);
    const me = await a.get("/api/student").expect(200);
    assert.equal(me.body.student.id, "s1");
    assert.equal(me.body.student.name, "동명이인");
    assert.ok(!JSON.stringify(me.body).includes("codeHash"));
    token = await launch(t.app, "동명이인", "player-a", "branch");
    await request
      .agent(t.app)
      .post("/api/redeem")
      .set(headers)
      .send({ token })
      .expect(200)
      .expect((r) => assert.equal(r.body.route, "branch"));
    await request(t.app)
      .post("/api/zep/launch")
      .send({
        sessionId: "classroom",
        name: "동명이인",
        playerId: "player-a",
        route: "potato",
      })
      .expect(403);
    await request(t.app)
      .post("/api/zep/launch")
      .set("X-Zep-Secret", secret)
      .send({
        sessionId: "classroom",
        name: "이름 변경",
        playerId: "player-a",
        route: "potato",
      })
      .expect(403);
    await a.get("/api/teacher/sessions").expect(403);
    await a
      .post("/api/student/responses/potato")
      .send({ q1: "a", q2: "b", version: 0, requestId: "no-csrf" })
      .expect(403);
    const stale = "bad-expired";
    await t.store.update<Launch, void>("launches/" + hash(stale), () => ({
      value: {
        sessionId: "classroom",
        name: "동명이인",
        zepId: "p",
        route: "potato",
        expiresAt: 0,
        used: false,
        attempts: 0,
      },
      result: undefined,
    }));
    await a.post("/api/redeem").set(headers).send({ token: stale }).expect(401);
  } finally {
    await t.dispose();
  }
});
test("15명 동시 제출·4/4·중복 수정·마감·모둠 공개·타 모둠 차단·공동 결론·내보내기", async () => {
  const t = await setup();
  try {
    const students = Array.from({ length: 15 }, () => request.agent(t.app));
    await Promise.all(
      students.map((a, i) =>
        a
          .post("/api/dev/login")
          .set(headers)
          .send({ sessionId: "classroom", studentId: "s" + i })
          .expect(200),
      ),
    );
    await Promise.all(
      students.map((a, i) =>
        a
          .post("/api/student/responses/potato")
          .set(headers)
          .send({
            q1: `학생 ${i}`,
            q2: "자연과 함께",
            version: 0,
            requestId: "p" + i,
          })
          .expect(200),
      ),
    );
    for (const item of ["branch", "flower", "rooster"])
      await students[0]
        .post("/api/student/responses/" + item)
        .set(headers)
        .send({
          q1: "긴 한글 " + item,
          q2: "<script>alert(1)</script>",
          version: 0,
          requestId: item,
        })
        .expect(200);
    const mine = await students[0].get("/api/student");
    assert.equal(Object.keys(mine.body.responses).length, 4);
    assert.equal(mine.body.responses.flower.q2, "<script>alert(1)</script>");
    assert.ok(!JSON.stringify(mine.body).includes("학생 1"));
    const body = {
      q1: "수정",
      q2: "자연 보호",
      version: 1,
      requestId: "p0-new",
    };
    await students[0]
      .post("/api/student/responses/potato")
      .set(headers)
      .send(body)
      .expect(200);
    await students[0]
      .post("/api/student/responses/potato")
      .set(headers)
      .send(body)
      .expect(200)
      .expect((r) => assert.equal(r.body.version, 2));
    await t.teacher
      .post("/api/teacher/sessions/classroom/phase")
      .set(headers)
      .send({ phase: "INDIVIDUAL_CLOSED" })
      .expect(200);
    await students[0]
      .post("/api/student/responses/branch")
      .set(headers)
      .send({ q1: "수정", q2: "수정", version: 1, requestId: "closed" })
      .expect(423);
    await t.teacher
      .post("/api/teacher/sessions/classroom/shuffle")
      .set(headers)
      .send({ count: 5 })
      .expect(200);
    await students[0].get("/api/student/group").expect(403);
    let current = (await t.teacher.get("/api/teacher/sessions/classroom")).body;
    await t.teacher
      .post("/api/teacher/sessions/classroom/publish")
      .set(headers)
      .send({ revision: current.updatedAt })
      .expect(200);
    await students[0].get("/api/student/group").expect(403);
    await t.teacher
      .post("/api/teacher/sessions/classroom/phase")
      .set(headers)
      .send({ phase: "GROUP_OPEN" })
      .expect(200);
    const group = (await students[0].get("/api/student/group").expect(200))
      .body;
    assert.equal(group.members.length, 3);
    assert.equal(Object.keys(group).sort().join(","), "group,members,result");
    await students[0].get("/api/student/group?groupId=other").expect(403);
    const recorder = Number(group.group.recorder.slice(1));
    await students[recorder]
      .post("/api/student/group/result")
      .set(headers)
      .send({
        q1: "감정·자원·아름다움·생명",
        q2: "다른 생명과 공존",
        version: 0,
        requestId: "group-result",
      })
      .expect(200);
    const non = group.group.members.find(
      (x: string) => x !== group.group.recorder,
    );
    await students[Number(non.slice(1))]
      .post("/api/student/group/result")
      .set(headers)
      .send({ q1: "다른", q2: "답변", version: 0, requestId: "forbidden" })
      .expect(403);
    const csv = await t.teacher
      .get("/api/teacher/sessions/classroom/export")
      .expect(200);
    assert.ok(csv.text.includes("다른 생명과 공존"));
    await t.teacher
      .post("/api/teacher/sessions/classroom/phase")
      .set(headers)
      .send({ phase: "COMPLETED" })
      .expect(200);
    await students[recorder]
      .post("/api/student/group/result")
      .set(headers)
      .send({ q1: "수정", q2: "답변", version: 1, requestId: "closed" })
      .expect(423);
    const restored = new FileStore(join(t.dir, "db.json"));
    const saved = await restored.read<Session>("sessions/classroom");
    assert.equal(saved?.phase, "COMPLETED");
    assert.equal(Object.keys(saved!.responses).length, 15);
    assert.equal(Object.keys(saved!.responses.s0).length, 4);
  } finally {
    await t.dispose();
  }
});
test("운영 모드에 개발 우회 없음, 잘못된 출처 차단, 저장 오류는 성공으로 표시하지 않음", async () => {
  const t = await setup();
  try {
    const prod = createApp(t.store, {
      local: false,
      origin: "https://example.com",
      bridgeSecret: () => secret,
      teacherUids: () => [],
    });
    await request(prod)
      .post("/api/dev/login")
      .set(headers)
      .send({ role: "teacher" })
      .expect(404);
    await request(prod).get("/api/dev/students").expect(404);
    await t.teacher
      .post("/api/teacher/sessions/classroom/phase")
      .set({ ...headers, Origin: "https://attacker.example" })
      .send({ phase: "INDIVIDUAL_CLOSED" })
      .expect(403);
    const failed = createApp(
      {
        read: async () => undefined,
        list: async () => [],
        update: async () => {
          throw new Error("disk failure");
        },
      },
      {
        local: true,
        origin,
        bridgeSecret: () => secret,
        teacherUids: () => [],
      },
    );
    await request(failed)
      .post("/api/dev/login")
      .set(headers)
      .send({ role: "teacher" })
      .expect(503);
    await request(t.app)
      .post("/api/redeem")
      .set(headers)
      .send({ token: "guessed-token" })
      .expect(401);
  } finally {
    await t.dispose();
  }
});
test("교사 연결 초기화는 기존 학생 쿠키를 무효화", async () => {
  const t = await setup();
  try {
    const a = request.agent(t.app);
    await a
      .post("/api/dev/login")
      .set(headers)
      .send({ sessionId: "classroom", studentId: "s0" })
      .expect(200);
    await t.teacher
      .post("/api/teacher/sessions/classroom/rebind")
      .set(headers)
      .send({ studentId: "s0" })
      .expect(200);
    await a.get("/api/student").expect(401);
  } finally {
    await t.dispose();
  }
});
test("수업 생성·명단 동명이인·코드 해시 비공개·초기화·삭제·교사 소유권", async () => {
  const t = await setup();
  try {
    const created = (
      await t.teacher
        .post("/api/teacher/sessions")
        .set(headers)
        .send({ title: "새 수업" })
        .expect(200)
    ).body;
    await t.teacher
      .post("/api/teacher/sessions/" + created.id + "/phase")
      .set(headers)
      .send({ phase: "INDIVIDUAL_OPEN" })
      .expect(409);
    const roster = (
      await t.teacher
        .post("/api/teacher/sessions/" + created.id + "/roster")
        .set(headers)
        .send({ names: ["동명", "동명", "다른 학생"] })
        .expect(200)
    ).body;
    assert.equal(roster.codes.length, 3);
    assert.notEqual(roster.codes[0].id, roster.codes[1].id);
    assert.notEqual(roster.codes[0].code, roster.codes[1].code);
    assert.ok(!JSON.stringify(roster.session).includes("codeHash"));
    await t.teacher
      .post("/api/teacher/sessions/" + created.id + "/phase")
      .set(headers)
      .send({ phase: "INDIVIDUAL_OPEN" })
      .expect(200);
    const a = request.agent(t.app);
    await a
      .post("/api/dev/login")
      .set(headers)
      .send({ sessionId: created.id, studentId: roster.codes[0].id })
      .expect(200);
    await a
      .post("/api/student/responses/potato")
      .set(headers)
      .send({ q1: "응답", q2: "인간 관계", version: 0, requestId: "new" })
      .expect(200);
    await t.teacher
      .post("/api/teacher/sessions/" + created.id + "/reset")
      .set(headers)
      .send({ confirm: "wrong" })
      .expect(400);
    await t.teacher
      .post("/api/teacher/sessions/" + created.id + "/reset")
      .set(headers)
      .send({ confirm: created.id })
      .expect(200);
    await a.get("/api/student").expect(401);
    const reset = await t.store.read<Session>("sessions/" + created.id);
    assert.equal(reset?.phase, "PREPARING");
    assert.equal(Object.keys(reset!.responses).length, 0);
    assert.notEqual(reset!.students[0].codeHash, hash(roster.codes[0].code));
    await t.store.update<Session, void>("sessions/other-owner", () => ({
      value: { ...fixture(), id: "other-owner", owner: "someone-else" },
      result: undefined,
    }));
    await t.teacher.get("/api/teacher/sessions/other-owner").expect(404);
    await t.teacher
      .delete("/api/teacher/sessions/" + created.id)
      .set(headers)
      .send({ confirm: created.id })
      .expect(200);
    await t.teacher.get("/api/teacher/sessions/" + created.id).expect(404);
  } finally {
    await t.dispose();
  }
});
test("수동 편성 변경·편성 버전 충돌·학생 제외·공개 후 재편성 경고 확인", async () => {
  const t = await setup();
  try {
    await t.teacher
      .post("/api/teacher/sessions/classroom/phase")
      .set(headers)
      .send({ phase: "INDIVIDUAL_CLOSED" })
      .expect(200);
    await t.teacher
      .post("/api/teacher/sessions/classroom/exclude")
      .set(headers)
      .send({ studentId: "s14", excluded: true })
      .expect(200);
    await t.teacher
      .post("/api/teacher/sessions/classroom/shuffle")
      .set(headers)
      .send({ targetSize: 3 })
      .expect(200);
    let s = (await t.teacher.get("/api/teacher/sessions/classroom")).body;
    assert.equal(s.groups.flatMap((g: any) => g.members).length, 14);
    assert.ok(!s.groups.flatMap((g: any) => g.members).includes("s14"));
    await t.teacher
      .post("/api/teacher/sessions/classroom/draft")
      .set(headers)
      .send({ groups: s.groups, revision: 0 })
      .expect(409);
    const groups = structuredClone(s.groups);
    [groups[0].members[0], groups[1].members[0]] = [
      groups[1].members[0],
      groups[0].members[0],
    ];
    groups.forEach((g: any) => (g.recorder = g.members[0]));
    await t.teacher
      .post("/api/teacher/sessions/classroom/draft")
      .set(headers)
      .send({ groups, revision: s.updatedAt })
      .expect(200);
    s = (await t.teacher.get("/api/teacher/sessions/classroom")).body;
    await t.teacher
      .post("/api/teacher/sessions/classroom/publish")
      .set(headers)
      .send({ revision: s.updatedAt })
      .expect(200);
    await t.teacher
      .post("/api/teacher/sessions/classroom/shuffle")
      .set(headers)
      .send({ count: 5 })
      .expect(409);
    await t.teacher
      .post("/api/teacher/sessions/classroom/phase")
      .set(headers)
      .send({ phase: "GROUP_OPEN" })
      .expect(200);
    await t.teacher
      .post("/api/teacher/sessions/classroom/regroup")
      .set(headers)
      .send({ confirm: "wrong" })
      .expect(400);
    await t.teacher
      .post("/api/teacher/sessions/classroom/regroup")
      .set(headers)
      .send({ confirm: "classroom" })
      .expect(200);
    s = (await t.teacher.get("/api/teacher/sessions/classroom")).body;
    assert.equal(s.phase, "INDIVIDUAL_CLOSED");
    assert.equal(s.groupsPublished, false);
    assert.equal(s.groups.length, 0);
    await t.teacher
      .post("/api/teacher/sessions/classroom/phase")
      .set(headers)
      .send({ phase: "INDIVIDUAL_OPEN" })
      .expect(200);
  } finally {
    await t.dispose();
  }
});
test("토큰 동시 재사용은 한 번만 성공, 최초 코드 5회 실패는 차단", async () => {
  const t = await setup();
  try {
    const raw = await launch(t.app, "학생 2", "player-race");
    const results = await Promise.all(
      [0, 1].map(() =>
        request(t.app)
          .post("/api/redeem")
          .set(headers)
          .send({ token: raw, code: "code-2" }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
    const bad = await launch(t.app, "학생 3", "player-wrong");
    for (let i = 0; i < 5; i++)
      await request(t.app)
        .post("/api/redeem")
        .set(headers)
        .send({ token: bad, code: "incorrect" })
        .expect(403);
    await request(t.app)
      .post("/api/redeem")
      .set(headers)
      .send({ token: bad, code: "code-3" })
      .expect(401);
    await request(t.app)
      .post("/api/zep/launch")
      .set("X-Zep-Secret", secret)
      .send({
        sessionId: "classroom",
        name: "",
        playerId: "p",
        route: "potato",
      })
      .expect(400);
    await request(t.app)
      .post("/api/zep/launch")
      .set("X-Zep-Secret", secret)
      .send({
        sessionId: "classroom",
        name: "명단 밖",
        playerId: "p",
        route: "potato",
      })
      .expect(403);
  } finally {
    await t.dispose();
  }
});
