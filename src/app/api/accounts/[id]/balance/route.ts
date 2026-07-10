import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    // Fetch account details
    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (accError) {
      console.error("[bank-sim] Balance check DB error:", accError.message);
      return NextResponse.json({ error: "Database error checking account" }, { status: 500 });
    }

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Fetch transfers where account is sender or recipient
    const { data: transfers, error: txError } = await supabase
      .from("transfers")
      .select("*")
      .or(`from_account.eq.${id},to_account.eq.${id}`)
      .order("created_at", { ascending: false });

    if (txError) {
      console.error("[bank-sim] Fetch transfers DB error:", txError.message);
      return NextResponse.json({ error: "Database error checking transfers" }, { status: 500 });
    }

    const transactionHistory = (transfers || []).map((t: any) => ({
      id: t.id,
      account_id: id,
      type: t.from_account === id ? `DEBIT (${t.to_account})` : `CREDIT (${t.from_account})`,
      amount: t.amount,
      timestamp: t.created_at,
      reference_id: t.reference_id,
      status: t.status,
    }));

    return NextResponse.json({
      success: true,
      balance: parseFloat(account.balance),
      name: account.name,
      currency: account.currency,
      owner_type: account.owner_type,
      transactions: transactionHistory,
    });
  } catch (error: any) {
    console.error("Balance lookup catch-error:", error);
    return NextResponse.json({ error: error.message || "Operation failed" }, { status: 500 });
  }
}
