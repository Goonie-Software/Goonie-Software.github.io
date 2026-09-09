/* The Pit UI — talks to Go WASM */

const SAVE_KEY = "the_pit_wasm_save_v1";

const BOOT_ART = `
 ████████╗██╗  ██╗███████╗    ██████╗ ██╗████████╗
 ╚══██╔══╝██║  ██║██╔════╝    ██╔══██╗██║╚══██╔══╝
    ██║   ███████║█████╗      ██████╔╝██║   ██║
    ██║   ██╔══██║██╔══╝      ██╔═══╝ ██║   ██║
    ██║   ██║  ██║███████╗    ██║     ██║   ██║
    ╚═╝   ╚═╝  ╚═╝╚══════╝    ╚═╝     ╚═╝   ╚═╝

         HORNBLUFF'S ARENA — REGAL CITY
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
  if (typeof pitSave !== "function") return;
  const data = pitSave();
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
  const res = parse(pitAction(JSON.stringify({ cmd: String(cmd ?? "") })));
  state = res.state;
  render();
  persistSave();
  maybePromptAmount();
  maybeShowDead();
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
  const kind = state.inputKind;
  let title = "Amount";
  let max = state.player ? state.player.gold : 0;
  if (kind === "amount" && state.mode === "bankWithdraw") {
    title = "Withdraw";
    max = state.player?.bankGold || 0;
  } else if (kind === "amount" && state.mode === "bankDeposit") {
    title = "Deposit";
    max = state.player?.gold || 0;
  } else if (kind === "bet") {
    title = "Bet";
    max = Math.min(500, state.player?.gold || 0);
  } else if (kind === "heal") {
    title = "Heal Points";
    max = state.player
      ? Math.min(
          Math.floor((state.player.gold || 0) / 3),
          (state.player.maxHp || 0) - (state.player.hp || 0)
        )
      : 0;
  }
  const data = await openModal(title, `
    <label>Amount (max ${money(max)})
      <input name="amount" type="number" min="1" max="${max || 1}" value="${Math.min(max, kind === "bet" ? 25 : 50) || 1}" />
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

function maybeShowDead() {
  if (!state || state.mode !== "dead") return;
  document.getElementById("gameover").classList.remove("hidden");
  document.getElementById("end-title").textContent = "FALLEN";
  const name = state.player?.name || "Gladiator";
  document.getElementById("end-msg").textContent =
    `${name} lies in the sand. Return tomorrow — if the sysop allows.`;
}

function renderArena(a) {
  if (!a || !a.grid) return "";
  const cols = a.width || (a.grid[0] ? a.grid[0].length : 0);
  let cells = "";
  for (let y = 0; y < a.grid.length; y++) {
    const row = [...a.grid[y]];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      let cls = "arena-cell";
      if (ch === "#") cls += " wall";
      else if (ch === "D") cls += " door";
      else if (x === a.playerX && y === a.playerY) cls += " player";
      else if (x === a.foeX && y === a.foeY) cls += " foe";
      cells += `<div class="${cls}">${escapeHtml(ch)}</div>`;
    }
  }
  return `
    <div class="row"><span>Foe</span><strong>${escapeHtml(a.foeName)}</strong></div>
    <div class="meta">HP ${a.foeHp}/${a.foeMaxHp} · Phase ${a.phase} · Moves ${a.moves} · Atks ${a.attacks}</div>
    <div class="hp-bar enemy"><span style="width:${a.foeMaxHp ? Math.max(0, (a.foeHp / a.foeMaxHp) * 100) : 0}%"></span></div>
    <div class="arena-grid" style="grid-template-columns: repeat(${cols}, 1.15rem)">${cells}</div>
    <div class="meta" style="margin-top:0.5rem">Ω you · D door (flee) · letter = foe</div>
  `;
}

