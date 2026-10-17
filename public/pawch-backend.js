// PawchPay backend wiring: real accounts, balances and transactions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = "https://c--027b4a81-b9cb-428a-92b9-8e212cf8604f-prod.lovable.cloud";
const SUPABASE_KEY = "sb_publishable_emIUqL_atpX-TZxfBvlolA_y7xvHuIY";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "pawchpay-auth" },
});

const $ = (id) => document.getElementById(id);
const toast = (m) => window.toast && window.toast(m);
const money = (n) =>
  "₦" + Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const initials = (name) =>
  (name || "PawchPay")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "PP";

const ICON = {
  out: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  in: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  airtime:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
};

const state = { user: null, profile: null, wallet: null, txns: [], balanceVisible: true };

// ---------- rendering ----------
function txRows(list) {
  if (!list.length)
    return '<p style="text-align:center; font-size:13px; color:var(--muted); padding:18px 0;">No transactions yet</p>';
  return list
    .map((t) => {
      const pos = t.direction === "in";
      const when = new Date(t.created_at);
      const time = when.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
      const day = when.toDateString() === new Date().toDateString() ? time : when.toLocaleDateString();
      const icon = t.kind === "airtime" ? ICON.airtime : pos ? ICON.in : ICON.out;
      return `<div class="tx-row">
        <div class="tx-icon">${icon}</div>
        <div class="tx-mid"><b>${escapeHtml(t.title)}</b><span>${escapeHtml(t.category)} · ${day}</span></div>
        <div class="tx-right">
          <div class="tx-amt ${pos ? "pos" : ""}">${pos ? "+" : "-"}${money(t.amount)}</div>
          ${statusTag(t)}
        </div>
      </div>`;
    })
    .join("");
}
function statusTag(t) {
  let cls = t.status, label = t.status[0].toUpperCase() + t.status.slice(1);
  if (t.kind === "transfer" && t.status === "failed") { cls = "reversed"; label = "Reversed"; }
  if (t.kind === "reversal") label = "Refunded";
  return `<div class="status-tag ${cls}">${label}</div>`;
}
const escapeHtml = (s) =>
  String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function render() {
  const bal = state.wallet ? state.wallet.balance : 0;
  setText("balanceTxt", state.balanceVisible ? money(bal) : "₦•••••••");
  setText("balanceSub", `${state.txns.length} transactions recorded`);
  setText("sendAvail", `Available balance: ${money(bal)}`);

  const name = state.profile?.full_name || "PawchPay user";
  setText("greetName", name);
  setText("dashAvatar", initials(name));
  setText("profileName", name);
  setText("profileAvatar", initials(name));
  setText("profileEmail", state.user?.email || "");
  setText("profileBalance", money(bal));
  setText("profileTxCount", String(state.txns.length));
  if (state.profile?.account_number) {
    const a = state.profile.account_number;
    setText("acctNumber", a);
    window.__acctNumber = a;
  }

  const today = state.txns.filter((t) => new Date(t.created_at).toDateString() === new Date().toDateString());
  const older = state.txns.filter((t) => new Date(t.created_at).toDateString() !== new Date().toDateString());
  const put = (id, html) => {
    const el = $(id);
    if (el) el.innerHTML = html;
  };
  put("txListDash", txRows(state.txns.slice(0, 4)));
  put("txListFullToday", txRows(today));
  put("txListFullYesterday", txRows(older));
  put("txListCards", txRows(state.txns.slice(0, 5)));
}

