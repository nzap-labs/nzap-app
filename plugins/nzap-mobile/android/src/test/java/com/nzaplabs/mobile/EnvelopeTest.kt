package com.nzaplabs.mobile

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class EnvelopeTest {
  private val iv = ByteArray(12) { it.toByte() }
  private val sealed = ByteArray(40) { (255 - it).toByte() }

  @Test
  fun roundTrips() {
    val stored = Envelope.encode(iv, sealed)
    assertEquals("v1:000102030405060708090a0b:", stored.substring(0, 28))
    val (decodedIv, decodedSealed) = Envelope.decode(stored)
    assertArrayEquals(iv, decodedIv)
    assertArrayEquals(sealed, decodedSealed)
  }

  @Test
  fun rejectsForeignOrDamagedValues() {
    val good = Envelope.encode(iv, sealed)
    for (bad in listOf(
      "plain-text-token",
      good.replaceFirst("v1", "v2"),
      good.dropLast(1),
      good.uppercase(),
      "v1:00:${"ab".repeat(20)}",
      "v1:000102030405060708090a0b:abcd",
    )) {
      assertThrows(IllegalArgumentException::class.java) { Envelope.decode(bad) }
    }
  }
}
