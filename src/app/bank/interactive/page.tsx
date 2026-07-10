"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function InteractivePortalContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [transactionId, setTransactionId] = useState("");
  const [kind, setKind] = useState("deposit");
  const [amount, setAmount] = useState("10.00");

  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("1000");

  const [loggedInAccount, setLoggedInAccount] = useState<any>(null);
  const [showRegister, setShowRegister] = useState(false);

  const [bankBalance, setBankBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"action" | "history">("action");
  
  const [isScanning, setIsScanning] = useState(false);

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "ready">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [localIp, setLocalIp] = useState("localhost");

  // Load config (including localIp)
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.localIp) {
          setLocalIp(data.localIp);
        }
      })
      .catch((e) => console.warn("Failed to fetch local IP:", e));
  }, []);

  // Load account from localStorage if exists
  useEffect(() => {
    const stored = localStorage.getItem("stellarpay_bank_account");
    if (stored) {
      const acc = JSON.parse(stored);
      setLoggedInAccount(acc);
      fetchBalance(acc.accountId);
    }
  }, []);

  const processScannedTransaction = async (txIdOrToken: string) => {
    if (!loggedInAccount) {
      setErrorMsg("Please log in first to scan a transaction.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      let txId = txIdOrToken;
      if (txIdOrToken.includes(".")) {
        try {
          const payloadBase64 = txIdOrToken.split(".")[1];
          const payloadJson = JSON.parse(window.atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")));
          txId = payloadJson.jti || payloadJson.sub || txIdOrToken;
        } catch (e) {
          console.warn("JWT parse failed, using raw string as txId");
        }
      }
      
      // Token is no longer required by the bank-sim APIs, only the txId is needed!
      const res = await fetch(`/api/bank/transaction?id=${encodeURIComponent(txId)}`);
      if (!res.ok) throw new Error("Failed to load details from anchor");
      const data = await res.json();
      const tx = data.transaction || data;
      const txKind = tx.kind || "deposit";
      let parsedAmount = "0";
      if (tx.amount_expected?.amount) {
        parsedAmount = parseFloat(tx.amount_expected.amount).toFixed(2);
      } else if (tx.amount_in?.amount) {
        parsedAmount = parseFloat(tx.amount_in.amount).toFixed(2);
      }
      
      // Since we removed the manual input UI for auto-approval, provide a default of $10.00
      const finalAmount = parsedAmount !== "0" ? parsedAmount : "10.00";

      setTransactionId(txId);
      setAmount(finalAmount);
      setKind(txKind);
      setStatus("ready");
      
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to process transaction");
      setStatus("error");
    }
  };

  // Initialize QR Scanner when isScanning is true
  useEffect(() => {
    if (isScanning) {
      import("html5-qrcode").then(({ Html5QrcodeScanner }) => {
        const scanner = new Html5QrcodeScanner("qr-reader", { 
          fps: 15, 
          qrbox: { width: 300, height: 300 },
          aspectRatio: 1.0 
        }, false);
        
        scanner.render(
          (decodedText) => {
            console.log(`Scan success: ${decodedText}`);
            scanner.clear();
            setIsScanning(false);
            try {
              const cleanedText = decodedText.trim();
              const url = new URL(cleanedText);
              const scannedToken = url.searchParams.get("token");
              const scannedId = url.searchParams.get("id");
              
              if (scannedId) {
                processScannedTransaction(scannedId);
              } else if (scannedToken) {
                processScannedTransaction(scannedToken);
              } else {
                setErrorMsg("Scanned QR code does not contain a valid transaction token. Scanned: " + cleanedText.substring(0, 30) + "...");
              }
            } catch (e) {
              console.log("QR decode error:", e, "Text:", decodedText);
              setErrorMsg(`Invalid QR code format: "${decodedText.substring(0, 40)}..."`);
            }
          },
          (error) => {
            // ignore stream errors during scanning
          }
        );

        return () => {
          scanner.clear().catch(e => console.error("Failed to clear scanner", e));
        };
      });
    }
  }, [isScanning]);

  const fetchBalance = async (accId: string) => {
    try {
      const res = await fetch(`/api/bank/balance?accountId=${encodeURIComponent(accId)}`);
      const data = await res.json();
      if (data.success) {
        setBankBalance(data.balance);
        if (data.transactions) setTransactions(data.transactions);
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
  };

  const handleAction = async () => {
    if (!loggedInAccount) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const settleRes = await fetch("/api/bank/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: transactionId,
          token: "dummy-token-not-needed",
          accountId: loggedInAccount.accountId,
          amount: amount,
          kind: kind,
        }),
      });
      const settleData = await settleRes.json();
      if (!settleRes.ok) throw new Error(settleData.error || "Settlement failed");

      if (kind === "deposit") {
        setSuccessMsg(`Successfully transferred $${amount} USD from your bank account to the Anchor. USDC payout initiated on Stellar Testnet!`);
      } else {
        setSuccessMsg(`Withdrawal authorized! Switch back to your wallet app tab to sign and submit the on-chain USDC payment.`);
      }
      fetchBalance(loggedInAccount.accountId);
      setStatus("success");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to process transaction");
      setStatus("ready");
    }
  };

  if (!loggedInAccount) {
    return (
      <div className="mobile-app-container" style={{ justifyContent: "center" }}>
        <div className="mobile-card">
          <div className="bank-header" style={{ marginBottom: "24px" }}>
            <div className="bank-logo-icon">🏦</div>
            <h2>Simulated Bank Portal</h2>
            {token ? (
              <p>Access your bank account to authorize the {kind} request.</p>
            ) : (
              <p>Access your dashboard or scan a transaction QR code.</p>
            )}
          </div>

          {!token && (
            <div style={{ marginBottom: "24px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "24px" }}>
              {isScanning ? (
                <div style={{ background: "white", padding: "16px", borderRadius: "16px", color: "black" }}>
                  <div id="qr-reader" style={{ width: "100%" }}></div>
                  <button 
                    onClick={() => setIsScanning(false)}
                    style={{ marginTop: "16px", padding: "8px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: "8px", width: "100%" }}
                  >
                    Cancel Scan
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsScanning(true)}
                  className="btn btn-primary btn-full"
                  style={{ padding: "16px", fontSize: "16px", borderRadius: "12px", background: "linear-gradient(135deg, #a855f7, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  <span style={{ fontSize: "20px" }}>📷</span> Scan Transaction QR
                </button>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="form-error" style={{ marginBottom: "16px" }}>
              {errorMsg}
            </div>
          )}

          {showRegister ? (
            <form onSubmit={handleRegister} className="bank-form">
              <div className="form-group">
                <label>Account ID / Username</label>
                <input
                  type="text"
                  placeholder="e.g. USER-12345"
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
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Starting Balance (USD)</label>
                <input
                  type="number"
                  placeholder="1000"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={status === "loading"}>
                {status === "loading" ? "Registering..." : "Create Bank Account"}
              </button>
              <p className="toggle-auth-text">
                Already have an account?{" "}
                <button type="button" onClick={() => setShowRegister(false)}>
                  Login here
                </button>
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
              <button type="submit" className="btn btn-primary btn-full" disabled={status === "loading"}>
                {status === "loading" ? "Logging in..." : "Login & Access Portal"}
              </button>
              <p className="toggle-auth-text">
                Need an account?{" "}
                <button type="button" onClick={() => setShowRegister(true)}>
                  Create one now
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    );
  }

  const handleGoHome = () => {
    setStatus("idle");
    setTransactionId("");
    setSuccessMsg("");
    setErrorMsg("");
  };

  return (
    <div className="mobile-app-container" style={{ paddingTop: "0px" }}>
      {/* Sticky top navbar fixed to all logged-in screens */}
      <div 
        className="mobile-navbar-fixed" 
        style={{
          position: "sticky",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <button 
          onClick={handleGoHome}
          style={{
            background: "rgba(255, 255, 255, 0.08)",
            border: "none",
            borderRadius: "12px",
            padding: "8px 16px",
            color: "#fff",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.2s"
          }}
          title="Go to Bank Dashboard"
        >
          <span>🏠</span> Home
        </button>
        <span style={{ fontWeight: "700", fontSize: "16px", color: "#f8fafc", letterSpacing: "0.5px" }}>🏦 StellarBank</span>
        <button 
          onClick={handleLogout} 
          style={{ 
            background: "rgba(239, 68, 68, 0.15)", 
            color: "#ef4444",
            padding: "8px 14px", 
            borderRadius: "12px", 
            fontSize: "12px", 
            fontWeight: "600",
            border: "none",
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          Logout
        </button>
      </div>

      {status === "success" ? (
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: "40px 24px" }}>
          <div className="receipt-card" style={{ margin: 0, width: "100%", maxWidth: "380px" }}>
            <div className="receipt-check">✓</div>
            <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>Transaction Authorized!</h2>
            <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.5" }}>{successMsg}</p>
            
            <div className="receipt-amount">${parseFloat(amount).toFixed(2)}</div>
            <div style={{ color: "#64748b", fontSize: "14px", marginBottom: "16px" }}>USD</div>
            
            <div className="receipt-divider"></div>
            
            <div className="receipt-row">
              <span className="label">Transaction ID</span>
              <span className="value" style={{ fontSize: "12px", fontFamily: "monospace" }}>{transactionId.substring(0, 16)}...</span>
            </div>
            {loggedInAccount && (
              <div className="receipt-row">
                <span className="label">New Balance</span>
                <span className="value">${bankBalance.toFixed(2)} USD</span>
              </div>
            )}
            
            <div className="receipt-divider"></div>
            
            <button 
              className="btn btn-primary btn-full"
              style={{ marginTop: "24px", padding: "14px", borderRadius: "12px", background: "linear-gradient(135deg, #a855f7, #3b82f6)" }}
              onClick={handleGoHome}
            >
              Return to Bank Details
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mobile-header" style={{ paddingTop: "20px" }}>
            <div className="mobile-header-user">
              <div className="mobile-avatar">
                {loggedInAccount.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="mobile-greeting">Welcome back,</div>
                <div className="mobile-name">{loggedInAccount.name}</div>
              </div>
            </div>
          </div>

          <div className="mobile-balance-section">
            <div className="mobile-balance-label">Available Balance</div>
            <div className="mobile-balance-amount">${bankBalance.toFixed(2)}</div>
            <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
              Account: {loggedInAccount.accountId}
            </div>
          </div>

          {errorMsg && (
            <div className="form-error" style={{ margin: "0 24px 16px" }}>
              {errorMsg}
            </div>
          )}

          {activeTab === 'action' && (
            <div className="mobile-card">
              {status === "ready" ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div className="bank-logo-icon" style={{ margin: "0 auto 16px", background: "var(--gradient-accent)" }}>🏦</div>
                  <h3 style={{ marginBottom: "16px", fontSize: "22px", color: "#fff" }}>Authorize {kind === "deposit" ? "Deposit" : "Withdrawal"}</h3>
                  <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "16px", marginBottom: "32px" }}>
                    You are about to authorize a {kind} of <strong style={{ color: "#fff", fontSize: "24px", display: "block", marginTop: "12px" }}>${amount} USD</strong>
                  </p>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button
                      onClick={handleGoHome}
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: "16px", borderRadius: "12px" }}
                      disabled={status as string === "loading"}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAction}
                      className="btn btn-primary"
                      style={{ flex: 1, padding: "16px", borderRadius: "12px", background: "linear-gradient(135deg, #22c55e, #10b981)" }}
                      disabled={status as string === "loading"}
                    >
                      Approve {kind}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <h3 style={{ marginBottom: "16px", fontSize: "18px", color: "#fff" }}>Ready to Transact?</h3>
                  <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", marginBottom: "24px" }}>
                    Scan a transaction QR code from your desktop wallet to instantly authorize a deposit or withdrawal.
                  </p>
                  
                  {isScanning ? (
                    <div style={{ background: "white", padding: "16px", borderRadius: "16px", color: "black" }}>
                      <div id="qr-reader" style={{ width: "100%" }}></div>
                      <button 
                        onClick={() => setIsScanning(false)}
                        style={{ marginTop: "16px", padding: "8px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: "8px", width: "100%" }}
                      >
                        Cancel Scan
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsScanning(true)}
                      className="btn btn-primary btn-full"
                      style={{ padding: "16px", fontSize: "16px", borderRadius: "12px", background: "linear-gradient(135deg, #a855f7, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                    >
                      <span style={{ fontSize: "20px" }}>📷</span> Scan QR Code to Send Money
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="mobile-card" style={{ flex: 1 }}>
              <h3 style={{ marginBottom: "16px", fontSize: "18px", color: "#fff" }}>Recent Transactions</h3>
              {transactions.length === 0 ? (
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", textAlign: "center", padding: "40px 0" }}>No transactions yet.</p>
              ) : (
                <div className="bank-tx-list">
                  {transactions.map((tx, idx) => (
                    <div key={idx} className="bank-tx-item" style={{ background: "rgba(255,255,255,0.05)", border: "none", marginBottom: "12px", padding: "16px" }}>
                      <div className="bank-tx-item-left">
                        <span className="bank-tx-item-type">{tx.type}</span>
                        <span className="bank-tx-item-date">{new Date(tx.timestamp).toLocaleString()}</span>
                      </div>
                      <div className={`bank-tx-item-right ${tx.type === "deposit" ? "bank-tx-negative" : "bank-tx-positive"}`} style={{ fontSize: "16px" }}>
                        {tx.type === "deposit" ? "-" : "+"}${tx.amount.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bottom-nav-bar">
            <button 
              className={`bottom-nav-item ${activeTab === 'action' ? 'active' : ''}`}
              onClick={() => setActiveTab('action')}
            >
              <span className="bottom-nav-icon">💰</span>
              <span>Action</span>
            </button>
            <button 
              className={`bottom-nav-item ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <span className="bottom-nav-icon">📊</span>
              <span>History</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function InteractivePortal() {
  return (
    <Suspense fallback={
      <div className="mobile-app-container" style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="mobile-card onboarding-loading" style={{ width: "80%" }}>
          <div className="progress-spinner large-spinner" style={{ margin: "0 auto" }} />
          <h3 className="loading-status" style={{ textAlign: "center", marginTop: "16px" }}>Loading Bank Portal...</h3>
        </div>
      </div>
    }>
      <InteractivePortalContent />
    </Suspense>
  );
}
