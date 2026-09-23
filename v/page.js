(() => {
  "use strict";
  const API = "https://catalogo.assistenciasimplificada.site";
  const catalogNode = document.querySelector("#catalog");
  const detailNode = document.querySelector("#detail");
  const statusNode = document.querySelector("#status");
  const searchNode = document.querySelector("#search");
  const kindNode = document.querySelector("#kind");
  const availabilityNode = document.querySelector("#availability");
  const storageNode = document.querySelector("#storage");
  const ramNode = document.querySelector("#ram");
  const sortNode = document.querySelector("#sort");
  const mobileSearchNode = document.querySelector("#mobile-search");
  const mobileSearchSubmitNode = document.querySelector("#mobile-search-submit");
  const mobileSortNode = document.querySelector("#mobile-sort");
  const mobileFilterNodes = [...document.querySelectorAll(".mobile-filter-strip > button")];
  const bestSellerNode = document.querySelector("#best-seller");
  let catalog = null;
  let activePhotoViewer = null;
  const closePhotoViewer = () => {
    activePhotoViewer?.remove();
    activePhotoViewer = null;
    document.body.classList.remove("photo-viewer-open");
  };
  const money = value => new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(value || 0) / 100);
  const salePrice = item => Number(item.discountPriceCents || item.priceCents);
  const cashPrice = item => Number(item.cashDiscountBasisPoints || 0) > 0 ? Number(item.cashPriceCents || salePrice(item)) : salePrice(item);
  const percent = basisPoints => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits:2 }).format(Number(basisPoints || 0) / 100)}%`;
  const esc = value => String(value || "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const imageUrl = value => String(value || "").startsWith("/v/") ? String(value) : `${API}${String(value || "").startsWith("/") ? value : `/${value}`}`;
  const rgb = hex => [1,3,5].map(index => Number.parseInt(hex.slice(index,index + 2),16));
  const formatCapacity = value => /^\d+$/.test(String(value || "").trim()) ? `${value} GB` : String(value || "");
  const capacityNumber = value => Number(String(value || "").replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] || 0);
  const formatBattery = value => /^\d+$/.test(String(value || "").trim()) ? `${value}%` : String(value || "");
  const displayCondition = value => value === "Usado" ? "Seminovo" : String(value || "");
  const displayWarranty = item => {
    const value = String(item.warranty || "").trim();
    return !value || /^(garantia informada pela loja|1 mês de garantia|1 mes de garantia)$/i.test(value)
      ? item.purchaseKind === "Usado" ? "30 dias" : "90 dias"
      : value;
  };
  const variantPart = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
  const variantModel = (brand, model) => {
    const brandKey = variantPart(brand);
    let modelKey = variantPart(model);
    if (brandKey && modelKey.startsWith(`${brandKey} `)) modelKey = modelKey.slice(brandKey.length + 1);
    if (brandKey === "samsung" && modelKey.startsWith("galaxy ")) modelKey = modelKey.slice(7);
    return modelKey;
  };
  const unitVariant = item => ({ code: item.code, color: String(item.unitColor || "").trim() || (String(item.color || "").includes(",") || (item.availableColors || []).length > 1 ? "" : String(item.color || "").trim()), imageUrls: item.imageUrls || [] });
  const mergeCatalogVariants = items => {
    const physicalKeys = new Set(items.filter(item => !item.catalogOnly && item.availability !== "unavailable").map(item => [item.purchaseKind,item.deviceType,item.brand,variantModel(item.brand,item.model),item.storage,item.ram].map(variantPart).join("|")));
    const grouped = new Map();
    for (const item of items) {
      const variantBaseKey = [item.purchaseKind,item.deviceType,item.brand,variantModel(item.brand,item.model),item.storage,item.ram].map(variantPart).join("|");
      if (item.catalogOnly && physicalKeys.has(variantBaseKey)) continue;
      const key = `${variantBaseKey}|${variantPart(item.availability)}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { ...item, variantBaseKey, stockQuantity: 1, variantCodes: [item.code], variants: [unitVariant(item)], availableColors: [...new Set([...(item.availableColors || []), ...String(item.color || "").split(",")].map(value => value.trim()).filter(Boolean))] });
        continue;
      }
      const newest = String(item.updatedAt || "") > String(current.updatedAt || "") ? item : current;
      grouped.set(key, {
        ...current,
        ...newest,
        featured: Boolean(current.featured || item.featured),
        salesCount: Math.max(Number(current.salesCount || 0), Number(item.salesCount || 0)),
        stockQuantity: current.catalogOnly && item.catalogOnly ? 1 : Number(current.stockQuantity || 1) + 1,
        variantCodes: [...new Set([...(current.variantCodes || [current.code]), item.code])],
        variants: [...current.variants, unitVariant(item)],
        availableColors: [...new Set([...(current.availableColors || []), ...(item.availableColors || []), ...String(item.color || "").split(",")].map(value => value.trim()).filter(Boolean))],
        imageUrls: [...new Set([...(current.imageUrls || []), ...(item.imageUrls || [])])],
      });
    }
    const variants = [...grouped.values()];
    const availableBases = new Set(variants.filter(item => item.availability !== "unavailable").map(item => item.variantBaseKey));
    for (const unavailable of variants.filter(item => item.availability === "unavailable" && availableBases.has(item.variantBaseKey))) {
      const available = variants.find(item => item.availability !== "unavailable" && item.variantBaseKey === unavailable.variantBaseKey);
      if (available) available.variantCodes = [...new Set([...(available.variantCodes || [available.code]), ...(unavailable.variantCodes || [unavailable.code])])];
    }
    return variants
      .filter(item => item.availability !== "unavailable" || !availableBases.has(item.variantBaseKey))
      .map(item => {
        return { ...item, color: item.availableColors.join(", ") || item.color };
      });
  };
  const populateMemoryFilters = () => {
    const values = key => [...new Set(catalog.items.map(item => String(item[key] || "").trim()).filter(value => value && (key !== "ram" || capacityNumber(value) > 0)))]
      .sort((a,b) => (Number(a.replace(/\D/g,"")) || 0) - (Number(b.replace(/\D/g,"")) || 0) || a.localeCompare(b,"pt-BR"));
    const fill = (node, key, placeholder) => {
      const selected = node.value;
      const options = values(key);
      node.innerHTML = `<option value="">${placeholder}</option>${options.map(value => `<option value="${esc(value)}">${esc(formatCapacity(value))}</option>`).join("")}`;
      node.value = options.includes(selected) ? selected : "";
    };
    fill(storageNode,"storage","Todo armazenamento");
    fill(ramNode,"ram","Toda memória RAM");
  };
  const offerPercent = item => item.discountPriceCents && Number(item.priceCents) > Number(item.discountPriceCents) ? Math.round((1 - Number(item.discountPriceCents) / Number(item.priceCents)) * 100) : 0;
  const slug = value => String(value || "aparelho").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "aparelho";
  const productRouteKey = item => `${slug(item.title)}--${String(item.code || "item").slice(-6).toLowerCase()}`;
  const catalogShareUrl = item => /^[A-Za-z0-9_-]{12}$/.test(String(catalog?.storeCode || "")) && (!item || /^[A-Za-z0-9_-]{10}$/.test(String(item.code || "")))
    ? `${API}/share/${catalog.storeCode}${item ? `/${item.code}` : ""}`
    : location.href;
  const availabilityLabel = item => item.availability === "order" ? "Sob encomenda" : item.availability === "unavailable" ? "Indisponível" : item.catalogOnly ? "Disponível em estoque" : "Pronta entrega";
  const availabilityIcon = item => item.availability === "order" ? "🚚" : item.availability === "unavailable" ? "•" : "✓";
  const shareContent = (title, text, url) => ({ title, text, url });
  const copyShare = async (title, text, url) => navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
  const demoCatalog = {
    storeCode: "mostruario", storeName: "Mostruário Assistência Simplificada", storePhone: "", primaryColor: "#176bb5", logoUrl: "/v/demo-logo.svg", updatedAt: new Date().toISOString(),
    items: [
      { code: "demo-iphone", title: "Apple iPhone 15", description: "Exemplo de anúncio com fotos, condição, pagamento e disponibilidade.", brand: "Apple", model: "iPhone 15", deviceType: "Celular", purchaseKind: "Novo", condition: "Novo", color: "Preto", storage: "128", ram: "6", batteryHealth: "100", warranty: "90 dias", priceCents: 399900, discountPriceCents: 379900, conditionDetails: "Exemplo de descrição do aparelho.", includedItems: "Caixa e cabo", acceptedPaymentMethods: ["Pix", "Cartão de crédito"], cashDiscountBasisPoints: 500, cashDiscountMethods: ["Pix"], cashPriceCents: 360905, paymentMachineName: "Padrão", interestFreeInstallments: 10, maxInstallments: 12, availability: "ready", orderLeadTime: "", specsUrl: "https://www.apple.com/br/iphone-15/specs/", interestInstallment: null, featured: true, salesCount: 12, imageUrls: ["/v/demo-iphone.svg"], updatedAt: "2026-09-16T12:00:00.000Z" },
      { code: "demo-samsung", title: "Samsung Galaxy A55", description: "Modelo ilustrativo para mostrar como o catálogo apresenta um aparelho.", brand: "Samsung", model: "Galaxy A55", deviceType: "Celular", purchaseKind: "Novo", condition: "Novo", color: "Azul", storage: "256", ram: "8", batteryHealth: "100", warranty: "12 meses", priceCents: 229900, discountPriceCents: null, conditionDetails: "Exemplo de descrição do aparelho.", includedItems: "Caixa, cabo e nota", acceptedPaymentMethods: ["Pix", "Dinheiro", "Cartão de crédito"], cashDiscountBasisPoints: 0, cashDiscountMethods: [], cashPriceCents: 229900, paymentMachineName: "Padrão", interestFreeInstallments: 10, maxInstallments: 12, availability: "order", orderLeadTime: "Consulte o prazo com a loja", specsUrl: "https://www.samsung.com/br/smartphones/galaxy-a/galaxy-a55-5g/", interestInstallment: null, featured: false, salesCount: 5, imageUrls: ["/v/demo-samsung.svg"], updatedAt: "2026-09-15T12:00:00.000Z" },
      { code: "demo-motorola", title: "Motorola Edge 50", description: "Mostruário de vitrine com condição, memória e forma de pagamento.", brand: "Motorola", model: "Edge 50", deviceType: "Celular", purchaseKind: "Usado", condition: "Seminovo", color: "Verde", storage: "256", ram: "8", batteryHealth: "94", warranty: "30 dias", priceCents: 189900, discountPriceCents: 174900, conditionDetails: "Exemplo de detalhes do estado.", includedItems: "Aparelho e cabo", acceptedPaymentMethods: ["Pix", "Cartão de crédito"], cashDiscountBasisPoints: 300, cashDiscountMethods: ["Pix"], cashPriceCents: 169653, paymentMachineName: "Padrão", interestFreeInstallments: 6, maxInstallments: 10, availability: "ready", orderLeadTime: "", specsUrl: "https://www.motorola.com.br/", interestInstallment: null, featured: false, salesCount: 3, imageUrls: ["/v/demo-motorola.svg"], updatedAt: "2026-09-14T12:00:00.000Z" },
    ],
  };
  const factIcons = { "Condição":"📱", "Armazenamento":"💾", "Cor":"🎨", "Garantia":"🛡️", "Bateria":"🔋", "Memória RAM":"🧠", "Itens inclusos":"📦", "Detalhes do estado":"🔎" };  const helperQuestions = [
    ["ram", "O que é memória RAM?"], ["storage", "Quanto cabe neste aparelho?"], ["battery", "Como está a bateria?"],
    ["condition", "Ele é novo ou seminovo?"], ["warranty", "Como funciona a garantia?"], ["availability", "Posso retirar agora?"],
    ["payjoy", "Como funciona a PayJoy?"], ["installments", "Quais são as formas de pagamento?"], ["included", "O que acompanha o aparelho?"], ["choice", "Este aparelho é bom para mim?"],
    ["difference", "RAM e espaço são a mesma coisa?"], ["whatsapp", "Serve para WhatsApp e videochamada?"], ["chip", "Aceita chip de operadora?"],
    ["network", "Tem 5G?"], ["camera", "Como é a câmera?"], ["batteryLife", "Quanto dura a bateria?"], ["charger", "Vem com carregador?"],
    ["transfer", "Consigo passar meus dados do antigo?"], ["banking", "Posso usar aplicativo de banco?"], ["updates", "Receberá atualizações?"],
    ["internet", "Precisa de internet para funcionar?"], ["screen", "Como saber o tamanho da tela?"], ["accessibility", "Posso aumentar as letras?"]
  ];
  const helperAnswer = (item, key) => {
    const ram = item.ram ? formatCapacity(item.ram) : "não informada";
    const storage = item.storage ? formatCapacity(item.storage) : "não informado";
    const battery = item.batteryHealth ? formatBattery(item.batteryHealth) : "não informada";
    const warranty = item.warranty || "consulte a loja";
    const answers = {
      ram: `A memória RAM ajuda o aparelho a manter aplicativos abertos e trocar entre eles. Este modelo tem ${ram}. Para mensagens, vídeos e tarefas do dia a dia, mais RAM costuma deixar o uso mais confortável.`,
      storage: `O armazenamento é o espaço para fotos, vídeos, aplicativos e arquivos. Este aparelho tem ${storage}. Se você guarda muitas fotos e vídeos, prefira mais espaço ou confirme se o modelo aceita cartão de memória.`,
      battery: `A bateria informada para este aparelho é ${battery}. Em um aparelho seminovo, a duração real depende do uso, do brilho da tela, do sinal e dos aplicativos. A loja pode orientar sobre os testes feitos.`,
      condition: item.purchaseKind === "Usado" ? `Este anúncio é de um aparelho seminovo. A loja informa o estado e os detalhes de conservação no anúncio. Confira a descrição e, se possível, veja o aparelho antes de comprar.` : `Este anúncio é de um aparelho novo. Confirme com a loja se a embalagem, a nota e os acessórios estão disponíveis.`,
      warranty: `A garantia informada para este aparelho é de ${warranty}. Leia as condições da loja no comprovante e guarde o documento da compra.`,
      availability: item.availability === "order" ? `Este aparelho é sob encomenda. O prazo informado é ${item.orderLeadTime || "a confirmar com a loja"}. A loja confirma a disponibilidade antes de fechar a compra.` : item.availability === "ready" ? "Este aparelho está indicado como pronta entrega. Confirme a disponibilidade com a loja antes de sair de casa." : "Este anúncio não está disponível no momento.",
      payjoy: item.purchaseKind === "Novo" && item.payJoyEnabled !== false ? "A PayJoy permite consultar parcelamento no boleto para aparelhos novos. As condições dependem da análise e devem ser confirmadas diretamente com a loja." : "A mensagem da PayJoy não está disponível para este anúncio. Pergunte à loja sobre as formas de pagamento aceitas.",
      installments: `A vitrine mostra o preço à vista e as opções de cartão quando informadas. ${item.acceptedPaymentMethods?.length ? `Formas aceitas: ${item.acceptedPaymentMethods.join(", ")}.` : "Confirme as formas aceitas com a loja."} Parcelas com juros podem ter valor final diferente.`,
      included: item.includedItems ? `O anúncio informa que acompanham: ${item.includedItems}. Confirme os itens no momento da compra.` : "Os itens que acompanham não foram informados. Pergunte à loja antes de comprar.",
      choice: `Este aparelho é ${displayCondition(item.purchaseKind).toLocaleLowerCase("pt-BR")}, tem ${ram} de RAM e ${storage} de armazenamento. Ele pode ser uma boa opção se essas características atendem ao seu uso. A loja pode ajudar a comparar com outros modelos.`,
      difference: `RAM e armazenamento são diferentes: a RAM ajuda a manter aplicativos funcionando; os ${storage} de armazenamento guardam fotos, vídeos e aplicativos. A RAM informada neste anúncio é ${ram}.`,
      whatsapp: "Em celulares compatíveis, WhatsApp e videochamadas dependem de internet e da versão do aplicativo. Confirme com a loja o sistema e a compatibilidade deste modelo antes de comprar.",
      chip: "A entrada para chip depende da versão do aparelho. Tablets e computadores também podem funcionar somente por Wi-Fi. Peça à loja para confirmar a versão anunciada.",
      network: "O anúncio não confirma se esta unidade aceita 5G. Para usar 5G, aparelho, chip, plano e cobertura da operadora precisam ser compatíveis. Confirme o modelo exato com a loja.",
      camera: "A qualidade da câmera depende da iluminação, do processamento e do estado do aparelho. Este anúncio não informa uma avaliação técnica da câmera; peça uma demonstração ou fotos feitas com ele.",
      batteryLife: `A duração exata varia conforme brilho, sinal, vídeos e aplicativos. ${item.batteryHealth ? `A saúde informada da bateria é ${battery}.` : "A saúde da bateria não foi informada."} Pergunte à loja sobre o teste de autonomia.`,
      charger: item.includedItems ? `O anúncio informa: ${item.includedItems}. Se o carregador não estiver citado, confirme com a loja antes da compra.` : "Os acessórios não foram informados. Confirme com a loja se acompanha carregador e cabo.",
      transfer: "Fotos, contatos e conversas podem ser transferidos em muitos casos, conforme o aparelho antigo, as contas e os backups disponíveis. Peça à loja para orientar o procedimento antes de apagar o aparelho antigo.",
      banking: "Aplicativos de banco dependem de sistema compatível, atualizações e requisitos do próprio banco. Confirme a versão do sistema deste aparelho e consulte seu banco antes de comprar.",
      updates: "O anúncio não informa por quanto tempo o fabricante fornecerá atualizações. Peça à loja a versão do sistema e consulte o suporte oficial do fabricante para este modelo.",
      internet: "Chamadas comuns podem usar a rede da operadora, quando o aparelho tem chip. WhatsApp, vídeos, mapas e atualizações normalmente precisam de Wi-Fi ou dados móveis.",
      screen: "O tamanho da tela não foi informado neste anúncio. A loja pode mostrar o aparelho ou confirmar as medidas do modelo para você comparar com o que usa hoje.",
      accessibility: "A maioria dos aparelhos permite aumentar letras, usar zoom e ajustar contraste nas configurações. Os recursos exatos dependem do sistema; peça uma demonstração à loja."
    };
    return answers[key] || "Pergunte à loja para confirmar esta informação.";
  };
  const closeDeviceHelper = () => document.querySelector(".device-helper-modal")?.remove();
  const openDeviceHelper = item => {
    closeDeviceHelper();
    const modal = document.createElement("div"); modal.className = "device-helper-modal"; modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-label", `Ajuda sobre ${item.title}`);
    modal.innerHTML = `<section class="device-helper-card"><header><div><small>AJUDA RÁPIDA</small><h2>Assistente da vitrine</h2><p>Respostas automáticas sobre <strong>${esc(item.title)}</strong>, usando as informações deste anúncio.</p></div><button type="button" data-helper-close aria-label="Fechar ajuda">×</button></header><div class="device-helper-questions">${helperQuestions.map(([key,label]) => `<button type="button" data-helper-question="${key}">${label}</button>`).join("")}</div><div class="device-helper-answer" aria-live="polite"><strong>Escolha uma dúvida acima</strong><p>Você verá uma explicação curta e fácil de entender.</p></div><small class="device-helper-note">Esta ajuda é automática. Para confirmar preço, prazo, estoque ou condições, fale com a loja.</small></section>`;
    const answer = modal.querySelector(".device-helper-answer");
    modal.querySelectorAll("[data-helper-question]").forEach(button => button.addEventListener("click", () => { modal.querySelectorAll("[data-helper-question]").forEach(entry => entry.classList.toggle("active", entry === button)); answer.innerHTML = `<strong>${esc(button.textContent)}</strong><p>${esc(helperAnswer(item, button.dataset.helperQuestion))}</p>`; answer.scrollIntoView({ behavior: "smooth", block: "center" }); }));
    modal.querySelector("[data-helper-close]").addEventListener("click", closeDeviceHelper); modal.addEventListener("click", event => { if (event.target === modal) closeDeviceHelper(); }); document.body.append(modal); modal.querySelector("[data-helper-close]").focus();
  };
  function applyStoreBranding() {
    const primary = /^#[0-9a-f]{6}$/i.test(catalog.primaryColor || "") ? catalog.primaryColor : "#E1BD00";
    const [red,green,blue] = rgb(primary).map(value => value / 255);
    const luminance = .2126 * red + .7152 * green + .0722 * blue;
    const root = document.documentElement.style;
    root.setProperty("--store-primary",primary); root.setProperty("--store-contrast",luminance > .48 ? "#111418" : "#ffffff");
    const logo = document.querySelector("#store-logo");
    logo.src = catalog.logoUrl ? imageUrl(catalog.logoUrl) : "/favicon.svg"; logo.alt = `Logo de ${catalog.storeName}`; logo.onerror = () => { logo.onerror = null; logo.src = "/favicon.svg"; };
  }
  const paymentMethods = item => (Array.isArray(item.acceptedPaymentMethods) ? item.acceptedPaymentMethods : []).join(" • ");
  const installmentOptions = item => {
    const base = salePrice(item);
    const free = Math.max(1, Math.min(24, Number(item.interestFreeInstallments || 1)));
    const withoutInterest = Array.from({ length:free }, (_, index) => ({ installments:index + 1, totalCents:base, installmentCents:Math.ceil(base / (index + 1)), rateBasisPoints:0 }));
    const withInterest = (Array.isArray(item.interestInstallments) ? item.interestInstallments : item.interestInstallment ? [item.interestInstallment] : [])
      .filter(option => Number.isInteger(option.installments) && option.installments > free && option.installments <= 24 && Number.isInteger(option.totalCents) && option.totalCents >= base && Number.isInteger(option.installmentCents) && option.installmentCents > 0);
    return [...withoutInterest, ...withInterest].sort((a,b) => a.installments-b.installments);
  };
  const cardPaymentHtml = item => {
    const base = salePrice(item);
    const cashOffer = Number(item.cashDiscountBasisPoints || 0) > 0;
    const free = Math.max(1, Number(item.interestFreeInstallments || 1));
    return `${item.discountPriceCents || cashOffer ? `<div class="offer-heading"><small class="previous-price">${money(item.priceCents)}</small>${offerPercent(item) ? `<span class="offer-badge">-${offerPercent(item)}%</span>` : ""}</div>` : ""}<div class="price">${money(cashPrice(item))}</div>${cashOffer ? `<strong class="cash-offer">✨ ${percent(item.cashDiscountBasisPoints)} OFF no ${esc((item.cashDiscountMethods || []).join(" e ") || "pagamento à vista")}</strong>` : ""}<span class="card-price">💳 ${money(base)} no cartão</span><span class="installment-line">Até ${free}x de ${money(Math.ceil(base/free))} sem juros</span>${item.interestInstallment ? `<span class="installment-line muted">Ou ${item.interestInstallment.installments}x de ${money(item.interestInstallment.installmentCents)} com juros</span>` : ""}${paymentMethods(item) ? `<small class="payment-methods">${esc(paymentMethods(item))}</small>` : ""}`;
  };
  const card = item => `<article class="card ${item.featured ? "featured" : ""} ${item.availability === "unavailable" ? "unavailable" : ""}" data-code="${esc(item.code)}" tabindex="0"><div class="picture"><img loading="lazy" src="${imageUrl(item.imageUrls[0])}" alt="${esc(item.title)}"></div><div class="content"><div class="tags"><span>📱 ${esc(displayCondition(item.purchaseKind))}</span><span class="availability-tag ${item.availability === "order" ? "order" : item.availability === "unavailable" ? "unavailable" : "ready"}">${availabilityIcon(item)} ${availabilityLabel(item)}</span>${item.storage ? `<span>💾 ${esc(formatCapacity(item.storage))}</span>` : ""}${item.availability !== "unavailable" && Number(item.stockQuantity || 1) > 1 ? `<span>📦 ${item.stockQuantity} unidades</span>` : ""}${item.batteryHealth ? `<span>🔋 ${esc(formatBattery(item.batteryHealth))}</span>` : ""}</div><h2>${esc(item.title)}</h2><p>${item.color ? `🎨 ${esc(item.color)}` : ""}${item.color && item.condition && item.condition !== item.purchaseKind ? " • " : ""}${item.condition && item.condition !== item.purchaseKind ? esc(item.condition) : ""}</p>${item.availability === "order" ? `<small class="order-lead">🚚 Prazo: ${esc(item.orderLeadTime || "consulte a loja")}</small>` : ""}<div class="card-payment">${cardPaymentHtml(item)}</div></div></article>`;
  function renderBestSeller() {
    const item = catalog.items.filter(entry => entry.availability !== "unavailable").sort((a,b) => Number(b.featured)-Number(a.featured) || Number(b.salesCount || 0)-Number(a.salesCount || 0))[0];
    if (!item) { bestSellerNode.hidden = true; return; }
    const hasSales = Number(item.salesCount || 0) > 0;
    bestSellerNode.hidden = false;
    bestSellerNode.innerHTML = `<div class="best-thumb"><img src="${imageUrl(item.imageUrls[0])}" alt=""></div><div class="best-copy"><small>${hasSales ? "MAIS VENDIDO DA LOJA" : "DESTAQUE DA LOJA"}</small><strong>${esc(item.title)}</strong><span>${item.availability === "order" ? "🚚" : "✓"} ${availabilityLabel(item)} • 📱 ${esc(displayCondition(item.purchaseKind))}${item.storage ? ` • 💾 ${esc(formatCapacity(item.storage))}` : ""}${item.color ? ` • 🎨 ${esc(item.color)}` : ""}</span></div><div class="best-price"><small>A partir de</small><strong>${money(cashPrice(item))}</strong></div><button type="button" data-code="${esc(item.code)}">Ver aparelho</button>`;
    bestSellerNode.querySelector("button").addEventListener("click", () => { location.hash = `${catalog.storeCode}/${productRouteKey(item)}`; render(); });
  }
  const bindCards = () => document.querySelectorAll(".card").forEach(node => {
    const open = () => { const item = catalog.items.find(entry => entry.code === node.dataset.code); if (item) location.hash = `${catalog.storeCode}/${productRouteKey(item)}`; render(); };
    node.addEventListener("click", open); node.addEventListener("keydown", event => { if (event.key === "Enter") open(); });
  });
  function filtered() {
    const query = searchNode.value.trim().toLocaleLowerCase("pt-BR");
    const items = catalog.items.filter(item => (!kindNode.value || item.purchaseKind === kindNode.value) && (!availabilityNode.value || item.availability === availabilityNode.value) && (!storageNode.value || String(item.storage) === storageNode.value) && (!ramNode.value || String(item.ram) === ramNode.value) && (!query || [item.title,item.brand,item.model,item.storage,item.ram,item.color].join(" ").toLocaleLowerCase("pt-BR").includes(query)));
    const availabilityRank = item => item.availability === "ready" ? 0 : item.availability === "order" ? 1 : 2;
    return items.sort((a,b) => sortNode.value === "lowest" ? salePrice(a)-salePrice(b) : sortNode.value === "highest" ? salePrice(b)-salePrice(a) : sortNode.value === "ram" ? (capacityNumber(b.ram)-capacityNumber(a.ram) || capacityNumber(b.storage)-capacityNumber(a.storage) || availabilityRank(a)-availabilityRank(b)) : sortNode.value === "recent" ? b.updatedAt.localeCompare(a.updatedAt) : Number(b.featured)-Number(a.featured) || availabilityRank(a)-availabilityRank(b) || Number(b.salesCount || 0)-Number(a.salesCount || 0) || b.updatedAt.localeCompare(a.updatedAt));
  }
  function renderList() {
    closePhotoViewer();
    detailNode.hidden = true; document.body.classList.remove("detail-open"); catalogNode.hidden = false; bestSellerNode.hidden = !catalog.items.length; document.querySelector(".toolbar").hidden = false;
    const items = filtered(); const availableCount = items.filter(item => item.availability !== "unavailable").reduce((sum,item) => sum + Number(item.stockQuantity || 1), 0); const unavailableCount = items.filter(item => item.availability === "unavailable").length; statusNode.textContent = `${availableCount} aparelho${availableCount === 1 ? "" : "s"} ${availableCount === 1 ? "disponível" : "disponíveis"}${unavailableCount ? ` · ${unavailableCount} ${unavailableCount === 1 ? "indisponível" : "indisponíveis"}` : ""}`;
    const newItems = items.filter(item => item.purchaseKind !== "Usado");
    const usedItems = items.filter(item => item.purchaseKind === "Usado");
    catalogNode.innerHTML = items.length
      ? `${newItems.length ? '<h2 class="catalog-group-title">Aparelhos novos</h2>' : ""}${newItems.map(card).join("")}${usedItems.length ? '<h2 class="catalog-group-title">Aparelhos seminovos</h2>' : ""}${usedItems.map(card).join("")}`
      : '<div class="empty"><h2>Nenhum aparelho encontrado</h2><p>Tente outra busca ou fale com a loja.</p></div>';
    catalogNode.querySelectorAll(".card").forEach(node => {
      const item = items.find(entry => entry.code === node.dataset.code);
      if (item?.purchaseKind === "Novo" && item.payJoyEnabled !== false) node.querySelector(".card-payment")?.insertAdjacentHTML("beforeend", '<small class="payjo-card-note">🧾 Boleto parcelado via PayJoy · consulte condições</small>');
    });
    bindCards();
  }
  const updateMobileFilterState = () => mobileFilterNodes.forEach(button => button.classList.toggle("active", button.dataset.kind === kindNode.value && button.dataset.availability === availabilityNode.value));
  function closeDetail() {
    closePhotoViewer();
    location.hash = catalog.storeCode;
  }
  function renderDetail(item) {
    detailNode.hidden = false; document.body.classList.add("detail-open");
    const variants = (item.variants || []).filter(variant => variant.imageUrls?.length);
    let selectedVariant = variants[0] || null;
    const phone = String(catalog.storePhone || "").replace(/\D/g, "");
    const whatsappUrl = color => phone ? `https://wa.me/${phone.startsWith("55") ? phone : `55${phone}`}?text=${encodeURIComponent(`Olá! Quero adquirir o aparelho ${item.title}${color ? ` na cor ${color}` : ""}, anunciado por ${money(cashPrice(item))}. ${item.availability === "order" ? "Qual é o prazo para encomenda?" : item.catalogOnly ? "Pode confirmar se há unidade pronta para entrega?" : "Ele ainda está disponível para pronta entrega?"}`)}` : "";
    const wa = whatsappUrl(selectedVariant?.color || "");
    const facts = [["Condição",displayCondition(item.purchaseKind)],["Armazenamento",formatCapacity(item.storage)],["Cor",item.color],["Garantia",item.warranty],["Bateria",formatBattery(item.batteryHealth)],["Memória RAM",formatCapacity(item.ram)],["Itens inclusos",item.includedItems],["Detalhes do estado",item.conditionDetails]].filter(([,value]) => value);
    const images = (selectedVariant?.imageUrls?.length ? selectedVariant.imageUrls : item.imageUrls || []).filter(Boolean);
    const free = Math.max(1, Number(item.interestFreeInstallments || 1));
    const base = salePrice(item);
    const purchaseInfo = `<section class="purchase-info"><h2>Compra e disponibilidade</h2><div><span class="purchase-icon">${availabilityIcon(item)}</span><p><strong>${availabilityLabel(item)}</strong><small>${item.availability === "order" ? esc(item.orderLeadTime || "Consulte a loja para confirmar o prazo") : item.availability === "unavailable" ? "Este anúncio foi vendido ou retirado recentemente." : "Disponível para retirada ou envio após confirmação da loja"}</small></p></div>${item.warranty ? `<div><span class="purchase-icon">🛡️</span><p><strong>Garantia</strong><small>${esc(item.warranty)}</small></p></div>` : ""}${item.specsUrl ? `<a href="${esc(item.specsUrl)}" target="_blank" rel="noopener"><span class="purchase-icon">📋</span><p><strong>Ficha técnica oficial</strong><small>Consulte especificações completas do fabricante</small></p><b>↗</b></a>` : ""}</section>`;
    detailNode.innerHTML = `<div class="detail-shell" role="document"><button class="detail-close" type="button" aria-label="Fechar detalhes">×</button><div class="detail-layout"><div class="detail-gallery"><div class="picture zoomable"><img src="${imageUrl(images[0])}" alt="${esc(item.title)}"><span class="zoom-hint">Passe o mouse ou use dois dedos para ampliar</span><div class="zoom-controls" aria-label="Controles de zoom"><button type="button" data-zoom="out" aria-label="Diminuir foto">−</button><output aria-live="polite">100%</output><button type="button" data-zoom="in" aria-label="Ampliar foto">+</button></div></div>${images.length ? `<div class="thumbnails" role="group" aria-label="Fotos do aparelho">${images.map((source,index) => `<button type="button" class="${index === 0 ? "selected" : ""}" data-image="${esc(imageUrl(source))}" aria-label="Ver foto ${index + 1}"><img src="${imageUrl(source)}" alt=""></button>`).join("")}</div>` : ""}${purchaseInfo}</div><div class="detail-copy"><div class="tags"><span>${esc(item.purchaseKind)}</span><span class="availability-tag ${item.availability === "order" ? "order" : item.availability === "unavailable" ? "unavailable" : "ready"}">${availabilityIcon(item)} ${availabilityLabel(item)}</span>${item.featured && item.availability !== "unavailable" ? '<span class="featured-tag">Destaque</span>' : ""}${item.discountPriceCents ? '<span>Oferta</span>' : ""}</div><h1>${esc(item.title)}</h1><div class="detail-pricebox"><small>Preço à vista</small>${item.discountPriceCents || item.cashDiscountBasisPoints ? `<small class="previous-price">${money(item.priceCents)}</small>` : ""}<div class="price">${money(cashPrice(item))}</div>${item.cashDiscountBasisPoints ? `<strong class="cash-offer">${percent(item.cashDiscountBasisPoints)} OFF no ${esc((item.cashDiscountMethods || []).join(" e ") || "pagamento à vista")}</strong>` : ""}<span>${money(base)} no cartão</span><b>Até ${free}x de ${money(Math.ceil(base/free))} sem juros</b>${item.interestInstallment ? `<span>Ou ${item.interestInstallment.installments}x de ${money(item.interestInstallment.installmentCents)} com juros</span>` : ""}</div>${paymentMethods(item) ? `<section class="payment-box"><small>FORMAS DE PAGAMENTO ACEITAS</small><div>${item.acceptedPaymentMethods.map(method => `<span>${esc(method)}</span>`).join("")}</div>${item.paymentMachineName ? `<p>Condições calculadas pela maquininha ${esc(item.paymentMachineName)}.</p>` : ""}</section>` : ""}<p class="description">${esc(item.description || "Consulte a loja para mais informações.")}</p><div class="facts">${facts.map(([label,value]) => `<div><small>${label}</small><strong>${esc(value)}</strong></div>`).join("")}</div>${wa && item.availability !== "unavailable" ? `<a class="contact" href="${wa}" target="_blank" rel="noopener">Quero adquirir pelo WhatsApp</a>` : item.availability === "unavailable" ? '<p class="contact-unavailable">Este aparelho não está mais disponível. Consulte a loja sobre modelos semelhantes.</p>' : '<p class="contact-unavailable">A loja ainda não informou um WhatsApp para contato.</p>'}<button class="device-helper-trigger" type="button">💬 Tirar dúvidas sobre este aparelho</button><button class="share-product" type="button">Compartilhar este aparelho</button></div></div></div>`;
    if (variants.length > 1) {
      detailNode.querySelector(".detail-gallery .picture").insertAdjacentHTML("beforebegin", `<section class="variant-picker" aria-label="Fotos das unidades"><strong>${variants.every(variant => variant.color) ? "Escolha a cor para ver as fotos" : "Compare as fotos das unidades"}</strong><div>${variants.map((variant, index) => `<button type="button" data-variant="${esc(variant.code)}" aria-pressed="${variant === selectedVariant}">${esc(variant.color || `Fotos ${index + 1}`)}</button>`).join("")}</div></section>`);
    }
    if (item.catalogOnly) detailNode.querySelector(".purchase-info > div small").textContent = "Consulte a loja para confirmar o estoque atual e a cor desejada.";
    if (item.availability === "unavailable") {
      detailNode.querySelector(".detail-shell").classList.add("unavailable");
    }
    if (item.purchaseKind === "Novo" && item.payJoyEnabled !== false) {
      const anchor = detailNode.querySelector(".payment-box") || detailNode.querySelector(".detail-pricebox");
      anchor.insertAdjacentHTML("afterend", '<section class="payjo-box"><strong>🧾 Parcelamento no boleto via PayJoy</strong><span>Disponível para aparelhos novos. Consulte prazos e condições diretamente com a loja.</span></section>');
    }
    const terms = item.acceptedPaymentMethods?.includes("Cartão de crédito") ? installmentOptions(item) : [];
    if (terms.length > 1) {
      const selection = `<section class="installment-picker"><label for="installment-count">Simule as parcelas no cartão</label><select id="installment-count" aria-label="Número de parcelas">${terms.map(term => `<option value="${term.installments}">${term.installments}x ${term.rateBasisPoints ? "com juros" : "sem juros"}</option>`).join("")}</select><output aria-live="polite"></output></section>`;
      detailNode.querySelector(".detail-pricebox").insertAdjacentHTML("afterend", selection);
      const picker = detailNode.querySelector(".installment-picker");
      const count = picker.querySelector("select");
      const result = picker.querySelector("output");
      const update = () => {
        const term = terms.find(entry => entry.installments === Number(count.value)) || terms[0];
        result.textContent = `${term.installments}x de ${money(term.installmentCents)} ${term.rateBasisPoints ? "com juros" : "sem juros"} · Total ${money(term.totalCents)}`;
      };
      count.value = String(terms.at(-1).installments);
      count.addEventListener("change", update);
      update();
    }
    const detailTags = detailNode.querySelector(".detail-copy .tags");
    detailTags.querySelector("span").textContent = `📱 ${displayCondition(item.purchaseKind)}`;
    if (item.storage) detailTags.insertAdjacentHTML("beforeend", `<span>💾 ${esc(formatCapacity(item.storage))}</span>`);
    if (item.ram) detailTags.insertAdjacentHTML("beforeend", `<span>🧠 RAM ${esc(formatCapacity(item.ram))}</span>`);
    detailNode.querySelectorAll(".facts div").forEach(fact => {
      const label = fact.querySelector("small");
      const name = label.textContent;
      label.textContent = `${factIcons[name] || "ℹ️"} ${name}`;
      if (name === "Bateria" || name === "Garantia") fact.classList.add("key-fact");
    });
    const previousPrice = detailNode.querySelector(".detail-pricebox .previous-price");
    if (previousPrice && offerPercent(item)) previousPrice.insertAdjacentHTML("afterend", `<span class="offer-badge">-${offerPercent(item)}%</span>`);
    detailNode.querySelectorAll(".payment-box > div > span").forEach(method => {
      method.textContent = `${/cartão/i.test(method.textContent) ? "💳" : /dinheiro/i.test(method.textContent) ? "💵" : /pix/i.test(method.textContent) ? "⚡" : "✓"} ${method.textContent}`;
    });
    detailNode.setAttribute("role", "dialog"); detailNode.setAttribute("aria-modal", "true"); detailNode.setAttribute("aria-label", `Detalhes de ${item.title}`);
    const closeButton = detailNode.querySelector(".detail-close");
    closeButton.addEventListener("click", closeDetail); closeButton.focus();
    const mainImage = detailNode.querySelector(".detail-gallery .picture img");
    const zoom = detailNode.querySelector(".zoomable");
    zoom.querySelector(".zoom-hint").textContent = "Toque na foto para ampliar";
    const zoomOutput = zoom.querySelector("output");
    let zoomLevel = 1;
    let pinchStart = 0;
    let pinchBase = 1;
    let lastTap = 0;
    let panX = 0, panY = 0, panTouch = null, suppressViewerClickUntil = 0;
    const clampZoom = value => Math.min(3, Math.max(1, value));
    const applyZoom = (value, origin) => {
      zoomLevel = clampZoom(value);
      if (origin) mainImage.style.transformOrigin = origin;
      if (zoomLevel === 1) panX = panY = 0;
      const maxPanX = (zoomLevel - 1) * zoom.clientWidth / 2;
      const maxPanY = (zoomLevel - 1) * zoom.clientHeight / 2;
      panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
      panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
      mainImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
      zoom.classList.toggle("is-zoomed", zoomLevel > 1);
      zoomOutput.value = `${Math.round(zoomLevel * 100)}%`;
    };
    const resetZoom = () => applyZoom(1, "50% 50%");
    const thumbnails = detailNode.querySelector(".thumbnails");
    thumbnails?.addEventListener("click", event => {
      const button = event.target.closest("button[data-image]");
      if (!button) return;
      mainImage.src = button.dataset.image;
      resetZoom();
      thumbnails.querySelectorAll("button").forEach(entry => entry.classList.toggle("selected", entry === button));
    });
    detailNode.querySelectorAll(".variant-picker button").forEach(button => button.addEventListener("click", () => {
      selectedVariant = variants.find(variant => variant.code === button.dataset.variant) || selectedVariant;
      const photos = selectedVariant.imageUrls.filter(Boolean);
      mainImage.src = imageUrl(photos[0]);
      mainImage.alt = selectedVariant.color ? `${item.title} na cor ${selectedVariant.color}` : item.title;
      if (thumbnails) thumbnails.innerHTML = photos.map((source,index) => `<button type="button" class="${index === 0 ? "selected" : ""}" data-image="${esc(imageUrl(source))}" aria-label="Ver foto ${index + 1}${selectedVariant.color ? ` da cor ${esc(selectedVariant.color)}` : ""}"><img src="${imageUrl(source)}" alt=""></button>`).join("");
      detailNode.querySelectorAll(".variant-picker button").forEach(entry => entry.setAttribute("aria-pressed", String(entry === button)));
      const colorFact = [...detailNode.querySelectorAll(".facts div")].find(fact => fact.querySelector("small")?.textContent?.includes("Cor"));
      if (colorFact) colorFact.querySelector("strong").textContent = selectedVariant.color || item.color;
      const contact = detailNode.querySelector(".contact");
      if (contact) contact.href = whatsappUrl(selectedVariant.color);
      resetZoom();
    }));
    zoom.addEventListener("mousemove", event => { const box = zoom.getBoundingClientRect(); mainImage.style.transformOrigin = `${((event.clientX-box.left)/box.width)*100}% ${((event.clientY-box.top)/box.height)*100}%`; });
    zoom.querySelector('[data-zoom="in"]').addEventListener("click", event => { event.stopPropagation(); applyZoom(zoomLevel + .5); });
    zoom.querySelector('[data-zoom="out"]').addEventListener("click", event => { event.stopPropagation(); applyZoom(zoomLevel - .5); });
    zoom.addEventListener("dblclick", () => applyZoom(zoomLevel > 1 ? 1 : 2));
    zoom.addEventListener("touchstart", event => {
      if (event.touches.length === 2) {
        panTouch = null;
        lastTap = 0;
        pinchStart = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
        pinchBase = zoomLevel;
      } else if (event.touches.length === 1) {
        panTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        const now = Date.now();
        if (now - lastTap < 320) { applyZoom(zoomLevel > 1 ? 1 : 2); suppressViewerClickUntil = now + 500; }
        lastTap = now;
      }
    }, { passive:true });
    zoom.addEventListener("touchmove", event => {
      if (event.touches.length === 2 && pinchStart) {
        event.preventDefault();
        suppressViewerClickUntil = Date.now() + 500;
        const box = zoom.getBoundingClientRect();
        const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
        applyZoom(pinchBase * distance / pinchStart, `${((centerX-box.left)/box.width)*100}% ${((centerY-box.top)/box.height)*100}%`);
      } else if (event.touches.length === 1 && zoomLevel > 1 && panTouch) {
        event.preventDefault();
        suppressViewerClickUntil = Date.now() + 500;
        panX += event.touches[0].clientX - panTouch.x;
        panY += event.touches[0].clientY - panTouch.y;
        panTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        applyZoom(zoomLevel);
      }
    }, { passive:false });
    zoom.addEventListener("touchend", event => {
      if (event.touches.length < 2) pinchStart = 0;
      panTouch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    });
    const openPhotoViewer = () => {
      closePhotoViewer();
      let index = Math.max(0, images.findIndex(source => new URL(imageUrl(source), location.href).href === mainImage.src));
      let level = 1, panX = 0, panY = 0, pointerStart = null, pinchDistance = 0, pinchLevel = 1;
      const viewer = document.createElement("div");
      viewer.className = "photo-viewer";
      viewer.classList.toggle("single-photo", images.length < 2);
      viewer.setAttribute("role", "dialog");
      viewer.setAttribute("aria-modal", "true");
      viewer.setAttribute("aria-label", `Fotos de ${item.title}`);
      viewer.innerHTML = '<div class="photo-viewer-toolbar"><span class="photo-viewer-count" aria-live="polite"></span><button type="button" data-action="close" aria-label="Fechar foto">×</button></div><div class="photo-viewer-stage"><button type="button" data-action="previous" aria-label="Foto anterior">‹</button><img alt=""><button type="button" data-action="next" aria-label="Próxima foto">›</button></div><div class="photo-viewer-controls"><button type="button" data-action="out" aria-label="Diminuir foto ampliada">−</button><output aria-live="polite">100%</output><button type="button" data-action="in" aria-label="Ampliar foto ampliada">+</button></div>';
      const stage = viewer.querySelector(".photo-viewer-stage");
      const photo = stage.querySelector("img");
      const count = viewer.querySelector(".photo-viewer-count");
      const output = viewer.querySelector("output");
      const apply = () => {
        const maxPanX = Math.max(0, (level - 1) * stage.clientWidth / 2);
        const maxPanY = Math.max(0, (level - 1) * stage.clientHeight / 2);
        panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
        panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
        photo.style.transform = `translate(${panX}px, ${panY}px) scale(${level})`;
        output.value = `${Math.round(level * 100)}%`;
      };
      const setZoom = value => { level = Math.max(1, Math.min(4, value)); if (level === 1) panX = panY = 0; apply(); };
      const show = offset => {
        index = (index + offset + images.length) % images.length;
        photo.src = imageUrl(images[index]); photo.alt = `${item.title}, foto ${index + 1} de ${images.length}`;
        count.textContent = `${index + 1} de ${images.length}`;
        setZoom(1);
      };
      viewer.querySelector('[data-action="close"]').addEventListener("click", closePhotoViewer);
      viewer.querySelector('[data-action="previous"]').addEventListener("click", () => show(-1));
      viewer.querySelector('[data-action="next"]').addEventListener("click", () => show(1));
      viewer.querySelector('[data-action="out"]').addEventListener("click", () => setZoom(level - .5));
      viewer.querySelector('[data-action="in"]').addEventListener("click", () => setZoom(level + .5));
      viewer.addEventListener("click", event => { if (event.target === viewer) closePhotoViewer(); });
      stage.addEventListener("dblclick", event => { if (event.target === photo) setZoom(level > 1 ? 1 : 2); });
      stage.addEventListener("pointerdown", event => { if (event.target !== photo) return; pointerStart = { x: event.clientX, y: event.clientY, panX, panY }; photo.setPointerCapture(event.pointerId); });
      stage.addEventListener("pointermove", event => { if (!pointerStart || level === 1 || pinchDistance) return; panX = pointerStart.panX + event.clientX - pointerStart.x; panY = pointerStart.panY + event.clientY - pointerStart.y; apply(); });
      stage.addEventListener("pointerup", event => { if (!pointerStart) return; const dx = event.clientX - pointerStart.x; const dy = event.clientY - pointerStart.y; if (level === 1 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) show(dx < 0 ? 1 : -1); pointerStart = null; });
      stage.addEventListener("pointercancel", () => { pointerStart = null; });
      stage.addEventListener("touchstart", event => { if (event.touches.length === 2) { pinchDistance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY); pinchLevel = level; pointerStart = null; } }, { passive: true });
      stage.addEventListener("touchmove", event => { if (event.touches.length !== 2 || !pinchDistance) return; event.preventDefault(); const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY); setZoom(pinchLevel * distance / pinchDistance); }, { passive: false });
      stage.addEventListener("touchend", event => { if (event.touches.length < 2) pinchDistance = 0; });
      document.body.append(viewer);
      document.body.classList.add("photo-viewer-open");
      activePhotoViewer = viewer;
      show(0);
      viewer.querySelector('[data-action="close"]').focus();
    };
    zoom.addEventListener("click", event => { if (Date.now() >= suppressViewerClickUntil && !event.target.closest(".zoom-controls")) openPhotoViewer(); });
    detailNode.querySelector(".device-helper-trigger").addEventListener("click", () => openDeviceHelper(item));
    detailNode.querySelector(".share-product").addEventListener("click", async () => { const url = catalogShareUrl(item); const title = `${item.title} — Vitrine ${catalog.storeName}`; const text = `Confira este aparelho na vitrine de ${catalog.storeName}.`; try { if (navigator.share) await navigator.share(shareContent(title,text,url)); else await copyShare(title,text,url); } catch {} });
  }
  function render() {
    if (!catalog) return;
    document.querySelector("#ready-items").textContent = catalog.items.filter(entry => entry.availability === "ready").reduce((sum,item) => sum + Number(item.stockQuantity || 1), 0);
    const [, itemCode] = location.hash.slice(1).split("/");
    const item = itemCode && catalog.items.find(entry => entry.code === itemCode || entry.variantCodes?.includes(itemCode) || productRouteKey(entry) === itemCode);
    renderList();
    if (item) renderDetail(item);
  }
  async function load() {
    const [storeCode] = location.hash.slice(1).split("/");
    if (!storeCode || storeCode === demoCatalog.storeCode) {
      catalog = demoCatalog; populateMemoryFilters();
      applyStoreBranding(); document.querySelector("#store-name").textContent = catalog.storeName; document.querySelector("#store-subtitle").textContent = "Demonstração · dados ilustrativos"; document.querySelector("#total-items").textContent = catalog.items.length; document.querySelector("#ready-items").textContent = catalog.items.filter(item => item.availability !== "order").length; document.querySelector("#order-items").textContent = catalog.items.filter(item => item.availability === "order").length; document.querySelector("#used-items").textContent = catalog.items.filter(item => item.purchaseKind === "Usado").length; document.querySelector("#status").textContent = "Mostruário demonstrativo · dados ilustrativos"; document.querySelector("#catalog-mode").hidden = false; document.querySelector("#hero-description").textContent = "Conheça a experiência da vitrine pública. Os aparelhos abaixo são exemplos e não representam estoque real."; document.title = "Mostruário de vitrine — Assistência Simplificada"; renderBestSeller(); render(); return;
    }
    if (!/^[A-Za-z0-9_-]{12}$/.test(storeCode || "")) throw new Error("link_invalid");
    const response = await fetch(`${API}/public/${encodeURIComponent(storeCode)}?v=${Date.now()}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body.catalog) throw new Error("not_found");
    catalog = { ...body.catalog, items: mergeCatalogVariants(body.catalog.items.map(item => ({ ...item, warranty: displayWarranty(item) }))) };
    populateMemoryFilters();
    document.querySelector("#catalog-mode").hidden = true;
    document.querySelector("#store-subtitle").textContent = "Catálogo de aparelhos";
    document.querySelector("#hero-description").textContent = "Consulte os modelos disponíveis e chame nossa equipe para confirmar a compra.";
    applyStoreBranding();
    document.querySelector("#store-name").textContent = catalog.storeName;
    document.querySelector("#total-items").textContent = catalog.items.filter(item => item.availability !== "unavailable").reduce((sum,item) => sum + Number(item.stockQuantity || 1), 0);
    document.querySelector("#ready-items").textContent = catalog.items.filter(item => item.availability === "ready").reduce((sum,item) => sum + Number(item.stockQuantity || 1), 0);
    document.querySelector("#order-items").textContent = catalog.items.filter(item => item.availability === "order").reduce((sum,item) => sum + Number(item.stockQuantity || 1), 0);
    document.querySelector("#used-items").textContent = catalog.items.filter(item => item.purchaseKind === "Usado" && item.availability !== "unavailable").reduce((sum,item) => sum + Number(item.stockQuantity || 1), 0);
    document.title = `Vitrine — ${catalog.storeName}`;
    renderBestSeller();
    render();
  }
  const finishMobileSearch = () => { searchNode.value = mobileSearchNode.value; renderList(); mobileSearchNode.value = ""; mobileSearchNode.blur(); };
  const syncRamFilterVisibility = () => {
    ramNode.hidden = sortNode.value !== "ram";
    if (ramNode.hidden) ramNode.value = "";
  };
  syncRamFilterVisibility();
  searchNode.addEventListener("input", () => { mobileSearchNode.value = searchNode.value; renderList(); });
  mobileSearchNode.addEventListener("input", () => { searchNode.value = mobileSearchNode.value; renderList(); });
  mobileSearchSubmitNode?.addEventListener("click", finishMobileSearch);
  kindNode.addEventListener("change", () => { updateMobileFilterState(); renderList(); }); availabilityNode.addEventListener("change", () => { updateMobileFilterState(); renderList(); }); storageNode.addEventListener("change", renderList); ramNode.addEventListener("change", renderList);
  sortNode.addEventListener("change", () => { mobileSortNode.value = sortNode.value; syncRamFilterVisibility(); renderList(); }); mobileSortNode.addEventListener("change", () => { sortNode.value = mobileSortNode.value; syncRamFilterVisibility(); renderList(); });
  mobileFilterNodes.forEach(button => button.addEventListener("click", () => { kindNode.value = button.dataset.kind; availabilityNode.value = button.dataset.availability; updateMobileFilterState(); renderList(); }));
  let scrollFrame = 0; window.addEventListener("scroll", () => { if (scrollFrame) return; scrollFrame = requestAnimationFrame(() => { document.querySelector(".topbar").classList.toggle("is-condensed", scrollY > 90); scrollFrame = 0; }); }, { passive:true });
  window.addEventListener("hashchange", render);
  detailNode.addEventListener("click", event => { if (event.target === detailNode) closeDetail(); });
  document.addEventListener("keydown", event => {
    if (activePhotoViewer && event.key === "Escape") { closePhotoViewer(); return; }
    if (activePhotoViewer && event.key === "ArrowLeft") activePhotoViewer.querySelector('[data-action="previous"]').click();
    if (activePhotoViewer && event.key === "ArrowRight") activePhotoViewer.querySelector('[data-action="next"]').click();
    if (event.key === "Escape" && !detailNode.hidden) closeDetail();
  });
  document.querySelector("#share").addEventListener("click", async () => { const title = `Vitrine — ${catalog?.storeName || "Loja"}`; const text = `Confira os aparelhos disponíveis na vitrine de ${catalog?.storeName || "nossa loja"}.`; const url = catalogShareUrl(); try { if (navigator.share) await navigator.share(shareContent(title,text,url)); else await copyShare(title,text,url); } catch {} });
  load().catch(error => { statusNode.textContent = error.message === "link_invalid" ? "Este endereço de vitrine está incompleto." : "Esta vitrine não está disponível no momento."; catalogNode.innerHTML = '<div class="empty"><h2>Vitrine indisponível</h2><p>Peça à loja um novo endereço.</p></div>'; });
})();
