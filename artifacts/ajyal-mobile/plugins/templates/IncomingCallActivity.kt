package com.ajyalalmaerifa.app

import android.app.Activity
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.Window
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class IncomingCallActivity : Activity() {
  companion object {
    const val ACTION_ACCEPT = "com.ajyalalmaerifa.app.CALL_ACCEPT"
    const val ACTION_DECLINE = "com.ajyalalmaerifa.app.CALL_DECLINE"
    const val ACTION_CLOSE = "com.ajyalalmaerifa.app.CALL_CLOSE"
    private const val NOTIFICATION_BASE_ID = 7300
    private const val DEEP_LINK_ACTION = "call-action"

    fun show(context: android.content.Context, data: Map<String, String>) {
      val intent = Intent(context, IncomingCallActivity::class.java).apply {
        putExtra("callId", data["callId"].orEmpty())
        putExtra("callerId", data["callerId"].orEmpty())
        putExtra("callerName", data["callerName"] ?: "مستخدم")
        putExtra("callerRole", data["callerRole"].orEmpty())
        putExtra("roomId", data["roomId"].orEmpty())
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      context.startActivity(intent)
    }
  }

  private var callId: String = ""
  private val timeoutHandler = Handler(Looper.getMainLooper())
  private val timeoutRunnable = Runnable { closeWithoutAction() }
  private val closeReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.getStringExtra("callId").orEmpty() == callId) {
        finishAndRemoveTask()
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    prepareWindow()
    callId = intent.getStringExtra("callId").orEmpty()
    registerCloseReceiver()
    timeoutHandler.postDelayed(timeoutRunnable, 60_000)
    render()
  }

  override fun onDestroy() {
    timeoutHandler.removeCallbacks(timeoutRunnable)
    unregisterReceiver(closeReceiver)
    super.onDestroy()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    callId = intent.getStringExtra("callId").orEmpty()
    render()
  }

  private fun prepareWindow() {
    requestWindowFeature(Window.FEATURE_NO_TITLE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
          or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun render() {
    val callerName = intent.getStringExtra("callerName").orEmpty().ifBlank { "مستخدم" }
    val callerRole = intent.getStringExtra("callerRole").orEmpty().ifBlank { "اتصال داخلي" }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(40, 56, 40, 40)
      setBackgroundColor(Color.rgb(10, 37, 64))
    }
    val eyebrow = TextView(this).apply {
      text = "أجيال المعرفة"
      textSize = 16f
      setTextColor(Color.rgb(140, 221, 205))
      gravity = Gravity.CENTER
    }
    val title = TextView(this).apply {
      text = "مكالمة واردة"
      textSize = 31f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      setPadding(0, 24, 0, 12)
    }
    val caller = TextView(this).apply {
      text = callerName
      textSize = 28f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
    }
    val role = TextView(this).apply {
      text = callerRole
      textSize = 16f
      setTextColor(Color.rgb(210, 220, 230))
      gravity = Gravity.CENTER
      setPadding(0, 8, 0, 48)
    }
    val actions = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    val decline = actionButton("رفض", Color.rgb(190, 65, 70))
    val accept = actionButton("قبول", Color.rgb(46, 158, 121))
    decline.setOnClickListener { finishCall(ACTION_DECLINE) }
    accept.setOnClickListener { finishCall(ACTION_ACCEPT) }
    actions.addView(decline, LinearLayout.LayoutParams(0, 60, 1f).apply { marginEnd = 16 })
    actions.addView(accept, LinearLayout.LayoutParams(0, 60, 1f))
    root.addView(eyebrow)
    root.addView(title)
    root.addView(caller)
    root.addView(role)
    root.addView(actions, LinearLayout.LayoutParams(-1, -2))
    setContentView(root)
  }

  private fun registerCloseReceiver() {
    val filter = IntentFilter(ACTION_CLOSE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(closeReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      registerReceiver(closeReceiver, filter)
    }
  }

  private fun actionButton(label: String, color: Int): Button {
    return Button(this).apply {
      text = label
      textSize = 17f
      setTextColor(Color.WHITE)
      background = GradientDrawable().apply {
        setColor(color)
        cornerRadius = 24f
      }
      isAllCaps = false
    }
  }

  private fun finishCall(action: String) {
    timeoutHandler.removeCallbacks(timeoutRunnable)
    getSystemService(NotificationManager::class.java).cancel(notificationId(callId))
    sendBroadcast(Intent(ACTION_CLOSE).setPackage(packageName).putExtra("callId", callId))
    val uri = Uri.Builder()
      .scheme("ajyalalmaerifa")
      .authority(DEEP_LINK_ACTION)
      .appendQueryParameter("action", if (action == ACTION_ACCEPT) "accept" else "decline")
      .appendQueryParameter("callId", callId)
      .build()
    startActivity(Intent(Intent.ACTION_VIEW, uri, this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    })
    finishAndRemoveTask()
  }

  private fun closeWithoutAction() {
    getSystemService(NotificationManager::class.java).cancel(notificationId(callId))
    finishAndRemoveTask()
  }

  private fun notificationId(callId: String): Int =
    NOTIFICATION_BASE_ID + (callId.hashCode() and 0x7fff)
}