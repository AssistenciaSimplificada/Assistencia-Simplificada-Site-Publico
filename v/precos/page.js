(() => {
  "use strict";
  const API = window.__ASSISTENCIA_CATALOG_CONFIG__.apiUrl;
  const [storeCode, token] = location.hash.slice(1).split("/");
  const access = document.querySelector("#access");
  const editor = document.querySelector("#editor");
  const form = document.querySelector("#access-form");
  const pinNode = document.querySelector("#pin");
  const errorNode = document.querySelector("#access-error");
  const itemsNode = document.querySelector("#items");
  const searchNode = document.querySelector("#search");
  const saveNode = document.querySelector("#save");
  const copyNamesNode = document.querySelector("#copy-names");
  const countNode = document.querySelector("#count");
  const messageNode = document.querySelector("#message");
  const noticeNode = document.querySelector("#price-notice");
  const noticeOpenNode = document.querySelector("#price-notice-open");
  const noticeCopyNode = document.querySelector("#price-notice-copy");
  let noticeMessage = "";
  let pin = "";
  let saving = false;
  let opening = false;
  let items = [];
  let itemsByCode = new Map();
  let original = new Map();
  const changedCodes = new Set();
  const priceDrafts = new Map();
  const PAGE_SIZE = 40;
  let visibleLimit = PAGE_SIZE;
  let searchTimer;
  const moneyInput = cents => cents == null ? "" : (Number(cents) / 100).toFixed(2);
  const cents = value => Math.round(Number(String(value || "").replace(",", ".")) * 100);
  const imageUrl = value => value ? `${API}${String(value).startsWith("/") ? value : `/${value}`}` : "/favicon.svg";
  const esc = value => String(value || "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const notify = (text, error = false) => { messageNode.textContent = text; messageNode.className = `show${error ? " error" : ""}`; clearTimeout(notify.timer); notify.timer = setTimeout(() => { messageNode.className = ""; }, 3800); };
  const request = async (path, payload) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${API}${path}`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload), cache:"no-store", signal:controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "service_unavailable");
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("service_unavailable");
      if (path.endsWith("/session") && !Array.isArray(body.items)) throw new Error("service_unavailable");
      if (path.endsWith("/update") && (!Number.isInteger(body.updated) || body.updated !== payload.changes.length
        || body.updated > 0 && (!Array.isArray(body.items) || payload.changes.some(change => !body.items.some(item => item.itemCode === change.itemCode && Number.isFinite(Date.parse(item.updatedAt))))))) throw new Error("service_unavailable");
      return body;
    } finally { clearTimeout(timer); }
  };
  const changed = item => {
    const before = original.get(item.code);
    return before && (before.priceCents !== item.priceCents || before.discountPriceCents !== item.discountPriceCents || before.interestFreeInstallments !== item.interestFreeInstallments || before.interestMaxInstallments !== item.interestMaxInstallments);
  };
  const originalValues = item => ({ priceCents:item.priceCents, discountPriceCents:item.discountPriceCents, interestFreeInstallments:item.interestFreeInstallments, interestMaxInstallments:item.interestMaxInstallments, updatedAt:item.updatedAt });
  const updateCount = (item) => {
    if (item) {
      if (changed(item)) changedCodes.add(item.code);
      else changedCodes.delete(item.code);
    }
    const total = changedCodes.size;
    countNode.textContent = `${total} alteraç${total === 1 ? "ão" : "ões"}`;
    saveNode.disabled = saving || total === 0;
  };
  const render = () => {
    const query = searchNode.value.trim().toLocaleLowerCase("pt-BR");
    const filtered = items.filter(item => !query || item.title.toLocaleLowerCase("pt-BR").includes(query));
    itemsNode.innerHTML = filtered.length ? filtered.slice(0, visibleLimit).map(item => {
      const freeOptions = Array.from({ length:item.paymentMaximumInstallments }, (_, index) => index + 1).map(count => `<option value="${count}" ${count === item.interestFreeInstallments ? "selected" : ""}>Até ${count}x sem juros</option>`).join("");
      const paidOptions = [item.interestFreeInstallments, ...item.availableWithInterest.filter(count => count > item.interestFreeInstallments)].map(count => `<option value="${count}" ${count === item.interestMaxInstallments ? "selected" : ""}>${count === item.interestFreeInstallments ? "Não oferecer com juros" : `Até ${count}x com juros`}</option>`).join("");
      const draft = priceDrafts.get(item.code) || {};
      return `<article class="device-row ${changed(item) ? "changed" : ""}" data-code="${esc(item.code)}"><img src="${esc(imageUrl(item.imageUrl))}" alt="" loading="lazy" decoding="async" width="64" height="64"><div class="device-info"><strong>${esc(item.title)}</strong><span>${esc(item.purchaseKind)} · ${item.availability === "order" ? "Sob encomenda" : item.availability === "unavailable" ? "Indisponível" : "Pronta entrega"}</span></div><label class="price-field">Preço normal<div class="price-input"><span>R$</span><input data-field="priceCents" inputmode="decimal" value="${esc(draft.priceCents ?? moneyInput(item.priceCents))}"></div></label><label class="price-field">Preço promocional<div class="price-input"><span>R$</span><input data-field="discountPriceCents" inputmode="decimal" value="${esc(draft.discountPriceCents ?? moneyInput(item.discountPriceCents))}" placeholder="Sem promoção"></div></label><div class="installment-fields"><label class="price-field">Parcelamento sem juros<select data-field="interestFreeInstallments">${freeOptions}</select></label><label class="price-field">Limite com juros<select data-field="interestMaxInstallments">${paidOptions}</select></label></div></article>`;
    }).join("") + (filtered.length > visibleLimit ? `<div class="more-items"><span>Mostrando ${visibleLimit} de ${filtered.length} aparelhos</span><button id="more-items" type="button">Mostrar mais ${Math.min(PAGE_SIZE, filtered.length - visibleLimit)}</button></div>` : "") : '<div class="empty">Nenhum aparelho encontrado.</div>';
    itemsNode.querySelector("#more-items")?.addEventListener("click", () => { visibleLimit += PAGE_SIZE;render(); });
    itemsNode.querySelectorAll(".price-input input").forEach(input => input.addEventListener("input", event => {
      const row = event.target.closest(".device-row");
      const item = itemsByCode.get(row.dataset.code);
      const value = event.target.value.trim();
      priceDrafts.set(item.code, { ...priceDrafts.get(item.code), [event.target.dataset.field]: event.target.value });
      item[event.target.dataset.field] = value ? cents(value) : null;
      row.classList.toggle("changed", changed(item));
      updateCount(item);
    }));
    itemsNode.querySelectorAll(".installment-fields select").forEach(select => select.addEventListener("change", event => {
      const row = event.target.closest(".device-row");
      const item = itemsByCode.get(row.dataset.code);
      item[event.target.dataset.field] = Number(event.target.value);
      if (event.target.dataset.field === "interestFreeInstallments") {
        if (item.interestMaxInstallments < item.interestFreeInstallments || (item.interestMaxInstallments > item.interestFreeInstallments && !item.availableWithInterest.includes(item.interestMaxInstallments))) item.interestMaxInstallments = item.interestFreeInstallments;
        updateCount(item);render();
      } else { row.classList.toggle("changed", changed(item)); updateCount(item); }
    }));
    updateCount();
  };
  const open = async () => {
    const body = await request("/price-editor/session", { storeCode, token, pin });
    items = (body.items || []).map(item => ({
      ...item,
      interestFreeInstallments: Number(item.interestFreeInstallments) || 1,
      interestMaxInstallments: Number(item.interestMaxInstallments) || Number(item.maxInstallments) || Number(item.interestFreeInstallments) || 1,
      paymentMaximumInstallments: Number(item.paymentMaximumInstallments) || Number(item.maxInstallments) || Number(item.interestFreeInstallments) || 1,
      availableWithInterest: Array.isArray(item.availableWithInterest) ? item.availableWithInterest.map(Number).filter(Number.isInteger) : [],
    }));
    original = new Map(items.map(item => [item.code, originalValues(item)]));
    itemsByCode = new Map(items.map(item => [item.code, item]));
    changedCodes.clear();priceDrafts.clear();visibleLimit = PAGE_SIZE;
    document.querySelector("#store-name").textContent = body.storeName;
    const banner = document.querySelector("#editor-store-banner");
    const bannerImage = document.querySelector("#editor-store-banner-image");
    const bannerUrl = typeof body.bannerUrl === "string" && /^\/media\/[A-Za-z0-9_-]{12}\/(?:banner\.webp\?v=[a-f0-9]{12}|branding\/banner-[a-f0-9]{64}\.(?:webp|png|jpg))$/.test(body.bannerUrl) ? body.bannerUrl : "";
    banner.hidden = !bannerUrl;
    if (bannerUrl) { bannerImage.src = imageUrl(bannerUrl); bannerImage.alt = `Banner da ${body.storeName}`; bannerImage.onerror = () => { banner.hidden = true; }; }
    else bannerImage.removeAttribute("src");
    document.querySelector("#expiry").textContent = `Acesso válido até ${new Intl.DateTimeFormat("pt-BR").format(new Date(body.expiresAt))}`;
    access.hidden = true; editor.hidden = false; render();
  };
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (opening) return;
    opening = true;
    form.inert = true;
    errorNode.textContent = ""; pin = pinNode.value.replace(/\D/g, "");
    try { await open(); } catch (error) { errorNode.textContent = error.message === "editor_locked" ? "Muitas tentativas. Aguarde 15 minutos." : error.message === "editor_expired" ? "Este acesso venceu. Peça um novo link à loja." : "Link ou código incorreto."; }
    finally { opening = false; form.inert = false; }
  });
  searchNode.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { visibleLimit = PAGE_SIZE;render(); }, 120);
  });
  copyNamesNode.addEventListener("click", async () => {
    const names = items.map(item => item.title.trim()).filter(Boolean).join("\n");
    if (!names) return notify("Não há aparelhos para copiar.", true);
    try { await navigator.clipboard.writeText(names); notify(`${items.length} nome${items.length === 1 ? " copiado" : "s copiados"}.`); }
    catch { notify("Não foi possível copiar. Selecione os nomes manualmente.", true); }
  });
  noticeCopyNode.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(noticeMessage); notify("Resumo completo copiado."); }
    catch { notify("Não foi possível copiar o resumo agora.", true); }
  });
  saveNode.addEventListener("click", async () => {
    if (saving) return;
    const changes = items.filter(changed).map(item => ({ ...item }));
    if (!changes.length) return;
    for (const item of changes) {
      if (!Number.isInteger(item.priceCents) || item.priceCents <= 0) return notify(`Informe um preço válido para ${item.title}.`, true);
      if (item.discountPriceCents != null && (!Number.isInteger(item.discountPriceCents) || item.discountPriceCents <= 0 || item.discountPriceCents >= item.priceCents)) return notify(`O preço promocional de ${item.title} deve ser menor que o normal.`, true);
      if (!Number.isInteger(item.interestFreeInstallments) || item.interestFreeInstallments < 1 || item.interestFreeInstallments > item.paymentMaximumInstallments || !Number.isInteger(item.interestMaxInstallments) || item.interestMaxInstallments < item.interestFreeInstallments || item.interestMaxInstallments > item.paymentMaximumInstallments || (item.interestMaxInstallments > item.interestFreeInstallments && !item.availableWithInterest.includes(item.interestMaxInstallments))) return notify(`Revise o parcelamento de ${item.title}.`, true);
    }
    // Reserve the tab during the click so mobile browsers can open WhatsApp
    // after the asynchronous save. Failed saves close it and send no report.
    let whatsappTab = null;
    try {
      whatsappTab = window.open("about:blank", "_blank");
      if (whatsappTab) {
        whatsappTab.opener = null;
        whatsappTab.document.title = "Salvando preços da vitrine";
        whatsappTab.document.body.textContent = "Aguarde a confirmação dos preços para abrir a mensagem da assistência.";
      }
    } catch { whatsappTab = null; }
    saving = true;
    clearTimeout(searchTimer);
    itemsNode.inert = true;
    searchNode.disabled = true;
    saveNode.disabled = true; saveNode.textContent = "Salvando...";
    try {
      const result = await request("/price-editor/update", { storeCode, token, pin, changes:changes.map(item => ({ itemCode:item.code, expectedUpdatedAt:original.get(item.code)?.updatedAt, priceCents:item.priceCents, discountPriceCents:item.discountPriceCents, interestFreeInstallments:item.interestFreeInstallments, interestMaxInstallments:item.interestMaxInstallments })) });
      for (const item of changes) {
        const revision = result.items?.find(entry => entry.itemCode === item.code)?.updatedAt || result.updatedAt || item.updatedAt;
        original.set(item.code, originalValues({ ...item, updatedAt:revision }));
        changedCodes.delete(item.code);priceDrafts.delete(item.code);
        const current = itemsByCode.get(item.code);
        if (current) current.updatedAt = revision;
      }
      render(); notify(`${result.updated} aparelho${result.updated === 1 ? " atualizado" : "s atualizados"} com sucesso.`);
      const notice = result.whatsAppNotice;
      if (result.updated > 0 && typeof notice?.message === "string" && notice.message.trim()) {
        noticeMessage = notice.message;
        const phone = /^\d{10,15}$/.test(String(notice.phone || "")) ? notice.phone : "";
        const whatsappUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(noticeMessage)}` : "";
        noticeNode.hidden = false;
        noticeOpenNode.hidden = !whatsappUrl;
        if (whatsappUrl) noticeOpenNode.href = whatsappUrl;
        else noticeOpenNode.removeAttribute("href");
        document.querySelector("#price-notice-text").textContent = whatsappUrl
          ? "A mensagem contém os valores salvos. Confira o resumo e confirme o envio no WhatsApp. Se a janela não abrir, use o botão abaixo."
          : "Preços salvos. Cadastre o WhatsApp da assistência na vitrine para abrir o aviso. Você pode copiar o resumo completo.";
        if (whatsappUrl && whatsappTab && !whatsappTab.closed) {
          try { whatsappTab.location.replace(whatsappUrl); whatsappTab = null; }
          catch { /* The visible link remains available if navigation is blocked. */ }
        }
      }
    } catch (error) {
      notify(error.message === "catalog_conflict" ? "Este aparelho foi alterado em outra sessão. Suas alterações continuam na tela; reabra o link para conferir os valores atuais antes de salvar." : error.message === "editor_expired" ? "Este acesso venceu." : "Não foi possível salvar agora. Tente novamente.", true);
      if (error.message === "catalog_conflict") clearTimeout(notify.timer);
    }
    finally { if (whatsappTab && !whatsappTab.closed) whatsappTab.close(); saving = false; itemsNode.inert = false; searchNode.disabled = false; saveNode.textContent = "Salvar alterações"; updateCount(); }
  });
  window.addEventListener("beforeunload", event => { if (saving || items.some(changed)) { event.preventDefault(); event.returnValue = ""; } });
  if (!/^[A-Za-z0-9_-]{12}$/.test(storeCode || "") || !/^[A-Za-z0-9_-]{40,60}$/.test(token || "")) { form.hidden = true; errorNode.textContent = "Este link está incompleto. Peça um novo endereço à loja."; }
})();