async function refresh() {
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return false;
  state.user = sess.session.user;
  const [{ data: profile }, { data: wallet }, { data: txns }] = await Promise.all([
    sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle(),
    sb.from("wallets").select("*").eq("user_id", state.user.id).maybeSingle(),
    sb.from("transactions").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  state.profile = profile;
  state.wallet = wallet;
  state.txns = txns || [];
  render();
  loadSecureData();
  loadSavings();
  return true;
}

// ---------- auth ----------
window.doLogin = async function () {
  const email = $("loginInput").value.trim();
  const pass = $("loginPass").value;
  const btn = $("loginBtn");
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false;
  if (error) {
    window.openResult(false, "Login failed", error.message);
    return;
  }
  await refresh();
  await startSecurityCheck();
};

window.doSignUp = async function () {
  const btn = $("signUpBtn");
  btn.disabled = true;
  const { error } = await sb.auth.signUp({
    email: $("suEmail").value.trim(),
    password: $("suPass").value,
    options: {
      emailRedirectTo: window.location.origin,
      data: { full_name: $("suName").value.trim(), phone: $("suPhone").value.trim() },
    },
  });
  btn.disabled = false;
  if (error) {
    window.openResult(false, "Sign up failed", error.message);
    return;
  }
  await refresh();
  await startSecurityCheck();
};

async function startSecurityCheck() {
  const { data, error } = await sb.rpc("issue_login_code");
  window.go("otp");
  window.startTimer();
  if (error) {
    toast("Could not send code");
    return;
  }
  setText("otpHint", `Demo mode: your security code is ${data}`);
  toast(`Security code: ${data}`);
}

window.verifyOtp = async function () {
  const boxes = document.querySelectorAll("#otp .otp-boxes input");
  const code = Array.from(boxes)
    .map((b) => b.value)
    .join("");
  if (code.length < 6) {
    toast("Enter all 6 digits");
    return;
  }
  const { data, error } = await sb.rpc("verify_login_code", { p_code: code });
  if (error || !data) {
    window.openResult(false, "Verification failed", "That code looks incorrect or has expired. Please try again.");
    return;
  }
  boxes.forEach((b) => (b.value = ""));
  await refresh();
  window.switchTab("dashboard");
  toast("Welcome to PawchPay");
};

window.logoutFlow = async function () {
  await sb.auth.signOut();
  state.user = state.profile = state.wallet = null;
  state.txns = [];
  toast("Logged out");
  setTimeout(() => {
    window.go("login");
    $("loginPass").value = "";
    window.checkLogin();
  }, 400);
};

window.toggleBalance = function () {
  state.balanceVisible = !state.balanceVisible;
  render();
};

window.copyAcct = function () {
  navigator.clipboard && navigator.clipboard.writeText(window.__acctNumber || "").catch(() => {});
  const pill = $("copiedPill");
  pill.classList.add("show");
  setTimeout(() => pill.classList.remove("show"), 1400);
};

// ---------- secure money movements (server routes; identity from verified session) ----------
const digits = (v) => Number(String(v || "").replace(/[^0-9]/g, "")) || 0;

// Inside the Android app the screens are packaged locally, so money requests
// go to the published server over HTTPS. In the browser they stay same-origin.
const API_BASE = window.Capacitor?.isNativePlatform?.() ? "https://pawchpay-app-pal.lovable.app" : "";

async function api(path, opts = {}) {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw Object.assign(new Error("Please sign in again."), { status: 401 });
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || "Something went wrong. Please try again."), { status: res.status });
  return body;
}

state.hasPin = null;
state.banks = [];
state.beneficiaries = [];
let chosen = null; // { name, accountNumber, bankCode, bankName }
let pendingRef = null; // one reference per reviewed transfer → double taps can't send twice
let sending = false;

async function loadSecureData() {
  api("/api/wallet/pin").then((r) => (state.hasPin = !!r.hasPin)).catch(() => {});
  sb.from("beneficiaries")
    .select("id,name,account_number,bank_code,bank_name")
    .order("created_at", { ascending: false })
    .then(({ data }) => {
      state.beneficiaries = data || [];
      renderBeneficiaries();
    });
  if (!state.banks.length)
    api("/api/wallet/resolve-account")
      .then((r) => {
        state.banks = r.banks || [];
        renderBankOptions();
      })
      .catch(() => {
        const sel = $("newRecipientBank");
        if (sel) sel.innerHTML = '<option value="">Bank list unavailable — try again later</option>';
      });
}

function renderBankOptions() {
  const sel = $("newRecipientBank");
  if (!sel || !state.banks.length) return;
  const q = ($("bankSearch")?.value || "").trim().toLowerCase();
  const keep = sel.value;
  const list = q ? state.banks.filter((b) => b.name.toLowerCase().includes(q)) : state.banks;
  sel.innerHTML =
    `<option value="">${list.length ? (q ? `${list.length} bank${list.length > 1 ? "s" : ""} found — select` : "Select bank") : "No bank matches your search"}</option>` +
    list.map((b) => `<option value="${escapeHtml(b.code)}">${escapeHtml(b.name)}</option>`).join("");
  if (list.some((b) => b.code === keep)) sel.value = keep;
  else if (q && list.length === 1) { sel.value = list[0].code; sel.dispatchEvent(new Event("change")); }
}
$("bankSearch")?.addEventListener("input", renderBankOptions);

