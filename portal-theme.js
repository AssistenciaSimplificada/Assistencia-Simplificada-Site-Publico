(() => {
  "use strict";
  const storageKey = "assistencia-portal-theme";
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  try {
    const saved = localStorage.getItem(storageKey);
    if (["system", "light", "dark"].includes(saved)) preference = saved;
  } catch { /* O tema automático continua disponível sem armazenamento local. */ }

  const apply = () => {
    document.documentElement.dataset.portalTheme = preference === "system"
      ? (media.matches ? "dark" : "light")
      : preference;
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === preference));
    });
  };

  apply();
  media.addEventListener("change", apply);
  document.addEventListener("DOMContentLoaded", () => {
    const toolbar = document.createElement("div");
    toolbar.className = "portal-toolbar";
    const inner = document.createElement("div");
    inner.className = "portal-toolbar-inner";
    const security = document.createElement("span");
    security.className = "portal-security-label";
    security.textContent = "ACESSO SEGURO";
    const choices = document.createElement("div");
    choices.className = "portal-theme-choices";
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", "Aparência da página");
    for (const [value, label] of [["system", "Auto"], ["light", "Claro"], ["dark", "Escuro"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.themeChoice = value;
      button.textContent = label;
      button.addEventListener("click", () => {
        preference = value;
        try { localStorage.setItem(storageKey, preference); } catch { /* Mantém a escolha durante esta visita. */ }
        apply();
      });
      choices.append(button);
    }
    inner.append(security, choices);
    toolbar.append(inner);
    document.body.prepend(toolbar);
    apply();
  });
})();
