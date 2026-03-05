/* eslint-disable no-undef */
firebase.initializeApp({
  apiKey: 'AIzaSyACuWE61VPkpd8QMV7SYqhU7w7WmhM3eGw',
  authDomain: 'coinsmart-93d74.firebaseapp.com',
  projectId: 'coinsmart-93d74',
  storageBucket: 'coinsmart-93d74.firebasestorage.app',
  messagingSenderId: '477172189150',
  appId: '1:477172189150:web:99dd0f54036ef1aba13f4f',
})

// Initialize messaging so Firebase SDK manages the FCM connection
firebase.messaging()

// Handle data-only push messages directly via push event
// (onBackgroundMessage doesn't reliably fire for data-only messages)
self.addEventListener('push', (event) => {
  const payload = event.data?.json()

  // Skip if Firebase SDK already handles this (has notification field)
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
