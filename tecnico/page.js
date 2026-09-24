(() => {
  "use strict";
  const TOKEN_PATTERN = /^(?:[A-Za-z0-9_-]{43}|[A-F0-9]{5}\.[A-Za-z0-9_-]{22})$/;
  const API_URL = window.__ASSISTENCIA_PUBLIC_CONFIG__?.apiUrl;
  if (!API_URL) throw new Error("A configuração pública do painel técnico não foi carregada.");
  const DEFAULT_DIAGNOSIS = "O defeito relatado pelo cliente foi constatado durante a avaliação técnica.";
  const $ = (id) => document.getElementById(id);
  const state = { token: "", pin: "", services: [] };
  const fail = (message, retryable = false) => {
    $("loading").hidden = true;
    $("form").hidden = true;
    $("pin-form").hidden = true;
    $("error-text").textContent = message;
    $("error").hidden = false;
    $("retry").hidden = !retryable;
  };
  const api = async (body) => {
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
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "Este link expirou ou já foi utilizado.");
      error.code = data.error || "request_failed";
      error.requiresPin = data.requiresPin === true;
      error.retryable = response.status >= 500 || response.status === 408 || response.status === 429;
      throw error;
    }
    return data;
    } catch (error) {
      if (controller.signal.aborted || error instanceof TypeError) {
        const unavailable = new Error("Não foi possível conectar à assistência. Confira sua conexão e tente novamente. Seu preenchimento foi mantido.");
        unavailable.code = "network_unavailable";
        unavailable.retryable = true;
        throw unavailable;
      }
      throw error;
    } finally { clearTimeout(timeout); }
  };
  const cents = (value) => {
    const raw = String(value).trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
    if (!/^\d+(?:[.,]\d+)*$/.test(raw)) return null;
    const separator = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
    let whole = raw;
    let fraction = "";
    if (separator >= 0) {
      const tail = raw.slice(separator + 1);
      const separatorCount = (raw.match(/[.,]/g) || []).length;
      if (tail.length <= 2) {
        whole = raw.slice(0, separator).replace(/[.,]/g, "");
        fraction = tail.padEnd(2, "0");
      } else if (tail.length === 3 || separatorCount > 1) {
        whole = raw.replace(/[.,]/g, "");
      } else return null;
    }
    if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) return null;
    const result = Number(whole) * 100 + Number(fraction || 0);
    return Number.isSafeInteger(result) && result >= 1 && result <= 99999999 ? result : null;
  };
  const updateEvaluationProgress = () => {
    const serviceRoots = [...$("services").querySelectorAll(".service")];
    const completed = serviceRoots.filter((serviceRoot) => {
      const serviceName = serviceRoot.querySelector("input[data-service-name]");
      if (serviceName && serviceName.value.trim().length < 3) return false;
      const outcome = serviceRoot.querySelector("select[data-service-outcome]")?.value || "standard";
      const priced = ["standard", "labor_only"].includes(outcome);
      if (!priced)
        return (serviceRoot.querySelector("input[data-service-outcome-note]")?.value.trim().length || 0) >= 3;
      const prices = [...serviceRoot.querySelectorAll("input[data-option-value]")];
      return prices.length > 0 && prices.every((input) => cents(input.value) !== null);
    }).length;
    const total = serviceRoots.length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    $("completion-chart").value = percent;
    $("completion-chart").textContent = `${percent}%`;
    $("completion-percent").textContent = `${percent}%`;
    $("services-count").textContent = String(total);
    $("services-complete").textContent = String(completed);
    $("services-pending").textContent = String(Math.max(0, total - completed));
    $("completion-message").textContent = percent === 100
      ? "Avaliação completa. Revise as informações antes de enviar."
      : `${Math.max(0, total - completed)} ${total - completed === 1 ? "serviço ainda precisa" : "serviços ainda precisam"} de informação.`;
  };
  const addOption = (serviceRoot, service, optionIndex) => {
    const option = document.createElement("div");
    option.className = "service-option";
    const fields = document.createElement("div");
    fields.className = "service-option-fields";
    const descriptionLabel = document.createElement("label");
    descriptionLabel.textContent = "Nome desta opção";
    const description = document.createElement("input");
    description.type = "text";
    description.autocomplete = "off";
    description.maxLength = 80;
    description.value = `Opção ${optionIndex + 1}`;
    description.placeholder = "Ex.: Original ou compatível premium";
    description.dataset.optionLabel = service.id;
    descriptionLabel.append(description);
    const priceLabel = document.createElement("label");
    priceLabel.textContent = "Valor unitário";
    const wrap = document.createElement("span");
    wrap.className = "price-wrap";
    const prefix = document.createElement("span");
    prefix.textContent = "R$";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.placeholder = "0,00";
    input.required = true;
    input.dataset.optionValue = service.id;
    input.setAttribute("aria-label", `Valor de ${service.name}, opção ${optionIndex + 1}`);
    wrap.append(prefix, input);
    priceLabel.append(wrap);
    fields.append(descriptionLabel, priceLabel);
    option.append(fields);
    const optionsRoot = serviceRoot.querySelector(".service-options");
    optionsRoot.append(option);
    if (optionsRoot.children.length > 1) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-option";
      remove.textContent = "Remover esta opção";
      remove.addEventListener("click", () => {
        option.remove();
        const addButton = serviceRoot.querySelector(".add-option");
        if (addButton) addButton.disabled = false;
        updateEvaluationProgress();
      });
      option.append(remove);
    }
  };
  const render = (invite) => {
    state.services = Array.isArray(invite.services) ? invite.services : [];
    $("store").textContent = invite.storeName;
    $("number").textContent = invite.publicNumber;
    $("device").textContent = invite.deviceSummary;
    $("reported").textContent = invite.reportedDefect;
    $("expiry").textContent = `Disponível até ${new Date(invite.expiresAt).toLocaleString("pt-BR")}.`;
    const root = $("services");
    root.replaceChildren();
    for (const [index, service] of invite.services.entries()) {
      const row = document.createElement("div");
      row.className = "service";
      row.dataset.serviceId = service.id;
      const name = document.createElement("strong");
      name.textContent = `${index + 1}. ${service.name}`;
      row.append(name);
      if (service.description) {
        const description = document.createElement("small");
        description.textContent = service.description;
        row.append(description);
      }
      if (service.requiresServiceName) {
        const serviceNameLabel = document.createElement("label");
        serviceNameLabel.className = "technician-service-name";
        serviceNameLabel.textContent = "Serviço que será realizado";
        const serviceName = document.createElement("input");
        serviceName.type = "text";
        serviceName.autocomplete = "off";
        serviceName.maxLength = 200;
        serviceName.required = true;
        serviceName.dataset.serviceName = "";
        serviceName.placeholder = "Ex.: Troca do conector de carga";
        serviceNameLabel.append(serviceName);
        row.append(serviceNameLabel);
      }
      const outcomeFields = document.createElement("div");
      outcomeFields.className = "service-outcome-fields";
      const outcomeLabel = document.createElement("label");
      outcomeLabel.textContent = "Como este serviço deve seguir?";
      const outcome = document.createElement("select");
      outcome.dataset.serviceOutcome = "";
      [
        ["standard", "Reparo completo (peça e/ou serviço)"],
        ["labor_only", "Somente mão de obra"],
        ["part_unavailable", "Peça indisponível"],
        ["service_unsupported", "Não trabalhamos com este serviço"],
        ["not_repairable", "Reparo tecnicamente inviável"],
      ].forEach(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        outcome.append(option);
      });
      outcomeLabel.append(outcome);
      const noteLabel = document.createElement("label");
      noteLabel.textContent = "Observação para a assistência";
      const note = document.createElement("input");
      note.dataset.serviceOutcomeNote = "";
      note.maxLength = 300;
      note.placeholder = "Ex.: fornecedor sem previsão ou reparo sem segurança";
      noteLabel.append(note);
      outcomeFields.append(outcomeLabel, noteLabel);
      row.append(outcomeFields);
      const options = document.createElement("div");
      options.className = "service-options";
      row.append(options);
      addOption(row, service, 0);
      row.dataset.nextOptionNumber = "2";
      const add = document.createElement("button");
      add.type = "button";
      add.className = "add-option";
      add.textContent = "+ Adicionar outra opção de valor";
      add.addEventListener("click", () => {
        if (options.children.length >= 8) return;
        const nextOptionNumber = Number(row.dataset.nextOptionNumber || 2);
        addOption(row, service, nextOptionNumber - 1);
        row.dataset.nextOptionNumber = String(nextOptionNumber + 1);
        if (options.children.length >= 8) add.disabled = true;
        updateEvaluationProgress();
      });
      row.append(add);
      const refreshOutcome = () => {
        const priced = ["standard", "labor_only"].includes(outcome.value);
        options.hidden = !priced;
        add.hidden = !priced || outcome.value === "labor_only";
        note.required = !priced;
        if (outcome.value === "labor_only") {
          const label = row.querySelector("input[data-option-label]");
          if (label && (!label.value.trim() || /^Opção \d+$/i.test(label.value.trim())))
            label.value = "Mão de obra";
        }
      };
      outcome.addEventListener("change", refreshOutcome);
      refreshOutcome();
      root.append(row);
    }
    updateEvaluationProgress();
    $("loading").hidden = true;
    $("error").hidden = true;
    $("pin-form").hidden = true;
    $("form").hidden = false;
  };
  const showPinGate = (message = "") => {
    $("loading").hidden = true;
    $("error").hidden = true;
    $("form").hidden = true;
    $("pin-form").hidden = false;
    $("pin-error").textContent = message;
    $("pin-error").hidden = !message;
    $("pin").focus();
  };
  $("pin").addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 12);
    $("pin-error").hidden = true;
  });
  $("pin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if ($("pin-submit").disabled) return;
    const pin = $("pin").value.trim();
    if (!/^\d{4,12}$/.test(pin)) return showPinGate("Digite de 4 a 12 números.");
    $("pin-submit").disabled = true;
    $("pin-submit").textContent = "Verificando…";
    try {
      const data = await api({ action: "read", token: state.token, pin });
      state.pin = pin;
      $("pin").value = "";
      $("pin-form").hidden = true;
      render(data.invite);
    } catch (error) {
      if (error.code === "pin_invalid") showPinGate(error.message);
      else fail(error.message, error.retryable === true);
    } finally {
      $("pin-submit").disabled = false;
      $("pin-submit").textContent = "Abrir atendimento";
    }
  });
  $("form").addEventListener("input", updateEvaluationProgress);
  $("form").addEventListener("change", updateEvaluationProgress);
  $("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if ($("submit").disabled) return;
    document.getElementById("submit-error")?.remove();
    const diagnosis = $("diagnosis").value.trim() || DEFAULT_DIAGNOSIS;
    const values = [];
    for (const service of state.services) {
      const serviceRoot = [...$("services").querySelectorAll(".service")].find((row) => row.dataset.serviceId === service.id);
      const outcome = serviceRoot.querySelector("select[data-service-outcome]").value || "standard";
      const note = serviceRoot.querySelector("input[data-service-outcome-note]").value.trim();
      const serviceNameInput = serviceRoot.querySelector("input[data-service-name]");
      const serviceName = serviceNameInput?.value.trim() || "";
      if (service.requiresServiceName && serviceName.length < 3) {
        serviceNameInput.focus();
        serviceNameInput.setCustomValidity("Informe qual serviço será realizado.");
        serviceNameInput.reportValidity();
        serviceNameInput.setCustomValidity("");
        return;
      }
      const priced = ["standard", "labor_only"].includes(outcome);
      const options = priced ? [...serviceRoot.querySelectorAll(".service-option")] : [];
      const normalizedOptions = [];
      for (const option of options) {
        const label = option.querySelector("input[data-option-label]");
        const input = option.querySelector("input[data-option-value]");
        const unitPriceCents = cents(input.value);
        if (unitPriceCents === null) {
          input.focus();
          input.setCustomValidity("Informe um valor válido maior que zero.");
          input.reportValidity();
          input.setCustomValidity("");
          return;
        }
        normalizedOptions.push({
          label: label.value.trim() || `Opção ${normalizedOptions.length + 1}`,
          unitPriceCents,
        });
      }
      if (!priced && note.length < 3) {
        const noteInput = serviceRoot.querySelector("input[data-service-outcome-note]");
        noteInput.focus();
        noteInput.setCustomValidity("Explique brevemente o motivo desta conclusão.");
        noteInput.reportValidity();
        noteInput.setCustomValidity("");
        return;
      }
      values.push({
        id: service.id,
        outcome,
        note,
        options: normalizedOptions,
        ...(service.requiresServiceName ? { serviceName } : {}),
      });
    }
    const outcomes = values.map((item) => item.outcome);
    const evaluationResult = outcomes.includes("not_repairable")
      ? "not_repairable"
      : outcomes.includes("part_unavailable") && !outcomes.some((outcome) => ["standard", "labor_only"].includes(outcome))
        ? "awaiting_part"
        : outcomes.some((outcome) => ["service_unsupported", "part_unavailable"].includes(outcome))
          ? "repair_with_reservations"
          : "repair_recommended";
    $("submit").disabled = true;
    $("submit").textContent = "Enviando…";
    try {
      await api({ action: "submit", token: state.token, pin: state.pin, diagnosedDefect: diagnosis, evaluationResult, serviceValues: values });
      $("form").hidden = true;
      $("success").hidden = false;
      state.pin = "";
      try { sessionStorage.removeItem("assistencia_technician_link_token"); } catch {}
      history.replaceState(null, "", location.pathname);
    } catch (error) {
      const notice = document.createElement("p");
      notice.id = "submit-error";
      notice.setAttribute("role", "alert");
      notice.textContent = error instanceof Error ? error.message : "Não foi possível enviar agora. Tente novamente; seu preenchimento foi mantido.";
      $("submit").before(notice);
    } finally {
      $("submit").disabled = false;
      $("submit").textContent = "Enviar avaliação";
    }
  });
  const rawFragment = location.hash.slice(1);
  const params = new URLSearchParams(rawFragment);
  const tokenFromAddress = params.get("token") || rawFragment;
  const tokenStorageKey = "assistencia_technician_link_token";
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
  if (!TOKEN_PATTERN.test(state.token)) return fail("O endereço está incompleto ou inválido.");
  const load = async () => {
    $("retry").disabled = true;
    try {
      const data = await api({ action: "read", token: state.token, pin: state.pin });
      render(data.invite);
    } catch (error) {
      if (error.code === "pin_required" || error.code === "pin_invalid") showPinGate(error.message);
      else fail(error.message, error.retryable === true);
    } finally { $("retry").disabled = false; }
  };
  $("retry").addEventListener("click", load);
  void load();
})();
