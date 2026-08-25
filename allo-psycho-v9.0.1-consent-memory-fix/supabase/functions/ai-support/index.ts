import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"
};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{
  status:s,
  headers:{...cors,"Content-Type":"application/json"}
});
const norm=(v="")=>String(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

function crisis(m:string){
  const t=norm(m);
  if(/suicide|suicider|me tuer|mourir|en finir|idee[s]? noire[s]?|plus envie de vivre|ne veux plus vivre|mettre fin a mes jours/.test(t))return"suicide";
  if(/mutilation|me couper|me taillader|scarifier|sang|saigne|blessure grave|violence|arme|couteau|etrangler|danger immediat/.test(t))return"danger";
  return null;
}

function compactText(v:any,max=1800){
  return typeof v==="string"?v.trim().replace(/\s+/g," ").slice(0,max):"";
}

function sameMessage(a:string,b:string){
  return norm(a).replace(/\s+/g," ").trim()===norm(b).replace(/\s+/g," ").trim();
}

function history(v:any,current:string){
  if(!Array.isArray(v))return[];
  const raw=v.slice(-18).flatMap((x:any)=>{
    const role=x?.role==="assistant"?"assistant":x?.role==="user"?"user":null;
    const content=compactText(x?.content);
    return role&&content?[{role,content}]:[];
  });

  // Supprime les doublons adjacents exacts.
  const out:any[]=[];
  for(const item of raw){
    const prev=out[out.length-1];
    if(prev && prev.role===item.role && sameMessage(prev.content,item.content))continue;
    out.push(item);
  }

  // Le message courant doit apparaître UNE SEULE FOIS, en dernier.
  while(out.length && out[out.length-1].role==="user" && sameMessage(out[out.length-1].content,current)){
    out.pop();
  }
  return out.slice(-12);
}

const list=(v:any,n=5)=>Array.isArray(v)
  ?v.filter((x:any)=>typeof x==="string").map((x:string)=>x.slice(0,180)).slice(0,n)
  :[];

function memory(v:any){
  if(!v||typeof v!=="object")return{};
  return{
    themes:list(v.themes,5),
    goals:list(v.goals,4),
    helpful_tools:list(v.helpful_tools,4),
    unhelpful_tools:list(v.unhelpful_tools,4),
    recurring_patterns:list(v.recurring_patterns,4),
    open_threads:list(v.open_threads,3),
    last_intervention:typeof v.last_intervention==="string"?v.last_intervention.slice(0,220):""
  };
}

function words(text:string){
  const stop=new Set(["avec","dans","pour","mais","donc","comme","plus","moins","tout","tous","toute","cette","cela","elle","elles","nous","vous","leur","leurs","une","des","les","que","qui","quoi","dont","est","sont","etre","avoir","fait","faire","peux","peut","sur","pas","mon","mes","ton","tes","son","ses","aux","par","ici","alors"]);
  return new Set(
    norm(text)
      .replace(/[^a-z0-9à-ÿ\s]/g," ")
      .split(/\s+/)
      .filter(w=>w.length>3&&!stop.has(w))
      .slice(0,120)
  );
}

function similarity(a:string,b:string){
  const A=words(a),B=words(b);
  if(!A.size||!B.size)return 0;
  let inter=0;
  for(const w of A)if(B.has(w))inter++;
  return inter/Math.max(1,Math.min(A.size,B.size));
}

function looksRepetitive(reply:string,hist:any[]){
  const assistants=hist.filter(x=>x.role==="assistant").slice(-4);
  if(!assistants.length)return false;
  const nr=norm(reply).replace(/\s+/g," ").trim();

  for(const x of assistants){
    const old=norm(x.content).replace(/\s+/g," ").trim();
    if(nr===old)return true;
    if(nr.slice(0,90)===old.slice(0,90) && nr.length>100 && old.length>100)return true;
    if(similarity(reply,x.content)>=0.64)return true;
  }
  return false;
}

function lastAssistantQuestions(hist:any[]){
  return hist
    .filter(x=>x.role==="assistant")
    .slice(-4)
    .flatMap(x=>String(x.content).split(/(?<=[?])\s+/))
    .filter(x=>x.includes("?"))
    .map(x=>x.slice(0,240));
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});

  try{
    const auth=req.headers.get("Authorization");
    if(!auth)return json({error:"unauthorized"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const key=Deno.env.get("DEEPSEEK_API_KEY")!;
    if(!url||!anon||!service||!key)return json({error:"server_configuration"},500);

    const scoped=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await scoped.auth.getUser();
    if(!user)return json({error:"unauthorized"},401);

    const body=await req.json().catch(()=>({}));
    const message=typeof body.message==="string"?body.message.trim().slice(0,4000):"";
    if(!message)return json({error:"empty_message"},400);

    // Sécurité AVANT Premium.
    const c=crisis(message);
    if(c==="suicide")return json({
      crisis:"suicide",
      reply:"Je prends ce que tu dis au sérieux. Contacte maintenant le 3114. Si le danger est immédiat ou si tu es déjà blessé·e, appelle le 15 ou le 112."
    });
    if(c==="danger")return json({
      crisis:"danger",
      reply:"Ta sécurité passe avant la conversation. En cas de violence, blessure grave, mutilation ou saignement important, appelle le 15 ou le 112 ; si une intervention de police est nécessaire, appelle le 17."
    });

    const admin=createClient(url,service,{auth:{persistSession:false}});
    let {data:e,error:entError}=await admin
      .from("premium_entitlements")
      .select("trial_started_at,premium_until")
      .eq("user_id",user.id)
      .maybeSingle();

    if(entError)throw entError;

    // Le chat peut être ouvert avant la page Premium :
    // crée l'entitlement et démarre l'essai ici si nécessaire.
    if(!e){
      const ins=await admin
        .from("premium_entitlements")
        .insert({user_id:user.id})
        .select("trial_started_at,premium_until")
        .single();

      if(ins.error)throw ins.error;
      e=ins.data;
    }

    const now=Date.now();
    const trial=e?.trial_started_at
      ?new Date(e.trial_started_at).getTime()+30*86400000
      :0;
    const paid=e?.premium_until
      ?new Date(e.premium_until).getTime()
      :0;

    // Important : 200 et non 402.
    // Sinon supabase-js peut présenter Premium requis comme une panne réseau.
    if(!(trial>now||paid>now)){
      return json({premium_required:true});
    }

    const ctx=body.context&&typeof body.context==="object"?body.context:{};
    const safe={
      response_style:String(ctx.response_style||"doux").slice(0,30),
      goal:String(ctx.goal||"apaisement").slice(0,160),
      routine_preference:String(ctx.routine_preference||"souple").slice(0,30),
      recent_mood:typeof ctx.recent_mood==="string"?ctx.recent_mood.slice(0,40):null,
      tcc_mode:ctx.tcc_mode===true,
      short_mode:ctx.short_mode===true
    };

    const hist=history(body.recent_history,message);
    const mem=memory(body.local_memory);
    const recentQuestions=lastAssistantQuestions(hist);

    const system=`Tu es le compagnon psychologique IA d’Allo Psycho, conçu par une psychologue clinicienne et psychothérapeute. Tu es un outil numérique de soutien, pas un humain ni un professionnel qui évalue directement la personne. Aucun diagnostic, aucune prescription et aucune modification de traitement.

RÈGLE N°1 — DERNIER MESSAGE :
Le DERNIER message utilisateur est la demande à traiter maintenant. Réponds d’abord à ce qu’il vient réellement de dire. L’historique sert uniquement à comprendre les références et la continuité. La mémoire peut être incomplète ou ancienne : si elle contredit le dernier message, ignore-la.

RÈGLE N°2 — COMPRENDRE LE TYPE DE TOUR :
- S’il pose une question directe : réponds à la question avant de proposer une exploration.
- S’il répond à ta question précédente : UTILISE sa réponse et avance ; ne repose pas la même question.
- S’il dit « oui », « non », « ça ne m’aide pas », « je ne sais pas », ou une réponse courte : rattache-la au dernier tour assistant et adapte-toi.
- S’il change de sujet : suis le nouveau sujet sans le ramener de force à l’ancien.
- S’il veut surtout être entendu : n’impose pas immédiatement un exercice.
- S’il demande un outil concret : donne un outil concret.
- Une question n’est pas obligatoire à chaque réponse.

STYLE :
Chaleureux, naturel, adulte, précis. Pas de validation automatique ou creuse. Évite de commencer plusieurs réponses par « je t’entends », « je suis là », « ça semble difficile », « on peut commencer simplement ». Pas de jargon non expliqué. Humour léger uniquement si le contexte s’y prête.
${safe.short_mode?"Mode réponses courtes ACTIVÉ : 1 à 3 courts paragraphes, très peu de détour.":"Réponse habituelle : 2 à 5 courts paragraphes, suffisamment développés pour être utiles."}

ADAPTATION :
Avant de répondre, identifie silencieusement le besoin dominant du tour : comprendre / être soutenu / décider / agir / restructurer une pensée / réguler une activation / poser une limite / résoudre un problème.
Choisis ensuite UNE intervention principale. Ne mélange pas cinq techniques dans la même réponse.

TCC :
Utilise prioritairement la TCC pour une croyance, une prédiction anxieuse, une interprétation, culpabilité, autocritique, peur de l’échec, pensée tout-ou-rien, lecture de pensée ou rumination fondée sur une croyance.
Si tcc_mode=true, garde un guidage TCC étape par étape :
1 Situation observable
2 Pensée automatique exacte
3 Émotion + intensité
4 Faits qui semblent soutenir
5 Faits qui nuancent / informations manquantes
6 Biais éventuel expliqué simplement
7 Pensée alternative crédible
8 Action / expérience comportementale
Si l’utilisateur a déjà donné plusieurs étapes, reconnais-les et passe à la PREMIÈRE étape manquante. Ne lui fais pas recommencer depuis le début.

AUTRES APPROCHES :
ACT/défusion si la lutte contre une pensée non vérifiable entretient le problème ; activation comportementale pour retrait/démotivation ; résolution de problème pour un problème concret ; entretien motivationnel pour ambivalence ; assertivité pour limites relationnelles ; auto-compassion si autocritique forte ; ancrage/régulation pour activation aiguë.
Ne propose pas automatiquement respiration, journal, méditation ou « petit pas ». N’utilise la respiration que si elle correspond réellement au besoin du moment ou si elle est demandée.

ANTI-BOUCLE :
Ne répète pas une question déjà posée récemment. Ne repropose pas le même exercice, la même métaphore ou le même conseil si l’utilisateur n’a pas indiqué que cela l’aide. Si une intervention n’a pas marché, explore POURQUOI ou change d’approche. Chaque réponse doit apporter une information, une distinction, une formulation ou une étape nouvelle.
Questions assistant récentes à ne pas répéter telles quelles : ${JSON.stringify(recentQuestions)}

CONTEXTE TECHNIQUE MINIMAL — ce ne sont PAS des paroles de l’utilisateur :
${JSON.stringify(safe)}

MÉMOIRE DE TRAVAIL LOCALE — indication secondaire, potentiellement incomplète :
${JSON.stringify(mem)}

SORTIE :
Réponds uniquement en JSON valide exactement sous cette forme :
{"reply":"réponse destinée à l’utilisateur","intervention":"nom très court de l’intervention utilisée","memory":{"themes":[],"goals":[],"helpful_tools":[],"unhelpful_tools":[],"recurring_patterns":[],"open_threads":[],"last_intervention":""}}
La propriété reply doit pouvoir être affichée telle quelle.`;

    async function generate(extra=""){
      const messages:any[]=[
        {role:"system",content:system+(extra?`\n\n${extra}`:"")},
        ...hist,
        {role:"user",content:message}
      ];

      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),26000);

      let r:Response;
      try{
        r=await fetch("https://api.deepseek.com/chat/completions",{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":`Bearer ${key}`
          },
          body:JSON.stringify({
            model:"deepseek-v4-pro",
            messages,
            thinking:{type:"enabled"},
            reasoning_effort:"high",
            max_tokens:1800,
            response_format:{type:"json_object"},
            stream:false
          }),
          signal:controller.signal
        });
      }catch(e){
        console.error("DeepSeek request",e instanceof Error?e.message:"unknown");
        return null;
      }finally{
        clearTimeout(timeout);
      }

      if(!r.ok){
        console.error("DeepSeek",r.status,(await r.text()).slice(0,300));
        return null;
      }

      const d=await r.json();
      const raw=d?.choices?.[0]?.message?.content;
      if(typeof raw!=="string"||!raw.trim())return null;

      try{
        return JSON.parse(raw.replace(/^```json\s*/i,"").replace(/\s*```$/i,""));
      }catch{
        return {reply:raw,memory:mem,intervention:"conversation"};
      }
    }

    let parsed=await generate();

    // JSON Output peut occasionnellement revenir vide ; une seule seconde tentative.
    if(!parsed || typeof parsed?.reply!=="string" || !parsed.reply.trim()){
      parsed=await generate("La tentative précédente n’a pas produit de réponse exploitable. Réponds maintenant avec un JSON complet, concis et non vide.");
    }

    if(!parsed || typeof parsed?.reply!=="string" || !parsed.reply.trim()){
      return json({unavailable:true,reply:"Le compagnon IA est temporairement indisponible. Ta session reste active ; réessaie simplement dans quelques instants."});
    }

    // Anti-répétition côté serveur : si la réponse ressemble trop aux derniers
    // tours assistant, on force UNE régénération avec une autre intervention.
    if(looksRepetitive(parsed.reply,hist)){
      const old=hist.filter(x=>x.role==="assistant").slice(-3).map(x=>x.content.slice(0,500));
      const retry=await generate(
        `ANTI-BOUCLE RENFORCÉ : ton premier brouillon ressemblait trop aux réponses récentes. Change clairement d’angle et de formulation. Ne reprends ni la même ouverture, ni la même question, ni le même exercice. Réponses récentes à éviter : ${JSON.stringify(old)}`
      );
      if(retry && typeof retry.reply==="string" && retry.reply.trim()){
        parsed=retry;
      }
    }

    const text=String(parsed.reply).trim().slice(0,6500);
    const intervention=typeof parsed.intervention==="string"
      ?parsed.intervention.slice(0,120)
      :"conversation";

    const nextMemory=memory(parsed?.memory||mem);
    if(!nextMemory.last_intervention){
      nextMemory.last_intervention=intervention;
    }

    return json({
      reply:text,
      memory:nextMemory,
      intervention
    });

  }catch(e){
    console.error("ai-support",e instanceof Error?e.message:"unknown");
    return json({unavailable:true,reply:"Le compagnon IA rencontre une difficulté technique temporaire. Ta session reste active ; réessaie sans te reconnecter."});
  }
});
