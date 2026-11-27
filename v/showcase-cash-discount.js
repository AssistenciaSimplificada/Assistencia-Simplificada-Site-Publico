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

function normalizeShowcasePaymentOptions(value = {}) {
  const methods = ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "PayJoy"];
  const configured = Array.isArray(value?.promotionPaymentMethods) ? value.promotionPaymentMethods : ["Pix", "Dinheiro"];
  const base = value?.payJoyBasePriceCents;
  return {
    promotionPaymentMethods: methods.filter(method => configured.includes(method)),
    payJoyMode: value?.payJoyMode === "disabled" ? "disabled" : "store",
    payJoyBasePriceCents: Number.isSafeInteger(base) && base > 0 && base <= 1_000_000_000 ? base : null,
  };
}

function showcaseMethodPrices(value, regularPrice, activePromotion, payJoyAvailable = false) {
  const options = normalizeShowcasePaymentOptions(value);
  const accepted = Array.isArray(value.acceptedPaymentMethods) ? value.acceptedPaymentMethods : ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito"];
  const cashMethods = Array.isArray(value.cashDiscountMethods) ? value.cashDiscountMethods : ["Pix", "Dinheiro"];
  const methods = ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito"].filter(method => accepted.includes(method));
  if (payJoyAvailable && options.payJoyMode !== "disabled") methods.push("PayJoy");
  return methods.map(method => {
    const regular = method === "PayJoy" ? options.payJoyBasePriceCents ?? regularPrice : regularPrice;
    const promoted = Boolean(activePromotion && activePromotion < regular && options.promotionPaymentMethods.includes(method));
    const cash = (method === "Pix" || method === "Dinheiro") && !activePromotion && cashMethods.includes(method);
    const priceCents = promoted ? activePromotion : regular - (cash ? showcaseCashDiscountCents(value, regular) : 0);
    return { method, priceCents, promoted };
  });
}

window.AssistenciaShowcaseCashDiscount = { normalizeShowcaseCashDiscount, showcaseCashDiscountCents, showcaseCashDiscountError, normalizeShowcasePaymentOptions, showcaseMethodPrices };
})();