function renderBeneficiaries() {
  const panel = $("contactPanel");
  if (!panel) return;
  panel.querySelectorAll(".cp-row").forEach((r) => r.remove());
  const empty = $("cpEmpty");
  if (empty) empty.style.display = state.beneficiaries.length ? "none" : "block";
  state.beneficiaries.forEach((b) => {
    const row = document.createElement("div");
    row.className = "cp-row";
    const sub = `${b.account_number.slice(0, 3)}•••${b.account_number.slice(-4)} · ${b.bank_name}`;
    row.innerHTML = `<div class="circ">${initials(b.name)}</div><div class="body"><b>${escapeHtml(b.name)}</b><span>${escapeHtml(sub)}</span></div>`;
    row.onclick = () => pickRecipient({ name: b.name, accountNumber: b.account_number, bankCode: b.bank_code, bankName: b.bank_name });
    panel.appendChild(row);
  });
}

function pickRecipient(r) {
  chosen = r;
  pendingRef = null;
  const sub = `${r.accountNumber.slice(0, 3)}•••${r.accountNumber.slice(-4)} · ${r.bankName}`;
  window.selectContact(initials(r.name), r.name, sub);
  setText("ticketFee", "Charged by Paystack");
}

const origClear = window.clearRecipient;
window.clearRecipient = function () {
  chosen = null;
  pendingRef = null;
  origClear && origClear();
};

// ----- new recipient: bank + automatic name verification -----
let verifyTimer = null;
function resetVerified() {
  $("newRecipientName").value = "";
  $("saveRecipientBtn").disabled = true;
}
async function verifyRecipientAccount() {
  const acct = $("newRecipientAccount").value.replace(/\D/g, "");
  const code = $("newRecipientBank").value;
  resetVerified();
  if (acct.length !== 10 || !code) {
    toast("Enter a 10-digit account number and choose a bank");
    return;
  }
  const btn = $("verifyAcctBtn");
  btn.disabled = true;
  btn.textContent = "Verifying…";
  try {
    const r = await api("/api/wallet/resolve-account", { method: "POST", body: JSON.stringify({ accountNumber: acct, bankCode: code }) });
    $("newRecipientName").value = r.accountName;
    $("saveRecipientBtn").disabled = false;
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Verify account name";
  }
}
window.verifyRecipientAccount = verifyRecipientAccount;
const autoVerify = () => {
  resetVerified();
  clearTimeout(verifyTimer);
  const acct = $("newRecipientAccount").value.replace(/\D/g, "");
  if (acct.length === 10 && $("newRecipientBank").value) verifyTimer = setTimeout(verifyRecipientAccount, 400);
};
$("newRecipientAccount")?.addEventListener("input", autoVerify);
$("newRecipientBank")?.addEventListener("change", autoVerify);

window.saveNewRecipient = function () {
  const acct = $("newRecipientAccount").value.replace(/\D/g, "");
  const sel = $("newRecipientBank");
  const name = $("newRecipientName").value.trim();
  if (acct.length !== 10 || !sel.value || !name) {
    toast("Verify the account name first");
    return;
  }
  window.closeModal("newRecipientModal");
  pickRecipient({ name, accountNumber: acct, bankCode: sel.value, bankName: sel.options[sel.selectedIndex].text });
  $("newRecipientAccount").value = "";
  sel.value = "";
  if ($("bankSearch")) { $("bankSearch").value = ""; renderBankOptions(); }
  resetVerified();
  toast("Recipient verified — saved after your first transfer");
};

// ----- review + PIN authorization -----
window.openConfirm = function () {
  if (!chosen) return;
  const amount = digits($("sendAmount").value);
  if (amount < 100) return toast("Minimum transfer is ₦100");
  if (state.hasPin === false) {
    toast("Create your transaction PIN first");
    window.__pinReturn = "sendMoney";
    return window.go("changePin");
  }
  if (!pendingRef) pendingRef = crypto.randomUUID();
  setText("confRecipient", chosen.name);
  setText("confAmount", money(amount));
  setText("confBank", `${chosen.bankName} · ${chosen.accountNumber}`);
  setText("pinHelp", "Your PIN is required to approve this payment.");
  $("transferPin").value = "";
  $("authorizeBtn").disabled = true;
  $("confirmModal").classList.add("show");
};

