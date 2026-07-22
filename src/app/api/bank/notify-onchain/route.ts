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
    const { transactionId, stellarTxHash } = body;

    if (!transactionId || !stellarTxHash) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const anchorServiceUrl = process.env.ANCHOR_SERVICE_URL || "http://localhost:3003";
    const anchorApiKey = process.env.ANCHOR_API_KEY;

    console.log(`[bank-sim] Forwarding notify-onchain for tx ${transactionId} to Anchor Service...`);
    const res = await fetch(`${anchorServiceUrl}/api/anchor/transactions/onchain-received`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(anchorApiKey ? { Authorization: `Bearer ${anchorApiKey}` } : {}),
      },
      body: JSON.stringify({ transactionId, stellarTxHash }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({ error: `Anchor service error: ${errText}` }, 500);
    }

    const data = await res.json();
    return jsonResponse(data);
  } catch (error: any) {
    console.error("Bank notify-onchain API error:", error);
    return jsonResponse({ error: error.message || "Failed to notify on-chain funds" }, 500);
  }
}
