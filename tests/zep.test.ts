import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(new URL("../zep/main.js", import.meta.url), "utf8");
function harness(diagnostics = false) {
  const handlers: Record<string, Function> = {},
    messages: string[] = [],
    links: string[] = [],
    timers: Function[] = [],
    requests: unknown[] = [];
  const event = (name: string) => ({
    Add: (fn: Function) => {
      handlers[name] = fn;
    },
  });
  const player = {
    name: "가상 학생",
    id: "test-id",
    role: -1,
    showAlert: (s: string) => messages.push(s),
    showCenterLabel: (s: string) => messages.push(s),
    sendMessage: (s: string) => messages.push(s),
    openWebLink: (url: string) => links.push(url),
  };
  const app = {
    spaceHashID: "space1",
    mapHashID: "map1",
    storage: "{}",
    getStorage: (fn: Function) => fn(),
    setStorage: (raw: string) => {
      app.storage = raw;
    },
    onSay: event("say"),
    onTriggerObject: event("trigger"),
    onStart: event("start"),
    onJoinPlayer: event("join"),
    addOnKeyDown: (key: number, fn: Function) => {
      handlers["key" + key] = fn;
    },
    sayToAll: (s: string) => messages.push(s),
    runLater: (fn: Function) => timers.push(fn),
    httpPostJson: (
      _url: string,
      _headers: unknown,
      body: unknown,
      callback: Function,
    ) => {
      requests.push(body);
      callback(
        JSON.stringify({
          ok: true,
          url: "https://example.com/#launch=test-token",
        }),
      );
    },
  };
  runInNewContext(
    source.replace("diagnostics: false", "diagnostics: " + diagnostics),
    { App: app },
  );
  return { handlers, messages, links, timers, requests, player, app };
}
test("ZEP 공개 스크립트: 여섯 식별 키를 올바른 서버 화면으로 연결", () => {
  const h = harness();
  const mapping = {
    submit_potato: "potato",
    submit_branch: "branch",
    submit_flower: "flower",
    submit_rooster: "rooster",
    check_progress: "progress",
    open_group: "group",
  };
  for (const [key, route] of Object.entries(mapping)) {
    h.handlers.trigger(h.player, 3, 10, 10, key);
    assert.equal((h.requests.at(-1) as { route: string }).route, route);
  }
  assert.equal(h.links.length, 6);
  assert.ok(!("key81" in h.handlers));
});
test("ZEP 진단: 빈 키를 안내하고 Q키로 독립 서버 연결 시험", () => {
  const h = harness(true);
  h.handlers.start();
  h.handlers.join(h.player);
  h.handlers.trigger(h.player, 3, 10, 10, undefined);
  assert.ok(h.messages.some((s) => s.includes("key=(비어 있음)")));
  assert.equal(h.requests.length, 0);
  h.handlers.key81(h.player);
  assert.equal((h.requests[0] as { route: string }).route, "progress");
  assert.equal(h.links.length, 1);
});
test("ZEP 요청 실패·응답 시간 초과는 조용히 멈추지 않고 재시도 가능", () => {
  const h = harness(true);
  h.app.httpPostJson = () => {
    throw new Error("network");
  };
  h.handlers.key81(h.player);
  assert.ok(
    h.messages.some((s) => s.includes("서버 통신을 시작하지 못했습니다")),
  );
  h.app.httpPostJson = () => {};
  h.handlers.key81(h.player);
  h.timers.at(-1)!();
  assert.ok(
    h.messages.some((s) => s.includes("15초 동안 서버 응답이 없습니다")),
  );
  h.handlers.key81(h.player);
  assert.equal(
    h.messages.filter((s) => s.includes("연결 중입니다. 잠시")).length,
    0,
  );
});
test("ZEP 관리자 등록 후 빈 F키도 해당 오브젝트 화면 연결", () => {
  const h = harness();
  h.player.role = 3001;
  h.handlers.say(h.player, "!연결 check_progress");
  h.handlers.trigger(h.player, 3, 22, 16, undefined);
  assert.equal(h.links.length, 0);
  h.player.role = -1;
  h.handlers.trigger(h.player, 3, 22, 16, undefined);
  assert.equal((h.requests[0] as { route: string }).route, "progress");
  assert.equal(h.links.length, 1);
});
test("ZEP 연결은 맵·레이어·좌표별 격리, 학생은 설정 불가", () => {
  const h = harness(true);
  h.handlers.say(h.player, "!연결 submit_potato");
  h.handlers.trigger(h.player, 3, 22, 16, "");
  assert.equal(h.links.length, 0);
  h.player.role = 3000;
  h.handlers.say(h.player, "!연결 submit_potato");
  h.handlers.trigger(h.player, 3, 22, 16, "");
  h.player.role = -1;
  h.app.mapHashID = "map2";
  h.handlers.trigger(h.player, 3, 22, 16, "");
  assert.equal(h.links.length, 0);
  h.app.mapHashID = "map1";
  h.handlers.trigger(h.player, 5, 22, 16, "");
  assert.equal(h.links.length, 0);
  h.handlers.trigger(h.player, 3, 23, 16, "");
  assert.equal(h.links.length, 0);
  h.handlers.trigger(h.player, 3, 22, 16, "");
  assert.equal((h.requests[0] as { route: string }).route, "potato");
});
test("ZEP 바인딩은 재시작에도 저장소에서 복원, 취소·해제 가능", () => {
  const h = harness();
  h.player.role = 3001;
  h.handlers.say(h.player, "!연결 submit_flower");
  h.handlers.trigger(h.player, 3, 10, 10, "");
  const saved = h.app.storage;
  const next = harness();
  next.app.storage = saved;
  next.handlers.trigger(next.player, 3, 10, 10, "");
  assert.equal(next.links.length, 1);
  next.player.role = 3001;
  next.handlers.say(next.player, "!연결 submit_potato");
  next.handlers.say(next.player, "!연결취소");
  next.handlers.trigger(next.player, 3, 10, 10, "");
  assert.equal((next.requests.at(-1) as { route: string }).route, "flower");
  next.handlers.say(next.player, "!연결해제");
  next.handlers.trigger(next.player, 3, 10, 10, "");
  next.handlers.trigger(next.player, 3, 10, 10, "");
  assert.equal(next.links.length, 2);
});
test("ZEP 손상된 저장소는 덮어쓰지 않고 오류 안내", () => {
  const h = harness();
  h.app.storage = "invalid-json";
  h.player.role = 3001;
  h.handlers.say(h.player, "!연결 check_progress");
  h.handlers.trigger(h.player, 3, 22, 16, "");
  assert.equal(h.app.storage, "invalid-json");
  assert.ok(
    h.messages.some((m) => m.includes("기존 설정은 지우지 않았습니다")),
  );
});
