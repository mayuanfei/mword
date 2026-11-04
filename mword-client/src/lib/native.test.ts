// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { speakWord, stopSpeaking } from './native';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) }
}));

vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: {
    speak: vi.fn(),
    stop: vi.fn()
  }
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    cancel: vi.fn(),
    schedule: vi.fn(),
    requestPermissions: vi.fn(),
    checkPermissions: vi.fn()
  }
}));

describe('speakWord fallback behavior on Huawei / Android devices', () => {
  const originalAudio = globalThis.Audio;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
  });

  it('uses native TextToSpeech when available', async () => {
    vi.mocked(TextToSpeech.speak).mockResolvedValueOnce(undefined);
    await speakWord('absence');
    expect(TextToSpeech.speak).toHaveBeenCalledWith({ text: 'absence', lang: 'en-US', rate: 0.8 });
  });

  it('falls back to dictionary audio when native TextToSpeech throws Not yet initialized', async () => {
    vi.mocked(TextToSpeech.speak).mockRejectedValueOnce(new Error('Not yet initialized or not available on this device.'));
    const playMock = vi.fn().mockResolvedValue(undefined);
    const pauseMock = vi.fn();
    let requestedUrl = '';

    class MockAudio {
      src: string;
      onerror: (() => void) | null = null;
      onended: (() => void) | null = null;
      constructor(url: string) {
        this.src = url;
        requestedUrl = url;
      }
      play = playMock;
      pause = pauseMock;
      removeAttribute = vi.fn();
    }

    globalThis.Audio = MockAudio as unknown as typeof Audio;

    await speakWord('absence');
    expect(TextToSpeech.speak).toHaveBeenCalledTimes(1);
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(requestedUrl).toContain('dict.youdao.com/dictvoice?audio=absence&type=2');

    vi.mocked(TextToSpeech.stop).mockRejectedValueOnce(new Error('Not yet initialized'));
    await expect(stopSpeaking()).resolves.toBeUndefined();
    expect(pauseMock).toHaveBeenCalledTimes(1);
  });

  it('throws friendly Chinese error when native TTS, dictionary audio, and Web Speech all fail', async () => {
    vi.mocked(TextToSpeech.speak).mockRejectedValueOnce(new Error('Not yet initialized or not available on this device.'));

    class FailingAudio {
      onerror: (() => void) | null = null;
      onended: (() => void) | null = null;
      play = vi.fn().mockRejectedValue(new Error('Network error'));
      pause = vi.fn();
      removeAttribute = vi.fn();
    }

    globalThis.Audio = FailingAudio as unknown as typeof Audio;

    await expect(speakWord('absence')).rejects.toThrow('当前设备未开启系统语音服务');
  });
});
