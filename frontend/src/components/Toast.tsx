"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertIcon, CheckIcon } from "./icons";

type Kind = "ok" | "error";
type Show = (msg: string, kind?: Kind) => void;
const Ctx = createContext<Show>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: Kind } | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback<Show>((msg, kind = "ok") => {
    setToast({ msg, kind }); setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), kind === "error" ? 4500 : 2200);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4">
        <div className={`flex max-w-md items-center gap-2.5 rounded-lg border bg-raised px-4 py-2.5 text-sm shadow-xl transition duration-200 ${
          toast?.kind === "error" ? "border-danger/50" : "border-line-strong"} ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
          {toast && (toast.kind === "error"
            ? <AlertIcon className="h-4 w-4 shrink-0 text-danger" />
            : <CheckIcon className="h-4 w-4 shrink-0 text-ok" />)}
          <span>{toast?.msg}</span>
        </div>
      </div>
    </Ctx.Provider>
  );
}
