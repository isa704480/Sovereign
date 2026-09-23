/**
 * To'lov provayderlari komissiyasi — mijozga qo'shiladi, shunda bizga tarif
 * narxi (PLANS[].price) to'liq tushadi.
 *
 * Dodo (karta, https://dodopayments.com/pricing):
 *   4% + $0.40 asosiy + 1.5% xalqaro karta (AQShdan tashqari) + 0.5% obuna = 6% + $0.40.
 *   Soliq (VAT/GST) Dodo tomonidan ustiga qo'shiladi va bizning daromaddan olinmaydi.
 * ZenoBank (kripto, https://docs.zenobank.io/fees): 0.1% har to'lovdan.
 *
 * MUHIM: karta narxi Dodo mahsulotining o'zida turadi — bu yerdagi qiymat
 * o'zgarsa, Dodo'dagi mahsulot narxini ham shunga moslang.
 */
export type PayMethod = "card" | "crypto";

export const PAYMENT_FEES: Record<PayMethod, { pct: number; fixed: number }> = {
  card: { pct: 0.06, fixed: 0.4 },
  crypto: { pct: 0.001, fixed: 0 },
};

/** Komissiya ayirilgach `net` qoladigan eng kichik summa (sentgacha yuqoriga yaxlitlangan). */
export function grossPrice(net: number, method: PayMethod): number {
  if (net <= 0) return 0;
  const { pct, fixed } = PAYMENT_FEES[method];
  const cents = Math.ceil(Number((((net + fixed) / (1 - pct)) * 100).toFixed(6)));
  return cents / 100;
}

export function formatUsd(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
