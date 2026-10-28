/* Gerado a partir de shared/showcase-cash-discount.mjs. */
(() => {
/** Canonical cash offer arithmetic for the app, catalog service and storefront. */
function normalizeShowcaseCashDiscount(value = {}) {
  value = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const cashDiscountMode = value.cashDiscountMode === "fixed" ? "fixed" : "percentage";
  return {
    cashDiscountMode,
    cashDiscountBasisPoints: cashDiscountMode === "percentage" ? Math.min(3000, Math.max(0, Math.trunc(Number(value.cashDiscountBasisPoints) || 0))) : 0,
    cashDiscountAmountCents: cashDiscountMode === "fixed" ? Math.min(1_000_000_000, Math.max(0, Math.trunc(Number(value.cashDiscountAmountCents) || 0))) : 0,
  };
}

function showcaseCashDiscountCents(value, baseCents) {
  const discount = normalizeShowcaseCashDiscount(value);
  const base = Math.max(0, Math.trunc(Number(baseCents) || 0));
  return Math.min(base, discount.cashDiscountMode === "fixed" ? discount.cashDiscountAmountCents : Math.round(base * discount.cashDiscountBasisPoints / 10000));
}

function showcaseCashDiscountError(value, priceCents, promotionPriceCents = null) {
  if (value?.cashDiscountMode !== "fixed") return null;
  const amount = value.cashDiscountAmountCents ?? 0;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000) return "Informe um desconto à vista válido em reais.";
  const prices = [Number(priceCents), Number(promotionPriceCents)].filter(price => Number.isSafeInteger(price) && price > 0);
  if (prices.length && amount > Math.floor(Math.min(...prices) * .3)) return "O desconto à vista não pode ultrapassar 30% do preço normal ou promocional. Ajuste o valor em reais.";
  return null;
}

window.AssistenciaShowcaseCashDiscount = { normalizeShowcaseCashDiscount, showcaseCashDiscountCents, showcaseCashDiscountError };
})();
