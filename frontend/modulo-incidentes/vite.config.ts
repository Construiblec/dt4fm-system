import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      // 'prompt': el SW nuevo espera a que el usuario acepte. Con 'autoUpdate'
      // la pagina se recarga sola y un operario a mitad de un checklist pierde
      // las fotos que aun no subio.
      registerType: 'prompt',
      // El registro lo hace useServiceWorkerUpdate, no un script inyectado.
      injectRegister: null,

      manifest: {
        id: '/',
        name: 'DT4F™',
        short_name: 'DT4F™',
        description:
          'Gemelo Digital para Gestión de Instalaciones.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        // Sin `orientation`: hay 7 pantallas con captura de foto y bloquear el
        // giro impide encuadrar en horizontal.
        theme_color: '#2563EB',
        background_color: '#FFFFFF',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/maskable-icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        // Coherente con 'prompt': el SW nuevo no secuestra pestanas que ya
        // cargaron el index.html viejo.
        skipWaiting: false,
        clientsClaim: false,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/_vercel\//],
      },

      // El SW no corre en `npm run dev`: con HMR activo sirve módulos rancios.
      // Para probar la instalación sin build usar `npm run dev:pwa`.
      devOptions: {
        enabled: mode === 'pwa',
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))

//Comentario para validar pipeline
