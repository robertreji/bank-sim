const state = {
  account: null,
  authMode: "register",
  refreshTimer: null,
};

const elements = {
  authView: document.getElementById("auth-view"),
  dashboardView: document.getElementById("dashboard-view"),
  authMessage: document.getElementById("auth-message"),
  toast: document.getElementById("app-toast"),
  serverStatus: document.getElementById("server-status"),
  accountName: document.getElementById("account-name"),
  accountMeta: document.getElementById("account-meta"),
  accountIdDisplay: document.getElementById("account-id-display"),
  accountOwnerDisplay: document.getElementById("account-owner-display"),
  balanceAmount: document.getElementById("balance-amount"),
  currencyBadge: document.getElementById("currency-badge"),
  balanceStatus: document.getElementById("balance-status"),
  lastRefresh: document.getElementById("last-refresh"),
  transactionCount: document.getElementById("transaction-count"),
  webhookCount: document.getElementById("webhook-count"),
  transactionsList: document.getElementById("transactions-list"),
  webhooksList: document.getElementById("webhooks-list"),
  registerForm: document.getElementById("register-form"),
  loginForm: document.getElementById("login-form"),
  seedForm: document.getElementById("seed-form"),
  transferForm: document.getElementById("transfer-form"),
  refreshButton: document.getElementById("refresh-button"),
  logoutButton: document.getElementById("logout-button"),
  quickAnchorLogin: document.getElementById("quick-anchor-login"),
  copyUrlButton: document.getElementById("copy-url-button"),
  refreshQrButton: document.getElementById("refresh-qr-button"),
  dashboardQr: document.getElementById("dashboard-qr"),
  mobileUrl: document.getElementById("mobile-url"),
};

function storageKey() {
  return "apex-bank-session";
}

function setVisible(view, visible) {
  view.classList.toggle("hidden", !visible);
}

function setMessage(text, tone = "muted") {
  if (!elements.authMessage) return;
  elements.authMessage.textContent = text || "";
  elements.authMessage.style.color = tone === "error" ? "var(--danger)" : tone === "success" ? "var(--success)" : "var(--muted)";
}

function showToast(text, tone = "info") {
  if (!elements.toast) return;
  elements.toast.textContent = text;
  elements.toast.style.borderColor = tone === "error" ? "rgba(255, 122, 156, 0.45)" : "rgba(141, 107, 255, 0.35)";
  elements.toast.style.color = tone === "error" ? "var(--danger)" : "var(--text)";
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.add("hidden"), 2800);
}

