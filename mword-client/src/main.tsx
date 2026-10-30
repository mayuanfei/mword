import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { Capacitor } from '@capacitor/core';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
}
