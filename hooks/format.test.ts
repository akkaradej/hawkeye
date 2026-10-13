import { test, expect } from 'claude-code/testing'
import { TTL_MS, WARN_MS, clock, minutes, tildify } from './format'

test('constants: 1h TTL, 5 min warning', () => {
  expect(TTL_MS).toBe(3_600_000)
  expect(WARN_MS).toBe(300_000)
})

test('clock formats m:ss', () => {
  expect(clock(0)).toBe('0:00')
  expect(clock(5_000)).toBe('0:05')
  expect(clock(65_000)).toBe('1:05')
  expect(clock(WARN_MS)).toBe('5:00')
})

test('clock rounds partial seconds up', () => {
  expect(clock(1)).toBe('0:01')
  expect(clock(59_001)).toBe('1:00')
})

test('clock clamps negatives to 0:00', () => {
  expect(clock(-5_000)).toBe('0:00')
})

test('minutes floors to whole minutes', () => {
  expect(minutes(0)).toBe('0m')
  expect(minutes(59_999)).toBe('0m')
  expect(minutes(60_000)).toBe('1m')
  expect(minutes(TTL_MS)).toBe('60m')
})

test('minutes clamps negatives to 0m', () => {
  expect(minutes(-60_000)).toBe('0m')
})

test('tildify shows the home directory as ~', () => {
  expect(tildify('/Users/a/work/x', '/Users/a')).toBe('~/work/x')
  expect(tildify('/Users/a', '/Users/a')).toBe('~')
  expect(tildify('/Users/ab/x', '/Users/a')).toBe('/Users/ab/x')
  expect(tildify('/tmp/x', undefined)).toBe('/tmp/x')
})
