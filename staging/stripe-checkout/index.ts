import Stripe from "npm:stripe@^22";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const appUrl = (Deno.env.get("STAGING_APP_URL") || "").replace(/\/+$/, "");
    // This code is for a SEPARATE test Supabase environment, not the live project.
    if (appUrl !== "https://allo-psycho-test.artdevie63.workers.dev") {
      return json({ ok: false, diagnostic: "ST-STAGING-URL" }, 503);
    }
    if (!stripeKey?.startsWith("sk_test_")) {
      return json({ ok: false, diagnostic: "ST-TEST-MODE-REQUIRED" }, 503);
    }
    const auth = req.headers.get("Authorization") || "";

    if (!url || !anon || !service || !stripeKey) {
      return json({ ok: false, error: "configuration", diagnostic: "ST-CFG" }, 500);
    }

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ ok: false, error: "unauthorized", diagnostic: "ST-AUTH" }, 401);
    }

    let plan = "monthly";
    try {
      const body = await req.json();
      if (body?.plan === "annual" || body?.plan === "yearly") plan = "annual";
    } catch (_) {}

    const monthlyPrice = Deno.env.get("STRIPE_PRICE_MONTHLY_ID");
    const annualPrice = Deno.env.get("STRIPE_PRICE_ANNUAL_ID");
    if (!monthlyPrice || !annualPrice) {
      return json({ ok:false, diagnostic:"ST-PRICES-MISSING" }, 503);
    }
    const priceId = plan === "annual" ? annualPrice : monthlyPrice;

    const admin = createClient(url, service, { auth: { persistSession: false } });

    const entitlement = await admin
      .from("premium_entitlements")
      .select("premium_until")
      .eq("user_id", user.id)
      .maybeSingle();

    if (entitlement.error) {
      return json({ ok: false, error: "entitlement_read", diagnostic: "ST-ENT" }, 500);
    }

    const permanent =
      entitlement.data?.premium_until &&
      new Date(entitlement.data.premium_until).getTime() >=
        new Date("2099-01-01T00:00:00.000Z").getTime();

    if (permanent) {
      return json({ ok: false, error: "permanent_access", diagnostic: "ST-PERMANENT" });
    }

    const existing = await admin
      .from("stripe_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing.error) {
      return json({ ok: false, error: "stripe_state_read", diagnostic: "ST-STATE" }, 500);
    }

    if (
      existing.data &&
      ["active", "trialing", "past_due"].includes(existing.data.status) &&
      existing.data.stripe_subscription_id
    ) {
      return json({ ok: false, error: "already_subscribed", diagnostic: "ST-ALREADY" });
    }

    const stripe = new Stripe(stripeKey);
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.livemode || price.currency !== "eur" ||
        price.unit_amount !== (plan === "annual" ? 8499 : 999) ||
        price.recurring?.interval !== (plan === "annual" ? "year" : "month")) {
      return json({ ok:false, diagnostic:"ST-INVALID-TEST-PRICE" }, 503);
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      // NOTE: Trial semantics are not implemented until they align with
      // the existing 10-day access trial and are tested separately.
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: {
        supabase_user_id: user.id,
        app: "allo-psycho",
        plan,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          app: "allo-psycho",
          plan,
        },
      },
      locale: "fr",
      success_url: `${appUrl}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?stripe=cancel`,
    };

    if (existing.data?.stripe_customer_id) {
      params.customer = existing.data.stripe_customer_id;
    }

    const session = await stripe.checkout.sessions.create(params);

    return json({
      ok: true,
      plan,
      price_id: priceId,
      url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    console.error("stripe-checkout-stage", error instanceof Error ? error.name : "unknown");
    return json({
      ok: false,
      error: "server_error",
      diagnostic: "ST-EDGE",
      detail: "Test Checkout unavailable",
    }, 500);
  }
});