import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { LocalNotifications } from '@capacitor/local-notifications';

export async function speakWord(text: string) {
  if (Capacitor.isNativePlatform()) {
    await TextToSpeech.speak({ text, lang: 'en-US', rate: 0.8 }); return;
  }
  if (!('speechSynthesis' in window)) throw new Error('当前浏览器不支持朗读，请使用手机应用。');
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = 0.8;
  speechSynthesis.speak(utterance);
}
export async function stopSpeaking() {
  if (Capacitor.isNativePlatform()) await TextToSpeech.stop();
  else if ('speechSynthesis' in window) speechSynthesis.cancel();
}
export async function enableReviewReminder(dueAt?: string) {
  if (!Capacitor.isNativePlatform()) throw new Error('复习通知请在 Android 或 iOS 应用中开启。');
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') throw new Error('通知权限尚未开启，可在手机系统设置中允许。');
  const at = dueAt ? new Date(dueAt) : new Date();
  if (!dueAt) { at.setDate(at.getDate() + 1); at.setHours(20, 0, 0, 0); }
  if (at.getTime() < Date.now() + 60_000) at.setTime(Date.now() + 60_000);
  await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
  await LocalNotifications.schedule({ notifications: [{ id: 1, title: 'mword · 该复习了', body: '关掉解释，试着把学过的词想起来。', schedule: { at } }] });
}