function showPendingIcon() {
  const ic = $("resultIcon");
  ic.className = "result-icon pend";
  ic.innerHTML =
    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>';
}

function resetSendForm() {
  window.clearRecipient();
  $("sendAmount").value = "";
  if ($("sendNote")) $("sendNote").value = "";
  document.querySelectorAll("#sendMoney .chip").forEach((c) => c.classList.remove("active"));
}

async function checkLater(reference, tries = 3) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    try {
      const r = await api(`/api/wallet/transfer?reference=${encodeURIComponent(reference)}`);
      if (r.status !== "pending") {
        await refresh();
        toast(r.status === "success" ? "Transfer confirmed by the bank" : "Transfer failed — money returned to your wallet");
        return;
      }
    } catch {}
  }
}

window.authorizeTransfer = async function () {
  if (sending || !chosen) return;
  const pin = $("transferPin").value;
  if (!/^\d{4}$/.test(pin)) return toast("Enter your 4-digit PIN");
  sending = true;
  $("authorizeBtn").disabled = true;
  $("authorizeBtn").textContent = "Sending…";
  const amount = digits($("sendAmount").value);
  const recipient = chosen;
  try {
    const r = await api("/api/wallet/transfer", {
      method: "POST",
      body: JSON.stringify({
        reference: pendingRef,
        amount,
        accountNumber: recipient.accountNumber,
        bankCode: recipient.bankCode,
        bankName: recipient.bankName,
        pin,
        note: $("sendNote")?.value.trim() || null,
      }),
    });
    const ref = pendingRef;
    pendingRef = null;
    window.closeModal("confirmModal");
    await refresh();
    const to = r.recipientName || recipient.name;
    if (r.status === "success") {
      window.openResult(true, "Transfer successful", `${money(amount)} was delivered to ${to}. Confirmed by the bank.`, () => {
        resetSendForm();
        window.switchTab("dashboard");
      });
    } else if (r.status === "pending") {
      window.openResult(true, "Transfer pending", `${money(amount)} to ${to} is being processed. It is not complete until the bank confirms; if it fails, the money returns to your wallet automatically.`, () => {
        resetSendForm();
        window.switchTab("dashboard");
      });
      showPendingIcon();
      checkLater(ref);
    } else {
      window.openResult(false, `Transfer ${r.status}`, "This transfer did not complete. Any held money has been returned to your wallet.");
    }
  } catch (e) {
    if (e.status === 401 && /PIN/i.test(e.message)) {
      $("transferPin").value = "";
      setText("pinHelp", e.message);
    } else if (e.status === 428) {
      window.closeModal("confirmModal");
      state.hasPin = false;
      window.__pinReturn = "sendMoney";
      toast("Create your transaction PIN first");
      window.go("changePin");
    } else {
      window.closeModal("confirmModal");
      if (e.status !== 423) pendingRef = null; // nothing was sent; a retry gets a new reference
      await refresh();
      window.openResult(false, "Transfer not sent", e.message);
    }
  } finally {
    sending = false;
    $("authorizeBtn").textContent = "Authorize & Send";
  }
};
window.doTransfer = window.authorizeTransfer;

