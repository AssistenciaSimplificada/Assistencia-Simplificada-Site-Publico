(() => {
  "use strict";
  const API = "https://catalogo.assistenciasimplificada.site";
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
  let pin = "";
  let items = [];
  let original = new Map();
  const moneyInput = cents => cents == null ? "" : (Number(cents) / 100).toFixed(2);
  const cents = value => Math.round(Number(String(value || "").replace(",", ".")) * 100);
  const imageUrl = value => value ? `${API}${String(value).startsWith("/") ? value : `/${value}`}` : "/favicon.svg";
  const esc = value => String(value || "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const notify = (text, error = false) => { messageNode.textContent = text; messageNode.className = `show${error ? " error" : ""}`; clearTimeout(notify.timer); notify.timer = setTimeout(() => { messageNode.className = ""; }, 3800); };
  const request = async (path, payload) => {
    const response = await fetch(`${API}${path}`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload), cache:"no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "service_unavailable");
    return body;
  };
  const changed = item => {
    const before = original.get(item.code);
    return before && (before.priceCents !== item.priceCents || before.discountPriceCents !== item.discountPriceCents || before.interestFreeInstallments !== item.interestFreeInstallments || before.interestMaxInstallments !== item.interestMaxInstallments);
  };
  const originalValues = item => ({ priceCents:item.priceCents, discountPriceCents:item.discountPriceCents, interestFreeInstallments:item.interestFreeInstallments, interestMaxInstallments:item.interestMaxInstallments });
  const updateCount = () => {
    const total = items.filter(changed).length;
    countNode.textContent = `${total} alteraç${total === 1 ? "ão" : "ões"}`;
    saveNode.disabled = total === 0;
  };
  const render = () => {
    const query = searchNode.value.trim().toLocaleLowerCase("pt-BR");
    const filtered = items.filter(item => !query || item.title.toLocaleLowerCase("pt-BR").includes(query));
    itemsNode.innerHTML = filtered.length ? filtered.map(item => {
      const freeOptions = Array.from({ length:item.paymentMaximumInstallments }, (_, index) => index + 1).map(count => `<option value="${count}" ${count === item.interestFreeInstallments ? "selected" : ""}>Até ${count}x sem juros</option>`).join("");
      const paidOptions = [item.interestFreeInstallments, ...item.availableWithInterest.filter(count => count > item.interestFreeInstallments)].map(count => `<option value="${count}" ${count === item.interestMaxInstallments ? "selected" : ""}>${count === item.interestFreeInstallments ? "Não oferecer com juros" : `Até ${count}x com juros`}</option>`).join("");
      return `<article class="device-row ${changed(item) ? "changed" : ""}" data-code="${esc(item.code)}"><img src="${esc(imageUrl(item.imageUrl))}" alt=""><div class="device-info"><strong>${esc(item.title)}</strong><span>${esc(item.purchaseKind)} · ${item.availability === "order" ? "Sob encomenda" : item.availability === "unavailable" ? "Indisponível" : "Pronta entrega"}</span></div><label class="price-field">Preço normal<div class="price-input"><span>R$</span><input data-field="priceCents" inputmode="decimal" value="${moneyInput(item.priceCents)}"></div></label><label class="price-field">Preço promocional<div class="price-input"><span>R$</span><input data-field="discountPriceCents" inputmode="decimal" value="${moneyInput(item.discountPriceCents)}" placeholder="Sem promoção"></div></label><div class="installment-fields"><label class="price-field">Parcelamento sem juros<select data-field="interestFreeInstallments">${freeOptions}</select></label><label class="price-field">Limite com juros<select data-field="interestMaxInstallments">${paidOptions}</select></label></div></article>`;
    }).join("") : '<div class="empty">Nenhum aparelho encontrado.</div>';
    itemsNode.querySelectorAll(".price-input input").forEach(input => input.addEventListener("input", event => {
      const row = event.target.closest(".device-row");
      const item = items.find(entry => entry.code === row.dataset.code);
      const value = event.target.value.trim();
      item[event.target.dataset.field] = value ? cents(value) : null;
      row.classList.toggle("changed", changed(item));
      updateCount();
    }));
    itemsNode.querySelectorAll(".installment-fields select").forEach(select => select.addEventListener("change", event => {
      const row = event.target.closest(".device-row");
      const item = items.find(entry => entry.code === row.dataset.code);
      item[event.target.dataset.field] = Number(event.target.value);
      if (event.target.dataset.field === "interestFreeInstallments") {
        if (item.interestMaxInstallments < item.interestFreeInstallments || (item.interestMaxInstallments > item.interestFreeInstallments && !item.availableWithInterest.includes(item.interestMaxInstallments))) item.interestMaxInstallments = item.interestFreeInstallments;
        render();
      } else { row.classList.toggle("changed", changed(item)); updateCount(); }
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
    document.querySelector("#store-name").textContent = body.storeName;
    const banner = document.querySelector("#editor-store-banner");
    const bannerImage = document.querySelector("#editor-store-banner-image");
    const bannerUrl = typeof body.bannerUrl === "string" && /^\/media\/[A-Za-z0-9_-]{12}\/banner\.webp\?v=[a-f0-9]{12}$/.test(body.bannerUrl) ? body.bannerUrl : "";
    banner.hidden = !bannerUrl;
    if (bannerUrl) { bannerImage.src = imageUrl(bannerUrl); bannerImage.alt = `Banner da ${body.storeName}`; bannerImage.onerror = () => { banner.hidden = true; }; }
    else bannerImage.removeAttribute("src");
    document.querySelector("#expiry").textContent = `Acesso válido até ${new Intl.DateTimeFormat("pt-BR").format(new Date(body.expiresAt))}`;
    access.hidden = true; editor.hidden = false; render();
  };
  form.addEventListener("submit", async event => {
    event.preventDefault(); errorNode.textContent = ""; pin = pinNode.value.replace(/\D/g, "");
    try { await open(); } catch (error) { errorNode.textContent = error.message === "editor_locked" ? "Muitas tentativas. Aguarde 15 minutos." : error.message === "editor_expired" ? "Este acesso venceu. Peça um novo link à loja." : "Link ou código incorreto."; }
  });
  searchNode.addEventListener("input", render);
  copyNamesNode.addEventListener("click", async () => {
    const names = items.map(item => item.title.trim()).filter(Boolean).join("\n");
    if (!names) return notify("Não há aparelhos para copiar.", true);
    try { await navigator.clipboard.writeText(names); notify(`${items.length} nome${items.length === 1 ? " copiado" : "s copiados"}.`); }
    catch { notify("Não foi possível copiar. Selecione os nomes manualmente.", true); }
  });
  saveNode.addEventListener("click", async () => {
    const changes = items.filter(changed);
    if (!changes.length) return;
    for (const item of changes) {
      if (!Number.isInteger(item.priceCents) || item.priceCents <= 0) return notify(`Informe um preço válido para ${item.title}.`, true);
      if (item.discountPriceCents != null && (!Number.isInteger(item.discountPriceCents) || item.discountPriceCents <= 0 || item.discountPriceCents >= item.priceCents)) return notify(`O preço promocional de ${item.title} deve ser menor que o normal.`, true);
      if (!Number.isInteger(item.interestFreeInstallments) || item.interestFreeInstallments < 1 || item.interestFreeInstallments > item.paymentMaximumInstallments || !Number.isInteger(item.interestMaxInstallments) || item.interestMaxInstallments < item.interestFreeInstallments || item.interestMaxInstallments > item.paymentMaximumInstallments || (item.interestMaxInstallments > item.interestFreeInstallments && !item.availableWithInterest.includes(item.interestMaxInstallments))) return notify(`Revise o parcelamento de ${item.title}.`, true);
    }
    saveNode.disabled = true; saveNode.textContent = "Salvando...";
    try {
      const result = await request("/price-editor/update", { storeCode, token, pin, changes:changes.map(item => ({ itemCode:item.code, priceCents:item.priceCents, discountPriceCents:item.discountPriceCents, interestFreeInstallments:item.interestFreeInstallments, interestMaxInstallments:item.interestMaxInstallments })) });
      original = new Map(items.map(item => [item.code, originalValues(item)]));
      render(); notify(`${result.updated} aparelho${result.updated === 1 ? " atualizado" : "s atualizados"} com sucesso.`);
    } catch (error) { notify(error.message === "editor_expired" ? "Este acesso venceu." : "Não foi possível salvar agora. Tente novamente.", true); }
    finally { saveNode.textContent = "Salvar alterações"; updateCount(); }
  });
  if (!/^[A-Za-z0-9_-]{12}$/.test(storeCode || "") || !/^[A-Za-z0-9_-]{40,60}$/.test(token || "")) { form.hidden = true; errorNode.textContent = "Este link está incompleto. Peça um novo endereço à loja."; }
})();
