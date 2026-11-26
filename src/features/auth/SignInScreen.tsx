import { useEffect, useState, type FormEvent } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { TEAM_META_KEYS } from '@/services/team/teamService';
import { checkForAppUpdate, setReloadSafe } from '@/app/pwa/appUpdate';
import { MIN_PASSWORD_LENGTH, validateSignIn, validateSignUp, type AuthError, type AuthState } from '@/domain/account';
import { t } from '@/i18n';
import { Button, GoogleLogo, Icon, SegmentedControl, TextField } from '@/ui';
import { LanguageToggle } from './LanguageToggle';
import styles from './AuthScreen.module.css';

type Mode = 'signIn' | 'signUp';

export interface SignInScreenProps {
  /** An error to show on arrival (e.g. Google sign-in came back with an error). */
  initialError?: AuthError | null;
  onSignedIn: (state: AuthState) => void | Promise<void>;
}

export function authErrorText(error: AuthError): string {
  return t(`auth.errors.${error}`, { min: MIN_PASSWORD_LENGTH });
}

export function SignInScreen({ initialError = null, onSignedIn }: SignInScreenProps) {
  const { auth, meta } = useServices();
  // Opened from a gym's invite link while signed out: say that joining happens right after signing in.
  const invite = useLive(() => meta.get(TEAM_META_KEYS.pendingJoin), [meta]);
  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<AuthError | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);

  // Nothing to lose on this screen: let a newer app version replace this one immediately.
  useEffect(() => {
    setReloadSafe(true);
    void checkForAppUpdate();
    return () => setReloadSafe(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void auth.googleAvailable().then((available) => !cancelled && setGoogle(available));
    return () => {
      cancelled = true;
    };
  }, [auth]);

  // iOS may finish Google sign-in in another view of this app: pick the account up when we come back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void auth.getState().then((state) => state.status !== 'signedOut' && onSignedIn(state));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [auth, onSignedIn]);

  const finish = async (result: Awaited<ReturnType<typeof auth.signIn>>) => {
    if (result.ok) {
      await onSignedIn(result.state);
      return;
    }
    setError(result.error);
    setBusy(false);
    // A network/server failure may mean this phone still runs an old cached build: look for a new one.
    if (result.error === 'offline' || result.error === 'unavailable') void checkForAppUpdate();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const checked = mode === 'signIn' ? validateSignIn({ email, password }) : validateSignUp({ name, email, password });
    if (!checked.ok) return setError(checked.error);
    setBusy(true);
    setError(null);
    await finish(mode === 'signIn' ? await auth.signIn(checked.email, password) : await auth.signUp(name.trim(), checked.email, password));
  };

  const startGoogle = () => {
    const url = auth.googleStartUrl();
    if (url === null) return setError('google_unavailable');
    setBusy(true);
    window.location.assign(url);
  };

  const continueAsGuest = async () => {
    setBusy(true);
    await onSignedIn(await auth.continueAsGuest());
  };

  const message = error === null ? null : authErrorText(error);
  const fieldError = (fields: readonly AuthError[]) => (error !== null && fields.includes(error) ? message : undefined);

  return (
    <main className={styles.page}>
      <div className={styles.langRow}>
        <LanguageToggle />
      </div>
      <span className={styles.mark} aria-hidden="true">
        {t('app.name').charAt(0)}
      </span>
      <h1 className={styles.title}>{t('auth.title')}</h1>
      <p className={styles.lead}>{t('auth.lead')}</p>
      {typeof invite === 'object' && invite !== null && (
        <p className={styles.invite} role="status">
          {t('team.join.signInFirst')}
        </p>
      )}

      <SegmentedControl<Mode>
        label={t('auth.modeLabel')}
        options={[
          { value: 'signIn', label: t('auth.signInTab') },
          { value: 'signUp', label: t('auth.signUpTab') },
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setError(null);
        }}
      />

      <form className={styles.form} onSubmit={submit} noValidate>
        {mode === 'signUp' && (
          <TextField
            label={t('auth.nameLabel')}
            placeholder={t('auth.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            error={fieldError(['missing_name'])}
            maxLength={100}
          />
        )}
        <TextField
          label={t('auth.emailLabel')}
          type="email"
          inputMode="email"
          autoComplete={mode === 'signIn' ? 'username' : 'email'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError(['invalid_email', 'email_taken'])}
          ltr
        />
        <div className={styles.passwordRow}>
          <TextField
            label={t('auth.passwordLabel')}
            hint={mode === 'signUp' ? t('auth.passwordHint', { min: MIN_PASSWORD_LENGTH }) : undefined}
            type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldError(['weak_password', 'missing_password'])}
            maxLength={128}
            ltr
          />
          <button
            type="button"
            className={styles.reveal}
            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            <Icon name={showPassword ? 'eyeOff' : 'eye'} />
          </button>
        </div>

        {message !== null && fieldError(['missing_name', 'invalid_email', 'email_taken', 'weak_password', 'missing_password']) === undefined && (
          <p className={styles.error} role="alert">
            {message}
          </p>
        )}

        <Button icon={mode === 'signIn' ? 'key' : 'userAdd'} type="submit" size="large" block disabled={busy}>
          {busy ? t('auth.working') : mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
        </Button>
        <p className={styles.note}>{mode === 'signIn' ? t('auth.forgot') : t('auth.signUpNote')}</p>
      </form>

      {google && (
        <>
          <p className={styles.or}>{t('auth.or')}</p>
          <Button variant="outline" size="large" block leading={<GoogleLogo />} disabled={busy} onClick={startGoogle} data-testid="google-sign-in">
            {t('auth.google')}
          </Button>
        </>
      )}

      {auth.guestAllowed && (
        <div className={styles.guest}>
          <Button variant="plain" block disabled={busy} onClick={() => void continueAsGuest()} data-testid="guest-sign-in">
            {t('auth.guest')}
          </Button>
          <p className={styles.note}>{t('auth.guestHint')}</p>
        </div>
      )}

      <p className={styles.build} dir="ltr">
        {import.meta.env.VITE_BUILD_ID ?? 'dev'}
      </p>
    </main>
  );
}
