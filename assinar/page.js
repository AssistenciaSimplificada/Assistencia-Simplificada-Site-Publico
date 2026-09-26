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
  history.replaceState(null, "", location.pathname + location.search);
  const canvas = $("signature");
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let drawn = false;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  canvas.addEventListener("pointerdown", (event) => {
    drawing = true; show("submit-error", false); canvas.setPointerCapture(event.pointerId);
    const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const p = point(event); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#14202b"; ctx.lineTo(p.x, p.y); ctx.stroke(); drawn = true;
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  $("clear").addEventListener("click", () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; });
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
      return body;
    } finally { clearTimeout(timeout); }
  }
  request("read").then((data) => {
    $("public-number").textContent = data.publicNumber || "Documento";
    $("device-label").textContent = data.deviceLabel || "";
    $("signer-name").textContent = data.signerName || "";
    $("disclosure").textContent = data.disclosure || "";
    $("expiry").textContent = new Date(data.expiresAt).toLocaleString("pt-BR");
    show("loading", false); show("document", true);
  }).catch((error) => fail(error instanceof Error ? error.message : "Não foi possível abrir este link. Verifique sua conexão ou solicite um novo à loja."));
  $("signature-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    show("submit-error", false);
    if (!drawn) { $("submit-error").textContent = "Desenhe sua assinatura antes de continuar."; show("submit-error", true); return; }
    if (!$("accept").checked) { $("submit-error").textContent = "Confirme a leitura do documento."; show("submit-error", true); return; }
    $("submit").disabled = true;
    try {
      await request("sign", { accepted: true, signature: canvas.toDataURL("image/png") });
      show("document", false); show("success", true);
    } catch (error) {
      $("submit-error").textContent = error instanceof Error ? error.message : "Não foi possível assinar.";
      show("submit-error", true);
    } finally { $("submit").disabled = false; }
  });
})();
