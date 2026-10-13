import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { createApp } from "./app.js";
import { FirestoreStore } from "./store.js";
initializeApp();
const bridge = defineSecret("ZEP_BRIDGE_SECRET");
const origin = defineString("PUBLIC_ORIGIN");
const teachers = defineString("TEACHER_UIDS");
export const api = onRequest(
  {
    region: "asia-northeast3",
    maxInstances: 2,
    minInstances: 0,
    concurrency: 40,
    secrets: [bridge],
    invoker: "public",
  },
  (req, res) =>
    createApp(new FirestoreStore(), {
      local: false,
      origin: origin.value(),
      bridgeSecret: () => bridge.value(),
      teacherUids: () =>
        teachers
          .value()
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
    })(req, res),
);
