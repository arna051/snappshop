import { z } from 'zod';

const moneySchema = z.number().int().nonnegative().safe();

export type Toman = number & { readonly __unit: 'toman' };
export type Rial = number & { readonly __unit: 'rial' };
export type SnappShopOrderMoney = number & { readonly __unit: 'snappshop-order-money' };

export function toman(value: number): Toman {
  return moneySchema.parse(value) as Toman;
}

export function rial(value: number): Rial {
  return moneySchema.parse(value) as Rial;
}

export function snappShopOrderMoney(value: number): SnappShopOrderMoney {
  return moneySchema.parse(value) as SnappShopOrderMoney;
}

export function orderMoneyToRial(value: SnappShopOrderMoney): Rial {
  return rial(value * 10);
}

export function rialToTomanExact(value: Rial): Toman {
  if (value % 10 !== 0) throw new RangeError('Rial value cannot be represented exactly in toman');
  return toman(value / 10);
}
