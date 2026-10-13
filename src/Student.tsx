import { useEffect, useState } from "react";
import {
  ITEMS,
  type Item,
  type Answer,
  type Group,
  type Result,
  type Phase,
} from "../functions/src/types";
import { api, logout, RequestError } from "./api";
import { items, phases, questionLabels, groupQuestions } from "./content";
import { AnswerEditor, SavedAnswers } from "./AnswerEditor";
interface Snapshot {
  session: {
    id: string;
    title: string;
    phase: Phase;
    groupsPublished: boolean;
  };
  student: { id: string; name: string };
  responses: Partial<Record<Item, Answer>>;
}
interface GroupData {
  group: Group;
  members: {
    id: string;
    name: string;
    responses: Partial<Record<Item, Answer>>;
  }[];
  result: Result | null;
}
export function Student({ notify }: { notify: (s: string) => void }) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState(
      new URLSearchParams(location.search).get("view") ?? "progress",
    ),
    [launch, setLaunch] = useState(
      new URLSearchParams(location.hash.slice(1)).get("launch") ?? "",
    ),
    [code, setCode] = useState(""),
    [needsCode, setNeedsCode] = useState(false),
    [redeeming, setRedeeming] = useState(false);
  const navigate = (v: string) => {
    setView(v);
    history.pushState(null, "", "/?view=" + v);
  };
  useEffect(() => {
    const back = () =>
      setView(new URLSearchParams(location.search).get("view") ?? "progress");
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const refresh = async () => {
    try {
      setData(await api<Snapshot>("/student"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const redeem = async (inputCode?: string) => {
    setRedeeming(true);
    try {
      const r = await api<{ needsCode?: boolean; route?: string }>("/redeem", {
        token: launch,
        code: inputCode,
      });
      if (r.needsCode) {
        setNeedsCode(true);
      } else {
        setLaunch("");
        setNeedsCode(false);
        history.replaceState(null, "", "/?view=" + (r.route ?? "progress"));
        setView(r.route ?? "progress");
        await refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRedeeming(false);
    }
  };
  useEffect(() => {
    if (launch) {
      void redeem();
      return;
    }
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [launch]);
  useEffect(() => {
    if (!data) return;
    void api("/student/heartbeat", {}).catch(() => {});
    const t = setInterval(
      () => void api("/student/heartbeat", {}).catch(() => {}),
      60000,
    );
    return () => clearInterval(t);
  }, [data?.student.id]);
  if (needsCode)
    return (
      <section className="panel narrow">
        <div className="eyebrow">최초 연결</div>
        <h2>개인 확인 코드</h2>
        <p>
          이름은 ZEP에서 자동으로 가져왔습니다. 교사에게 받은 코드를 처음 한 번
          입력해 주세요. 동명이인도 코드로 구분합니다.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void redeem(code);
          }}
        >
          <label htmlFor="code">확인 코드</label>
          <input
            id="code"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="primary" disabled={redeeming || !code.trim()}>
            연결하기
          </button>
        </form>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
      </section>
    );
  if (!data)
    return (
      <section className="panel narrow">
        <div className="eyebrow">자연 탐구 기록</div>
        <h2>ZEP에서 탐구를 시작하세요</h2>
        <p>제출 오브젝트에서 F키를 누르면 내 이름으로 연결됩니다.</p>
        {error && (
          <p role="alert" className="notice warning">
            {error}
          </p>
        )}
        {redeeming && <p>안전하게 연결하고 있습니다…</p>}
      </section>
    );
  const count = ITEMS.filter((x) => data.responses[x]?.submitted).length;
  const item = ITEMS.includes(view as Item) ? (view as Item) : null;
  return (
    <>
      <div className="student-heading">
        <div>
          <div className="eyebrow">{phases[data.session.phase]}</div>
          <h2>{data.student.name}의 탐구 기록</h2>
        </div>
        <div className="progress">
          <strong>
            {count}
            <span>/4</span>
          </strong>
          <span>자연물 탐구 완료</span>
        </div>
      </div>
      {error && (
        <div className="notice warning">
          최근 현황을 불러오지 못했습니다. {error}{" "}
          <button onClick={() => void refresh()}>다시 확인</button>
        </div>
      )}
      <nav className="tabs" aria-label="활동 선택">
        <button
          aria-current={view === "progress" ? "page" : undefined}
          onClick={() => navigate("progress")}
        >
          탐구 현황
        </button>
        {ITEMS.map((x) => (
          <button
            key={x}
            aria-current={view === x ? "page" : undefined}
            onClick={() => navigate(x)}
          >
            {items[x].name} {data.responses[x] ? "✓" : ""}
          </button>
        ))}
        <button
          aria-current={view === "group" ? "page" : undefined}
          onClick={() => navigate("group")}
        >
          모둠 활동
        </button>
      </nav>
      {view === "progress" && (
        <section className="panel">
          <div className="eyebrow">나의 자연 탐구 기록</div>
          <h2>네 가지 자연, 네 가지 생각</h2>
          <p className="muted">
            미완료 자연물의 ZEP 맵으로 돌아가 장면과 단서를 살펴보세요.
          </p>
          <div className="exploration-list">
            {ITEMS.map((x, i) => (
              <button key={x} onClick={() => navigate(x)}>
                <span className="index">0{i + 1}</span>
                <span>
                  <strong>{items[x].name}</strong>
                  <small>{items[x].title}</small>
                </span>
                <span
                  className={"badge " + (data.responses[x] ? "complete" : "")}
                >
                  {data.responses[x] ? "제출 완료" : "미제출"}
                </span>
                <span>→</span>
              </button>
            ))}
          </div>
          {count === 4 && (
            <p className="notice success">
              네 가지 자연물 탐구를 모두 완료했습니다. 이제 다른 친구들의 생각과
              비교할 준비가 되었습니다!
            </p>
          )}
          <p className="muted">
            모둠 활동 전에는 나와 교사만 내 응답을 볼 수 있습니다.
          </p>
        </section>
      )}
      {item && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <div className="eyebrow">{items[item].name} 탐구</div>
              <h2>{items[item].title}</h2>
            </div>
            <span
              className={"badge " + (data.responses[item] ? "complete" : "")}
            >
              {data.responses[item] ? "제출 완료" : "미제출"}
            </span>
          </div>
          <p className="hint">{items[item].hint}</p>
          {data.session.phase === "INDIVIDUAL_OPEN" ? (
            <AnswerEditor
              key={data.student.id + item}
              draftKey={`nature:${data.session.id}:${data.student.id}:${item}`}
              questions={items[item].questions}
              initial={data.responses[item]}
              save={(body) =>
                api<Answer>("/student/responses/" + item, body).then((a) => {
                  void refresh();
                  return a;
                })
              }
              notify={notify}
            />
          ) : (
            <>
              <p className="notice">
                개인 탐구가 마감되어 서버에 저장된 답변을 읽기만 할 수 있습니다.
              </p>
              <SavedAnswers
                questions={items[item].questions}
                answer={data.responses[item]}
              />
            </>
          )}
        </section>
      )}
      {view === "group" && <GroupView student={data} notify={notify} />}
      <footer className="page-footer">
        <span>자연과 인간의 관계를 발견하는 시간</span>
        <div className="actions">
          <button
            onClick={() =>
              void logout()
                .then(() => (location.href = "/"))
                .catch((e) => notify(e.message))
            }
          >
            로그아웃 · 임시 내용 지우기
          </button>
          <button
            onClick={() => {
              window.close();
              notify(
                "창이 닫히지 않으면 이 탭을 닫거나 ZEP 탭으로 돌아가세요.",
              );
            }}
          >
            ZEP으로 돌아가기
          </button>
        </div>
      </footer>
    </>
  );
}
function GroupView({
  student,
  notify,
}: {
  student: Snapshot;
  notify: (s: string) => void;
}) {
  const [data, setData] = useState<GroupData | null>(null),
    [error, setError] = useState(""),
    [item, setItem] = useState<Item>("potato"),
    [question, setQuestion] = useState<0 | 1>(0),
    [conclusion, setConclusion] = useState(false);
  const refresh = async () => {
    try {
      setData(await api<GroupData>("/student/group"));
      setError("");
    } catch (e) {
      if (e instanceof RequestError && [401, 403, 404].includes(e.status))
        setData(null);
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [student.session.phase, student.session.groupsPublished]);
  if (!data)
    return (
      <section className="panel">
        <h2>모둠 활동 준비</h2>
        <p className="notice">{error || "모둠 정보를 확인하고 있습니다."}</p>
      </section>
    );
  const recorder = data.group.recorder === student.student.id;
  return (
    <section className="panel">
      {error && (
        <p role="alert" className="notice warning">
          최근 모둠 현황을 불러오지 못했습니다. {error} 작성 중인 내용은
          유지됩니다.
        </p>
      )}
      <div className="section-heading">
        <div>
          <div className="eyebrow">함께 발견하기</div>
          <h2>{data.group.number}모둠에 배정되었습니다.</h2>
          <p>
            {data.members
              .map(
                (m) =>
                  m.name + (m.id === data.group.recorder ? " (기록 담당)" : ""),
              )
              .join(" · ")}
          </p>
        </div>
        <button onClick={() => setConclusion(!conclusion)}>
          {conclusion ? "응답 비교로 돌아가기" : "공동 결론 작성 →"}
        </button>
      </div>
      {!conclusion ? (
        <>
          <p className="hint">
            모둠원들이 자연물의 역할을 어떻게 생각했는지 비교해 보세요. 서로
            공통적으로 발견한 점과 새롭게 알게 된 점을 이야기해 보세요.
          </p>
          <div className="tabs">
            {ITEMS.map((x) => (
              <button
                key={x}
                aria-pressed={item === x}
                onClick={() => setItem(x)}
              >
                {items[x].name}
              </button>
            ))}
          </div>
          <div className="tabs subtabs">
            {questionLabels.map((x, i) => (
              <button
                key={x}
                aria-pressed={question === i}
                onClick={() => setQuestion(i as 0 | 1)}
              >
                {x}
              </button>
            ))}
          </div>
          <h3>{items[item].questions[question]}</h3>
          <div className="comparison">
            {data.members.map((m) => (
              <article key={m.id}>
                <h4>{m.name}</h4>
                <p className="answer-text">
                  {m.responses[item]
                    ? question === 0
                      ? m.responses[item]!.q1
                      : m.responses[item]!.q2
                    : "미제출"}
                </p>
              </article>
            ))}
          </div>
          <button className="primary" onClick={() => setConclusion(true)}>
            네 자연물의 생각을 종합하기 →
          </button>
        </>
      ) : (
        <>
          <h3>인간과 자연, 함께 살아가는 관계</h3>
          <p className="muted">
            모둠당 하나의 결론을 기록합니다. 기록 담당자만 제출하며 모든
            모둠원이 같은 결과를 확인합니다.
          </p>
          {recorder && student.session.phase === "GROUP_OPEN" ? (
            <AnswerEditor
              key={data.group.id}
              draftKey={`nature:${student.session.id}:${data.group.id}:group`}
              questions={groupQuestions}
              initial={data.result}
              save={(body) =>
                api<Result>("/student/group/result", body).then((a) => {
                  void refresh();
                  return a;
                })
              }
              notify={notify}
            />
          ) : (
            <>
              <p className="notice">
                {student.session.phase === "COMPLETED"
                  ? "수업이 종료되어 수정할 수 없습니다."
                  : "기록 담당자가 결론을 작성합니다. 함께 토의한 뒤 제출해 주세요."}
              </p>
              <SavedAnswers questions={groupQuestions} answer={data.result} />
            </>
          )}
        </>
      )}
    </section>
  );
}
