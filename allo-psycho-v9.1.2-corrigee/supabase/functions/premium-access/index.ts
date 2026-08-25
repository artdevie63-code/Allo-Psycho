import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION="9.1.2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"
};

const json=(body:unknown,status=200)=>new Response(
  JSON.stringify(body),
  {
    status,
    headers:{
      ...cors,
      "Content-Type":"application/json"
    }
  }
);

const sha256=async(value:string)=>{
  const bytes=new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value)
    )
  );

  return Array.from(bytes)
    .map(b=>b.toString(16).padStart(2,"0"))
    .join("");
};

const OWNER_CODE_HASH=
  "dea32937e6113a4df2ba9f5c5a2d664c223f5dc0fe09c5b0888e4909a971a365";

const TESTER_CODE_HASH=
  "52b435dba3daabd3093467c8797efbcac24f0248a431c65c5105c3bb61c58a93";

const PERMANENT_UNTIL=
  "2099-12-31T23:59:59.000Z";

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS"){
    return new Response("ok",{headers:cors});
  }

  try{
    const url=Deno.env.get("SUPABASE_URL");
    const anon=Deno.env.get("SUPABASE_ANON_KEY");
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const auth=req.headers.get("Authorization")||"";

    if(!url||!anon||!service){
      return json({
        ok:false,
        error:"server_configuration",
        diagnostic:"PA-CFG",
        function_version:VERSION
      });
    }

    const userClient=createClient(
      url,
      anon,
      {
        global:{
          headers:{
            Authorization:auth
          }
        }
      }
    );

    const {
      data:{user},
      error:userError
    }=await userClient.auth.getUser();

    if(userError||!user){
      return json({
        ok:false,
        error:"unauthorized",
        diagnostic:"PA-AUTH",
        function_version:VERSION
      });
    }

    const admin=createClient(
      url,
      service,
      {
        auth:{
          persistSession:false
        }
      }
    );

    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"status");

    let {
      data:ent,
      error:entError
    }=await admin
      .from("premium_entitlements")
      .select("*")
      .eq("user_id",user.id)
      .maybeSingle();

    if(entError){
      console.error("premium entitlement select",entError);
      return json({
        ok:false,
        error:"entitlement_read_failed",
        diagnostic:"PA-ENT-READ",
        detail:entError.message,
        function_version:VERSION
      });
    }

    if(!ent){
      const created=await admin
        .from("premium_entitlements")
        .insert({
          user_id:user.id
        })
        .select("*")
        .single();

      if(created.error){
        console.error("premium entitlement create",created.error);
        return json({
          ok:false,
          error:"entitlement_create_failed",
          diagnostic:"PA-ENT-CREATE",
          detail:created.error.message,
          function_version:VERSION
        });
      }

      ent=created.data;
    }

    async function adminStatus(){
      const result=await admin
        .from("admin_users")
        .select("user_id")
        .eq("user_id",user.id)
        .maybeSingle();

      if(result.error){
        console.warn("admin status",result.error.message);
        return false;
      }

      return !!result.data;
    }

    function statusPayload(adminFlag:boolean){
      const now=Date.now();

      const trialStart=
        ent?.trial_started_at
          ?new Date(ent.trial_started_at).getTime()
          :0;

      const trialUntil=
        trialStart
          ?trialStart+30*86400000
          :0;

      const paidUntil=
        ent?.premium_until
          ?new Date(ent.premium_until).getTime()
          :0;

      const trialActive=trialUntil>now;
      const paidActive=paidUntil>now;

      /*
       * On reconnaît l'accès spécial par une expiration très lointaine.
       * Cela évite de dépendre d'une nouvelle valeur dans la colonne source.
       */
      const permanent=
        paidUntil>=new Date("2099-01-01T00:00:00.000Z").getTime();

      const source=
        permanent
          ?(adminFlag?"owner":"tester")
          :paidActive
            ?(ent?.source||"code")
            :"trial";

      return {
        ok:true,
        active:trialActive||paidActive,
        source,
        expires_at:
          paidActive
            ?ent.premium_until
            :trialUntil
              ?new Date(trialUntil).toISOString()
              :null,
        admin:adminFlag,
        owner:permanent&&adminFlag,
        tester:permanent&&!adminFlag,
        function_version:VERSION
      };
    }

    if(action==="status"){
      return json(
        statusPayload(
          await adminStatus()
        )
      );
    }

    if(action!=="redeem"){
      return json({
        ok:false,
        error:"unsupported_action",
        diagnostic:"PA-ACTION",
        function_version:VERSION
      });
    }

    const code=String(body.code||"")
      .trim()
      .toUpperCase();

    if(!code){
      return json({
        ok:false,
        error:"empty_code",
        diagnostic:"PA-EMPTY",
        function_version:VERSION
      });
    }

    const hash=await sha256(code);

    /*
     * =====================================================
     * PROPRIÉTAIRE
     * =====================================================
     */

    if(hash===OWNER_CODE_HASH){
      /*
       * On ne modifie QUE premium_until.
       * Aucun risque lié au CHECK de source ou à updated_at.
       */
      const entitlementUpdate=await admin
        .from("premium_entitlements")
        .update({
          premium_until:PERMANENT_UNTIL
        })
        .eq("user_id",user.id)
        .select("user_id,premium_until")
        .maybeSingle();

      if(entitlementUpdate.error||!entitlementUpdate.data){
        console.error(
          "owner entitlement",
          entitlementUpdate.error
        );

        return json({
          ok:false,
          error:"owner_entitlement_failed",
          diagnostic:"PA-OWNER-ENT",
          detail:entitlementUpdate.error?.message||"row_not_updated",
          function_version:VERSION
        });
      }

      const existingAdmin=await admin
        .from("admin_users")
        .select("user_id")
        .eq("user_id",user.id)
        .maybeSingle();

      if(existingAdmin.error){
        console.error(
          "owner admin read",
          existingAdmin.error
        );

        return json({
          ok:false,
          error:"owner_admin_read_failed",
          diagnostic:"PA-OWNER-ADMIN-READ",
          detail:existingAdmin.error.message,
          function_version:VERSION
        });
      }

      if(!existingAdmin.data){
        const adminInsert=await admin
          .from("admin_users")
          .insert({
            user_id:user.id
          });

        if(adminInsert.error){
          console.error(
            "owner admin insert",
            adminInsert.error
          );

          return json({
            ok:false,
            error:"owner_admin_insert_failed",
            diagnostic:"PA-OWNER-ADMIN-INSERT",
            detail:adminInsert.error.message,
            function_version:VERSION
          });
        }
      }

      ent={
        ...ent,
        premium_until:PERMANENT_UNTIL
      };

      return json({
        ok:true,
        active:true,
        source:"owner",
        expires_at:PERMANENT_UNTIL,
        admin:true,
        owner:true,
        tester:false,
        function_version:VERSION
      });
    }

    /*
     * =====================================================
     * TESTEUR
     * =====================================================
     */

    if(hash===TESTER_CODE_HASH){
      const entitlementUpdate=await admin
        .from("premium_entitlements")
        .update({
          premium_until:PERMANENT_UNTIL
        })
        .eq("user_id",user.id)
        .select("user_id,premium_until")
        .maybeSingle();

      if(entitlementUpdate.error||!entitlementUpdate.data){
        console.error(
          "tester entitlement",
          entitlementUpdate.error
        );

        return json({
          ok:false,
          error:"tester_entitlement_failed",
          diagnostic:"PA-TESTER-ENT",
          detail:entitlementUpdate.error?.message||"row_not_updated",
          function_version:VERSION
        });
      }

      ent={
        ...ent,
        premium_until:PERMANENT_UNTIL
      };

      return json({
        ok:true,
        active:true,
        source:"tester",
        expires_at:PERMANENT_UNTIL,
        admin:await adminStatus(),
        owner:false,
        tester:true,
        function_version:VERSION
      });
    }

    /*
     * =====================================================
     * CODES CLIENTS CLASSIQUES
     * =====================================================
     */

    if(!/^AP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)){
      return json({
        ok:false,
        error:"invalid_code",
        diagnostic:"PA-CODE-FORMAT",
        function_version:VERSION
      });
    }

    const {
      data:premiumCode,
      error:codeError
    }=await admin
      .from("premium_codes")
      .select("*")
      .eq("code_hash",hash)
      .maybeSingle();

    if(codeError){
      return json({
        ok:false,
        error:"code_lookup_failed",
        diagnostic:"PA-CODE-READ",
        detail:codeError.message,
        function_version:VERSION
      });
    }

    if(!premiumCode){
      return json({
        ok:false,
        error:"invalid_code",
        diagnostic:"PA-CODE-NOTFOUND",
        function_version:VERSION
      });
    }

    if(premiumCode.redeemed_at){
      return json({
        ok:false,
        error:"already_used",
        diagnostic:"PA-CODE-USED",
        function_version:VERSION
      });
    }

    if(
      premiumCode.expires_at &&
      new Date(premiumCode.expires_at)<=new Date()
    ){
      return json({
        ok:false,
        error:"expired_code",
        diagnostic:"PA-CODE-EXPIRED",
        function_version:VERSION
      });
    }

    const existingUntil=
      ent.premium_until
        ?new Date(ent.premium_until)
        :null;

    const base=
      existingUntil &&
      existingUntil>new Date()
        ?existingUntil
        :new Date();

    const until=new Date(
      base.getTime()+
      Number(premiumCode.duration_days)*86400000
    );

    const entitlementUpdate=await admin
      .from("premium_entitlements")
      .update({
        premium_until:until.toISOString(),
        source:"code"
      })
      .eq("user_id",user.id);

    if(entitlementUpdate.error){
      return json({
        ok:false,
        error:"entitlement_update_failed",
        diagnostic:"PA-CODE-ENT",
        detail:entitlementUpdate.error.message,
        function_version:VERSION
      });
    }

    const redeemed=await admin
      .from("premium_codes")
      .update({
        redeemed_by:user.id,
        redeemed_at:new Date().toISOString()
      })
      .eq("id",premiumCode.id)
      .is("redeemed_at",null)
      .select("id")
      .maybeSingle();

    if(redeemed.error){
      return json({
        ok:false,
        error:"redeem_update_failed",
        diagnostic:"PA-CODE-REDEEM",
        detail:redeemed.error.message,
        function_version:VERSION
      });
    }

    if(!redeemed.data){
      return json({
        ok:false,
        error:"already_used",
        diagnostic:"PA-CODE-RACE",
        function_version:VERSION
      });
    }

    return json({
      ok:true,
      active:true,
      source:"code",
      expires_at:until.toISOString(),
      admin:await adminStatus(),
      owner:false,
      tester:false,
      function_version:VERSION
    });

  }catch(error){
    console.error("premium-access fatal",error);

    return json({
      ok:false,
      error:"server_error",
      diagnostic:"PA-FATAL",
      detail:
        error instanceof Error
          ?error.message
          :"unknown",
      function_version:VERSION
    });
  }
});
