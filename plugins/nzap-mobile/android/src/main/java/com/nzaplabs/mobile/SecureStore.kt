package com.nzaplabs.mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Secrets encrypted with an AES-256-GCM key that lives in the Android
 * Keystore (hardware-backed where the device has it) and can never be
 * exported. Only ciphertext reaches the app's private preferences, and the
 * entry's name is bound as associated data so values cannot be swapped.
 */
class SecureStore(context: Context) {
  private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Every entry that still decrypts; unreadable ones are removed. */
  @Synchronized
  fun loadAll(): Map<String, String> {
    val values = mutableMapOf<String, String>()
    val broken = mutableListOf<String>()
    for ((name, stored) in prefs.all) {
      val decrypted = (stored as? String)?.let { runCatching { decrypt(name, it) }.getOrNull() }
      if (decrypted != null) values[name] = decrypted else broken.add(name)
    }
    if (broken.isNotEmpty()) {
      prefs.edit().apply { broken.forEach { remove(it) } }.commit()
    }
    return values
  }

  @Synchronized
  fun set(name: String, value: String) {
    if (!prefs.edit().putString(name, encrypt(name, value)).commit()) {
      throw IllegalStateException("Could not save the secret")
    }
  }

  @Synchronized
  fun delete(name: String) {
    prefs.edit().remove(name).commit()
  }

  private fun encrypt(name: String, value: String): String {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
    val sealed = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    return Envelope.encode(cipher.iv, sealed)
  }

  private fun decrypt(name: String, stored: String): String {
    val (iv, sealed) = Envelope.decode(stored)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
    cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
    return String(cipher.doFinal(sealed), Charsets.UTF_8)
  }

  private fun key(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setRandomizedEncryptionRequired(true)
        .build()
    )
    return generator.generateKey()
  }

  companion object {
    private const val KEYSTORE = "AndroidKeyStore"
    private const val ALIAS = "nzap-secrets-v1"
    private const val PREFS = "nzap_secure"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128
  }
}

/**
 * The stored form of a sealed value: `v1:<iv hex>:<ciphertext+tag hex>`.
 * Hex rather than Base64 because java.util.Base64 needs API 26 and
 * android.util.Base64 is unavailable to JVM unit tests.
 */
object Envelope {
  private const val VERSION = "v1"

  fun encode(iv: ByteArray, sealed: ByteArray): String = "$VERSION:${iv.toHex()}:${sealed.toHex()}"

  fun decode(stored: String): Pair<ByteArray, ByteArray> {
    val parts = stored.split(':')
    require(parts.size == 3 && parts[0] == VERSION) { "Unknown secret format" }
    val iv = parts[1].fromHex()
    val sealed = parts[2].fromHex()
    require(iv.size in 12..16) { "Bad IV" }
    require(sealed.size >= 16) { "Truncated secret" }
    return iv to sealed
  }

  private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

  private fun String.fromHex(): ByteArray {
    require(length % 2 == 0 && all { it in '0'..'9' || it in 'a'..'f' }) { "Bad hex" }
    return ByteArray(length / 2) { index -> substring(index * 2, index * 2 + 2).toInt(16).toByte() }
  }
}
