import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
let teacherToken: () => Promise<string> = async () => "";
export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const token = await teacherToken();
  let r: Response;
  try {
    r = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Classroom-Request": "1",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new RequestError(
      0,
      "네트워크 연결을 확인하고 다시 제출하세요. 작성 내용은 이 기기에 보존됩니다.",
    );
  }
  let data;
  try {
    data = await r.json();
  } catch {
    throw new RequestError(
      r.status || 503,
      "서버 응답을 확인하지 못했습니다. 작성 내용을 보존한 뒤 다시 시도하세요.",
    );
  }
  if (!r.ok)
    throw new RequestError(
      r.status,
      data.error ?? "요청을 처리하지 못했습니다.",
    );
  return data as T;
}
export function firebaseAuth() {
  const e = import.meta.env;
  if (!e.VITE_FIREBASE_API_KEY)
    throw new Error(
      "Firebase 설정이 필요합니다. README의 환경변수 설정을 확인하세요.",
    );
  return getAuth(
    initializeApp(
      {
        apiKey: e.VITE_FIREBASE_API_KEY,
        authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: e.VITE_FIREBASE_PROJECT_ID,
        appId: e.VITE_FIREBASE_APP_ID,
      },
      "teacher",
    ),
  );
}
let fb: ReturnType<typeof getAuth> | null = null;
export async function login(email: string, password: string) {
  fb ??= firebaseAuth();
  const credential = await signInWithEmailAndPassword(fb, email, password);
  teacherToken = () => credential.user.getIdToken();
}
export async function logout() {
  teacherToken = async () => "";
  if (fb) await signOut(fb);
  await api("/logout", {});
  for (const key of Object.keys(localStorage))
    if (key.startsWith("nature:")) localStorage.removeItem(key);
}
export async function downloadCsv(sid: string) {
  const token = await teacherToken();
  const r = await fetch("/api/teacher/sessions/" + sid + "/export", {
    headers: token ? { Authorization: "Bearer " + token } : {},
    credentials: "same-origin",
  });
  if (!r.ok) throw new Error("다운로드에 실패했습니다.");
  download(await r.blob(), "nature-" + sid + ".csv");
}
export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
