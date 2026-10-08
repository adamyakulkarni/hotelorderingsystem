/* ==========================================================================
   app.js - Tablemate frontend
   Works with the API exposed by src/server.js.
   ========================================================================== */

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);   const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    step: "discover",
    location: { ...CONFIG.DEFAULT_LOCATION },
    locationSource: "default",
    restaurants: [],
    restaurant: null,
    tables: [],
    selectedTable: null,
    arrivalTime: "",
    menu: [],
    cart: new Map(),
    loading: false,
  };

  const app = $("#app");
  const banner = $("#banner");
  const dialog = $("#dialog");
  const dialogBody = $("#dialogBody");

  if (!app) {
    console.error("Tablemate: #app element was not found.");
    return;
  }

  $("#appName").textContent = CONFIG.APP_NAME;
  document.title = `${CONFIG.APP_NAME} — Book a table and pre-order`;

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function money(value) {
    return `${CONFIG.CURRENCY}${Number(value || 0).toFixed(2)}`;
  }

  function formatDateTimeForApi(value) {
    return value ? value.replace("T", " ") : "";
  }

  function nextHalfHour() {
    const d = new Date();
    d.setSeconds(0, 0);
    const mins = d.getMinutes();
    if (mins < 30) {
      d.setMinutes(30, 0, 0);
    } else {
      d.setHours(d.getHours() + 1, 0, 0, 0);
    }
    return d;
  }

  function localDateTimeValue(date) {
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function minArrivalValue() {
    return localDateTimeValue(nextHalfHour());
  }

  function maxArrivalValue() {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return localDateTimeValue(d);
  }

  function showBanner(message, type = "info") {
    if (!banner) return;
    banner.innerHTML = `
      <div class="banner ${type}">
        <span>${esc(message)}</span>
        <button type="button" aria-label="Dismiss" data-action="dismiss-banner">x</button>
      </div>
    `;
  }

  function clearBanner() {
    if (banner) banner.innerHTML = "";
  }

  function showError(error) {
    showBanner(error?.message || "Something went wrong.", "error");
  }

  function setLoading(button, loading, text = "Working...") {
    if (!button) return;
    if (loading) {
      button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${text}`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || button.innerHTML;
      delete button.dataset.originalText;
    }
  }

  function stepper() {
    const steps = [
      ["discover", "1", "Find a table"],
      ["tables", "2", "Choose table"],
      ["menu", "3", "Pre-order"],
      ["confirm", "4", "Confirm"],
    ];
    const currentIndex = steps.findIndex(s => s[0] === state.step);

    return `
      <ol class="stepper">
        ${steps.map(([key, n, label], index) => {
          const cls = index === currentIndex ? "current" : index < currentIndex ? "done" : "";
          const clickable = index < currentIndex && key !== "confirm";
          return `
            <li class="${cls}">
              ${clickable
                ? `<a href="#${key}" data-step="${key}"><span class="sn">${n}</span><span class="sl">${esc(label)}</span></a>`
                : `<span><span class="sn">${n}</span><span class="sl">${esc(label)}</span></span>`
              }
            </li>
          `;
        }).join("")}
      </ol>
    `;
  }

  function pageHead(title, subtitle = "", backStep = "discover") {
    return `
      <div class="page-head">
        <a class="back" href="#${backStep}" data-step="${backStep}">Back</a>
        <h1>${esc(title)}</h1>
        ${subtitle ? `<p class="addr">${esc(subtitle)}</p>` : ""}
        ${stepper()}
      </div>
    `;
  }

  function restaurantCard(r) {
    const image = r.image_url
      ? `<img class="rest-img" src="${esc(r.image_url)}" alt="${esc(r.name)}" loading="lazy">`
      : `<div class="rest-img ph" aria-hidden="true">${esc((r.name || "?").slice(0, 1))}</div>`;

    return `
      <article class="rest">
        <div class="rest-media">
          ${image}
          <span class="dist">${Number(r.distanceKm || 0).toFixed(2)} km</span>
        </div>
        <div class="rest-body">
          <h3>${esc(r.name)}</h3>
          <p class="addr">${esc(r.address)}</p>
          ${r.opening_time && r.closing_time ? `<p class="hint">Hours: ${esc(r.opening_time)} -${esc(r.closing_time)}</p>` : ""}
          <button class="btn primary" type="button" data-action="choose-restaurant" data-id="${esc(r.id)}">
            View tables and menu
          </button>
        </div>
      </article>
    `;
  }

  async function loadRestaurants() {
    state.loading = true;
    renderDiscover();
    try {
      const rows = await Api.nearby(state.location.lat, state.location.lng);
      state.restaurants = Array.isArray(rows) ? rows : [];
      clearBanner();
    } catch (error) {
      state.restaurants = [];
      showError(error);
    } finally {
      state.loading = false;
      renderDiscover();
    }
  }

  function renderDiscover() {
    state.step = "discover";
    app.innerHTML = `
      <section class="hero">
        <h1>Book your table. Pre-order your food.</h1>
        <p>Find nearby restaurants, choose a time and table, then order ahead so everything is ready when you arrive.</p>
      </section>
      <section class="locbar">
        <div class="loc-info">
          <span aria-hidden="true">Location</span>
          <div>
            <strong>${state.locationSource === "gps" ? "Using your location" : "Showing restaurants near Bengaluru"}</strong>
            <span>${Number(state.location.lat).toFixed(4)}, ${Number(state.location.lng).toFixed(4)}</span>
          </div>
        </div>
        <div class="loc-actions">
          <button class="btn ghost" type="button" data-action="use-location">Use my location</button>
          <button class="btn ghost" type="button" data-action="refresh">Refresh</button>
        </div>
      </section>
      <div class="rest-grid">
        ${state.loading
          ? `<div class="sk"></div><div class="sk"></div><div class="sk"></div>`
          : state.restaurants.length
          ? state.restaurants.map(restaurantCard).join("")
          : `<div class="empty">
              <h3>No restaurants found</h3>
              <p>Try refreshing or allow location access to find restaurants near you.</p>
              <div class="row"><button class="btn primary" data-action="refresh">Try again</button></div>
            </div>`
        }
      </div>
    `;
  }

  function renderTables() {
    const r = state.restaurant;
    const selected = state.selectedTable;

    app.innerHTML = `
      ${pageHead(r?.name || "Choose a table", r?.address || "", "discover")}
      <section class="panel">
        <div class="controls">
          <div class="field">
            <label for="arrivalTime">Arrival time</label>
            <input id="arrivalTime" type="datetime-local" min="${minArrivalValue()}" max="${maxArrivalValue()}" value="${esc(state.arrivalTime)}" step="1800">
            <span class="hint">Choose a 30-minute slot.</span>
          </div>
          <div class="field">
            <label>Restaurant</label>
            <input type="text" value="${esc(r?.name || "")}" readonly>
            <span class="hint">Table availability is checked for the selected time.</span>
          </div>
        </div>
        <div class="legend">
          <span><i class="sw avail"></i> Available</span>
          <span><i class="sw booked"></i> Booked</span>
          <span><i class="sw sel"></i> Selected</span>
        </div>
        <div class="floor" id="floor">
          ${state.loading
            ? `<p class="floor-msg">Checking table availability...</p>`
            : state.tables.length
            ? state.tables.map(tableButton).join("")
            : `<p class="floor-msg">Choose an arrival time to see available tables.</p>`
          }
        </div>
      </section>
      <div class="selbar">
        <p>
          ${selected
            ? `<strong>Table ${esc(selected.table_number)}</strong> <span class="sub">Seats ${esc(selected.capacity)} people</span>`
            : `Select an available table to continue.`
          }
        </p>
        <button class="btn primary" type="button" data-action="continue-menu" ${selected ? "" : "disabled"}>
          Continue to menu
        </button>
      </div>
    `;
  }

  function tableButton(t) {
    const booked = String(t.status).toUpperCase() === "BOOKED";
    const selected = state.selectedTable && Number(state.selectedTable.id) === Number(t.id);
    const capClass = Number(t.capacity) <= 2 ? "cap-s" : Number(t.capacity) <= 4 ? "cap-m" : "cap-l";

    return `
      <button type="button" class="tbl ${booked ? "booked" : selected ? "sel" : "avail"} ${capClass}"
        style="left:${Number(t.pos_x)}%; top:${Number(t.pos_y)}%;"
        ${booked ? "disabled" : ""}
        data-action="select-table" data-id="${esc(t.id)}"
        title="${booked ? "Booked" : `Table ${t.table_number},${t.capacity} seats`}">
        <span class="tn">${esc(t.table_number)}</span>
        <small>${esc(t.capacity)} seats</small>
      </button>
    `;
  }

  async function loadTables() {
    if (!state.restaurant || !state.arrivalTime) {
      state.tables = [];
      state.selectedTable = null;
      renderTables();
      return;
    }
    state.loading = true;
    state.selectedTable = null;
    renderTables();

    try {
      const rows = await Api.tables(state.restaurant.id, formatDateTimeForApi(state.arrivalTime));
      state.tables = Array.isArray(rows) ? rows : [];
      clearBanner();
    } catch (error) {
      state.tables = [];
      showError(error);
    } finally {
      state.loading = false;
      renderTables();
    }
  }

  function groupedMenu() {
    const groups = new Map();
    for (const item of state.menu) {
      const category = item.category || "Main Course";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    }
    const order = CONFIG.CATEGORY_ORDER || [];
    return [...groups.entries()].sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  function cartQuantity(id) {
    return state.cart.get(Number(id))?.quantity || 0;
  }

  function addToCart(item) {
    const id = Number(item.id);
    const existing = state.cart.get(id);
    state.cart.set(id, {
      id,
      name: item.name,
      price: Number(item.price),
      quantity: existing ? existing.quantity + 1 : 1,
    });
  }

  function changeQuantity(id, delta) {
    const item = state.cart.get(Number(id));
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) state.cart.delete(Number(id));
  }

  function cartItems() {
    return [...state.cart.values()];
  }

  function subtotal() {
    return cartItems().reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  function renderMenu() {
    const groups = groupedMenu();
    const r = state.restaurant;
    const total = subtotal();
    const deposit = total * Number(CONFIG.DEPOSIT_RATE || 0.2);

    app.innerHTML = `
      ${pageHead(r?.name || "Pre-order", `${r?.address || ""} - ${formatDisplayDateTime(state.arrivalTime)}`, "tables")}
      <div class="menu-layout">
        <section>
          <nav class="cats" aria-label="Menu categories">
            ${groups.map(([category]) => `<a href="#cat-${slug(category)}">${esc(category)}</a>`).join("")}
          </nav>
          ${groups.length
            ? groups.map(([category, items]) => `
                <section class="menu-cat" id="cat-${slug(category)}">
                  <h2>${esc(category)}</h2>
                  <div class="items">${items.map(menuItem).join("")}</div>
                </section>
              `).join("")
            : `<div class="empty">
                <h3>No menu items</h3>
                <p>This restaurant has not added any menu items yet.</p>
              </div>`
          }
        </section>

        <aside class="panel cart" aria-label="Your order">
          <h2>Your order</h2>
          <dl class="kv">
            <div><dt>Restaurant</dt><dd>${esc(r?.name || "")}</dd></div>
            <div><dt>Table</dt><dd>${esc(state.selectedTable?.table_number || "")}</dd></div>
            <div><dt>Arrival</dt><dd>${esc(formatDisplayDateTime(state.arrivalTime))}</dd></div>
          </dl>
          ${cartItems().length ? cartItems().map(cartLine).join("") : `<p class="addr">Your cart is empty. Add items from the menu.</p>`}
          <div class="totals">
            <div><span>Food subtotal</span><strong>${money(total)}</strong></div>
            <div class="deposit"><span>Deposit (20%)</span><strong>${money(deposit)}</strong></div>
            <div class="rest-row"><span>Remaining at restaurant</span><span>${money(total - deposit)}</span></div>
          </div>
          <button class="btn primary block" type="button" data-action="checkout" ${cartItems().length ? "" : "disabled"}>
            Confirm booking and pay deposit
          </button>
        </aside>
      </div>
    `;
  }

  function menuItem(item) {
    const qty = cartQuantity(item.id);
    return `
      <div class="item">
        <div>
          <h3>${esc(item.name)}</h3>
          <span class="item-price">${money(item.price)}</span>
        </div>
        <div>
          ${qty
            ? `<div class="stepper-qty">
                <button type="button" aria-label="Decrease ${esc(item.name)}" data-action="qty" data-id="${esc(item.id)}" data-delta="-1">-</button>
                <span>${qty}</span>
                <button type="button" aria-label="Increase ${esc(item.name)}" data-action="qty" data-id="${esc(item.id)}" data-delta="1">+</button>
              </div>`
            : `<button class="add" type="button" data-action="add" data-id="${esc(item.id)}">Add</button>`
          }
        </div>
      </div>
    `;
  }

  function cartLine(item) {
    return `
      <div class="line">
        <div>
          <div class="line-name">${esc(item.name)}</div>
          <div class="line-sub">${money(item.price)} x ${item.quantity}</div>
        </div>
        <div class="line-total">${money(item.price * item.quantity)}</div>
        <div class="stepper-qty">
          <button type="button" aria-label="Decrease ${esc(item.name)}" data-action="qty" data-id="${item.id}" data-delta="-1">-</button>
          <span>${item.quantity}</span>
          <button type="button" aria-label="Increase ${esc(item.name)}" data-action="qty" data-id="${item.id}" data-delta="1">+</button>
        </div>
      </div>
    `;
  }

  function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function formatDisplayDateTime(value) {
    if (!value) return "Not selected";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value.replace("T", " ");
    return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

function renderPartner() {
    state.step = "partner";

    app.innerHTML = `
      <section class="partner">
        <h1>Partner with ${esc(CONFIG.APP_NAME)}</h1>
        <p>Add your restaurant details, operating hours, and initial menu items.</p>

        <form id="partnerForm" class="panel">
          <h3>Restaurant Details</h3>
          <div class="field">
            <label for="partnerName">Restaurant name</label>
            <input id="partnerName" name="name" required maxlength="120" placeholder="e.g. Spice Garden">
          </div>

          <div class="field">
            <label for="partnerAddress">Address</label>
            <input id="partnerAddress" name="address" required maxlength="250" placeholder="Street, area, city">
          </div>

          <div class="two">
            <div class="field">
              <label for="partnerLat">Latitude</label>
              <input id="partnerLat" name="lat" type="number" step="any" required placeholder="12.9716">
            </div>
            <div class="field">
              <label for="partnerLng">Longitude</label>
              <input id="partnerLng" name="lng" type="number" step="any" required placeholder="77.5946">
            </div>
          </div>

          <div class="field">
            <label for="partnerImage">Photo URL (Image link)</label>
            <input id="partnerImage" name="imageUrl" type="url" placeholder="https://images.unsplash.com/photo-1517248135467">
          </div>

          <div class="two">
            <div class="field">
              <label for="partnerOpen">Opening Time</label>
              <input id="partnerOpen" name="openingTime" type="time" value="09:00">
            </div>
            <div class="field">
              <label for="partnerClose">Closing Time</label>
              <input id="partnerClose" name="closingTime" type="time" value="22:00">
            </div>
          </div>

          <hr style="margin: 20px 0; border: 0; border-top: 1px solid #ccc;">

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin:0;">Menu Items</h3>
            <button type="button" class="btn ghost" data-action="add-menu-row">+ Add Another Dish</button>
          </div>

          <div id="menuItemsContainer">
            <div class="menu-item-row" style="padding: 10px; border: 1px dashed #ccc; border-radius: 6px; margin-bottom: 10px;">
              <div class="field">
                <label>Dish Name</label>
                <input name="itemName" placeholder="e.g. Fried Rice" required>
              </div>
              <div class="two">
                <div class="field">
                  <label>Price ($)</label>
                  <input name="itemPrice" type="number" step="0.01" placeholder="12.99" required>
                </div>
                <div class="field">
                  <label>Category</label>
                  <input name="itemCategory" placeholder="e.g. Main Course">
                </div>
              </div>
            </div>
          </div>

          <p class="error-text" id="partnerError" aria-live="polite"></p>

          <button class="btn primary block" type="submit">
            Register restaurant
          </button>
        </form>
      </section>
    `;
  }

  async function submitPartnerForm(form) {
    const errorEl = $("#partnerError", form);     errorEl.textContent = "";      const name = form.name.value.trim();     const address = form.address.value.trim();     const lat = parseFloat(form.lat.value);     const lng = parseFloat(form.lng.value);     const imageUrl = form.imageUrl.value.trim();     const openingTime = form.openingTime.value;     const closingTime = form.closingTime.value;      if (!name \vert{}\vert{} !address \vert{}\vert{} Number.isNaN(lat) \vert{}\vert{} Number.isNaN(lng)) {       errorEl.textContent = "Please fill in all required restaurant fields.";       return;     }      // Collect all menu items dynamically from the rows     const menuRows = $$(".menu-item-row", form);
    const menuItems = [];

    for (const row of menuRows) {
      const itemName = $("input[name='itemName']", row)?.value.trim();
      const itemPrice = parseFloat($("input[name='itemPrice']", row)?.value);
      const itemCategory = $("input[name='itemCategory']", row)?.value.trim();

      if (itemName && !Number.isNaN(itemPrice)) {
        menuItems.push({
          name: itemName,
          price: itemPrice,
          category: itemCategory || "Main Course"
        });
      }
    }

    const button = $("button[type=submit]", form);
    setLoading(button, true, "Registering...");

    try {
      const result = await Api.registerRestaurant({
        name,
        address,
        lat,
        lng,
        imageUrl,
        openingTime,
        closingTime,
        menuItems
      });

      showBanner(result.message || "Restaurant registered successfully!", "success");
      await loadRestaurants();
      location.hash = "#discover";
    } catch (error) {
      errorEl.textContent = error.message || "Failed to register restaurant.";
    } finally {
      setLoading(button, false);
    }
  }

  async function chooseRestaurant(id) {
    const restaurant = state.restaurants.find(r => Number(r.id) === Number(id));
    if (!restaurant) return;

    state.restaurant = restaurant;
    state.arrivalTime = localDateTimeValue(nextHalfHour());
    state.selectedTable = null;
    state.tables = [];
    state.cart.clear();
    state.step = "tables";

    history.replaceState(null, "", "#tables");
    renderTables();
    await loadTables();
  }

  async function openMenu() {
    if (!state.selectedTable) return;
    state.step = "menu";
    state.loading = true;

    history.replaceState(null, "", "#menu");
    renderMenu();

    try {
      const rows = await Api.menu(state.restaurant.id);
      state.menu = Array.isArray(rows) ? rows : [];
      clearBanner();
    } catch (error) {
      state.menu = [];
      showError(error);
    } finally {
      state.loading = false;
      renderMenu();
    }
  }

  function validateSlot(value) {
    if (!value) return "Please choose an arrival time.";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Please choose a valid arrival time.";

    const minutes = d.getMinutes();
    if (![0, 30].includes(minutes)) return "Please choose a 30-minute time slot.";

    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (time < CONFIG.SLOT_START || time > CONFIG.SLOT_END) {
      return `Please choose a time between ${CONFIG.SLOT_START} and ${CONFIG.SLOT_END}.`;
    }

    if (d < new Date()) return "Arrival time must be in the future.";
    return "";
  }

  function openCheckoutDialog() {
    if (!state.restaurant || !state.selectedTable || !cartItems().length) return;

    const total = subtotal();
    const deposit = total * Number(CONFIG.DEPOSIT_RATE || 0.2);

    dialogBody.innerHTML = `
      <div class="modal-inner">
        <div class="modal-icon ok" aria-hidden="true">OK</div>
        <h2 id="dlgTitle">Confirm your booking</h2>
        <p>Enter your name to reserve the table and place your pre-order.</p>

        <form id="checkoutForm">
          <div class="field" style="text-align:left">
            <label for="customerName">Your name</label>
            <input id="customerName" name="customerName" required maxlength="120" autocomplete="name" placeholder="Full name">
          </div>

          <dl class="kv">
            <div><dt>Restaurant</dt><dd>${esc(state.restaurant.name)}</dd></div>
            <div><dt>Table</dt><dd>${esc(state.selectedTable.table_number)}</dd></div>
            <div><dt>Arrival</dt><dd>${esc(formatDisplayDateTime(state.arrivalTime))}</dd></div>
            <div><dt>Food total</dt><dd>${money(total)}</dd></div>
            <div class="strong"><dt>Deposit</dt><dd>${money(deposit)}</dd></div>
          </dl>

          <p class="hint" style="text-align:left">Demo checkout: the backend records the 20% deposit; no real payment gateway is connected.</p>
          <p class="error-text" id="checkoutError" aria-live="polite"></p>

          <button class="btn primary block" type="submit">Confirm reservation</button>
          <button class="btn ghost block" type="button" data-action="close-dialog">Cancel</button>
        </form>
      </div>
    `;

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    $("#customerName")?.focus();
  }

  async function submitCheckout(form) {
    const errorEl = $("#checkoutError", form);
    const name = form.customerName.value.trim();

    if (!name) {
      errorEl.textContent = "Please enter your name.";
      return;
    }

    const slotError = validateSlot(state.arrivalTime);
    if (slotError) {
      errorEl.textContent = slotError;
      return;
    }

    const button = $("button[type=submit]", form);
    setLoading(button, true, "Confirming...");

    try {
      const result = await Api.checkout({
        restaurantId: Number(state.restaurant.id),
        tableId: Number(state.selectedTable.id),
        customerName: name,
        arrivalTime: formatDateTimeForApi(state.arrivalTime),
        cartItems: cartItems().map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      });

      closeDialog();
      showConfirmation(result, name);
    } catch (error) {
      errorEl.textContent = error.message || "Could not complete the booking.";
      setLoading(button, false);
    }
  }

  function showConfirmation(result, name) {
    const total = Number(result.totalAmount || subtotal());
    const deposit = Number(result.depositPaid || total * 0.2);

    dialogBody.innerHTML = `
      <div class="modal-inner">
        <div class="modal-icon ok" aria-hidden="true">OK</div>
        <h2 id="dlgTitle">Booking confirmed</h2>
        <p>Thanks, ${esc(name)}. Your reservation has been recorded.</p>
        <dl class="kv">
          <div><dt>Booking ID</dt><dd>#${esc(result.bookingId)}</dd></div>
          <div><dt>Restaurant</dt><dd>${esc(state.restaurant.name)}</dd></div>
          <div><dt>Table</dt><dd>${esc(state.selectedTable.table_number)}</dd></div>
          <div><dt>Arrival</dt><dd>${esc(formatDisplayDateTime(state.arrivalTime))}</dd></div>
          <div><dt>Total Food</dt><dd>${money(total)}</dd></div>
          <div class="strong"><dt>Deposit Paid</dt><dd>${money(deposit)}</dd></div>
        </dl>
        <button class="btn primary block" type="button" data-action="close-dialog">Done</button>
      </div>
    `;

    state.cart.clear();
  }

  function closeDialog() {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  // Router and Global Event Listeners
  function handleRoute() {
    const hash = location.hash.replace("#", "") || "discover";
    if (hash === "partner") {
      renderPartner();
    } else if (hash === "tables" && state.restaurant) {
      renderTables();
    } else if (hash === "menu" && state.selectedTable) {
      renderMenu();
    } else {
      renderDiscover();
    }
  }

  window.addEventListener("hashchange", handleRoute);

  document.addEventListener("click", e => {
    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    const id = actionBtn.dataset.id;

    if (action === "choose-restaurant") chooseRestaurant(id);
    if (action === "select-table") {
      state.selectedTable = state.tables.find(t => Number(t.id) === Number(id));
      renderTables();
    }
    if (action === "continue-menu") openMenu();
    if (action === "add") {
      const item = state.menu.find(m => Number(m.id) === Number(id));
      if (item) {
        addToCart(item);
        renderMenu();
      }
    }
    if (action === "qty") {
      const delta = parseInt(actionBtn.dataset.delta, 10);
      changeQuantity(id, delta);
      renderMenu();
    }
    if (action === "checkout") openCheckoutDialog();
    if (action === "close-dialog") closeDialog();
    if (action === "dismiss-banner") clearBanner();
    if (action === "refresh") loadRestaurants();
    if (action === "use-location") {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            state.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            state.locationSource = "gps";
            loadRestaurants();
          },
          () => showError({ message: "Could not retrieve your location." })
        );
      }
    }
  });

  document.addEventListener("change", e => {
    if (e.target.id === "arrivalTime") {
      state.arrivalTime = e.target.value;
      loadTables();
    }
  });

  document.addEventListener("submit", e => {
    if (e.target.id === "partnerForm") {
      e.preventDefault();
      submitPartnerForm(e.target);
    }
    if (e.target.id === "checkoutForm") {
      e.preventDefault();
      submitCheckout(e.target);
    }
  });

  // Initial Load
  loadRestaurants();
})();
