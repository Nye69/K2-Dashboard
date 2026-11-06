import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<ConfirmFn>(async () => false);

export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(undefined);
  const okRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (o) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setOpts(o);
      }),
    [],
  );

  const close = (v: boolean) => {
    resolver.current?.(v);
    setOpts(null);
  };

  useEffect(() => {
    if (!opts) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts]);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {opts && (
        <div className="scrim" onClick={() => close(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="dlg-title">{opts.title}</h3>
            <p>{opts.message}</p>
            <div className="actions">
              <button className="btn" onClick={() => close(false)}>Cancelar</button>
              <button ref={okRef} className={`btn ${opts.danger ? 'danger-solid' : 'go'}`} onClick={() => close(true)}>
                {opts.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
