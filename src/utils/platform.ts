// Safari (iOS and macOS) revokes push permission when a push arrives without a visible
// notification, so the service worker shows one even while the app is open
export function isAppleWebKit(userAgent: string = navigator.userAgent): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent)
    && /AppleWebKit/.test(userAgent)
    && !/Chrome|CriOS|FxiOS|EdgiOS|Android/.test(userAgent)
}
