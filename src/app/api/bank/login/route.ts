import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, password } = body;

    if (!accountId || !password) {
      return NextResponse.json({ error: "Account ID and password are required" }, { status: 400 });
    }

    const { data: account, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      console.error("[bank-sim] Login DB error:", error.message);
      return NextResponse.json({ error: "Database error during login" }, { status: 500 });
    }

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (account.password && account.password !== password) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      account: {
        accountId: account.id,
        name: account.name,
        balance: parseFloat(account.balance),
      },
    });
  } catch (error: any) {
    console.error("Bank login API error:", error);
    return NextResponse.json({ error: error.message || "Login failed" }, { status: 500 });
  }
}
