import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner_type, owner_ref, currency, password, name, initial_balance } = body;

    if (!owner_type || !owner_ref || !currency) {
      return NextResponse.json(
        { error: "Missing required fields: owner_type, owner_ref, currency" },
        { status: 400 }
      );
    }

    if (owner_type !== "user" && owner_type !== "anchor") {
      return NextResponse.json(
        { error: "owner_type must be 'user' or 'anchor'" },
        { status: 400 }
      );
    }

    const accountId = owner_ref;
    const balance = initial_balance ? parseFloat(initial_balance) : 0.0;

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        id: accountId,
        owner_type,
        owner_ref,
        currency,
        balance,
        password: password || null,
        name: name || owner_ref,
      })
      .select()
      .single();

    if (error) {
      console.error("[bank-sim] Account creation DB error:", error.message);
      return NextResponse.json({ error: error.message || "Failed to create account" }, { status: 400 });
    }

    console.log(`[bank-sim] Created account: ${accountId} (${owner_type}), Balance: ${balance} ${currency}`);
    return NextResponse.json({ success: true, account: data }, { status: 201 });
  } catch (error: any) {
    console.error("Account creation catch-error:", error);
    return NextResponse.json({ error: error.message || "Failed to create account" }, { status: 500 });
  }
}
