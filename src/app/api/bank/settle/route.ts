import { NextRequest, NextResponse } from "next/server";

function jsonResponse(data: any, status: number = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionId, token, accountId, amount, kind } = body;

    if (!transactionId || !accountId || !amount || !kind) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      return jsonResponse({ error: "Invalid amount" }, 400);
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
      return jsonResponse(
        { error: `Failed to fetch transaction from Anchor Service: ${errText}` },
        500
      );
    }

    const txData = await txDetailsRes.json();
    const transaction = txData.transaction || txData;
    const asset =
      transaction.amount_expected?.asset ||
      "stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

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
        return jsonResponse(
          { error: `Anchor service deposit initialization failed: ${errText}` },
          500
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
        return jsonResponse({ error: `Bank transfer failed: ${errData.error}` }, 400);
      }

      return jsonResponse({
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
        return jsonResponse(
          { error: `Anchor service withdrawal initialization failed: ${errText}` },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: "Bank withdrawal authorized! Waiting for user payment on-chain...",
      });
    }

    return jsonResponse({ error: "Invalid kind. Must be 'deposit' or 'withdrawal'" }, 400);
  } catch (error: any) {
    console.error("Bank settle API error:", error);
    return jsonResponse({ error: error.message || "Settlement failed" }, 500);
  }
}
