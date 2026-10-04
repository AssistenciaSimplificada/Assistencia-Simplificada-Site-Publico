/* Descoberta da vitrine. Os dados pessoais são enviados somente ao solicitar contato. */
(() => {
  "use strict";
  let context;
  let favorites = new Set();
  let compared = new Set();
  let onlyFavorites = false;
  let restored = false;
  let guideUse = "";
  let dialog;
  let returnFocus;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = cents => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(Number(cents || 0)/100);
  const price = item => Number((Number(item.cashDiscountBasisPoints || 0) > 0 ? item.cashPriceCents : 0) || item.discountPriceCents || item.priceCents || 0);
  const key = () => `assistencia:favoritos:${context.catalog.storeCode}`;
  const notify = message => { $("#discovery-feedback").textContent = message; };
  const selectedItems = codes => context.catalog.items.filter(item => codes.has(item.code));
  const whatsapp = text => {
    const phone = String(context.catalog.storePhone || "").replace(/\D/g, "");
    return phone.length >= 8 ? `https://wa.me/${phone.startsWith("55") ? phone : `55${phone}`}?text=${encodeURIComponent(text)}` : "";
  };
  const record = (kind, itemCode = "") => {
    if (context.catalog.storeCode === "mostruario") return;
    let source = new URLSearchParams(location.search).get("utm_source") || "direto";
    source = /instagram/i.test(source) ? "instagram" : /whatsapp/i.test(source) ? "whatsapp" : /qr/i.test(source) ? "qr" : source === "direto" ? "direto" : "outros";
    try {
      const eventKey = `assistencia:evento:${context.catalog.storeCode}:${kind}:${itemCode}`;
      if (sessionStorage.getItem(eventKey)) return;
      sessionStorage.setItem(eventKey, "1");
    } catch { /* A navegação continua quando o armazenamento está indisponível. */ }
    void fetch(`${context.api}/engagement/${context.catalog.storeCode}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"event",kind,itemCode,source}),keepalive:true}).catch(() => {});
  };
  const close = () => {
    if (!dialog || dialog.dataset.busy === "true") return;
    dialog.close(); dialog.remove(); dialog = null;
    returnFocus?.focus({preventScroll:true});
  };
  const open = (title, content) => {
    close(); returnFocus = document.activeElement;
    dialog = document.createElement("dialog"); dialog.className = "discovery-dialog";
    dialog.setAttribute("aria-labelledby", "discovery-dialog-title");
    dialog.innerHTML = `<header><h2 id="discovery-dialog-title">${escape(title)}</h2><button type="button" aria-label="Fechar janela">×</button></header>${content}`;
    document.body.append(dialog);
    dialog.querySelector("header button").onclick = close;
    dialog.addEventListener("cancel", event => {event.preventDefault(); close();});
    dialog.addEventListener("click", event => {if(event.target === dialog) close();});
    dialog.showModal();
    return dialog;
  };
  const shareSearch = async () => {
    const url = new URL(location.href); url.hash = context.catalog.storeCode;
    const fields = {q:"#search",condition:"#kind",availability:"#availability",storage:"#storage",ram:"#ram",sort:"#sort",budget:"#budget"};
    for (const [name, selector] of Object.entries(fields)) {const value=$(selector)?.value || ""; if(value) url.searchParams.set(name,value); else url.searchParams.delete(name);}
    if (guideUse) url.searchParams.set("use", guideUse); else url.searchParams.delete("use");
    const data={title:`Seleção de aparelhos — ${context.catalog.storeName}`,text:"Confira os aparelhos desta seleção.",url:url.href};
    try {if(navigator.share) await navigator.share(data); else {await navigator.clipboard.writeText(data.url); notify("Link da busca copiado.");}} catch(error) {if(error.name !== "AbortError") {const modal=open("Compartilhar busca",`<label>Link desta seleção<input type="text" readonly value="${escape(data.url)}"></label><p>Selecione e copie o link para compartilhar os filtros escolhidos.</p>`);const input=modal.querySelector("input");input.focus();input.select();}}
  };
  const refreshBar = () => {
    $("#show-favorites").textContent = `${onlyFavorites ? "Mostrar todos" : "Favoritos"} (${favorites.size})`;
    $("#show-favorites").setAttribute("aria-pressed",String(onlyFavorites));
  };
  const heartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  const updateHeart = (button,item) => {
    const saved=favorites.has(item.code);
    button.setAttribute("aria-pressed",String(saved));
    button.setAttribute("aria-label",`${saved ? "Remover" : "Salvar"} ${item.title} ${saved ? "dos" : "nos"} favoritos`);
    button.title=saved ? "Remover dos favoritos" : "Salvar nos favoritos";
  };
  const addHeart = (picture,item) => {
    const button=document.createElement("button");button.type="button";button.className="discovery-heart";button.dataset.action="favorite";button.dataset.code=item.code;button.innerHTML=heartIcon;updateHeart(button,item);
    for(const name of ["keydown","touchstart","touchmove","touchend","pointerdown"])button.addEventListener(name,event=>event.stopPropagation());
    button.onclick=event=>{
      event.stopPropagation();
      if(favorites.has(item.code))favorites.delete(item.code);
      else if(favorites.size >= 100){notify("Você pode salvar até 100 aparelhos.");return;}
      else favorites.add(item.code);
      try{localStorage.setItem(key(),JSON.stringify([...favorites]));}catch{notify("Favoritos mantidos nesta aba; o navegador não permitiu salvá-los.");}
      if(favorites.has(item.code))record("favorite",item.code);
      document.querySelectorAll(".discovery-heart").forEach(heart=>{if(heart.dataset.code===item.code)updateHeart(heart,item);});
      refreshBar();
      if(onlyFavorites && $("#detail").hidden){context.render();($("#catalog").querySelector(`[data-code="${item.code}"] .discovery-heart`) || $("#show-favorites")).focus({preventScroll:true});}
    };
    picture.append(button);
  };
  const requestForm = item => {
    const formDialog=open("Avise-me quando chegar", `<form class="discovery-form"><p>${escape(item.title)}</p><label>Seu nome<input name="name" maxlength="120" autocomplete="name" required></label><label>Telefone para retorno<input name="phone" type="tel" maxlength="24" autocomplete="tel" required></label><label class="discovery-consent"><input type="checkbox" name="consent" required> Autorizo a loja a entrar em contato sobre a chegada deste aparelho.</label><p>O aviso não reserva estoque nem confirma uma compra.</p><output role="status"></output><footer><button type="button" data-cancel>Voltar</button><button type="submit">Enviar solicitação</button></footer></form>`);
    const form=formDialog.querySelector("form");
    form.querySelector("[data-cancel]").onclick=close;
    form.onsubmit=async event => {
      event.preventDefault(); const submit=form.querySelector('[type="submit"]'); if(submit.disabled) return;
      submit.disabled=true; formDialog.dataset.busy="true"; formDialog.querySelector('header button').disabled=true; form.querySelector('[data-cancel]').disabled=true; form.querySelectorAll('input').forEach(input=>input.disabled=true); const output=form.querySelector("output"); output.textContent="Enviando…";
      try {
        const payload={action:"lead",kind:"arrival",itemCode:item.code,name:form.elements.name.value.trim(),phone:form.elements.phone.value.trim(),consent:true,requestId:form.dataset.requestId || (form.dataset.requestId=crypto.randomUUID())};
        if(context.catalog.storeCode === "mostruario") throw new Error("A demonstração não envia solicitações. Abra uma vitrine de teste para experimentar o envio.");
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);let response;
        try{response=await fetch(`${context.api}/engagement/${context.catalog.storeCode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});}finally{clearTimeout(timer);}
        const body=await response.json(); if(!response.ok) throw new Error(body.error === "request_conflict" ? "A tentativa anterior foi recebida com outros dados. Consulte a loja para corrigir o contato, ou repita os dados originais." : body.error === "rate_limited" ? "Muitas solicitações. Tente novamente mais tarde." : "Não foi possível registrar. Seus dados foram mantidos para tentar novamente.");
        form.innerHTML='<h3>Solicitação recebida</h3><p>A loja recebeu seu pedido e poderá avisar pelo contato informado quando o aparelho chegar.</p><button type="button">Concluir</button>';form.querySelector("button").onclick=close;
      } catch(error) {output.textContent=error.name === "AbortError" ? "A conexão demorou. Tente novamente; evitaremos uma solicitação duplicada." : error.message; submit.disabled=false;}
      finally {formDialog.dataset.busy="false"; formDialog.querySelector('header button').disabled=false;form.querySelectorAll('input').forEach(input=>input.disabled=false);const back=form.querySelector('[data-cancel]');if(back)back.disabled=false;}
    };
  };
  const compare = () => {
    const items=selectedItems(compared);
    const result=open("Comparar aparelhos", `<div class="comparison-scroll"><table><caption>Informações publicadas pela loja</caption><thead><tr><th>Característica</th>${items.map(i=>`<th>${escape(i.title)}</th>`).join("")}</tr></thead><tbody>${[["À vista",i=>money(price(i))],["Memória",i=>`${i.storage || "Não informado"} GB | ${i.ram || "Não informado"} GB RAM`],["Bateria",i=>i.batteryHealth ? `${i.batteryHealth}%` : "Não informada"],["Garantia",i=>i.warranty || "Consulte a loja"],["Disponibilidade",i=>i.availability === "ready" ? "Pronta entrega" : i.availability === "order" ? "Sob encomenda" : "Indisponível"]].map(([label,value])=>`<tr><th>${label}</th>${items.map(i=>`<td>${escape(value(i))}</td>`).join("")}</tr>`).join("")}</tbody></table></div><footer class="comparison-footer"><button type="button" data-edit>Trocar aparelhos</button><button type="button" data-done>Concluir</button></footer>`);
    result.querySelector("[data-edit]").onclick=()=>chooseComparison();
    result.querySelector("[data-done]").onclick=close;
  };
  const chooseComparison = initial => {
    compared=new Set([...compared].filter(code=>context.catalog.items.some(item=>item.code===code)));
    if(initial && !compared.has(initial.code)){if(compared.size >= 3)compared=new Set([initial.code]);else compared.add(initial.code);}
    const picker=open("Escolha os aparelhos para comparar",`<p>Escolha de 2 a 3 aparelhos para ver as diferenças lado a lado.</p><label class="comparison-search">Buscar aparelho<input type="search" maxlength="80" placeholder="Nome, modelo ou cor" autocomplete="off"></label><div class="comparison-options">${context.catalog.items.map(item=>`<label class="comparison-option"><input type="checkbox" value="${escape(item.code)}" ${compared.has(item.code)?"checked":""}><span><strong>${escape(item.title)}</strong><small>${escape([item.storage && item.storage+" GB",item.ram && item.ram+" GB RAM",item.color].filter(Boolean).join(" | "))} | ${money(price(item))}</small></span></label>`).join("")}</div><p class="comparison-empty" hidden>Nenhum aparelho encontrado.</p><footer class="comparison-footer"><output role="status"></output><button type="button" data-cancel>Cancelar</button><button type="button" data-confirm disabled>Ver comparação</button></footer>`);
    const boxes=[...picker.querySelectorAll('input[type="checkbox"]')],confirm=picker.querySelector("[data-confirm]");
    const update=()=>{picker.querySelector("output").textContent=`${compared.size} de 3 aparelhos escolhidos`;confirm.disabled=compared.size < 2;boxes.forEach(box=>{box.disabled=!box.checked && compared.size >= 3;});};
    boxes.forEach(box=>box.onchange=()=>{if(box.checked)compared.add(box.value);else compared.delete(box.value);update();});
    picker.querySelector('input[type="search"]').oninput=event=>{const query=event.target.value.trim().toLocaleLowerCase("pt-BR");boxes.forEach(box=>{box.closest("label").hidden=!box.closest("label").textContent.toLocaleLowerCase("pt-BR").includes(query);});picker.querySelector(".comparison-empty").hidden=boxes.some(box=>!box.closest("label").hidden);};
    picker.querySelector("[data-cancel]").onclick=close;confirm.onclick=compare;update();
  };
  const helpChoose = () => {
    const modal=open("Encontre opções para seu uso",'<form class="discovery-form"><label>Quanto pretende gastar?<input name="budget" type="number" min="1" max="100000" step="1" required></label><label>Uso principal<select name="use"><option value="basic">Mensagens e chamadas</option><option value="photos">Fotos e vídeos: mais armazenamento</option><option value="apps">Vários aplicativos: mais RAM</option></select></label><label>Disponibilidade<select name="availability"><option value="ready">Pronta entrega</option><option value="">Todas</option></select></label><p>A seleção considera preço e memória informados. Câmera, desempenho e compatibilidade devem ser confirmados com a loja.</p><button type="submit">Ver opções</button></form>');
    modal.querySelector("form").onsubmit=event=>{event.preventDefault();const f=event.target;const budget=String(Math.round(Number(f.elements.budget.value)*100));if(![...$("#budget").options].some(option=>option.value===budget)) $("#budget").add(new Option(`Até ${money(Number(budget))}`,budget));$("#budget").value=budget;$("#availability").value=f.elements.availability.value;$("#sort").value=f.elements.use.value === "apps" ? "ram" : "lowest";$("#storage").value="";$("#ram").value="";$("#search").value="";$("#mobile-search").value="";guideUse=f.elements.use.value;onlyFavorites=false;close();context.render();notify("Opções filtradas pelo orçamento e uso informado.");};
  };
  const init = next => {
    context=next;
    if(!$("#discovery-controls")) {
      $("#status").insertAdjacentHTML("beforebegin",'<section id="discovery-controls" class="discovery-controls" aria-label="Encontre e salve aparelhos"><label>Preço máximo à vista<select id="budget"><option value="">Qualquer valor</option><option value="80000">Até R$ 800</option><option value="100000">Até R$ 1.000</option><option value="150000">Até R$ 1.500</option><option value="200000">Até R$ 2.000</option><option value="300000">Até R$ 3.000</option></select></label><button id="share-search" type="button">Compartilhar busca</button><button id="clear-search" type="button">Limpar filtros</button><button id="show-favorites" type="button" aria-pressed="false">Favoritos</button><button id="choose-device" type="button">Me ajude a escolher</button><button id="compare-devices" type="button">Comparar aparelhos</button></section><p id="discovery-feedback" role="status"></p>');
      $("#clear-search").onclick=()=>{for(const selector of ["#search","#mobile-search","#kind","#availability","#storage","#ram","#budget"])$(selector).value="";$("#sort").value="featured";guideUse="";onlyFavorites=false;context.render();notify("Filtros limpos.");};$("#budget").onchange=()=>context.render();$("#share-search").onclick=shareSearch;$("#show-favorites").onclick=()=>{onlyFavorites=!onlyFavorites;context.render();refreshBar();};$("#compare-devices").onclick=()=>chooseComparison();$("#choose-device").onclick=helpChoose;
    }
    if(!restored) {
      restored=true;
      try{const stored=JSON.parse(localStorage.getItem(key()) || "[]"); favorites=new Set(Array.isArray(stored) ? stored.filter(code=>typeof code === "string").slice(0,100).map(code=>context.catalog.items.find(item=>item.code === code || item.variantCodes?.includes(code))?.code || code) : []);}catch{favorites=new Set();}
      const params=new URLSearchParams(location.search);
      guideUse = ["basic", "photos", "apps"].includes(params.get("use")) ? params.get("use") : "";
      for(const [name,selector] of Object.entries({q:"#search",condition:"#kind",availability:"#availability",storage:"#storage",ram:"#ram",sort:"#sort",budget:"#budget"})) {if(params.has(name)) {const node=$(selector); const value=params.get(name).slice(0,80);if(node.tagName === "SELECT" && ![...node.options].some(o=>o.value === value) && name === "budget" && /^\d{1,8}$/.test(value))node.add(new Option(`Até ${money(Number(value))}`,value));node.value=value;}}
      $("#mobile-search").value=$("#search").value;
      record("catalog");
    }
    refreshBar();
  };
  const decorate = () => {
    $("#catalog").querySelectorAll(".card").forEach(card=>{
      const item=context.catalog.items.find(i=>i.code === card.dataset.code); if(!item) return;
      const controls=document.createElement("div");controls.className="discovery-card-actions";
      addHeart(card.querySelector(".picture"),item);
      const compareButton=document.createElement("button");compareButton.type="button";compareButton.dataset.action="compare";compareButton.textContent="Comparar";
      compareButton.onclick=event=>{event.stopPropagation();chooseComparison(item);};controls.append(compareButton);
      controls.addEventListener("keydown",event=>event.stopPropagation());card.append(controls);
    });refreshBar();
  };
  const detail = item => {
    addHeart($("#detail .detail-gallery .picture"),item);
    record("product",item.code); $("#detail .contact")?.addEventListener("click",()=>record("contact",item.code));
    const copy=$("#detail .detail-copy");
    if(item.availability === "unavailable") {
      const alternatives=context.catalog.items.filter(i=>i.code !== item.code && i.availability !== "unavailable").sort((a,b)=>Number(b.brand===item.brand)-Number(a.brand===item.brand)||Math.abs(price(a)-price(item))-Math.abs(price(b)-price(item))).slice(0,3);
      const section=document.createElement("section"); section.className="discovery-alternatives";section.innerHTML=`<h2>Alternativas disponíveis</h2>${alternatives.length ? alternatives.map(i=>`<button type="button" data-code="${escape(i.code)}">${escape(i.title)} | ${money(price(i))}</button>`).join("") : '<p>Consulte a loja sobre outros modelos.</p>'}`; section.querySelectorAll("button").forEach(button=>button.onclick=()=>{location.hash=`${context.catalog.storeCode}/${button.dataset.code}`;});copy.append(section);
      const arrival=document.createElement("button");arrival.type="button";arrival.textContent="Avise-me quando chegar";arrival.onclick=()=>requestForm(item);copy.append(arrival);
    }
    const video=item.videoUrl;try {const url=new URL(video);if(url.protocol === "https:" && !url.username && !url.password && /\.(mp4|webm)$/i.test(url.pathname)){const player=document.createElement("video");player.controls=true;player.preload="none";player.src=url.href;player.setAttribute("aria-label","Vídeo do aparelho");copy.append(player);}}catch{}
    const extras=item.bundleItems || [];
    if(extras.length && item.availability !== "unavailable") {
      const bundle=document.createElement("section");bundle.className="discovery-bundle";bundle.innerHTML=`<h2>Monte seu conjunto</h2>${extras.slice(0,8).map((extra,index)=>`<label><input type="checkbox" value="${index}"> ${escape(extra.name)} | ${money(extra.priceCents)}</label>`).join("")}<output></output><button type="button">Consultar conjunto pelo WhatsApp</button>`;
      const update=()=>{const chosen=[...bundle.querySelectorAll('input:checked')].map(input=>extras[Number(input.value)]); const total=price(item)+chosen.reduce((sum,extra)=>sum+Number(extra.priceCents),0);bundle.querySelector("output").textContent=`Total à vista: ${money(total)}`;return {chosen,total};};bundle.onchange=update;update();bundle.querySelector("button").disabled=!whatsapp("teste");bundle.querySelector("button").onclick=()=>{const {chosen,total}=update();const url=whatsapp(`Olá! Tenho interesse em ${item.title}${chosen.length ? ` + ${chosen.map(e=>e.name).join(" + ")}` : ""} | Total à vista: ${money(total)}. Pode confirmar a disponibilidade?`);if(url){record("contact",item.code);window.open(url,"_blank","noopener,noreferrer");}};copy.append(bundle);
    }
  };
  window.assistenciaDiscovery={init,decorate,detail,filter:item=>(!onlyFavorites || favorites.has(item.code)) && (!$("#budget")?.value || price(item)<=Number($("#budget").value)) && (guideUse !== "photos" || Number(item.storage)>=128)};
})();
