(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function safeJSONParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  const K_USERS   = "ep_users";
  const K_SESSION = "ep_session";
  const K_ADDR    = "ep_address";

  function loadUsers() {
    return safeJSONParse(localStorage.getItem(K_USERS) || "[]", []);
  }
  function saveUsers(users) {
    localStorage.setItem(K_USERS, JSON.stringify(users));
  }

  function getSession() {
    return safeJSONParse(localStorage.getItem(K_SESSION) || "null", null);
  }
  function setSession(sess) {
    localStorage.setItem(K_SESSION, JSON.stringify(sess));
  }
  function clearSession() {
    localStorage.removeItem(K_SESSION);
  }

  const MEDS = [
    { name: "Paracetamol 500mg", price: 10 },
    { name: "Omeprazole 20mg", price: 12 },
    { name: "Cetirizine 10mg", price: 8 },
    { name: "Vitamin C", price: 15 },
    { name: "Azithromycin 500mg", price: 35 },
    { name: "Napa", price: 6 },
    { name: "Napa Extra", price: 12 },
  ];

  function searchMeds(q) {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return [];
    const exact = MEDS.filter(m => m.name.toLowerCase() === s);
    const contains = MEDS.filter(m => m.name.toLowerCase().includes(s) && m.name.toLowerCase() !== s);
    return [...exact, ...contains].slice(0, 6);
  }

  const routes = {
    "#home": "page-home",
    "#register": "page-register",
    "#login": "page-login",
    "#dashboard": "page-dashboard",
    "#about": "page-about",
    "#features": "page-features",
    "#contact": "page-contact",
  };

  function showPage(hash) {
    const target = routes[hash] || routes["#home"];
    $$(".page").forEach(p => p.classList.add("hidden"));
    const el = $("#" + target);
    if (el) el.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function refreshAuthUI() {
    const sess = getSession();

    const badge = $("#userBadge");
    const btnLogin = $("#btnLogin");
    const btnLogout = $("#btnLogout");

    const homeDash = $("#homeDashboardBtn");
    const homeGetStarted = $("#homeGetStartedBtn");

    if (sess) {
      if (badge) {
        badge.textContent = `Hi, ${sess.name || sess.email}`;
        badge.classList.remove("hidden");
      }
      if (btnLogin) btnLogin.classList.add("hidden");
      if (btnLogout) btnLogout.classList.remove("hidden");

      // ✅ logged in: show Dashboard, hide Get Started
      if (homeDash) homeDash.classList.remove("hidden");
      if (homeGetStarted) homeGetStarted.classList.add("hidden");
    } else {
      if (badge) badge.classList.add("hidden");
      if (btnLogin) btnLogin.classList.remove("hidden");
      if (btnLogout) btnLogout.classList.add("hidden");

      // ✅ logged out: show Get Started, hide Dashboard
      if (homeDash) homeDash.classList.add("hidden");
      if (homeGetStarted) homeGetStarted.classList.remove("hidden");
    }
  }

  function requireLogin() {
    if (!getSession()) {
      toast("Please login first.");
      location.hash = "#login";
      return false;
    }
    return true;
  }

  const dashboardAPI = { refresh: () => {} };

  function handleRoute() {
    let hash = location.hash || "#home";

    if (hash === "#dashboard" && !getSession()) {
      toast("Please login first.");
      location.hash = "#login";
      return;
    }

    showPage(hash);
    refreshAuthUI();

    if (hash === "#dashboard") dashboardAPI.refresh();
  }

  function wireNav() {
    $$("[data-link]").forEach(el => {
      el.addEventListener("click", (e) => {
        const href = el.getAttribute("href") || el.getAttribute("data-link");
        if (!href) return;
        if (href.startsWith("#")) {
          e.preventDefault();
          location.hash = href;
        }
      });
    });
  }

  function wireAuth() {
    const registerForm = $("#registerForm");
    const loginForm = $("#loginForm");
    const btnLogout = $("#btnLogout");

    if (registerForm) {
      registerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const form = e.currentTarget;

        const name = String(form.name.value || "").trim();
        const email = normalizeEmail(form.email.value);
        const password = String(form.password.value || "");

        if (name.length < 2) return toast("Name must be at least 2 characters.");
        if (!email.includes("@")) return toast("Enter a valid email.");
        if (password.length < 6) return toast("Password must be at least 6 characters.");

        const users = loadUsers();
        if (users.some(u => u.email === email)) return toast("This email is already registered.");

        users.push({ name, email, password }); // demo only
        saveUsers(users);

        toast("Registered successfully! Now login.");
        form.reset();
        location.hash = "#login";
      });
    }

    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const form = e.currentTarget;

        const email = normalizeEmail(form.email.value);
        const password = String(form.password.value || "");

        const users = loadUsers();
        const user = users.find(u => u.email === email && u.password === password);
        if (!user) return toast("Invalid email or password.");

        setSession({ name: user.name, email: user.email });
        refreshAuthUI();

        toast("Login successful.");
        form.reset();
        location.hash = "#home";
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        clearSession();
        refreshAuthUI();
        toast("Logged out.");
        location.hash = "#home";
      });
    }
  }

  function wireDashboard() {
    const searchBtn = $("#searchBtn");
    const searchInput = $("#searchInput");
    const searchResults = $("#searchResults");

    const addressInput = $("#addressInput");
    const saveAddressBtn = $("#saveAddressBtn");
    const addressStatus = $("#addressStatus");

    function renderResults(hits, q) {
      if (!searchResults) return;
      if (!q.trim()) { searchResults.textContent = "Type a medicine name to search."; return; }
      if (hits.length === 0) { searchResults.textContent = "No results found."; return; }
      searchResults.textContent = hits.map(m => `${m.name} — ৳${m.price}`).join(" | ");
    }

    function doSearch() {
      if (!requireLogin()) return;
      const q = searchInput?.value || "";
      renderResults(searchMeds(q), q);
    }

    if (searchBtn) searchBtn.addEventListener("click", doSearch);

    if (searchInput) {
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          doSearch();
        }
      });

      searchInput.addEventListener("input", () => {
        if (!getSession()) return;
        const q = searchInput.value || "";
        renderResults(searchMeds(q), q);
      });
    }

    if (saveAddressBtn && addressInput) {
      saveAddressBtn.addEventListener("click", () => {
        if (!requireLogin()) return;
        const addr = String(addressInput.value || "").trim();
        if (addr.length < 4) return toast("Please enter a valid address.");
        localStorage.setItem(K_ADDR, addr);
        if (addressStatus) addressStatus.textContent = "Saved ✔";
        toast("Delivery address saved.");
      });
    }

    function restoreSavedBits() {
      if (addressInput) {
        const addr = localStorage.getItem(K_ADDR);
        if (addr) addressInput.value = addr;
      }
      if (addressStatus) {
        const addr = localStorage.getItem(K_ADDR);
        addressStatus.textContent = addr ? "Saved ✔" : "";
      }
      if (searchResults) searchResults.textContent = "Type a medicine name to search.";
    }

    dashboardAPI.refresh = () => restoreSavedBits();
    dashboardAPI.refresh();
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireNav();
    wireAuth();
    wireDashboard();
    refreshAuthUI();

    window.addEventListener("hashchange", handleRoute);
    handleRoute();
  });
})();
