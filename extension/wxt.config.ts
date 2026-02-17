import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'Q-Trans',
    description: 'Quick translate on text focus/selection',
    version: '1.0.0',
    permissions: ['storage', 'activeTab', 'scripting', 'identity'],
    host_permissions: [
      'https://*.openai.azure.com/*',
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
    ],
    oauth2: {
      client_id: 'REPLACE_WITH_YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
      scopes: ['openid', 'profile', 'email'],
    },
  },
  vite: () => ({
    plugins: [react()],
  }),
});
