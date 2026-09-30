import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface Toast {
  id: number;
  message: string;
  kind: "ok" | "error";
}

const ToastContext = createContext<{ notify: (message: string, kind?: Toast["kind"]) => void }>({
  notify: () => {},
});

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, kind: Toast["kind"] = "ok") => {
    const id = nextId++;
    setToasts((current) => [...current, { id, message, kind }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.kind === "error" ? " error" : ""}`}>
            <span className="k">{toast.kind === "error" ? "Error" : "Done"}</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