function formatMoney(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatTime(value) {
  if (!value) return "just now";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getSession() {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(account) {
  localStorage.setItem(storageKey(), JSON.stringify(account));
}

function clearSession() {
  localStorage.removeItem(storageKey());
}

function setLoading(button, loading, label) {
  if (!button) return;
  button.disabled = loading;
  if (label) button.textContent = loading ? label : button.dataset.label || button.textContent;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = payload && typeof payload === "object" && payload.error ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

function showDashboard(account) {
  state.account = account;
  saveSession(account);
  setVisible(elements.authView, false);
  setVisible(elements.dashboardView, true);
  setMessage("");
  elements.accountName.textContent = account.name || account.id;
  elements.accountMeta.textContent = `${account.id} • ${account.owner_type === "anchor" ? "Anchor account" : "User account"}`;
  elements.accountIdDisplay.textContent = account.id;
  elements.accountOwnerDisplay.textContent = account.password ? "Password protected" : "Passwordless access";
  elements.currencyBadge.textContent = account.currency || "USD";
  elements.balanceStatus.textContent = "Synchronizing";
  updateMobileAccess();
  startPolling();
  refreshDashboard(true);
}

function stopPolling() {
  if (state.refreshTimer) {
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}

function startPolling() {
  stopPolling();
  state.refreshTimer = window.setInterval(() => {
    if (state.account) {
      refreshDashboard(false).catch(() => {});
    }
  }, 4000);
}

function renderEmpty(container, title, subtitle) {
  container.innerHTML = `
    <article class="activity-item">
      <div>
        <strong class="activity-title">${title}</strong>
        <p class="activity-subtitle">${subtitle}</p>
      </div>
    </article>
  `;
}

function getDashboardUrl() {
  return window.location.href;
}

function updateMobileAccess() {
  if (!elements.dashboardQr || !elements.mobileUrl) return;
  const dashboardUrl = getDashboardUrl();
  elements.mobileUrl.textContent = dashboardUrl;
  elements.dashboardQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=14&data=${encodeURIComponent(dashboardUrl)}`;
}

function renderTransactions(transactions, currency) {
  if (!transactions.length) {
    renderEmpty(elements.transactionsList, "No transactions yet", "Transfers, seeds, and credits will show here.");
    elements.transactionCount.textContent = "0 items";
    return;
  }

  elements.transactionsList.innerHTML = "";
  elements.transactionCount.textContent = `${transactions.length} item${transactions.length === 1 ? "" : "s"}`;

  transactions.forEach((transaction) => {
    const item = document.getElementById("transaction-template").content.cloneNode(true);
    const title = item.querySelector(".activity-title");
    const subtitle = item.querySelector(".activity-subtitle");
    const meta = item.querySelector(".activity-meta");
    const positive = String(transaction.type || "").startsWith("CREDIT");

    title.textContent = transaction.type === "DEBIT" ? "Debit" : transaction.type?.startsWith("DEBIT") ? "Outgoing transfer" : transaction.type?.startsWith("CREDIT") ? "Incoming transfer" : transaction.type || "Transaction";
    subtitle.textContent = `${transaction.reference_id || "No reference"} • ${formatTime(transaction.timestamp)}`;
    meta.innerHTML = `
      <strong class="${positive ? "activity-positive" : "activity-negative"}">${positive ? "+" : "-"}${formatMoney(transaction.amount, currency)}</strong>
      <div>${transaction.status || "completed"}</div>
    `;
    elements.transactionsList.appendChild(item);
  });
}

function renderWebhooks(webhooks) {
  if (!webhooks.length) {
    renderEmpty(elements.webhooksList, "No webhooks yet", "Transfers into anchor accounts with a reference ID appear here.");
    elements.webhookCount.textContent = "0 items";
    return;
  }

  elements.webhooksList.innerHTML = "";
  elements.webhookCount.textContent = `${webhooks.length} item${webhooks.length === 1 ? "" : "s"}`;

  webhooks.forEach((webhook) => {
    const item = document.getElementById("webhook-template").content.cloneNode(true);
    const title = item.querySelector(".activity-title");
    const subtitle = item.querySelector(".activity-subtitle");
    const meta = item.querySelector(".activity-meta");

    title.textContent = webhook.reference_id || webhook.transfer_id || webhook.id;
    subtitle.textContent = `${webhook.url || "Webhook"} • ${formatTime(webhook.created_at)}`;
    meta.innerHTML = `
      <strong class="${webhook.status === "delivered" ? "activity-positive" : webhook.status === "failed" ? "activity-negative" : "activity-pending"}">${webhook.status}</strong>
      <div>${webhook.attempts || 0} attempt${Number(webhook.attempts) === 1 ? "" : "s"}</div>
    `;
    elements.webhooksList.appendChild(item);
  });
}

async function refreshDashboard(silent = false) {
  if (!state.account) return;

  const accountId = state.account.id;
  const [balancePayload, webhookPayload] = await Promise.all([
    fetchJson(`/accounts/${encodeURIComponent(accountId)}/balance`),
    fetchJson(`/webhooks?limit=25`),
  ]);

  const account = { ...state.account };
  account.balance = balancePayload.balance;
  account.name = balancePayload.name || account.name;
  account.currency = balancePayload.currency || account.currency || "USD";
  account.owner_type = balancePayload.owner_type || account.owner_type;
  state.account = account;
  saveSession(account);

  elements.accountName.textContent = account.name || account.id;
  elements.accountMeta.textContent = `${account.id} • ${account.owner_type === "anchor" ? "Anchor account" : "User account"}`;
  elements.balanceAmount.textContent = formatMoney(balancePayload.balance, account.currency);
  elements.currencyBadge.textContent = account.currency;
  elements.balanceStatus.textContent = silent ? "Synchronized" : "Updated";
  elements.lastRefresh.textContent = formatTime(new Date().toISOString());

  const transactions = Array.isArray(balancePayload.transactions) ? balancePayload.transactions : [];
  renderTransactions(transactions, account.currency);

  const webhooks = Array.isArray(webhookPayload.webhooks) ? webhookPayload.webhooks : [];
  renderWebhooks(webhooks);
}

function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  elements.registerForm.classList.toggle("hidden", mode !== "register");
  elements.loginForm.classList.toggle("hidden", mode !== "login");
  setMessage(mode === "register" ? "Create an account to begin." : "Use any existing account to continue.");
}

async function handleRegister(event) {
  event.preventDefault();
  const button = elements.registerForm.querySelector("button[type='submit']");
  setLoading(button, true, "Creating...");
  setMessage("");

  try {
    const payload = {
      owner_type: "user",
      owner_ref: document.getElementById("register-account-id").value.trim(),
      currency: document.getElementById("register-currency").value,
      password: document.getElementById("register-password").value || undefined,
      name: document.getElementById("register-name").value.trim(),
      initial_balance: document.getElementById("register-initial-balance").value,
    };

    const response = await fetchJson("/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    showToast(`Account ${response.account.id} created.`, "success");
    setMessage("Account created. Opening dashboard...", "success");
    showDashboard(response.account);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(button, false);
    button.textContent = "Create account";
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const button = elements.loginForm.querySelector("button[type='submit']");
  setLoading(button, true, "Opening...");
  setMessage("");

  try {
    const payload = {
      accountId: document.getElementById("login-account-id").value.trim(),
      password: document.getElementById("login-password").value,
    };

    const response = await fetchJson("/accounts/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    showToast(`Logged into ${response.account.id}.`, "success");
    showDashboard(response.account);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(button, false);
    button.textContent = "Open dashboard";
  }
}

async function handleSeed(event) {
  event.preventDefault();
  if (!state.account) return;

  const button = elements.seedForm.querySelector("button[type='submit']");
  setLoading(button, true, "Seeding...");

  try {
    const amount = document.getElementById("seed-amount").value || 1000;
    const response = await fetchJson(`/accounts/${encodeURIComponent(state.account.id)}/seed`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    });

    showToast(`Seeded ${formatMoney(amount, state.account.currency)}.`, "success");
    elements.balanceAmount.textContent = formatMoney(response.balance, state.account.currency);
    await refreshDashboard(true);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(button, false);
    button.textContent = "Seed account";
  }
}

async function handleTransfer(event) {
  event.preventDefault();
  if (!state.account) return;

  const button = elements.transferForm.querySelector("button[type='submit']");
  setLoading(button, true, "Sending...");

  try {
    const amount = document.getElementById("transfer-amount").value;
    const toAccount = document.getElementById("transfer-to").value.trim();
    const referenceId = document.getElementById("transfer-reference").value.trim();
    const idempotencyKey = `apex-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

    await fetchJson("/transfers", {
      method: "POST",
      body: JSON.stringify({
        from_account: state.account.id,
        to_account: toAccount,
        amount,
        currency: state.account.currency || "USD",
        reference_id: referenceId || undefined,
        idempotency_key: idempotencyKey,
      }),
    });

    showToast(`Transfer sent to ${toAccount}.`, "success");
    elements.transferForm.reset();
    document.getElementById("transfer-to").value = toAccount;
    await refreshDashboard(true);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(button, false);
    button.textContent = "Send transfer";
  }
}

function handleLogout() {
  stopPolling();
  clearSession();
  state.account = null;
  setVisible(elements.dashboardView, false);
  setVisible(elements.authView, true);
  setAuthMode("register");
  setMessage("Signed out.");
}

async function copyDashboardUrl() {
  const dashboardUrl = getDashboardUrl();
  try {
    await navigator.clipboard.writeText(dashboardUrl);
    showToast("Dashboard link copied.", "success");
  } catch {
    showToast(dashboardUrl, "info");
  }
}

async function quickAnchorLogin() {
  document.getElementById("login-account-id").value = "ACC_ANCHOR";
  document.getElementById("login-password").value = "";
  setAuthMode("login");
  try {
    const response = await fetchJson("/accounts/login", {
      method: "POST",
      body: JSON.stringify({ accountId: "ACC_ANCHOR", password: "" }),
    });
    showDashboard(response.account);
    showToast("Anchor dashboard opened.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function wireTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.mode));
  });
}

function boot() {
  wireTabs();
  elements.registerForm.addEventListener("submit", handleRegister);
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.seedForm.addEventListener("submit", handleSeed);
  elements.transferForm.addEventListener("submit", handleTransfer);
  elements.refreshButton.addEventListener("click", () => refreshDashboard(false).then(() => showToast("Dashboard refreshed.", "success")).catch((error) => showToast(error.message, "error")));
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.quickAnchorLogin.addEventListener("click", quickAnchorLogin);
  elements.copyUrlButton.addEventListener("click", copyDashboardUrl);
  elements.refreshQrButton.addEventListener("click", updateMobileAccess);

  const session = getSession();
  if (session?.id) {
    state.account = session;
    showDashboard(session);
  } else {
    setAuthMode("register");
    setVisible(elements.authView, true);
    setVisible(elements.dashboardView, false);
  }

  fetch("/webhooks?limit=1").then(() => {
    elements.serverStatus.textContent = "Server ready";
  }).catch(() => {
    elements.serverStatus.textContent = "Server unavailable";
  });
}

boot();