import express from "express";
import { getAuth } from "firebase-admin/auth";
import { timingSafeEqual } from "node:crypto";
import type {
  Auth,
  Launch,
  Session,
  Store,
  Group,
  Phase,
  Entry,
  EntryRoute,
} from "./types.js";
import { ITEMS } from "./types.js";
import {
  ApiError,
  assert,
  hash,
  token,
  id,
  text,
  balancedGroups,
  validateGroups,
  transition,
  saveAnswer,
  saveResult,
  publicSession,
  teacherSession,
  audit,
  csvCell,
} from "./domain.js";
import { examples } from "./content.js";
export interface Options {
  local: boolean;
  origin: string;
  bridgeSecret: () => string;
  teacherUids: () => string[];
}
const cookieName = "__session";
export function createApp(store: Store, options: Options) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  const route = (
    method: "get" | "post" | "delete",
    path: string,
    fn: (req: express.Request, res: express.Response) => Promise<unknown>,
  ) =>
    app[method](path, (req, res, next) => {
      Promise.resolve(fn(req, res)).catch(next);
    });
  async function rate(key: string, max: number) {
    await store.update<{ count: number; expiresAt: number }, void>(
      "limits/" + hash(key),
      (v) => {
        const now = Date.now();
        v = !v || v.expiresAt < now ? { count: 0, expiresAt: now + 60_000 } : v;
        assert(v.count < max, 429, "요청이 많습니다. 잠시 후 다시 시도하세요.");
        v.count++;
        return { value: v, result: undefined };
      },
    );
  }
  function csrf(req: express.Request) {
    assert(req.get("X-Classroom-Request") === "1", 403, "잘못된 요청입니다.");
    const origin = req.get("Origin");
    assert(
      !origin || origin === options.origin,
      403,
      "허용되지 않은 출처입니다.",
    );
  }
  function localOnly(req: express.Request) {
    assert(options.local, 404, "존재하지 않는 기능입니다.");
    assert(
      ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress ?? "",
      ),
      403,
      "로컬에서만 사용할 수 있습니다.",
    );
    csrf(req);
  }
  async function mint(res: express.Response, auth: Auth) {
    const raw = token();
    await store.update<Auth, void>("auth/" + hash(raw), () => ({
      value: auth,
      result: undefined,
    }));
    res.cookie(cookieName, raw, {
      httpOnly: true,
      secure: !options.local,
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(0, auth.expiresAt - Date.now()),
    });
  }
  async function authenticate(req: express.Request): Promise<Auth> {
    const bearer = req.get("Authorization");
    if (bearer?.startsWith("Bearer ")) {
      assert(
        !options.local,
        401,
        "로컬 모드에서는 개발 로그인 버튼을 사용하세요.",
      );
      const decoded = await getAuth().verifyIdToken(bearer.slice(7), true);
      assert(
        options.teacherUids().includes(decoded.uid),
        403,
        "등록된 교사 계정이 아닙니다.",
      );
      return {
        role: "teacher",
        uid: decoded.uid,
        expiresAt: decoded.exp * 1000,
      };
    }
    const raw = (req.get("Cookie") ?? "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    assert(raw, 401, "ZEP에서 화면을 다시 열어 주세요.");
    const auth = await store.read<Auth>("auth/" + hash(raw));
    assert(
      auth && auth.expiresAt > Date.now(),
      401,
      "접속 시간이 만료되었습니다. ZEP에서 다시 열어 주세요.",
    );
    if (auth.role === "teacher")
      assert(options.local, 401, "교사 인증을 다시 해 주세요.");
    return auth;
  }
  async function owned(req: express.Request, sid: string) {
    const auth = await authenticate(req);
    assert(auth.role === "teacher", 403, "교사 전용 기능입니다.");
    const s = await store.read<Session>("sessions/" + sid);
    assert(s && s.owner === auth.uid, 404, "수업을 찾을 수 없습니다.");
    return { s, auth };
  }
  async function student(req: express.Request) {
    const auth = await authenticate(req);
    assert(auth.role === "student", 403, "학생 화면으로 접속하세요.");
    const s = await store.read<Session>("sessions/" + auth.sessionId);
    const st = s?.students.find((x) => x.id === auth.studentId);
    assert(
      s && st && st.bindingVersion === auth.bindingVersion,
      401,
      "학생 연결이 변경되었습니다. ZEP에서 다시 접속하세요.",
    );
    if (options.local && auth.development)
      return { auth, s, st, entryRoute: "development" as const };
    const rawEntry = req.get("X-Zep-Entry");
    assert(rawEntry, 401, "해당 ZEP 오브젝트에서 화면을 다시 열어 주세요.");
    const entry = await store.read<Entry>("entries/" + hash(rawEntry));
    assert(
      entry &&
        entry.expiresAt > Date.now() &&
        entry.sessionId === s.id &&
        entry.studentId === st.id &&
        entry.bindingVersion === st.bindingVersion,
      401,
      "오브젝트 연결이 만료되거나 변경되었습니다. ZEP에서 다시 열어 주세요.",
    );
    return { auth, s, st, entryRoute: entry.route };
  }
  function groupFor(s: Session, studentId: string) {
    assert(
      s.groupsPublished && ["GROUP_OPEN", "COMPLETED"].includes(s.phase),
      403,
      "교사가 모둠 활동을 시작하면 확인할 수 있습니다.",
    );
    const g = s.groups.find((x) => x.members.includes(studentId));
    assert(g, 404, "모둠에 배정되지 않았습니다. 교사에게 알려 주세요.");
    return g;
  }
  route("get", "/api/config", async (_req, res) =>
    res.json({ local: options.local }),
  );
  route("post", "/api/logout", async (req, res) => {
    csrf(req);
    const raw = (req.get("Cookie") ?? "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (raw)
      await store.update("auth/" + hash(raw), () => ({
        value: undefined,
        result: null,
      }));
    res.clearCookie(cookieName, { path: "/" });
    res.json({ ok: true });
  });
  route("post", "/api/dev/login", async (req, res) => {
    localOnly(req);
    if (req.body.role === "teacher") {
      await mint(res, {
        role: "teacher",
        uid: "local-teacher",
        expiresAt: Date.now() + 8 * 3600_000,
      });
      return res.json({ ok: true });
    }
    const s = await store.read<Session>("sessions/" + req.body.sessionId);
    const st = s?.students.find((x) => x.id === req.body.studentId);
    assert(s && st, 404, "가상 학생이 없습니다. npm run seed를 실행하세요.");
    await mint(res, {
      role: "student",
      uid: st.id,
      sessionId: s.id,
      studentId: st.id,
      bindingVersion: st.bindingVersion,
      development: true,
      expiresAt: Date.now() + 8 * 3600_000,
    });
    res.json({ ok: true });
  });
  route("get", "/api/dev/students", async (req, res) => {
    assert(
      options.local &&
        ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress ?? "",
        ),
      404,
      "존재하지 않는 기능입니다.",
    );
    res.json(
      (await store.list<Session>("sessions")).map((s) => ({
        id: s.id,
        title: s.title,
        students: s.students.map((x) => ({ id: x.id, name: x.name })),
      })),
    );
  });
  route("post", "/api/zep/launch", async (req, res) => {
    const secret = options.bridgeSecret();
    const supplied = req.get("X-Zep-Secret") ?? "";
    assert(
      secret.length >= 32 &&
        supplied.length === secret.length &&
        timingSafeEqual(Buffer.from(supplied), Buffer.from(secret)),
      403,
      "ZEP 연결 키를 확인하세요.",
    );
    await rate("launch:" + req.ip, 120);
    const sid = text(req.body.sessionId, 100),
      name = text(req.body.name, 40),
      zepId = text(String(req.body.playerId ?? ""), 100),
      routeName = text(req.body.route, 30);
    assert(
      [...ITEMS, "group", "progress"].includes(
        routeName as (typeof ITEMS)[number],
      ),
      400,
      "잘못된 화면입니다.",
    );
    const s = await store.read<Session>("sessions/" + sid);
    assert(s && s.phase !== "PREPARING", 403, "교사가 수업을 시작해야 합니다.");
    const bound = s.students.find((x) => x.zepId === zepId);
    assert(
      bound ? bound.name === name : s.students.some((x) => x.name === name),
      403,
      "명단 또는 닉네임이 일치하지 않습니다. 교사에게 확인해 주세요.",
    );
    const raw = token();
    await store.update<Launch, void>("launches/" + hash(raw), () => ({
      value: {
        sessionId: sid,
        name,
        zepId,
        route: routeName,
        expiresAt: Date.now() + 90_000,
        used: false,
        attempts: 0,
      },
      result: undefined,
    }));
    res.json({
      ok: true,
      url: options.origin + "/#launch=" + raw,
      expiresIn: 90,
    });
  });
  route("post", "/api/redeem", async (req, res) => {
    csrf(req);
    await rate("redeem:" + req.ip, 60);
    const raw = text(req.body.token, 100),
      key = "launches/" + hash(raw);
    const launch = await store.read<Launch>(key);
    assert(
      launch &&
        !launch.used &&
        launch.expiresAt > Date.now() &&
        launch.attempts < 5,
      401,
      "접속 토큰이 만료되었거나 사용되었습니다. ZEP에서 다시 열어 주세요.",
    );
    const s = await store.read<Session>("sessions/" + launch.sessionId);
    assert(s, 401, "수업이 삭제되었습니다.");
    let st = s.students.find((x) => x.zepId === launch.zepId);
    if (!st) {
      if (!req.body.code)
        return res.json({
          needsCode: true,
          message:
            "교사에게 받은 개인 확인 코드를 입력하세요. 이름은 ZEP에서 자동으로 가져왔습니다.",
        });
      const codeHash = hash(String(req.body.code).trim().toLowerCase());
      st = s.students.find(
        (x) => x.name === launch.name && x.codeHash === codeHash && !x.zepId,
      );
      if (!st) {
        await store.update<Launch, void>(key, (v) => {
          assert(v, 401, "토큰이 없습니다.");
          v.attempts++;
          return { value: v, result: undefined };
        });
        throw new ApiError(
          403,
          "개인 확인 코드가 일치하지 않습니다. 5회 실패하면 ZEP에서 다시 열어 주세요.",
        );
      }
    }
    assert(
      st.name === launch.name,
      403,
      "닉네임이 변경되었습니다. 교사에게 확인해 주세요.",
    );
    const studentId = st.id;
    await store.update<Launch, void>(key, (v) => {
      assert(
        v && !v.used && v.expiresAt > Date.now() && v.attempts < 5,
        401,
        "이미 사용되었거나 만료된 토큰입니다.",
      );
      v.used = true;
      return { value: v, result: undefined };
    });
    const bindingVersion = await store.update<Session, number>(
      "sessions/" + s.id,
      (current) => {
        assert(current, 401, "수업이 삭제되었습니다.");
        const target = current.students.find((x) => x.id === studentId);
        assert(
          target && target.name === launch.name,
          401,
          "학생 명단이 변경되었습니다.",
        );
        assert(
          !target.zepId || target.zepId === launch.zepId,
          403,
          "다른 ZEP 연결이 있습니다. 교사가 연결을 초기화해야 합니다.",
        );
        assert(
          !current.students.some(
            (x) => x.id !== studentId && x.zepId === launch.zepId,
          ),
          403,
          "이미 연결된 플레이어입니다.",
        );
        if (!target.zepId)
          assert(
            target.codeHash ===
              hash(
                String(req.body.code ?? "")
                  .trim()
                  .toLowerCase(),
              ),
            403,
            "확인 코드가 변경되었습니다.",
          );
        target.zepId = launch.zepId;
        target.lastActiveAt = Date.now();
        return { value: current, result: target.bindingVersion };
      },
    );
    await mint(res, {
      role: "student",
      uid: studentId,
      sessionId: s.id,
      studentId,
      bindingVersion,
      expiresAt: Date.now() + 8 * 3600_000,
    });
    const entryToken = token();
    await store.update<Entry, void>("entries/" + hash(entryToken), () => ({
      value: {
        sessionId: s.id,
        studentId,
        bindingVersion,
        route: launch.route as EntryRoute,
        expiresAt: Date.now() + 8 * 3600_000,
      },
      result: undefined,
    }));
    res.json({ ok: true, route: launch.route, entryToken });
  });
  route("get", "/api/student", async (req, res) => {
    const { auth, s, st, entryRoute } = await student(req);
    const own = s.responses[auth.studentId!] ?? {};
    const responses =
      entryRoute === "development"
        ? own
        : ITEMS.includes(entryRoute as (typeof ITEMS)[number]) &&
            own[entryRoute as (typeof ITEMS)[number]]
          ? { [entryRoute]: own[entryRoute as (typeof ITEMS)[number]] }
          : {};
    res.json({
      session: publicSession(s),
      student: { id: st.id, name: st.name },
      responses,
      completedItems: ITEMS.filter((item) => own[item]?.submitted),
      entryRoute,
    });
  });
  route("post", "/api/student/heartbeat", async (req, res) => {
    csrf(req);
    const { auth, s } = await student(req);
    await store.update<Session, void>("sessions/" + s.id, (v) => {
      assert(v, 404, "수업이 없습니다.");
      const st = v.students.find((x) => x.id === auth.studentId);
      assert(
        st && st.bindingVersion === auth.bindingVersion,
        401,
        "연결이 변경되었습니다.",
      );
      st.lastActiveAt = Date.now();
      return { value: v, result: undefined };
    });
    res.json({ ok: true });
  });
  route("post", "/api/student/responses/:item", async (req, res) => {
    csrf(req);
    const { auth, s, entryRoute } = await student(req);
    assert(
      entryRoute === "development" || entryRoute === String(req.params.item),
      403,
      "이 자연물의 ZEP 제출 오브젝트를 조작한 뒤 작성하세요.",
    );
    await rate("save:" + s.id + auth.studentId, 30);
    const answer = await store.update<Session, unknown>(
      "sessions/" + s.id,
      (v) => {
        assert(
          v &&
            v.students.some(
              (x) =>
                x.id === auth.studentId &&
                x.bindingVersion === auth.bindingVersion,
            ),
          401,
          "연결이 변경되었습니다.",
        );
        const result = saveAnswer(
          v,
          auth.studentId!,
          String(req.params.item),
          req.body,
        );
        audit(v, "response:" + req.params.item, auth.studentId!);
        return { value: v, result };
      },
    );
    res.json(answer);
  });
  route("get", "/api/student/group", async (req, res) => {
    const { auth, s, entryRoute } = await student(req);
    assert(
      entryRoute === "development" || entryRoute === "group",
      403,
      "ZEP의 모둠 활동 오브젝트에서 열어 주세요.",
    );
    const g = groupFor(s, auth.studentId!);
    assert(
      !req.query.groupId || req.query.groupId === g.id,
      403,
      "다른 모둠에는 접근할 수 없습니다.",
    );
    res.json({
      group: g,
      members: g.members.map((sid) => ({
        id: sid,
        name: s.students.find((x) => x.id === sid)!.name,
        responses: s.responses[sid] ?? {},
      })),
      result: s.groupResults[g.id] ?? null,
    });
  });
  route("post", "/api/student/group/result", async (req, res) => {
    csrf(req);
    const { auth, s, entryRoute } = await student(req);
    assert(
      entryRoute === "development" || entryRoute === "group",
      403,
      "ZEP의 모둠 활동 오브젝트에서 열어 주세요.",
    );
    const result = await store.update<Session, unknown>(
      "sessions/" + s.id,
      (v) => {
        assert(
          v &&
            v.students.some(
              (x) =>
                x.id === auth.studentId &&
                x.bindingVersion === auth.bindingVersion,
            ),
          401,
          "연결이 변경되었습니다.",
        );
        const result = saveResult(v, auth.studentId!, req.body);
        audit(v, "group-result", auth.studentId!);
        return { value: v, result };
      },
    );
    res.json(result);
  });
  route("get", "/api/teacher/sessions", async (req, res) => {
    const auth = await authenticate(req);
    assert(auth.role === "teacher", 403, "교사 전용 기능입니다.");
    res.json(
      (await store.list<Session>("sessions"))
        .filter((s) => s.owner === auth.uid)
        .map(publicSession),
    );
  });
  route("post", "/api/teacher/sessions", async (req, res) => {
    csrf(req);
    const auth = await authenticate(req);
    assert(auth.role === "teacher", 403, "교사 전용 기능입니다.");
    const sid = id();
    const now = Date.now();
    const s: Session = {
      id: sid,
      owner: auth.uid,
      title: text(req.body.title, 80),
      phase: "PREPARING",
      createdAt: now,
      updatedAt: now,
      students: [],
      responses: {},
      groups: [],
      groupsPublished: false,
      groupResults: {},
      audit: [],
    };
    await store.update<Session, void>("sessions/" + sid, () => ({
      value: s,
      result: undefined,
    }));
    res.json(publicSession(s));
  });
  route("get", "/api/teacher/sessions/:sid", async (req, res) => {
    const { s } = await owned(req, String(req.params.sid));
    res.json({ ...teacherSession(s), examples });
  });
  route("post", "/api/teacher/sessions/:sid/:operation", async (req, res) => {
    csrf(req);
    const { s, auth } = await owned(req, String(req.params.sid));
    const operation = String(req.params.operation);
    const response = await store.update<Session, unknown>(
      "sessions/" + s.id,
      (v) => {
        assert(v && v.owner === auth.uid, 404, "수업이 없습니다.");
        let extra: unknown = {};
        if (operation === "roster") {
          assert(
            v.phase === "PREPARING",
            409,
            "준비 중에만 명단을 등록할 수 있습니다.",
          );
          assert(
            Array.isArray(req.body.names) &&
              req.body.names.length >= 1 &&
              req.body.names.length <= 45,
            400,
            "1~45명의 이름을 등록하세요.",
          );
          assert(
            v.students.length === 0,
            409,
            "이미 등록된 명단입니다. 초기화 후 다시 등록하세요.",
          );
          const codes: { id: string; name: string; code: string }[] = [];
          v.students = req.body.names.map((n: unknown) => {
            const name = text(n, 40),
              studentId = id(),
              code = token().slice(0, 12).toLowerCase();
            codes.push({ id: studentId, name, code });
            return {
              id: studentId,
              name,
              codeHash: hash(code),
              zepId: null,
              bindingVersion: 0,
              lastActiveAt: 0,
              excluded: false,
            };
          });
          extra = { codes };
        } else if (operation === "phase") {
          assert(v.students.length > 0, 409, "먼저 학생 명단을 등록하세요.");
          transition(v, req.body.phase as Phase);
        } else if (operation === "shuffle") {
          assert(
            v.phase === "INDIVIDUAL_CLOSED" && !v.groupsPublished,
            409,
            "개인 탐구 마감 후, 공개 전에만 편성할 수 있습니다.",
          );
          const ids = v.students.filter((x) => !x.excluded).map((x) => x.id);
          const count =
            req.body.count ??
            Math.ceil(ids.length / (req.body.targetSize ?? 3));
          v.groups = balancedGroups(ids, count);
        } else if (operation === "draft") {
          assert(
            v.phase === "INDIVIDUAL_CLOSED" && !v.groupsPublished,
            409,
            "공개 전만 모둠 구성을 수정할 수 있습니다.",
          );
          assert(
            req.body.revision === v.updatedAt,
            409,
            "현황이 변경되었습니다. 새로고침 후 편성을 확인하세요.",
          );
          assert(
            Array.isArray(req.body.groups) &&
              req.body.groups.length === v.groups.length,
            400,
            "모둠 수를 확인하세요.",
          );
          const groups: Group[] = req.body.groups.map((g: Group, i: number) => {
            assert(
              g &&
                Array.isArray(g.members) &&
                g.members.every((x) => typeof x === "string") &&
                v.groups.some((x) => x.id === g.id),
              400,
              "모둠 ID와 학생 명단을 확인하세요.",
            );
            return {
              id: text(g.id, 100),
              number: i + 1,
              members: g.members,
              recorder: text(g.recorder, 100),
            };
          });
          validateGroups(v, groups);
          v.groups = groups;
        } else if (operation === "publish") {
          assert(
            v.phase === "INDIVIDUAL_CLOSED" && !v.groupsPublished,
            409,
            "이미 공개했거나 공개할 수 없는 단계입니다.",
          );
          assert(
            req.body.revision === v.updatedAt,
            409,
            "편성이 변경되었습니다. 확인 후 다시 공개하세요.",
          );
          validateGroups(v, v.groups);
          v.groupsPublished = true;
        } else if (operation === "exclude") {
          assert(
            v.phase === "INDIVIDUAL_CLOSED" && !v.groupsPublished,
            409,
            "공개 전 마감 단계에서만 제외할 수 있습니다.",
          );
          const st = v.students.find((x) => x.id === req.body.studentId);
          assert(st, 404, "학생이 없습니다.");
          st.excluded = !!req.body.excluded;
          v.groups = [];
        } else if (operation === "regroup") {
          assert(
            req.body.confirm === v.id,
            400,
            "수업 ID를 입력해 재설정을 확인하세요.",
          );
          assert(v.phase !== "COMPLETED", 409, "종료된 수업입니다.");
          v.groups = [];
          v.groupsPublished = false;
          v.groupResults = {};
          v.phase = "INDIVIDUAL_CLOSED";
        } else if (operation === "rebind") {
          const st = v.students.find((x) => x.id === req.body.studentId);
          assert(st, 404, "학생이 없습니다.");
          const code = token().slice(0, 12).toLowerCase();
          if (req.body.name) st.name = text(req.body.name, 40);
          st.zepId = null;
          st.bindingVersion++;
          st.codeHash = hash(code);
          extra = { codes: [{ id: st.id, name: st.name, code }] };
        } else if (operation === "bulk-codes") {
          assert(
            Array.isArray(req.body.entries) &&
              req.body.entries.length >= 1 &&
              req.body.entries.length <= 45,
            400,
            "1~45명의 이름과 코드를 입력하세요.",
          );
          const changes = req.body.entries.map(
            (entry: {
              name?: unknown;
              code?: unknown;
              studentId?: unknown;
            }) => {
              assert(
                entry && typeof entry === "object",
                400,
                "명단 형식을 확인하세요.",
              );
              const name = text(entry.name, 40);
              const matches = v.students.filter((x) =>
                entry.studentId
                  ? x.id === entry.studentId && x.name === name
                  : x.name === name,
              );
              assert(
                matches.length === 1,
                400,
                name +
                  ": 등록 명단과 일치하지 않거나 동명이인입니다. 학생별 코드 지정 기능을 사용하세요.",
              );
              assert(
                typeof entry.code === "string",
                400,
                "코드는 문자로 입력하세요.",
              );
              const code = text(entry.code, 32).toLowerCase();
              assert(
                /^[a-z0-9_-]{6,32}$/.test(code),
                400,
                name + ": 코드는 영문·숫자·밑줄·하이픈 6~32자입니다.",
              );
              return { student: matches[0], code, codeHash: hash(code) };
            },
          );
          assert(
            new Set(
              changes.map((x: { student: { id: string } }) => x.student.id),
            ).size === changes.length,
            400,
            "같은 학생이 여러 번 입력되었습니다.",
          );
          const replacement = new Map<string, string>(
            changes.map((x: { student: { id: string }; codeHash: string }) => [
              x.student.id,
              x.codeHash,
            ]),
          );
          const finalHashes = v.students.map(
            (x) => replacement.get(x.id) ?? x.codeHash,
          );
          assert(
            new Set(finalHashes).size === finalHashes.length,
            409,
            "중복 코드가 있습니다. 변경하지 않는 학생의 코드도 확인하세요.",
          );
          const codes = changes.map(
            (x: {
              student: Session["students"][number];
              code: string;
              codeHash: string;
            }) => {
              if (x.student.codeHash !== x.codeHash) {
                x.student.codeHash = x.codeHash;
                x.student.zepId = null;
                x.student.bindingVersion++;
              }
              return { id: x.student.id, name: x.student.name, code: x.code };
            },
          );
          extra = { codes };
        } else if (operation === "set-code") {
          const st = v.students.find((x) => x.id === req.body.studentId);
          assert(st, 404, "학생이 없습니다.");
          const code = text(req.body.code, 32).toLowerCase();
          assert(
            /^[a-z0-9_-]{6,32}$/.test(code),
            400,
            "코드는 영문·숫자·밑줄·하이픈 6~32자로 지정하세요.",
          );
          assert(
            !v.students.some(
              (x) => x.id !== st.id && x.codeHash === hash(code),
            ),
            409,
            "다른 학생이 사용 중인 코드입니다.",
          );
          st.codeHash = hash(code);
          st.zepId = null;
          st.bindingVersion++;
          extra = { codes: [{ id: st.id, name: st.name, code }] };
        } else if (operation === "reset-roster") {
          assert(
            req.body.confirm === v.id,
            400,
            "수업 ID를 입력해 명단 초기화를 확인하세요.",
          );
          assert(
            req.body.revision === v.updatedAt,
            409,
            "수업 데이터가 변경되었습니다. 확인 후 다시 초기화하세요.",
          );
          v.students = [];
          v.responses = {};
          v.groups = [];
          v.groupResults = {};
          v.groupsPublished = false;
          v.phase = "PREPARING";
        } else if (operation === "reset") {
          assert(
            req.body.confirm === v.id,
            400,
            "수업 ID를 입력해 초기화를 확인하세요.",
          );
          v.phase = "PREPARING";
          v.responses = {};
          v.groups = [];
          v.groupResults = {};
          v.groupsPublished = false;
          v.students.forEach((st) => {
            st.bindingVersion++;
            st.zepId = null;
            st.lastActiveAt = 0;
            st.codeHash = hash(token());
          });
        } else throw new ApiError(404, "지원하지 않는 기능입니다.");
        audit(v, operation, auth.uid);
        return {
          value: v,
          result: { session: teacherSession(v), ...(extra as object) },
        };
      },
    );
    res.json(response);
  });
  route("delete", "/api/teacher/sessions/:sid", async (req, res) => {
    csrf(req);
    const { s, auth } = await owned(req, String(req.params.sid));
    assert(
      req.body.confirm === s.id,
      400,
      "수업 ID를 입력해 삭제를 확인하세요.",
    );
    await store.update<Session, void>("sessions/" + s.id, (v) => {
      assert(v?.owner === auth.uid, 403, "접근할 수 없습니다.");
      return { value: undefined, result: undefined };
    });
    res.json({ ok: true });
  });
  route("get", "/api/teacher/sessions/:sid/export", async (req, res) => {
    const { s } = await owned(req, String(req.params.sid));
    const rows: unknown[][] = [
      [
        "수업ID",
        "유형",
        "학생ID/모둠ID",
        "이름/모둠",
        "자연물",
        "응답1",
        "응답2",
        "최초제출",
        "최종수정",
        "버전",
        "담당자ID",
      ],
    ];
    for (const st of s.students)
      for (const item of ITEMS) {
        const a = s.responses[st.id]?.[item];
        rows.push([
          s.id,
          "개인",
          st.id,
          st.name,
          item,
          a?.q1,
          a?.q2,
          a?.firstSubmittedAt ? new Date(a.firstSubmittedAt).toISOString() : "",
          a?.updatedAt ? new Date(a.updatedAt).toISOString() : "",
          a?.version,
          "",
        ]);
      }
    for (const g of s.groups) {
      const a = s.groupResults[g.id];
      rows.push([
        s.id,
        "모둠",
        g.id,
        g.number,
        "공동결론",
        a?.q1,
        a?.q2,
        a?.firstSubmittedAt ? new Date(a.firstSubmittedAt).toISOString() : "",
        a?.updatedAt ? new Date(a.updatedAt).toISOString() : "",
        a?.version,
        a?.submittedBy,
      ]);
    }
    res
      .type("text/csv")
      .send(
        "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      );
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "존재하지 않는 API입니다." }),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const known = err instanceof ApiError;
      const malformed = err instanceof SyntaxError;
      res.status(known ? err.status : malformed ? 400 : 503).json({
        error: known
          ? err.message
          : malformed
            ? "잘못된 JSON 요청입니다."
            : "저장소 또는 인증 처리에 실패했습니다. 작성 내용은 보존됩니다. 다시 시도하세요.",
      });
    },
  );
  return app;
}
