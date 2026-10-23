(() => {
  "use strict";
  window.addEventListener("hashchange", () => location.reload());
  const apiUrl = window.__ASSISTENCIA_COMMERCE_SIGNATURE_CONFIG__?.apiUrl;
  const token = location.hash.slice(1);
  const $ = (id) => document.getElementById(id);
  const show = (id, visible) => { $(id).hidden = !visible; };
  const fail = (message) => { show("loading", false); show("document", false); show("success", false); $("error-text").textContent = message; show("error", true); };
  if (!apiUrl || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    fail("Este endereço está incompleto. Solicite um novo link à loja.");
    return;
  }
  history.replaceState(null, "", location.pathname + location.search + "#" + token);
  window.addEventListener("beforeunload", event => { if (!completed && (submitting || drawn)) { event.preventDefault(); event.returnValue = ""; } });
  const canvas = $("signature");
  const ctx = canvas.getContext("2d");
  let submitting = false;
  let completed = false;
  let drawing = false;
  let activePointerId = null;
  let drawn = false;
  let documentPdfUrl = "";
  const showDocumentPdf = (dataUrl) => {
    const match = /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ""));
    if (!match || match[1].length > 666_668) return;
    try {
      const binary = atob(match[1]);
      if (binary.length < 5 || binary.length > 500_000) return;
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      documentPdfUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      $("document-pdf").href = documentPdfUrl;
      show("document-pdf", true);
      return true;
    } catch { /* The signature form remains usable if this optional preview cannot be decoded. */ }
  };
  window.addEventListener("unload", () => { if (documentPdfUrl) URL.revokeObjectURL(documentPdfUrl); });
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (submitting || completed || activePointerId !== null || event.button !== 0) return;
    activePointerId = event.pointerId;
    document.body.classList.add("signature-drawing");
    window.getSelection()?.removeAllRanges();
    drawing = true; show("submit-error", false); canvas.setPointerCapture(event.pointerId);
    const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing || event.pointerId !== activePointerId) return;
    event.preventDefault();
    const p = point(event); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#14202b"; ctx.lineTo(p.x, p.y); ctx.stroke(); drawn = true;
  });
  const stop = (event) => {
    if (event?.pointerId !== undefined && event.pointerId !== activePointerId) return;
    const pointerId = activePointerId;
    drawing = false; activePointerId = null;
    document.body.classList.remove("signature-drawing");
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("lostpointercapture", stop);
  window.addEventListener("blur", () => stop());
  window.addEventListener("resize", () => stop());
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  const preventCanvasGesture = (event) => { if (event.cancelable) event.preventDefault(); };
  canvas.addEventListener("touchstart", preventCanvasGesture, { passive: false });
  canvas.addEventListener("contextmenu", preventCanvasGesture);
  for (const name of ["touchstart", "touchmove", "gesturestart", "gesturechange", "selectstart"]) {
    document.addEventListener(name, (event) => {
      if (activePointerId !== null) preventCanvasGesture(event);
    }, { passive: false });
  }
  $("clear").addEventListener("click", () => { if (submitting || completed) return; stop(); ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; });
  async function request(action, extra = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(apiUrl, { method: "POST", mode: "cors", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, token, ...extra }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 410
        ? "Este link expirou ou já foi utilizado. Solicite um novo link à loja."
        : "Não foi possível acessar o serviço de assinatura. Tente novamente.");
      if (action === "sign" && body?.accepted !== true) throw new Error("Não foi possível confirmar o recebimento da assinatura. Seu desenho foi mantido; tente novamente ou consulte a loja.");
      return body;
    } finally { clearTimeout(timeout); }
  }
  request("read").then((data) => {
    $("public-number").textContent = data.publicNumber || "Documento";
    $("device-label").textContent = data.deviceLabel || "";
    $("signer-name").textContent = data.signerName || "";
    $("disclosure").textContent = data.disclosure || "";
    $("expiry").textContent = new Date(data.expiresAt).toLocaleString("pt-BR");
    if (!showDocumentPdf(data.documentPdf)) {
      $("document-hint").textContent = "Este link foi criado em uma versão anterior. Confira também o PDF enviado pela loja; solicite uma via à loja caso ainda não tenha recebido.";
      $("accept-text").textContent = "Recebi e conferi o PDF enviado pela loja, li as condições acima e concordo em assinar este documento.";
    }
    show("loading", false); show("document", true);
  }).catch((error) => fail(error instanceof Error ? error.message : "Não foi possível abrir este link. Verifique sua conexão ou solicite um novo à loja."));
  $("signature-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || completed) return;
    stop();
    show("submit-error", false);
    if (!drawn) { $("submit-error").textContent = "Desenhe sua assinatura antes de continuar."; show("submit-error", true); return; }
    if (!$("accept").checked) { $("submit-error").textContent = "Confirme a leitura do documento."; show("submit-error", true); return; }
    submitting = true;
    $("signature-form").inert = true;
    $("submit").disabled = true;
    try {
      await request("sign", { accepted: true, signature: canvas.toDataURL("image/png") });
      completed = true;
      show("document", false); show("success", true);
    } catch (error) {
      $("submit-error").textContent = error instanceof Error ? error.message : "Não foi possível assinar.";
      show("submit-error", true);
    } finally { submitting = false; $("signature-form").inert = false; $("submit").disabled = completed; }
  });
})();
