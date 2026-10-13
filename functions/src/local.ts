import { createApp } from "./app.js";
import { FileStore } from "./store.js";
// Explicit loopback-only entry point. This file is not the Cloud Function export.
const store = new FileStore(".local/database.json");
const app = createApp(store, {
  local: true,
  origin: "http://127.0.0.1:5173",
  bridgeSecret: () => process.env.ZEP_BRIDGE_SECRET ?? "",
  teacherUids: () => [],
});
app.listen(3001, "127.0.0.1", () =>
  console.log(
    "로컬 테스트 API http://127.0.0.1:3001 (운영용 인증 우회는 Cloud Function에 없음)",
  ),
);
