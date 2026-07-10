import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const anchorServiceUrl = process.env.ANCHOR_SERVICE_URL || "http://localhost:3003";
    const anchorApiKey = process.env.ANCHOR_API_KEY;

    console.log(`[bank-sim] Proxying getTransaction details for ID: ${id} to ${anchorServiceUrl}`);

    const res = await fetch(`${anchorServiceUrl}/api/anchor/transactions/${id}`, {
      headers: {
        ...(anchorApiKey ? { Authorization: `Bearer ${anchorApiKey}` } : {}),
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Anchor Service returned error: ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Proxy anchor details fetch error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch transaction details" }, { status: 500 });
  }
}
