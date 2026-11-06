import { Bell, Check, Eye, EyeOff, LoaderCircle, Printer, Shield, UserRound, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError, getSettings, saveSettings, testNtfy, updateAccount, type FieldErrors, type Settings } from '../settings/api';

type Tab = 'printer' | 'notify' | 'account';

const EMPTY: Settings = { printerHost: '', panelUrl: '', trustedProxies: [], ntfyUrl: 'https://ntfy.sh', ntfyTopic: '' };

export function SettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (s: Settings) => void }) {
  const [tab, setTab] = useState<Tab>('printer');
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState('');
  const [form, setForm] = useState<Settings>(EMPTY);
  const [proxies, setProxies] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [acc, setAcc] = useState({ currentPassword: '', user: '', password: '', confirm: '' });
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSettings()
      .then((v) => {
        setUser(v.user);
        setForm(v.settings);
        setProxies(v.settings.trustedProxies.join(', '));
        setAcc((a) => ({ ...a, user: v.user }));
        setLoaded(true);
      })
      .catch((e) => setMessage({ kind: 'err', text: (e as Error).message }));
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k: keyof Settings) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const fail = (e: unknown) => {
    const err = e as ApiError;
    setErrors(err.fields ?? {});
    setMessage({ kind: 'err', text: err.message });
  };

  const save = async () => {
    setBusy('save');
    setErrors({});
    setMessage(null);
    try {
      const v = await saveSettings({ ...form, trustedProxies: proxies.split(/[\s,]+/).filter(Boolean) });
      setForm(v.settings);
      setProxies(v.settings.trustedProxies.join(', '));
      setMessage({ kind: 'ok', text: 'Ajustes guardados.' });
      onSaved(v.settings);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy('ntfy');
    setErrors({});
    setMessage(null);
    try {
      await testNtfy({ ntfyUrl: form.ntfyUrl, ntfyTopic: form.ntfyTopic, panelUrl: form.panelUrl });
      setMessage({ kind: 'ok', text: 'Aviso de prueba enviado. Si no llega, revisa que estés suscrito al mismo tema en la app de ntfy.' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const saveAccount = async () => {
    setBusy('account');
    setErrors({});
    setMessage(null);
    try {
      const v = await updateAccount(acc);
      setUser(v.user);
      setAcc({ currentPassword: '', user: v.user, password: '', confirm: '' });
      setMessage({ kind: 'ok', text: 'Cuenta actualizada. Se cerró la sesión en los demás dispositivos.' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const tabs: [Tab, string, ReactNode][] = [
    ['printer', 'Impresora', <Printer size={16} aria-hidden />],
    ['notify', 'Avisos', <Bell size={16} aria-hidden />],
    ['account', 'Cuenta', <UserRound size={16} aria-hidden />],
  ];

  return (
    <div className="scrim" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="dialog settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <h3 id="settings-title">Ajustes</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar ajustes" title="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="seg settings-tabs" role="tablist" aria-label="Secciones de ajustes">
          {tabs.map(([id, label, icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`seg-btn ${tab === id ? 'on' : ''}`}
              onClick={() => {
                setTab(id);
                setMessage(null);
                setErrors({});
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {!loaded && !message && (
          <div className="empty">
            <LoaderCircle size={20} className="spin" aria-hidden /> Cargando…
          </div>
        )}

        {loaded && tab === 'printer' && (
          <div className="settings-body">
            <Field label="IP de la impresora" hint="La IP o el nombre de la impresora en tu red, sin http:// ni puerto. Conviene reservarla en el router para que no cambie." error={errors.printerHost}>
              {(id) => <input id={id} value={form.printerHost} onChange={(e) => set('printerHost')(e.target.value)} placeholder="192.168.1.50" inputMode="url" autoCapitalize="none" spellCheck={false} />}
            </Field>
            <Field label="Dominio del dashboard" hint="La dirección pública con la que entras desde fuera. Se usa para abrir la app desde los avisos." error={errors.panelUrl}>
              {(id) => <input id={id} value={form.panelUrl} onChange={(e) => set('panelUrl')(e.target.value)} placeholder="https://impresora.midominio.com" inputMode="url" autoCapitalize="none" spellCheck={false} />}
            </Field>
            <Field
              label="Proxy inverso de confianza"
              hint="Si tienes Nginx Proxy Manager, Traefik u otro proxy delante, pon su IP (varias, separadas por comas). Así el dashboard ve la IP real de quien entra. Déjalo vacío si no hay proxy."
              error={errors.trustedProxies}
            >
              {(id) => <input id={id} value={proxies} onChange={(e) => setProxies(e.target.value)} placeholder="192.168.1.10" autoCapitalize="none" spellCheck={false} />}
            </Field>
          </div>
        )}

        {loaded && tab === 'notify' && (
          <div className="settings-body">
            <Field label="Servidor de ntfy" hint="Por defecto el público, https://ntfy.sh. Si tienes tu propio servidor de ntfy, pon su dirección." error={errors.ntfyUrl}>
              {(id) => <input id={id} value={form.ntfyUrl} onChange={(e) => set('ntfyUrl')(e.target.value)} placeholder="https://ntfy.sh" inputMode="url" autoCapitalize="none" spellCheck={false} />}
            </Field>
            <Field
              label="Tema"
              hint="Suscríbete a este mismo tema en la app de ntfy del móvil. Cualquiera que lo sepa puede leer tus avisos: usa uno largo y difícil de adivinar. Vacío = sin avisos."
              error={errors.ntfyTopic}
            >
              {(id) => <input id={id} value={form.ntfyTopic} onChange={(e) => set('ntfyTopic')(e.target.value)} placeholder="k2-un-tema-largo-y-secreto" autoCapitalize="none" spellCheck={false} />}
            </Field>
            <button className="btn" onClick={sendTest} disabled={!!busy || !form.ntfyTopic}>
              {busy === 'ntfy' ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Bell size={16} aria-hidden />}
              Enviar aviso de prueba
            </button>
          </div>
        )}

        {loaded && tab === 'account' && (
          <div className="settings-body">
            <p className="hint" style={{ marginTop: 0 }}>
              <Shield size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> Sesión iniciada como <b>{user}</b>. Al cambiar la contraseña se cierra la sesión en los demás dispositivos.
            </p>
            <Field label="Usuario" error={errors.user}>
              {(id) => <input id={id} value={acc.user} onChange={(e) => setAcc({ ...acc, user: e.target.value })} autoComplete="username" autoCapitalize="none" spellCheck={false} />}
            </Field>
            <Field label="Contraseña actual" error={errors.currentPassword}>
              {(id) => <PasswordInput id={id} value={acc.currentPassword} onChange={(v) => setAcc({ ...acc, currentPassword: v })} autoComplete="current-password" />}
            </Field>
            <Field label="Contraseña nueva" hint="Mínimo 10 caracteres." error={errors.password}>
              {(id) => <PasswordInput id={id} value={acc.password} onChange={(v) => setAcc({ ...acc, password: v })} autoComplete="new-password" />}
            </Field>
            <Field label="Repite la contraseña nueva" error={errors.confirm}>
              {(id) => <PasswordInput id={id} value={acc.confirm} onChange={(v) => setAcc({ ...acc, confirm: v })} autoComplete="new-password" />}
            </Field>
          </div>
        )}

        {message && (
          <div className={`alert ${message.kind === 'ok' ? 'ok' : 'error'}`} role={message.kind === 'ok' ? 'status' : 'alert'} style={{ marginTop: 12 }}>
            {message.text}
          </div>
        )}

        {loaded && (
          <div className="actions">
            <button className="btn" onClick={onClose}>Cerrar</button>
            {tab === 'account' ? (
              <button className="btn go" onClick={saveAccount} disabled={!!busy || !acc.currentPassword || !acc.password}>
                {busy === 'account' ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Check size={16} aria-hidden />}
                Guardar cuenta
              </button>
            ) : (
              <button className="btn go" onClick={save} disabled={!!busy}>
                {busy === 'save' ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Check size={16} aria-hidden />}
                Guardar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={`field ${error ? 'invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error ? <div className="field-error" role="alert">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw-wrap">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
      <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={show}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}
