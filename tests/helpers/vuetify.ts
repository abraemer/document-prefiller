import { config } from '@vue/test-utils'
import { createVuetify } from 'vuetify'

// Create a Vuetify instance for testing
const vuetify = createVuetify()

// Configure Vue Test Utils to use Vuetify
config.global.plugins = [vuetify]

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