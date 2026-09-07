/* Legend of the Red Dragon UI — talks to Go WASM */

const SAVE_KEY = "lord_wasm_save_v1";

const BOOT_ART = `
 ██╗      ██████╗ ██████╗ ██████╗ 
 ██║     ██╔═══██╗██╔══██╗██╔══██╗
 ██║     ██║   ██║██████╔╝██║  ██║
 ██║     ██║   ██║██╔══██╗██║  ██║
 ███████╗╚██████╔╝██║  ██║██████╔╝
 ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ 

      LEGEND OF THE RED DRAGON
`;

let state = null;
let modalResolve = null;
let awaitingAmount = false;

function parse(jsonStr) {
  return JSON.parse(jsonStr);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function persistSave() {
  if (typeof lordSave !== "function") return;
  const data = lordSave();
  if (data) localStorage.setItem(SAVE_KEY, data);
}

function loadSavedRaw() {
  return localStorage.getItem(SAVE_KEY);
}

function showApp() {
  document.getElementById("boot").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

function showBoot() {
  document.getElementById("app").classList.add("hidden");
  document.getElementById("boot").classList.remove("hidden");
  document.getElementById("gameover").classList.add("hidden");
}

function act(cmd) {
  const res = parse(lordAction(JSON.stringify({ cmd: String(cmd ?? "") })));
  state = res.state;
  render();
  persistSave();
  maybePromptAmount();
  maybeShowVictory();
  return res;
}

function openModal(title, bodyHTML) {
  return new Promise((resolve) => {
    modalResolve = resolve;
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHTML;
    document.getElementById("modal").classList.remove("hidden");
    const first = document.querySelector("#modal-body input, #modal-body select");
    if (first) first.focus();
  });
}

function closeModal(ok) {
  document.getElementById("modal").classList.add("hidden");
  if (!modalResolve) return;
  const body = document.getElementById("modal-body");
  const data = {};
  body.querySelectorAll("[name]").forEach((el) => {
    data[el.name] = el.type === "number" ? Number(el.value) : el.value;
  });
  modalResolve(ok ? data : null);
  modalResolve = null;
}

async function maybePromptAmount() {
  if (!state || !state.needsAmount || awaitingAmount) return;
  awaitingAmount = true;
  const deposit = state.mode === "bankDeposit";
  const max = state.player
    ? deposit
      ? state.player.gold
      : state.player.bankGold
    : 0;
  const data = await openModal(deposit ? "Deposit" : "Withdraw", `
    <label>Amount (max ${money(max)}; use ${max} for all)
      <input name="amount" type="number" min="1" max="${max || 1}" value="${Math.min(max, 50) || 1}" />
    </label>
  `);
  awaitingAmount = false;
  if (!data) {
    act("cancel");
    return;
  }
  const amt = Number(data.amount);
  if (!amt || amt <= 0) {
    act(String(max || 0));
    return;
  }
  act(String(Math.floor(amt)));
}

function maybeShowVictory() {
  if (!state || state.mode !== "victory") return;
  document.getElementById("gameover").classList.remove("hidden");
  document.getElementById("end-title").textContent = "VICTORY";
  const name = state.player?.name || "Hero";
  document.getElementById("end-msg").textContent =
    `${name} has become legend. The Red Dragon is slain.`;
}

function render() {
  if (!state) return;

  const p = state.player;
  document.getElementById("day-clock").textContent = p
    ? `Day ${p.daysPlayed} · ${state.location}`
    : state.location;

  if (p) {
    const expPct = p.expToLevel > 0 ? Math.min(100, (p.exp / p.expToLevel) * 100) : 0;
    document.getElementById("stats").innerHTML = `
      <div class="stat"><span class="label">HP</span><strong>${p.hp}/${p.maxHp}</strong></div>
      <div class="stat"><span class="label">GOLD</span><strong>${money(p.gold)}</strong></div>
      <div class="stat"><span class="label">BANK</span><strong>${money(p.bankGold)}</strong></div>
      <div class="stat"><span class="label">LVL</span><strong>${p.level}</strong></div>
      <div class="stat"><span class="label">FOREST</span><strong>${p.forestLeft}</strong></div>
      <div class="stat" style="flex-basis:100%">
        <span class="label">EXP</span><strong>${money(p.exp)} / ${money(p.expToLevel)}</strong>
        <div class="progress"><span style="width:${expPct}%"></span></div>
      </div>
    `;
  } else {
    document.getElementById("stats").innerHTML =
      `<div class="stat"><span class="label">STATUS</span><strong>No warrior</strong></div>`;
  }

  const logEl = document.getElementById("log");
  logEl.innerHTML = (state.log || [])
    .map((l) => `<p class="line ${l.kind || "info"}">${escapeHtml(l.text)}</p>`)
    .join("");
  logEl.scrollTop = logEl.scrollHeight;

  buildMenu();

  if (p) {
    document.getElementById("gear").innerHTML = `
      <div class="row"><span>Weapon</span><strong>${escapeHtml(p.weapon)} (+${p.weaponPower})</strong></div>
      <div class="row"><span>Armor</span><strong>${escapeHtml(p.armor)} (+${p.armorPower})</strong></div>
      <div class="row"><span>Strength</span><strong>${p.strength}</strong></div>
      <div class="row"><span>Defense</span><strong>${p.defense}</strong></div>
      <div class="row"><span>Charm</span><strong>${p.charm}</strong></div>
      <div class="row"><span>Class</span><strong>${escapeHtml(p.class)}</strong></div>
      <div class="row"><span>Warrior</span><strong>${escapeHtml(p.name)}</strong></div>
    `;
  } else {
    document.getElementById("gear").innerHTML =
      `<p class="meta">Create or continue a warrior.</p>`;
  }

  document.getElementById("location-head").textContent =
    state.combat ? "COMBAT" : "LOCATION";

  if (state.combat) {
    const c = state.combat;
    const pct = c.maxHp > 0 ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 0;
    const youPct = p && p.maxHp > 0 ? Math.min(100, (p.hp / p.maxHp) * 100) : 0;
    document.getElementById("location").innerHTML = `
      <div class="row"><span>Enemy</span><strong>${escapeHtml(c.name)}</strong></div>
      <div class="meta">HP ${c.hp} / ${c.maxHp}${c.isDragon ? " · DRAGON" : ""}</div>
      <div class="hp-bar enemy"><span style="width:${pct}%"></span></div>
      <div class="row" style="margin-top:0.75rem"><span>You</span><strong>${p ? `${p.hp}/${p.maxHp}` : "—"}</strong></div>
      <div class="hp-bar"><span style="width:${youPct}%"></span></div>
    `;
  } else {
    let extra = "";
    if (state.mode === "healer" && state.healerCost != null) {
      extra = `<div class="meta">Full heal cost: ${money(state.healerCost)} gold</div>`;
    }
    document.getElementById("location").innerHTML = `
      <div class="row"><span>Place</span><strong>${escapeHtml(state.location)}</strong></div>
      <div class="meta">Mode: ${escapeHtml(state.mode)}</div>
      ${extra}
    `;
  }

  const shop = document.getElementById("shop");
  const items = state.shopItems || [];
  if (items.length) {
    shop.innerHTML = items
      .map((it) => {
        const mark = it.owned ? " · equipped" : it.better ? "" : " · owned/worse";
        const canBuy = it.better && it.afford;
        return `
          <div class="shop-row">
            <div>
              <strong>${escapeHtml(it.name)}</strong>
              <div class="meta">+${it.power} · ${money(it.cost)}g${mark}</div>
            </div>
            ${canBuy ? `<button type="button" data-buy="${it.index}">Buy</button>` : ""}
          </div>`;
      })
      .join("");
    shop.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => act(btn.getAttribute("data-buy")));
    });
  } else if (p) {
    shop.innerHTML = `
      <div class="row"><span>Flirts</span><strong>${p.flirts}</strong></div>
      <div class="row"><span>Dragon</span><strong>${p.defeatedDragon ? "SLAIN" : "Alive"}</strong></div>
      <div class="meta">Use the menu to travel, fight, and trade.</div>
    `;
  } else {
    shop.innerHTML = `<p class="meta">Awaiting dial-in...</p>`;
  }

  const extra = document.getElementById("panel-extra");
  if (state.inputKind === "continue") {
    extra.classList.remove("hidden");
    extra.innerHTML = `<div class="meta">Press Continue or Enter to proceed.</div>`;
  } else if (state.needsAmount) {
    extra.classList.remove("hidden");
    extra.innerHTML = `<div class="meta">Enter an amount in the dialog...</div>`;
  } else {
    extra.classList.add("hidden");
  }
}

