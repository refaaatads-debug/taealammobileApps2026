import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export async function enforceAvailableUpdate(): Promise<void> {
  const policy = Constants.expoConfig?.extra?.updatePolicy;
  if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled || !policy?.mandatory) return;

  try {
    const update = await Updates.checkForUpdateAsync();
    if (!update.isAvailable) return;

    Alert.alert(
      'تحديث إلزامي',
      'يتوفر إصدار جديد من أجيال المعرفة. حدّث التطبيق الآن لمتابعة استخدام الجلسات والتنبيهات.',
      [
        {
          text: 'تحديث الآن',
          onPress: () => {
            void applyAvailableUpdate();
          },
        },
      ],
      { cancelable: false },
    );
  } catch {
    // Update checks are best-effort when the app is offline or running
    // without a configured update service. The cached app remains usable.
  }
}

async function applyAvailableUpdate(): Promise<void> {
  try {
    const result = await Updates.fetchUpdateAsync();
    if (result.isNew) {
      await Updates.reloadAsync();
    }
  } catch {
    Alert.alert(
      'تعذر التحديث',
      'تحقق من اتصال الإنترنت ثم أعد فتح التطبيق لتثبيت الإصدار الجديد.',
      [{ text: 'حسناً' }],
    );
  }
}