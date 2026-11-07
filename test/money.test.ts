import { describe, expect, it } from 'vitest';
import {
  orderMoneyToRial,
  rial,
  rialToTomanExact,
  snappShopOrderMoney,
  toman,
} from '../src/index.js';

describe('money units', () => {
  it('converts order money to rial explicitly', () => {
    expect(orderMoneyToRial(snappShopOrderMoney(125_000))).toBe(1_250_000);
  });

  it('requires exact rial to toman conversion', () => {
    expect(rialToTomanExact(rial(100))).toBe(toman(10));
    expect(() => rialToTomanExact(rial(101))).toThrow(/exactly/);
  });

  it('rejects unsafe money values', () => {
    expect(() => toman(-1)).toThrow();
    expect(() => toman(1.5)).toThrow();
    expect(() => toman(Number.MAX_VALUE)).toThrow();
  });
});
