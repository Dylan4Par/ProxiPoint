import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Lock, MapPin, MessagesSquare } from 'lucide-react-native';
import { ProxiPointLogo } from '../../components/brand/ProxiPointLogo';
import { AuthButton, AuthError, AuthField, AuthPage, AuthTitle } from '../../components/auth/AuthParts';
import { LegalDocModal } from '../../components/auth/LegalDocModal';
import { LEGAL_VERSION, MINIMUM_AGE, type LegalDocId } from '../../lib/legal';
import {
  authErrorMessage,
  isValidEmail,
  isValidPassword,
  passwordChecks,
  passwordStrength,
} from '../../lib/authForm';
import { AuthError as ApiError, requestPasswordReset, signIn, signUp, usingLocalAuth } from '../../services/authApi';
import { useAuthStore } from '../../stores/useAuthStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';
import { OnboardingScreen } from './OnboardingScreen';

/**
 * Everything before Discover: welcome, sign up, sign in, password reset, then onboarding for new
 * accounts. Each screen carries the "A Call Sign Solutions product" line at the bottom.
 */
type Page = 'welcome' | 'signUp' | 'signIn' | 'forgot';

const messageFor = (error: unknown) => authErrorMessage(error instanceof ApiError ? error.code : 'unknown');

export const AuthFlow: React.FC = () => {
  const status = useAuthStore((s) => s.status);
  const [page, setPage] = useState<Page>('welcome');
  // Carried between sign-in, sign-up and reset so people don't retype it.
  const [email, setEmail] = useState('');

  // Android back: step back toward the welcome screen instead of closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (status !== 'signedOut' || page === 'welcome') return false;
      setPage(page === 'forgot' ? 'signIn' : 'welcome');
      return true;
    });
    return () => sub.remove();
  }, [page, status]);

  if (status === 'onboarding') return <OnboardingScreen />;
  if (page === 'signUp')
    return <SignUpPage email={email} onEmail={setEmail} onBack={() => setPage('welcome')} onSignIn={() => setPage('signIn')} />;
  if (page === 'signIn')
    return (
      <SignInPage
        email={email}
        onEmail={setEmail}
        onBack={() => setPage('welcome')}
        onSignUp={() => setPage('signUp')}
        onForgot={() => setPage('forgot')}
      />
    );
  if (page === 'forgot') return <ForgotPage email={email} onEmail={setEmail} onBack={() => setPage('signIn')} />;
  return <WelcomePage onSignUp={() => setPage('signUp')} onSignIn={() => setPage('signIn')} />;
};

// ---- Welcome --------------------------------------------------------------------------------

const VALUE_LINES = [
  { Icon: MapPin, text: 'Events, tips and questions pinned to real places near you' },
  { Icon: MessagesSquare, text: 'Channels for your town, your crew and what you’re into' },
  { Icon: Lock, text: 'You choose what’s shared, and who sees it' },
];

