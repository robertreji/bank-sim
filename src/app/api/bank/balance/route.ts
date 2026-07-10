import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json({ error: "AccountId is required" }, { status: 400 });
    }

    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();

    if (accError) {
      console.error("[bank-sim] Balance check DB error:", accError.message);
      return NextResponse.json({ error: "Database error checking balance" }, { status: 500 });
    }

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Fetch transfers
    const { data: transfers, error: txError } = await supabase
      .from("transfers")
      .select("*")
      .or(`from_account.eq.${accountId},to_account.eq.${accountId}`)
      .order("created_at", { ascending: false });

    if (txError) {
      console.error("[bank-sim] Fetch transfers DB error:", txError.message);
      return NextResponse.json({ error: "Database error checking transfers" }, { status: 500 });
    }

    const transactionHistory = (transfers || []).map((t: any) => ({
      id: t.id,
      account_id: accountId,
      type: t.from_account === accountId ? `DEBIT (${t.to_account})` : `CREDIT (${t.from_account})`,
      amount: parseFloat(t.amount),
      timestamp: t.created_at,
      reference_id: t.reference_id,
      status: t.status,
    }));

    return NextResponse.json({
      success: true,
      balance: parseFloat(account.balance),
      name: account.name,
      transactions: transactionHistory,
    });
  } catch (error: any) {
    console.error("Bank balance API error:", error);
    return NextResponse.json({ error: error.message || "Operation failed" }, { status: 500 });
  }
}
