import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine, use defaults
    }
    const { amount } = body;
    const amountVal = amount ? parseFloat(amount) : 1000.0;

    if (isNaN(amountVal) || amountVal <= 0) {
      return NextResponse.json({ error: "Invalid seed amount" }, { status: 400 });
    }

    // Check if account exists
    const { data: account, error: getError } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (getError) {
      return NextResponse.json({ error: getError.message }, { status: 500 });
    }

    if (!account) {
      // Auto create account
      const { error: insertError } = await supabase.from("accounts").insert({
        id: id,
        owner_type: "user",
        owner_ref: id,
        currency: "USD",
        balance: amountVal,
        name: id,
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      console.log(`[bank-sim] Seed created account: ${id}, Balance: ${amountVal} USD`);
    } else {
      // Update balance
      const newBalance = parseFloat(account.balance) + amountVal;
      const { error: updateError } = await supabase
        .from("accounts")
        .update({ balance: newBalance })
        .eq("id", id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      console.log(`[bank-sim] Seeded existing account: ${id}, added ${amountVal} USD`);
    }

    // Log the transfer from Faucet
    const transferId = "seed-" + Math.random().toString(36).substring(2, 9);
    await supabase.from("transfers").insert({
      id: transferId,
      from_account: "SYSTEM_FAUCET",
      to_account: id,
      amount: amountVal,
      currency: "USD",
      reference_id: "DEV_SEED",
      idempotency_key: "idemp-seed-" + transferId,
      status: "completed",
    });

    // Retrieve updated balance
    const { data: updatedAccount } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", id)
      .single();

    return NextResponse.json({ success: true, balance: parseFloat(updatedAccount?.balance || 0) });
  } catch (error: any) {
    console.error("Seed catch-error:", error);
    return NextResponse.json({ error: error.message || "Seed operation failed" }, { status: 500 });
  }
}
