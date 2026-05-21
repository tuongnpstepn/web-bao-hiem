/**
 * ShieldCare — Đại lý Bảo hiểm (frontend, deploy Vercel)
 */
(function () {
  "use strict";

  // URL backend Render (Web Service)
  const API_URL = "https://web-bao-hiem.onrender.com";
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function onDomReady() {
    console.log("Frontend ready");
    initNavScroll();
    initMobileNav();
    initSmoothScroll();
    initConsultationForm();
    initFooterYear();
  }

  function initNavScroll() {
    const header = document.getElementById("site-header");
    if (!header) return;

    function updateScrolled() {
      header.classList.toggle("is-scrolled", window.scrollY > 16);
    }

    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
  }

  function initMobileNav() {
    const header = document.getElementById("site-header");
    const toggle = document.getElementById("nav-toggle");
    const menu = document.getElementById("nav-menu");
    if (!header || !toggle || !menu) return;

    function setOpen(open) {
      header.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
      document.body.style.overflow = open ? "hidden" : "";
    }

    toggle.addEventListener("click", function () {
      setOpen(!header.classList.contains("nav-open"));
    });

    menu.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function () {
        if (window.matchMedia("(max-width: 768px)").matches) {
          setOpen(false);
        }
      });
    });

    window.addEventListener("resize", function () {
      if (!window.matchMedia("(max-width: 768px)").matches) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && header.classList.contains("nav-open")) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  function initSmoothScroll() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener("click", function (e) {
        const id = this.getAttribute("href");
        if (!id || id === "#") return;

        const target = document.querySelector(id);
        if (!target) return;

        e.preventDefault();
        const header = document.getElementById("site-header");
        const offset = header ? header.offsetHeight : 0;
        const top = target.getBoundingClientRect().top + window.scrollY - offset - 8;

        window.scrollTo({
          top: Math.max(0, top),
          behavior: reduceMotion ? "auto" : "smooth",
        });

        if (history.replaceState) {
          history.replaceState(null, "", id);
        }
      });
    });
  }

  function initConsultationForm() {
    const form = document.getElementById("consultation-form");
    if (!form) return;

    const successEl = document.getElementById("form-success");
    const apiErrorEl = document.getElementById("form-api-error");
    const submitBtn = form.querySelector('button[type="submit"]');

    const fields = [
      {
        input: document.getElementById("full-name"),
        errorId: "error-full-name",
        validate: function (v) {
          return v.trim() ? "" : "Vui lòng nhập họ và tên.";
        },
      },
      {
        input: document.getElementById("phone"),
        errorId: "error-phone",
        validate: function (v) {
          return v.trim() ? "" : "Vui lòng nhập số điện thoại.";
        },
      },
      {
        input: document.getElementById("email"),
        errorId: "error-email",
        validate: function (v) {
          if (!v.trim()) return "Vui lòng nhập email.";
          return EMAIL_REGEX.test(v.trim()) ? "" : "Email không hợp lệ.";
        },
      },
      {
        input: document.getElementById("insurance-type"),
        errorId: "error-insurance-type",
        validate: function (v) {
          return v ? "" : "Vui lòng chọn loại bảo hiểm.";
        },
      },
    ];

    function clearFieldErrors() {
      fields.forEach(function (f) {
        if (!f.input) return;
        f.input.removeAttribute("aria-invalid");
        const err = document.getElementById(f.errorId);
        if (err) err.textContent = "";
      });
    }

    function hideApiError() {
      if (!apiErrorEl) return;
      apiErrorEl.hidden = true;
      apiErrorEl.textContent = "";
    }

    function showApiError(message) {
      if (apiErrorEl) {
        apiErrorEl.textContent = message;
        apiErrorEl.hidden = false;
        apiErrorEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      alert(message);
    }

    function setSubmitting(isSubmitting) {
      if (!submitBtn) return;
      submitBtn.disabled = isSubmitting;
      submitBtn.textContent = isSubmitting ? "Đang gửi..." : "Gửi yêu cầu";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearFieldErrors();
      hideApiError();
      if (successEl) successEl.hidden = true;

      let firstInvalid = null;

      fields.forEach(function (f) {
        if (!f.input) return;
        const msg = f.validate(f.input.value);
        if (msg) {
          f.input.setAttribute("aria-invalid", "true");
          const errEl = document.getElementById(f.errorId);
          if (errEl) errEl.textContent = msg;
          if (!firstInvalid) firstInvalid = f.input;
        }
      });

      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      const payload = {
        fullName: document.getElementById("full-name").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        email: document.getElementById("email").value.trim(),
        insuranceType: document.getElementById("insurance-type").value,
      };

      setSubmitting(true);

      fetch(API_URL + "/api/consultation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              return { ok: response.ok, status: response.status, data: data };
            });
        })
        .then(function (result) {
          if (result.ok && result.data && result.data.success === true) {
            form.reset();
            hideApiError();
            if (successEl) successEl.hidden = false;
            return;
          }

          const serverMsg =
            (result.data && (result.data.error || (result.data.errors && result.data.errors.join(", ")))) ||
            "Gửi yêu cầu thất bại (mã " + result.status + "). Vui lòng thử lại.";
          showApiError(serverMsg);
        })
        .catch(function () {
          showApiError(
            "Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau vài phút."
          );
        })
        .finally(function () {
          setSubmitting(false);
        });
    });
  }

  function initFooterYear() {
    const el = document.getElementById("year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDomReady);
  } else {
    onDomReady();
  }
})();
