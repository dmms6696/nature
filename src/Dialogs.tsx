import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
type Request = {
  message: string;
  input: boolean;
  resolve: (value: string | null) => void;
};
const Context = createContext<{
  confirm: (message: string) => Promise<boolean>;
  prompt: (message: string, initial?: string) => Promise<string | null>;
} | null>(null);
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null),
    [value, setValue] = useState("");
  const active = useRef(false);
  const ask = (message: string, input: boolean, initial = "") =>
    new Promise<string | null>((resolve) => {
      if (active.current) {
        resolve(null);
        return;
      }
      active.current = true;
      setValue(initial);
      setRequest({ message, input, resolve });
    });
  const finish = (value: string | null) => {
    request?.resolve(value);
    active.current = false;
    setRequest(null);
  };
  return (
    <Context.Provider
      value={{
        confirm: async (message) => (await ask(message, false)) !== null,
        prompt: (message, initial) => ask(message, true, initial),
      }}
    >
      {children}
      {request && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="작업 확인"
          onKeyDown={(e) => {
            if (e.key === "Escape") finish(null);
          }}
        >
          <section className="panel narrow">
            <div className="eyebrow">작업 확인</div>
            <h2>계속 진행할까요?</h2>
            <p>{request.message}</p>
            {request.input && (
              <>
                <label htmlFor="confirmation-input">확인 값</label>
                <input
                  id="confirmation-input"
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoComplete="off"
                />
              </>
            )}
            <div className="actions" style={{ marginTop: 24 }}>
              <button autoFocus={!request.input} onClick={() => finish(null)}>
                취소
              </button>
              <button
                className="primary"
                onClick={() => finish(request.input ? value : "yes")}
              >
                확인
              </button>
            </div>
          </section>
        </div>
      )}
    </Context.Provider>
  );
}
export function useDialogs() {
  const context = useContext(Context);
  if (!context) throw new Error("DialogProvider is required");
  return context;
}
