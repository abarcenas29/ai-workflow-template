import { describe, expect, it } from 'vitest'

describe('sync utility functions', () => {
  it('should validate basic assertions work', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle string operations', () => {
    const result = 'ai-workflow-template'.split('-').join(' ')
    expect(result).toBe('ai workflow template')
  })
})
