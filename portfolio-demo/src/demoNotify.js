// Portfolio demo: a short message at the bottom of the screen ("In your deployment this would…").
let box = null, timer = null;
export function notify(text, { ms = 5200 } = {}) {
  if (typeof document === "undefined" || !text) return;
  if (!box) {
    box = document.createElement("div");
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    box.dataset.demoNote = "";
    Object.assign(box.style, {
      position: "fixed", left: "50%", bottom: "calc(24px + env(safe-area-inset-bottom, 0px))", transform: "translateX(-50%) translateY(8px)",
      maxWidth: "min(560px, calc(100vw - 32px))", padding: "12px 16px", borderRadius: "12px", zIndex: 2147483000,
      background: "rgba(17, 34, 54, 0.96)", color: "#fff", font: "500 14px/1.45 Inter, 'Segoe UI', Arial, sans-serif",
      boxShadow: "0 10px 30px rgba(0,0,0,.25)", opacity: "0", transition: "opacity .2s ease, transform .2s ease", pointerEvents: "none",
    });
    document.body.appendChild(box);
  }
  box.textContent = text;
  requestAnimationFrame(() => { box.style.opacity = "1"; box.style.transform = "translateX(-50%) translateY(0)"; });
  clearTimeout(timer);
  timer = setTimeout(() => { box.style.opacity = "0"; box.style.transform = "translateX(-50%) translateY(8px)"; }, ms);
}