// ----- transaction PIN: create / change (server-checked) -----
let pinFlow = { step: null, current: "", first: "" };
function pinScreen(title, desc) {
  setText("pinStepTitle", title);
  setText("pinStepDesc", desc);
  const boxes = document.querySelectorAll("#changePin .pin-box");
  boxes.forEach((b) => (b.value = ""));
  boxes[0]?.focus();
}
function pinStart() {
  pinFlow = { step: state.hasPin ? "current" : "new", current: "", first: "" };
  if (state.hasPin) pinScreen("Enter current PIN", "Confirm it's you before choosing a new transaction PIN.");
  else pinScreen("Create your transaction PIN", "Choose a 4-digit PIN. You'll use it to authorize every transfer.");
}
const origGo = window.go;
window.go = function (id, push) {
  const r = origGo(id, push);
  if (id === "changePin") pinStart();
  return r;
};
window.pinNext = async function () {
  const val = Array.from(document.querySelectorAll("#changePin .pin-box")).map((b) => b.value).join("");
  if (!/^\d{4}$/.test(val)) return toast("Enter all 4 digits");
  if (pinFlow.step === "current") {
    pinFlow.current = val;
    pinFlow.step = "new";
    return pinScreen("Set new transaction PIN", "Choose a new 4-digit PIN.");
  }
  if (pinFlow.step === "new") {
    pinFlow.first = val;
    pinFlow.step = "confirm";
    return pinScreen("Confirm new PIN", "Enter the same 4-digit PIN again to confirm.");
  }
  if (val !== pinFlow.first) {
    toast("PINs don't match — try again");
    pinFlow.step = "new";
    return pinScreen("Set new transaction PIN", "Choose a 4-digit PIN.");
  }
  try {
    await api("/api/wallet/pin", {
      method: "POST",
      body: JSON.stringify({ pin: val, ...(pinFlow.current ? { currentPin: pinFlow.current } : {}) }),
    });
    const created = !state.hasPin;
    state.hasPin = true;
    const back = window.__pinReturn || "settings";
    window.__pinReturn = null;
    window.openResult(true, created ? "PIN created" : "PIN updated", "Your transaction PIN is now active.", () => origGo(back));
  } catch (e) {
    window.openResult(false, "PIN not changed", e.message);
    pinStart();
  }
};

// ----- not yet available: no money moves -----
window.fundVia = function () {
  window.openResult(false, "Funding coming soon", "Wallet funding is not available yet. No money was charged.");
};
window.buyAirtime = function () {
  window.openResult(false, "Airtime coming soon", "Airtime purchase is not available yet. No money was charged.");
};

