import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, password, name, initialBalance } = body;

    if (!accountId || !password || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const balanceVal = initialBalance ? parseFloat(initialBalance) : 1000.0;

    // Create the account in Supabase
    const { data: account, error: insertError } = await supabase
      .from("accounts")
      .insert({
        id: accountId,
        owner_type: "user",
        owner_ref: accountId,
        currency: "USD",
        balance: balanceVal,
        password,
        name,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[bank-sim] Register DB error:", insertError.message);
      return NextResponse.json({ error: insertError.message || "Registration failed" }, { status: 400 });
    }

    // Log the initial deposit transfer
    const transferId = "seed-" + Math.random().toString(36).substring(2, 9);
    await supabase.from("transfers").insert({
      id: transferId,
      from_account: "SYSTEM_FAUCET",
      to_account: accountId,
      amount: balanceVal,
      currency: "USD",
      reference_id: "INITIAL_DEPOSIT",
      idempotency_key: "idemp-seed-" + transferId,
      status: "completed",
    });

    console.log(`[bank-sim] Registered user bank account: ${accountId}, Initial Balance: ${balanceVal}`);
    return NextResponse.json({ success: true, message: "Bank account created successfully!" });
  } catch (error: any) {
    console.error("Bank register API error:", error);
    return NextResponse.json({ error: error.message || "Registration failed" }, { status: 500 });
  }
}
