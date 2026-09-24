(() => {
  "use strict";
  const API_URL = window.__ASSISTENCIA_CUSTOMER_CONFIG__?.apiUrl;
  if (!API_URL) throw new Error("A configuração pública não foi carregada.");
  const $ = (id) => document.getElementById(id);
  const state = { token: "", pin: "", tracking: null, timer: null, expiryTimer: null, statusTimer: null, loading: false, approving: false, signatureDrawn: false, signatureMode: "disabled" };
  const TOKEN_PATTERN = /^(?:[A-Za-z0-9_-]{43}|[A-F0-9]{5}\.[A-Za-z0-9_-]{22})$/i;
  const statusIndex = (status) =>
    status === "Aguardando técnico"
      ? 2
      : status === "Aguardando aprovação"
        ? 3
        : status === "Em manutenção"
          ? 4
          : ["Pronto para retirada", "Abandonado"].includes(status)
            ? 5
            : status === "Finalizado"
              ? 6
              : 0;
  const statusHelp = (status, detail) => {
    if (status === "Em manutenção" && String(detail || "").toLocaleLowerCase("pt-BR").includes("com o cliente")) {
      return "O serviço aguarda o aparelho. Leve-o até a assistência para que a manutenção possa começar.";
    }
    if (
      status === "Em manutenção" && String(detail || "")
        .toLocaleLowerCase("pt-BR")
        .includes("peça")
    ) {
      return "O atendimento está pausado enquanto a assistência aguarda a chegada das peças.";
    }
    return (
      {
        "Aguardando técnico": "O aparelho está na etapa de avaliação técnica.",
        "Aguardando aprovação":
          "A assistência aguarda a confirmação do orçamento.",
        "Em manutenção": "O serviço aprovado está sendo realizado.",
        "Pronto para retirada":
          "O aparelho está pronto. Combine a retirada com a assistência.",
        Finalizado: "Atendimento concluído e registrado.",
        Cancelado:
          "O atendimento foi cancelado. Fale com a assistência para mais informações.",
        Rejeitado: "O orçamento não foi aprovado.",
        Expirado: "A validade do orçamento terminou.",
        Abandonado: "O aparelho continua aguardando retirada.",
      }[status] || "Consulte abaixo as informações publicadas pela assistência."
    );
  };
  const money = (cents) =>
    (Number(cents) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const date = (value) => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? parsed.toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "";
  };
  const duration = (seconds) => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(total / 86400),
      hours = Math.floor((total % 86400) / 3600),
      minutes = Math.floor((total % 3600) / 60);
    return [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes}min`]
      .filter(Boolean)
      .join(" ");
  };
  const show = (id, visible = true) => {
    $(id).hidden = !visible;
  };
  const renderBranding = (tracking) => {
    const branding = tracking?.snapshot?.storeBranding;
    const name = [branding?.name, tracking?.storeName]
      .find((value) => typeof value === "string" && value.trim())?.trim().slice(0, 160)
      || "Assistência técnica";
    $("store-name").textContent = tracking ? name : "Acompanhe seu atendimento";
    document.title = tracking ? `Acompanhar atendimento | ${name}` : "Acompanhar atendimento";
    const logo = $("store-logo");
    logo.onload = null;
    logo.onerror = null;
    show("store-logo", false);
    logo.removeAttribute("src");
    logo.alt = "";
    const dataUrl = branding?.logoDataUrl;
    if (typeof dataUrl === "string" && dataUrl.length <= 32000 &&
        /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
      logo.onload = () => show("store-logo");
      logo.onerror = () => { show("store-logo", false); logo.removeAttribute("src"); };
      logo.alt = `Logo da loja ${name}`;
      logo.src = dataUrl;
    }
  };
  const fail = (message, retryable = false) => {
    clearTimeout(state.expiryTimer);
    clearTimeout(state.statusTimer);
    state.tracking = null;
    renderBranding(null);
    clearInterval(state.timer);
    show("loading", false);
    show("pin-form", false);
    show("tracking", false);
    show("approval-card", false);
    show("labor-notice-card", false);
    show("revision-card", false);
    $("photo-gallery").replaceChildren();
    $("services").replaceChildren();
    $("timeline").replaceChildren();
    $("photo-dialog").close();
    $("photo-large").removeAttribute("src");
    $("error-text").textContent = message;
    show("retry", retryable);
    $("error-help").textContent = retryable
      ? "Seu endereço de acesso foi mantido nesta aba. Tente novamente quando a conexão voltar."
      : "Fale com a assistência se precisar de ajuda ou de uma cópia do PDF.";
    show("error");
  };
  const scheduleStatusRefresh = () => {
    clearTimeout(state.statusTimer);
    const status = String(state.tracking?.snapshot?.status || "");
    if (["Cancelado", "Rejeitado", "Expirado"].includes(status)) return;
    state.statusTimer = setTimeout(async () => {
      if (document.visibilityState === "visible") await load();
      else scheduleStatusRefresh();
    }, 60_000);
  };
  const api = async (action = "read", decision = "", signature = null, note = "", feedback = null) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
    const response = await fetch(API_URL, {
      signal: controller.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      body: JSON.stringify({
        action,
        token: state.token,
        pin: state.pin,
        ...(action === "approve" ? { approvalVersion: state.tracking?.snapshot?.approvalVersion || "" } : {}),
        ...(action === "approve" ? { decision, signature, note } : {}),
        ...(action === "feedback" && feedback ? feedback : {}),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        data.message || "Não foi possível consultar o atendimento.",
      );
      error.code = data.error || "request_failed";
      error.retryable = response.status >= 500 || response.status === 429 || response.status === 408;
      throw error;
    }
    if (!data.tracking || typeof data.tracking !== "object" || !data.tracking.snapshot) {
      const error = new Error("A assistência não respondeu como esperado. Tente novamente.");
      error.retryable = true;
      throw error;
    }
    return data.tracking;
    } catch (error) {
      if (controller.signal.aborted || error instanceof TypeError) {
        const unavailable = new Error("Não foi possível conectar à assistência. Confira sua conexão e tente novamente. Isso não significa que o link expirou.");
        unavailable.retryable = true;
        throw unavailable;
      }
      throw error;
    } finally { clearTimeout(timeout); }
  };
  const renderProgress = (status) => {
    const steps = [
        "Recebido",
        "Avaliação",
        "Aprovação",
        "Manutenção",
        "Retirada",
      ],
      current = statusIndex(status);
    const visibleStep = Math.max(0, Math.min(current, 5));
    const completedSteps = current > 5 ? 5 : Math.max(0, visibleStep - 1);
    const percent = completedSteps * 20;
    $("progress-meter").className = `progress-meter progress-${percent}`;
    $("progress-percent").textContent = `${percent}%`;
    $("progress-summary").textContent = visibleStep
      ? steps[visibleStep - 1]
      : "Atendimento encerrado";
    $("progress").replaceChildren(
      ...steps.map((label, index) => {
        const li = document.createElement("li");
        const step = index + 1;
        li.className =
          step < current ? "done" : step === current ? "current" : "";
        if (step === current) li.setAttribute("aria-current", "step");
        const icon = document.createElement("i");
        icon.textContent = step < current ? "✓" : String(step);
        const text = document.createElement("span");
        text.textContent = label;
        li.append(icon, text);
        return li;
      }),
    );
    $("progress-count").textContent = current
      ? `Etapa ${Math.min(current, 5)} de 5`
      : "Encerrado";
  };
  const render = (tracking) => {
    clearInterval(state.timer);
    clearTimeout(state.expiryTimer);
    const expiresAt = Date.parse(tracking.expiresAt);
    if (Number.isFinite(expiresAt)) {
      const checkExpiry = () => {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) {
          fail("Este link expirou. Consulte o PDF enviado pela loja para as informações do atendimento e da garantia, quando aplicável. Se precisar, solicite uma cópia à loja.");
          return false;
        }
        state.expiryTimer = setTimeout(checkExpiry, Math.min(remaining, 60000));
        return true;
      };
      if (!checkExpiry()) return;
    }
    if (state.tracking?.snapshot?.approvalVersion !== tracking.snapshot?.approvalVersion) {
      state.signatureDrawn = false;
      const canvas = $("approval-signature-canvas");
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
    state.tracking = tracking;
    const snapshot = tracking.snapshot || {};
    const approvalState = String(tracking.approvalState || snapshot.approvalState || "not_applicable");
    const approvalMode = snapshot.portalMode === "approval" || tracking.accessKind === "approval";
    const laborService = (Array.isArray(snapshot.services) ? snapshot.services : []).find(
      (service) => /^mão de obra\s*[—–-]/i.test(String(service?.name || "")),
    );
    const laborCondition = String(laborService?.description || "").split("\n")[0].trim();
    const laborNotice = laborCondition || "Peça fornecida pelo cliente. O valor da mão de obra refere-se ao serviço de desmontagem, instalação e remontagem. Caso a peça fornecida pelo cliente apresente defeito, incompatibilidade ou impossibilite a conclusão do serviço, a mão de obra poderá ser cobrada integralmente, desde que o serviço tenha sido iniciado, incluindo os custos de desmontagem e remontagem.";
    const showLaborNotice = Boolean(laborService) && approvalState !== "rejected";
    show("labor-notice-card", showLaborNotice);
    $("labor-notice-text").textContent = showLaborNotice ? laborNotice : "";
    show("approval-labor-notice", showLaborNotice && approvalMode && snapshot.status === "Aguardando aprovação" && approvalState === "pending");
    $("approval-labor-notice").textContent = showLaborNotice ? laborNotice : "";
    const revision = snapshot.revisionSummary && typeof snapshot.revisionSummary === "object"
      ? snapshot.revisionSummary : null;
    const revisionValuesValid = revision
      && Number.isInteger(revision.originalTotalCents)
      && Number.isInteger(revision.newTotalCents)
      && Number.isInteger(revision.differenceCents)
      && revision.differenceCents === revision.newTotalCents - revision.originalTotalCents;
    show("revision-card", approvalMode && revisionValuesValid);
    if (approvalMode && revisionValuesValid) {
      $("revision-title").textContent = `Revisão de ${revision.originalPublicNumber || "orçamento anterior"}`;
      $("revision-reason").textContent = `Motivo da alteração: ${revision.reason || "Reavaliação informada pela assistência."}`;
      $("revision-original-total").textContent = money(revision.originalTotalCents);
      $("revision-new-total").textContent = money(revision.newTotalCents);
      const sign = revision.differenceCents > 0 ? "+" : revision.differenceCents < 0 ? "−" : "";
      $("revision-difference").textContent = `${sign}${money(Math.abs(revision.differenceCents))}`;
    }
    show("approval-card", approvalMode && snapshot.status === "Aguardando aprovação");
    if (approvalMode) {
      const approvalCard = $("approval-card");
      const check = $("approval-check");
      const approve = $("approve-quote");
      const reject = $("reject-quote");
      const feedback = $("approval-feedback");
      const resolved = approvalState !== "pending";
      state.signatureMode = ["optional", "required"].includes(snapshot.approvalSignatureMode)
        ? snapshot.approvalSignatureMode : "disabled";
      show("approval-signature", !resolved && state.signatureMode !== "disabled");
      $("approval-signature-guidance").textContent = state.signatureMode === "required"
        ? "Assine com o dedo dentro do quadro para aprovar."
        : "Opcional: assine com o dedo dentro do quadro.";
      approvalCard.classList.toggle("is-resolved", resolved);
      if (resolved) {
        $("approval-signature").classList.remove("is-fullscreen");
        document.body.classList.remove("approval-signature-open");
      }
      $("approval-title").textContent = approvalState === "approved"
        ? "Aprovação confirmada"
        : approvalState === "rejected"
          ? "Decisão registrada"
          : "Você aprova este serviço?";
      $("approval-intro").hidden = resolved;
      approvalCard.querySelector(".approval-confirm-row").hidden = resolved;
      approvalCard.querySelector(".approval-actions").hidden = resolved;
      show("rejection-choice", false);
      approvalCard.querySelector(".approval-footnote").hidden = resolved;
      $("approval-total").textContent = Number.isInteger(snapshot.totalCents)
        ? money(snapshot.totalCents)
        : "Valor informado pela assistência";
      const approvalServices = Array.isArray(snapshot.services) ? snapshot.services : [];
      $("approval-service-summary").textContent = approvalServices.length
        ? `${approvalServices.length} ${approvalServices.length === 1 ? "serviço apresentado" : "serviços apresentados"}`
        : "Confira os detalhes do atendimento abaixo";
      check.checked = false;
      check.disabled = resolved;
      approve.disabled = resolved;
      reject.disabled = resolved;
      feedback.hidden = !resolved;
      feedback.className = `approval-feedback ${approvalState === "approved" ? "success" : ""}`;
      feedback.textContent = approvalState === "approved"
        ? `Aprovação registrada em ${date(tracking.approvedAt)}. A assistência já pode iniciar o serviço.`
        : approvalState === "rejected"
          ? "Sua decisão foi registrada como não aprovado. Fale com a assistência se quiser revisar o atendimento."
          : "";
    }
    const deliveredAt = Date.parse(snapshot.deliveredAt);
    show("pickup-notice", Number.isFinite(deliveredAt));
    if (Number.isFinite(deliveredAt)) {
      $("pickup-date").textContent = `Retirada registrada em ${date(snapshot.deliveredAt)}.`;
      $("pickup-expiry").textContent = Number.isFinite(expiresAt)
        ? `Disponível até ${date(tracking.expiresAt)}.` : "";
    }
    renderBranding(tracking);
    $("number").textContent = tracking.publicNumber || "Atendimento";
    $("status").textContent = snapshot.statusDetail || snapshot.status;
    $("status-detail").textContent = snapshot.statusDetail || snapshot.status;
    $("status-help").textContent = snapshot.statusHelp || statusHelp(snapshot.status, snapshot.statusDetail);
    $("updated").textContent =
      `Atualizado em ${date(snapshot.updatedAt || tracking.updatedAt)}`;
    $("next-step").textContent = snapshot.status === "Em manutenção" && String(snapshot.statusDetail || "").toLocaleLowerCase("pt-BR").includes("com o cliente")
      ? "Sua ação: leve o aparelho até a assistência para iniciar o serviço aprovado."
      : ({
      "Aguardando técnico": "Próximo passo: a assistência confere a avaliação e informa o orçamento.",
      "Aguardando aprovação": "Sua ação: informe à loja se deseja aprovar o serviço.",
      "Em manutenção": "Próximo passo: aguarde a confirmação de que o aparelho está pronto.",
      "Pronto para retirada": "Sua ação: combine a retirada com a loja. A data de entrega ainda será registrada.",
      Abandonado: "Sua ação: entre em contato com a loja para combinar a retirada.",
      Finalizado: "Guarde o PDF do atendimento para consultar as informações e a garantia, quando aplicável.",
    }[snapshot.status] || "Dúvidas sobre este atendimento? Converse diretamente com a loja.");
    if (approvalState === "approved") {
      $("status").textContent = "Aprovação enviada";
      $("status-detail").textContent = "Orçamento aprovado por você";
      $("status-help").textContent = "Sua decisão foi registrada. A assistência atualizará a próxima etapa do atendimento.";
      $("next-step").textContent = "Próximo passo: aguarde a assistência iniciar o serviço ou informar a necessidade de peças.";
    } else if (approvalState === "rejected") {
      $("status").textContent = "Decisão enviada";
      $("status-detail").textContent = "Orçamento não aprovado";
      $("status-help").textContent = "Sua decisão foi registrada pela assistência.";
      $("next-step").textContent = "Próximo passo: converse com a assistência para combinar como o atendimento seguirá.";
    }
    $("device").textContent =
      snapshot.deviceSummary || "Aparelho em atendimento";
    $("reported").textContent = snapshot.reportedDefect
      ? `Relato: ${snapshot.reportedDefect}`
      : "";
    $("deadline").textContent =
      snapshot.estimatedDeadline || "Consulte a assistência";
    const deviceDetails = snapshot.deviceDetails && typeof snapshot.deviceDetails === "object"
      ? snapshot.deviceDetails : {};
    const detailValues = [
      deviceDetails.physicalStatusLabel,
      deviceDetails.capacity,
      deviceDetails.imeiLast4,
      deviceDetails.serialLast4,
      deviceDetails.receivedAt,
      deviceDetails.accessories,
      deviceDetails.visualNotes,
    ].filter(Boolean);
    if (detailValues.length) {
      show("device-details-card");
      $("device-physical-status").textContent = deviceDetails.physicalStatusLabel || "Situação física não informada";
      const setDetail = (rowId, valueId, value, formatter = (item) => item) => {
        const present = Boolean(String(value || "").trim());
        show(rowId, present);
        if (present) $(valueId).textContent = formatter(value);
      };
      setDetail("device-capacity-detail", "device-capacity", deviceDetails.capacity);
      setDetail("device-imei-detail", "device-imei", deviceDetails.imeiLast4);
      setDetail("device-serial-detail", "device-serial", deviceDetails.serialLast4);
      setDetail("device-received-detail", "device-received", deviceDetails.receivedAt, date);
      setDetail("device-accessories", "device-accessories", deviceDetails.accessories, (value) => `Acessórios registrados: ${value}`);
      setDetail("device-visual-notes", "device-visual-notes", deviceDetails.visualNotes, (value) => `Condição registrada: ${value}`);
    } else show("device-details-card", false);
    renderProgress(snapshot.status);
    const receivingPhotos = Array.isArray(snapshot.receivingPhotos)
      ? snapshot.receivingPhotos
      : snapshot.photo?.dataUrl ? [snapshot.photo] : [];
    const deliveryPhotos = Array.isArray(snapshot.deliveryPhotos)
      ? snapshot.deliveryPhotos : [];
    const photos = [
      ...receivingPhotos.map((photo) => ({ ...photo, stage: "Recebimento" })),
      ...deliveryPhotos.map((photo) => ({ ...photo, stage: "Entrega" })),
    ].filter((photo) => typeof photo?.dataUrl === "string" && photo.dataUrl.length <= 360000 &&
      /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo.dataUrl)).slice(0, 8);
    if (photos.length) {
      $("photo-gallery").replaceChildren(...photos.map((photo, index) => {
        const figure = document.createElement("figure");
        const image = document.createElement("img");
        const expand = document.createElement("button");
        expand.type = "button";
        expand.className = "photo-expand";
        expand.setAttribute("aria-label", `Ampliar foto ${index + 1} — ${photo.stage.toLowerCase()}`);
        const caption = document.createElement("figcaption");
        image.src = photo.dataUrl;
        image.alt = `Foto ${index + 1} do aparelho — ${photo.stage.toLowerCase()}`;
        image.loading = "lazy";
        image.decoding = "async";
        caption.textContent = `${photo.stage} · ${photo.caption || "Foto registrada pela assistência"}`;
        expand.addEventListener("click", () => {
          $("photo-large").src = photo.dataUrl;
          $("photo-large").alt = image.alt;
          $("photo-title").textContent = `${photo.stage} · foto ${index + 1}`;
          $("photo-caption").textContent = caption.textContent;
          $("photo-dialog").showModal();
        });
        expand.append(image);
        figure.append(expand, caption);
        return figure;
      }));
      show("photo-wrap");
    } else show("photo-wrap", false);
    if (snapshot.maintenanceStartedAt) {
      show("maintenance-card");
      const tick = () => {
        const updatedAt = Date.parse(snapshot.updatedAt);
        const extra =
          snapshot.maintenanceClockRunning && Number.isFinite(updatedAt)
            ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1000))
            : 0;
        $("maintenance-time").textContent = duration(
          (snapshot.maintenanceElapsedSeconds || 0) + extra,
        );
        $("maintenance-note").textContent = snapshot.maintenanceClockRunning
          ? "Contagem ativa desde a última atualização."
          : snapshot.statusDetail?.includes("peças")
            ? "Contagem pausada enquanto aguarda peças."
            : "Tempo registrado pela assistência.";
      };
      tick();
      clearInterval(state.timer);
      state.timer = setInterval(tick, 30000);
    } else show("maintenance-card", false);
    if (Number.isInteger(snapshot.totalCents)) {
      show("total-card");
      $("total").textContent = money(snapshot.totalCents);
    } else show("total-card", false);
    if (snapshot.diagnosedDefect) {
      show("diagnosis-card");
      $("diagnosis").textContent = snapshot.diagnosedDefect;
    } else show("diagnosis-card", false);
    const services = Array.isArray(snapshot.services) ? snapshot.services : [];
    if (services.length) {
      show("services-card");
      $("services").replaceChildren(
        ...services.map((item) => {
          const li = document.createElement("li");
          const name = document.createElement("strong");
          name.textContent = item.name;
          li.append(name);
          if (Number.isInteger(item.totalCents) && Number.isInteger(item.unitPriceCents) && Number.isInteger(item.quantity)) {
            const value = document.createElement("span");
            value.textContent = item.quantity > 1
              ? `${item.quantity} × ${money(item.unitPriceCents)} = ${money(item.totalCents)}`
              : money(item.totalCents);
            li.append(value);
          }
          const serviceDescription = String(item.description || "").replace(laborNotice, "").trim();
          if (serviceDescription) {
            const description = document.createElement("small");
            description.textContent = serviceDescription;
            li.append(description);
          }
          return li;
        }),
      );
    } else show("services-card", false);
    const timeline = Array.isArray(snapshot.timeline)
      ? [...snapshot.timeline].reverse()
      : [];
    if (timeline.length) {
      show("timeline-card");
      $("timeline").replaceChildren(
        ...timeline.map((item) => {
          const row = document.createElement("div");
          row.className = "timeline-item";
          const dot = document.createElement("span");
          dot.className = "timeline-dot";
          const copy = document.createElement("div");
          const strong = document.createElement("strong");
          strong.textContent = item.status;
          const when = document.createElement("span");
          when.textContent = date(item.changedAt);
          copy.append(strong, when);
          row.append(dot, copy);
          return row;
        }),
      );
    } else show("timeline-card", false);
    show("loading", false);
    show("pin-form", false);
    show("error", false);
    const pickupRecorded = Boolean(snapshot.deliveredAt);
    if (pickupRecorded && tracking.evaluationSubmitted !== true) {
      show("tracking", false);
      const dialog = $("evaluation-dialog");
      if (!dialog.open) dialog.showModal();
    } else {
      show("tracking");
      scheduleStatusRefresh();
    }
  };
  const load = async () => {
    if (state.loading || state.approving) return;
    state.loading = true;
    try {
      render(await api());
    } catch (error) {
      if (error.code === "pin_required") {
        show("error", false);
        show("loading", false);
        show("pin-form");
        $("pin").focus();
      } else if (error.code === "pin_invalid") {
        show("loading", false);
        show("error", false);
        show("pin-form");
        show("pin-error");
        $("pin-error").textContent = error.message;
        $("pin").focus();
      } else fail(error.message, error.retryable === true);
    } finally { state.loading = false; }
  };
  $("evaluation-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const stars = document.querySelector("#evaluation-form input[name='stars']:checked")?.value || "";
    if (!stars || !state.token) return;
    const choices = [...document.querySelectorAll("#evaluation-form .evaluation-choices input:checked")].map((input) => input.value);
    const submit = $("evaluation-submit");
    show("evaluation-error", false);
    submit.disabled = true;
    submit.textContent = "Enviando avaliação…";
    try {
      render(await api("feedback", "", null, "", { stars: Number(stars), tags: choices }));
      $("evaluation-dialog").close();
    } catch (error) {
      show("evaluation-error");
      $("evaluation-error").textContent = error?.message || "Não foi possível enviar sua avaliação. Confira a conexão e tente novamente.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Enviar avaliação e abrir atendimento";
    }
  });
  (document.querySelectorAll?.("#evaluation-form input[name='stars']") || []).forEach((input) => {
    input.addEventListener("change", () => {
      show("evaluation-error", false);
      const selected = Number(input.value);
      document.querySelectorAll(".evaluation-stars label").forEach((label) => {
        const value = Number(label.htmlFor?.replace("evaluation-star-", ""));
        label.classList.toggle("is-selected", value <= selected);
      });
    });
  });
  $("close-photo").addEventListener("click", () => $("photo-dialog").close());
  $("photo-dialog").addEventListener("close", () => $("photo-large").removeAttribute("src"));
  $("retry").addEventListener("click", async () => {
    $("retry").disabled = true;
    $("retry").textContent = "Consultando…";
    await load();
    $("retry").disabled = false;
    $("retry").textContent = "Tentar novamente";
  });
  $("pin").addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
    show("pin-error", false);
  });
  $("pin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const pin = $("pin").value.trim();
    if (!/^\d{4}$/.test(pin)) {
      show("pin-error");
      $("pin-error").textContent = "Digite os 4 números.";
      return;
    }
    state.pin = pin;
    $("pin-submit").disabled = true;
    $("pin-submit").textContent = "Consultando…";
    await load();
    $("pin-submit").disabled = false;
    $("pin-submit").textContent = "Ver acompanhamento";
  });
  $("refresh").addEventListener("click", async () => {
    $("refresh").disabled = true;
    $("refresh").textContent = "Atualizando…";
    await load();
    $("refresh").disabled = false;
    $("refresh").textContent = "Atualizar agora";
  });
  const submitApproval = async (decision, note = "") => {
    if (state.approving) return;
    if (!$("approval-check").checked) {
      show("approval-feedback");
      $("approval-feedback").className = "approval-feedback error";
      $("approval-feedback").textContent = "Primeiro marque que entendeu o valor e os serviços.";
      return;
    }
    if (decision === "approved" && state.signatureMode === "required" && !state.signatureDrawn) {
      show("approval-feedback");
      $("approval-feedback").className = "approval-feedback error";
      $("approval-feedback").textContent = "Assine no quadro antes de aprovar.";
      $("approval-signature-canvas").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    state.approving = true;
    $("approve-quote").disabled = true;
    $("reject-quote").disabled = true;
    $("approval-feedback").hidden = false;
    $("approval-feedback").className = "approval-feedback";
    $("approval-feedback").textContent = "Registrando sua decisão…";
    try {
      const signature = decision === "approved" && state.signatureDrawn && typeof $("approval-signature-canvas").toDataURL === "function"
        ? { dataUrl: $("approval-signature-canvas").toDataURL("image/png"), signedAt: new Date().toISOString() }
        : null;
      render(await api("approve", decision, signature, note));
    } catch (error) {
      $("approval-feedback").className = "approval-feedback error";
      $("approval-feedback").textContent = error.message || "Não foi possível registrar sua decisão.";
      $("approve-quote").disabled = false;
      $("reject-quote").disabled = false;
    } finally { state.approving = false; }
  };
  const openApprovalSignature = () => {
    if (!$("approval-check").checked) {
      show("approval-feedback");
      $("approval-feedback").className = "approval-feedback error";
      $("approval-feedback").textContent = "Primeiro marque que entendeu o valor e os serviços.";
      return;
    }
    $("approval-signature").classList.add("is-fullscreen");
    document.body.classList.add("approval-signature-open");
  };
  const closeApprovalSignature = () => {
    $("approval-signature").classList.remove("is-fullscreen");
    document.body.classList.remove("approval-signature-open");
  };
  $("approve-quote").addEventListener("click", () => {
    if (state.signatureMode !== "disabled") openApprovalSignature();
    else void submitApproval("approved");
  });
  $("cancel-approval-signature").addEventListener("click", closeApprovalSignature);
  $("confirm-approval-signature").addEventListener("click", () => void submitApproval("approved"));
  $("reject-quote").addEventListener("click", () => {
    show("rejection-choice");
    $("rejection-choice").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("cancel-rejection").addEventListener("click", () => show("rejection-choice", false));
  $("confirm-rejection").addEventListener("click", () => void submitApproval(
    "rejected",
    $("rejection-reason").value || "Cliente não aprovou o serviço",
  ));
  const signatureCanvas = $("approval-signature-canvas");
  const signatureContext = typeof signatureCanvas.getContext === "function"
    ? signatureCanvas.getContext("2d", { alpha: true }) : null;
  if (signatureContext) {
    signatureContext.strokeStyle = "#111827";
    signatureContext.lineWidth = 4;
    signatureContext.lineCap = "round";
    signatureContext.lineJoin = "round";
  }
  let signing = false;
  const signaturePoint = (event) => {
    const bounds = signatureCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * signatureCanvas.width / bounds.width,
      y: (event.clientY - bounds.top) * signatureCanvas.height / bounds.height,
    };
  };
  signatureCanvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    signing = true;
    signatureCanvas.setPointerCapture(event.pointerId);
    const point = signaturePoint(event);
    signatureContext?.beginPath();
    signatureContext?.moveTo(point.x, point.y);
  });
  signatureCanvas.addEventListener("pointermove", (event) => {
    if (!signing) return;
    event.preventDefault();
    const point = signaturePoint(event);
    signatureContext?.lineTo(point.x, point.y);
    signatureContext?.stroke();
    state.signatureDrawn = true;
  });
  const stopSigning = () => { signing = false; };
  signatureCanvas.addEventListener("pointerup", stopSigning);
  signatureCanvas.addEventListener("pointercancel", stopSigning);
  $("clear-approval-signature").addEventListener("click", () => {
    signatureContext?.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    state.signatureDrawn = false;
  });
  document.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.tracking && !state.loading)
      void load();
  });
  window.addEventListener?.("pagehide", () => {
    clearInterval(state.timer);
    clearTimeout(state.expiryTimer);
    clearTimeout(state.statusTimer);
  });
  const rawFragment = location.hash.slice(1);
  const params = new URLSearchParams(rawFragment);
  const tokenFromAddress = params.get("token") || rawFragment;
  const tokenStorageKey = "assistencia_customer_link_token";
  const navigationEntry = typeof performance !== "undefined"
    ? performance.getEntriesByType("navigation")[0]
    : null;
  const isReload = navigationEntry && navigationEntry.type === "reload";
  try {
    if (TOKEN_PATTERN.test(tokenFromAddress)) {
      sessionStorage.setItem(tokenStorageKey, tokenFromAddress);
      state.token = tokenFromAddress;
    } else if (isReload && !rawFragment && history.state?.linkToken === sessionStorage.getItem(tokenStorageKey)) {
      state.token = sessionStorage.getItem(tokenStorageKey) || "";
    }
  } catch {
    state.token = tokenFromAddress;
  }
  history.replaceState(TOKEN_PATTERN.test(state.token) ? { linkToken: state.token } : null, "", location.pathname);
  if (!TOKEN_PATTERN.test(state.token))
    return fail(
      "O endereço está incompleto. Abra novamente o link enviado pela assistência.",
    );
  void load();
})();
