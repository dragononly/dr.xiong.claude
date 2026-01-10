import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

// 🚀 性能优化：关键 CSS 同步加载
import '@vscode/codicons/dist/codicon.css';

// 🚀 性能优化：非关键资源延迟加载
const loadNonCriticalResources = () => {
  import('@mdi/font/css/materialdesignicons.min.css');
  import('virtual:svg-icons-register');
};

// 使用 requestIdleCallback 在空闲时加载，不支持则用 setTimeout
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(loadNonCriticalResources);
} else {
  setTimeout(loadNonCriticalResources, 100);
}

declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => {
      postMessage(data: T): void;
      getState(): any;
      setState(data: any): void;
    };
    CLAUDIX_BOOTSTRAP?: {
      host?: 'sidebar' | 'editor';
      page?: string;
    };
  }
}

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.mount('#app');
