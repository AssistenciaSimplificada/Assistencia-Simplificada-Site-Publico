(() => {
  "use strict";
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2").replace(/[^a-z0-9]+/g, " ").trim();
  const aliases = { ifone: "iphone", aifone: "iphone", sansung: "samsung", xiomi: "xiaomi" };
  const queryWords = value => normalize(value).slice(0, 160).split(/\s+/).filter(Boolean).slice(0, 12).map(word => aliases[word] || word);
  const closeWord = (a, b) => {
    if (a === b) return true;
    if (/\d/.test(a) || /\d/.test(b)) return false;
    if (a.length >= 2 && b.startsWith(a)) return true;
    if (a.length < 4) return false;
    const limit = a.length >= 8 ? 2 : 1;
    if (Math.abs(a.length - b.length) > limit || b.length > 40) return false;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index), older;
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
        if (older && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], older[j - 2] + 1);
      }
      if (Math.min(...row) > limit) return false;
      older = previous; previous = row;
    }
    return previous[b.length] <= limit;
  };
  const searchMatches = (value, words) => {
    if (!words.length) return true;
    const tokens = normalize(value).split(/\s+/);
    return words.every(word => tokens.some(token => closeWord(word, token)));
  };
  const effectivePricing = (item, now = Date.now()) => {
    if (!item.promotionStartsAt && !item.promotionEndsAt) return item;
    const discount = Number(item.promotionPriceCents ?? item.discountPriceCents);
    const start = item.promotionStartsAt ? Date.parse(item.promotionStartsAt) : -Infinity;
    const end = item.promotionEndsAt ? Date.parse(item.promotionEndsAt) : Infinity;
    const active = discount > 0 && discount < Number(item.priceCents) && now >= start && now < end;
    const base = active ? discount : Number(item.priceCents);
    const terms = (item.interestInstallments || (item.interestInstallment ? [item.interestInstallment] : [])).map(term => {
      const totalCents = Math.round(base * (1 + Number(term.rateBasisPoints || 0) / 10000));
      return { ...term, totalCents, installmentCents: Math.ceil(totalCents / term.installments) };
    });
    return { ...item, promotionPriceCents: discount || null, discountPriceCents: active ? discount : null,
      cashPriceCents: Math.max(1, Math.round(base * (1 - Number(item.cashDiscountBasisPoints || 0) / 10000))),
      interestInstallments: terms, interestInstallment: terms.at(-1) || null };
  };
  const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dateInput = value => value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)).replace(" ", "T") : "";
  const inputDate = value => value && Number.isFinite(Date.parse(`${value}:00-03:00`)) ? new Date(`${value}:00-03:00`).toISOString() : null;
  window.assistenciaCatalogTools = { queryWords, searchMatches, effectivePricing, dateInput, inputDate };
})();
