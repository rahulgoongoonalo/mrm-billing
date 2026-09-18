import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

// ── Icons ────────────────────────────────────────────────────────────────
const Svg = ({ children, size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const MailIcon = () => <Svg><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></Svg>;
const LockIcon = () => <Svg><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>;
const EyeIcon = () => <Svg><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Svg>;
const EyeOffIcon = () => (
  <Svg>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </Svg>
);
const AlertIcon = () => <Svg size={16}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></Svg>;
const CheckIcon = () => <Svg size={16}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></Svg>;
const ArrowLeftIcon = () => <Svg size={16}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></Svg>;
const CapsIcon = () => <Svg size={14}><path d="M12 4 4 12h5v6h6v-6h5z" /></Svg>;

// ── Helpers ──────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Turn a failed request into something a person can act on.
function friendlyError(result, context) {
  const status = result?.status;
  const raw = result?.error || '';
  if (status === 0) return "Can't reach the server. Check your internet connection and try again.";
  if (status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
  if (context === 'login' && status === 401) return 'Incorrect email or password.';
  if (context === 'reset' && /invalid|expired/i.test(raw)) return 'This reset link is invalid or has expired.';
  return raw || 'Something went wrong. Please try again.';
}

function passwordStrength(pw) {
  if (!pw) return { level: 0, label: '' };
  if (pw.length < 8) return { level: 1, label: 'Too short' };
  let score = 1;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return [null, { level: 1, label: 'Weak' }, { level: 2, label: 'Fair' }, { level: 3, label: 'Good' }, { level: 4, label: 'Strong' }][Math.min(score, 4)];
}

// ── Building blocks ──────────────────────────────────────────────────────
function Field({ id, label, icon, error, invalid, hint, labelAside, trailing, inputRef, ...inputProps }) {
  const bad = !!error || !!invalid;
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="login-field">
      <div className="login-label-row">
        <label htmlFor={id}>{label}</label>
        {labelAside}
      </div>
      <div className={`login-input-wrap${bad ? ' is-invalid' : ''}`}>
        <span className="login-input-icon">{icon}</span>
        <input id={id} ref={inputRef} aria-invalid={bad} aria-describedby={describedBy} {...inputProps} />
        {trailing}
      </div>
      {error && <p className="login-field-error" id={`${id}-error`}><AlertIcon />{error}</p>}
      {!error && hint && <div className="login-field-hint" id={`${id}-hint`}>{hint}</div>}
    </div>
  );
}

function PasswordToggle({ shown, onToggle, controls }) {
  return (
    <button type="button" className="login-eye" onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} aria-controls={controls}
      title={shown ? 'Hide password' : 'Show password'}>
      {shown ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );
}

function Banner({ type, text, action }) {
  if (!text) return null;
  return (
    <div className={`login-banner login-banner--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span className="login-banner-icon">{type === 'error' ? <AlertIcon /> : <CheckIcon />}</span>
      <div>{text}{action && <> {action}</>}</div>
    </div>
  );
}

function SubmitButton({ loading, children, loadingText }) {
  return (
    <button type="submit" className="login-submit" disabled={loading} aria-busy={loading}>
      {loading && <span className="login-spinner" aria-hidden="true" />}
      {loading ? loadingText : children}
    </button>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────
const AuthModal = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlResetToken = urlParams.get('resetToken');

  const [view, setView] = useState(urlResetToken ? 'reset' : 'login');
  const [form, setForm] = useState({ email: '', password: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);           // { type, text }
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState({});
  const [capsLock, setCapsLock] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [shake, setShake] = useState(false);
  const [credError, setCredError] = useState(false);    // outline both fields after a rejected sign-in
  const [done, setDone] = useState(null);               // 'forgot' | 'reset' once those succeed
  const [resetToken] = useState(urlResetToken || '');

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const newPasswordRef = useRef(null);

  const { login, forgotPassword, resetPassword } = useAuth();

  useEffect(() => {
    if (urlResetToken) window.history.replaceState({}, '', window.location.pathname);
  }, [urlResetToken]);

  useEffect(() => {
    if (!shake) return undefined;
    const t = setTimeout(() => setShake(false), 480);
    return () => clearTimeout(t);
  }, [shake]);

  const goTo = (next) => {
    setView(next);
    setErrors({});
    setBanner(null);
    setDone(null);
    setCapsLock(false);
    setCredError(false);
    setShown({});                                         // never carry a revealed password across screens
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((er) => ({ ...er, [name]: undefined }));
    if (name === 'email' || name === 'password') setCredError(false);
    if (banner?.type === 'error') setBanner(null);
  };

  const trackCaps = (e) => {
    if (e.getModifierState) setCapsLock(e.getModifierState('CapsLock'));
  };

  const toggle = (field) => setShown((s) => ({ ...s, [field]: !s[field] }));

  const failWith = (text) => {
    setBanner({ type: 'error', text });
    setShake(true);
  };

  // ── Sign in ──
  const handleLogin = async (e) => {
    e.preventDefault();
    const email = form.email.trim();
    const next = {};
    if (!email) next.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(email)) next.email = "That doesn't look like a valid email address.";
    if (!form.password) next.password = 'Enter your password.';
    setErrors(next);
    if (next.email) { emailRef.current?.focus(); return; }
    if (next.password) { passwordRef.current?.focus(); return; }

    setLoading(true);
    setBanner(null);
    const result = await login(email.toLowerCase(), form.password);
    setLoading(false);
    if (result.success) return;

    if (result.status === 401) {
      // Same message whichever field was wrong, so it can't be used to probe for accounts.
      setFailedAttempts((n) => n + 1);
      setForm((f) => ({ ...f, password: '' }));
      setCredError(true);
      setTimeout(() => passwordRef.current?.focus(), 0);   // after the input is re-enabled
    }
    failWith(friendlyError(result, 'login'));
  };

  // ── Forgot password ──
  const handleForgot = async (e) => {
    e.preventDefault();
    const email = form.email.trim();
    if (!email) { setErrors({ email: 'Enter the email address you sign in with.' }); emailRef.current?.focus(); return; }
    if (!EMAIL_RE.test(email)) { setErrors({ email: "That doesn't look like a valid email address." }); emailRef.current?.focus(); return; }

    setLoading(true);
    setBanner(null);
    const result = await forgotPassword(email.toLowerCase());
    setLoading(false);
    if (result.success) { setDone('forgot'); return; }
    failWith(friendlyError(result, 'forgot'));
  };

  // ── Reset password ──
  const handleReset = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.newPassword) next.newPassword = 'Choose a new password.';
    else if (form.newPassword.length < 8) next.newPassword = 'Use at least 8 characters.';
    if (!next.newPassword && form.confirmPassword !== form.newPassword) next.confirmPassword = "The passwords don't match.";
    setErrors(next);
    if (next.newPassword) { newPasswordRef.current?.focus(); return; }
    if (next.confirmPassword) return;

    setLoading(true);
    setBanner(null);
    const result = await resetPassword(resetToken, form.newPassword);
    setLoading(false);
    if (result.success) {
      setDone('reset');
      setForm((f) => ({ ...f, newPassword: '', confirmPassword: '' }));
      return;
    }
    failWith(friendlyError(result, 'reset'));
  };

  // ── Views ──
  let heading, subheading, body;

  if (view === 'login') {
    heading = 'Welcome back';
    subheading = 'Sign in to continue to MRM Billing.';
    body = (
      <form onSubmit={handleLogin} noValidate>
        <Field id="login-email" label="Email" icon={<MailIcon />} inputRef={emailRef}
          type="email" name="email" value={form.email} onChange={onChange} error={errors.email} invalid={credError}
          placeholder="you@company.com" autoComplete="username" inputMode="email" autoFocus disabled={loading} />

        <Field id="login-password" label="Password" icon={<LockIcon />} inputRef={passwordRef}
          type={shown.password ? 'text' : 'password'} name="password" value={form.password} onChange={onChange}
          error={errors.password} invalid={credError}
          placeholder="Enter your password" autoComplete="current-password" disabled={loading}
          onKeyDown={trackCaps} onKeyUp={trackCaps} onBlur={() => setCapsLock(false)}
          labelAside={<button type="button" className="login-link" onClick={() => goTo('forgot')}>Forgot password?</button>}
          trailing={<PasswordToggle shown={!!shown.password} onToggle={() => toggle('password')} controls="login-password" />}
          hint={capsLock ? <span className="login-caps"><CapsIcon />Caps Lock is on</span> : null} />

        <Banner type={banner?.type} text={banner?.text}
          action={banner?.type === 'error' && failedAttempts >= 2
            ? <button type="button" className="login-link login-link--inline" onClick={() => goTo('forgot')}>Reset your password</button>
            : null} />

        <SubmitButton loading={loading} loadingText="Signing in…">Sign in</SubmitButton>
      </form>
    );
  }

  if (view === 'forgot') {
    heading = done === 'forgot' ? 'Check your inbox' : 'Reset your password';
    subheading = done === 'forgot'
      ? null
      : "Enter the email you sign in with and we'll send you a link to choose a new password.";
    body = done === 'forgot' ? (
      <div className="login-done">
        <div className="login-done-icon"><CheckIcon /></div>
        <p>If an account exists for <strong>{form.email.trim()}</strong>, a reset link is on its way. It stays valid for one hour.</p>
        <p className="login-muted">Didn&rsquo;t get it? Check your spam folder, or try again in a few minutes.</p>
        <button type="button" className="login-submit login-submit--ghost" onClick={() => goTo('login')}>
          <ArrowLeftIcon />Back to sign in
        </button>
      </div>
    ) : (
      <form onSubmit={handleForgot} noValidate>
        <Field id="forgot-email" label="Email" icon={<MailIcon />} inputRef={emailRef}
          type="email" name="email" value={form.email} onChange={onChange} error={errors.email}
          placeholder="you@company.com" autoComplete="username" inputMode="email" autoFocus disabled={loading} />
        <Banner type={banner?.type} text={banner?.text} />
        <SubmitButton loading={loading} loadingText="Sending link…">Send reset link</SubmitButton>
        <button type="button" className="login-back" onClick={() => goTo('login')}><ArrowLeftIcon />Back to sign in</button>
      </form>
    );
  }

  if (view === 'reset') {
    const strength = passwordStrength(form.newPassword);
    const matches = form.confirmPassword && form.confirmPassword === form.newPassword;
    heading = done === 'reset' ? 'Password updated' : 'Choose a new password';
    subheading = done === 'reset' ? null : 'Use at least 8 characters. A mix of letters, numbers and symbols is stronger.';
    body = done === 'reset' ? (
      <div className="login-done">
        <div className="login-done-icon"><CheckIcon /></div>
        <p>Your password has been changed. You can sign in with it now.</p>
        <button type="button" className="login-submit" onClick={() => goTo('login')}>Continue to sign in</button>
      </div>
    ) : (
      <form onSubmit={handleReset} noValidate>
        <Field id="reset-new" label="New password" icon={<LockIcon />} inputRef={newPasswordRef}
          type={shown.newPassword ? 'text' : 'password'} name="newPassword" value={form.newPassword} onChange={onChange}
          error={errors.newPassword} placeholder="At least 8 characters" autoComplete="new-password" autoFocus disabled={loading}
          onKeyDown={trackCaps} onKeyUp={trackCaps} onBlur={() => setCapsLock(false)}
          trailing={<PasswordToggle shown={!!shown.newPassword} onToggle={() => toggle('newPassword')} controls="reset-new" />}
          hint={form.newPassword ? (
            <div className="login-strength" data-level={strength.level}>
              <div className="login-strength-bar"><span /><span /><span /><span /></div>
              <span className="login-strength-label">{strength.label}</span>
              {capsLock && <span className="login-caps"><CapsIcon />Caps Lock is on</span>}
            </div>
          ) : (capsLock ? <span className="login-caps"><CapsIcon />Caps Lock is on</span> : null)} />

        <Field id="reset-confirm" label="Confirm new password" icon={<LockIcon />}
          type={shown.confirmPassword ? 'text' : 'password'} name="confirmPassword" value={form.confirmPassword} onChange={onChange}
          error={errors.confirmPassword} placeholder="Type it again" autoComplete="new-password" disabled={loading}
          trailing={<PasswordToggle shown={!!shown.confirmPassword} onToggle={() => toggle('confirmPassword')} controls="reset-confirm" />}
          hint={form.confirmPassword ? (
            <span className={matches ? 'login-match login-match--ok' : 'login-match'}>
              {matches ? <><CheckIcon />Passwords match</> : "Passwords don't match yet"}
            </span>
          ) : null} />

        <Banner type={banner?.type} text={banner?.text}
          action={banner?.type === 'error' && /expired|invalid/i.test(banner.text)
            ? <button type="button" className="login-link login-link--inline" onClick={() => goTo('forgot')}>Request a new link</button>
            : null} />

        <SubmitButton loading={loading} loadingText="Updating…">Update password</SubmitButton>
        <button type="button" className="login-back" onClick={() => goTo('login')}><ArrowLeftIcon />Back to sign in</button>
      </form>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-glow login-glow--a" aria-hidden="true" />
      <div className="login-glow login-glow--b" aria-hidden="true" />

      <div className="login-shell">
        <aside className="login-brand">
          <div className="login-logo">MRM</div>
          <h1>MRM Royalty Commission Accounting</h1>
          <p className="login-brand-lede">Royalties, commission, GST and outstanding balances for every client, month by month.</p>
          <ul className="login-points">
            <li><CheckIcon />IPRS, PRS, ISAMRA, ASCAP, PPL, MLC and Sound Exchange in one ledger</li>
            <li><CheckIcon />Commission and GST worked out as you enter</li>
            <li><CheckIcon />Balances carried forward automatically</li>
          </ul>
          <p className="login-brand-foot">Music Rights Management India</p>
        </aside>

        <main className={`login-card${shake ? ' login-card--shake' : ''}`}>
          <div className={`login-card-head${done ? ' login-card-head--center' : ''}`}>
            <div className="login-logo login-logo--small" aria-hidden="true">MRM</div>
            <h2>{heading}</h2>
            {subheading && <p>{subheading}</p>}
          </div>
          {body}
        </main>
      </div>
    </div>
  );
};

export default AuthModal;
