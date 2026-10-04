(() => {
  "use strict";
  const money = cents => Number(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const addText = (parent, tag, value) => { const node = document.createElement(tag); node.textContent = value; parent.append(node); return node; };
  window.assistenciaCustomerSummary = (tracking) => {
    document.querySelector("#customer-summary")?.remove();
    const snapshot = tracking.snapshot;
    const section = document.createElement("section"); section.id = "customer-summary"; section.className = "detail-card customer-summary";
    addText(section, "small", "SEU ATENDIMENTO EM RESUMO");
    const payment = snapshot.paymentSummary;
    if (payment && [payment.totalCents, payment.receivedCents, payment.balanceCents].every(value => Number.isSafeInteger(value) && value >= 0) && payment.receivedCents + payment.balanceCents === payment.totalCents) {
      const amounts = document.createElement("dl"); amounts.className = "customer-payment-summary";
      for (const [label, value] of [["Total", payment.totalCents], ["Recebido", payment.receivedCents], ["Restante", payment.balanceCents]]) { const item = document.createElement("div"); addText(item, "dt", label); addText(item, "dd", money(value)); amounts.append(item); }
      section.append(amounts);
    }
    const pickup = snapshot.pickupDetails;
    if (pickup && /retirada/i.test(snapshot.status) && !snapshot.deliveredAt) {
      addText(section, "h2", "Combine sua retirada");
      if (pickup.address) addText(section, "p", `Endereço: ${pickup.address}`);
      if (pickup.hours) addText(section, "p", `Atendimento: ${pickup.hours}`);
      addText(section, "p", "Leve a referência do atendimento. Se outra pessoa for retirar, combine a autorização com a loja.");
      if (pickup.accessories) addText(section, "p", `Confira os acessórios: ${pickup.accessories}`);
    }
    const phone = String(pickup?.phone || "").replace(/\D/g, "");
    if (phone.length >= 8) {
      const link = document.createElement("a");link.textContent = "Falar com a loja sobre este atendimento";link.className = "customer-context-contact";link.target = "_blank";link.rel = "noopener noreferrer";
      link.href = `https://wa.me/${phone.startsWith("55") ? phone : `55${phone}`}?text=${encodeURIComponent(`Olá! Gostaria de tirar uma dúvida sobre meu atendimento ${tracking.publicNumber || ""}, referente a ${snapshot.deviceSummary || "meu aparelho"}.`)}`;section.append(link);
    }
    addText(section, "h2", "Documentos do atendimento");
    const documents = (Array.isArray(snapshot.documents) ? snapshot.documents : []).slice(0, 3);
    for (const documentInfo of documents) {
      if (!["quote", "receipt", "warranty"].includes(documentInfo.kind) || !/^data:application\/pdf;base64,JVBERi0[A-Za-z0-9+/=]+$/.test(String(documentInfo.dataUrl)) || documentInfo.dataUrl.length > 670000) continue;
      const button = document.createElement("button");button.type = "button";button.textContent = `Baixar ${String(documentInfo.label).slice(0, 120)}`;
      button.addEventListener("click", () => {
        try {
          const decoded = atob(documentInfo.dataUrl.split(",")[1]); const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = String(documentInfo.fileName || "documento.pdf").replace(/[/\\]/g, "_"); anchor.click();setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch { addText(section, "p", "Não foi possível baixar este documento. Solicite uma cópia à loja."); }
      });section.append(button);
    }
    if (!documents.length) addText(section, "p", "Os documentos aparecem aqui depois que a loja os gerar e sincronizar. Você também pode solicitar uma cópia diretamente à loja.");
    if (snapshot.documentsUnavailable?.length) addText(section, "p", "Alguns documentos precisam ser atualizados ou enviados diretamente pela loja.");
    const firstCard = document.querySelector("#tracking .status-card") || document.querySelector("#tracking > section");
    if (firstCard) firstCard.after(section); else document.querySelector("#tracking").prepend(section);
  };
})();
