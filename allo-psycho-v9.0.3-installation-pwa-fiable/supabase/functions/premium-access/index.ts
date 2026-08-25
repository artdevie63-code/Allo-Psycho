import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"
};

const json=(body:unknown,status=200)=>new Response(
  JSON.stringify(body),
  {status,headers:{...cors,"Content-Type":"application/json"}}
);

const hex=async(s:string)=>Array.from(
  new Uint8Array(
    await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))
  )
).map(b=>b.toString(16).padStart(2,"0")).join("");

const OWNER_CODE_HASH="dea32937e6113a4df2ba9f5c5a2d664c223f5dc0fe09c5b0888e4909a971a365";
const TESTER_CODE_HASH="52b435dba3daabd3093467c8797efbcac24f0248a431c65c5105c3bb61c58a93";
const PERMANENT_UNTIL="2099-12-31T23:59:59.000Z";

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS"){
    return new Response("ok",{headers:cors});
  }

  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth=req.headers.get("Authorization")||"";

    const userClient=createClient(url,anon,{
      global:{headers:{Authorization:auth}}
    });

    const {data:{user}}=await userClient.auth.getUser();
    if(!user)return json({error:"unauthorized"},401);

    const admin=createClient(url,service,{auth:{persistSession:false}});
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"status");

    let {data:ent,error:entErr}=await admin
      .from("premium_entitlements")
      .select("*")
      .eq("user_id",user.id)
      .maybeSingle();

    if(entErr)throw entErr;

    if(!ent){
      const ins=await admin
        .from("premium_entitlements")
        .insert({user_id:user.id})
        .select("*")
        .single();

      if(ins.error)throw ins.error;
      ent=ins.data;
    }

    async function isAdmin(){
      const r=await admin
        .from("admin_users")
        .select("user_id")
        .eq("user_id",user.id)
        .maybeSingle();

      return !r.error&&!!r.data;
    }

    function currentStatus(adminFlag=false){
      const now=new Date();
      const trialEnd=new Date(
        new Date(ent.trial_started_at).getTime()+30*86400000
      );
      const paidEnd=ent.premium_until?new Date(ent.premium_until):null;

      const trial=trialEnd>now;
      const paid=!!paidEnd&&paidEnd>now;
      const source=paid?(ent.source||"premium"):"trial";
      const expiresAt=(paid?paidEnd:trialEnd).toISOString();

      return {
        active:trial||paid,
        source,
        expires_at:expiresAt,
        admin:adminFlag,
        owner:source==="owner"&&adminFlag,
        tester:source==="tester"
      };
    }

    if(action==="status"){
      return json(currentStatus(await isAdmin()));
    }

    if(action==="redeem"){
      const code=String(body.code||"").trim().toUpperCase();
      if(!code)return json({error:"invalid_code"},400);

      const hash=await hex(code);

      // Propriétaire : Premium permanent + Admin.
      if(hash===OWNER_CODE_HASH){
        const up=await admin
          .from("premium_entitlements")
          .update({
            premium_until:PERMANENT_UNTIL,
            source:"owner",
            updated_at:new Date().toISOString()
          })
          .eq("user_id",user.id);

        if(up.error)throw up.error;

        const adm=await admin
          .from("admin_users")
          .upsert({user_id:user.id},{onConflict:"user_id"});

        if(adm.error)throw adm.error;

        ent={...ent,premium_until:PERMANENT_UNTIL,source:"owner"};

        return json({
          active:true,
          source:"owner",
          expires_at:PERMANENT_UNTIL,
          admin:true,
          owner:true
        });
      }

      // Testeur : Premium permanent sans ajout Admin.
      if(hash===TESTER_CODE_HASH){
        const up=await admin
          .from("premium_entitlements")
          .update({
            premium_until:PERMANENT_UNTIL,
            source:"tester",
            updated_at:new Date().toISOString()
          })
          .eq("user_id",user.id);

        if(up.error)throw up.error;

        ent={...ent,premium_until:PERMANENT_UNTIL,source:"tester"};

        return json({
          active:true,
          source:"tester",
          expires_at:PERMANENT_UNTIL,
          admin:await isAdmin(),
          tester:true
        });
      }

      // Codes Premium clients classiques.
      if(!/^AP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)){
        return json({error:"invalid_code"},400);
      }

      const {data:c,error}=await admin
        .from("premium_codes")
        .select("*")
        .eq("code_hash",hash)
        .maybeSingle();

      if(
        error||
        !c||
        c.redeemed_at||
        (c.expires_at&&new Date(c.expires_at)<=new Date())
      ){
        return json({error:"invalid_code"},400);
      }

      const paidEnd=ent.premium_until?new Date(ent.premium_until):null;
      const base=paidEnd&&paidEnd>new Date()?paidEnd:new Date();
      const until=new Date(
        base.getTime()+Number(c.duration_days)*86400000
      );

      const up=await admin
        .from("premium_entitlements")
        .update({
          premium_until:until.toISOString(),
          source:"code",
          updated_at:new Date().toISOString()
        })
        .eq("user_id",user.id);

      if(up.error)throw up.error;

      const red=await admin
        .from("premium_codes")
        .update({
          redeemed_by:user.id,
          redeemed_at:new Date().toISOString()
        })
        .eq("id",c.id)
        .is("redeemed_at",null)
        .select("id")
        .maybeSingle();

      if(red.error||!red.data){
        return json({error:"already_used"},409);
      }

      ent={...ent,premium_until:until.toISOString(),source:"code"};

      return json({
        active:true,
        source:"code",
        expires_at:until.toISOString(),
        admin:await isAdmin()
      });
    }

    return json({error:"unsupported"},400);

  }catch(e){
    console.error("premium-access",e);
    return json({error:"server_error"},500);
  }
});
