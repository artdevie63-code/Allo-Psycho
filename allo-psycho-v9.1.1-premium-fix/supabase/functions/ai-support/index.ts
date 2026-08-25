import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });

const norm = (v = "") =>
  String(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function crisis(message: string) {
  const t = norm(message);

  if (
    /suicide|suicider|me tuer|mourir|en finir|idee[s]? noire[s]?|plus envie de vivre|ne veux plus vivre|mettre fin a mes jours/.test(
      t,
    )
  ) {
    return "suicide";
  }

  if (
    /mutilation|me couper|me taillader|scarifier|sang|saigne|blessure grave|violence|arme|couteau|etrangler|danger immediat/.test(
      t,
    )
  ) {
    return "danger";
  }

  return null;
}

function compactText(value: unknown, max = 1800) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : "";
}

function sameMessage(a: string, b: string) {
  return (
    norm(a).replace(/\s+/g, " ").trim() ===
    norm(b).replace(/\s+/g, " ").trim()
  );
}

function sanitizeHistory(value: unknown, currentMessage: string) {
  if (!Array.isArray(value)) return [];

  const raw = value
    .slice(-18)
    .flatMap((item: any) => {
      const role =
        item?.role === "assistant"
          ? "assistant"
          : item?.role === "user"
            ? "user"
            : null;

      const content = compactText(item?.content);

      return role && content ? [{ role, content }] : [];
    });

  const out: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const item of raw) {
    const previous = out[out.length - 1];

    if (
      previous &&
      previous.role === item.role &&
      sameMessage(previous.content, item.content)
    ) {
      continue;
    }

    out.push(item as { role: "user" | "assistant"; content: string });
  }

  while (
    out.length &&
    out[out.length - 1].role === "user" &&
    sameMessage(out[out.length - 1].content, currentMessage)
  ) {
    out.pop();
  }

  return out.slice(-8);
}

const cleanList = (value: unknown, max = 5) =>
  Array.isArray(value)
    ? value
        .filter((x) => typeof x === "string")
        .map((x) => String(x).slice(0, 180))
        .slice(0, max)
    : [];

function sanitizeMemory(value: any) {
  if (!value || typeof value !== "object") return {};

  return {
    themes: cleanList(value.themes, 5),
    goals: cleanList(value.goals, 4),
    helpful_tools: cleanList(value.helpful_tools, 4),
    unhelpful_tools: cleanList(value.unhelpful_tools, 4),
    recurring_patterns: cleanList(value.recurring_patterns, 4),
    open_threads: cleanList(value.open_threads, 3),
    last_intervention:
      typeof value.last_intervention === "string"
        ? value.last_intervention.slice(0, 220)
        : "",
  };
}

