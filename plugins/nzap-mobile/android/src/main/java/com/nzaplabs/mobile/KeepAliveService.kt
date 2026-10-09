package com.nzaplabs.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Keeps the app process — and with it the engine's keep-alive pings to
 * Colab — running while the app is in the background and runtimes are kept
 * alive. It does no work itself; the Rust engine does. The ongoing
 * notification says how many runtimes are being kept alive and opens the app.
 */
class KeepAliveService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "NZAP"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Keeping runtimes alive"
    ensureChannel(this)
    val type =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(title, text), type)
    // If the system kills the process, the engine is gone too: do not restart
    // an empty service. The app resumes its runtimes when opened.
    return START_NOT_STICKY
  }

  /** Android 15 caps dataSync services at 6 hours a day. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }

  private fun notification(title: String, text: String): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val open = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_nzap)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(open)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  companion object {
    const val ACTION_STOP = "com.nzaplabs.mobile.KEEP_ALIVE_STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    private const val CHANNEL_ID = "keep-alive"
    private const val NOTIFICATION_ID = 7201

    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java)
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(CHANNEL_ID, "Runtimes kept alive", NotificationManager.IMPORTANCE_LOW)
        channel.description = "Shown while NZAP keeps your Colab runtimes alive in the background."
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)
      }
    }
  }
}
