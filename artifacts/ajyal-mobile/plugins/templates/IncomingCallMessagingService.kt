package com.ajyalalmaerifa.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.KeyguardManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class IncomingCallMessagingService : ExpoFirebaseMessagingService() {
  companion object {
    private const val CHANNEL_ID = "incoming-call-native-v3"
    private const val NOTIFICATION_BASE_ID = 7300
    private const val TAG = "IncomingCallService"
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    when (data["type"]) {
      "incoming_call" -> if (!isAppInForeground()) showIncomingCall(data)
      "call_ended", "call_accepted" -> closeIncomingCall(data["callId"].orEmpty())
    }
    super.onMessageReceived(message)
  }

  private fun isAppInForeground(): Boolean {
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (!powerManager.isInteractive || keyguardManager.isKeyguardLocked) return false

    val manager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
    return manager.runningAppProcesses?.any { process ->
      process.processName == applicationContext.getPackageName()
        && process.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    } == true
  }

  private fun showIncomingCall(data: Map<String, String>) {
    val callId = data["callId"].orEmpty()
    if (callId.isBlank()) return
    val notificationManager = getSystemService(NotificationManager::class.java)
    ensureChannel(notificationManager)
    val activityIntent = Intent(this, IncomingCallActivity::class.java).apply {
      putExtra("callId", callId)
      putExtra("callerId", data["callerId"].orEmpty())
      putExtra("callerName", data["callerName"] ?: "مستخدم")
      putExtra("callerRole", data["callerRole"].orEmpty())
      putExtra("roomId", data["roomId"].orEmpty())
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      callId.hashCode(),
      activityIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_call)
      .setContentTitle("مكالمة واردة")
      .setContentText("${data["callerName"] ?: "مستخدم"} يتصل بك الآن")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setAutoCancel(false)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(pendingIntent)
      .setFullScreenIntent(pendingIntent, true)

    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
      && !notificationManager.canUseFullScreenIntent()
    ) {
      Log.w(TAG, "Full-screen intent access is disabled; showing a settings action on the call notification")
      val settingsIntent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
        setData(Uri.parse("package:${applicationContext.packageName}"))
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val settingsPendingIntent = PendingIntent.getActivity(
        this,
        callId.hashCode() + 1,
        settingsIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      builder.addAction(
        android.R.drawable.ic_menu_manage,
        "السماح بواجهة المكالمة الكاملة",
        settingsPendingIntent,
      )
    }

    notificationManager.notify(notificationId(callId), builder.build())
  }

  private fun closeIncomingCall(callId: String) {
    if (callId.isBlank()) return
    getSystemService(NotificationManager::class.java).cancel(notificationId(callId))
    sendBroadcast(Intent(IncomingCallActivity.ACTION_CLOSE).setPackage(applicationContext.getPackageName()).putExtra("callId", callId))
  }

  private fun notificationId(callId: String): Int =
    NOTIFICATION_BASE_ID + (callId.hashCode() and 0x7fff)

  private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val sound = Uri.parse("android.resource://${applicationContext.getPackageName()}/${R.raw.incoming_call}")
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "المكالمات الواردة", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "مكالمات أجيال المعرفة عند إغلاق التطبيق"
        setSound(sound, attributes)
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 500, 250, 500)
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      },
    )
  }
}