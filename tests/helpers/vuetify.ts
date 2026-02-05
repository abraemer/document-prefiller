import { config } from '@vue/test-utils'

// Mock Vuetify's $vuetify property
config.global.mocks = {
  $vuetify: {
    display: {
      mobile: false,
      mobileBreakpoint: 'md',
      thresholds: {
        xs: 0,
        sm: 600,
        md: 960,
        lg: 1280,
        xl: 1920,
      },
    },
    theme: {
      current: {
        dark: false,
      },
    },
  },
}

// Stub all Vuetify components to avoid CSS import issues
config.global.stubs = {
  VApp: true,
  VMain: true,
  VContainer: true,
  VRow: true,
  VCol: true,
  VCard: true,
  VCardTitle: true,
  VCardText: true,
  VBtn: true,
  VIcon: true,
  VDivider: true,
}