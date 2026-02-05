import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '@/renderer/App.vue'

describe('App Component', () => {
  it('should render the component', () => {
    const wrapper = mount(App)
    expect(wrapper.exists()).toBe(true)
  })

  it('should have a root element', () => {
    const wrapper = mount(App)
    expect(wrapper.element.tagName).toBeDefined()
  })
})