package com.lxmusic.legacy;
import static org.junit.Assert.*;
import org.junit.Test;
public class AudioSignatureTest {
  @Test public void mp3Frame() {
    assertTrue(AudioSignature.looksLikeAudio(new byte[]{(byte)0xff,(byte)0xfb,0,0,0,0,0,0,0,0,0,0}));
  }
  @Test public void mp3Id3() {
    assertTrue(AudioSignature.looksLikeAudio(new byte[]{'I','D','3',4,0,0,0,0,0,0,0,0}));
  }
  @Test public void wav() {
    assertTrue(AudioSignature.looksLikeAudio(new byte[]{'R','I','F','F',1,2,3,4,'W','A','V','E'}));
  }
  @Test public void rejectsErrorBodies() {
    assertFalse(AudioSignature.looksLikeAudio("<!doctype html>".getBytes()));
    assertFalse(AudioSignature.looksLikeAudio("{\"error\":true}".getBytes()));
    assertFalse(AudioSignature.looksLikeAudio(new byte[3]));
  }
}
