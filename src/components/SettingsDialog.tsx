import { Bell, BellOff, Check, Eye, EyeOff, LoaderCircle, Printer, Send, Shield, Smartphone, Trash2, UserRound, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError, getSettings, saveSettings, updateAccount, type FieldErrors, type Settings } from '../settings/api';
import { currentSubscription, disablePush, enablePush, getPushInfo, pushSupport, removeDevice, sendTestPush, type PushInfo } from '../settings/push';

type Tab = 'printer' | 'notify' | 'account';

const EMPTY: Settings = { printerHost: '', panelUrl: '', trustedProxies: [], pushContact: '' };

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
  // Correo guardado en el servidor (no el que se está escribiendo): sin él no se pueden mandar avisos.
  const [savedContact, setSavedContact] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSettings()
      .then((v) => {
        setUser(v.user);
        setForm(v.settings);
        setProxies(v.settings.trustedProxies.join(', '));
        setSavedContact(v.settings.pushContact);
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
      setSavedContact(v.settings.pushContact);
      setMessage({ kind: 'ok', text: 'Ajustes guardados.' });
      onSaved(v.settings);
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
            <Field
              label="Correo de contacto"
              hint="Apple, Google y Mozilla exigen un correo para aceptar las notificaciones (por si hay un problema con el envío). No se muestra a nadie más. Guarda antes de activar los avisos."
              error={errors.pushContact}
            >
              {(id) => <input id={id} type="email" value={form.pushContact} onChange={(e) => set('pushContact')(e.target.value)} placeholder="tu@correo.com" autoCapitalize="none" spellCheck={false} />}
            </Field>
            <PushSection contactSaved={!!savedContact} />
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

function PushSection({ contactSaved }: { contactSaved: boolean }) {
  const support = pushSupport();
  const [info, setInfo] = useState<PushInfo | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const refresh = async () => {
    const [i, sub] = await Promise.all([getPushInfo(), support === 'ok' ? currentSubscription() : null]);
    setInfo(i);
    setMine(sub && i.devices.some((d) => d.endpoint === sub.endpoint) ? sub.endpoint : null);
  };

  useEffect(() => {
    refresh().catch((e) => setMsg({ kind: 'err', text: (e as Error).message }));
  }, []);

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      await refresh();
      if (ok) setMsg({ kind: 'ok', text: ok });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const spinner = (key: string, icon: ReactNode) => (busy === key ? <LoaderCircle size={16} className="spin" aria-hidden /> : icon);

  return (
    <div className="push-box">
      <div className="push-title">
        <Smartphone size={16} aria-hidden />
        Este dispositivo
      </div>
      {support === 'ios-browser' && (
        <p className="field-hint">En iPhone y iPad los avisos solo funcionan desde la app: en Safari toca Compartir → Añadir a pantalla de inicio, ábrela desde ahí y vuelve a esta pantalla.</p>
      )}
      {support === 'insecure' && <p className="field-hint">Los avisos necesitan HTTPS. Entra por tu dominio (https://…) en vez de por la IP.</p>}
      {support === 'unsupported' && <p className="field-hint">Este navegador no admite notificaciones push.</p>}
      {support === 'ok' && !contactSaved && <p className="field-hint">Pon el correo de contacto y pulsa Guardar para poder activar los avisos.</p>}
      {support === 'ok' && contactSaved && info && (
        <div className="push-actions">
          {mine ? (
            <>
              <span className="pill ok"><Bell size={14} aria-hidden />Avisos activados</span>
              <button className="btn" disabled={!!busy} onClick={() => act('test', () => sendTestPush(mine), 'Notificación de prueba enviada.')}>
                {spinner('test', <Send size={16} aria-hidden />)}Probar
              </button>
              <button className="btn" disabled={!!busy} onClick={() => act('off', disablePush, 'Avisos desactivados en este dispositivo.')}>
                {spinner('off', <BellOff size={16} aria-hidden />)}Desactivar
              </button>
            </>
          ) : (
            <button
              className="btn go"
              disabled={!!busy}
              onClick={() => act('on', async () => {
                await enablePush(info.publicKey);
                const sub = await currentSubscription();
                if (sub) await sendTestPush(sub.endpoint);
              }, 'Avisos activados. Te mandé una notificación de prueba.')}
            >
              {spinner('on', <Bell size={16} aria-hidden />)}Activar avisos en este dispositivo
            </button>
          )}
        </div>
      )}

      {info && info.devices.length > 0 && (
        <>
          <div className="push-title" style={{ marginTop: 14 }}>Dispositivos con avisos</div>
          <ul className="device-list">
            {info.devices.map((d) => (
              <li key={d.id}>
                <span>
                  {d.label}
                  {d.endpoint === mine && <span className="device-this"> · este</span>}
                  <span className="device-date">{new Date(d.createdAt).toLocaleDateString('es')}</span>
                </span>
                <button className="icon-btn danger" disabled={!!busy} onClick={() => act(`rm-${d.id}`, () => removeDevice(d.id))} aria-label={`Quitar ${d.label}`} title="Quitar">
                  {spinner(`rm-${d.id}`, <Trash2 size={16} />)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {msg && (
        <div className={`alert ${msg.kind === 'ok' ? 'ok' : 'error'}`} role={msg.kind === 'ok' ? 'status' : 'alert'} style={{ marginTop: 10 }}>
          {msg.text}
        </div>
      )}
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
