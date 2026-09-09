import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Cairo_400Regular, Cairo_500Medium, Cairo_600SemiBold, Cairo_700Bold } from '@expo-google-fonts/cairo';
import { loadAsync } from 'expo-font';
import { Stack, router, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AjyalProvider, useAjyal } from '@/hooks/useAjyal';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { AuthProvider, getAuthToken, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/hooks/useColors';
import { InternalCallProvider } from '@/contexts/InternalCallContext';
import { IncomingCallOverlay } from '@/components/IncomingCallOverlay';
import { enforceAvailableUpdate } from '@/lib/appUpdates';
import { BRAND_ICON } from '@/components/AjyalUI';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AppPreferencesProvider, useAppPreferences } from '@/contexts/AppPreferencesContext';
import { StatusBar } from 'expo-status-bar';
import { clearRememberedLogin } from '@/lib/rememberedLogin';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const APP_FONT_MAP = {
  Inter_400Regular: Cairo_400Regular,
  Inter_500Medium: Cairo_500Medium,
  Inter_600SemiBold: Cairo_600SemiBold,
  Inter_700Bold: Cairo_700Bold,
};
const appFontsReady = loadAsync(APP_FONT_MAP)
  .then(() => true)
  .catch((error) => {
    console.warn('[fonts] Could not preload app fonts:', error);
    return false;
  });
const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
if (apiDomain) setBaseUrl(`https://${apiDomain}`);
setAuthTokenGetter(getAuthToken);

const PUBLIC_PATHS = new Set([
  '/privacy',
  '/terms',
  '/auth/callback',
  '/forgot-password',
  '/reset-password',
  '/payment-success',
]);

