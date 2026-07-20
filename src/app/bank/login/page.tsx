"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function BankLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("1000");

  const [showRegister, setShowRegister] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // If already logged in, redirect away immediately
  useEffect(() => {
    const stored = localStorage.getItem("stellarpay_bank_account");
    if (stored) {
      const redirectTo = searchParams.get("redirectTo") || "/bank/dashboard";
      const params = new URLSearchParams(searchParams.toString());
      params.delete("redirectTo");
      const dest = params.toString() ? `${redirectTo}?${params.toString()}` : redirectTo;
      router.push(dest);
    }
  }, [router, searchParams]);

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
      
      const redirectTo = searchParams.get("redirectTo") || "/bank/dashboard";
      const params = new URLSearchParams(searchParams.toString());
      params.delete("redirectTo");
      const dest = params.toString() ? `${redirectTo}?${params.toString()}` : redirectTo;
      
      router.push(dest);
    } catch (err: any) {
      setErrorMsg(err.message || "Login failed");
      setStatus("error");
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
      
      const redirectTo = searchParams.get("redirectTo") || "/bank/dashboard";
      const params = new URLSearchParams(searchParams.toString());
      params.delete("redirectTo");
      const dest = params.toString() ? `${redirectTo}?${params.toString()}` : redirectTo;

      router.push(dest);
    } catch (err: any) {
      setErrorMsg(err.message || "Registration failed");
      setStatus("error");
    }
  };

  return (
    <div className="mobile-app-container" style={{ justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "20px" }}>
      <div className="mobile-card" style={{ width: "100%", maxWidth: "440px", margin: "0 auto", padding: "32px 24px" }}>
        <div className="bank-header" style={{ marginBottom: "28px", textAlign: "center" }}>
          <div className="bank-logo-icon" style={{ margin: "0 auto 12px", width: "64px", height: "64px", borderRadius: "50%", background: "var(--gradient-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", color: "white" }}>🏦</div>
          <h2 style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-primary)" }}>StellarBank</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            {showRegister ? "Register a new simulated bank account" : "Log in to manage your mock bank funds"}
          </p>
        </div>

        {errorMsg && (
          <div className="form-error" style={{ marginBottom: "20px", padding: "12px", background: "rgba(217, 83, 79, 0.1)", border: "1px solid rgba(217, 83, 79, 0.2)", borderRadius: "8px", color: "var(--error)", fontSize: "14px" }}>
            {errorMsg}
          </div>
        )}

        {showRegister ? (
          <form onSubmit={handleRegister} className="bank-form" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>Account ID / Username</label>
              <input
                type="text"
                placeholder="e.g. USER-12345"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
                className="form-input"
                style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: "15px", outline: "none" }}
              />
            </div>
            <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-input"
                style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: "15px", outline: "none" }}
              />
            </div>
            <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>Full Name</label>
              <input
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="form-input"
                style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: "15px", outline: "none" }}
              />
            </div>
            <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>Starting Balance (USD)</label>
              <input
                type="number"
                placeholder="1000"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                required
                className="form-input"
                style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: "15px", outline: "none" }}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={status === "loading"} style={{ padding: "14px", borderRadius: "10px", width: "100%", fontWeight: "600", fontSize: "15px", cursor: "pointer", transition: "all 0.2s", marginTop: "8px" }}>
              {status === "loading" ? "Registering..." : "Create Bank Account"}
            </button>
            <p className="toggle-auth-text" style={{ textAlign: "center", fontSize: "14px", color: "var(--text-secondary)", marginTop: "12px" }}>
              Already have an account?{" "}
              <button type="button" onClick={() => setShowRegister(false)} style={{ background: "none", border: "none", color: "var(--text-primary)", fontWeight: "700", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                Login here
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="bank-form" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>Account ID</label>
              <input
                type="text"
                placeholder="USER-12345"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
                className="form-input"
                style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: "15px", outline: "none" }}
              />
            </div>
            <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-input"
                style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: "15px", outline: "none" }}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={status === "loading"} style={{ padding: "14px", borderRadius: "10px", width: "100%", fontWeight: "600", fontSize: "15px", cursor: "pointer", transition: "all 0.2s", marginTop: "8px" }}>
              {status === "loading" ? "Logging in..." : "Login & Access Portal"}
            </button>
            <p className="toggle-auth-text" style={{ textAlign: "center", fontSize: "14px", color: "var(--text-secondary)", marginTop: "12px" }}>
              Need an account?{" "}
              <button type="button" onClick={() => setShowRegister(true)} style={{ background: "none", border: "none", color: "var(--text-primary)", fontWeight: "700", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                Create one now
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function BankLogin() {
  return (
    <Suspense fallback={
      <div className="mobile-app-container" style={{ justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div className="mobile-card" style={{ width: "80%", maxWidth: "440px", padding: "32px", textAlign: "center" }}>
          <div className="progress-spinner large-spinner" style={{ margin: "0 auto" }} />
          <h3 className="loading-status" style={{ marginTop: "16px" }}>Loading Bank Portal...</h3>
        </div>
      </div>
    }>
      <BankLoginContent />
    </Suspense>
  );
}
