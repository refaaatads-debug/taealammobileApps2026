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
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.view.View
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.graphics.PathParser

class IncomingCallActivity : Activity() {
  companion object {
    const val ACTION_ACCEPT = "com.ajyalalmaerifa.app.CALL_ACCEPT"
    const val ACTION_DECLINE = "com.ajyalalmaerifa.app.CALL_DECLINE"
    const val ACTION_CLOSE = "com.ajyalalmaerifa.app.CALL_CLOSE"
    private const val NOTIFICATION_BASE_ID = 7300
    private const val DEEP_LINK_ACTION = "call-action"
    private const val PHONE_PATH = "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
    private const val PHONE_OFF_PATH = "M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"

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
    pulseAnimators.forEach { it.cancel() }
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

  private val pulseAnimators = mutableListOf<ValueAnimator>()

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  // Feather-style line icon (24x24 grid), drawn from SVG path data.
  private inner class LineIconView(
    context: Context,
    private val paths: List<String>,
    private val color: Int,
  ) : View(context) {
    private val parsed: List<Path> = paths.mapNotNull { PathParser.createPathFromPathData(it) }
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
      color = this@LineIconView.color
    }
    override fun onDraw(canvas: Canvas) {
      val scale = minOf(width, height) / 24f
      canvas.save()
      canvas.scale(scale, scale)
      paint.strokeWidth = 2f
      parsed.forEach { canvas.drawPath(it, paint) }
      canvas.restore()
    }
  }

  private fun roundBackground(color: Int, radiusDp: Int, strokeColor: Int? = null): GradientDrawable =
    GradientDrawable().apply {
      setColor(color)
      cornerRadius = dp(radiusDp).toFloat()
      if (strokeColor != null) setStroke(dp(2), strokeColor)
    }

  private fun pulseRing(sizeDp: Int, alphaTarget: Float, delayMs: Long): View {
    val ring = View(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.rgb(46, 158, 121))
      }
      alpha = 0f
    }
    val animator = ObjectAnimator.ofPropertyValuesHolder(
      ring,
      PropertyValuesHolder.ofFloat(View.SCALE_X, 0.7f, 1.35f),
      PropertyValuesHolder.ofFloat(View.SCALE_Y, 0.7f, 1.35f),
      PropertyValuesHolder.ofFloat(View.ALPHA, alphaTarget, 0f),
    ).apply {
      duration = 2000
      startDelay = delayMs
      repeatCount = ValueAnimator.INFINITE
      interpolator = LinearInterpolator()
      start()
    }
    pulseAnimators.add(animator)
    return ring
  }

  private fun render() {
    pulseAnimators.forEach { it.cancel() }
    pulseAnimators.clear()
    val callerName = intent.getStringExtra("callerName").orEmpty().ifBlank { "مستخدم" }
    val callerRole = intent.getStringExtra("callerRole").orEmpty().ifBlank { "اتصال داخلي" }
    val green = Color.rgb(46, 158, 121)
    val ink = Color.rgb(21, 28, 40)
    val muted = Color.rgb(101, 116, 135)
    val red = Color.rgb(192, 57, 43)
    val redBorder = Color.rgb(212, 91, 82)

    val root = FrameLayout(this).apply {
      layoutDirection = View.LAYOUT_DIRECTION_RTL
      background = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(Color.rgb(227, 245, 236), Color.WHITE, Color.WHITE),
      )
    }

    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    val brand = TextView(this).apply {
      text = "أجيال المعرفة"
      textSize = 15f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      setTextColor(green)
      gravity = Gravity.CENTER
    }
    column.addView(brand, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(52) })

    val iconBox = FrameLayout(this)
    iconBox.addView(pulseRing(150, 0.16f, 0), FrameLayout.LayoutParams(dp(150), dp(150), Gravity.CENTER))
    iconBox.addView(pulseRing(150, 0.2f, 1000), FrameLayout.LayoutParams(dp(150), dp(150), Gravity.CENTER))
    val iconCard = FrameLayout(this).apply {
      background = roundBackground(Color.rgb(236, 248, 243), 36)
      elevation = dp(6).toFloat()
    }
    iconCard.addView(
      LineIconView(this, listOf(PHONE_PATH, "M16 2 L16 8 L22 8", "M23 1 L16 8"), green),
      FrameLayout.LayoutParams(dp(50), dp(50), Gravity.CENTER),
    )
    iconBox.addView(iconCard, FrameLayout.LayoutParams(dp(108), dp(108), Gravity.CENTER))
    column.addView(iconBox, LinearLayout.LayoutParams(dp(210), dp(210)).apply { topMargin = dp(36) })

    val title = TextView(this).apply {
      text = "مكالمة واردة"
      textSize = 30f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      setTextColor(ink)
      gravity = Gravity.CENTER
    }
    column.addView(title, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(24) })
    val subtitle = TextView(this).apply {
      text = "لديك مكالمة واردة الآن"
      textSize = 14f
      setTextColor(muted)
      gravity = Gravity.CENTER
    }
    column.addView(subtitle, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6) })
    val caller = TextView(this).apply {
      text = callerName
      textSize = 26f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      setTextColor(ink)
      gravity = Gravity.CENTER
      maxLines = 2
    }
    column.addView(caller, LinearLayout.LayoutParams(-1, -2).apply {
      topMargin = dp(34)
      marginStart = dp(24)
      marginEnd = dp(24)
    })
    val role = TextView(this).apply {
      text = callerRole
      textSize = 14f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      setTextColor(Color.rgb(23, 62, 140))
      gravity = Gravity.CENTER
      setPadding(dp(16), dp(4), dp(16), dp(4))
      background = roundBackground(Color.rgb(241, 245, 251), 20)
    }
    column.addView(role, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(10) })
    root.addView(column, FrameLayout.LayoutParams(-1, -1))

    val actions = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      layoutDirection = View.LAYOUT_DIRECTION_RTL
      gravity = Gravity.CENTER
    }
    val accept = actionButton(
      "قبول المكالمة", Color.WHITE, roundBackground(green, 20), listOf(PHONE_PATH),
    )
    val decline = actionButton(
      "رفض المكالمة", red, roundBackground(Color.WHITE, 20, redBorder), listOf(PHONE_OFF_PATH, "M23 1 L1 23"),
    )
    accept.elevation = dp(6).toFloat()
    decline.setOnClickListener { finishCall(ACTION_DECLINE) }
    accept.setOnClickListener { finishCall(ACTION_ACCEPT) }
    actions.addView(accept, LinearLayout.LayoutParams(0, dp(60), 1f).apply { marginStart = dp(7); marginEnd = dp(7) })
    actions.addView(decline, LinearLayout.LayoutParams(0, dp(60), 1f).apply { marginStart = dp(7); marginEnd = dp(7) })
    root.addView(
      actions,
      FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply {
        marginStart = dp(17); marginEnd = dp(17); bottomMargin = dp(56)
      },
    )
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

  private fun actionButton(label: String, textColor: Int, bg: GradientDrawable, iconPaths: List<String>): LinearLayout {
    return LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      background = bg
      isClickable = true
      isFocusable = true
      contentDescription = label
      addView(
        LineIconView(context, iconPaths, textColor),
        LinearLayout.LayoutParams(dp(22), dp(22)).apply { marginEnd = dp(10) },
      )
      addView(TextView(context).apply {
        text = label
        textSize = 16f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        setTextColor(textColor)
      })
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