function RootLayoutNav() {
  const colors = useColors();
  const { isLoading: authLoading, isAuthenticated, isPasswordRecovery, login, loginWithGoogle, user } = useAuth();
  const { profile, role, roleResolved, profileError, retryProfile, logout: logoutAjyal, isLoading: profileLoading } = useAjyal();
  const { t } = useAppPreferences();
  const pathname = usePathname();
  const { width: viewportWidth } = useWindowDimensions();
  const [authMode, setAuthMode] = React.useState<'login' | 'signup'>('login');
  const [signupRole, setSignupRole] = React.useState<'student' | 'teacher'>('student');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [authSubmitting, setAuthSubmitting] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [bootstrapTimedOut, setBootstrapTimedOut] = React.useState(false);
  useEffect(() => {
    // Remove credentials saved by older releases. Session persistence is
    // handled by Supabase and must never depend on a stored password.
    void clearRememberedLogin();
  }, []);

  const bootstrapLoading = authLoading || (isAuthenticated && profileLoading);
  const homeReady = Boolean(
    isAuthenticated &&
    !authLoading &&
    !profileLoading &&
    profile &&
    roleResolved &&
    !profile.isBanned &&
    (profile.role === "student" || (profile.role === "teacher" && profile.teacherApproved === true)),
  );
  const homeNavigationAttempted = React.useRef(false);
  useEffect(() => {
    if (!bootstrapLoading) {
      setBootstrapTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setBootstrapTimedOut(true), 12_000);
    return () => clearTimeout(timeout);
  }, [bootstrapLoading]);
  useEffect(() => {
    if (!isAuthenticated) {
      homeNavigationAttempted.current = false;
      return;
    }
    if (isPasswordRecovery) {
      homeNavigationAttempted.current = false;
      if (pathname !== "/reset-password") {
        const timeout = setTimeout(() => router.replace("/reset-password"), 0);
        return () => clearTimeout(timeout);
      }
      return;
    }
    if (!homeReady || homeNavigationAttempted.current) return;
    homeNavigationAttempted.current = true;
    const isAuthEntryPath = pathname === "/" || pathname === "/(tabs)" || pathname === "/forgot-password";
    if (isAuthEntryPath && pathname !== "/") {
      const timeout = setTimeout(() => router.replace("/"), 0);
      return () => clearTimeout(timeout);
    }
  }, [homeReady, isAuthenticated, isPasswordRecovery, pathname]);

  // The web platform announces an instant-session start through the booking
  // Realtime update. Keep this listener at the app shell level so a student
  // is not required to remain on the bookings tab while waiting for the
  // teacher to start from the computer.
  useEffect(() => {
    const client = supabase;
    if (!client || !profile?.id || role !== 'student' || pathname === '/live-session') return undefined;
    let mounted = true;
    const instantWaitingIds = new Set<string>();

    const loadPendingInstantSessions = async () => {
      const { data } = await client
        .from('bookings')
        .select('id, session_status, scheduled_at, created_at')
        .eq('student_id', profile.id)
        .in('session_status', ['waiting_acceptance', 'in_progress']);
      if (!mounted) return;
      for (const row of data ?? []) {
        const scheduledAt = typeof row.scheduled_at === 'string' ? Date.parse(row.scheduled_at) : Number.NaN;
        const createdAt = typeof row.created_at === 'string' ? Date.parse(row.created_at) : Number.NaN;
        const looksInstant = Number.isFinite(scheduledAt) && Number.isFinite(createdAt)
          && Math.abs(scheduledAt - createdAt) <= 5 * 60 * 1000;
        if (row.session_status === 'waiting_acceptance' || (row.session_status === 'in_progress' && looksInstant)) {
          instantWaitingIds.add(String(row.id));
          if (row.session_status === 'in_progress' && looksInstant && pathname !== '/live-session') {
            router.replace({ pathname: '/live-session', params: { booking: String(row.id) } });
          }
        }
      }
    };

    void loadPendingInstantSessions();
    const channel = client
      .channel(`mobile-instant-session-start-${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `student_id=eq.${profile.id}`,
      }, (payload) => {
        const updated = payload.new as {
          id?: unknown;
          session_status?: unknown;
          scheduled_at?: unknown;
          created_at?: unknown;
        };
        const bookingId = typeof updated.id === 'string' ? updated.id : null;
        const scheduledAt = typeof updated.scheduled_at === 'string' ? Date.parse(updated.scheduled_at) : Number.NaN;
        const createdAt = typeof updated.created_at === 'string' ? Date.parse(updated.created_at) : Number.NaN;
        const looksInstant = Number.isFinite(scheduledAt) && Number.isFinite(createdAt)
          && Math.abs(scheduledAt - createdAt) <= 5 * 60 * 1000;
        if (!bookingId) return;
        if (updated.session_status === 'waiting_acceptance') {
          instantWaitingIds.add(bookingId);
          return;
        }
        if (updated.session_status !== 'in_progress' || (!instantWaitingIds.has(bookingId) && !looksInstant)) return;
        instantWaitingIds.delete(bookingId);
        if (!mounted || pathname === '/live-session') return;
        router.replace({ pathname: '/live-session', params: { booking: bookingId } });
      })
      .subscribe();

    return () => {
      mounted = false;
      void client.removeChannel(channel);
    };
  }, [pathname, profile?.id, role]);

  const isPublicRoute = PUBLIC_PATHS.has(pathname);
  let overlay: React.ReactNode = null;

  if (!isPasswordRecovery && bootstrapLoading && !bootstrapTimedOut) {
    overlay = (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingLogo, { backgroundColor: colors.primary }]}><Image source={BRAND_ICON} style={styles.logoImage} /></View>
        <View style={[styles.authSkeleton, { backgroundColor: colors.muted }]} />
        <View style={[styles.authSkeleton, styles.authSkeletonSmall, { backgroundColor: colors.muted }]} />
      </View>
    );
  }
  if (!isPasswordRecovery && bootstrapTimedOut) {
    overlay = (
      <AccessStateScreen
        title={authLoading ? t("تعذر استعادة الجلسة", "Couldn't restore your session") : t("تعذر تحميل ملف الحساب", "Couldn't load your account")}
        body={authLoading
          ? t("استغرق الاتصال بمنصة أجيال المعرفة وقتاً أطول من المتوقع. يمكنك العودة لتسجيل الدخول والمحاولة مرة أخرى.", "Connecting to Ajyal Knowledge is taking longer than expected. Return to sign in and try again.")
          : t("تم تسجيل الدخول، لكن لم تصل بيانات الملف والصلاحيات من المنصة. تحقق من الاتصال ثم أعد المحاولة.", "You are signed in, but your profile and permissions did not arrive. Check your connection and try again.")}
        actionLabel={authLoading ? t("العودة لتسجيل الدخول", "Return to sign in") : t("إعادة المحاولة", "Try again")}
        onAction={() => void (authLoading ? logoutAjyal() : retryProfile())}
        colors={colors}
      />
    );
  }
  if (!isPasswordRecovery && isAuthenticated && !profileLoading && !profile) {
    overlay = (
      <View style={[styles.authScreen, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingLogo, { backgroundColor: colors.primary }]}>
          <Image source={BRAND_ICON} style={styles.logoImage} />
        </View>
        <Text style={[styles.authErrorTitle, { color: colors.foreground }]}>{t("تعذر التحقق من حسابك", "We couldn't verify your account")}</Text>
        <Text style={[styles.authErrorText, { color: colors.mutedForeground }]}>
          {t("لم يتم العثور على ملف أو دور مؤكد في منصة أجيال المعرفة. لن نفتح واجهة الطالب تلقائياً.", "No confirmed profile or role was found in Ajyal Knowledge. We won't open the student area automatically.")}
        </Text>
        {profileError ? <Text style={[styles.authErrorText, { color: colors.destructive }]}>{t("تحقق من الاتصال ثم حاول مرة أخرى.", "Check your connection and try again.")}</Text> : null}
        <View style={styles.authErrorActions}>
          <Pressable onPress={() => void retryProfile()} style={[styles.authErrorButton, { backgroundColor: colors.primary }]}>
              <Text style={[styles.authErrorButtonText, { color: colors.primaryForeground }]}>{t("إعادة المحاولة", "Try again")}</Text>
          </Pressable>
          <Pressable onPress={() => void logoutAjyal()} style={[styles.authErrorButton, { borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={[styles.authErrorButtonText, { color: colors.foreground }]}>{t("تسجيل الخروج", "Sign out")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!isPasswordRecovery && !isAuthenticated && !isPublicRoute) {
    const isSignup = authMode === 'signup';
    const openForgotPassword = () => {
      router.push('/forgot-password');
    };
    const startHostedAuth = async (mode: 'login' | 'signup') => {
      setAuthSubmitting(true);
      setAuthError(null);
      try {
          await login(mode, signupRole, { email, password, fullName });
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : t('تعذر تسجيل الدخول', 'Unable to sign in'));
      } finally {
        setAuthSubmitting(false);
      }
    };
    const startGoogleAuth = async () => {
      setAuthSubmitting(true);
      setAuthError(null);
      try {
        await loginWithGoogle(isSignup ? signupRole : undefined, isSignup);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : t('تعذر تسجيل الدخول باستخدام Google', 'Unable to sign in with Google'));
      } finally {
        setAuthSubmitting(false);
      }
    };
    overlay = (
      <View style={[styles.authScreen, { backgroundColor: colors.background }]}>
        <KeyboardAwareScrollViewCompat
          style={styles.authScroll}
          contentContainerStyle={[styles.authContent, { width: viewportWidth }]}
          bottomOffset={28}
          keyboardDismissMode="on-drag"
        >
          <LinearGradient colors={[colors.primary, '#286A9E', colors.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.authHero, { width: viewportWidth }]}>
            <View style={[styles.authHeroOrb, styles.authHeroOrbOne, { backgroundColor: colors.tint }]} />
            <View style={[styles.authHeroOrb, styles.authHeroOrbTwo, { backgroundColor: colors.accent }]} />
            <View style={styles.authHeroTop}>
              <View style={[styles.heroLogoFrame, { backgroundColor: colors.card }]}>
                <Image source={BRAND_ICON} style={styles.heroLogo} />
              </View>
              <View style={styles.heroBrandCopy}>
                <Text style={[styles.heroBrandName, { color: colors.primaryForeground }]}>أجيال المعرفة</Text>
                <Text style={[styles.heroBrandTagline, { color: colors.tint }]}>{t('نتعلم اليوم، نصنع الغد', 'Learn today, shape tomorrow')}</Text>
              </View>
            </View>
            <View style={styles.heroCopy}>
               <View style={styles.heroKicker}><View style={[styles.heroKickerDot, { backgroundColor: colors.accent }]} /><Text style={[styles.heroKickerText, { color: colors.tint }]}>{t('مساحتك التعليمية', 'Your learning space')}</Text></View>
               <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>{isSignup ? t('ابدأ رحلتك معنا', 'Start your journey with us') : t('مستقبلك يبدأ من هنا', 'Your future starts here')}</Text>
               <Text style={[styles.heroBody, { color: colors.tint }]}>{isSignup ? t('حساب واحد يفتح لك تجربة تعلم مصممة لأهدافك.', 'One account opens a learning experience built around your goals.') : t('كل ما تحتاجه للتعلم والتقدم، في مكان واحد.', 'Everything you need to learn and move forward, in one place.')}</Text>
            </View>
          </LinearGradient>

          <View style={[styles.authSheet, { backgroundColor: colors.card, width: viewportWidth }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
             <Text style={[styles.authTitle, { color: colors.foreground }]}>{isSignup ? t('أنشئ حسابك الآن', 'Create your account') : t('أهلًا بعودتك', 'Welcome back')}</Text>
             <Text style={[styles.authBody, { color: colors.mutedForeground }]}>{isSignup ? t('اختر نوع حسابك وابدأ بخطوة بسيطة.', 'Choose your account type and start with one simple step.') : t('سجّل دخولك للعودة إلى مساحتك التعليمية.', 'Sign in to return to your learning space.')}</Text>

            <View style={[styles.authModeSwitch, { backgroundColor: colors.muted }]}>
              <Pressable testID="signup-mode-button" onPress={() => setAuthMode('signup')} style={[styles.authMode, isSignup && { backgroundColor: colors.card }]}>
                 <Text style={[styles.authModeText, { color: isSignup ? colors.foreground : colors.mutedForeground }]}>{t('إنشاء حساب', 'Create account')}</Text>
              </Pressable>
              <Pressable testID="login-mode-button" onPress={() => setAuthMode('login')} style={[styles.authMode, !isSignup && { backgroundColor: colors.card }]}>
                 <Text style={[styles.authModeText, { color: !isSignup ? colors.foreground : colors.mutedForeground }]}>{t('تسجيل الدخول', 'Sign in')}</Text>
              </Pressable>
            </View>

            <Pressable testID="google-login-button" onPress={() => void startGoogleAuth()} style={({ pressed }) => [styles.googleButton, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
              <View style={[styles.googleMark, { borderColor: colors.border }]}><Text style={styles.googleMarkText}>G</Text></View>
               <Text style={[styles.googleButtonText, { color: colors.foreground }]}>{t('المتابعة باستخدام Google', 'Continue with Google')}</Text>
              <View style={styles.googleSpacer} />
            </Pressable>

            <View style={styles.orRow}>
              <View style={[styles.orLine, { backgroundColor: colors.border }]} />
               <Text style={[styles.orText, { color: colors.mutedForeground }]}>{t('أو باستخدام البريد الإلكتروني', 'or use email')}</Text>
              <View style={[styles.orLine, { backgroundColor: colors.border }]} />
            </View>

            {isSignup ? (
              <>
                 <AuthInput icon="user" placeholder={t('الاسم الكامل', 'Full name')} value={fullName} onChangeText={setFullName} colors={colors} />
                <View style={styles.rolePicker}>
                   <Text style={[styles.roleLabel, { color: colors.mutedForeground }]}>{t('أريد التسجيل كـ', 'I want to join as')}</Text>
                  <View style={styles.roleOptions}>
                    {([
                       { value: 'student' as const, title: t('طالب', 'Student'), body: t('أبحث عن معلم', 'I am looking for a teacher'), icon: '🎓' },
                       { value: 'teacher' as const, title: t('معلم', 'Teacher'), body: t('أريد التدريس', 'I want to teach'), icon: '📚' },
                    ]).map((item) => {
                      const active = signupRole === item.value;
                      return (
                        <Pressable key={item.value} testID={`signup-role-${item.value}`} onPress={() => setSignupRole(item.value)} style={[styles.roleOption, { borderColor: active ? colors.teal : colors.border, backgroundColor: active ? colors.tealSoft : colors.card }]}>
                          <Text style={styles.roleEmoji}>{item.icon}</Text>
                          <Text style={[styles.roleTitle, { color: active ? colors.teal : colors.foreground }]}>{item.title}</Text>
                          <Text style={[styles.roleBody, { color: colors.mutedForeground }]}>{item.body}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </>
            ) : null}

             <AuthInput icon="mail" placeholder={t('البريد الإلكتروني', 'Email address')} value={email} onChangeText={setEmail} colors={colors} keyboardType="email-address" autoCapitalize="none" />
            <View style={styles.passwordWrap}>
               <AuthInput icon="lock" placeholder={t('كلمة المرور', 'Password')} value={password} onChangeText={setPassword} colors={colors} secureTextEntry={!showPassword} />
              <Pressable testID="toggle-password-visibility" onPress={() => setShowPassword((value) => !value)} style={styles.passwordToggle} hitSlop={8}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={17} color={colors.mutedForeground} />
              </Pressable>
            </View>

             {!isSignup ? (
               <View style={styles.authOptionsRow}>
                <Pressable testID="forgot-password-button" onPress={openForgotPassword} style={styles.forgotInlineButton}>
                  <Text style={[styles.forgotText, { color: colors.teal }]}>{t('نسيت كلمة المرور؟', 'Forgot your password?')}</Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable testID={isSignup ? 'signup-button' : 'login-button'} onPress={() => void startHostedAuth(authMode)} style={({ pressed }) => [styles.loginButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
               <Text style={[styles.loginButtonText, { color: colors.primaryForeground }]}>{authSubmitting ? t('جارٍ التحويل...', 'Working…') : isSignup ? t('إنشاء الحساب', 'Create account') : t('تسجيل الدخول', 'Sign in')}</Text>
              <Text style={[styles.loginArrow, { color: colors.tint }]}>←</Text>
            </Pressable>
            {authError ? <Text style={[styles.authError, { color: colors.destructive }]}>{authError}</Text> : null}
            <View style={styles.authTrustRow}>
              <Feather name="shield" size={13} color={colors.teal} />
               <Text style={[styles.authFootnote, { color: colors.mutedForeground }]}>{isSignup && signupRole === 'teacher' ? t('حساب المعلم يحتاج مراجعة الإدارة قبل التفعيل', 'Teacher accounts require admin review before activation') : t('بياناتك محمية ومصادقتك آمنة', 'Your data is protected and your sign-in is secure')}</Text>
            </View>
            <View style={styles.authLegalRow}>
               <Pressable testID="terms-link" onPress={() => router.push('/terms')}><Text style={[styles.authLegalText, { color: colors.teal }]}>{t('شروط الاستخدام', 'Terms of use')}</Text></Pressable>
              <Text style={[styles.authLegalSeparator, { color: colors.border }]}>·</Text>
               <Pressable testID="privacy-link" onPress={() => router.push('/privacy')}><Text style={[styles.authLegalText, { color: colors.teal }]}>{t('سياسة الخصوصية', 'Privacy policy')}</Text></Pressable>
            </View>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }
  if (!isPasswordRecovery && isAuthenticated && !profileLoading && (profileError || !profile)) {
    overlay = (
      <AccessStateScreen
        title={t("تعذر التحقق من الحساب", "We couldn't verify your account")}
        body={t("لم نتمكن من قراءة ملفك وصلاحياتك من المنصة. لا يمكن فتح التطبيق قبل اكتمال التحقق.", "We couldn't read your profile and permissions. The app stays locked until verification is complete.")}
        actionLabel={t("إعادة المحاولة", "Try again")}
        onAction={() => void retryProfile()}
        colors={colors}
      />
    );
  }
  if (!isPasswordRecovery && isAuthenticated && profile?.isBanned) {
    overlay = (
      <AccessStateScreen
        title={t("الحساب مقيّد", "Account restricted")}
        body={t("تم تقييد الوصول إلى هذا الحساب. تواصل مع الدعم لمراجعة الحالة.", "Access to this account is restricted. Contact support to review its status.")}
        actionLabel={t("تسجيل الخروج", "Sign out")}
        onAction={() => void logoutAjyal()}
        colors={colors}
      />
    );
  }
  if (!isPasswordRecovery && isAuthenticated && profile && !roleResolved) {
    overlay = (
      <AccessStateScreen
        title={t("تعذر تحديد صلاحيات الحساب", "Couldn't resolve account permissions")}
        body={t("لم تصل هوية الدور من منصة أجيال المعرفة. لن نفتح واجهة الطالب أو المعلم قبل اكتمال التحقق.", "The platform did not return a confirmed account role. The student or teacher area stays locked until verification completes.")}
        actionLabel={t("إعادة المحاولة", "Try again")}
        onAction={() => void retryProfile()}
        colors={colors}
      />
    );
  }
  if (!isPasswordRecovery && isAuthenticated && profile?.role === 'teacher' && profile.teacherApproved !== true) {
    overlay = (
      <AccessStateScreen
        title={profile.teacherApproved === false ? t("حساب المعلم قيد المراجعة", "Teacher account under review") : t("تعذر التحقق من اعتماد المعلم", "Couldn't verify teacher approval")}
        body={profile.teacherApproved === false
          ? t("سيظهر محتوى المعلم بعد اعتماد الملف من إدارة المنصة.", "Teacher features will appear after the platform approves your profile.")
          : t("لم تصل حالة اعتماد المعلم من المنصة. حاول مرة أخرى لاحقاً.", "Teacher approval status did not arrive. Try again later.")}
        actionLabel={profile.teacherApproved === false ? t("تسجيل الخروج", "Sign out") : t("إعادة المحاولة", "Try again")}
        onAction={() => void (profile.teacherApproved === false ? logoutAjyal() : retryProfile())}
        colors={colors}
      />
    );
  }
  if (!isPasswordRecovery && isAuthenticated && profile && profile.role !== 'student' && profile.role !== 'teacher') {
    overlay = (
      <AccessStateScreen
        title={t("نوع الحساب غير مدعوم في تطبيق الهاتف", "This account type is not supported on mobile")}
        body={`${t("الدور الحالي", "Current role")}: ${profile.roleLabel}. ${t("استخدم المنصة المناسبة لهذا الحساب.", "Use the appropriate platform for this account.")}`}
        actionLabel={t("تسجيل الخروج", "Sign out")}
        onAction={() => void logoutAjyal()}
        colors={colors}
      />
    );
  }
  return (
    <View style={styles.rootNavigator}>
      <Stack screenOptions={{ headerBackTitle: 'رجوع' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="find-teacher" options={{ headerShown: false }} />
        <Stack.Screen name="subscriptions" options={{ headerShown: false }} />
        <Stack.Screen name="subscription" options={{ headerShown: false }} />
        <Stack.Screen name="invoices" options={{ headerShown: false }} />
        <Stack.Screen name="smart-teacher" options={{ headerShown: false }} />
        <Stack.Screen name="homework-solver" options={{ headerShown: false }} />
        <Stack.Screen name="materials" options={{ headerShown: false }} />
        <Stack.Screen name="teacher-materials" options={{ headerShown: false }} />
        <Stack.Screen name="students" options={{ headerShown: false }} />
        <Stack.Screen name="wallet" options={{ headerShown: false }} />
        <Stack.Screen name="teacher-withdrawals" options={{ headerShown: false }} />
        <Stack.Screen name="call-wallet" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="support" options={{ headerShown: false }} />
        <Stack.Screen name="rating" options={{ headerShown: false }} />
        <Stack.Screen name="booking" options={{ headerShown: false }} />
        <Stack.Screen name="live-session" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="payment-success" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack>
      {overlay ? <View style={styles.overlay}>{overlay}</View> : null}
    </View>
  );
}

function AccessStateScreen({
  title,
  body,
  actionLabel,
  onAction,
  colors,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.accessScreen, { backgroundColor: colors.background }]}>
      <View style={[styles.accessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.accessIcon, { backgroundColor: colors.tealSoft }]}>
          <Feather name="shield" size={24} color={colors.teal} />
        </View>
        <Text style={[styles.accessTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.accessBody, { color: colors.mutedForeground }]}>{body}</Text>
        <Pressable testID="access-state-action" onPress={onAction} style={[styles.accessButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.accessButtonText, { color: colors.primaryForeground }]}>{actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AuthInput({
  icon,
  colors,
  ...props
}: TextInputProps & {
  icon: keyof typeof Feather.glyphMap;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={17} color={colors.mutedForeground} />
      <TextInput
        {...props}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, { color: colors.foreground }, props.style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rootNavigator: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 20 },
  authScreen: { flex: 1 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  accessScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  accessCard: { width: '100%', maxWidth: 390, borderRadius: 24, borderWidth: 1, padding: 24, alignItems: 'center' },
  accessIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  accessTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center', writingDirection: 'rtl' },
  accessBody: { fontSize: 13, lineHeight: 22, fontFamily: 'Inter_400Regular', textAlign: 'center', writingDirection: 'rtl', marginTop: 10 },
  accessButton: { width: '100%', borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 22 },
  accessButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  authScroll: { flex: 1, width: '100%', alignSelf: 'stretch' },
  authContent: { flexGrow: 1, width: '100%', alignSelf: 'stretch', alignItems: 'stretch', paddingBottom: 28 },
  authHero: { width: '100%', alignSelf: 'stretch', minHeight: 289, paddingHorizontal: 24, paddingTop: 34, paddingBottom: 28, overflow: 'hidden', position: 'relative' },
  authHeroTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11, zIndex: 2 },
  heroLogoFrame: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', padding: 5, shadowColor: '#0B2B54', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  heroLogo: { width: 48, height: 48, borderRadius: 15 },
  heroBrandCopy: { alignItems: 'flex-end' },
  heroBrandName: { fontSize: 16, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  heroBrandTagline: { fontSize: 10, fontFamily: 'Inter_400Regular', writingDirection: 'rtl', marginTop: 3 },
  heroCopy: { alignItems: 'flex-end', marginTop: 42, zIndex: 2 },
  heroKicker: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroKickerDot: { width: 7, height: 7, borderRadius: 4 },
  heroKickerText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  heroTitle: { width: '100%', fontSize: 31, lineHeight: 40, letterSpacing: -0.8, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl', marginTop: 10 },
  heroBody: { width: '100%', fontSize: 12, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 6 },
  authHeroOrb: { position: 'absolute', borderRadius: 999, opacity: 0.12 },
  authHeroOrbOne: { width: 240, height: 240, left: -86, top: -69 },
  authHeroOrbTwo: { width: 155, height: 155, right: -49, bottom: -63 },
  authSheet: { width: '100%', alignSelf: 'stretch', marginTop: -28, borderTopLeftRadius: 31, borderTopRightRadius: 31, paddingHorizontal: 23, paddingTop: 16, paddingBottom: 27, zIndex: 5, shadowColor: '#0B1C36', shadowOpacity: 0.13, shadowRadius: 22, shadowOffset: { width: 0, height: -7 }, elevation: 8 },
  sheetHandle: { width: 40, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 19 },
  authBrand: { width: 78, height: 78, borderRadius: 25, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 9, shadowColor: '#173E8C', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  authLogo: { width: 62, height: 62, borderRadius: 19 },
  brandName: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl', marginBottom: 24 },
  loadingLogo: { width: 63, height: 63, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginBottom: 25 },
  logoImage: { width: 43, height: 43, borderRadius: 13, opacity: 0.7 },
  authTitle: { fontSize: 23, letterSpacing: -0.4, fontFamily: 'Inter_700Bold', marginBottom: 5, textAlign: 'right', writingDirection: 'rtl' },
  authBody: { maxWidth: 310, fontSize: 11, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginBottom: 15 },
  authModeSwitch: { width: '100%', maxWidth: 340, borderRadius: 14, padding: 4, flexDirection: 'row-reverse', marginBottom: 13 },
  authMode: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  authModeText: { fontSize: 11, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  googleButton: { width: '100%', maxWidth: 340, minHeight: 49, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 15 },
  googleMark: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  googleMarkText: { color: '#4285F4', fontSize: 16, fontWeight: '700' },
  googleButtonText: { flex: 1, fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'center', writingDirection: 'rtl' },
  googleSpacer: { width: 25 },
  orRow: { width: '100%', maxWidth: 340, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  orLine: { flex: 1, height: 1 },
  orText: { fontSize: 9, fontFamily: 'Inter_400Regular', writingDirection: 'rtl' },
  inputWrap: { width: '100%', maxWidth: 340, minHeight: 49, borderRadius: 14, borderWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 13, marginBottom: 10 },
  input: { flex: 1, minHeight: 47, fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', paddingHorizontal: 9 },
  passwordWrap: { width: '100%', maxWidth: 340, position: 'relative' },
  passwordToggle: { position: 'absolute', left: 13, top: 15 },
  authOptionsRow: { width: '100%', maxWidth: 340, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: -2, marginBottom: 15 },
  forgotInlineButton: { alignItems: 'flex-start', paddingVertical: 4 },
  forgotText: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  rolePicker: { width: '100%', maxWidth: 340, marginBottom: 10 },
  roleLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textAlign: 'right', writingDirection: 'rtl', marginBottom: 8 },
  roleOptions: { flexDirection: 'row', gap: 9 },
  roleOption: { flex: 1, minHeight: 83, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', padding: 8 },
  roleEmoji: { fontSize: 18, marginBottom: 2 },
  roleTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  roleBody: { fontSize: 9, fontFamily: 'Inter_400Regular', writingDirection: 'rtl', marginTop: 2 },
  loginButton: { width: '100%', maxWidth: 340, minHeight: 51, borderRadius: 14, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11, marginTop: 1 },
  loginButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  loginArrow: { fontSize: 18, lineHeight: 17 },
  authTrustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 18 },
  authFootnote: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  authLegalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  authLegalText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  authLegalSeparator: { fontSize: 12 },
  authSkeleton: { width: 154, height: 13, borderRadius: 6 },
  authSkeletonSmall: { width: 105, marginTop: 10 },
  authErrorTitle: { width: '100%', maxWidth: 340, fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center', writingDirection: 'rtl', marginTop: 18 },
  authErrorText: { width: '100%', maxWidth: 340, fontSize: 12, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center', writingDirection: 'rtl', marginTop: 10 },
  authErrorActions: { width: '100%', maxWidth: 340, gap: 10, marginTop: 20 },
  authErrorButton: { minHeight: 46, borderRadius: 13, width: '100%', alignItems: 'center', justifyContent: 'center' },
  authErrorButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  pressed: { opacity: 0.72 },
  authError: { width: '100%', maxWidth: 340, fontSize: 10, lineHeight: 17, textAlign: 'right', writingDirection: 'rtl', marginTop: 10 },
});

function PreferencesStatusBar() {
  const { isDark } = useAppPreferences();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const [fontsReady, setFontsReady] = React.useState(false);

  useEffect(() => {
    let mounted = true;
    void appFontsReady.then(() => {
      if (mounted) setFontsReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync();
  }, [fontsReady]);

  useEffect(() => {
    void enforceAvailableUpdate();
  }, []);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <AppPreferencesProvider>
        <PreferencesStatusBar />
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <InternalCallProvider>
                <AjyalProvider>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <KeyboardProvider>
                      <RootLayoutNav />
                      <IncomingCallOverlay />
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </AjyalProvider>
              </InternalCallProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </AppPreferencesProvider>
    </SafeAreaProvider>
  );
}