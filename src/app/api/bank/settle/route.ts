import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId, token, accountId, amount, kind } = body;

    if (!transactionId || !accountId || !amount || !kind) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const anchorServiceUrl = process.env.ANCHOR_SERVICE_URL || "http://localhost:3003";
    const anchorApiKey = process.env.ANCHOR_API_KEY;

    // 1. Fetch transaction details from Anchor Service Proxy
    const txDetailsRes = await fetch(`${anchorServiceUrl}/api/anchor/transactions/${transactionId}`, {
      headers: {
        ...(anchorApiKey ? { Authorization: `Bearer ${anchorApiKey}` } : {}),
      },
    });

    if (!txDetailsRes.ok) {
      const errText = await txDetailsRes.text();
      return NextResponse.json(
        { error: `Failed to fetch transaction from Anchor Service: ${errText}` },
        { status: 500 }
      );
    }

    const txData = await txDetailsRes.json();
    const transaction = txData.transaction || txData;
    const asset =
      transaction.amount_expected?.asset ||
      "stellar:USDC:GDCD2HWDLUMQN37V7PMVIMPMT5MD5YPW3P6WPLCVBHQ4F25B2PJOCCB7";

    if (kind === "deposit") {
      // 2. Call Anchor Service to transition Platform status to pending_user_transfer_start
      console.log(`[bank-sim] Notifying Anchor Service to request offchain funds for deposit tx ${transactionId}...`);
      const depositRes = await fetch(`${anchorServiceUrl}/api/anchor/transactions/deposit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anchorApiKey ? { Authorization: `Bearer ${anchorApiKey}` } : {}),
        },
        body: JSON.stringify({
          transactionId,
          amount: amountVal,
          asset,
        }),
      });

      if (!depositRes.ok) {
        const errText = await depositRes.text();
        return NextResponse.json(
          { error: `Anchor service deposit initialization failed: ${errText}` },
          { status: 500 }
        );
      }

      // 3. Perform the local bank transfer to ACC_ANCHOR
      const bankUrl = process.env.BANK_URL || "http://localhost:3001";
      const bankApiKey = process.env.BANK_API_KEY;

      console.log(`[bank-sim] Transferring ${amountVal} USD from ${accountId} to ACC_ANCHOR...`);
      const transferRes = await fetch(`${bankUrl}/api/transfers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bankApiKey ? { Authorization: `Bearer ${bankApiKey}` } : {}),
        },
        body: JSON.stringify({
          from_account: accountId,
          to_account: "ACC_ANCHOR",
          amount: amountVal,
          currency: "USD",
          reference_id: transactionId,
          idempotency_key: `dep-${transactionId}`,
        }),
      });

      if (!transferRes.ok) {
        const errData = await transferRes.json();
        return NextResponse.json({ error: `Bank transfer failed: ${errData.error}` }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: "Bank deposit authorized and processed! Webhook triggered.",
      });
    } else if (kind === "withdrawal") {
      // 2. Call Anchor Service to register pending withdrawal mapping and transition Platform status
      console.log(`[bank-sim] Notifying Anchor Service to request onchain funds for withdrawal tx ${transactionId}...`);
      const withdrawRes = await fetch(`${anchorServiceUrl}/api/anchor/transactions/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anchorApiKey ? { Authorization: `Bearer ${anchorApiKey}` } : {}),
        },
        body: JSON.stringify({
          transactionId,
          bankAccountId: accountId,
          amount: amountVal,
          asset,
        }),
      });

      if (!withdrawRes.ok) {
        const errText = await withdrawRes.text();
        return NextResponse.json(
          { error: `Anchor service withdrawal initialization failed: ${errText}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Bank withdrawal authorized! Waiting for user payment on-chain...",
      });
    }

    return NextResponse.json({ error: "Invalid kind. Must be 'deposit' or 'withdrawal'" }, { status: 400 });
  } catch (error: any) {
    console.error("Bank settle API error:", error);
    return NextResponse.json({ error: error.message || "Settlement failed" }, { status: 500 });
  }
}
