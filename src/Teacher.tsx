import { useDialogs } from "./Dialogs";
import { useEffect, useState } from "react";
import {
  ITEMS,
  type Item,
  type Session,
  type Group,
  type Phase,
} from "../functions/src/types";
import { api, login, logout, downloadCsv, download } from "./api";
import { items, phases, groupQuestions } from "./content";
import { SavedAnswers } from "./AnswerEditor";
type TeacherData = Omit<Session, "students"> & {
  students: Omit<Session["students"][number], "codeHash">[];
  examples?: Record<string, string[]>;
};
type Code = { id: string; name: string; code: string };
export function Teacher({
  local,
  notify,
}: {
  local: boolean;
  notify: (s: string) => void;
}) {
  const { confirm, prompt } = useDialogs();
  const [list, setList] = useState<
      { id: string; title: string; phase: Phase }[]
    >([]),
    [sid, setSid] = useState(""),
    [data, setData] = useState<TeacherData | null>(null),
    [error, setError] = useState(""),
    [authenticated, setAuthenticated] = useState(false),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("overview");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [title, setTitle] = useState("동백꽃 · 자연과 인간의 관계"),
    [names, setNames] = useState(""),
    [codes, setCodes] = useState<Code[]>([]),
    [selectedStudent, setSelectedStudent] = useState(""),
    [sort, setSort] = useState("name"),
    [incomplete, setIncomplete] = useState(false),
    [showPresentation, setShowPresentation] = useState(false);
  const refresh = async () => {
    try {
      const sessions = await api<typeof list>("/teacher/sessions");
      setList(sessions);
      if (sid) setData(await api<TeacherData>("/teacher/sessions/" + sid));
      setAuthenticated(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [sid]);
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      await refresh();
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const operation = async (op: string, body: unknown) => {
    const r = await api<{ session: TeacherData; codes?: Code[] }>(
      "/teacher/sessions/" + sid + "/" + op,
      body,
    );
    setData({ ...r.session, examples: data?.examples });
    if (r.codes) setCodes(r.codes);
    notify("설정이 저장되었습니다.");
  };
  if (!authenticated)
    return (
      <section className="panel narrow">
        <div className="eyebrow">교사 전용</div>
        <h2>수업 관리에 로그인</h2>
        <p>학생 응답과 명단은 인증된 교사만 관리합니다.</p>
        {local ? (
          <button
            className="primary"
            onClick={() =>
              void run(async () => {
                await api("/dev/login", { role: "teacher" });
                await refresh();
              })
            }
          >
            로컬 테스트 교사 로그인
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await login(email, password);
                await refresh();
              });
            }}
          >
            <label htmlFor="teacher-email">교사 이메일</label>
            <input
              id="teacher-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label htmlFor="teacher-password">비밀번호</label>
            <input
              id="teacher-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="primary" disabled={busy}>
              로그인
            </button>
          </form>
        )}
        {error && (
          <p className="notice warning" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  const completion = (st: string) =>
    ITEMS.filter((i) => data?.responses[st]?.[i]).length;
  const students = data
    ? [...data.students]
        .filter((st) => !incomplete || completion(st.id) < 4)
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name, "ko")
            : completion(a.id) - completion(b.id),
        )
    : [];
  const current = data?.students.find((st) => st.id === selectedStudent);
  return (
    <>
      <div className="student-heading">
        <div>
          <div className="eyebrow">교사 워크스페이스</div>
          <h2>생각이 모이는 교실</h2>
        </div>
        <button
          onClick={() =>
            void run(async () => {
              await logout();
              setAuthenticated(false);
              setData(null);
            })
          }
        >
          로그아웃
        </button>
      </div>
      <div className="toolbar">
        <label>
          수업 선택{" "}
          <select
            value={sid}
            onChange={(e) => {
              setSid(e.target.value);
              setData(null);
              setCodes([]);
            }}
          >
            <option value="">수업을 선택하세요</option>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="새 수업 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
        />
        <button
          disabled={busy || !title.trim()}
          onClick={() =>
            void run(async () => {
              const s = await api<{ id: string }>("/teacher/sessions", {
                title,
              });
              setSid(s.id);
            })
          }
        >
          + 수업 생성
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {!data ? (
        <section className="panel">
          <h3>수업을 선택하거나 새로 만들어 주세요.</h3>
          <p className="muted">
            준비 → 개인 탐구 → 모둠 편성 → 공동 결론 → 발표 순서로 운영합니다.
          </p>
        </section>
      ) : (
        <>
          <section className="session-strip">
            <div>
              <strong>{data.title}</strong>
              <span className="muted">수업 ID: {data.id}</span>
            </div>
            <span className="badge complete">{phases[data.phase]}</span>
            <div className="actions">
              {data.phase === "PREPARING" && (
                <button
                  className="primary"
                  disabled={busy || !data.students.length}
                  onClick={() =>
                    void run(() =>
                      operation("phase", { phase: "INDIVIDUAL_OPEN" }),
                    )
                  }
                >
                  개인 탐구 시작
                </button>
              )}
              {data.phase === "INDIVIDUAL_OPEN" && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm(
                        "개인 탐구를 마감할까요? 학생은 답변을 읽기만 할 수 있습니다.",
                      )
                    )
                      void run(() =>
                        operation("phase", { phase: "INDIVIDUAL_CLOSED" }),
                      );
                  }}
                >
                  개인 탐구 마감
                </button>
              )}
              {data.phase === "INDIVIDUAL_CLOSED" && !data.groupsPublished && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      operation("phase", { phase: "INDIVIDUAL_OPEN" }),
                    )
                  }
                >
                  개인 탐구 재개
                </button>
              )}
              {data.phase === "INDIVIDUAL_CLOSED" && data.groupsPublished && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(() => operation("phase", { phase: "GROUP_OPEN" }))
                  }
                >
                  모둠 활동 시작
                </button>
              )}
              {data.phase === "GROUP_OPEN" && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm(
                        "수업을 종료할까요? 이후 학생의 입력과 수정이 잠깁니다.",
                      )
                    )
                      void run(() =>
                        operation("phase", { phase: "COMPLETED" }),
                      );
                  }}
                >
                  수업 종료
                </button>
              )}
            </div>
          </section>
          <nav className="tabs" aria-label="교사 메뉴">
            {[
              ["overview", "제출 현황"],
              ["roster", "학생 명단"],
              ["groups", "모둠 편성"],
              ["results", "공동 결론 · 발표"],
              ["settings", "예시 답안 · 데이터"],
            ].map(([v, n]) => (
              <button
                key={v}
                aria-current={tab === v ? "page" : undefined}
                onClick={() => setTab(v)}
              >
                {n}
              </button>
            ))}
          </nav>
          {tab === "overview" && (
            <>
              <section className="metrics">
                <div>
                  <strong>{data.students.length}</strong>
                  <span>등록 학생</span>
                </div>
                <div>
                  <strong>
                    {
                      data.students.filter(
                        (st) => Date.now() - st.lastActiveAt < 120_000,
                      ).length
                    }
                  </strong>
                  <span>최근 2분 활동 · 접속 수 추정</span>
                </div>
                <div>
                  <strong>
                    {
                      data.students.filter((st) => completion(st.id) === 4)
                        .length
                    }
                  </strong>
                  <span>네 탐구 모두 완료</span>
                </div>
                <div>
                  <strong>
                    {data.students.length
                      ? Math.round(
                          (data.students.reduce(
                            (n, st) => n + completion(st.id),
                            0,
                          ) /
                            (data.students.length * 4)) *
                            100,
                        )
                      : 0}
                    %
                  </strong>
                  <span>전체 개인 제출률</span>
                </div>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h3>학생별 제출 현황</h3>
                  <div className="actions">
                    <select
                      aria-label="학생 정렬"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="name">이름순</option>
                      <option value="completion">미완료순</option>
                    </select>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={incomplete}
                        onChange={(e) => setIncomplete(e.target.checked)}
                      />{" "}
                      미완료 학생만
                    </label>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>학생</th>
                        {ITEMS.map((i) => (
                          <th key={i}>
                            {items[i].name}
                            <small>
                              {
                                data.students.filter(
                                  (st) => data.responses[st.id]?.[i],
                                ).length
                              }
                              /{data.students.length}
                            </small>
                          </th>
                        ))}
                        <th>완료</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((st) => (
                        <tr key={st.id}>
                          <th>
                            <button
                              className="text-button"
                              onClick={() => setSelectedStudent(st.id)}
                            >
                              {st.name}
                              <small>{st.id.slice(-6)}</small>
                            </button>
                          </th>
                          {ITEMS.map((i) => (
                            <td key={i}>
                              <button
                                className={
                                  "status " +
                                  (data.responses[st.id]?.[i] ? "done" : "")
                                }
                                onClick={() => setSelectedStudent(st.id)}
                              >
                                {data.responses[st.id]?.[i] ? "완료" : "미제출"}
                              </button>
                            </td>
                          ))}
                          <td>{completion(st.id)}/4</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted">
                  현황은 5초 간격으로 갱신됩니다. 최근 활동은 웹앱 접속 기준이며
                  ZEP 전체 접속 인원은 아닙니다.
                </p>
              </section>
            </>
          )}
          {tab === "roster" && (
            <section className="panel">
              <h3>실명은 표시용, 내부 ID는 구분용</h3>
              <p className="muted">
                이름을 한 줄에 한 명씩 입력하세요. 동명이인을 허용하며 개인 확인
                코드로 구분합니다. 최대 30명입니다.
              </p>
              {data.phase === "PREPARING" && !data.students.length && (
                <>
                  <textarea
                    aria-label="학생 이름 명단"
                    rows={8}
                    value={names}
                    onChange={(e) => setNames(e.target.value)}
                    placeholder={"김민수\n이서연\n박지훈"}
                  />
                  <button
                    className="primary"
                    disabled={busy || !names.trim()}
                    onClick={() =>
                      void run(() =>
                        operation("roster", {
                          names: names
                            .split("\n")
                            .map((x) => x.trim())
                            .filter(Boolean),
                        }),
                      )
                    }
                  >
                    명단 등록 · 개인 코드 발급
                  </button>
                </>
              )}
              {data.students.map((st) => (
                <div className="roster-row" key={st.id}>
                  <span>
                    <strong>{st.name}</strong>
                    <small>
                      내부 ID {st.id} ·{" "}
                      {st.zepId ? "ZEP 연결됨" : "아직 연결 전"}
                    </small>
                  </span>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await confirm(
                          st.name +
                            "의 연결을 초기화하고 새 확인 코드를 발급할까요? 기존 접속은 해제됩니다.",
                        )
                      )
                        void run(() =>
                          operation("rebind", { studentId: st.id }),
                        );
                    }}
                  >
                    연결 초기화 · 코드 재발급
                  </button>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      const name = await prompt(
                        "확인한 ZEP 닉네임으로 변경하세요. 연결과 코드를 재설정합니다.",
                        st.name,
                      );
                      if (
                        name?.trim() &&
                        (await confirm("명단 이름을 변경할까요?"))
                      )
                        void run(() =>
                          operation("rebind", { studentId: st.id, name }),
                        );
                    }}
                  >
                    닉네임 확인 · 변경
                  </button>
                </div>
              ))}
              {codes.length > 0 && (
                <div className="notice warning">
                  <h4>개인 확인 코드 — 지금 저장해 주세요</h4>
                  <p>
                    원문 코드는 서버에 보관하지 않습니다. 각 학생에게 본인의
                    코드만 전달하세요.
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>이름</th>
                          <th>내부 ID</th>
                          <th>확인 코드</th>
                        </tr>
                      </thead>
                      <tbody>
                        {codes.map((c) => (
                          <tr key={c.id}>
                            <td>{c.name}</td>
                            <td>{c.id}</td>
                            <td>
                              <code>{c.code}</code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={() =>
                      download(
                        new Blob(
                          [
                            "\uFEFF" +
                              [
                                "이름,내부ID,코드",
                                ...codes.map((c) =>
                                  [c.name, c.id, c.code]
                                    .map(
                                      (x) =>
                                        '"' + x.replaceAll('"', '""') + '"',
                                    )
                                    .join(","),
                                ),
                              ].join("\r\n"),
                          ],
                          { type: "text/csv" },
                        ),
                        "private-student-codes.csv",
                      )
                    }
                  >
                    코드 명단 다운로드
                  </button>
                  <button onClick={() => setCodes([])}>코드 화면 닫기</button>
                </div>
              )}
            </section>
          )}
          {tab === "groups" && (
            <GroupEditor
              key={data.id + data.groupsPublished}
              data={data}
              busy={busy}
              operation={(op, body) => run(() => operation(op, body))}
            />
          )}
          {tab === "results" && (
            <section className="panel">
              <div className="section-heading">
                <h3>모둠별 최종 결론</h3>
                <div className="actions">
                  <button
                    onClick={() => setShowPresentation(true)}
                    disabled={!data.groups.length}
                  >
                    발표 화면
                  </button>
                  <button onClick={() => void run(() => downloadCsv(sid))}>
                    CSV 다운로드
                  </button>
                </div>
              </div>
              <div className="result-list">
                {data.groups.map((g) => (
                  <article key={g.id}>
                    <div className="section-heading">
                      <h3>{g.number}모둠</h3>
                      <span
                        className={
                          "badge " + (data.groupResults[g.id] ? "complete" : "")
                        }
                      >
                        {data.groupResults[g.id] ? "제출 완료" : "미제출"}
                      </span>
                    </div>
                    <p className="muted">
                      {g.members
                        .map(
                          (id) => data.students.find((s) => s.id === id)?.name,
                        )
                        .join(" · ")}
                    </p>
                    <SavedAnswers
                      questions={groupQuestions}
                      answer={data.groupResults[g.id]}
                    />
                    <div className="actions">
                      <button
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(
                              `${g.number}모둠\n${data.groupResults[g.id]?.q1 ?? "미제출"}\n${data.groupResults[g.id]?.q2 ?? "미제출"}`,
                            )
                            .then(() => notify("복사했습니다."))
                            .catch(() =>
                              notify(
                                "복사할 수 없습니다. 응답을 직접 선택해 복사하세요.",
                              ),
                            );
                        }}
                      >
                        결론 복사
                      </button>
                      <button
                        onClick={() => {
                          setShowPresentation(true);
                        }}
                      >
                        출력 화면
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {tab === "settings" && (
            <section className="panel">
              <h3>교사 예시 답안</h3>
              <p className="muted">
                학생용 파일과 API에는 예시 답안을 포함하지 않습니다. 수업 후
                교사가 발표 화면에서 설명해 주세요.
              </p>
              {[...ITEMS, "group"].map((i) => (
                <details key={i}>
                  <summary>
                    {i === "group" ? "최종 공동 결론" : items[i as Item].name}
                  </summary>
                  {data.examples?.[i]?.map((a, n) => (
                    <p className="answer-text" key={n}>
                      {n + 1}. {a}
                    </p>
                  ))}
                </details>
              ))}
              <hr />
              <h3>데이터 관리</h3>
              <button onClick={() => void run(() => downloadCsv(sid))}>
                전체 응답 CSV 다운로드
              </button>
              <button
                onClick={() =>
                  download(
                    new Blob(
                      [
                        JSON.stringify(
                          { ...data, examples: undefined },
                          null,
                          2,
                        ),
                      ],
                      { type: "application/json" },
                    ),
                    "classroom-" + sid + ".json",
                  )
                }
              >
                수업 데이터 JSON 다운로드
              </button>
              <p className="muted">
                수업 초기화는 응답과 모둠 결과를 지우고 접속을 해제합니다. 학생
                명단은 유지하며 새 확인 코드는 재발급해야 합니다.
              </p>
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  const confirmId = await prompt(
                    "초기화하면 개인 응답과 공동 결론이 삭제됩니다. 먼저 다운로드하세요. 계속하려면 수업 ID를 입력하세요.",
                    "",
                  );
                  if (confirmId === sid)
                    void run(() => operation("reset", { confirm: confirmId }));
                }}
              >
                수업 응답 초기화
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  const confirmId = await prompt(
                    "수업과 명단을 완전히 삭제합니다. 되돌릴 수 없습니다. 수업 ID를 입력하세요.",
                    "",
                  );
                  if (confirmId === sid)
                    void run(async () => {
                      await api(
                        "/teacher/sessions/" + sid,
                        { confirm: confirmId },
                        "DELETE",
                      );
                      setSid("");
                      setData(null);
                    });
                }}
              >
                수업 완전 삭제
              </button>
            </section>
          )}
        </>
      )}
      {current && data && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="학생 응답"
        >
          <div className="panel">
            <div className="section-heading">
              <h2>{current.name} · 개인 응답</h2>
              <button autoFocus onClick={() => setSelectedStudent("")}>
                닫기
              </button>
            </div>
            {ITEMS.map((i) => (
              <section key={i}>
                <h3>{items[i].name}</h3>
                <SavedAnswers
                  questions={items[i].questions}
                  answer={data.responses[current.id]?.[i]}
                />
              </section>
            ))}
          </div>
        </div>
      )}
      {showPresentation && data && (
        <Presentation data={data} close={() => setShowPresentation(false)} />
      )}
    </>
  );
}
function GroupEditor({
  data,
  busy,
  operation,
}: {
  data: TeacherData;
  busy: boolean;
  operation: (op: string, body: unknown) => Promise<unknown>;
}) {
  const { confirm, prompt } = useDialogs();
  const [count, setCount] = useState(5),
    [target, setTarget] = useState(3),
    [mode, setMode] = useState("count"),
    [draft, setDraft] = useState<Group[]>(data.groups),
    [dirty, setDirty] = useState(false),
    [revision, setRevision] = useState(data.updatedAt);
  useEffect(() => {
    if (!dirty) {
      setDraft(data.groups);
      setRevision(data.updatedAt);
    }
  }, [data.updatedAt, dirty]);
  const move = (sid: string, gid: string) => {
    const groups = draft.map((g) => ({
      ...g,
      members: g.members.filter((x) => x !== sid),
    }));
    const to = groups.find((g) => g.id === gid)!;
    to.members.push(sid);
    groups.forEach((g) => {
      if (!g.members.includes(g.recorder)) g.recorder = g.members[0] ?? "";
    });
    setDraft(groups);
    setDirty(true);
  };
  const editable = data.phase === "INDIVIDUAL_CLOSED" && !data.groupsPublished;
  return (
    <section className="panel">
      <h3>무작위 편성 → 검토·수정 → 확정·공개</h3>
      <p className="muted">
        미제출 학생도 기본적으로 포함합니다. 공개와 활동 시작은 별도 단계입니다.
      </p>
      <div className="toolbar">
        <select
          aria-label="편성 방식"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="count">모둠 수 기준</option>
          <option value="size">목표 인원 기준</option>
        </select>
        {mode === "count" ? (
          <label>
            모둠 수{" "}
            <input
              type="number"
              min={1}
              max={data.students.length}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
        ) : (
          <label>
            목표 인원{" "}
            <input
              type="number"
              min={1}
              max={30}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </label>
        )}
        <button
          disabled={busy || !editable || dirty}
          onClick={() =>
            void operation(
              "shuffle",
              mode === "count" ? { count } : { targetSize: target },
            )
          }
        >
          무작위 모둠 편성
        </button>
        <button
          disabled={busy || !editable || !dirty}
          onClick={() =>
            void operation("draft", { groups: draft, revision }).then((ok) => {
              if (ok) setDirty(false);
            })
          }
        >
          수정한 편성 저장
        </button>
        <button
          className="primary"
          disabled={busy || !editable || !draft.length || dirty}
          onClick={async () => {
            if (
              await confirm(
                "현재 편성을 확정하고 학생에게 공개할까요? 이후 편성 변경에는 재설정이 필요합니다.",
              )
            )
              void operation("publish", { revision: data.updatedAt });
          }}
        >
          모둠 확정 · 공개
        </button>
      </div>
      {!editable && (
        <p className="notice">
          {data.groupsPublished
            ? "모둠 구성이 확정·공개되었습니다."
            : "개인 탐구를 먼저 마감하세요."}
        </p>
      )}
      {dirty && (
        <p className="notice warning">
          아직 저장하지 않은 수정입니다. 빈 모둠이 없도록 조정한 뒤 저장하세요.{" "}
          <button
            onClick={() => {
              setDirty(false);
              setDraft(data.groups);
            }}
          >
            수정 취소
          </button>
        </p>
      )}
      <div className="group-grid">
        {draft.map((g) => (
          <article key={g.id}>
            <h3>
              {g.number}모둠 <small>{g.members.length}명</small>
            </h3>
            {g.members.map((sid) => (
              <div className="group-member" key={sid}>
                <span>{data.students.find((st) => st.id === sid)?.name}</span>
                {editable && (
                  <select
                    aria-label="학생 이동 모둠"
                    value={g.id}
                    onChange={(e) => move(sid, e.target.value)}
                  >
                    {draft.map((to) => (
                      <option key={to.id} value={to.id}>
                        {to.number}모둠
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
            <label>
              기록 담당자{" "}
              <select
                disabled={!editable}
                value={g.recorder}
                onChange={(e) => {
                  setDraft(
                    draft.map((x) =>
                      x.id === g.id ? { ...x, recorder: e.target.value } : x,
                    ),
                  );
                  setDirty(true);
                }}
              >
                {g.members.map((sid) => (
                  <option key={sid} value={sid}>
                    {data.students.find((st) => st.id === sid)?.name}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </div>
      {editable && (
        <details>
          <summary>편성 대상 학생 확인 · 제외</summary>
          {data.students.map((st) => (
            <label className="checkbox" key={st.id}>
              <input
                type="checkbox"
                checked={!st.excluded}
                disabled={busy || dirty}
                onChange={(e) =>
                  void operation("exclude", {
                    studentId: st.id,
                    excluded: !e.target.checked,
                  })
                }
              />
              {st.name} · {st.id.slice(-6)}
            </label>
          ))}
          <p className="muted">
            포함 여부를 변경하면 공개 전 편성은 지워집니다. 다시 편성하세요.
          </p>
        </details>
      )}
      {data.groupsPublished && data.phase !== "COMPLETED" && (
        <>
          <hr />
          <p className="notice warning">
            재편성하면 기존 모둠 공동 결론이 삭제되고 학생의 소속이 바뀝니다.
            먼저 다운로드하세요.
          </p>
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              const confirmId = await prompt(
                "모둠 공개와 공동 결론을 초기화합니다. 수업 ID를 입력하세요.",
                "",
              );
              if (confirmId === data.id)
                void operation("regroup", { confirm: confirmId });
            }}
          >
            공개한 모둠 재설정
          </button>
        </>
      )}
    </section>
  );
}
function Presentation({
  data,
  close,
}: {
  data: TeacherData;
  close: () => void;
}) {
  const [selected, setSelected] = useState("all");
  const groups =
    selected === "all"
      ? data.groups
      : data.groups.filter((g) => g.id === selected);
  return (
    <div
      className="presentation"
      role="dialog"
      aria-modal="true"
      aria-label="모둠 발표"
    >
      <div className="presentation-toolbar">
        <select
          aria-label="발표 모둠"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="all">모든 모둠 비교</option>
          {data.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.number}모둠
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            void document.documentElement.requestFullscreen().catch(() => {})
          }
        >
          전체 화면
        </button>
        <button onClick={() => window.print()}>현재 결과 출력</button>
        <button
          autoFocus
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            close();
          }}
        >
          발표 닫기
        </button>
      </div>
      <div className="eyebrow">「동백꽃」 · 생태전환의 가치</div>
      <h1>인간과 자연, 우리의 결론</h1>
      <div className="presentation-grid">
        {groups.map((g) => (
          <article key={g.id}>
            <h2>{g.number}모둠</h2>
            <SavedAnswers
              questions={groupQuestions}
              answer={data.groupResults[g.id]}
            />
          </article>
        ))}
      </div>
    </div>
  );
}
