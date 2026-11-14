import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function cleanText(v: unknown, max = 3000) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const MEMORY_FIELDS = [
  "current_goal",
  "recurring_theme",
  "last_tool",
  "helpful",
  "next_small_step",
  "last_follow_up",
] as const;

function sanitizeMemory(input: unknown) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const out: Record<string, string | null> = {};
  for (const key of MEMORY_FIELDS) {
    const value = cleanText(source[key], 180);
    out[key] = value || null;
  }
  return out;
}

function parseTherapyOutput(rawReply: string, previousMemory: unknown) {
  const marker = "<<MEMORY_JSON>>";
  const idx = rawReply.lastIndexOf(marker);
  if (idx < 0) {
    return { reply: rawReply.trim(), memory: sanitizeMemory(previousMemory) };
  }

  const visible = rawReply.slice(0, idx).trim();
  const memoryText = rawReply.slice(idx + marker.length).trim();
  let parsed: unknown = null;
  try { parsed = JSON.parse(memoryText); } catch (_) {}

  return {
    reply: visible || rawReply.trim(),
    memory: parsed && typeof parsed === "object"
      ? sanitizeMemory(parsed)
      : sanitizeMemory(previousMemory),
  };
}

function crisisType(message: string) {
  const t = normalize(message);
  if (/suicide|suicider|me tuer|mourir|en finir|plus envie de vivre|ne veux plus vivre|mettre fin a mes jours/.test(t)) return "suicide";
  if (/automutil|me couper|me taillader|scarifier|danger immediat|arme|couteau|etrangler/.test(t)) return "danger";
  return null;
}

async function getUser(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return { user: null, error: "supabase_env_missing" };

  const auth = req.headers.get("Authorization") || "";
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error } = await client.auth.getUser();
  return { user, error: error?.message || null };
}

async function premiumStatus(req: Request) {
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!base || !anon) return { active: false, reason: "supabase_env_missing" };

  const auth = req.headers.get("Authorization") || "";
  const r = await fetch(base + "/functions/v1/premium-access", {
    method: "POST",
    headers: {
      "Authorization": auth,
      "apikey": anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "status" }),
  });

  let data: any = null;
  try { data = await r.json(); } catch (_) {}

  if (!r.ok) return { active: false, reason: "premium_http_" + r.status, detail: data };
  return {
    active: data?.active === true,
    source: data?.source || null,
    expires_at: data?.expires_at || null,
  };
}

