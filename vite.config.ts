import { defineConfig, type Plugin, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

function firebaseMessagingInitPlugin(): Plugin {
  function generateContent(env: Record<string, string>): string {
    return `/* Auto-generated from env vars — do not commit */
/* eslint-disable no-undef */
firebase.initializeApp({
  apiKey: '${env.VITE_FIREBASE_API_KEY}',
  authDomain: '${env.VITE_FIREBASE_AUTH_DOMAIN}',
  projectId: '${env.VITE_FIREBASE_PROJECT_ID}',
  storageBucket: '${env.VITE_FIREBASE_STORAGE_BUCKET}',
  messagingSenderId: '${env.VITE_FIREBASE_MESSAGING_SENDER_ID}',
  appId: '${env.VITE_FIREBASE_APP_ID}',
})

firebase.messaging()

self.addEventListener('push', (event) => {
  const payload = event.data?.json()
  if (payload?.notification) return
  const title = payload?.data?.title
  const body = payload?.data?.body ?? ''
  if (!title) return
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      dir: 'rtl',
    })
  )
})
`
  }

  let resolvedRoot = process.cwd()
  let resolvedOutDir = 'dist'

  return {
    name: 'generate-firebase-messaging-init',
    configResolved(config) {
      resolvedRoot = config.root
      resolvedOutDir = config.build.outDir
    },
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      const outPath = path.resolve(server.config.root, 'public/firebase-messaging-init.js')
      fs.writeFileSync(outPath, generateContent(env))
    },
    closeBundle() {
      const env = loadEnv('production', resolvedRoot, '')
      const outPath = path.resolve(resolvedRoot, resolvedOutDir, 'firebase-messaging-init.js')
      fs.writeFileSync(outPath, generateContent(env))
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    firebaseMessagingInitPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CoinSmart - ארנק דיגיטלי לילדים',
        short_name: 'CoinSmart',
        description: 'ארנק דיגיטלי חכם לילדים, בניהול ההורים',
        theme_color: '#4F8CF7',
        background_color: '#F8FAFC',
        display: 'standalone',
        orientation: 'portrait',
        dir: 'rtl',
        lang: 'he',
        icons: [
          {
            src: '/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
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
        importScripts: [
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
          'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js',
          '/firebase-messaging-init.js',
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
