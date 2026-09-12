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
          <div class="status-tag ${t.status}">${t.status[0].toUpperCase() + t.status.slice(1)}</div>
        </div>
      </div>`;
    })
    .join("");
}
const escapeHtml = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

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
  window.openResult(true, "Verification successful", "Welcome to PawchPay — your dashboard is ready.", () =>
    window.switchTab("dashboard"),
  );
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

// ---------- money movements ----------
const digits = (v) => Number(String(v || "").replace(/[^0-9]/g, "")) || 0;

async function debit(amount, kind, title, category, note) {
  const { data, error } = await sb.rpc("wallet_debit", {
    p_amount: amount,
    p_kind: kind,
    p_title: title,
    p_category: category,
    p_note: note || null,
  });
  await refresh();
  if (error) throw new Error(error.message.includes("Insufficient") ? "Insufficient balance" : error.message);
  return data;
}
async function credit(amount, kind, title, category, note) {
  const { data, error } = await sb.rpc("wallet_credit", {
    p_amount: amount,
    p_kind: kind,
    p_title: title,
    p_category: category,
    p_note: note || null,
  });
  await refresh();
  if (error) throw new Error(error.message);
  return data;
}

window.doTransfer = async function () {
  window.closeModal("confirmModal");
  const amount = digits($("sendAmount").value);
  const recipient = $("ticketName").textContent;
  if (!amount) return;
  try {
    const bal = await debit(amount, "transfer", recipient, "Transfer", $("sendNote")?.value || null);
    window.openResult(
      true,
      "Transfer successful",
      `${money(amount)} was sent to ${recipient}. New balance: ${money(bal)}.`,
      () => {
        window.switchTab("dashboard");
        window.clearRecipient();
        $("sendAmount").value = "";
        document.querySelectorAll("#sendMoney .chip").forEach((c) => c.classList.remove("active"));
      },
    );
  } catch (e) {
    window.openResult(false, "Transfer failed", e.message);
  }
};

window.fundVia = async function (method) {
  const amount = digits($("fundAmount").value);
  if (!amount) {
    toast("Enter an amount to add");
    return;
  }
  try {
    const bal = await credit(amount, "funding", `Wallet top-up · ${method}`, "Money in", method);
    $("fundAmount").value = "";
    window.openResult(true, "Wallet funded", `${money(amount)} added via ${method}. New balance: ${money(bal)}.`, () =>
      window.switchTab("dashboard"),
    );
  } catch (e) {
    window.openResult(false, "Funding failed", e.message);
  }
};

window.buyAirtime = async function () {
  const network = document.querySelector("#airtime .pill-row .pill.active")?.textContent || "MTN";
  const other = digits($("otherAmtInput").value);
  const amount = other || window.__airtimeAmt || 1000;
  const phone = $("airtimePhone").value.trim() || state.profile?.phone || "";
  try {
    const bal = await debit(amount, "airtime", `${network} Airtime`, "Airtime", phone);
    window.openResult(
      true,
      "Airtime purchased",
      `${money(amount)} ${network} airtime sent to ${phone || "your line"}. New balance: ${money(bal)}.`,
      () => window.switchTab("dashboard"),
    );
  } catch (e) {
    window.openResult(false, "Purchase failed", e.message);
  }
};

// ---------- boot ----------
(async () => {
  const signedIn = await refresh();
  if (signedIn) {
    const splash = document.getElementById("splash");
    if (splash) splash.setAttribute("onclick", "switchTab('dashboard')");
  }
})();
