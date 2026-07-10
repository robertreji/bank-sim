import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { enqueueAndDispatchWebhook } from "@/lib/webhooks";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate Request
    const authHeader = request.headers.get("Authorization");
    const bankApiKey = process.env.BANK_API_KEY;

    if (bankApiKey) {
      if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== bankApiKey) {
        return NextResponse.json({ error: "Unauthorized: Invalid API Key" }, { status: 401 });
      }
    }

    // 2. Parse Body
    const body = await request.json();
    const { from_account, to_account, amount, currency, reference_id, idempotency_key } = body;

    if (!from_account || !to_account || !amount || !currency || !idempotency_key) {
      return NextResponse.json(
        { error: "Missing required fields: from_account, to_account, amount, currency, idempotency_key" },
        { status: 400 }
      );
    }

    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const transferId = "tx-" + Math.random().toString(36).substring(2, 9);

    // 3. Call Supabase RPC stored procedure to transfer funds safely inside a transaction
    console.log(
      `[bank-sim] Executing transfer_funds RPC: ${amountVal} ${currency} from ${from_account} to ${to_account}`
    );
    const { data: rpcRes, error: rpcError } = await supabase.rpc("transfer_funds", {
      p_id: transferId,
      p_from_account: from_account,
      p_to_account: to_account,
      p_amount: amountVal,
      p_currency: currency,
      p_reference_id: reference_id || null,
      p_idempotency_key: idempotency_key,
    });

    if (rpcError) {
      console.error("[bank-sim] RPC execution failed:", rpcError.message);
      return NextResponse.json({ error: rpcError.message || "Transfer execution failed" }, { status: 500 });
    }

    // Handle return object from stored procedure
    // RPC returns JSON: { success, error, transfer_id, code }
    const result = rpcRes as any;

    if (!result.success) {
      const statusCode = result.code ? parseInt(result.code) : 400;
      return NextResponse.json({ error: result.error || "Transfer failed" }, { status: statusCode });
    }

    const finalTransferId = result.transfer_id || transferId;
    console.log(
      `[bank-sim] Transfer successful: ${amountVal} ${currency} from ${from_account} to ${to_account} (ID: ${finalTransferId})`
    );

    // 4. Check if recipient is the anchor to dispatch the webhook
    const { data: recipient, error: recError } = await supabase
      .from("accounts")
      .select("owner_type")
      .eq("id", to_account)
      .single();

    if (!recError && recipient && recipient.owner_type === "anchor") {
      // Async dispatch
      enqueueAndDispatchWebhook(finalTransferId, reference_id, from_account, amountVal);
    }

    return NextResponse.json({ success: true, transfer_id: finalTransferId, status: "completed" });
  } catch (error: any) {
    console.error("Transfer catch-error:", error);
    return NextResponse.json({ error: error.message || "Transfer execution failed" }, { status: 500 });
  }
}
