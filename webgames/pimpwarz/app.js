/* PimpWars UI — talks to Go WASM */

const SAVE_KEY = "pimpwarz_save_v1";

const BOOT_ART = `
 ██████╗ ██╗███╗   ███╗██████╗ ██╗    ██╗ █████╗ ██████╗ ███████╗
 ██╔══██╗██║████╗ ████║██╔══██╗██║    ██║██╔══██╗██╔══██╗██╔════╝
 ██████╔╝██║██╔████╔██║██████╔╝██║ █╗ ██║███████║██████╔╝███████╗
 ██╔═══╝ ██║██║╚██╔╝██║██╔═══╝ ██║███╗██║██╔══██║██╔══██╗╚════██║
 ██║     ██║██║ ╚═╝ ██║██║     ╚███╔███╔╝██║  ██║██║  ██║███████║
 ╚═╝     ╚═╝╚═╝     ╚═╝╚═╝      ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
              :: Flaming Sheinen's awaits ::
`;

let meta = null;
let state = null;
let modalResolve = null;

function money(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function fmtTime(minutes) {
  let h = Math.floor(minutes / 60);
  const m = minutes % 60;
  let ampm = "AM";
  let display = h;
  if (h >= 12) {
    ampm = "PM";
    if (h > 12) display = h - 12;
  }
  if (display === 0) display = 12;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

function parse(jsonStr) {
  return JSON.parse(jsonStr);
}

function loadSavedRaw() {
  return localStorage.getItem(SAVE_KEY);
}

function persistSave() {
  if (typeof pimpwarzSave !== "function") return;
  const data = pimpwarzSave();
  if (data) localStorage.setItem(SAVE_KEY, data);
}

function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

function enterApp() {
  document.getElementById("boot").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("gameover").classList.add("hidden");
  buildMenu();
  render();
  if (state?.gameOver) showGameOver();
}

function refreshContinueButton() {
  const btn = document.getElementById("btn-continue");
  btn.disabled = !loadSavedRaw();
}

function act(payload) {
  const res = parse(pimpwarzAction(JSON.stringify(payload)));
  state = res.state;
  render();
  persistSave();
  if (state.gameOver) showGameOver();
  return res;
}

function getState() {
  state = parse(pimpwarzGetState());
  render();
}

function showGameOver() {
  document.getElementById("gameover").classList.remove("hidden");
  document.getElementById("end-title").textContent = state.won ? "YOU WIN" : "BUSTED";
  document.getElementById("end-msg").textContent = state.overMsg || "Game over.";
}

function openModal(title, bodyHTML) {
  return new Promise((resolve) => {
    modalResolve = resolve;
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHTML;
    document.getElementById("modal").classList.remove("hidden");
  });
}

function closeModal(ok) {
  document.getElementById("modal").classList.add("hidden");
  if (modalResolve) {
    const body = document.getElementById("modal-body");
    const data = {};
    body.querySelectorAll("[name]").forEach((el) => {
      data[el.name] = el.type === "number" ? Number(el.value) : el.value;
    });
    modalResolve(ok ? data : null);
    modalResolve = null;
  }
}

function render() {
  if (!state || !meta) return;

  document.getElementById("day-clock").textContent =
    `Day ${state.day} · ${fmtTime(state.minutes)} · ${Math.floor(state.timeLeft / 60)}h ${state.timeLeft % 60}m left`;

  const pct = Math.min(100, (state.cash / meta.winCash) * 100);
  document.getElementById("stats").innerHTML = `
    <div class="stat"><span class="label">CASH</span><strong>$${money(state.cash)}</strong></div>
    <div class="stat"><span class="label">NET</span><strong>$${money(state.netWorth)}</strong></div>
    <div class="stat"><span class="label">HOUSE</span><strong>Lv ${state.houseLvl}</strong></div>
    <div class="stat"><span class="label">THUGS</span><strong>${state.thugs}</strong></div>
    <div class="stat"><span class="label">SUPPLY</span><strong>${state.condoms}c / ${state.medicine}m</strong></div>
    <div class="stat"><span class="label">PAYOUT</span><strong>${state.payoutPct}%</strong></div>
    <div class="stat" style="flex-basis:100%">
      <span class="label">GOAL</span><strong>$${money(meta.winCash)}</strong>
      <div class="progress"><span style="width:${pct}%"></span></div>
    </div>
  `;

  const logEl = document.getElementById("log");
  logEl.innerHTML = (state.log || []).map((l) =>
    `<p class="line ${l.kind || "info"}">${escapeHtml(l.text)}</p>`
  ).join("");
  logEl.scrollTop = logEl.scrollHeight;

  document.getElementById("worker-count").textContent = `(${(state.workers || []).length})`;
  document.getElementById("workers").innerHTML = (state.workers || []).length === 0
    ? `<p class="meta" style="padding:0.5rem">No workers yet. Press R to recruit.</p>`
    : state.workers.map((w) => {
        const outfit = meta.outfits[w.outfit]?.name || "?";
        const street = w.street >= 0 ? meta.streets[w.street]?.name : "Idle";
        let badges = "";
        if (w.sick) badges += `<span class="badge sick">SICK</span>`;
        if (w.pregnant) badges += `<span class="badge sick">OUT</span>`;
        return `
          <div class="worker-row">
            <div>
              <strong>${escapeHtml(w.name)}</strong>${badges}
              <div class="meta">Looks ${w.looks} · ${escapeHtml(outfit)} · ${escapeHtml(street)} · ${w.hours || 0}h</div>
            </div>
            <div class="actions">
              <button data-act="outfit" data-id="${w.id}">Outfit</button>
              <button data-act="assign" data-id="${w.id}">Assign</button>
              <button data-act="heal" data-id="${w.id}">Heal</button>
              <button data-act="drop" data-id="${w.id}">Drop</button>
            </div>
          </div>`;
      }).join("");

  document.getElementById("streets").innerHTML = meta.streets.map((st, i) => {
    const fill = (state.streetFill && state.streetFill[i]) || 0;
    const need = meta.outfits[st.minTier]?.name || "Rags";
    return `
      <div class="street-row">
        <div>
          <strong>${escapeHtml(st.name)}</strong>
          <div class="meta">$${st.baseRate}/hr · needs ${escapeHtml(need)} · ${fill}/${st.cap}</div>
        </div>
      </div>`;
  }).join("");

  document.getElementById("rivals").innerHTML = (state.rivals || []).map((r, i) => `
    <div class="rival-row">
      <div>
        <strong>${escapeHtml(r.name)}</strong>
        <div class="meta">$${money(r.cash)} · ${r.workers} workers · ${r.thugs} thugs · house ${r.houseLvl}</div>
      </div>
      <div class="actions">
        <button data-covert="${i}" data-kind="steal">Steal</button>
        <button data-covert="${i}" data-kind="infect">Infect</button>
        <button data-covert="${i}" data-kind="firebomb">Bomb</button>
        <button data-covert="${i}" data-kind="impregnate">Sabotage</button>
      </div>
    </div>
  `).join("");

  const clothes = (state.clothes || []).map((c, i) =>
    i === 0 ? null : `${meta.outfits[i].name}: ${c}`
  ).filter(Boolean).join(" · ");
  document.getElementById("panel-extra").classList.remove("hidden");
  document.getElementById("panel-extra").innerHTML =
    `<div class="meta">Wardrobe: ${clothes || "empty"} · Police bribes: $${money(state.policePay)}</div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMenu() {
  const items = [
    { key: "R", label: "Recruit", fn: () => act({ action: "recruit" }) },
    { key: "C", label: "Buy Clothes", fn: buyClothes },
    { key: "S", label: "Buy Supplies", fn: buySupplies },
    { key: "T", label: "Hire Thugs", fn: hireThugs },
    { key: "U", label: "Upgrade House", fn: () => act({ action: "upgradeHouse" }) },
    { key: "P", label: "Pay Police", fn: payPolice },
    { key: "Y", label: "Set Payout %", fn: setPayout },
    { key: "G", label: "Casino", fn: casino },
    { key: "N", label: "Wait Until Night", fn: () => act({ action: "waitNight" }) },
    { key: "B", label: "Buy Restaurant", fn: () => act({ action: "buyRestaurant" }) },
  ];
  const menu = document.getElementById("menu");
  menu.innerHTML = items.map((it) =>
    `<button type="button" data-key="${it.key}"><span class="key">${it.key}</span>${it.label}</button>`
  ).join("");
  menu.querySelectorAll("button").forEach((btn, i) => {
    btn.addEventListener("click", () => items[i].fn());
  });

  window.__menuKeys = Object.fromEntries(items.map((it) => [it.key, it.fn]));
}

async function buyClothes() {
  const opts = meta.outfits.slice(1).map((o, i) =>
    `<option value="${i + 1}">${o.name} — $${money(o.cost)} (+$${o.bonus}/hr)</option>`
  ).join("");
  const data = await openModal("Buy Clothes", `
    <label>Outfit<select name="tier">${opts}</select></label>
    <label>Quantity<input name="qty" type="number" min="1" max="50" value="1" /></label>
  `);
  if (!data) return;
  act({ action: "buyClothes", tier: data.tier, qty: data.qty });
}

async function buySupplies() {
  const data = await openModal("Corner Store", `
    <label>Condoms ($1 ea)<input name="condoms" type="number" min="0" value="50" /></label>
    <label>Medicine ($20 ea)<input name="medicine" type="number" min="0" value="2" /></label>
  `);
  if (!data) return;
  act({ action: "buySupplies", condoms: data.condoms, medicine: data.medicine });
}

async function hireThugs() {
  const data = await openModal("Hire Thugs", `
    <label>Count ($1,000 each)<input name="n" type="number" min="1" value="1" /></label>
  `);
  if (!data) return;
  act({ action: "hireThugs", n: data.n });
}

async function payPolice() {
  const data = await openModal("Pay Police", `
    <label>Bribe amount<input name="amount" type="number" min="1" value="200" /></label>
  `);
  if (!data) return;
  act({ action: "payPolice", amount: data.amount });
}

async function setPayout() {
  const data = await openModal("Worker Payout", `
    <label>Percent (5–90)<input name="pct" type="number" min="5" max="90" value="${state.payoutPct}" /></label>
  `);
  if (!data) return;
  act({ action: "setPayout", pct: data.pct });
}

async function casino() {
  const data = await openModal("Casino", `
    <label>Bet (min $50)<input name="bet" type="number" min="50" value="100" /></label>
  `);
  if (!data) return;
  act({ action: "casino", bet: data.bet });
}

async function outfitWorker(id) {
  const opts = meta.outfits.map((o, i) => {
    const stock = i === 0 ? "∞" : (state.clothes[i] || 0);
    return `<option value="${i}">${o.name} (stock ${stock})</option>`;
  }).join("");
  const data = await openModal("Outfit Worker", `
    <label>Outfit<select name="tier">${opts}</select></label>
  `);
  if (!data) return;
  act({ action: "outfit", workerId: id, tier: Number(data.tier) });
}

async function assignWorker(id) {
  const opts = [`<option value="-1">Idle (pull off street)</option>`]
    .concat(meta.streets.map((st, i) =>
      `<option value="${i}">${st.name} ($${st.baseRate}/hr, needs ${meta.outfits[st.minTier].name})</option>`
    )).join("");
  const data = await openModal("Assign Corner", `
    <label>Street<select name="streetId">${opts}</select></label>
    <label>Hours (1–12)<input name="hours" type="number" min="1" max="12" value="6" /></label>
  `);
  if (!data) return;
  act({ action: "assign", workerId: id, streetId: Number(data.streetId), hours: data.hours });
}

document.getElementById("modal-cancel").addEventListener("click", () => closeModal(false));
document.getElementById("modal-ok").addEventListener("click", () => closeModal(true));

document.getElementById("workers").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const a = btn.dataset.act;
  if (a === "outfit") outfitWorker(id);
  else if (a === "assign") assignWorker(id);
  else if (a === "heal") act({ action: "heal", workerId: id });
  else if (a === "drop") act({ action: "drop", workerId: id });
});

document.getElementById("rivals").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-covert]");
  if (!btn) return;
  act({ action: "covert", rivalIdx: Number(btn.dataset.covert), kind: btn.dataset.kind });
});

document.addEventListener("keydown", (e) => {
  if (document.getElementById("modal").classList.contains("hidden") === false) return;
  if (document.getElementById("boot").classList.contains("hidden") === false) return;
  if (e.target.matches("input, select, textarea")) return;
  const fn = window.__menuKeys && window.__menuKeys[e.key.toUpperCase()];
  if (fn) {
    e.preventDefault();
    fn();
  }
});

document.getElementById("restart").addEventListener("click", () => {
  clearSave();
  refreshContinueButton();
  document.getElementById("gameover").classList.add("hidden");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("boot").classList.remove("hidden");
});

document.getElementById("boot-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("player-name").value.trim() || "Player";
  const res = parse(pimpwarzNewGame(JSON.stringify({ name })));
  state = res.state;
  persistSave();
  refreshContinueButton();
  enterApp();
});

document.getElementById("btn-continue").addEventListener("click", () => {
  const raw = loadSavedRaw();
  if (!raw) {
    document.querySelector(".boot-hint").textContent = "No saved game found.";
    return;
  }
  const res = parse(pimpwarzLoad(raw));
  if (!res.ok || !res.state) {
    document.querySelector(".boot-hint").textContent = res.message || "Could not load save.";
    return;
  }
  state = res.state;
  if (state.playerName) {
    document.getElementById("player-name").value = state.playerName;
  }
  persistSave();
  enterApp();
});

async function boot() {
  document.getElementById("boot-art").textContent = BOOT_ART;
  refreshContinueButton();
  const go = new Go();
  const result = await WebAssembly.instantiateStreaming(fetch("main.wasm"), go.importObject);
  go.run(result.instance);
  meta = parse(pimpwarzGetMeta());
  refreshContinueButton();
}

boot().catch((err) => {
  document.getElementById("boot-art").textContent =
    "Failed to load WASM.\nRun: make build && make serve\n\n" + err;
});
