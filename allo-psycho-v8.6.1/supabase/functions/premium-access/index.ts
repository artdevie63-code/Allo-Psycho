import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const hex=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await userClient.auth.getUser(); if(!user) return json({error:"unauthorized"},401);
  const admin=createClient(url,service,{auth:{persistSession:false}});
  const body=await req.json().catch(()=>({})); const action=body.action||"status";
  let {data:ent}=await admin.from("premium_entitlements").select("*").eq("user_id",user.id).maybeSingle();
  if(!ent){const ins=await admin.from("premium_entitlements").insert({user_id:user.id}).select("*").single(); if(ins.error) throw ins.error; ent=ins.data;}
  const trialEnd=new Date(new Date(ent.trial_started_at).getTime()+30*86400000); const paidEnd=ent.premium_until?new Date(ent.premium_until):null;
  const status=()=>{const now=new Date();const trial=trialEnd>now;const paid=!!paidEnd&&paidEnd>now;return {active:trial||paid,source:paid?ent.source:"trial",expires_at:(paid?paidEnd:trialEnd).toISOString()}};
  if(action==="status") return json(status());
  if(action==="redeem"){
   const code=String(body.code||"").trim().toUpperCase(); if(!/^AP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({error:"invalid_code"},400);
   const hash=await hex(code); const {data:c,error}=await admin.from("premium_codes").select("*").eq("code_hash",hash).maybeSingle(); if(error||!c||c.redeemed_at||(c.expires_at&&new Date(c.expires_at)<=new Date())) return json({error:"invalid_code"},400);
   const base=paidEnd&&paidEnd>new Date()?paidEnd:new Date(); const until=new Date(base.getTime()+Number(c.duration_days)*86400000);
   const up=await admin.from("premium_entitlements").update({premium_until:until.toISOString(),source:"code",updated_at:new Date().toISOString()}).eq("user_id",user.id); if(up.error) throw up.error;
   const red=await admin.from("premium_codes").update({redeemed_by:user.id,redeemed_at:new Date().toISOString()}).eq("id",c.id).is("redeemed_at",null).select("id").maybeSingle(); if(red.error||!red.data) return json({error:"already_used"},409);
   ent={...ent,premium_until:until.toISOString(),source:"code"}; return json({active:true,source:"code",expires_at:until.toISOString()});
  }
  return json({error:"unsupported"},400);
 }catch(e){console.error(e);return json({error:"server_error"},500)}
});
