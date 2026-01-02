(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // UI preview image
  const UI_PREVIEW_IMAGE_URL = "https://www.medznat.ru/uploads/images/post/5243/16487947395243.jpg";

  // localStorage keys
  const K_USERS   = "ep_users";
  const K_SESSION = "ep_session";
  const K_ORDERS  = "ep_orders";
  const K_MEDS    = "ep_meds_cache";

  // per-user address key helper (backward compatible)
  const K_ADDR_GLOBAL = "ep_address";
  const addrKey = (email) => `ep_address_${String(email || "").toLowerCase()}`;

  // ---------- helpers ----------
  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  function safeJSONParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function uid(prefix = "ID") {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }

  function fmtDate(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return String(ts || "");
    }
  }

  // ---------- storage ----------
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

  function loadOrders() {
    return safeJSONParse(localStorage.getItem(K_ORDERS) || "[]", []);
  }
  function saveOrders(orders) {
    localStorage.setItem(K_ORDERS, JSON.stringify(orders));
  }

  function loadMedsCache() {
    return safeJSONParse(localStorage.getItem(K_MEDS) || "null", null);
  }
  function saveMedsCache(meds) {
    localStorage.setItem(K_MEDS, JSON.stringify(meds));
  }

  function getSavedAddress(email) {
    const k = addrKey(email);
    const v = localStorage.getItem(k);
    if (v) return v;
    // backward compat
    return localStorage.getItem(K_ADDR_GLOBAL) || "";
  }

  function setSavedAddress(email, value) {
    localStorage.setItem(addrKey(email), value);
    // keep global too (compat)
    localStorage.setItem(K_ADDR_GLOBAL, value);
  }

  // ---------- seed demo accounts (Phase 3) ----------
  function ensureDemoAccounts() {
    const users = loadUsers();

    const ensure = (email, password, name, role) => {
      const e = normalizeEmail(email);
      const exists = users.some(u => normalizeEmail(u.email) === e);
      if (!exists) users.push({ name, email: e, password, role });
    };

    ensure("admin@epharmacy.com", "Admin123", "Admin", "admin");
    ensure("delivery@epharmacy.com", "Delivery123", "Delivery Rider", "delivery");

    saveUsers(users);
  }

  // ---------- routing ----------
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
        const roleLabel = sess.role ? ` (${sess.role})` : "";
        badge.textContent = `Hi, ${sess.name || sess.email}${roleLabel}`;
        badge.classList.remove("hidden");
      }
      if (btnLogin) btnLogin.classList.add("hidden");
      if (btnLogout) btnLogout.classList.remove("hidden");

      // logged in: show Dashboard, hide Get Started
      if (homeDash) homeDash.classList.remove("hidden");
      if (homeGetStarted) homeGetStarted.classList.add("hidden");
    } else {
      if (badge) badge.classList.add("hidden");
      if (btnLogin) btnLogin.classList.remove("hidden");
      if (btnLogout) btnLogout.classList.add("hidden");

      // logged out: show Get Started, hide Dashboard
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

  // ---------- auth ----------
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
        if (users.some(u => normalizeEmail(u.email) === email)) return toast("This email is already registered.");

        // Phase 3: default role = customer
        users.push({ name, email, password, role: "customer" });
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
        const user = users.find(u => normalizeEmail(u.email) === email && u.password === password);
        if (!user) return toast("Invalid email or password.");

        setSession({ name: user.name, email: user.email, role: user.role || "customer" });
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

  // ---------- meds catalog ----------
  const MEDS_URL = "data/medicines.json";
  let MEDS = [];

  async function ensureCatalogLoaded() {
    // priority: localStorage cache (so admin stock updates persist)
    const cached = loadMedsCache();
    if (Array.isArray(cached) && cached.length > 0) {
      MEDS = cached;
      return;
    }

    // else load from JSON and cache
    try {
      const res = await fetch(MEDS_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load medicines.json");
      const meds = await res.json();
      if (Array.isArray(meds)) {
        MEDS = meds;
        saveMedsCache(meds);
        return;
      }
    } catch (e) {
      // fallback tiny list
      MEDS = [
        { id:"MED001", name:"Paracetamol", strength:"500mg", form:"Tablet", price:10, stock:120, manufacturer:"Demo" },
        { id:"MED002", name:"Napa", strength:"500mg", form:"Tablet", price:6, stock:85, manufacturer:"Demo" }
      ];
      saveMedsCache(MEDS);
    }
  }

  function displayName(m) {
    return `${m.name} ${m.strength} (${m.form})`;
  }

  function searchMeds(q) {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return [];
    const hits = MEDS.filter(m => displayName(m).toLowerCase().includes(s));
    return hits.slice(0, 10);
  }

  // ---------- orders ----------
  function getDeliveryUsers() {
    return loadUsers().filter(u => (u.role || "") === "delivery");
  }

  function addOrder(order) {
    const orders = loadOrders();
    orders.unshift(order); // newest first
    saveOrders(orders);
  }

  function updateOrder(orderId, patch) {
    const orders = loadOrders();
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx < 0) return false;
    orders[idx] = { ...orders[idx], ...patch, updatedAt: Date.now() };
    saveOrders(orders);
    return true;
  }

  function myOrders(email) {
    const e = normalizeEmail(email);
    return loadOrders().filter(o => normalizeEmail(o.userEmail) === e);
  }

  function allOrders() {
    return loadOrders();
  }

  function assignedOrders(deliveryEmail) {
    const e = normalizeEmail(deliveryEmail);
    return loadOrders().filter(o => normalizeEmail(o.assignedTo) === e);
  }

  // ---------- dashboard ----------
  function wireDashboard() {
    const searchBtn = $("#searchBtn");
    const searchInput = $("#searchInput");
    const searchResults = $("#searchResults");
    const medDetails = $("#medDetails");

    const addressInput = $("#addressInput");
    const saveAddressBtn = $("#saveAddressBtn");
    const addressStatus = $("#addressStatus");

    const myOrdersBox = $("#myOrdersBox");

    const adminPanel = $("#adminPanel");
    const adminOrdersBox = $("#adminOrdersBox");

    const deliveryPanel = $("#deliveryPanel");
    const deliveryOrdersBox = $("#deliveryOrdersBox");

    let selectedMed = null;

    function renderResults(hits, q) {
      if (!searchResults) return;

      const query = String(q || "").trim();
      if (!query) {
        searchResults.innerHTML = `<div class="muted tiny">Type a medicine name to search.</div>`;
        if (medDetails) medDetails.classList.add("hidden");
        selectedMed = null;
        return;
      }

      if (hits.length === 0) {
        searchResults.innerHTML = `<div class="muted tiny">No results found.</div>`;
        if (medDetails) medDetails.classList.add("hidden");
        selectedMed = null;
        return;
      }

      searchResults.innerHTML = hits.map(m => {
        const out = Number(m.stock) <= 0;
        const badgeText = out ? "Out of stock" : `Stock: ${m.stock}`;
        return `
          <button class="result-item" type="button" data-med-id="${m.id}">
            <div class="result-top">
              <div>
                <div style="font-weight:700;">${displayName(m)}</div>
                <div class="muted tiny">${m.manufacturer || "—"}</div>
              </div>
              <div class="badge ${out ? "out" : ""}">${badgeText}</div>
            </div>
            <div class="muted tiny" style="margin-top:6px;">Price: ৳${m.price}</div>
          </button>
        `;
      }).join("");

      $$(".result-item").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-med-id");
          const m = MEDS.find(x => String(x.id) === String(id));
          if (!m || !medDetails) return;
          selectedMed = m;
          renderMedDetails(m);
        });
      });
    }

    function renderMedDetails(m) {
      const sess = getSession();
      if (!sess || !medDetails) return;

      const out = Number(m.stock) <= 0;
      const role = sess.role || "customer";

      // Order Request UI
      let orderBlock = `
        <div style="margin-top:10px;">
          <div class="row" style="gap:10px;">
            <input id="orderQty" type="number" min="1" max="99" value="1" />
            <button id="placeOrderBtn" class="btn btn-primary" type="button" ${out ? "disabled" : ""}>
              ${out ? "Out of Stock" : "Request Order"}
            </button>
          </div>
          <div class="muted tiny" style="margin-top:8px;">
            Tip: Save your address in Delivery Details before ordering.
          </div>
        </div>
      `;

      // Admin stock update UI
      let adminStockBlock = "";
      if (role === "admin") {
        adminStockBlock = `
          <div style="margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,.10);">
            <div class="muted tiny" style="margin-bottom:8px;">Admin: Update Stock</div>
            <div class="row" style="gap:10px;">
              <input id="stockInput" type="number" min="0" value="${Number(m.stock) || 0}" />
              <button id="updateStockBtn" class="btn btn-ghost" type="button">Update</button>
            </div>
          </div>
        `;
      }

      medDetails.classList.remove("hidden");
      medDetails.innerHTML = `
        <h4>Medicine Details</h4>
        <div class="muted-line"><b>Name:</b> ${m.name}</div>
        <div class="muted-line"><b>Strength:</b> ${m.strength}</div>
        <div class="muted-line"><b>Form:</b> ${m.form}</div>
        <div class="muted-line"><b>Manufacturer:</b> ${m.manufacturer || "—"}</div>
        <div class="muted-line"><b>Price:</b> ৳${m.price}</div>
        <div class="muted-line"><b>Status:</b> ${out ? "Out of stock" : "Available"}</div>
        ${orderBlock}
        ${adminStockBlock}
      `;

      const placeBtn = $("#placeOrderBtn");
      if (placeBtn && !out) {
        placeBtn.addEventListener("click", () => {
          placeOrder(m);
        });
      }

      const updateStockBtn = $("#updateStockBtn");
      if (updateStockBtn && role === "admin") {
        updateStockBtn.addEventListener("click", () => {
          const stockInput = $("#stockInput");
          const newStock = Math.max(0, parseInt(stockInput?.value || "0", 10) || 0);

          // update in memory + cache
          const idx = MEDS.findIndex(x => x.id === m.id);
          if (idx >= 0) {
            MEDS[idx] = { ...MEDS[idx], stock: newStock };
            saveMedsCache(MEDS);
            toast("Stock updated.");
            // re-render details and results
            renderMedDetails(MEDS[idx]);
            const q = searchInput?.value || "";
            renderResults(searchMeds(q), q);
          }
        });
      }
    }

    function placeOrder(m) {
      const sess = getSession();
      if (!sess) return;

      const qtyEl = $("#orderQty");
      const qty = Math.max(1, Math.min(99, parseInt(qtyEl?.value || "1", 10) || 1));

      const addr = String(addressInput?.value || getSavedAddress(sess.email) || "").trim();
      if (addr.length < 4) {
        toast("Please save your address first.");
        return;
      }

      // Phase 2: order request record
      const order = {
        id: uid("ORD"),
        userEmail: sess.email,
        userName: sess.name || sess.email,
        address: addr,
        item: {
          medId: m.id,
          name: m.name,
          strength: m.strength,
          form: m.form,
          qty,
          price: m.price
        },
        status: "Pending",
        assignedTo: "",
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      addOrder(order);
      toast("Order requested (Pending).");
      renderMyOrders();
      renderAdminOrders();
      renderDeliveryOrders();
    }

    function renderMyOrders() {
      const sess = getSession();
      if (!sess || !myOrdersBox) return;

      const mine = myOrders(sess.email);
      if (mine.length === 0) {
        myOrdersBox.innerHTML = `<div class="muted tiny">No orders yet.</div>`;
        return;
      }

      myOrdersBox.innerHTML = mine.slice(0, 20).map(o => {
        const itemTxt = `${o.item.name} ${o.item.strength} (${o.item.form}) × ${o.item.qty}`;
        const assigned = o.assignedTo ? `Assigned: ${o.assignedTo}` : "Not assigned";
        const canCancel = (o.status === "Pending");

        return `
          <div class="order-card">
            <div class="rowline">
              <div><b>Order:</b> ${o.id.slice(-10)}</div>
              <div class="badge">${o.status}</div>
            </div>
            <div class="small-muted" style="margin-top:6px;">${itemTxt}</div>
            <div class="small-muted">Address: ${o.address}</div>
            <div class="small-muted">${assigned}</div>
            <div class="small-muted">Created: ${fmtDate(o.createdAt)}</div>
            ${canCancel ? `<button class="btn btn-ghost" type="button" data-cancel="${o.id}" style="margin-top:8px;">Cancel</button>` : ``}
          </div>
        `;
      }).join("");

      $$("[data-cancel]").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-cancel");
          const ok = updateOrder(id, { status: "Cancelled" });
          if (ok) {
            toast("Order cancelled.");
            renderMyOrders();
            renderAdminOrders();
            renderDeliveryOrders();
          }
        });
      });
    }

    function renderAdminOrders() {
      const sess = getSession();
      if (!sess || (sess.role !== "admin")) {
        if (adminPanel) adminPanel.classList.add("hidden");
        return;
      }
      if (adminPanel) adminPanel.classList.remove("hidden");
      if (!adminOrdersBox) return;

      const orders = allOrders();
      if (orders.length === 0) {
        adminOrdersBox.innerHTML = `<div class="muted tiny">No orders found.</div>`;
        return;
      }

      const deliveryUsers = getDeliveryUsers();

      adminOrdersBox.innerHTML = orders.slice(0, 50).map(o => {
        const itemTxt = `${o.item.name} ${o.item.strength} (${o.item.form}) × ${o.item.qty}`;
        const statusOptions = ["Pending","Approved","Rejected","Shipped","Delivered","Cancelled"].map(s =>
          `<option value="${s}" ${o.status===s?"selected":""}>${s}</option>`
        ).join("");

        const deliveryOptions =
          `<option value="">Unassigned</option>` +
          deliveryUsers.map(u => `<option value="${u.email}" ${normalizeEmail(o.assignedTo)===normalizeEmail(u.email)?"selected":""}>${u.email}</option>`).join("");

        return `
          <div class="order-card">
            <div class="rowline">
              <div><b>${o.id.slice(-10)}</b> • ${o.userEmail}</div>
              <div class="badge">${o.status}</div>
            </div>
            <div class="small-muted" style="margin-top:6px;">${itemTxt}</div>
            <div class="small-muted">Address: ${o.address}</div>

            <div class="rowline" style="margin-top:10px;">
              <div style="flex:1; min-width:200px;">
                <div class="small-muted">Status</div>
                <select class="select" data-status="${o.id}">${statusOptions}</select>
              </div>

              <div style="flex:1; min-width:200px;">
                <div class="small-muted">Assign Delivery</div>
                <select class="select" data-assign="${o.id}">${deliveryOptions}</select>
              </div>

              <div style="align-self:end;">
                <button class="btn btn-ghost" type="button" data-save-admin="${o.id}">Save</button>
              </div>
            </div>

            <div class="small-muted" style="margin-top:8px;">
              Updated: ${fmtDate(o.updatedAt || o.createdAt)}
            </div>
          </div>
        `;
      }).join("");

      $$("[data-save-admin]").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-save-admin");
          const st = document.querySelector(`[data-status="${id}"]`);
          const as = document.querySelector(`[data-assign="${id}"]`);
          const newStatus = st ? st.value : "Pending";
          const newAssign = as ? as.value : "";

          updateOrder(id, { status: newStatus, assignedTo: newAssign });
          toast("Order updated.");
          renderAdminOrders();
          renderMyOrders();
          renderDeliveryOrders();
        });
      });
    }

    function renderDeliveryOrders() {
      const sess = getSession();
      if (!sess || (sess.role !== "delivery")) {
        if (deliveryPanel) deliveryPanel.classList.add("hidden");
        return;
      }
      if (deliveryPanel) deliveryPanel.classList.remove("hidden");
      if (!deliveryOrdersBox) return;

      const orders = assignedOrders(sess.email);
      if (orders.length === 0) {
        deliveryOrdersBox.innerHTML = `<div class="muted tiny">No assigned orders.</div>`;
        return;
      }

      deliveryOrdersBox.innerHTML = orders.slice(0, 50).map(o => {
        const itemTxt = `${o.item.name} ${o.item.strength} (${o.item.form}) × ${o.item.qty}`;
        const canDeliver = (o.status === "Shipped" || o.status === "Approved");

        return `
          <div class="order-card">
            <div class="rowline">
              <div><b>${o.id.slice(-10)}</b></div>
              <div class="badge">${o.status}</div>
            </div>
            <div class="small-muted" style="margin-top:6px;">Customer: ${o.userEmail}</div>
            <div class="small-muted">${itemTxt}</div>
            <div class="small-muted">Address: ${o.address}</div>
            <div class="small-muted">Created: ${fmtDate(o.createdAt)}</div>

            ${canDeliver ? `
              <button class="btn btn-primary" type="button" data-delivered="${o.id}" style="margin-top:10px;">
                Mark Delivered
              </button>
            ` : `
              <div class="small-muted" style="margin-top:10px;">Waiting for admin to ship/approve.</div>
            `}
          </div>
        `;
      }).join("");

      $$("[data-delivered]").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-delivered");
          updateOrder(id, { status: "Delivered" });
          toast("Marked as Delivered.");
          renderDeliveryOrders();
          renderAdminOrders();
          renderMyOrders();
        });
      });
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

    // Delivery details (save per-user)
    if (saveAddressBtn && addressInput) {
      saveAddressBtn.addEventListener("click", () => {
        const sess = getSession();
        if (!sess) return toast("Please login first.");
        const addr = String(addressInput.value || "").trim();
        if (addr.length < 4) return toast("Please enter a valid address.");
        setSavedAddress(sess.email, addr);
        if (addressStatus) addressStatus.textContent = "Saved ✔";
        toast("Delivery address saved.");
      });
    }

    async function initDashboard() {
      await ensureCatalogLoaded();
      restoreSavedBits();
      renderMyOrders();
      renderAdminOrders();
      renderDeliveryOrders();
    }

    function restoreSavedBits() {
      const sess = getSession();
      if (sess && addressInput) {
        const addr = getSavedAddress(sess.email);
        if (addr) addressInput.value = addr;
      }
      if (addressStatus) {
        const sess2 = getSession();
        const addr2 = sess2 ? getSavedAddress(sess2.email) : "";
        addressStatus.textContent = addr2 ? "Saved ✔" : "";
      }
      if (searchResults) searchResults.innerHTML = `<div class="muted tiny">Type a medicine name to search.</div>`;
      if (medDetails) medDetails.classList.add("hidden");
      selectedMed = null;

      // Role panels visibility handled in renderAdminOrders / renderDeliveryOrders
    }

    dashboardAPI.refresh = () => {
      restoreSavedBits();
      renderMyOrders();
      renderAdminOrders();
      renderDeliveryOrders();
    };

    initDashboard();
  }

  // ---------- UI preview ----------
  function initUIPreviewImage() {
    const img = $("#uiPreviewImg");
    const placeholders = $("#uiPreviewPlaceholders");
    if (!img || !placeholders) return;

    const url = String(UI_PREVIEW_IMAGE_URL || "").trim();
    if (!url) return;

    img.src = url;
    img.classList.remove("hidden");
    placeholders.classList.add("hidden");

    img.addEventListener("error", () => {
      img.classList.add("hidden");
      placeholders.classList.remove("hidden");
    }, { once: true });
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    ensureDemoAccounts();

    wireNav();
    wireAuth();
    wireDashboard();

    refreshAuthUI();
    initUIPreviewImage();

    window.addEventListener("hashchange", handleRoute);
    handleRoute();
  });
})();