async function consumeDailyQuota(userId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return { ok: false, remaining: 0, diagnostic: "quota_env_missing" };

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("consume_ai_daily_message", {
    p_user_id: userId,
    p_limit: 12,
  });

  if (error) {
    console.error("AI quota RPC", error);
    return { ok: false, remaining: 0, diagnostic: "quota_rpc_failed" };
  }

  const count = typeof data === "number" ? data : Number(data);
  if (!count || count > 12) return { ok: false, remaining: 0, diagnostic: "daily_limit" };

  return { ok: true, remaining: Math.max(0, 12 - count), count };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const message = cleanText(body?.message, 3000);
    if (!message) return json({ error: "message_required" }, 400);

    const crisis = crisisType(message);
    if (crisis === "suicide") {
      return json({
        reply: "Je prends ce que tu dis au sérieux. Si tu risques de te faire du mal maintenant, appelle immédiatement le 15 ou le 112, ou rends-toi aux urgences. Si tu es en France, tu peux aussi appeler le 3114, 24h/24 et 7j/7. Reste si possible avec une personne de confiance et éloigne-toi de ce qui pourrait te blesser.",
        memory: body?.local_memory && typeof body.local_memory === "object" ? body.local_memory : {},
      });
    }
    if (crisis === "danger") {
      return json({
        reply: "Ta sécurité passe en premier. Si le danger est immédiat, appelle le 15 ou le 112. Éloigne-toi si possible des objets ou situations dangereuses et rejoins une personne de confiance.",
        memory: body?.local_memory && typeof body.local_memory === "object" ? body.local_memory : {},
      });
    }

    const { user } = await getUser(req);
    if (!user) {
      return json({
        unavailable: true,
        diagnostic: "AI-AUTH",
        reply: "La session sécurisée du compagnon IA n’a pas pu être rétablie. Réessaie dans quelques instants.",
      });
    }

    const premium = await premiumStatus(req);
    if (!premium.active) {
      return json({
        premium_required: true,
        source: premium.source || null,
        expires_at: premium.expires_at || null,
      });
    }

    const apiKey = Deno.env.get("GROQ_API_KEY");
    const configuredModel = Deno.env.get("GROQ_MODEL") || "";
    const deprecatedModels = new Set([
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "qwen/qwen3.6-27b"
    ]);
    const model = (!configuredModel || deprecatedModels.has(configuredModel))
      ? "openai/gpt-oss-20b"
      : configuredModel;
    if (!apiKey) {
      return json({
        unavailable: true,
        diagnostic: "AI-GROQ-KEY",
        reply: "Le compagnon IA est configuré, mais sa clé Groq n’est pas encore disponible côté serveur.",
      });
    }

    const quota = await consumeDailyQuota(user.id);
    if (!quota.ok) {
      return json({
        daily_limit_reached: true,
        limit: 12,
        remaining: 0,
        reply: "Tu as atteint la limite de 12 messages IA pour aujourd’hui. Le compteur sera réinitialisé demain.",
      });
    }

    const context = body?.context && typeof body.context === "object" ? body.context : {};
    const localMemory = sanitizeMemory(body?.local_memory);
    const history = Array.isArray(body?.recent_history)
      ? body.recent_history
          .slice(-16)
          .filter((x: any) => x && (x.role === "user" || x.role === "assistant"))
          .map((x: any) => ({ role: x.role, content: cleanText(x.content, 1800) }))
          .filter((x: any) => x.content)
      : [];

    const style = cleanText(context?.response_style, 40) || "doux";
    const goal = cleanText(context?.goal, 120) || "apaisement";
    const routine = cleanText(context?.routine_preference, 80) || "souple";
    const mood = cleanText(context?.recent_mood, 80);
    const tccMode = context?.tcc_mode === true;
    const shortMode = context?.short_mode === true;

    const system = [
      "Tu es le compagnon conversationnel d’Allo Psycho, un outil d’accompagnement psychologique conçu par une psychologue clinicienne.",
      "Réponds en français, avec chaleur, clarté et sobriété.",
      "Tu ne poses pas de diagnostic, tu ne remplaces pas une consultation et tu n’affirmes pas connaître ce que la personne ressent.",
      "Privilégie l’auto-observation, la régulation émotionnelle, l’activation comportementale, les outils TCC, la clarification des besoins et des valeurs.",
      "Pose au maximum une question utile à la fois quand une question est pertinente.",
      "Évite les formulations infantilisantes, les promesses thérapeutiques et les longues listes.",
      shortMode ? "Réponse courte : environ 4 à 7 phrases maximum." : "Réponse concise mais suffisamment développée pour être utile.",
      tccMode ? "Mode TCC guidé actif : structure la réponse autour de situation, pensée, émotion, faits, alternative et petit pas, sans tout traiter d’un coup." : "",
      "Style souhaité : " + style + ".",
      "Objectif principal : " + goal + ".",
      "Rythme préféré : " + routine + ".",
      mood ? "Dernière humeur renseignée localement : " + mood + "." : "",
      "Mémoire thérapeutique locale minimale fournie par l’appareil : " + JSON.stringify(localMemory) + ".",
      "Utilise cette mémoire seulement si elle est pertinente pour assurer une continuité douce, sans prétendre te souvenir de détails absents.",
      "Si la difficulté paraît persistante, s’aggrave, altère nettement le fonctionnement quotidien, ou nécessite une évaluation clinique, encourage avec mesure à en parler à un psychologue ou à un professionnel de santé.",
      "Ne demande jamais de données d’identité inutiles.",
      "À la fin de chaque réponse, ajoute exactement le marqueur <<MEMORY_JSON>> puis un objet JSON compact, sans markdown ni commentaire.",
      "Cet objet doit contenir uniquement : current_goal, recurring_theme, last_tool, helpful, next_small_step, last_follow_up.",
      "Chaque valeur doit être une chaîne courte ou null. N’inclus jamais identité, coordonnées, diagnostic, verbatim intime détaillé, événement traumatique détaillé, médicament ou donnée administrative.",
      "Mets à jour seulement ce qui est raisonnablement déductible de l’échange ; sinon conserve la valeur précédente.",
    ].filter(Boolean).join("\n");

    const messages = [
      { role: "system", content: system },
      ...history,
      { role: "user", content: message },
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.55,
        max_tokens: shortMode ? 450 : 850,
      }),
    });

    const raw = await response.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch (_) {}

    if (!response.ok) {
      console.error("Groq HTTP", response.status, raw.slice(0, 1200));
      return json({
        unavailable: true,
        diagnostic: "AI-GROQ-" + response.status,
        reply: "Le compagnon IA est momentanément indisponible. Réessaie dans quelques instants.",
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    const rawReply = Array.isArray(content)
      ? content.map((x: any) => typeof x?.text === "string" ? x.text : "").join("\n").trim()
      : cleanText(content, 12000);

    if (!rawReply) {
      return json({
        unavailable: true,
        diagnostic: "AI-EMPTY",
        reply: "Je n’ai pas réussi à produire une réponse suffisamment claire. Reformule simplement ton dernier message.",
      });
    }

    const parsedOutput = parseTherapyOutput(rawReply, localMemory);

    return json({
      reply: parsedOutput.reply,
      memory: parsedOutput.memory,
      model,
      premium_source: premium.source || null,
      daily_limit: 12,
      daily_remaining: quota.remaining,
    });
  } catch (e) {
    console.error("ai-support", e);
    return json({
      unavailable: true,
      diagnostic: "AI-UNEXPECTED",
      reply: "Le compagnon IA est momentanément indisponible. Réessaie dans quelques instants.",
    }, 200);
  }
});