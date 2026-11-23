import { Bell, BellOff, Check, Eye, EyeOff, Languages, LoaderCircle, Printer, Send, Shield, Smartphone, Trash2, UserRound, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError, getSettings, saveSettings, updateAccount, type FieldErrors, type Settings } from '../settings/api';
import { currentSubscription, disablePush, enablePush, getPushInfo, pushSupport, removeDevice, sendTestPush, setPushLang, type PushInfo } from '../settings/push';
import { dateLocale, LANGS, setLang, useLang, useT, type Lang } from '../i18n';

type Tab = 'printer' | 'notify' | 'account';

const EMPTY: Settings = { printerName: '', printerHost: '', panelUrl: '', trustedProxies: [], pushContact: '' };

export function SettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (s: Settings) => void }) {
  const [tab, setTab] = useState<Tab>('printer');
  const t = useT();
  const lang = useLang();
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

  // onClose cambia en cada render del padre (y mientras imprime se renderiza cada segundo):
  // se guarda en una ref para que el foco solo se ponga al abrir y no le quite el cursor al campo que se está escribiendo.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      setMessage({ kind: 'ok', text: t('settings.saved') });
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
      setMessage({ kind: 'ok', text: t('settings.accountSaved') });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const tabs: [Tab, string, ReactNode][] = [
    ['printer', t('settings.tabPrinter'), <Printer size={16} aria-hidden />],
    ['notify', t('settings.tabNotify'), <Bell size={16} aria-hidden />],
    ['account', t('settings.tabAccount'), <UserRound size={16} aria-hidden />],
  ];

  // El idioma es de este dispositivo: se aplica al momento, sin pulsar Guardar.
  const changeLang = (l: Lang) => {
    if (l === lang) return;
    setLang(l);
    setMessage(null);
    setErrors({});
    setPushLang(l).catch(() => {});
  };

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
          <h3 id="settings-title">{t('settings.title')}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t('settings.close')} title={t('common.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="lang-row">
          <span className="lang-label" id="lang-label"><Languages size={16} aria-hidden />{t('settings.language')}</span>
          <div className="seg" role="radiogroup" aria-labelledby="lang-label">
            {LANGS.map((l) => (
              <button key={l.id} role="radio" lang={l.id} aria-checked={lang === l.id} className={`seg-btn ${lang === l.id ? 'on' : ''}`} onClick={() => changeLang(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <p className="field-hint lang-hint">{t('settings.languageHint')}</p>

        <div className="seg settings-tabs" role="tablist" aria-label={t('settings.sections')}>
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
            <LoaderCircle size={20} className="spin" aria-hidden /> {t('common.loading')}
          </div>
        )}

        {loaded && tab === 'printer' && (
          <div className="settings-body">
            <Field label={t('settings.printerName')} hint={t('settings.printerNameHint')} error={errors.printerName}>
              {(id) => <input id={id} value={form.printerName} onChange={(e) => set('printerName')(e.target.value)} placeholder="K2" maxLength={40} autoComplete="off" />}
            </Field>
            <Field label={t('settings.printerHost')} hint={t('settings.printerHostHint')} error={errors.printerHost}>
              {(id) => <input id={id} value={form.printerHost} onChange={(e) => set('printerHost')(e.target.value)} placeholder="192.168.1.50" inputMode="url" autoCapitalize="none" spellCheck={false} />}
            </Field>
            <Field label={t('settings.panelUrl')} hint={t('settings.panelUrlHint')} error={errors.panelUrl}>
              {(id) => <input id={id} value={form.panelUrl} onChange={(e) => set('panelUrl')(e.target.value)} placeholder={t('settings.panelUrlPlaceholder')} inputMode="url" autoCapitalize="none" spellCheck={false} />}
            </Field>
            <Field
              label={t('settings.proxies')}
              hint={t('settings.proxiesHint')}
              error={errors.trustedProxies}
            >
              {(id) => <input id={id} value={proxies} onChange={(e) => setProxies(e.target.value)} placeholder="192.168.1.10" autoCapitalize="none" spellCheck={false} />}
            </Field>
          </div>
        )}

        {loaded && tab === 'notify' && (
          <div className="settings-body">
            <Field
              label={t('settings.contact')}
              hint={t('settings.contactHint')}
              error={errors.pushContact}
            >
              {(id) => <input id={id} type="email" value={form.pushContact} onChange={(e) => set('pushContact')(e.target.value)} placeholder={t('settings.contactPlaceholder')} autoCapitalize="none" spellCheck={false} />}
            </Field>
            <PushSection contactSaved={!!savedContact} />
          </div>
        )}

        {loaded && tab === 'account' && (
          <div className="settings-body">
            <p className="hint" style={{ marginTop: 0 }}>
              <Shield size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> {t('settings.signedInAs')} <b>{user}</b>. {t('settings.signedInHint')}
            </p>
            <Field label={t('settings.user')} error={errors.user}>
              {(id) => <input id={id} value={acc.user} onChange={(e) => setAcc({ ...acc, user: e.target.value })} autoComplete="username" autoCapitalize="none" spellCheck={false} />}
            </Field>
            <Field label={t('settings.currentPassword')} error={errors.currentPassword}>
              {(id) => <PasswordInput id={id} value={acc.currentPassword} onChange={(v) => setAcc({ ...acc, currentPassword: v })} autoComplete="current-password" />}
            </Field>
            <Field label={t('settings.newPassword')} hint={t('settings.newPasswordHint')} error={errors.password}>
              {(id) => <PasswordInput id={id} value={acc.password} onChange={(v) => setAcc({ ...acc, password: v })} autoComplete="new-password" />}
            </Field>
            <Field label={t('settings.repeatPassword')} error={errors.confirm}>
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
            <button className="btn" onClick={onClose}>{t('common.close')}</button>
            {tab === 'account' ? (
              <button className="btn go" onClick={saveAccount} disabled={!!busy || !acc.currentPassword || !acc.password}>
                {busy === 'account' ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Check size={16} aria-hidden />}
                {t('settings.saveAccount')}
              </button>
            ) : (
              <button className="btn go" onClick={save} disabled={!!busy}>
                {busy === 'save' ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Check size={16} aria-hidden />}
                {t('common.save')}
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
  const t = useT();
  const lang = useLang();
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
        {t('push.thisDevice')}
      </div>
      {support === 'ios-browser' && (
        <p className="field-hint">{t('push.iosBrowser')}</p>
      )}
      {support === 'insecure' && <p className="field-hint">{t('push.insecure')}</p>}
      {support === 'unsupported' && <p className="field-hint">{t('push.unsupported')}</p>}
      {support === 'ok' && !contactSaved && <p className="field-hint">{t('push.needContact')}</p>}
      {support === 'ok' && contactSaved && info && (
        <div className="push-actions">
          {mine ? (
            <>
              <span className="pill ok"><Bell size={14} aria-hidden />{t('push.enabled')}</span>
              <button className="btn" disabled={!!busy} onClick={() => act('test', () => sendTestPush(mine), t('push.testSent'))}>
                {spinner('test', <Send size={16} aria-hidden />)}{t('push.test')}
              </button>
              <button className="btn" disabled={!!busy} onClick={() => act('off', disablePush, t('push.disabledMsg'))}>
                {spinner('off', <BellOff size={16} aria-hidden />)}{t('push.disable')}
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
              }, t('push.enabledMsg'))}
            >
              {spinner('on', <Bell size={16} aria-hidden />)}{t('push.enable')}
            </button>
          )}
        </div>
      )}

      {info && info.devices.length > 0 && (
        <>
          <div className="push-title" style={{ marginTop: 14 }}>{t('push.devices')}</div>
          <ul className="device-list">
            {info.devices.map((d) => (
              <li key={d.id}>
                <span>
                  {d.label}
                  {d.endpoint === mine && <span className="device-this">{t('push.this')}</span>}
                  <span className="device-date">{new Date(d.createdAt).toLocaleDateString(dateLocale(lang))}</span>
                </span>
                <button className="icon-btn danger" disabled={!!busy} onClick={() => act(`rm-${d.id}`, () => removeDevice(d.id))} aria-label={t('push.removeAria', { label: d.label })} title={t('push.remove')}>
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
  const t = useT();
  return (
    <span className="pw-wrap">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
      <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? t('settings.hidePassword') : t('settings.showPassword')} aria-pressed={show}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}
