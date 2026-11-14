import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
function crisisType(message: string) {
  const t = normalize(message);
  if (/suicide|suicider|me tuer|mourir|en finir|plus envie de vivre|ne veux plus vivre|mettre fin a mes jours/.test(t)) return "suicide";
  if (/automutil|me couper|me taillader|scarifier|danger immediat|arme|couteau|etrangler/.test(t)) return "danger";
  return null;
}
async function premiumStatus(req: Request) {
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!base || !anon) return { active: false, reason: "supabase_env_missing" };
  const auth = req.headers.get("Authorization") || "";
  const r = await fetch(base + "/functions/v1/premium-access", {
    method: "POST",
    headers: { "Authorization": auth, "apikey": anon, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "status" }),
  });
  let data: any = null;
  try { data = await r.json(); } catch (_) {}
  if (!r.ok) return { active: false, reason: "premium_http_" + r.status, detail: data };
  return { active: data?.active === true, source: data?.source || null, expires_at: data?.expires_at || null };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const message = cleanText(body?.message, 3000);
    if (!message) return json({ error: "message_required" }, 400);
    const crisis = crisisType(message);
    if (crisis === "suicide") return json({ reply: "Je prends ce que tu dis au sérieux. Si tu risques de te faire du mal maintenant, appelle immédiatement le 15 ou le 112, ou rends-toi aux urgences. Si tu es en France, tu peux aussi appeler le 3114, 24h/24 et 7j/7. Reste si possible avec une personne de confiance et éloigne-toi de ce qui pourrait te blesser.", memory: body?.local_memory && typeof body.local_memory === "object" ? body.local_memory : {} });
    if (crisis === "danger") return json({ reply: "Ta sécurité passe en premier. Si le danger est immédiat, appelle le 15 ou le 112. Éloigne-toi si possible des objets ou situations dangereuses et rejoins une personne de confiance.", memory: body?.local_memory && typeof body.local_memory === "object" ? body.local_memory : {} });
    const premium = await premiumStatus(req);
    if (!premium.active) return json({ premium_required: true, source: premium.source || null, expires_at: premium.expires_at || null });

    const apiKey = Deno.env.get("MISTRAL_API_KEY");
    const model = Deno.env.get("MISTRAL_MODEL") || "mistral-small-2603";
    if (!apiKey) return json({ unavailable: true, diagnostic: "AI-MISTRAL-KEY", reply: "Le compagnon IA est configuré, mais sa clé Mistral n’est pas encore disponible côté serveur." });

    const context = body?.context && typeof body.context === "object" ? body.context : {};
    const history = Array.isArray(body?.recent_history) ? body.recent_history.slice(-16).filter((x: any) => x && (x.role === "user" || x.role === "assistant")).map((x: any) => ({ role: x.role, content: cleanText(x.content, 1800) })).filter((x: any) => x.content) : [];
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
      "Ne demande jamais de données d’identité inutiles.",
    ].filter(Boolean).join("\n");

    const response = await fetch("https://api.eu.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...history, { role: "user", content: message }], temperature: 0.55, max_tokens: shortMode ? 450 : 850 }),
    });

    const raw = await response.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch (_) {}
    if (!response.ok) {
      console.error("Mistral HTTP", response.status, raw.slice(0, 1200));
      return json({ unavailable: true, diagnostic: "AI-MISTRAL-" + response.status, reply: "Le compagnon IA est momentanément indisponible. Réessaie dans quelques instants." });
    }
    const content = data?.choices?.[0]?.message?.content;
    const reply = Array.isArray(content) ? content.map((x: any) => typeof x?.text === "string" ? x.text : "").join("\n").trim() : cleanText(content, 12000);
    if (!reply) return json({ unavailable: true, diagnostic: "AI-EMPTY", reply: "Je n’ai pas réussi à produire une réponse suffisamment claire. Reformule simplement ton dernier message." });

    return json({ reply, memory: body?.local_memory && typeof body.local_memory === "object" ? body.local_memory : {}, model, premium_source: premium.source || null });
  } catch (e) {
    console.error("ai-support", e);
    return json({ unavailable: true, diagnostic: "AI-UNEXPECTED", reply: "Le compagnon IA est momentanément indisponible. Réessaie dans quelques instants." }, 200);
  }
});
