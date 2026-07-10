import { supabase } from "./supabase";

export async function enqueueAndDispatchWebhook(
  transferId: string,
  referenceId: string | null,
  fromAccount: string,
  amount: number
) {
  const anchorWebhookUrl = process.env.ANCHOR_WEBHOOK_URL;
  const anchorApiKey = process.env.ANCHOR_API_KEY; // Secret for calling Anchor Service

  if (!anchorWebhookUrl) {
    console.log("[bank-sim] Webhook URL not configured. Skipping webhook dispatch.");
    return;
  }

  if (!referenceId) {
    console.log("[bank-sim] Missing referenceId for webhook. Skipping.");
    return;
  }

  const webhookId = "wh-" + Math.random().toString(36).substring(2, 9);

  try {
    // 1. Insert into Supabase
    const { error: insertError } = await supabase.from("webhooks").insert({
      id: webhookId,
      transfer_id: transferId,
      reference_id: referenceId,
      url: anchorWebhookUrl,
      status: "pending",
      attempts: 0,
    });

    if (insertError) {
      console.error("[bank-sim] Webhook enqueue failed:", insertError.message);
      return;
    }

    // 2. Asynchronously dispatch (don't await so we respond to caller immediately)
    dispatchWebhook(webhookId, referenceId, fromAccount, amount, anchorWebhookUrl, anchorApiKey, 0);
  } catch (err: any) {
    console.error("[bank-sim] Webhook process failed:", err.message);
  }
}

async function dispatchWebhook(
  webhookId: string,
  referenceId: string,
  fromAccount: string,
  amount: number,
  webhookUrl: string,
  apiKey?: string,
  retryCount = 0
) {
  try {
    // Check status first to avoid duplicates
    const { data: webhook } = await supabase
      .from("webhooks")
      .select("status")
      .eq("id", webhookId)
      .maybeSingle();

    if (!webhook || webhook.status === "delivered") return;

    console.log(
      `[bank-sim] Dispatching webhook ${webhookId} to ${webhookUrl} for reference_id: ${referenceId} (attempt ${
        retryCount + 1
      })...`
    );

    // Call Anchor webhook
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        reference_id: referenceId,
        amount: amount.toFixed(2),
        from_account: fromAccount,
      }),
    });

    const timestamp = new Date().toISOString();

    if (response.ok) {
      await supabase
        .from("webhooks")
        .update({
          status: "delivered",
          attempts: retryCount + 1,
          last_attempt: timestamp,
        })
        .eq("id", webhookId);
      console.log(`[bank-sim] Webhook ${webhookId} delivered successfully!`);
    } else {
      const statusText = await response.text();
      console.warn(
        `[bank-sim] Webhook ${webhookId} failed with status ${response.status}: ${statusText}`
      );
      await supabase
        .from("webhooks")
        .update({
          status: "failed",
          attempts: retryCount + 1,
          last_attempt: timestamp,
        })
        .eq("id", webhookId);

      scheduleRetry(webhookId, referenceId, fromAccount, amount, webhookUrl, apiKey, retryCount);
    }
  } catch (err: any) {
    console.error(`[bank-sim] Webhook ${webhookId} network error:`, err.message);
    const timestamp = new Date().toISOString();
    await supabase
      .from("webhooks")
      .update({
        status: "failed",
        attempts: retryCount + 1,
        last_attempt: timestamp,
      })
      .eq("id", webhookId);

    scheduleRetry(webhookId, referenceId, fromAccount, amount, webhookUrl, apiKey, retryCount);
  }
}

function scheduleRetry(
  webhookId: string,
  referenceId: string,
  fromAccount: string,
  amount: number,
  webhookUrl: string,
  apiKey?: string,
  retryCount = 0
) {
  if (retryCount < 3) {
    const delayMs = Math.pow(2, retryCount) * 2000; // Exponential backoff: 2s, 4s, 8s
    console.log(`[bank-sim] Scheduling retry for webhook ${webhookId} in ${delayMs / 1000}s...`);
    setTimeout(() => {
      dispatchWebhook(webhookId, referenceId, fromAccount, amount, webhookUrl, apiKey, retryCount + 1);
    }, delayMs);
  } else {
    console.error(`[bank-sim] Webhook ${webhookId} failed after max attempts.`);
  }
}
