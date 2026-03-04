import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  language: 'he' | 'en'
  actions: {
    toggleSidebar: () => void
    setSidebarOpen: (open: boolean) => void
    setLanguage: (lang: 'he' | 'en') => void
  }
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  language: 'he',
  actions: {
    toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setLanguage: (language) => {
      const dir = language === 'he' ? 'rtl' : 'ltr'
      document.documentElement.setAttribute('dir', dir)
      document.documentElement.setAttribute('lang', language)
      set({ language })
    },
  },
}))
