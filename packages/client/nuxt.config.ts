export default defineNuxtConfig({
  compatibilityDate: '2025-03-01',

  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
  },

  runtimeConfig: {
    public: {
      serverUrl: 'http://localhost:3000',
    },
  },
});
