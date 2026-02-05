import { describe, it, expect } from 'vitest'

describe('Basic Test Suite', () => {
  it('should pass a simple test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle string operations', () => {
    const str = 'Hello, World!'
    expect(str).toContain('Hello')
    expect(str.length).toBe(13)
  })

  it('should handle array operations', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(arr).toHaveLength(5)
    expect(arr).toContain(3)
    expect(arr).not.toContain(6)
  })

  it('should handle object operations', () => {
    const obj = { name: 'Test', value: 42 }
    expect(obj).toHaveProperty('name', 'Test')
    expect(obj).toHaveProperty('value', 42)
  })
})