function buildMenu() {
  const items = state.menu || [];
  const menu = document.getElementById("menu");
  menu.innerHTML = items
    .map(
      (it) =>
        `<button type="button" data-cmd="${escapeHtml(it.cmd)}" data-key="${escapeHtml(it.key)}"><span class="key">${escapeHtml(it.key)}</span>${escapeHtml(it.label)}</button>`
    )
    .join("");

  const handlers = {};
  menu.querySelectorAll("button").forEach((btn) => {
    const cmd = btn.getAttribute("data-cmd") ?? "";
    const key = (btn.getAttribute("data-key") || "").toUpperCase();
    const fn = () => act(cmd);
    btn.addEventListener("click", fn);
    if (key && key !== "⏎") handlers[key] = fn;
    if (key === "⏎" || cmd === "") handlers["ENTER"] = fn;
  });
  window.__menuKeys = handlers;
}

async function startNewGame(name) {
  if (typeof lordNewGame !== "function") {
    document.querySelector(".boot-hint").textContent =
      "Game engine not ready yet — wait a moment and try again.";
    return;
  }
  try {
    const trimmed = String(name || "").trim();
    if (trimmed.length < 2 || trimmed.length > 16) {
      document.querySelector(".boot-hint").textContent =
        "Name must be 2–16 characters.";
      return;
    }
    const res = parse(lordNewGame(JSON.stringify({ name: trimmed })));
    state = res.state;
    showApp();
    render();
    persistSave();
  } catch (err) {
    console.error(err);
    document.querySelector(".boot-hint").textContent =
      "Could not start game: " + (err && err.message ? err.message : err);
  }
}

