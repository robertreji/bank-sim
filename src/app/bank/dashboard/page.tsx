"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function BankDashboard() {
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("1000");

  const [loggedInAccount, setLoggedInAccount] = useState<any>(null);
  const [showRegister, setShowRegister] = useState(false);

  const [bankBalance, setBankBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);

  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("stellarpay_bank_account");
    if (stored) {
      const acc = JSON.parse(stored);
      setLoggedInAccount(acc);
      fetchBalanceAndTransactions(acc.accountId);
    }
  }, []);

  const fetchBalanceAndTransactions = async (accId: string) => {
    try {
      const res = await fetch(`/api/bank/balance?accountId=${encodeURIComponent(accId)}`);
      const data = await res.json();
      if (data.success) {
        setBankBalance(data.balance);
        setTransactions(data.transactions || []);
      }
    } catch (e) {
      console.error("Failed to fetch balance:", e);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/bank/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          password,
          name,
          initialBalance,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      // Auto login
      const loginRes = await fetch("/api/bank/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) throw new Error(loginData.error || "Login failed");

      localStorage.setItem("stellarpay_bank_account", JSON.stringify(loginData.account));
      setLoggedInAccount(loginData.account);
      setBankBalance(loginData.account.balance);
      fetchBalanceAndTransactions(loginData.account.accountId);
      setStatus("idle");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to register account");
      setStatus("error");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/bank/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid credentials");

      localStorage.setItem("stellarpay_bank_account", JSON.stringify(data.account));
      setLoggedInAccount(data.account);
      setBankBalance(data.account.balance);
      fetchBalanceAndTransactions(data.account.accountId);
      setStatus("idle");
    } catch (err: any) {
      setErrorMsg(err.message || "Login failed");
      setStatus("error");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("stellarpay_bank_account");
    setLoggedInAccount(null);
    setBankBalance(0);
    setTransactions([]);
  };

  return (
    <div className="app-layout">
      {/* Sidebar - simulated inline since we have layout */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">🏦</div>
          <span className="brand-name">StellarBank</span>
        </div>
        <nav className="sidebar-nav">
          <Link href="/" className="nav-item">
            <span className="nav-icon">💳</span>
            Stellar Wallet
          </Link>
          <Link href="/bank/dashboard" className="nav-item active">
            <span className="nav-icon">🏦</span>
            Bank Dashboard
          </Link>
        </nav>
      </aside>

      <main className="main-content">
        <div className="page-header">
          <div className="page-header-title">
            <h1>Bank Portal Dashboard</h1>
            <div className="header-badge" style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e" }}>
              Simulated
            </div>
          </div>
        </div>

        {!loggedInAccount ? (
          <div className="bank-interactive-card" style={{ maxWidth: "500px", margin: "40px auto 0" }}>
            <div className="bank-header">
              <h2>Access Bank Server</h2>
              <p>Register or log in to manage your mock bank funds.</p>
            </div>

            {errorMsg && <div className="form-error" style={{ marginBottom: "16px" }}>{errorMsg}</div>}

            {showRegister ? (
              <form onSubmit={handleRegister} className="bank-form">
                <div className="form-group">
                  <label>Account ID / Username</label>
                  <input
                    type="text"
                    placeholder="e.g. MYBANK-77"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    placeholder="Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Initial USD Balance</label>
                  <input
                    type="number"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-full">
                  Create Bank Account
                </button>
                <p className="toggle-auth-text">
                  Have an account?{" "}
                  <button type="button" onClick={() => setShowRegister(false)}>Login</button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="bank-form">
                <div className="form-group">
                  <label>Account ID</label>
                  <input
                    type="text"
                    placeholder="USER-12345"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-full">
                  Access Portal
                </button>
                <p className="toggle-auth-text">
                  Need an account?{" "}
                  <button type="button" onClick={() => setShowRegister(true)}>Register</button>
                </p>
              </form>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className="balance-card" style={{ background: "linear-gradient(135deg, #1e3a8a, #3b82f6)" }}>
              <div className="balance-info">
                <div className="balance-label">Simulated Bank Balance</div>
                <div className="balance-amount">${bankBalance.toFixed(2)} USD</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginTop: "20px", fontSize: "14px", color: "rgba(255,255,255,0.7)" }}>
                <div><strong>Account ID:</strong> {loggedInAccount.accountId}</div>
                <div><strong>Holder Name:</strong> {loggedInAccount.name}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                <button onClick={handleLogout} className="btn" style={{ background: "rgba(255,255,255,0.15)", padding: "4px 10px", fontSize: "12px", border: "none" }}>
                  Logout Bank Account
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Bank Transaction History</h2>
              </div>
              <div className="card-body">
                {transactions.length === 0 ? (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "#64748b" }}>
                    No bank transactions recorded yet.
                  </div>
                ) : (
                  <div className="tx-list" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {transactions.map((tx) => {
                      const isOutflow = tx.type.includes("DEBIT");
                      return (
                        <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                          <div>
                            <div style={{ fontWeight: "600", fontSize: "14px" }}>{tx.type}</div>
                            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{tx.timestamp}</div>
                          </div>
                          <div style={{ fontWeight: "700", color: isOutflow ? "#ef4444" : "#22c55e" }}>
                            {isOutflow ? "-" : "+"}${parseFloat(tx.amount).toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
