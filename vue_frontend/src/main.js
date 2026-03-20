import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { NConfigProvider, darkTheme } from 'naive-ui';
import App from './App.vue';
import router from './router';
import './assets/styles.css';
import 'harmonyos-sans-sc-webfont-splitted';

import 'highlight.js/styles/atom-one-dark.css';

const themeOverrides = {
  common: {
    fontFamily:
      "'HarmonyOS Sans SC', 'HarmonyOS Sans', 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif",
    fontSize: '15px',
    bodyColor: '#050814',
    cardColor: '#0d162b',
    modalColor: '#0d162b',
    popoverColor: '#10203d',
    tableColor: '#0b1427',
    textColorBase: '#e0f4ff',
    textColor1: '#e0f4ff',
    textColor2: '#9bc4d8',
    textColor3: '#6f8fa3',
    borderColor: 'rgba(0, 229, 255, 0.22)',
    primaryColor: '#00e5ff',
    primaryColorHover: '#47f0ff',
    primaryColorPressed: '#00c4dc',
    primaryColorSuppl: '#00d8f2',
    infoColor: '#00c9ff',
    successColor: '#00ff9d',
    warningColor: '#ff9a3d',
    errorColor: '#ff4b7a',
  },
};

const app = createApp({
  render: () =>
    h(
      NConfigProvider,
      {
        theme: darkTheme,
        themeOverrides,
      },
      {
        default: () => h(App),
      }
    ),
});

app.use(createPinia());
app.use(router);

app.mount('#app');