function continueGame() {
  if (typeof lordLoad !== "function") {
    document.querySelector(".boot-hint").textContent = "Game engine not ready yet.";
    return;
  }
  const raw = loadSavedRaw();
  if (!raw) {
    document.querySelector(".boot-hint").textContent = "No saved game found.";
    return;
  }
  try {
    const res = parse(lordLoad(raw));
    if (!res.state?.hasPlayer) {
      document.querySelector(".boot-hint").textContent =
        res.message || "Could not load save.";
      return;
    }
    state = res.state;
    showApp();
    render();
    persistSave();
  } catch (err) {
    console.error(err);
    document.querySelector(".boot-hint").textContent =
      "Could not load save: " + (err && err.message ? err.message : err);
  }
}

document.getElementById("boot-art").textContent = BOOT_ART;

document.getElementById("boot-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("player-name").value.trim() || "Warrior";
  startNewGame(name);
});

document.getElementById("btn-new").addEventListener("click", (e) => {
  e.preventDefault();
  const name = document.getElementById("player-name").value.trim() || "Warrior";
  startNewGame(name);
});

document.getElementById("btn-continue").addEventListener("click", () => {
  continueGame();
});

document.getElementById("modal-cancel").addEventListener("click", () => closeModal(false));
document.getElementById("modal-ok").addEventListener("click", () => closeModal(true));

document.getElementById("restart").addEventListener("click", () => {
  document.getElementById("gameover").classList.add("hidden");
  if (typeof lordNewGame === "function") {
    parse(lordNewGame(JSON.stringify({})));
  }
  showBoot();
});

document.addEventListener("keydown", (e) => {
  if (!document.getElementById("app").classList.contains("hidden")) {
    if (e.key === "Enter" && window.__menuKeys?.ENTER) {
      if (document.getElementById("modal").classList.contains("hidden") &&
          document.getElementById("gameover").classList.contains("hidden")) {
        e.preventDefault();
        window.__menuKeys.ENTER();
        return;
      }
    }
    const k = e.key.toUpperCase();
    if (window.__menuKeys?.[k] &&
        document.getElementById("modal").classList.contains("hidden") &&
        document.getElementById("gameover").classList.contains("hidden") &&
        !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      e.preventDefault();
      window.__menuKeys[k]();
    }
  }
});

function setBootReady(ready, msg) {
  document.getElementById("btn-new").disabled = !ready;
  const cont = document.getElementById("btn-continue");
  cont.disabled = !ready || !loadSavedRaw();
  if (msg) document.querySelector(".boot-hint").textContent = msg;
}

async function boot() {
  setBootReady(false, "Loading door...");
  if (!WebAssembly) {
    setBootReady(false, "WebAssembly not supported");
    return;
  }
  if (typeof Go !== "function") {
    setBootReady(false, "Missing wasm_exec.js — hard-refresh the page.");
    return;
  }
  const go = new Go();
  const result = await WebAssembly.instantiateStreaming(fetch("lord.wasm"), go.importObject);
  go.run(result.instance);
  await new Promise((r) => setTimeout(r, 50));
  if (typeof lordGetState !== "function" || typeof lordNewGame !== "function") {
    setBootReady(false, "Door failed to initialize");
    return;
  }
  state = parse(lordGetState());
  setBootReady(true, "Face the forest. Woo the inn. Slay the Red Dragon.");
}

boot().catch((err) => {
  console.error(err);
  setBootReady(
    false,
    "Failed to load WASM — run make serve and ensure lord.wasm exists. " +
      (err && err.message ? err.message : "")
  );
});