function significantWords(text: string) {
  const stop = new Set([
    "avec",
    "dans",
    "pour",
    "mais",
    "donc",
    "comme",
    "plus",
    "moins",
    "tout",
    "tous",
    "toute",
    "cette",
    "cela",
    "elle",
    "elles",
    "nous",
    "vous",
    "leur",
    "leurs",
    "une",
    "des",
    "les",
    "que",
    "qui",
    "quoi",
    "dont",
    "est",
    "sont",
    "etre",
    "avoir",
    "fait",
    "faire",
    "peux",
    "peut",
    "sur",
    "pas",
    "mon",
    "mes",
    "ton",
    "tes",
    "son",
    "ses",
    "aux",
    "par",
    "ici",
    "alors",
  ]);

  return new Set(
    norm(text)
      .replace(/[^a-z0-9à-ÿ\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stop.has(word))
      .slice(0, 120),
  );
}

function similarity(a: string, b: string) {
  const A = significantWords(a);
  const B = significantWords(b);

  if (!A.size || !B.size) return 0;

  let intersection = 0;

  for (const word of A) {
    if (B.has(word)) intersection++;
  }

  return intersection / Math.max(1, Math.min(A.size, B.size));
}

function looksRepetitive(
  reply: string,
  history: Array<{ role: string; content: string }>,
) {
  const recentAssistant = history
    .filter((x) => x.role === "assistant")
    .slice(-4);

  if (!recentAssistant.length) return false;

  const normalizedReply = norm(reply).replace(/\s+/g, " ").trim();

  for (const item of recentAssistant) {
    const old = norm(item.content).replace(/\s+/g, " ").trim();

    if (normalizedReply === old) return true;

    if (
      normalizedReply.length > 100 &&
      old.length > 100 &&
      normalizedReply.slice(0, 90) === old.slice(0, 90)
    ) {
      return true;
    }

    if (similarity(reply, item.content) >= 0.64) {
      return true;
    }
  }

  return false;
}

function recentAssistantQuestions(
  history: Array<{ role: string; content: string }>,
) {
  return history
    .filter((x) => x.role === "assistant")
    .slice(-4)
    .flatMap((x) => String(x.content).split(/(?<=[?])\s+/))
    .filter((x) => x.includes("?"))
    .map((x) => x.slice(0, 240));
}

type ModelResult = {
  parsed: any | null;
  status: number | null;
  code: string;
  detail: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return json({ error: "unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const groqKey = Deno.env.get("GROQ_API_KEY")!;

    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      !serviceRoleKey ||
      !groqKey
    ) {
      console.error("ai-support: missing server configuration (GROQ_API_KEY)");

      return json(
        {
          unavailable: true,
          diagnostic: "CFG",
          reply:
            "Le compagnon IA n’est pas correctement configuré côté serveur (CFG).",
        },
        200,
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));

    const message =
      typeof body.message === "string"
        ? body.message.trim().slice(0, 4000)
        : "";

    if (!message) {
      return json({ error: "empty_message" }, 400);
    }

    // Sécurité avant tout verrou Premium.
    const danger = crisis(message);

    if (danger === "suicide") {
      return json({
        crisis: "suicide",
        reply:
          "Je prends ce que tu dis au sérieux. Contacte maintenant le 3114. Si le danger est immédiat ou si tu es déjà blessé·e, appelle le 15 ou le 112.",
      });
    }

    if (danger === "danger") {
      return json({
        crisis: "danger",
        reply:
          "Ta sécurité passe avant la conversation. En cas de violence, blessure grave, mutilation ou saignement important, appelle le 15 ou le 112 ; si une intervention de police est nécessaire, appelle le 17.",
      });
    }

    // Vérification Premium.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    let {
      data: entitlement,
      error: entitlementError,
    } = await admin
      .from("premium_entitlements")
      .select("trial_started_at,premium_until")
      .eq("user_id", user.id)
      .maybeSingle();

    if (entitlementError) {
      throw entitlementError;
    }

    // Le chat peut être ouvert avant l'écran Premium.
    if (!entitlement) {
      const inserted = await admin
        .from("premium_entitlements")
        .insert({
          user_id: user.id,
        })
        .select("trial_started_at,premium_until")
        .single();

      if (inserted.error) {
        throw inserted.error;
      }

      entitlement = inserted.data;
    }

    const now = Date.now();

    const trialUntil = entitlement?.trial_started_at
      ? new Date(entitlement.trial_started_at).getTime() + 30 * 86400000
      : 0;

    const paidUntil = entitlement?.premium_until
      ? new Date(entitlement.premium_until).getTime()
      : 0;

    // HTTP 200 volontaire : Premium requis n'est pas une panne serveur.
    if (!(trialUntil > now || paidUntil > now)) {
      return json({
        premium_required: true,
      });
    }

    const context =
      body.context && typeof body.context === "object" ? body.context : {};

    const safeContext = {
      response_style: String(context.response_style || "doux").slice(0, 30),
      goal: String(context.goal || "apaisement").slice(0, 160),
      routine_preference: String(
        context.routine_preference || "souple",
      ).slice(0, 30),
      recent_mood:
        typeof context.recent_mood === "string"
          ? context.recent_mood.slice(0, 40)
          : null,
      tcc_mode: context.tcc_mode === true,
      short_mode: context.short_mode === true,
    };

    const recentHistory = sanitizeHistory(body.recent_history, message);
    const localMemory = sanitizeMemory(body.local_memory);
    const questionsToAvoid = recentAssistantQuestions(recentHistory);

    const systemPrompt = `
Tu es le compagnon psychologique IA d’Allo Psycho, conçu par une psychologue clinicienne et psychothérapeute.

Tu es un outil numérique de soutien. Tu n’es pas un humain et tu ne remplaces pas un professionnel de santé.
Aucun diagnostic, aucune prescription, aucune modification de traitement.

PRIORITÉ ABSOLUE — DERNIER MESSAGE
Le dernier message utilisateur est toujours la demande à traiter maintenant.
Réponds d’abord à ce qu’il vient réellement de dire.
L’historique sert à la continuité, jamais à écraser le message courant.
La mémoire est secondaire et peut être incomplète.

COMPRÉHENSION DU TOUR
- Question directe : réponds d’abord à la question.
- Réponse courte comme « oui », « non », « je ne sais pas », « ça ne m’aide pas » : rattache-la au dernier tour assistant.
- Changement de sujet : suis immédiatement le nouveau sujet.
- Besoin d’être entendu : n’impose pas automatiquement un exercice.
- Demande d’outil concret : donne un outil concret.
- Ne termine pas systématiquement par une question.

STYLE
Chaleureux, naturel, adulte, précis.
Pas de validation automatique ou creuse.
Évite les ouvertures répétitives comme :
« je t’entends », « je suis là », « ça semble difficile », « on peut commencer simplement ».
Humour léger uniquement si le contexte s’y prête.
Pas de jargon non expliqué.

${safeContext.short_mode
  ? "MODE COURT : 1 à 3 courts paragraphes."
  : "FORMAT HABITUEL : 2 à 5 courts paragraphes utiles et naturels."}

ADAPTATION
Identifie silencieusement le besoin dominant :
comprendre / soutien / décider / agir / restructuration cognitive / régulation / limite relationnelle / résolution de problème.
Choisis UNE intervention principale.

TCC
Utilise la TCC lorsqu’il s’agit surtout d’une croyance, d’une prédiction anxieuse, d’une interprétation, de culpabilité, d’autocritique, de lecture de pensée, de pensée tout-ou-rien ou de rumination cognitive.

Si tcc_mode=true, avance dans cet ordre :
1 Situation observable
2 Pensée automatique exacte
3 Émotion + intensité
4 Faits qui semblent soutenir
5 Faits qui nuancent / informations manquantes
6 Biais éventuel expliqué simplement
7 Pensée alternative crédible
8 Action / expérience comportementale

Si certaines étapes sont déjà connues, continue à la première étape manquante.
Ne recommence pas depuis le début.

AUTRES APPROCHES
ACT / défusion si la lutte avec une pensée entretient le problème.
Activation comportementale en cas de retrait ou démotivation.
Résolution de problème pour une situation concrète.
Entretien motivationnel en cas d’ambivalence.
Assertivité pour les limites relationnelles.
Auto-compassion pour l’autocritique forte.
Ancrage / régulation pour une activation aiguë.

Ne propose pas automatiquement respiration, journal, méditation ou « petit pas ».
La respiration n’est proposée que si elle correspond réellement au besoin ou si elle est demandée.

ANTI-BOUCLE
Ne répète pas une question déjà posée récemment.
Ne repropose pas le même exercice, la même métaphore ou le même conseil si cela n’a pas aidé.
Si une intervention échoue, explore pourquoi ou change d’approche.
Chaque réponse doit apporter quelque chose de nouveau.

Questions récentes à ne pas répéter :
${JSON.stringify(questionsToAvoid)}

Contexte minimal :
${JSON.stringify(safeContext)}

Mémoire de travail secondaire :
${JSON.stringify(localMemory)}

IMPORTANT JSON
Réponds uniquement en JSON valide.

Format obligatoire :
{
  "reply":"texte destiné à l’utilisateur",
  "intervention":"nom court de l’intervention",
  "memory":{
    "themes":[],
    "goals":[],
    "helpful_tools":[],
    "unhelpful_tools":[],
    "recurring_patterns":[],
    "open_threads":[],
    "last_intervention":""
  }
}
`;

    function parseContent(raw: unknown) {
      if (typeof raw !== "string" || !raw.trim()) {
        return null;
      }

      try {
        return JSON.parse(
          raw
            .replace(/^```json\s*/i, "")
            .replace(/\s*```$/i, ""),
        );
      } catch {
        // Si le modèle a répondu utilement mais pas en JSON strict,
        // on conserve la réponse au lieu de la jeter.
        return {
          reply: raw.trim(),
          intervention: "conversation",
          memory: localMemory,
        };
      }
    }

    async function callGroq(
      extraInstruction = "",
    ): Promise<ModelResult> {
      const messages = [
        {
          role: "system",
          content:
            systemPrompt +
            (extraInstruction ? `\n\n${extraInstruction}` : ""),
        },
        ...recentHistory.slice(-6),
        {
          role: "user",
          content: message,
        },
      ];

      /*
       * Groq Free / Qwen 3.6
       * - aucun basculement vers une offre payante ;
       * - raisonnement désactivé pour économiser le quota gratuit ;
       * - JSON Object Mode conservé.
       */
      const payload: any = {
        model: "qwen/qwen3.6-27b",
        messages,
        temperature: 0.55,
        top_p: 0.9,
        max_completion_tokens: safeContext.short_mode ? 600 : 900,
        response_format: {
          type: "json_object",
        },
        reasoning_effort: "none",
        reasoning_format: "hidden",
        stream: false,
      };

      try {
        const response = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify(payload),
          },
        );

        if (!response.ok) {
          const detail = (await response.text()).slice(0, 700);

          console.error(
            "Groq error",
            response.status,
            detail,
          );

          return {
            parsed: null,
            status: response.status,
            code: `GQ-${response.status}`,
            detail,
          };
        }

        const data = await response.json();
        const raw = data?.choices?.[0]?.message?.content;
        const parsed = parseContent(raw);

        if (!parsed) {
          console.warn("Groq empty content");

          return {
            parsed: null,
            status: 200,
            code: "GQ-EMPTY",
            detail: "empty_content",
          };
        }

        return {
          parsed,
          status: 200,
          code: "OK",
          detail: "",
        };
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : "network_error";

        console.error(
          "Groq network error",
          detail,
        );

        return {
          parsed: null,
          status: null,
          code: "GQ-NET",
          detail,
        };
      }
    }

    async function generate(
      extraInstruction = "",
    ) {
      return await callGroq(extraInstruction);
    }

    function retryable(result: ModelResult){
      return (
        result.code==="GQ-EMPTY" ||
        result.code==="GQ-NET" ||
        result.code==="GQ-500" ||
        result.code==="GQ-502" ||
        result.code==="GQ-503"
      );
    }

    function diagnosticReply(
      result: ModelResult,
    ) {
      switch (result.code) {
        case "GQ-400":
          return "Le fournisseur IA gratuit a refusé la requête (GQ-400).";
        case "GQ-401":
          return "Le compagnon IA ne peut pas s’authentifier auprès de Groq (GQ-401). Vérifie GROQ_API_KEY dans les secrets Supabase.";
        case "GQ-403":
          return "L’accès au modèle IA gratuit est refusé pour ce compte Groq (GQ-403).";
        case "GQ-404":
          return "Le modèle IA gratuit configuré n’est momentanément pas disponible (GQ-404).";
        case "GQ-413":
          return "Le contexte envoyé au compagnon IA est trop volumineux (GQ-413).";
        case "GQ-422":
          return "Groq a refusé un paramètre de la requête (GQ-422).";
        case "GQ-429":
          return "Le quota gratuit Groq est momentanément atteint (GQ-429). Réessaie après le renouvellement du quota.";
        case "GQ-500":
        case "GQ-502":
        case "GQ-503":
          return `Le fournisseur IA gratuit rencontre une difficulté temporaire (${result.code}). Ta session reste active.`;
        case "GQ-EMPTY":
          return "Le fournisseur IA a répondu sans contenu exploitable (GQ-EMPTY). Ta session reste active.";
        case "GQ-NET":
          return "La fonction Supabase n’a pas réussi à joindre le fournisseur IA gratuit (GQ-NET). Ta session reste active.";
        default:
          return `Le compagnon IA rencontre une difficulté technique (${result.code || "GQ-UNKNOWN"}). Ta session reste active.`;
      }
    }

    // Première tentative.
    let result = await generate();
    let parsed = result.parsed;

    // Le mode JSON peut occasionnellement
    // retourner un contenu vide : une seconde tentative est prévue.
    if (
      (
        !parsed ||
        typeof parsed.reply !== "string" ||
        !parsed.reply.trim()
      ) &&
      retryable(result)
    ) {
      const retryResult = await generate(
        "La tentative précédente n’a pas produit de réponse exploitable. Produis maintenant un JSON complet, valide et non vide.",
      );

      if (retryResult.parsed) {
        result = retryResult;
        parsed = retryResult.parsed;
      } else {
        result = retryResult;
      }
    }

    if (
      !parsed ||
      typeof parsed.reply !== "string" ||
      !parsed.reply.trim()
    ) {
      return json({
        unavailable: true,
        diagnostic: result.code,
        reply: diagnosticReply(result),
      });
    }

    // Anti-répétition serveur.
    if (
      looksRepetitive(
        parsed.reply,
        recentHistory,
      )
    ) {
      const recentReplies = recentHistory
        .filter((x) => x.role === "assistant")
        .slice(-3)
        .map((x) => x.content.slice(0, 500));

      const retryResult = await generate(
        `ANTI-BOUCLE RENFORCÉ :
La première réponse ressemble trop aux réponses récentes.
Change franchement d’angle, d’ouverture et d’intervention.
Ne répète ni la même question ni le même exercice.

Réponses à éviter :
${JSON.stringify(recentReplies)}`,
      );

      const retry = retryResult.parsed;

      if (
        retry &&
        typeof retry.reply === "string" &&
        retry.reply.trim()
      ) {
        parsed = retry;
      }
    }

    const reply = String(parsed.reply)
      .trim()
      .slice(0, 6500);

    const intervention =
      typeof parsed.intervention === "string"
        ? parsed.intervention.slice(0, 120)
        : "conversation";

    const nextMemory = sanitizeMemory(
      parsed.memory || localMemory,
    );

    if (!nextMemory.last_intervention) {
      nextMemory.last_intervention =
        intervention;
    }

    return json({
      reply,
      intervention,
      memory: nextMemory,
    });
  } catch (error) {
    console.error(
      "ai-support fatal",
      error instanceof Error
        ? error.message
        : "unknown",
    );

    return json({
      unavailable: true,
      diagnostic: "EDGE",
      reply:
        "La fonction IA rencontre une difficulté côté Supabase (EDGE). Ta session reste active.",
    });
  }
});
