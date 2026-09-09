import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, type ColorSchemeName } from 'react-native';

export type AppLanguage = 'ar' | 'en';
export type ThemeMode = 'system' | 'light' | 'dark';

type AppPreferencesValue = {
  language: AppLanguage;
  themeMode: ThemeMode;
  isRTL: boolean;
  direction: 'rtl' | 'ltr';
  locale: 'ar-SA' | 'en-US';
  isDark: boolean;
  setLanguage: (language: AppLanguage) => Promise<void>;
  setThemeMode: (themeMode: ThemeMode) => Promise<void>;
  t: (arabic: string, english: string) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
};

const LANGUAGE_KEY = 'ajyal.preferences.language';
const THEME_KEY = 'ajyal.preferences.theme';

const AppPreferencesContext = createContext<AppPreferencesValue | null>(null);

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('ar');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>('light');

  useEffect(() => {
    let mounted = true;
    void Promise.all([AsyncStorage.getItem(LANGUAGE_KEY), AsyncStorage.getItem(THEME_KEY)]).then(([storedLanguage, storedTheme]) => {
      if (!mounted) return;
      if (storedLanguage === 'ar' || storedLanguage === 'en') setLanguageState(storedLanguage);
      if (storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark') setThemeModeState(storedTheme);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setSystemScheme(Appearance.getColorScheme() ?? 'light');
    const subscription = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme));
    return () => subscription.remove();
  }, []);

  const setLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    await AsyncStorage.setItem(LANGUAGE_KEY, nextLanguage);
  }, []);

  const setThemeMode = useCallback(async (nextThemeMode: ThemeMode) => {
    setThemeModeState(nextThemeMode);
    await AsyncStorage.setItem(THEME_KEY, nextThemeMode);
  }, []);

  const value = useMemo<AppPreferencesValue>(() => ({
    language,
    themeMode,
    isRTL: language === 'ar',
    direction: language === 'ar' ? 'rtl' : 'ltr',
    locale: language === 'ar' ? 'ar-SA' : 'en-US',
    isDark: themeMode === 'dark' || (themeMode === 'system' && systemScheme === 'dark'),
    setLanguage,
    setThemeMode,
    t: (arabic, english) => language === 'ar' ? arabic : english,
    formatNumber: (value, options) => new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US', options).format(value),
    formatDate: (value, options) => new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', options).format(new Date(value)),
  }), [language, setLanguage, setThemeMode, systemScheme, themeMode]);

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences(): AppPreferencesValue {
  const context = useContext(AppPreferencesContext);
  if (!context) throw new Error('useAppPreferences must be used inside AppPreferencesProvider');
  return context;
}

export function useAppPreferencesOptional(): AppPreferencesValue {
  const context = useContext(AppPreferencesContext);
  return context ?? {
    language: 'ar',
    themeMode: 'system',
    isRTL: true,
    direction: 'rtl',
    locale: 'ar-SA',
    isDark: false,
    setLanguage: async () => undefined,
    setThemeMode: async () => undefined,
    t: (arabic: string) => arabic,
    formatNumber: (value: number) => new Intl.NumberFormat('ar-SA').format(value),
    formatDate: (value: Date | string | number) => new Intl.DateTimeFormat('ar-SA').format(new Date(value)),
  };
}