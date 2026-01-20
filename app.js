(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // UI preview: removed as requested
  // Top-level variables (hoisted)
  let searchInput, searchBtn, searchResults, medDetails;
  let addressInput, saveAddressBtn, addressStatus;
  let myOrdersBox, adminPanel, adminOrdersBox;
  let deliveryPanel, deliveryOrdersBox, adminUsersList;
  let cartItemsBox, cartTotalEl, paymentForm;
  let selectedMed = null;

  // localStorage keys
  const K_USERS = "ep_users";
  const K_SESSION = "ep_session";
  const K_ORDERS = "ep_orders";
  const K_MEDS = "ep_meds_cache_v3";
  const K_LOGS = "ep_activity_logs";

  // per-user address key helper (backward compatible)
  const K_ADDR_GLOBAL = "ep_address";

  // Constants
  const ORDER_STATUS = {
    PENDING: "Pending",
    APPROVED: "Approved",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled"
  };
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

  function initCartLogic() {
    const cartBtn = $("#btnCart");
    // const cartItemsBox = $("#cartItems"); // Used in renderCart inside render func

    // Wire Cart Button
    if (cartBtn) {
      cartBtn.onclick = (e) => {
        e.preventDefault();
        renderCart();
        showPage("#cart");
      };
    }

    updateCartBadge();
  }

  function initCheckoutLogic() {
    const btnCheckout = $("#btnCheckout");
    if (btnCheckout) {
      btnCheckout.onclick = () => {
        // Logic moved from wireDashboard
        const sess = getSession();
        if (!sess) {
          toast("Please login to checkout.");
          showPage("#login");
          return;
        }
        if (loadCart().length === 0) {
          toast("Cart is empty");
          return;
        }
        // Fix: Check Address before checkout
        const savedAddr = getSavedAddress(sess.email);

        // Let's rely on the variable `addressInput` if available or storage
        const currentAddr = addressInput ? addressInput.value : savedAddr;
        if (!currentAddr || currentAddr.length < 4) {
          toast("Please set your delivery address first.");
          showPage("#dashboard");
          if (addressInput) addressInput.focus();
          return;
        }

        showPage("#checkout");
        dashboardAPI.renderCheckout();
        // logic to show checkout form, usually handled by handleRoute/showPage
      };
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
  function ensureInitialAccounts() {
    const users = loadUsers();

    const ensure = (email, password, name, role) => {
      const e = normalizeEmail(email);
      const exists = users.some(u => normalizeEmail(u.email) === e);
      if (!exists) users.push({ name, email: e, password, role });
    };

    ensure("admin@epharmacy.com", "Admin123", "Admin", "admin");

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
    "#cart": "page-cart",
    "#checkout": "page-checkout",
  };

  function showPage(hash) {
    // console.log("Navigating to:", hash);
    const target = routes[hash] || routes["#home"];

    // Hide all pages
    $$(".page").forEach(p => p.classList.add("hidden"));

    // Show target
    const el = $("#" + target);
    if (el) {
      el.classList.remove("hidden");
    } else {
      console.error("Page not found:", target);
      // Fallback to home if page missing
      $("#page-home")?.classList.remove("hidden");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function refreshAuthUI() {
    const sess = getSession();
    const btnLogin = $("#btnLogin");
    const btnLogout = $("#btnLogout");
    const badge = $("#userBadge");
    const btnCart = $("#btnCart");
    const navDashboard = $("#navDashboard");
    const navManageUsers = $("#navManageUsers");

    // Mobile Mirrored Links
    const mobDashboard = $("#mobDashboard");
    const mobLogin = $("#mobLogin");
    const mobLogout = $("#mobLogout");

    // IDs for Home sections (Dashboard vs Get Started)
    const homeDash = $("#homeDash"); // Area showing 'My Dashboard' link or stats
    const homeGetStarted = $("#homeGetStarted"); // Area showing 'Login to access'


    if (sess) {
      if (badge) {
        const roleLabel = ""; // Removed role suffix (Customer/Admin) as requested
        badge.textContent = `Hi, ${sess.name || sess.email}${roleLabel}`;
        badge.classList.remove("hidden");
      }
      if (btnLogin) btnLogin.classList.add("hidden");
      if (btnLogout) btnLogout.classList.remove("hidden");
      if (btnCart) btnCart.classList.remove("hidden");
      if (navDashboard) navDashboard.classList.remove("hidden");

      if (mobDashboard) mobDashboard.classList.remove("hidden");
      if (mobLogin) mobLogin.classList.add("hidden");
      if (mobLogout) mobLogout.classList.remove("hidden");

      // logged in: show Dashboard, hide Get Started
      if (homeDash) homeDash.classList.remove("hidden");
      if (homeGetStarted) homeGetStarted.classList.add("hidden");

      // Admin Mode Global Toggle
      if (sess.role === "admin") {
        document.body.classList.add("is-admin");
        if (navManageUsers) navManageUsers.classList.remove("hidden");
        if (adminPanel) adminPanel.classList.remove("hidden");
      } else {
        document.body.classList.remove("is-admin");
        if (navManageUsers) navManageUsers.classList.add("hidden");
        if (adminPanel) adminPanel.classList.add("hidden");
      }
    } else {
      if (badge) badge.classList.add("hidden");
      if (btnLogin) btnLogin.classList.remove("hidden");
      if (btnLogout) btnLogout.classList.add("hidden");
      if (btnCart) btnCart.classList.add("hidden");
      if (navDashboard) navDashboard.classList.add("hidden");
      if (navManageUsers) navManageUsers.classList.add("hidden");

      if (mobDashboard) mobDashboard.classList.add("hidden");
      if (mobLogin) mobLogin.classList.remove("hidden");
      if (mobLogout) mobLogout.classList.add("hidden");

      // logged out: show Get Started, hide Dashboard
      if (homeDash) homeDash.classList.add("hidden");
      if (homeGetStarted) homeGetStarted.classList.remove("hidden");

      document.body.classList.remove("is-admin");
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

  const dashboardAPI = { refresh: () => { } };

  function handleRoute() {
    let hash = location.hash || "#home";

    // Protected Routes
    const protectedRoutes = ["#dashboard", "#cart", "#checkout"];
    if (protectedRoutes.includes(hash) && !getSession()) {
      toast("Please login first.");
      location.hash = "#login";
      return;
    }

    // Block checkout if cart is empty
    if (hash === "#checkout") {
      const cart = loadCart();
      if (cart.length === 0) {
        toast("Your cart is empty! Add medicines first.");
        location.hash = "#home";
        return;
      }
    }

    if (hash === "#dashboard") {
      // Ensure data is fresh when entering dashboard
      dashboardAPI.refresh();
    }

    showPage(hash);
    refreshAuthUI();

    // If specific page logic needed on route functions can go here
    if (hash === "#cart") {
      if (typeof dashboardAPI.renderCart === 'function') {
        dashboardAPI.renderCart();
      }
    }

    if (hash === "#checkout") {
      if (typeof dashboardAPI.renderCheckout === 'function') {
        dashboardAPI.renderCheckout();
      }
      // Ensure payment UI listeners are active
      if (typeof initPaymentUI === 'function') {
        initPaymentUI();
      }
    }
  }

  function wireNav() {
    document.body.addEventListener("click", (e) => {
      const target = e.target.closest("[data-link], [data-tab-link], a[href^='#']");
      if (!target) return;

      if (target.hasAttribute("data-tab-link")) {
        const tab = target.getAttribute("data-tab-link");
        showPage("#dashboard");
        // We'll need a global or exposed function for this
        if (window.switchAdminTab) window.switchAdminTab(tab);
        return;
      }

      const href = target.getAttribute("href") || target.getAttribute("data-link");
      if (href && href.startsWith("#")) {
        e.preventDefault();
        if (location.hash === href) {
          handleRoute();
        } else {
          location.hash = href;
        }
      }
    });

    // Mobile Menu Toggle
    const btnMenu = $("#btnMenuToggle");
    const navLinks = $("#navLinks");
    if (btnMenu && navLinks) {
      btnMenu.onclick = () => {
        btnMenu.classList.toggle("active");
        navLinks.classList.toggle("active");
      };

      // Close menu when clicking a link
      navLinks.addEventListener("click", (e) => {
        if (e.target.closest("a, [data-link]")) {
          btnMenu.classList.remove("active");
          navLinks.classList.remove("active");
        }
      });
    }
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

        logActivity("Registration", `New user registered: ${email}`);
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

        setSession({
          name: user.name,
          email: user.email,
          role: user.role || "customer",
          phone: user.phone || ""
        });
        logActivity("Login", `User ${user.email} logged in`);
        refreshAuthUI();

        toast("Login successful.");
        form.reset();
        location.hash = "#home";
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener("click", doLogout);
    }
    const mobLogout = $("#mobLogout");
    if (mobLogout) {
      mobLogout.addEventListener("click", (e) => {
        e.preventDefault();
        doLogout();
      });
    }
  }

  function doLogout() {
    const sess = getSession();
    if (sess) logActivity("Logout", `User ${sess.email} logged out`);
    clearSession();
    refreshAuthUI();
    toast("Logged out.");
    location.hash = "#home";
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

    // 2. load from JSON and cache
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
      console.warn("Fetch failed, using fallback", e);
      // fallback tiny list
      MEDS = [
        { id: "MED001", name: "Paracetamol", strength: "500mg", form: "Tablet", price: 10, stock: 120, manufacturer: "Demo" },
        { id: "MED002", name: "Napa", strength: "500mg", form: "Tablet", price: 6, stock: 85, manufacturer: "Demo" }
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

  // ---------- cart ----------
  // ---------- cart (User Specific) ----------
  function getCartKey() {
    const sess = getSession();
    if (!sess) return "ep_cart_guest";
    return `ep_cart_${normalizeEmail(sess.email)}`;
  }

  function loadCart() {
    return safeJSONParse(localStorage.getItem(getCartKey()) || "[]", []);
  }

  function saveCart(cart) {
    localStorage.setItem(getCartKey(), JSON.stringify(cart));
  }

  function addToCart(med, qty = 1) {
    if (!getSession()) {
      toast("Please login to add items to your cart.");
      location.hash = "#login";
      return;
    }
    const cart = loadCart();
    const existing = cart.find(i => i.medId === med.id);
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        medId: med.id,
        name: med.name,
        strength: med.strength,
        form: med.form,
        price: med.price,
        qty: qty
      });
    }
    saveCart(cart);
    toast(`Added ${qty} ${med.name}(s) to Cart`);
    updateCartBadge();
  }

  function removeFromCart(medId) {
    let cart = loadCart();
    cart = cart.filter(i => i.medId !== medId);
    saveCart(cart);
    updateCartBadge();
    return cart;
  }

  function clearCart() {
    localStorage.removeItem(getCartKey());
    updateCartBadge();
  }

  function getCartTotal() {
    return loadCart().reduce((sum, item) => sum + (item.price * item.qty), 0);
  }

  function updateCartBadge() {
    const cart = loadCart();
    const count = cart.reduce((acc, item) => acc + item.qty, 0);
    const badge = $("#cartBadge");
    if (badge) {
      badge.textContent = count > 0 ? count : "";
      badge.classList.toggle("hidden", count === 0);
    }
  }

  // ---------- feedback ----------
  const K_FEEDBACK = "ep_feedback";
  function saveFeedback(text, email) {
    const list = safeJSONParse(localStorage.getItem(K_FEEDBACK) || "[]", []);
    list.push({
      id: uid("FB"),
      email: email || "Anonymous",
      text,
      date: Date.now()
    });
    localStorage.setItem(K_FEEDBACK, JSON.stringify(list));
  }

  // ---------- logging ----------
  function logActivity(action, details = "") {
    const sess = getSession();
    const user = sess ? (sess.name || sess.email) : "Guest";
    const logs = safeJSONParse(localStorage.getItem(K_LOGS) || "[]", []);
    logs.unshift({
      id: uid("LOG"),
      user,
      action,
      details,
      time: Date.now()
    });
    // Keep max 50 logs
    if (logs.length > 50) logs.length = 50;
    localStorage.setItem(K_LOGS, JSON.stringify(logs));
  }

  // ---------- orders ----------
  // function getDeliveryUsers() { ... } // Removed unused

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

  // function assignedOrders(deliveryEmail) { ... } // Removed unused

  // ---------- Refactoring: Split Init Functions ----------

  function renderResultsContainer(hits, q, container) {
    if (!container) return;
    if (hits.length === 0) {
      container.innerHTML = `<div class="muted tiny">No results found for "${q}".</div>`;
      return;
    }
    container.innerHTML = hits.map(m => {
      const out = Number(m.stock) <= 0;
      const badgeText = out ? "Out of stock" : `Stock: ${m.stock}`;
      const imgUrl = m.image || 'https://via.placeholder.com/80?text=No+Img';

      return `
           <button class="result-item" type="button" data-view-med="${m.id}" style="width:100%; text-align:left; border:1px solid #333; padding:8px; margin-bottom:8px; border-radius:6px; background:rgba(30,30,46,0.8); display:flex; align-items:center; gap:12px;">
             <!-- Image Removed -->
             <div style="flex:1;">
               <div class="result-top" style="display:flex; justify-content:space-between;">
                 <div>
                   <div style="font-weight:700; color:var(--accent);">${displayName(m)}</div>
                   <div class="muted tiny">${m.manufacturer || "—"}</div>
                 </div>
                 <div class="badge ${out ? "out" : ""}">${badgeText}</div>
               </div>
               <div class="muted tiny" style="margin-top:6px;">Price: ৳${m.price}</div>
             </div>
           </button>
         `;
    }).join("");

    // Wire clicks
    container.querySelectorAll("[data-view-med]").forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-view-med");
        const m = MEDS.find(x => String(x.id) === String(id));
        if (m) {
          showPage("#dashboard");
          renderMedDetails(m);
        }
      };
    });
  }

  function initSearch() {
    const heroSearchBtn = $("#heroSearchBtn");
    const heroSearchInput = $("#heroSearchInput");
    const homeResultsArea = $("#homeResultsArea");
    const searchInput = $("#searchInput"); // Dashboard search
    // const searchBtn = $("#searchBtn"); // Dashboard btn (handled in wireDashboard)

    function doHeroSearch() {
      const q = heroSearchInput?.value || "";
      if (!q) return;
      const hits = searchMeds(q);

      if (homeResultsArea) {
        homeResultsArea.classList.remove("hidden");
        const target = homeResultsArea.querySelector("#homeSearchResults");
        if (target) renderResultsContainer(hits, q, target);
      }
      // Sync dashboard
      if (searchInput) searchInput.value = q;
    }

    if (heroSearchBtn) heroSearchBtn.addEventListener("click", doHeroSearch);
    if (heroSearchInput) {
      heroSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); doHeroSearch(); }
      });
    }
  }
  function wireDashboard() {
    initSearch();
    initCartLogic();
    initCheckoutLogic();

    // Existing Dashboard Elements (Assigned to top-level vars)
    searchBtn = $("#searchBtn");
    searchInput = $("#searchInput");
    searchResults = $("#dashboardSearchResults");
    medDetails = $("#medDetails");
    addressInput = $("#addressInput");
    saveAddressBtn = $("#saveAddressBtn");
    addressStatus = $("#addressStatus");
    myOrdersBox = $("#myOrdersBox");
    adminPanel = $("#adminPanel");
    adminOrdersBox = $("#adminOrdersBox");
    deliveryPanel = $("#deliveryPanel");
    deliveryOrdersBox = $("#deliveryOrdersBox");

    // Fix: Wire Dashboard Search
    if (searchBtn && searchInput) {
      const doDashSearch = () => {
        const q = searchInput.value.trim();
        if (!q) return;
        const hits = searchMeds(q);
        renderResults(hits, q);
      };
      searchBtn.onclick = doDashSearch;
      searchInput.onkeydown = (e) => {
        if (e.key === "Enter") { e.preventDefault(); doDashSearch(); }
      };

      // Auto-trigger if empty? No, wait for user.
      // But if value exists from Hero search sync, trigger it.
      searchInput.addEventListener("input", () => {
        if (searchInput.value.length === 0) {
          if (searchResults) searchResults.innerHTML = "";
          if (medDetails) medDetails.classList.add("hidden");
        }
      });
    }

    cartItemsBox = $("#cartItems");
    cartTotalEl = $("#cartTotal");
    paymentForm = $("#paymentForm");

    selectedMed = null;

    updateCartBadge();

    // Address Save Logic
    if (saveAddressBtn) {
      saveAddressBtn.onclick = () => {
        const val = addressInput.value.trim();
        if (!val) return;
        const sess = getSession();
        if (sess) {
          // simple save
          const key = `ep_address_${sess.email}`;
          localStorage.setItem(key, val);
          toast("Address saved.");
          if (addressStatus) addressStatus.textContent = "Saved ✔";
        }
      };
    }

    wirePrescriptionUpload(() => {
      if (searchBtn) searchBtn.click();
    });
  }

  function wirePrescriptionUpload(onExtracted) {
    const btnBrowse = $("#btnBrowsePrescription");
    const input = $("#prescriptionInput");
    const docInput = $("#searchInput");
    const overlay = $("#scanningOverlay");

    if (!btnBrowse || !input) return;

    btnBrowse.onclick = () => input.click();

    input.onchange = (e) => {
      if (!e.target.files || e.target.files.length === 0) return;

      // Show Scanning Animation
      if (overlay) overlay.classList.remove("hidden");

      // Simulate AI extraction (2.5 seconds)
      setTimeout(() => {
        if (overlay) overlay.classList.add("hidden");
        toast("Prescription analyzed! Medicines extracted.");

        // Mock extracted words: "Napa" and "Ace"
        if (docInput) {
          docInput.value = "Napa Ace";
          if (onExtracted) onExtracted();
        }

        // Reset input for next time
        input.value = "";
      }, 2500);
    };
  }


  function wireProfile() {
    const profName = $("#prof-name");
    const profEmail = $("#prof-email");
    const profPhone = $("#prof-phone");
    const profAddress = $("#prof-address");
    const profileForm = $("#profileForm");

    // Load Profile Data
    const sess = getSession();
    if (sess && profileForm) {
      if (profName) profName.value = sess.name || "";
      if (profEmail) profEmail.value = sess.email || "";
      if (profPhone) profPhone.value = sess.phone || "";

      // Sync address with delivery logic
      const savedAddr = getSavedAddress(sess.email);
      if (profAddress) profAddress.value = savedAddr || "";
    }

    if (profileForm) {
      profileForm.onsubmit = (e) => {
        e.preventDefault();
        const newName = profName.value.trim();
        const newPhone = profPhone.value.trim();
        const newAddr = profAddress.value.trim();

        if (newName.length < 2) { toast("Name too short"); return; }

        // Update Session
        const currentSess = getSession();
        if (!currentSess) return;

        currentSess.name = newName;
        currentSess.phone = newPhone;
        setSession(currentSess);

        // Update User DB
        const users = loadUsers();
        // findIndex on email
        const idx = users.findIndex(u => normalizeEmail(u.email) === normalizeEmail(currentSess.email));
        if (idx >= 0) {
          users[idx].name = newName;
          users[idx].phone = newPhone;
          saveUsers(users); // Persist to K_USERS
        }

        // Update Address
        if (newAddr) {
          setSavedAddress(currentSess.email, newAddr);
          if (addressInput) addressInput.value = newAddr; // Sync delivery panel
          if (addressStatus) addressStatus.textContent = "Saved ✔";
        }

        toast("Profile updated successfully!");
        logActivity("Profile Update", `User updated their profile details.`);
        refreshAuthUI(); // Update badge
      };
    }
  }

  function wireAdminInventory() {
    const form = $("#adminInventoryForm");
    if (!form) return;

    form.onsubmit = (e) => {
      e.preventDefault();
      const name = $("#inv-name").value.trim();
      const cat = $("#inv-cat").value;
      const price = parseFloat($("#inv-price").value);
      const stock = parseInt($("#inv-stock").value);

      if (!name || price <= 0 || stock < 0) {
        toast("Invalid input.");
        return;
      }

      const newId = "med_" + Date.now();
      const newMed = {
        id: newId,
        name: name,
        category: cat,
        price: price,
        stock: stock,
        desc: "Genuine medicine."
      };

      // Update Memory & Storage
      MEDS.push(newMed);
      saveMedsCache(MEDS);

      logActivity("Inventory Addition", `New medicine added: ${name}`);

      // Trigger Updates
      toast("Medicine Added: " + name);
      form.reset();

      // Dispatch event to update search/home results instantly
      renderTopSelling();
    };
  }

  // Compat with existing `renderResults` call
  function renderResults(hits, q) {
    const searchResults = $("#dashboardSearchResults");
    renderResultsContainer(hits, q, searchResults);
  }

  function renderMedDetails(m) {
    const medDetails = $("#medDetails");
    const sess = getSession();
    if (!sess || !medDetails) return;

    const out = Number(m.stock) <= 0;
    const role = sess.role || "customer";

    // Order Request UI -> Add to Cart
    let orderBlock = `
        <div style="margin-top:10px;">
          <div class="row" style="gap:10px;">
            <input id="orderQty" type="number" min="1" max="99" value="1" />
            <button id="addToCartBtn" class="btn btn-primary" type="button" ${out ? "disabled" : ""}>
              ${out ? "Out of Stock" : "Add to Cart"}
            </button>
          </div>
          <div class="muted tiny" style="margin-top:8px;">
            Add to cart then checkout.
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

    const addBtn = $("#addToCartBtn");
    if (addBtn && !out) {
      addBtn.addEventListener("click", () => {
        const qtyEl = $("#orderQty");
        const qty = Math.max(1, Math.min(99, parseInt(qtyEl?.value || "1", 10) || 1));
        addToCart(m, qty);
        toast(`Added ${qty} ${m.name}(s) to Cart`);
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
          renderTopSelling();
        }
      });
    }
  }

  function renderCart() {
    const box = $("#cartItems");
    // If box is missing (e.g. wrong page loaded or ID mismatch), we can't render.
    if (!box) {
      console.warn("renderCart: #cartItems not found");
      return;
    }

    const cart = loadCart();
    // Safe Sort A-Z
    try {
      cart.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    } catch (e) {
      console.error("Sort failed", e);
    }

    if (cart.length === 0) {
      box.innerHTML = `<div class="muted tiny">Cart is empty.</div>`;
      if (cartTotalEl) cartTotalEl.textContent = "0";
      return;
    }

    box.innerHTML = cart.map(item => `
        <div class="cart-item rowline">
          <div>
            <div style="font-weight:bold;">${item.name}</div>
            <div class="muted tiny">${item.strength} (${item.form})</div>
          </div>
          <div class="row" style="gap:10px;">
            <span>${item.qty} x ৳${item.price}</span>
            <button class="btn btn-ghost tiny-btn" data-remove-med="${item.medId}">×</button>
          </div>
        </div>
      `).join("");

    if (cartTotalEl) cartTotalEl.textContent = getCartTotal(); // Fix: removed hardcoded currency

    $$("[data-remove-med]").forEach(btn => {
      btn.addEventListener("click", () => {
        removeFromCart(btn.getAttribute("data-remove-med"));
        renderCart();
      });
    });
  }

  function processCheckout(method, payDetails) {
    const sess = getSession();
    const cart = loadCart();
    const addr = String(addressInput?.value || getSavedAddress(sess.email) || "").trim();

    if (addr.length < 4) {
      toast("Please save delivery address first");
      return;
    }

    // 1. Check Stock Availability & Reserve (Deduct)
    // We must reload fresh meds from cache to be sure
    const currentMeds = loadMedsCache() || MEDS;

    // Validation loop
    for (const item of cart) {
      const m = currentMeds.find(x => x.id === item.medId);
      if (!m) {
        toast(`Error: Medicine ${item.name} not found.`);
        return;
      }
      if (Number(m.stock) < item.qty) {
        toast(`Stock unavailable for ${item.name} (Only ${m.stock} left).`);
        return;
      }
    }

    // Deduction loop (Reserve Stock)
    for (const item of cart) {
      const idx = currentMeds.findIndex(x => x.id === item.medId);
      if (idx >= 0) {
        currentMeds[idx].stock = Number(currentMeds[idx].stock) - item.qty;
      }
    }
    // Save updated stock
    saveMedsCache(currentMeds);

    // Update global MEDS reference if needed
    MEDS.length = 0;
    MEDS.push(...currentMeds);

    // 2. Create Order
    const order = {
      id: uid("ORD"),
      userEmail: sess.email,
      userName: sess.name || sess.email,
      address: addr,
      items: cart,
      totalPrice: getCartTotal(),
      status: ORDER_STATUS.PENDING, // Payment successful -> Pending processing
      paymentStatus: "Unverified",
      paymentMethod: method,
      paymentDetails: payDetails,
      assignedTo: "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    addOrder(order);
    logActivity("Order Placed", `Order ${order.id} placed by ${sess.email}`);
    clearCart();
    toast("Payment Successful! Order Placed.");
    if (paymentForm) {
      paymentForm.reset();
      // Fix: Reset UI to Bkash (default)
      const bkashRadio = paymentForm.querySelector('input[value="bkash"]');
      if (bkashRadio) bkashRadio.click();
    }
    showPage("#dashboard");
    dashboardAPI.refresh();
  }

  function restoreStock(items) {
    const currentMeds = loadMedsCache() || MEDS;
    let changed = false;
    items.forEach(i => {
      const m = currentMeds.find(x => x.id === i.medId);
      if (m) {
        m.stock = Number(m.stock) + i.qty;
        changed = true;
      }
    });
    if (changed) {
      saveMedsCache(currentMeds);
      MEDS.length = 0;
      MEDS.push(...currentMeds);
      // Fix: direct render call instead of storage event
      renderTopSelling();
    }
  }

  function cancelOrder(id) {
    const orders = loadOrders();
    const idx = orders.findIndex(x => x.id === id);
    if (idx < 0) return;
    const o = orders[idx];

    // Fix: Validated logic for blocking cancel
    if (o.status !== ORDER_STATUS.PENDING) {
      toast("Cannot cancel processed order.");
      return;
    }

    restoreStock(o.items);
    o.status = ORDER_STATUS.CANCELLED;
    o.updatedAt = Date.now();
    saveOrders(orders);
    logActivity("Order Cancelled", `Order ${o.id} was cancelled.`);
    toast("Order cancelled. Stock restored.");
    dashboardAPI.refresh();
  }

  function renderMyOrders() {
    const sess = getSession();
    if (!sess || !myOrdersBox) return;

    const mine = myOrders(sess.email);

    // Ensure horizontal layout container
    myOrdersBox.style.display = "flex";
    myOrdersBox.style.flexWrap = "wrap";
    myOrdersBox.style.gap = "15px";
    myOrdersBox.style.alignItems = "stretch";

    if (mine.length === 0) {
      myOrdersBox.innerHTML = `<div class="muted tiny">No orders yet.</div>`;
      return;
    }

    myOrdersBox.innerHTML = mine.slice(0, 20).map(o => {
      const itemTxt = o.items.map(i => `${i.name} (${i.qty})`).join(", ");
      const assigned = o.assignedTo ? `Assigned: ${o.assignedTo}` : "Not assigned";
      const canCancel = (o.status === ORDER_STATUS.PENDING);

      return `
          <div class="order-card" style="flex: 1 1 300px; min-width: 280px; max-width: 450px; display:flex; flex-direction:column;">
            <div class="rowline">
              <div><b>Order:</b> ${o.id.slice(-10)}</div>
              <div class="badge">${o.status}</div>
            </div>
            <div class="small-muted" style="margin-top:6px; flex:1;">${itemTxt}</div>
            <div class="small-muted" style="margin-top:4px;">Address: ${o.address}</div>
            <div class="small-muted">${assigned}</div>
            <div class="small-muted">Created: ${fmtDate(o.createdAt)}</div>
            ${canCancel ? `<button class="btn btn-ghost" type="button" data-cancel="${o.id}" style="margin-top:8px; align-self:start;">Cancel</button>` : ``}
          </div>
        `;
    }).join("");

    $$("[data-cancel]").forEach(btn => {
      btn.addEventListener("click", () => {
        cancelOrder(btn.getAttribute("data-cancel"));
      });
    });
  }

  let adminFilters = { status: "All", pay: "All", q: "" };

  function renderAdminOrders() {
    const sess = getSession();
    const dashboardPage = $("#page-dashboard");
    const adminStatsBox = $("#adminStats");

    // Toggle Admin Mode Class
    if (sess && sess.role === "admin") {
      dashboardPage.classList.add("dashboard-admin-mode");
      if (adminStatsBox) renderAdminStats(adminStatsBox);
      if (adminPanel && adminPanel.classList.contains("hidden")) adminPanel.classList.remove("hidden");
    } else {
      dashboardPage.classList.remove("dashboard-admin-mode");
      if (adminPanel) adminPanel.classList.add("hidden");
      return;
    }

    if (!adminOrdersBox) return;

    // Filter UI Injection
    const headerRow = document.querySelector(".admin-header-row");

    // Create filters if not present
    if (!document.getElementById("admin-filter-bar")) {
      const filterHtml = `
         <div id="admin-filter-bar" class="filter-bar-modern">
           <input id="admin-search-q" type="text" placeholder="Search..." style="width:120px;">
           <select id="admin-filter-status">
              <option value="All">All Status</option>
              ${Object.values(ORDER_STATUS).map(s => `<option value="${s}">${s}</option>`).join("")}
           </select>
           <select id="admin-filter-pay">
              <option value="All">All Payment</option>
              <option value="Verified">Verified</option>
              <option value="Unverified">Unverified</option>
              <option value="Failed">Failed</option>
           </select>
         </div>
      `;

      if (headerRow) {
        headerRow.insertAdjacentHTML('beforeend', filterHtml);
      } else {
        // Fallback
        adminOrdersBox.innerHTML = `
           <div style="margin-bottom:15px;">${filterHtml}</div>
           <div id="adminOrderList" class="order-list"></div>
         `;
      }

      // Ensure container exists if using header injection
      if (headerRow && !document.getElementById("adminOrderList")) {
        adminOrdersBox.innerHTML = `<div id="adminOrderList" class="order-list"></div>`;
      }

      // Listeners
      setTimeout(() => {
        const qInput = document.getElementById("admin-search-q");
        const sSelect = document.getElementById("admin-filter-status");
        const pSelect = document.getElementById("admin-filter-pay");
        if (qInput) qInput.oninput = (e) => { adminFilters.q = e.target.value; renderAdminOrdersList(); };
        if (sSelect) sSelect.onchange = (e) => { adminFilters.status = e.target.value; renderAdminOrdersList(); };
        if (pSelect) pSelect.onchange = (e) => { adminFilters.pay = e.target.value; renderAdminOrdersList(); };
      }, 50);
    }

    renderAdminOrdersList();
  }

  function renderAdminOrdersList() {
    const container = document.getElementById("adminOrderList");
    if (!container) return; // Wait for filter initialization

    let orders = allOrders();
    // 1. Status
    if (adminFilters.status !== "All") {
      orders = orders.filter(o => o.status === adminFilters.status);
    }
    // 2. Pay
    if (adminFilters.pay !== "All") {
      orders = orders.filter(o => {
        const s = o.paymentStatus || "Unverified";
        return s === adminFilters.pay;
      });
    }
    // 3. Search
    if (adminFilters.q) {
      const q = adminFilters.q.toLowerCase();
      orders = orders.filter(o =>
        o.id.toLowerCase().includes(q) ||
        o.userEmail.toLowerCase().includes(q) ||
        (o.paymentDetails?.trxId || "").toLowerCase().includes(q)
      );
    }

    if (orders.length === 0) {
      container.innerHTML = `<div class="muted tiny">No orders found matching filters.</div>`;
      return;
    }

    const users = safeJSONParse(localStorage.getItem(K_USERS) || "[]", []);

    container.innerHTML = orders.slice(0, 50).map(o => {
      const statusClass = (o.status || "Pending").toLowerCase();
      const itemsTxt = o.items.map(i => `${i.name} x${i.qty}`).join(", ");
      const paySt = o.paymentStatus || "Unverified";
      const payClass = paySt.toLowerCase();
      const total = o.items.reduce((s, i) => s + (i.price * i.qty), 0);

      const isPending = o.status === ORDER_STATUS.PENDING;
      const isApproved = o.status === ORDER_STATUS.APPROVED;

      // Find User Details
      const user = users.find(u => u.email === o.userEmail);
      const phone = o.paymentDetails?.number || user?.phone || "N/A";
      const name = o.userName || user?.name || "Customer";
      const location = o.address || "No address provided";

      return `
        <div class="order-card-modern">
           <div class="order-header">
              <span class="order-id">#${o.id.slice(-6).toUpperCase()}</span>
              <div class="order-badges">
                 <span class="status-pill ${statusClass}">${o.status}</span>
                 <span class="status-pill ${payClass}">${paySt}</span>
              </div>
           </div>
           
           <div class="order-items">${itemsTxt}</div>

           <!-- Customer Details -->
           <div class="order-customer-info" style="margin-bottom:12px; font-size:13px; color:#ccc; background:rgba(255,255,255,0.03); padding:10px; border-radius:8px;">
              <div style="font-weight:bold; color:#fff; margin-bottom:4px;">${name}</div>
              <div class="muted tiny">📞 ${phone}</div>
              <div class="muted tiny">📍 ${location}</div>
              <div class="muted tiny">✉️ ${o.userEmail}</div>
           </div>
           
           <div class="order-meta">
              <span>Total Amount</span>
              <span style="font-weight:bold;">৳${total}</span>
           </div>

           <div class="muted tiny" style="margin-top:8px;">
             ${o.address} • ${fmtDate(o.updatedAt || o.createdAt)}
           </div>

           <!-- Actions -->
           <div class="order-actions">
              ${isPending ? `<button class="btn-action-sm primary" data-save-admin="${o.id}" data-act="Approved">Approve</button>` : ''}
              ${isPending ? `<button class="btn-action-sm" style="color:#ef4444;" data-admin-cancel="${o.id}">Cancel</button>` : ''}
              
              ${isApproved ? `<button class="btn-action-sm" data-save-admin="${o.id}" data-act="Shipped">Mark Shipped</button>` : ''}
              ${paySt === "Unverified" ? `<button class="btn-action-sm" data-verify-pay="${o.id}">Verify Pay</button>` : ''}
              
              ${!isPending && !isApproved ? `<span class="muted tiny" style="margin:auto;">No actions available</span>` : ''}
           </div>
        </div>
      `;
    }).join("");

    // Rebind Buttons
    container.querySelectorAll("button").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation(); // prevent card click
        const id = btn.getAttribute("data-save-admin") || btn.getAttribute("data-admin-cancel") || btn.getAttribute("data-verify-pay");
        const act = btn.getAttribute("data-act");

        if (btn.hasAttribute("data-admin-cancel")) {
          cancelOrder(id);
        } else if (btn.hasAttribute("data-verify-pay")) {
          updateOrder(id, { paymentStatus: "Verified" });
          logActivity("Payment Verified", `Admin verified payment for Order ${id}`);
          toast("Payment Verified");
          dashboardAPI.refresh();
        } else if (act) {
          updateOrder(id, { status: act });
          logActivity("Order Updated", `Order ${id} set to ${act}`);
          toast("Order " + act);
          dashboardAPI.refresh();
        }
      };
    });
  }

  function renderAdminStats(container) {
    if (!container) return;
    const orders = allOrders();
    const meds = loadMedsCache();

    // Stats Calc
    let revenue = 0;
    let pending = 0;
    orders.forEach(o => {
      if (o.status !== "Cancelled") {
        const ordTotal = o.items.reduce((sum, i) => sum + (i.price * i.qty), 0);
        revenue += ordTotal;
      }
      if (o.status === "Pending") pending++;
    });

    const lowStock = meds.filter(m => Number(m.stock) < 5).length;
    const cards = [
      { label: "Revenue", val: "৳" + revenue.toLocaleString(), icon: "💰", color: "#10b981" },
      { label: "Total Orders", val: orders.length, icon: "📦", color: "#3b82f6" },
      { label: "Pending", val: pending, icon: "⏳", color: "#f59e0b" },
      { label: "Low Stock", val: lowStock, icon: "⚠️", color: "#ef4444" }
    ];

    container.innerHTML = cards.map(c => `
      <div class="stat-card-modern">
        <div class="stat-icon-wrapper" style="color:${c.color};">${c.icon}</div>
        <div class="stat-content">
          <h5>${c.label}</h5>
          <div class="value">${c.val}</div>
        </div>
      </div>
    `).join("");
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

  function initPaymentUI() {
    const cards = $$(".pay-card");
    const fieldBkash = $("#pay-bkash-fields");
    const fieldRocket = $("#pay-rocket-fields");
    const fieldNagad = $("#pay-nagad-fields");
    const fieldCod = $("#pay-cod-fields");

    const form = $("#paymentForm");

    cards.forEach(card => {
      card.addEventListener("click", () => {
        cards.forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");

        const rad = card.querySelector("input[type=radio]");
        if (rad) {
          rad.checked = true;
          const val = rad.value;

          if (fieldBkash) fieldBkash.classList.toggle("hidden", val !== "bkash");
          if (fieldRocket) fieldRocket.classList.toggle("hidden", val !== "rocket");
          if (fieldNagad) fieldNagad.classList.toggle("hidden", val !== "nagad");
          if (fieldCod) fieldCod.classList.toggle("hidden", val !== "cod");
        }
      });
    });

    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const method = form.querySelector("input[name=payment]:checked")?.value;
        if (!method) { toast("Select a payment method"); return; }

        let details = {};

        if (method === "bkash") {
          const num = $("#inp-bkash-num")?.value.trim();
          const trx = $("#inp-bkash-trx")?.value.trim();
          if (!num || num.length < 11) { toast("Invalid Bkash Number"); return; }
          if (!trx) { toast("Enter Transaction ID"); return; }
          details = { provider: "Bkash", number: num, trxId: trx };
        } else if (method === "rocket") {
          const num = $("#inp-rocket-num")?.value.trim();
          const trx = $("#inp-rocket-trx")?.value.trim();
          if (!num || num.length < 11) { toast("Invalid Rocket Number"); return; }
          if (!trx) { toast("Enter Transaction ID"); return; }
          details = { provider: "Rocket", number: num, trxId: trx };
        } else if (method === "nagad") {
          const num = $("#inp-nagad-num")?.value.trim();
          const trx = $("#inp-nagad-trx")?.value.trim();
          if (!num || num.length < 11) { toast("Invalid Nagad Number"); return; }
          if (!trx) { toast("Enter Transaction ID"); return; }
          details = { provider: "Nagad", number: num, trxId: trx };
        } else if (method === "cod") {
          details = { provider: "COD" };
        }

        processCheckout(method, details);
      };
    }
  }
  window.initPaymentUI = initPaymentUI;


  function renderTopSelling() {
    const grid = $("#topSellingGrid");
    if (!grid) return;

    const items = MEDS.slice(0, 100);
    const sess = getSession();
    const isAdmin = sess && sess.role === "admin";

    grid.innerHTML = items.map(m => {
      const out = Number(m.stock) <= 0;
      const imgUrl = m.image || 'https://via.placeholder.com/150?text=No+Image';

      return `
          <div class="card product-card" style="padding:15px; display:flex; flex-direction:column; justify-content:space-between;">
             <div>
                <div style="font-weight:600; font-size:1.05rem;">${m.name}</div>
                <div class="muted tiny">${m.strength} • ${m.form}</div>
                <div class="muted tiny">${m.manufacturer}</div>
             </div>
             <div style="margin-top:10px;">
                <div style="color:var(--accent); font-weight:700; font-size:1.1rem;">৳${m.price}</div>
                ${isAdmin ? `
                  <div class="rowline" style="gap:8px; margin-top:8px;">
                     <button class="btn btn-ghost tiny-btn" style="flex:1; border:1px solid var(--line);" onclick="openEditModal('${m.id}')">Edit</button>
                     <button class="btn btn-ghost tiny-btn" style="flex:1; color:var(--accent-red); border:1px solid var(--line);" onclick="deleteMedicine('${m.id}')">Delete</button>
                  </div>
                ` : `
                  <button class="btn btn-primary" style="width:100%; margin-top:8px;" data-add-cart="${m.id}" ${out ? "disabled" : ""}>
                     ${out ? "Out of Stock" : "Add to Cart"}
                  </button>
                `}
             </div>
          </div>
        `;
    }).join("");

    grid.querySelectorAll("[data-add-cart]").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-add-cart");
        const m = MEDS.find(x => x.id === id);
        if (m) addToCart(m, 1);
      };
    });
  }

  async function initDashboard() {
    await ensureCatalogLoaded();
    restoreSavedBits();
    renderMyOrders();
    renderAdminOrders();
    renderTopSelling(); // NEW
    renderAdminLogs();
  }

  function renderAdminLogs() {
    const box = $("#adminActivityBox");
    if (!box) return;
    const logs = safeJSONParse(localStorage.getItem(K_LOGS) || "[]", []);

    if (logs.length === 0) {
      box.innerHTML = "No recent activity.";
      return;
    }

    box.innerHTML = logs.map(l => `
      <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding:4px 0; font-size:12px;">
        <span style="color:var(--secondary); font-weight:bold;">${l.user}</span> 
        <span>${l.action}</span>
        <span class="muted">- ${l.details}</span>
        <span style="float:right; opacity:0.5;">${new Date(l.time).toLocaleTimeString()}</span>
      </div>
    `).join("");
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
  }

  dashboardAPI.refresh = () => {
    restoreSavedBits();
    renderMyOrders();
    renderAdminOrders();
    renderAdminLogs();
  };
  dashboardAPI.renderCart = renderCart;
  dashboardAPI.renderCheckout = () => {
    // if we have logic to render checkout specifics (like address pre-fill)
    const sess = getSession();
    if (sess && addressInput && !addressInput.value) {
      addressInput.value = getSavedAddress(sess.email);
    }
    if (cartTotalEl) cartTotalEl.textContent = "৳" + getCartTotal();
  };

  // Real-time Sync (Cross-tab)
  window.addEventListener("storage", (e) => {
    if (e.key === K_SESSION) {
      refreshAuthUI();
      const s = getSession();
      if (!s && location.hash === "#dashboard") location.hash = "#login";
    }
    if (e.key === K_ORDERS) {
      renderMyOrders();
      renderAdminOrders();
    }
    if (e.key && e.key.startsWith("ep_cart")) {
      renderCart();
      updateCartBadge();
    }
    if (e.key === K_MEDS) {
      // Reload meds if stock changed
      const fresh = loadMedsCache();
      if (fresh) {
        MEDS = fresh;
        renderTopSelling(); // Refresh home grid
      }
    }
  });

  function wirePasswordToggle() {
    const toggle = $("#togglePassword");
    const input = $("#loginPassword");

    if (toggle && input) {
      toggle.onclick = () => {
        const type = input.getAttribute("type") === "password" ? "text" : "password";
        input.setAttribute("type", type);
        toggle.textContent = type === "password" ? "👁️" : "🙈";
      };
    }
  }

  function wireContact() {
    const contactForm = $("#contactForm");
    if (!contactForm) return;

    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();

      // EMAILJS CONFIGURATION
      const SERVICE_ID = "service_l8bek5u";
      const TEMPLATE_ID = "template_gd4tggk";
      const PUBLIC_KEY = "5I_SuY-Ea3y0nK36T";

      if (!SERVICE_ID) {
        toast("EmailJS keys missing!");
        return;
      }

      // Initialize if not already
      if (window.emailjs) {
        emailjs.init(PUBLIC_KEY);

        const btn = contactForm.querySelector("button[type=submit]");
        const originalText = btn.textContent;
        btn.textContent = "Sending...";
        btn.disabled = true;

        emailjs.sendForm(SERVICE_ID, TEMPLATE_ID, contactForm)
          .then(() => {
            toast("Message sent successfully!");
            contactForm.reset();
          }, (err) => {
            console.error("EmailJS Error:", err);
            toast("Failed to send message.");
          })
          .finally(() => {
            btn.textContent = originalText;
            btn.disabled = false;
          });
      } else {
        toast("EmailJS SDK not loaded.");
      }
    });
  }

  window.deleteMedicine = (id) => {
    if (!confirm("Are you sure you want to delete this medicine?")) return;
    const med = MEDS.find(m => m.id === id);
    MEDS = MEDS.filter(m => m.id !== id);
    saveMedsCache(MEDS);
    logActivity("Inventory Deletion", `Removed medicine: ${med ? med.name : id}`);
    renderTopSelling(); // direct update
    toast("Medicine deleted.");
  };

  window.openEditModal = (id) => {
    const med = MEDS.find(m => m.id === id);
    if (!med) return;

    const modal = $("#editMedModal");
    const form = $("#editMedForm");

    $("#edit-id").value = med.id;
    $("#edit-name").value = med.name;
    $("#edit-cat").value = med.category || "General";
    $("#edit-price").value = med.price;
    $("#edit-stock").value = med.stock;

    modal.classList.remove("hidden");

    $("#btnCancelEdit").onclick = () => {
      modal.classList.add("hidden");
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      const newName = $("#edit-name").value.trim();
      const newPrice = parseFloat($("#edit-price").value);
      const newStock = parseInt($("#edit-stock").value);
      const newCat = $("#edit-cat").value;

      if (!newName || newPrice < 0 || newStock < 0) {
        toast("Invalid input.");
        return;
      }

      med.name = newName;
      med.price = newPrice;
      med.stock = newStock;
      med.category = newCat;

      saveMedsCache(MEDS); // Persist
      renderTopSelling(); // direct update

      logActivity("Inventory Update", `Updated details for: ${newName}`);

      toast("Medicine Updated.");
      modal.classList.add("hidden");
    };
  };



  function setupAdminTabs() {
    const tabs = $$(".admin-tab-btn");
    const dashboardView = $("#adminDashboardView");
    const usersView = $("#adminUsersView");

    window.switchAdminTab = function (target) {
      const sess = getSession();
      if (!sess || sess.role !== "admin") return;
      if (!dashboardView || !usersView) return;

      // Toggle Tabs
      tabs.forEach(t => {
        if (t.dataset.tab === target) t.classList.add("active");
        else t.classList.remove("active");
      });

      // Toggle Views
      if (target === "dashboard") {
        dashboardView.classList.remove("hidden");
        usersView.classList.add("hidden");
      } else if (target === "users") {
        dashboardView.classList.add("hidden");
        usersView.classList.remove("hidden");
        renderAdminUsersPage();
      }
    };

    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        window.switchAdminTab(btn.dataset.tab);
      });
    });
  }

  function renderAdminUsersPage() {
    const list = $("#adminUserList");
    if (!list) return;

    const users = safeJSONParse(localStorage.getItem(K_USERS) || "[]", []);
    // Only show non-admin users for management
    const customers = users.filter(u => u.role !== "admin");

    if (customers.length === 0) {
      list.innerHTML = `<div class="muted tiny" style="padding:20px;">No registered users found.</div>`;
      return;
    }

    list.innerHTML = customers.map(u => {
      const initials = (u.name || "U").charAt(0).toUpperCase();
      return `
        <div class="user-card">
          <div class="user-avatar">${initials}</div>
          <div style="font-weight:700; color:#fff; font-size:1.1rem; margin-bottom:4px;">${u.name || "User"}</div>
          <div class="muted tiny">${u.email}</div>
          <div class="muted tiny" style="margin-top:8px;">📞 ${u.phone || "No phone"}</div>
          <div class="muted tiny">📍 ${u.address || "No address"}</div>
          
          <button class="btn btn-ghost" onclick="removeUser('${u.email}')" 
            style="margin-top:15px; width:100%; border-color:rgba(239,68,68,0.3); color:#ef4444;">
            Remove Account
          </button>
        </div>
      `;
    }).join("");
  }

  window.removeUser = function (email) {
    if (!confirm(`Are you sure you want to permanently delete user: ${email}?`)) return;

    let users = safeJSONParse(localStorage.getItem(K_USERS) || "[]", []);
    users = users.filter(u => u.email !== email);
    localStorage.setItem(K_USERS, JSON.stringify(users));

    toast("User account removed successfully.");
    logActivity("Admin", `Removed user: ${email}`);
    renderAdminUsersPage();
  };


  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    ensureInitialAccounts();

    wireNav();
    wireAuth();
    wireDashboard();
    wireProfile();
    wireAdminInventory();
    wirePasswordToggle();
    wireContact();

    // Fix: Init logic AFTER wiring elements
    initDashboard();

    setupAdminTabs();
    refreshAuthUI();
    initPaymentUI();

    window.addEventListener("hashchange", handleRoute);
    handleRoute();
  });
})();