const WelcomePage: React.FC<{ onSignUp: () => void; onSignIn: () => void }> = ({ onSignUp, onSignIn }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // Set when the app signed someone out on its own (60 days away, or a year on this phone).
  const notice = useAuthStore((s) => s.notice);
  return (
    <AuthPage
      testID="auth-welcome"
      footer={
        <View style={styles.welcomeButtons}>
          <AuthButton label="Create account" onPress={onSignUp} testID="welcome-sign-up" />
          <AuthButton label="Sign in" kind="secondary" onPress={onSignIn} testID="welcome-sign-in" />
        </View>
      }
    >
      {notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
      <View style={styles.hero}>
        <ProxiPointLogo size={88} />
        <Text style={styles.wordmark}>ProxiPoint</Text>
        <Text style={styles.tagline}>See what’s happening around you, right now.</Text>
      </View>
      <View style={styles.values}>
        {VALUE_LINES.map(({ Icon, text }) => (
          <View key={text} style={styles.valueRow}>
            <View style={styles.valueIcon}>
              <Icon size={18} color={c.accent} strokeWidth={2.2} />
            </View>
            <Text style={styles.valueText}>{text}</Text>
          </View>
        ))}
      </View>
    </AuthPage>
  );
};

// ---- Sign up --------------------------------------------------------------------------------

const SignUpPage: React.FC<{
  email: string;
  onEmail: (email: string) => void;
  onBack: () => void;
  onSignIn: () => void;
}> = ({ email, onEmail, onBack, onSignIn }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const setSession = useAuthStore((s) => s.setSession);
  const [password, setPassword] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  // "I'm 18 or older and agree to the Terms, Privacy Policy and Community Guidelines" (required).
  const [agreed, setAgreed] = useState(false);
  const [reading, setReading] = useState<LegalDocId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput | null>(null);

  const emailOk = isValidEmail(email);
  const checks = passwordChecks(password, email);
  const passwordOk = isValidPassword(password, email);
  const strength = passwordOk ? passwordStrength(password) : null;
  const canSubmit = emailOk && passwordOk && agreed && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await setSession(await signUp(email, password, LEGAL_VERSION));
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  };

  return (
    <AuthPage
      testID="auth-sign-up"
      onBack={onBack}
      footer={
        <View style={styles.formButtons}>
          <AuthButton label="Create account" onPress={() => void submit()} disabled={!canSubmit} busy={busy} testID="sign-up-submit" />
          <AuthButton label="Already have an account? Sign in" kind="text" onPress={onSignIn} />
        </View>
      }
    >
      <AuthTitle title="Create your account" subtitle="Next you’ll pick a name and what you’re into." />
      <AuthError message={error} />
      <AuthField
        label="Email"
        value={email}
        onChangeText={(text) => {
          onEmail(text);
          setError(null);
        }}
        onBlur={() => setEmailTouched(true)}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={emailTouched && email && !emailOk ? 'Enter a valid email' : null}
        testID="sign-up-email"
      />
      <AuthField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setError(null);
        }}
        placeholder={`At least 10 characters`}
        secret
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        testID="sign-up-password"
        hint={
          <View style={styles.checks}>
            {checks.map((check) => (
              <View key={check.id} style={styles.checkRow}>
                <View style={[styles.checkDot, check.ok && styles.checkDotOk]}>
                  {check.ok ? <Check size={10} color={c.onAccent} strokeWidth={3.5} /> : null}
                </View>
                <Text style={[styles.checkText, check.ok && styles.checkTextOk]}>{check.label}</Text>
              </View>
            ))}
            {strength ? (
              <Text style={styles.strength}>
                Strength: <Text style={strength === 'weak' ? styles.weak : styles.good}>{strength}</Text>
              </Text>
            ) : null}
          </View>
        }
      />
      <TouchableOpacity
        style={styles.agreeRow}
        onPress={() => setAgreed((on) => !on)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        accessibilityLabel={`I'm ${MINIMUM_AGE} or older and agree to the Terms of Service, Privacy Policy and Community Guidelines`}
        testID="sign-up-agree"
      >
        <View style={[styles.box, agreed && styles.boxOn]}>
          {agreed ? <Check size={14} color={c.onAccent} strokeWidth={3.5} /> : null}
        </View>
        <Text style={styles.agreeText}>
          I’m {MINIMUM_AGE} or older and agree to the{' '}
          <Text style={styles.agreeLink} onPress={() => setReading('terms')}>
            Terms of Service
          </Text>
          ,{' '}
          <Text style={styles.agreeLink} onPress={() => setReading('privacy')}>
            Privacy Policy
          </Text>{' '}
          and{' '}
          <Text style={styles.agreeLink} onPress={() => setReading('guidelines')}>
            Community Guidelines
          </Text>
          .
        </Text>
      </TouchableOpacity>
      <LegalDocModal doc={reading} onChange={setReading} onClose={() => setReading(null)} />
      {usingLocalAuth ? <Text style={styles.devNote}>Dev mode: accounts are saved on this phone only.</Text> : null}
    </AuthPage>
  );
};

// ---- Sign in --------------------------------------------------------------------------------

