/* Solar Realms Elite UI — talks to Go WASM (pimpwarz-style shell) */

const SAVE_KEY = "sre_save_v1";

const BOOT_ART = `
███████╗ ██████╗ ██╗      █████╗ ██████╗     ██████╗ ███████╗ █████╗ ██╗     ███╗   ███╗███████╗
██╔════╝██╔═══██╗██║     ██╔══██╗██╔══██╗    ██╔══██╗██╔════╝██╔══██╗██║     ████╗ ████║██╔════╝
███████╗██║   ██║██║     ███████║██████╔╝    ██████╔╝█████╗  ███████║██║     ██╔████╔██║███████╗
╚════██║██║   ██║██║     ██╔══██║██╔══██╗    ██╔══██╗██╔══╝  ██╔══██║██║     ██║╚██╔╝██║╚════██║
███████║╚██████╔╝███████╗██║  ██║██║  ██║    ██║  ██║███████╗██║  ██║███████╗██║ ╚═╝ ██║███████║
╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚══════╝
                    :: E L I T E  ·  BBS Door ::
`;

let meta = null;
let state = null;
let modalResolve = null;

const INSURGENCY = [
  "Peaceful",
  "Mild Insurgencies",
  "Occasional Riots",
  "Violent Demonstrations",
  "Political Conflicts",
  "Internal Violence",
  "Revolutionary Warfare",
  "Under Coup",
];

