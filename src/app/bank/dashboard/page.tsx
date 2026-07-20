"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function BankDashboard() {
  const router = useRouter();
  const [loggedInAccount, setLoggedInAccount] = useState<any>(null);
  const [bankBalance, setBankBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("stellarpay_bank_account");
    if (stored) {
      const acc = JSON.parse(stored);
      setLoggedInAccount(acc);
      fetchBalanceAndTransactions(acc.accountId);
    } else {
      router.push("/bank/login?redirectTo=/bank/dashboard");
    }
  }, [router]);

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

  const handleLogout = () => {
    localStorage.removeItem("stellarpay_bank_account");
    setLoggedInAccount(null);
    setBankBalance(0);
    setTransactions([]);
  };

  if (!loggedInAccount) {
    return (
      <div className="app-layout" style={{ justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", padding: "40px" }}>
          <div className="progress-spinner large-spinner" style={{ margin: "0 auto" }} />
          <h3 style={{ marginTop: "16px", color: "var(--text-secondary)" }}>Redirecting to Bank Login...</h3>
        </div>
      </div>
    );
  }

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
      </main>
    </div>
  );
}