const SignInPage: React.FC<{
  email: string;
  onEmail: (email: string) => void;
  onBack: () => void;
  onSignUp: () => void;
  onForgot: () => void;
}> = ({ email, onEmail, onBack, onSignUp, onForgot }) => {
  const styles = useThemedStyles(createStyles);
  const setSession = useAuthStore((s) => s.setSession);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  const canSubmit = isValidEmail(email) && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await setSession(await signIn(email, password));
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  };

  return (
    <AuthPage
      testID="auth-sign-in"
      onBack={onBack}
      footer={
        <View style={styles.formButtons}>
          <AuthButton label="Sign in" onPress={() => void submit()} disabled={!canSubmit} busy={busy} testID="sign-in-submit" />
          <AuthButton label="New here? Create an account" kind="text" onPress={onSignUp} />
        </View>
      }
    >
      <AuthTitle title="Welcome back" subtitle="Sign in to see what’s happening nearby." />
      <AuthError message={error} />
      <AuthField
        label="Email"
        value={email}
        onChangeText={(text) => {
          onEmail(text);
          setError(null);
        }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        testID="sign-in-email"
      />
      <AuthField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setError(null);
        }}
        placeholder="Your password"
        secret
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        testID="sign-in-password"
      />
      <TouchableOpacity onPress={onForgot} style={styles.forgot} accessibilityRole="button" testID="sign-in-forgot">
        <Text style={styles.link}>Forgot password?</Text>
      </TouchableOpacity>
    </AuthPage>
  );
};

// ---- Forgot password ------------------------------------------------------------------------

const ForgotPage: React.FC<{ email: string; onEmail: (email: string) => void; onBack: () => void }> = ({
  email,
  onEmail,
  onBack,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!isValidEmail(email) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthPage
        testID="auth-forgot-sent"
        onBack={onBack}
        footer={<AuthButton label="Back to sign in" onPress={onBack} />}
      >
        <View style={styles.sentIcon}>
          <Check size={28} color={c.onAccent} strokeWidth={3} />
        </View>
        <AuthTitle
          title="Check your email"
          subtitle={`If there’s an account for ${email.trim()}, we’ve sent a link to reset its password. It works for 30 minutes.`}
        />
      </AuthPage>
    );
  }

  return (
    <AuthPage
      testID="auth-forgot"
      onBack={onBack}
      footer={
        <AuthButton label="Send reset link" onPress={() => void submit()} disabled={!isValidEmail(email)} busy={busy} />
      }
    >
      <AuthTitle title="Reset your password" subtitle="We’ll email you a link to choose a new one." />
      <AuthError message={error} />
      <AuthField
        label="Email"
        value={email}
        onChangeText={onEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
        testID="forgot-email"
      />
    </AuthPage>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    hero: { alignItems: 'center', marginTop: 40, gap: 10 },
    wordmark: { color: c.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 8 },
    tagline: { color: c.textMuted, fontSize: 16, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
    values: { marginTop: 40, gap: 18 },
    valueRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    valueIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.accentTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    valueText: { flex: 1, color: c.textBody, fontSize: 15, lineHeight: 21 },
    welcomeButtons: { gap: 10, marginBottom: 6 },
    formButtons: { gap: 2 },
    checks: { marginTop: 10, gap: 6 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkDotOk: { backgroundColor: c.green, borderColor: c.green },
    checkText: { color: c.textMuted, fontSize: 13 },
    checkTextOk: { color: c.textBody },
    strength: { color: c.textMuted, fontSize: 13, marginTop: 2 },
    weak: { color: c.amber, fontWeight: '700' },
    good: { color: c.green, fontWeight: '700' },
    agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 4, paddingVertical: 4 },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    boxOn: { backgroundColor: c.accent, borderColor: c.accent },
    agreeText: { flex: 1, color: c.textSecondary, fontSize: 14, lineHeight: 21 },
    agreeLink: { color: c.accent, fontWeight: '700', textDecorationLine: 'underline' },
    notice: {
      backgroundColor: c.surface,
      borderLeftWidth: 3,
      borderLeftColor: c.accent,
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
    },
    noticeText: { color: c.textBody, fontSize: 14, lineHeight: 19 },
    devNote: { color: c.amber, fontSize: 12, marginTop: 10 },
    forgot: { alignSelf: 'flex-end', paddingVertical: 4 },
    link: { color: c.accent, fontSize: 14, fontWeight: '700' },
    sentIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.green,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 24,
      marginBottom: 20,
    },
  });