function render() {
  if (!state) return;

  const p = state.player;
  document.getElementById("day-clock").textContent = p
    ? `Day ${p.daysPlayed} · ${state.location}`
    : state.location;

  if (p) {
    const hpPct = p.maxHp > 0 ? Math.min(100, (p.hp / p.maxHp) * 100) : 0;
    document.getElementById("stats").innerHTML = `
      <div class="stat"><span class="label">HP</span><strong>${p.hp}/${p.maxHp}</strong></div>
      <div class="stat"><span class="label">GOLD</span><strong>${money(p.gold)}</strong></div>
      <div class="stat"><span class="label">BANK</span><strong>${money(p.bankGold)}</strong></div>
      <div class="stat"><span class="label">LVL</span><strong>${p.level}</strong></div>
      <div class="stat"><span class="label">FIGHTS</span><strong>${p.fightsLeft}</strong></div>
      <div class="stat" style="flex-basis:100%">
        <span class="label">SCORE</span><strong>${money(p.score)}</strong>
        <div class="hp-bar"><span style="width:${hpPct}%"></span></div>
      </div>
    `;
  } else {
    document.getElementById("stats").innerHTML =
      `<div class="stat"><span class="label">STATUS</span><strong>No gladiator</strong></div>`;
  }

  const logEl = document.getElementById("log");
  logEl.innerHTML = (state.log || [])
    .map((l) => `<p class="line ${l.kind || "info"}">${escapeHtml(l.text)}</p>`)
    .join("");
  logEl.scrollTop = logEl.scrollHeight;

  buildMenu();

  if (p) {
    document.getElementById("gear").innerHTML = `
      <div class="row"><span>Warrior</span><strong>${escapeHtml(p.name)}</strong></div>
      <div class="row"><span>Hand</span><strong>${escapeHtml(p.hand)} (+${p.handPower})</strong></div>
      <div class="row"><span>Range</span><strong>${escapeHtml(p.ranged)} (+${p.rangePower})</strong></div>
      <div class="row"><span>Armor</span><strong>${escapeHtml(p.armor)} (+${p.armorPower})</strong></div>
      <div class="row"><span>Projectiles</span><strong>${p.projectiles}</strong></div>
      <div class="row"><span>Potions</span><strong>${p.potions}</strong></div>
      <div class="row"><span>Attacks/Phase</span><strong>${p.attacks}</strong></div>
      <div class="row"><span>W/L</span><strong>${p.wins}/${p.losses} (${p.winRatio.toFixed(1)}%)</strong></div>
    `;
  } else {
    document.getElementById("gear").innerHTML =
      `<p class="meta">Create or continue a gladiator.</p>`;
  }

  document.getElementById("location-head").textContent =
    state.arena ? "THE PIT" : "LOCATION";

  if (state.arena) {
    document.getElementById("location").innerHTML = renderArena(state.arena);
  } else {
    let extra = "";
    if (state.mode === "healer" && state.healerCost != null) {
      extra = `<div class="meta">Full heal cost: ${money(state.healerCost)} gold</div>`;
    }
    document.getElementById("location").innerHTML = `
      <div class="row"><span>Place</span><strong>${escapeHtml(state.location)}</strong></div>
      <div class="meta">Mode: ${escapeHtml(state.mode)}</div>
      ${extra}
      ${p ? `<div class="meta" style="margin-top:0.5rem">Sessions left: ${p.sessionsLeft}</div>` : ""}
    `;
  }

  const shop = document.getElementById("shop");
  const items = state.shopItems || [];
  if (items.length) {
    shop.innerHTML = items
      .map((it) => {
        const mark = it.owned ? " · equipped" : it.better ? "" : "";
        const canBuy = !it.owned && it.afford && it.cost > 0;
        const rng = it.range ? ` · rng ${it.range}` : "";
        return `
          <div class="shop-row">
            <div>
              <strong>${escapeHtml(it.name)}</strong>
              <div class="meta">+${it.power}${rng} · ${money(it.cost)}g${mark}</div>
            </div>
            ${canBuy ? `<button type="button" data-buy="${it.index}">Buy</button>` : ""}
          </div>`;
      })
      .join("");
    shop.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => act(btn.getAttribute("data-buy")));
    });
  } else if (state.tiers && state.tiers.length) {
    shop.innerHTML = state.tiers
      .map(
        (t) =>
          `<div class="shop-row"><div><strong>${escapeHtml(t.key)}</strong> ${escapeHtml(t.label)}</div>
           <button type="button" data-tier="${escapeHtml(t.cmd)}">Fight</button></div>`
      )
      .join("");
    shop.querySelectorAll("[data-tier]").forEach((btn) => {
      btn.addEventListener("click", () => act(btn.getAttribute("data-tier")));
    });
  } else if (p) {
    shop.innerHTML = `
      <div class="row"><span>Score</span><strong>${money(p.score)}</strong></div>
      <div class="row"><span>Fights today</span><strong>${p.fightsLeft}</strong></div>
      <div class="meta">Buy gear, heal, then enter The Pit. Flee through the door (D) if outmatched.</div>
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
  } else if (state.arena?.awaitDir) {
    extra.classList.remove("hidden");
    extra.innerHTML = `<div class="meta">Choose a direction for ${state.arena.awaitDir}.</div>`;
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
    if (key && key !== "⏎" && key !== "↑" && key !== "↓" && key !== "←" && key !== "→") {
      handlers[key] = fn;
    }
    if (key === "⏎" || cmd === "") handlers["ENTER"] = fn;
    if (key === "↑") handlers["ARROWUP"] = fn;
    if (key === "↓") handlers["ARROWDOWN"] = fn;
    if (key === "←") handlers["ARROWLEFT"] = fn;
    if (key === "→") handlers["ARROWRIGHT"] = fn;
    if (key === ".") handlers["PERIOD"] = fn;
    if (key === "+") handlers["="] = fn; // shift+= often
  });
  // Arena movement from keyboard even if menu maps them
  if (state.mode === "arena") {
    handlers["ARROWUP"] = () => act(state.arena?.awaitDir ? "arrowup" : "move_n");
    handlers["ARROWDOWN"] = () => act(state.arena?.awaitDir ? "arrowdown" : "move_s");
    handlers["ARROWLEFT"] = () => act(state.arena?.awaitDir ? "arrowleft" : "move_w");
    handlers["ARROWRIGHT"] = () => act(state.arena?.awaitDir ? "arrowright" : "move_e");
    handlers["W"] = () => act(state.arena?.awaitDir ? "arrowup" : "move_n");
    handlers["S"] = handlers["S"] || (() => act(state.arena?.awaitDir ? "arrowdown" : "move_s"));
    // Don't override A (attack) with left
  }
  window.__menuKeys = handlers;
}

async function startNewGame(name) {
  if (typeof pitNewGame !== "function") {
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
    const res = parse(pitNewGame(JSON.stringify({ name: trimmed })));
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
  if (typeof pitLoad !== "function") {
    document.querySelector(".boot-hint").textContent = "Game engine not ready yet.";
    return;
  }
  const raw = loadSavedRaw();
  if (!raw) {
    document.querySelector(".boot-hint").textContent = "No saved game found.";
    return;
  }
  try {
    const res = parse(pitLoad(raw));
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

function openHelp(e) {
  if (e) e.preventDefault();
  document.getElementById("help").classList.remove("hidden");
}

function closeHelp() {
  document.getElementById("help").classList.add("hidden");
}

document.getElementById("boot-help").addEventListener("click", openHelp);
document.getElementById("app-help").addEventListener("click", openHelp);
document.getElementById("help-close").addEventListener("click", closeHelp);
document.getElementById("help").addEventListener("click", (e) => {
  if (e.target.id === "help") closeHelp();
});

document.getElementById("boot-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("player-name").value.trim() || "Farmboy";
  startNewGame(name);
});

document.getElementById("btn-new").addEventListener("click", (e) => {
  e.preventDefault();
  const name = document.getElementById("player-name").value.trim() || "Farmboy";
  startNewGame(name);
});

document.getElementById("btn-continue").addEventListener("click", () => {
  continueGame();
});

document.getElementById("modal-cancel").addEventListener("click", () => closeModal(false));
document.getElementById("modal-ok").addEventListener("click", () => closeModal(true));

document.getElementById("restart").addEventListener("click", () => {
  document.getElementById("gameover").classList.add("hidden");
  if (typeof pitNewGame === "function") {
    parse(pitNewGame(JSON.stringify({})));
  }
  showBoot();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("help").classList.contains("hidden")) {
    closeHelp();
    return;
  }
  if (document.getElementById("app").classList.contains("hidden")) return;
  if (!document.getElementById("modal").classList.contains("hidden")) return;
  if (!document.getElementById("gameover").classList.contains("hidden")) return;
  if (!document.getElementById("help").classList.contains("hidden")) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

  if (e.key === "Enter" && window.__menuKeys?.ENTER) {
    e.preventDefault();
    window.__menuKeys.ENTER();
    return;
  }
  if (e.key === "." && window.__menuKeys?.PERIOD) {
    e.preventDefault();
    window.__menuKeys.PERIOD();
    return;
  }
  const arrowMap = {
    ArrowUp: "ARROWUP",
    ArrowDown: "ARROWDOWN",
    ArrowLeft: "ARROWLEFT",
    ArrowRight: "ARROWRIGHT",
  };
  if (arrowMap[e.key] && window.__menuKeys?.[arrowMap[e.key]]) {
    e.preventDefault();
    window.__menuKeys[arrowMap[e.key]]();
    return;
  }
  const k = e.key.toUpperCase();
  if (window.__menuKeys?.[k] && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    window.__menuKeys[k]();
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
  const result = await WebAssembly.instantiateStreaming(fetch("pit.wasm"), go.importObject);
  go.run(result.instance);
  await new Promise((r) => setTimeout(r, 50));
  if (typeof pitGetState !== "function" || typeof pitNewGame !== "function") {
    setBootReady(false, "Door failed to initialize");
    return;
  }
  state = parse(pitGetState());
  setBootReady(true, "Fight for gold and glory in Hornbluff's Arena. Autosave is on.");
}

boot().catch((err) => {
  console.error(err);
  setBootReady(
    false,
    "Failed to load WASM — run make serve and ensure pit.wasm exists. " +
      (err && err.message ? err.message : "")
  );
});
