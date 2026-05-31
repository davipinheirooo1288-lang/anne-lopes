const WHATSAPP_URL = "https://wa.me/5511974138009?text=Olá,%20Dra.%20Anne.%20Vi%20seu%20site%20e%20gostaria%20de%20falar%20com%20a%20advogada.";

const updateWhatsAppLinks = () => {
  document.querySelectorAll(".whatsapp-link").forEach((link) => {
    link.href = WHATSAPP_URL;
  });
};

const enableSmoothAnchors = () => {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const targetId = anchor.getAttribute("href");
      if (!targetId || targetId === "#") return;

      const target = document.querySelector(targetId);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", targetId);
    });
  });
};

const enableRevealAnimations = () => {
  const sections = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  sections.forEach((section) => {
    if (!section.classList.contains("is-visible")) {
      observer.observe(section);
    }
  });
};

const enableFaqPopover = () => {
  const popover = document.querySelector(".faq-popover");
  const title = document.querySelector("#faq-popover-title");
  const answer = document.querySelector("#faq-popover-answer");
  const close = document.querySelector(".faq-popover__close");
  const faqButtons = document.querySelectorAll(".faq-hotspot");

  if (!popover || !title || !answer || !close) return;

  const hidePopover = () => {
    popover.hidden = true;
    faqButtons.forEach((button) => button.setAttribute("aria-expanded", "false"));
  };

  faqButtons.forEach((button) => {
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      title.textContent = button.dataset.question || "Pergunta frequente";
      answer.textContent = button.dataset.answer || "";
      popover.hidden = false;
      faqButtons.forEach((item) => item.setAttribute("aria-expanded", "false"));
      button.setAttribute("aria-expanded", "true");
      close.focus({ preventScroll: true });
    });
  });

  close.addEventListener("click", hidePopover);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popover.hidden) {
      hidePopover();
    }
  });
};

const protectAgainstHorizontalOverflow = () => {
  const width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  document.documentElement.dataset.overflowX = document.documentElement.scrollWidth > width + 1 ? "true" : "false";
};

window.addEventListener("load", protectAgainstHorizontalOverflow);
window.addEventListener("resize", protectAgainstHorizontalOverflow);

document.addEventListener("DOMContentLoaded", () => {
  updateWhatsAppLinks();
  enableSmoothAnchors();
  enableRevealAnimations();
  enableFaqPopover();
});
