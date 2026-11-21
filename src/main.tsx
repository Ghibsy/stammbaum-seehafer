import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './index.css';
import { requestPersistence } from './state/db';
import { loadLocal, setSyncHook } from './state/store';
import { initAuth } from './sync/auth';
import { initSync, scheduleSync } from './sync/engine';

registerSW({ immediate: true });

async function start() {
  await loadLocal();
  void requestPersistence();
  setSyncHook(() => scheduleSync());
  await initAuth().catch((e) => console.warn(e));
  await initSync();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
void start();
