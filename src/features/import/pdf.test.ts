import { describe, expect, it } from 'vitest'
import { textItemsToLines } from './pdf'

describe('PDF text layout reconstruction', () => {
  it('joins columns, preserves adjacent letters, and removes overprinted copies', () => {
    const item = (str: string, x: number, y: number, width: number) => ({ str, width, transform: [1, 0, 0, 1, x, y] })
    expect(textItemsToLines([
      item('09/02', 10, 100, 20), item('SHOP', 50, 100, 20), item('SHOP', 50, 100, 20),
      item('12.34', 150, 100, 20), item('A', 10, 80, 5), item('B', 15, 80, 5),
    ])).toEqual(['09/02 SHOP 12.34', 'AB'])
  })
})
