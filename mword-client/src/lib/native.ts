import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { LocalNotifications } from '@capacitor/local-notifications';
import { readLocal, writeLocal } from './storage';

let activeAudio: HTMLAudioElement | null = null;

function stopDictionaryAudio() {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.removeAttribute('src');
  activeAudio = null;
}

function playAudioUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof Audio === 'undefined') {
      reject(new Error('Audio unavailable'));
      return;
    }
    stopDictionaryAudio();
    const audio = new Audio(url);
    activeAudio = audio;
    audio.onerror = () => {
      if (activeAudio === audio) activeAudio = null;
      reject(new Error('Audio load failed'));
    };
    audio.onended = () => {
      if (activeAudio === audio) activeAudio = null;
    };
    audio.play().then(resolve).catch(err => {
      if (activeAudio === audio) activeAudio = null;
      reject(err);
    });
  });
}

async function playDictionaryAudio(text: string) {
  const encoded = encodeURIComponent(text.trim());
  const urls = [
    `https://dict.youdao.com/dictvoice?audio=${encoded}&type=2`,
    `https://fanyi.baidu.com/gettts?lan=en&text=${encoded}&spd=3&source=web`
  ];
  for (const url of urls) {
    try {
      await playAudioUrl(url);
      return;
    } catch {
      // 当前音频源不可用时继续尝试下一个备用源
    }
  }
  throw new Error('Dictionary audio unavailable');
}

function speakWithWebSpeech(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return false;
  }
  try {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.8;
    speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export async function speakWord(text: string) {
  const cleanText = text.trim();
  if (!cleanText) return;
  if (Capacitor.isNativePlatform()) {
    try {
      stopDictionaryAudio();
      await TextToSpeech.speak({ text: cleanText, lang: 'en-US', rate: 0.8 });
      return;
    } catch {
      // 原生 TTS 在部分华为或精简系统上不可用，自动降级为在线词典发音
    }
    try {
      await playDictionaryAudio(cleanText);
      return;
    } catch {
      if (speakWithWebSpeech(cleanText)) return;
      throw new Error('当前设备未开启系统语音服务，请联网播放标准发音，或在系统“设置 → 无障碍 → 文字转语音”中启用语音引擎。');
    }
  }
  if (speakWithWebSpeech(cleanText)) return;
  try {
    await playDictionaryAudio(cleanText);
  } catch {
    throw new Error('当前浏览器不支持语音朗读，请检查网络连接后重试。');
  }
}

export async function stopSpeaking() {
  stopDictionaryAudio();
  if (Capacitor.isNativePlatform()) {
    await TextToSpeech.stop().catch(() => {});
    return;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
}
async function scheduleReminder(dueAt?: string) {
  const at = dueAt ? new Date(dueAt) : new Date();
  if (!dueAt) { at.setDate(at.getDate() + 1); at.setHours(20, 0, 0, 0); }
  if (at.getTime() < Date.now() + 60_000) at.setTime(Date.now() + 60_000);
  await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
  await LocalNotifications.schedule({ notifications: [{ id: 1, title: 'mword · 该复习了', body: '关掉解释，试着把学过的词想起来。', schedule: { at } }] });
}
export async function enableReviewReminder(dueAt?: string) {
  if (!Capacitor.isNativePlatform()) throw new Error('复习通知请在 Android 或 iOS 应用中开启。');
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') throw new Error('通知权限尚未开启，可在手机系统设置中允许。');
  await writeLocal('reviewReminderEnabled', true);
  await scheduleReminder(dueAt);
}
export async function syncReviewReminder(dueAt?: string) {
  if (!Capacitor.isNativePlatform() || !(await readLocal<boolean>('reviewReminderEnabled'))) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;
  await scheduleReminder(dueAt);
}
