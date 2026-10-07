package com.nzaplabs.mobile

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class SecretArgs {
  lateinit var key: String
  var value: String? = null
}

@InvokeArg
class UrlArgs {
  lateinit var url: String
}

@InvokeArg
class FileArgs {
  lateinit var path: String
  lateinit var name: String
  var mimeType: String? = null
}

@InvokeArg
class KeepAliveArgs {
  var active: Boolean = false
  var count: Int = 0
  var title: String? = null
  var text: String? = null
}

@InvokeArg
class BarsArgs {
  var dark: Boolean = false
}

/**
 * Native integration for the NZAP shell. Only the Rust side calls these
 * commands (the plugin grants the webview nothing), and every file path
 * comes from Rust, which only hands over files the app wrote itself.
 */
@TauriPlugin
class NzapMobilePlugin(private val activity: Activity) : Plugin(activity) {
  private val store by lazy { SecureStore(activity.applicationContext) }
  private var pendingSave: File? = null

  // ------------------------------------------------------------- secrets

  @Command
  fun secretsLoad(invoke: Invoke) {
    try {
      val values = JSObject()
      for ((key, value) in store.loadAll()) values.put(key, value)
      invoke.resolve(JSObject().put("values", values) as JSObject)
    } catch (error: Exception) {
      invoke.reject("Could not read the secure store: ${error.message}", error)
    }
  }

  @Command
  fun secretSet(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SecretArgs::class.java)
      store.set(args.key, args.value ?: "")
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject("Could not save to the secure store: ${error.message}", error)
    }
  }

  @Command
  fun secretDelete(invoke: Invoke) {
    try {
      store.delete(invoke.parseArgs(SecretArgs::class.java).key)
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject("Could not delete from the secure store: ${error.message}", error)
    }
  }

  // ---------------------------------------------------- sign-in browser

  /**
   * Google's consent page in a Custom Tab: a real browser (Google refuses
   * sign-in inside WebViews) that stays in the app's task, so the app keeps
   * running to receive the loopback redirect. Falls back to any browser.
   */
  @Command
  fun openAuthUrl(invoke: Invoke) {
    val uri = Uri.parse(invoke.parseArgs(UrlArgs::class.java).url)
    if (uri.scheme != "https" && uri.host !in setOf("127.0.0.1", "localhost")) {
      invoke.reject("Only https links can be opened.")
      return
    }
    activity.runOnUiThread {
      try {
        val colors = CustomTabColorSchemeParams.Builder().setToolbarColor(PAPER).build()
        CustomTabsIntent.Builder()
          .setShowTitle(true)
          .setDefaultColorSchemeParams(colors)
          .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
          .build()
          .launchUrl(activity, uri)
        invoke.resolve()
      } catch (_: ActivityNotFoundException) {
        try {
          activity.startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
          invoke.resolve()
        } catch (error: ActivityNotFoundException) {
          invoke.reject("No browser is installed.", error)
        }
      }
    }
  }

  // --------------------------------------------------------- files out

  /** "Save to…": the system document picker, then a copy of the file there. */
  @Command
  fun saveFile(invoke: Invoke) {
    val args = invoke.parseArgs(FileArgs::class.java)
    val file = File(args.path)
    if (!file.isFile) {
      invoke.reject("That file no longer exists.")
      return
    }
    pendingSave = file
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = args.mimeType ?: "application/octet-stream"
      putExtra(Intent.EXTRA_TITLE, args.name)
    }
    try {
      startActivityForResult(invoke, intent, "saveFileResult")
    } catch (error: ActivityNotFoundException) {
      pendingSave = null
      invoke.reject("This device has no document picker.", error)
    }
  }

  @ActivityCallback
  fun saveFileResult(invoke: Invoke, result: ActivityResult) {
    val source = pendingSave
    pendingSave = null
    val target = result.data?.data
    if (result.resultCode != Activity.RESULT_OK || target == null || source == null) {
      invoke.resolve(JSObject().put("saved", false) as JSObject)
      return
    }
    Thread {
      try {
        activity.contentResolver.openOutputStream(target, "wt").use { output ->
          requireNotNull(output) { "The chosen location cannot be written." }
          source.inputStream().use { input -> input.copyTo(output) }
        }
        invoke.resolve(JSObject().put("saved", true) as JSObject)
      } catch (error: Exception) {
        invoke.reject("Could not save the file: ${error.message}", error)
      }
    }.start()
  }

  /** The share sheet, through the app's FileProvider (read-only grant). */
  @Command
  fun shareFile(invoke: Invoke) {
    val args = invoke.parseArgs(FileArgs::class.java)
    val file = File(args.path)
    if (!file.isFile) {
      invoke.reject("That file no longer exists.")
      return
    }
    activity.runOnUiThread {
      try {
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
          type = args.mimeType ?: "application/octet-stream"
          putExtra(Intent.EXTRA_STREAM, uri)
          putExtra(Intent.EXTRA_TITLE, args.name)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(Intent.createChooser(send, args.name))
        invoke.resolve()
      } catch (error: Exception) {
        invoke.reject("Could not share the file: ${error.message}", error)
      }
    }
  }

  // ------------------------------------------------ background keep-alive

  @Command
  fun setKeepAlive(invoke: Invoke) {
    val args = invoke.parseArgs(KeepAliveArgs::class.java)
    val context = activity.applicationContext
    try {
      if (args.active && args.count > 0) {
        requestNotificationPermission()
        val intent = Intent(context, KeepAliveService::class.java)
          .putExtra(KeepAliveService.EXTRA_TITLE, args.title ?: "NZAP")
          .putExtra(KeepAliveService.EXTRA_TEXT, args.text ?: "Keeping runtimes alive")
        ContextCompat.startForegroundService(context, intent)
      } else {
        context.stopService(Intent(context, KeepAliveService::class.java))
      }
      invoke.resolve()
    } catch (error: Exception) {
      // Android 12+ refuses to start foreground services from the background;
      // the next change while the app is open starts it.
      invoke.reject("Background keep-alive is unavailable: ${error.message}", error)
    }
  }

  /** Android 13+: the keep-alive notification needs the user's permission. */
  private fun requestNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val permission = Manifest.permission.POST_NOTIFICATIONS
    if (ContextCompat.checkSelfPermission(activity, permission) != PackageManager.PERMISSION_GRANTED) {
      activity.runOnUiThread { ActivityCompat.requestPermissions(activity, arrayOf(permission), 7202) }
    }
  }

  // ---------------------------------------------------------- system bars

  /** Status and navigation bar icons that stay readable on the app theme. */
  @Command
  fun setSystemBars(invoke: Invoke) {
    val dark = invoke.parseArgs(BarsArgs::class.java).dark
    activity.runOnUiThread {
      val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
      controller.isAppearanceLightStatusBars = !dark
      controller.isAppearanceLightNavigationBars = !dark
      invoke.resolve()
    }
  }

  /** The back button on the last page: background the app, never finish it. */
  @Command
  fun moveToBackground(invoke: Invoke) {
    activity.runOnUiThread {
      activity.moveTaskToBack(true)
      invoke.resolve()
    }
  }

  companion object {
    /** NZAP's paper colour for the Custom Tab toolbar. */
    private const val PAPER = 0xFFF6F6F3.toInt()
  }
}