function money(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function parse(jsonStr) {
  return JSON.parse(jsonStr);
}

function loadSavedRaw() {
  return localStorage.getItem(SAVE_KEY);
}

function persistSave() {
  if (typeof sreSave !== "function") return;
  const data = sreSave();
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
}

function refreshContinueButton() {
  const btn = document.getElementById("btn-continue");
  btn.disabled = !loadSavedRaw();
}

function act(payload) {
  const res = parse(sreAction(JSON.stringify(payload)));
  state = res.state;
  if (!res.ok && res.message) {
    // still render; message is usually already in log
  }
  render();
  persistSave();
  return res;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function planetCounts(planets) {
  const out = [];
  if (!planets || !meta) return out;
  for (const p of meta.planets) {
    const n = planets[String(p.id)] || planets[p.id] || 0;
    if (n > 0) out.push({ ...p, count: n });
  }
  return out;
}

function totalPlanets(planets) {
  return planetCounts(planets).reduce((s, p) => s + Number(p.count), 0);
}

function render() {
  if (!state || !meta) return;
  const p = state.player;
  if (!p) return;

  const phase = state.inTurn ? "IN YEAR" : "READY";
  document.getElementById("day-clock").textContent =
    `Year ${state.year} · ${phase}`;

  const status = INSURGENCY[p.insurgency] || "?";
  document.getElementById("stats").innerHTML = `
    <div class="stat"><span class="label">CREDITS</span><strong>${money(p.credits)}</strong></div>
    <div class="stat"><span class="label">NET</span><strong>${money(p.netWorth)}</strong></div>
    <div class="stat"><span class="label">FOOD</span><strong>${money(p.food)}</strong></div>
    <div class="stat"><span class="label">POP</span><strong>${money(p.population)}</strong></div>
    <div class="stat"><span class="label">PROT</span><strong>${p.protection}y</strong></div>
    <div class="stat"><span class="label">STATUS</span><strong>${escapeHtml(status)}</strong></div>
  `;

  const logEl = document.getElementById("log");
  logEl.innerHTML = (state.log || []).map((l) =>
    `<p class="line ${l.kind || "info"}">${escapeHtml(l.text)}</p>`
  ).join("");
  logEl.scrollTop = logEl.scrollHeight;

  const pcs = planetCounts(p.planets);
  document.getElementById("planet-count").textContent = `(${totalPlanets(p.planets)})`;
  document.getElementById("planets").innerHTML = pcs.length === 0
    ? `<p class="meta" style="padding:0.5rem">No planets.</p>`
    : pcs.map((pl) => `
      <div class="worker-row">
        <div>
          <strong>${escapeHtml(pl.name)}</strong>
          <div class="meta">${money(pl.count)} colonies · ${money(pl.cost)} cr each</div>
        </div>
      </div>`).join("");

  document.getElementById("military").innerHTML = `
    <div class="street-row"><div><strong>Soldiers</strong><div class="meta">ground front</div></div><strong>${money(p.soldiers)}</strong></div>
    <div class="street-row"><div><strong>Fighters</strong><div class="meta">vs defense stations</div></div><strong>${money(p.fighters)}</strong></div>
    <div class="street-row"><div><strong>Def Stations</strong><div class="meta">orbital defense</div></div><strong>${money(p.defStations)}</strong></div>
    <div class="street-row"><div><strong>Light / Heavy Cru</strong><div class="meta">deep space</div></div><strong>${money(p.lightCru)} / ${money(p.heavyCru)}</strong></div>
    <div class="street-row"><div><strong>Carriers / Generals / Agents</strong></div><strong>${money(p.carriers)} / ${money(p.generals)} / ${money(p.agents)}</strong></div>
    <div class="street-row"><div><strong>Command Ship</strong></div><strong>${p.commandShip}%</strong></div>
  `;

  const ranked = [...(state.empires || [])]
    .filter((e) => e.alive)
    .sort((a, b) => (b.netWorth || 0) - (a.netWorth || 0));

  document.getElementById("empires").innerHTML = ranked.map((e) => {
    const you = e.letter === p.letter;
    const prot = e.protection > 0 ? `<span class="badge">PROT ${e.protection}</span>` : "";
    const youBadge = you ? `<span class="badge">YOU</span>` : "";
    const actions = you ? "" : `
      <div class="actions">
        <button data-covert="${escapeHtml(e.letter)}" data-kind="spy">Spy</button>
        <button data-covert="${escapeHtml(e.letter)}" data-kind="bomb">Bomb</button>
        <button data-covert="${escapeHtml(e.letter)}" data-kind="hostage">Hostage</button>
        <button data-attack="${escapeHtml(e.letter)}">Attack</button>
      </div>`;
    return `
      <div class="rival-row">
        <div>
          <strong>[${escapeHtml(e.letter)}] ${escapeHtml(e.name)}</strong>${youBadge}${prot}
          <div class="meta">${money(e.netWorth)} net · ${totalPlanets(e.planets)} planets · ${INSURGENCY[e.insurgency] || "?"}</div>
        </div>
        ${actions}
      </div>`;
  }).join("");

  document.getElementById("panel-extra").classList.remove("hidden");
  document.getElementById("panel-extra").innerHTML =
    `<div class="meta">Bank: ${money(p.bankSavings)} saved · Loan ${money(p.bankLoan)} · Food market ${money(state.foodPrice)} cr/u · Pollution ${p.pollution}% · Autosave on</div>`;
}

function buildMenu() {
  const items = [
    { key: "Y", label: "Play Year", fn: () => act({ action: "playTurn" }) },
    { key: "E", label: "End Year", fn: () => act({ action: "endTurn" }) },
    { key: "M", label: "Buy Military", fn: buyMilitary },
    { key: "C", label: "Colonize", fn: colonize },
    { key: "F", label: "Food Market", fn: foodMarket },
    { key: "B", label: "Solar Bank", fn: bankMenu },
    { key: "A", label: "Attack…", fn: attackMenu },
    { key: "S", label: "Spy / Covert", fn: covertMenu },
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

async function buyMilitary() {
  const opts = meta.units.map((u) =>
    `<option value="${u.id}">${u.name} — ${money(u.cost)} cr</option>`
  ).join("");
  const data = await openModal("Buy Military", `
    <label>Unit<select name="kind">${opts}</select></label>
    <label>Quantity<input name="qty" type="number" min="1" value="10" /></label>
  `);
  if (!data) return;
  act({ action: "buyUnits", kind: data.kind, qty: data.qty });
}

async function colonize() {
  const opts = meta.planets.map((p) =>
    `<option value="${p.id}">${p.name} — ${money(p.cost)} cr</option>`
  ).join("");
  const data = await openModal("Colonize Planets", `
    <label>Type<select name="planetId">${opts}</select></label>
    <label>Quantity<input name="qty" type="number" min="1" value="1" /></label>
  `);
  if (!data) return;
  act({ action: "colonize", planetId: Number(data.planetId), qty: data.qty });
}

async function foodMarket() {
  const need = Math.max(0, Math.floor((state.player.population || 0) / 10));
  const data = await openModal("Food Market", `
    <p class="meta">Price ${money(state.foodPrice)} cr/unit · On hand ${money(state.player.food)}</p>
    <label>Buy amount<input name="buy" type="number" min="0" value="${need}" /></label>
    <label>Sell amount<input name="sell" type="number" min="0" value="0" /></label>
  `);
  if (!data) return;
  if (data.buy > 0) act({ action: "buyFood", amount: data.buy });
  if (data.sell > 0) act({ action: "sellFood", amount: data.sell });
}

async function bankMenu() {
  const data = await openModal("Solar Bank", `
    <p class="meta">Cash ${money(state.player.credits)} · Savings ${money(state.player.bankSavings)} · Loan ${money(state.player.bankLoan)}</p>
    <label>Operation
      <select name="op">
        <option value="deposit">Deposit</option>
        <option value="withdraw">Withdraw</option>
        <option value="loan">Take Loan</option>
        <option value="repay">Repay Loan</option>
        <option value="bond">Buy Bond (8500→10000)</option>
      </select>
    </label>
    <label>Amount<input name="amount" type="number" min="0" value="1000" /></label>
  `);
  if (!data) return;
  act({ action: "bank", op: data.op, amount: data.amount || 0 });
}

async function attackMenu() {
  const targets = (state.empires || []).filter((e) => e.alive && e.letter !== state.player.letter);
  const opts = targets.map((e) =>
    `<option value="${e.letter}">[${e.letter}] ${escapeHtml(e.name)}${e.protection > 0 ? " (PROTECTED)" : ""}</option>`
  ).join("");
  if (!opts) return;
  const data = await openModal("Declare War", `
    <label>Target<select name="letter">${opts}</select></label>
    <label>Style
      <select name="style">
        <option value="conventional">Conventional (3 fronts)</option>
        <option value="guerilla">Guerilla Ambush</option>
      </select>
    </label>
    <label>Soldiers<input name="soldiers" type="number" min="0" value="${Math.floor(state.player.soldiers / 2)}" /></label>
    <label>Fighters<input name="fighters" type="number" min="0" value="${Math.floor(state.player.fighters / 2)}" /></label>
    <label>Heavy Cruisers<input name="heavy" type="number" min="0" value="${state.player.heavyCru}" /></label>
  `);
  if (!data) return;
  act({
    action: "attack",
    letter: data.letter,
    style: data.style,
    soldiers: data.soldiers,
    fighters: data.fighters,
    heavy: data.heavy,
  });
}

async function covertMenu() {
  const targets = (state.empires || []).filter((e) => e.alive && e.letter !== state.player.letter);
  const opts = targets.map((e) =>
    `<option value="${e.letter}">[${e.letter}] ${escapeHtml(e.name)}</option>`
  ).join("");
  if (!opts) return;
  const data = await openModal("Covert Operations", `
    <label>Target<select name="letter">${opts}</select></label>
    <label>Operation
      <select name="kind">
        <option value="spy">Send Spy</option>
        <option value="bomb">Bomb Food *</option>
        <option value="hostage">Take Hostages *</option>
      </select>
    </label>
    <p class="meta">* Not available while under protection</p>
  `);
  if (!data) return;
  act({ action: "covert", letter: data.letter, kind: data.kind });
}

document.getElementById("modal-cancel").addEventListener("click", () => closeModal(false));
document.getElementById("modal-ok").addEventListener("click", () => closeModal(true));

document.getElementById("empires").addEventListener("click", (e) => {
  const cov = e.target.closest("button[data-covert]");
  if (cov) {
    act({ action: "covert", letter: cov.dataset.covert, kind: cov.dataset.kind });
    return;
  }
  const atk = e.target.closest("button[data-attack]");
  if (atk) openAttackOn(atk.dataset.attack);
});

async function openAttackOn(letter) {
  const emp = (state.empires || []).find((x) => x.letter === letter);
  if (!emp) return;
  const data = await openModal(`Attack ${emp.name}`, `
    <input type="hidden" name="letter" value="${escapeHtml(letter)}" />
    <label>Style
      <select name="style">
        <option value="conventional">Conventional</option>
        <option value="guerilla">Guerilla</option>
      </select>
    </label>
    <label>Soldiers<input name="soldiers" type="number" min="0" value="${Math.floor(state.player.soldiers / 2)}" /></label>
    <label>Fighters<input name="fighters" type="number" min="0" value="${Math.floor(state.player.fighters / 2)}" /></label>
    <label>Heavy Cruisers<input name="heavy" type="number" min="0" value="${state.player.heavyCru}" /></label>
  `);
  if (!data) return;
  act({
    action: "attack",
    letter: data.letter || letter,
    style: data.style,
    soldiers: data.soldiers,
    fighters: data.fighters,
    heavy: data.heavy,
  });
}

document.addEventListener("keydown", (e) => {
  if (!document.getElementById("modal").classList.contains("hidden")) return;
  if (!document.getElementById("boot").classList.contains("hidden")) return;
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
  const name = document.getElementById("player-name").value.trim() || "New Empire";
  const res = parse(sreNewGame(JSON.stringify({ name })));
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
  const res = parse(sreLoad(raw));
  if (!res.ok || !res.state) {
    document.querySelector(".boot-hint").textContent = res.message || "Could not load save.";
    return;
  }
  state = res.state;
  if (state.player?.name) {
    document.getElementById("player-name").value = state.player.name;
  }
  persistSave();
  enterApp();
});

async function boot() {
  document.getElementById("boot-art").textContent = BOOT_ART;
  refreshContinueButton();
  const go = new Go();
  const result = await WebAssembly.instantiateStreaming(fetch("sre.wasm"), go.importObject);
  go.run(result.instance);
  meta = parse(sreGetMeta());
  refreshContinueButton();
}

boot().catch((err) => {
  document.getElementById("boot-art").textContent =
    "Failed to load WASM.\nRun: make build && make serve\n\n" + err;
});
