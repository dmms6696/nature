import { DialogProvider } from "./Dialogs";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Student } from "./Student";
import { Teacher } from "./Teacher";
import { api } from "./api";
import "./styles.css";
function App() {
  const [local, setLocal] = useState(false),
    [toast, setToast] = useState(""),
    [role, setRole] = useState(
      location.pathname.startsWith("/teacher") ? "teacher" : "student",
    ),
    [dev, setDev] = useState<
      { id: string; title: string; students: { id: string; name: string }[] }[]
    >([]),
    [selection, setSelection] = useState(""),
    [configError, setConfigError] = useState("");
  useEffect(() => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith("nature:")) continue;
        try {
          const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
          if (!(draft.expires > Date.now())) localStorage.removeItem(key);
        } catch { localStorage.removeItem(key); }
      }
    } catch { /* Storage may be disabled; AnswerEditor explains this when writing. */ }
    api<{ local: boolean }>("/config")
      .then(async (c) => {
        setLocal(c.local);
        if (c.local) setDev(await api<typeof dev>("/dev/students"));
      })
      .catch(() =>
        setConfigError(
          "서버에 연결하지 못했습니다. 로컬 API 실행 또는 Firebase 배포 설정을 확인하세요.",
        ),
      );
  }, []);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 5000);
  };
  const switchRole = (value: string) => {
    location.href = value === "teacher" ? "/teacher" : "/";
  };
  return (
    <>
      <header className="app-header">
        <a className="brand" href="/">
          <span className="brand-symbol">自然</span>
          <span>
            동백꽃<small>자연 탐구 기록</small>
          </span>
        </a>
        <span className="header-note">1학년 국어 · 자연과 함께 살아가기</span>
        <button
          className="text-button"
          onClick={() => switchRole(role === "teacher" ? "student" : "teacher")}
        >
          {role === "teacher" ? "학생 화면" : "교사 관리"}
        </button>
      </header>
      {local && (
        <div className="dev-bar">
          <strong>로컬 테스트 · 가상 데이터</strong>
          <span>운영 환경에서는 이 선택 기능이 없습니다.</span>
          <select
            aria-label="가상 학생 선택"
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="">학생 선택</option>
            {dev.flatMap((s) =>
              s.students.map((st) => (
                <option key={s.id + st.id} value={s.id + ":" + st.id}>
                  {s.title} / {st.name}
                </option>
              )),
            )}
          </select>
          <button
            onClick={() => {
              const [sessionId, studentId] = selection.split(":");
              void api("/dev/login", { sessionId, studentId })
                .then(() => {
                  location.href = "/";
                })
                .catch((e) => notify(e.message));
            }}
            disabled={!selection}
          >
            이 학생으로 보기
          </button>
        </div>
      )}
      <main>
        {configError && (
          <p role="alert" className="notice error">
            {configError}
          </p>
        )}
        {role === "teacher" ? (
          <Teacher local={local} notify={notify} />
        ) : (
          <Student notify={notify} />
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main>
        <h1>화면을 불러오지 못했습니다.</h1>
        <p>
          임시 작성 내용은 이 기기에 보존됩니다. 새로고침하거나 ZEP에서 다시
          열어 주세요.
        </p>
        <button onClick={() => location.reload()}>다시 열기</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <DialogProvider>
      <App />
    </DialogProvider>
  </ErrorBoundary>,
);