// ---------- target savings ----------
state.goals = [];
let activeGoal = null;
let savingBusy = false;
async function loadSavings() {
  try {
    const r = await api("/api/wallet/savings");
    state.goals = r.goals || [];
    await syncGoalCats();
  } catch { return; }
  renderSavings();
}
const GOAL_CATS = { education: ["Education", "🎓"], business: ["Business", "💼"], travel: ["Travel", "✈️"], rent: ["Rent", "🏠"], gadget: ["Gadget", "📱"], emergency: ["Emergency", "🛟"], custom: ["Custom", "⭐"] };
const CAT_KEY = "pawch_goal_cats";
function goalCats() { try { return JSON.parse(localStorage.getItem(CAT_KEY) || "{}"); } catch { return {}; } }
function goalCat(g) { return GOAL_CATS[g?.category] ? g.category : "custom"; }
// One-time backfill: goals saved before categories lived in the database get
// the category this device remembers, but only if the goal is still on the
// default — a category chosen on another device is never overwritten.
async function syncGoalCats() {
  const local = goalCats();
  const pending = state.goals.filter((g) => g.category === "custom" && local[g.id] && local[g.id] !== "custom" && GOAL_CATS[local[g.id]]);
  for (const g of pending) {
    try {
      await api("/api/wallet/savings", { method: "POST", body: JSON.stringify({ action: "setCategory", goalId: g.id, category: local[g.id] }) });
      g.category = local[g.id];
    } catch { /* keep default */ }
  }
}
let newGoalCat = "custom";
function goalPct(g) { return Math.min(100, Math.floor((Number(g.saved_amount) / Number(g.target_amount)) * 100)); }
function fmtDate(d) { return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }); }
function planFor(remaining, date) {
  if (!date || remaining <= 0) return null;
  const days = Math.ceil((new Date(date + "T23:59:59") - Date.now()) / 864e5);
  if (days <= 0) return null;
  const weeks = Math.max(1, Math.ceil(days / 7)), months = Math.max(1, Math.ceil(days / 30.44));
  return { weekly: Math.ceil(remaining / weeks), monthly: Math.ceil(remaining / months), weeks, months };
}
function planHtml(p) {
  return `<div>Suggested: <b>${money(p.weekly)}</b>/week or <b>${money(p.monthly)}</b>/month</div><em>Estimate only — nothing is deducted automatically. You choose when to save.</em>`;
}
function msBar(pct) {
  return `<div class="goal-bar ms-bar" style="overflow:visible"><i style="width:${pct}%"></i>${[25, 50, 75].map((m) => `<span class="ms ${pct >= m ? "on" : ""}" style="left:${m}%"></span>`).join("")}</div>`;
}
function renderSavings() {
  const total = state.goals.reduce((a, g) => a + Number(g.saved_amount), 0);
  const target = state.goals.reduce((a, g) => a + Number(g.target_amount), 0);
  const active = state.goals.filter((g) => goalPct(g) < 100).length;
  const overall = target ? Math.min(100, Math.floor((total / target) * 100)) : 0;
  setText("savingsTotal", money(total));
  setText("savingsCount", state.goals.length ? `${state.goals.length} goal${state.goals.length > 1 ? "s" : ""}` : "No goals yet");
  setText("svActive", String(active));
  setText("svOverallPct", overall + "%");
  setText("svTargetTotal", money(target).replace(/\.00$/, ""));
  if ($("svOverallBar")) $("svOverallBar").style.width = overall + "%";
  setText("savingsSummary", state.goals.length ? `${money(total)} saved across ${state.goals.length} goal${state.goals.length > 1 ? "s" : ""}` : "Set a goal and save towards it");
  const list = $("goalList");
  if (!list) return;
  if (!state.goals.length) {
    list.innerHTML = '<p style="text-align:center;font-size:13px;color:var(--muted);padding:18px 0;">Create your first goal — school fees, rent or a trip.</p>';
    return;
  }
  list.innerHTML = state.goals.map((g) => {
    const pct = goalPct(g), done = pct >= 100, cat = GOAL_CATS[goalCat(g)];
    const due = g.target_date ? `Due ${fmtDate(g.target_date)}` : cat[0];
    return `<div class="goal" role="button" tabindex="0" onclick="openGoalDetail('${g.id}')"><div class="goal-head"><div class="goal-ico">${cat[1]}</div><div class="goal-top"><b>${escapeHtml(g.name)}</b><span>${due}</span></div></div>
      ${msBar(pct)}
      <div class="goal-meta"><span>${money(g.saved_amount)} of ${money(g.target_amount)}</span><span>${done ? "Goal reached 🎉" : pct + "%"}</span></div></div>`;
  }).join("");
}
window.openGoalDetail = function (id) {
  const g = state.goals.find((x) => x.id === id);
  if (!g) return;
  const pct = goalPct(g), done = pct >= 100, cat = GOAL_CATS[goalCat(g)];
  const remaining = Math.max(0, Number(g.target_amount) - Number(g.saved_amount));
  const plan = planFor(remaining, g.target_date);
  setText("gdName", g.name);
  setText("gdDue", (g.target_date ? `Target date ${fmtDate(g.target_date)}` : "No target date") + " · " + cat[0]);
  $("gdBody").innerHTML = `<div class="gd-hero"><div class="goal-ico">${cat[1]}</div><div class="gd-pct">${pct}%</div><span style="font-size:12.5px;color:var(--muted)">${done ? "Goal reached — well done" : "completed"}</span></div>
    ${msBar(pct)}
    <div class="ms-row">${[25, 50, 75, 100].map((m) => `<div class="${pct >= m ? "on" : ""}"><i>${pct >= m ? "✓" : ""}</i>${m}%</div>`).join("")}</div>
    <div class="gd-grid"><div><span>Saved</span><b>${money(g.saved_amount)}</b></div><div><span>Remaining</span><b>${money(remaining)}</b></div><div><span>Target</span><b>${money(g.target_amount)}</b></div><div><span>Started</span><b>${fmtDate(g.created_at)}</b></div></div>
    ${plan ? `<div class="plan-box">${planHtml(plan)}</div>` : ""}
    ${done ? "" : `<button class="btn btn-primary" onclick="closeModal('goalDetailModal');openFundGoal('${g.id}')">Add money</button>`}`;
  $("goalDetailModal").classList.add("show");
};
window.selectGoalCat = function (key) {
  newGoalCat = key;
  document.querySelectorAll("#goalCats .cat-chip").forEach((c) => c.classList.toggle("on", c.dataset.cat === key));
  const n = $("goalName");
  if (key !== "custom" && (!n.value.trim() || Object.values(GOAL_CATS).some((c) => c[0] === n.value.trim()))) n.value = GOAL_CATS[key][0];
};
window.updatePlanPreview = function () {
  const box = $("goalPlan"); if (!box) return;
  const p = planFor(digits($("goalTarget").value), $("goalDate").value);
  box.style.display = p ? "block" : "none";
  if (p) box.innerHTML = planHtml(p);
};
window.openNewGoal = function () {
  $("goalName").value = ""; $("goalTarget").value = ""; $("goalDate").value = "";
  $("goalDate").min = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  $("goalCats").innerHTML = Object.entries(GOAL_CATS).map(([k, [l, e]]) => `<button type="button" class="cat-chip" data-cat="${k}" onclick="selectGoalCat('${k}')">${e} ${l}</button>`).join("");
  window.selectGoalCat("custom");
  window.updatePlanPreview();
  $("newGoalModal").classList.add("show");
};
window.createGoal = async function () {
  if (savingBusy) return;
  const name = $("goalName").value.trim();
  const targetAmount = digits($("goalTarget").value);
  if (name.length < 2) return toast("Give your goal a name");
  if (targetAmount < 1000) return toast("Target must be at least ₦1,000");
  savingBusy = true; $("createGoalBtn").disabled = true;
  try {
    const r = await api("/api/wallet/savings", { method: "POST", body: JSON.stringify({ action: "create", name, targetAmount, targetDate: $("goalDate").value || null, category: newGoalCat }) });
    window.closeModal("newGoalModal");
    await loadSavings();
    toast("Savings goal created");
  } catch (e) { toast(e.message); }
  finally { savingBusy = false; $("createGoalBtn").disabled = false; }
};
window.openFundGoal = function (id) {
  activeGoal = state.goals.find((g) => g.id === id);
  if (!activeGoal) return;
  if (state.hasPin === false) { toast("Create your transaction PIN first"); window.__pinReturn = "savings"; return window.go("changePin"); }
  setText("fundGoalTitle", `Add to ${activeGoal.name}`);
  setText("fundGoalSub", `Wallet balance: ${money(state.wallet?.balance)}`);
  $("fundGoalAmount").value = ""; $("fundGoalPin").value = "";
  $("fundGoalModal").classList.add("show");
};
window.fundGoal = async function () {
  if (savingBusy || !activeGoal) return;
  const amount = digits($("fundGoalAmount").value);
  const pin = $("fundGoalPin").value;
  if (amount < 100) return toast("Minimum is ₦100");
  if (amount > Number(state.wallet?.balance || 0)) return toast("Insufficient wallet balance");
  if (!/^\d{4}$/.test(pin)) return toast("Enter your 4-digit PIN");
  savingBusy = true; $("fundGoalBtn").disabled = true; $("fundGoalBtn").textContent = "Saving…";
  try {
    await api("/api/wallet/savings", { method: "POST", body: JSON.stringify({ action: "fund", goalId: activeGoal.id, amount, pin }) });
    window.closeModal("fundGoalModal");
    await refresh();
    window.openResult(true, "Money saved", `${money(amount)} moved into ${activeGoal.name}.`);
  } catch (e) {
    $("fundGoalPin").value = "";
    toast(e.message);
  } finally { savingBusy = false; $("fundGoalBtn").disabled = false; $("fundGoalBtn").textContent = "Save now"; }
};

// ---------- password show/hide ----------
const EYE = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22"/><path d="M14.12 14.12a3 3 0 11-4.24-4.24"/></svg>';
["loginPass", "suPass"].forEach((id) => {
  const input = $(id);
  if (!input || input.parentElement.classList.contains("pw-wrap")) return;
  const wrap = document.createElement("div");
  wrap.className = "pw-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "pw-eye"; btn.setAttribute("aria-label", "Show password"); btn.innerHTML = EYE;
  btn.onclick = () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.innerHTML = show ? EYE_OFF : EYE;
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  };
  wrap.appendChild(btn);
});

// ---------- boot ----------
// Installed app: the phone already shows a launch screen, so skip the in-app splash.
const installed = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true ||
  (() => { try { return window.parent !== window && window.parent.matchMedia("(display-mode: standalone)").matches; } catch { return false; } })();
(async () => {
  if (installed && $("splash")?.classList.contains("active")) window.go("login", false);
  const signedIn = await refresh();
  if (signedIn) {
    if (installed) window.switchTab("dashboard");
    const splash = document.getElementById("splash");
    if (splash) splash.setAttribute("onclick", "switchTab('dashboard')");
  }
})();
