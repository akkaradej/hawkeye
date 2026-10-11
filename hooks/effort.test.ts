import { test, expect } from 'claude-code/testing'
import { clampEffort, setSetting } from './settings'
import { cacheSafe, isFollowUp, parseEffort } from './effort'

  test('reads the effort out of the judge reply', () => {
    expect(parseEffort('{"effort":"high"}')).toBe('high')
    expect(parseEffort('sure: {"effort":"max"} ok')).toBe('max')
    expect(parseEffort('{"effort":"huge"}')).toBeUndefined()
    expect(parseEffort('no json')).toBeUndefined()
  })
  test('short follow-ups keep the effort', () => {
    expect(isFollowUp('yes')).toBe(true)
    expect(isFollowUp('fix the login bug')).toBe(false)
  })
  test('only Sonnet and Opus 5.5 take an effort change', () => {
    expect(cacheSafe('claude-sonnet-5-5')).toBe(true)
    expect(cacheSafe('claude-haiku-5-5')).toBe(false)
  })

test('a picked effort stays between the lowest and the highest', () => {
  setSetting('effortMin', 'medium')
  setSetting('effortMax', 'high')
  expect(clampEffort('low')).toBe('medium')
  expect(clampEffort('max')).toBe('high')
  expect(clampEffort('high')).toBe('high')
  setSetting('effortMin', 'low')
  setSetting('effortMax', 'max')
})
