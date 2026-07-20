"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function InteractivePortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [transactionId, setTransactionId] = useState("");
  const [kind, setKind] = useState("deposit");
  const [amount, setAmount] = useState("10.00");

  const [loggedInAccount, setLoggedInAccount] = useState<any>(null);

  const [bankBalance, setBankBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"action" | "history">("action");
  const [upiId, setUpiId] = useState("");

  useEffect(() => {
    if (loggedInAccount) {
      setUpiId(`${loggedInAccount.accountId}@stellarbank`);
    } else {
      setUpiId("");
    }
  }, [loggedInAccount?.accountId]);
  
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

  // Load account from localStorage if exists, redirect if not
  useEffect(() => {
    const stored = localStorage.getItem("stellarpay_bank_account");
    if (stored) {
      const acc = JSON.parse(stored);
      setLoggedInAccount(acc);
      fetchBalance(acc.accountId);
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.set("redirectTo", "/bank/interactive");
      router.push(`/bank/login?${params.toString()}`);
    }
  }, [router, searchParams]);

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

  const handleLogout = () => {
    localStorage.removeItem("stellarpay_bank_account");
    setLoggedInAccount(null);
    setBankBalance(0);
    router.push("/bank/login?redirectTo=/bank/interactive");
  };

  const handleAction = async () => {
    if (!loggedInAccount) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      let targetAccountId = loggedInAccount.accountId;
      if (kind === "withdrawal" && upiId) {
        const parts = upiId.split("@");
        if (parts.length > 0 && parts[0].trim()) {
          targetAccountId = parts[0].trim().toLowerCase();
        }
      }

      const settleRes = await fetch("/api/bank/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: transactionId,
          token: "dummy-token-not-needed",
          accountId: targetAccountId,
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
      <div className="mobile-app-container" style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="mobile-card" style={{ width: "80%", maxWidth: "380px", padding: "32px", textAlign: "center" }}>
          <div className="progress-spinner large-spinner" style={{ margin: "0 auto" }} />
          <h3 className="loading-status" style={{ marginTop: "16px", color: "var(--text-secondary)" }}>Redirecting to Bank Login...</h3>
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
          background: "var(--bg-glass-strong)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <button 
          onClick={handleGoHome}
          style={{
            background: "rgba(22, 74, 58, 0.06)",
            border: "none",
            borderRadius: "12px",
            padding: "8px 16px",
            color: "var(--text-primary)",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.2s"
          }}
          title="Go to Bank Home"
        >
          <span>🏠</span> Home
        </button>
        <span style={{ fontWeight: "700", fontSize: "16px", color: "var(--text-primary)", letterSpacing: "0.5px" }}>🏦 StellarBank</span>
        <button 
          onClick={handleLogout} 
          style={{ 
            background: "rgba(217, 83, 79, 0.12)", 
            color: "var(--error)",
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
          <div className="mobile-header" style={{ paddingTop: "20px", maxWidth: "600px", margin: "0 auto", width: "100%" }}>
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

          <div className="mobile-balance-section" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: "16px", marginBottom: "8px", maxWidth: "600px", margin: "16px auto 8px", width: "100%" }}>
            <div className="mobile-balance-label" style={{ color: "var(--text-secondary)", fontSize: "14px", fontWeight: "600" }}>Available Balance</div>
            <div className="mobile-balance-amount" style={{ color: "var(--text-primary)", fontSize: "40px", fontWeight: "800", margin: "4px 0" }}>${bankBalance.toFixed(2)}</div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px", width: "100%", alignItems: "center" }}>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Account: <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{loggedInAccount.accountId}</span>
              </div>
              
              {/* Copy UPI Button */}
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${loggedInAccount.accountId}@stellarbank`);
                  alert(`Copied UPI ID: ${loggedInAccount.accountId}@stellarbank`);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "var(--text-primary)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(22, 74, 58, 0.04)",
                  transition: "all 0.2s"
                }}
                className="hover:scale-[1.02] active:scale-[0.98]"
                title="Click to copy UPI ID"
              >
                <span>🔑 UPI ID:</span>
                <span style={{ fontFamily: "monospace", fontSize: "12.5px" }}>{loggedInAccount.accountId}@stellarbank</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "2px" }}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="form-error" style={{ margin: "0 auto 16px", maxWidth: "600px", width: "calc(100% - 48px)" }}>
              {errorMsg}
            </div>
          )}

          {activeTab === 'action' && (
            <div className="mobile-card" style={{ maxWidth: "600px", margin: "0 auto 24px" }}>
              {status === "ready" ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div 
                    className="bank-logo-icon" 
                    style={{ 
                      margin: "0 auto 16px", 
                      background: "var(--gradient-accent)", 
                      width: "56px", 
                      height: "56px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center", 
                      fontSize: "24px" 
                    }}
                  >
                    🏦
                  </div>
                  <h3 style={{ marginBottom: "16px", fontSize: "22px", color: "var(--text-primary)" }}>Authorize {kind === "deposit" ? "Deposit" : "Withdrawal"}</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "16px", marginBottom: "24px" }}>
                    You are about to authorize a {kind} of <strong style={{ color: "var(--text-primary)", fontSize: "32px", fontWeight: "800", display: "block", marginTop: "12px" }}>${amount} USD</strong>
                  </p>
                  {kind === "withdrawal" && (
                    <div style={{ marginBottom: "24px", textAlign: "left" }}>
                      <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", color: "var(--text-secondary)" }}>
                        Receive funds to UPI ID (Virtual Payment Address):
                      </label>
                      <input
                        type="text"
                        placeholder="username@stellarbank"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "12px",
                          borderRadius: "12px",
                          border: "1px solid var(--border-subtle)",
                          background: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                          fontSize: "16px",
                          outline: "none"
                        }}
                      />
                    </div>
                  )}
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
                  <h3 style={{ marginBottom: "16px", fontSize: "18px", color: "var(--text-primary)" }}>Ready to Transact?</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "24px" }}>
                    Scan a transaction QR code from your desktop wallet to instantly authorize a deposit or withdrawal.
                  </p>
                  
                  {isScanning ? (
                    <div style={{ background: "white", padding: "16px", borderRadius: "16px", color: "black", maxWidth: "420px", margin: "0 auto", border: "1px solid rgba(0,0,0,0.1)", boxShadow: "0 10px 25px rgba(0,0,0,0.05)" }}>
                      <div id="qr-reader" style={{ width: "100%", overflow: "hidden", borderRadius: "12px" }}></div>
                      <button 
                        onClick={() => setIsScanning(false)}
                        style={{ marginTop: "16px", padding: "12px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: "12px", width: "100%", fontSize: "15px", fontWeight: "600", cursor: "pointer", transition: "all 0.2s" }}
                      >
                        Cancel Scan
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsScanning(true)}
                      className="btn btn-primary btn-full"
                      style={{ padding: "16px", fontSize: "16px", borderRadius: "12px", background: "linear-gradient(135deg, #a855f7, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", maxWidth: "340px", margin: "0 auto" }}
                    >
                      <span style={{ fontSize: "20px" }}>📷</span> Scan QR Code to Send Money
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="mobile-card" style={{ flex: 1, maxWidth: "600px", margin: "0 auto 24px" }}>
              <h3 style={{ marginBottom: "16px", fontSize: "18px", color: "var(--text-primary)" }}>Recent Transactions</h3>
              {transactions.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center", padding: "40px 0" }}>No transactions yet.</p>
              ) : (
                <div className="bank-tx-list">
                  {transactions.map((tx, idx) => (
                    <div key={idx} className="bank-tx-item" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", marginBottom: "12px", padding: "16px" }}>
                      <div className="bank-tx-item-left">
                        <span className="bank-tx-item-type">{tx.type}</span>
                        <span className="bank-tx-item-date">{new Date(tx.timestamp).toLocaleString()}</span>
                      </div>
                      <div className={`bank-tx-item-right ${tx.type.startsWith("DEBIT") ? "bank-tx-negative" : "bank-tx-positive"}`} style={{ fontSize: "16px" }}>
                        {tx.type.startsWith("DEBIT") ? "-" : "+"}${tx.amount.toFixed(2)}
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
