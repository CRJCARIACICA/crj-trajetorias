import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { makePdf,makeDocx,loadHeader,planningEvidenceSpec } from "../_shared/instructor_planning_renderer.ts";

const BUCKET="instructor-planning-evidence";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const fileName=v=>String(v||"oficineiro").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").slice(0,100);
const publicMetadata=e=>({id:e.id,status:e.status,reference_month:e.reference_month,version:e.version,file_name:e.file_name,pdf_path:e.pdf_path,docx_path:e.docx_path,created_at:e.created_at,pdf_bytes:e.pdf_bytes,docx_bytes:e.docx_bytes});
async function sha256(bytes){const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));return [...hash].map(x=>x.toString(16).padStart(2,"0")).join("")}

export function createEvidenceHandler({clientFactory=createClient,env=name=>Deno.env.get(name),renderPdf=makePdf,renderDocx=makeDocx,headerLoader=loadHeader,uuid=()=>crypto.randomUUID(),clock=()=>new Date()}={}){
  return async req=>{
    if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
    if(req.method!=="POST")return json({error:"Método não permitido."},405);
    let service=null,evidenceId=null,token=null,uploaded=[];
    try{
      const authorization=req.headers.get("Authorization")||"";
      if(!authorization.startsWith("Bearer "))return json({error:"Sessão inválida."},401);
      const url=env("SUPABASE_URL"),anon=env("SUPABASE_ANON_KEY")||env("SUPABASE_PUBLISHABLE_KEY"),secret=env("SUPABASE_SERVICE_ROLE_KEY");
      if(!url||!anon||!secret)throw new Error("Armazenamento das evidências indisponível.");
      const userClient=clientFactory(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const userQ=await userClient.auth.getUser();
      if(userQ.error||!userQ.data?.user)return json({error:"Sessão expirada. Entre novamente."},401);
      const actor=userQ.data.user.id;
      const profileQ=await userClient.from("profiles").select("id,role,active").eq("id",actor).single();
      if(profileQ.error||profileQ.data?.active!==true||profileQ.data?.role!=="oficineiro")return json({error:"Seu perfil não pode gerar esta evidência."},403);
      const body=await req.json();
      const planId=String(body.plan_id||"");
      if(!UUID.test(String(body.request_id||""))||!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(String(body.reference_month||""))||(planId&&!UUID.test(planId)))return json({error:"Competência, planejamento ou solicitação inválida."},400);
      const createQ=planId
        ?await userClient.rpc("workshop_create_instructor_evidence_for_plan",{p_reference_month:body.reference_month,p_plan_id:planId,p_request_id:body.request_id})
        :await userClient.rpc("workshop_create_instructor_evidence",{p_reference_month:body.reference_month,p_request_id:body.request_id});
      if(createQ.error)return json({error:createQ.error.message||"Não foi possível confirmar os blocos."},422);
      evidenceId=createQ.data?.id;
      if(!UUID.test(String(evidenceId||"")))throw new Error("O banco não confirmou a evidência.");
      const rowQ=await userClient.from("workshop_instructor_evidences").select("*").eq("id",evidenceId).eq("instructor_user_id",actor).single();
      if(rowQ.error||!rowQ.data)return json({error:"Evidência não encontrada ou sem permissão."},403);
      const evidence=rowQ.data;
      if(evidence.status==="ready")return json(publicMetadata(evidence));
      const now=clock(),leaseAge=now.getTime()-new Date(evidence.processing_started_at||0).getTime();
      if(evidence.status==="generating"&&leaseAge<180000)return json(publicMetadata(evidence),202);
      service=clientFactory(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
      token=uuid();
      const claimQ=await service.from("workshop_instructor_evidences")
        .update({status:"generating",processing_token:token,processing_started_at:now.toISOString(),updated_at:now.toISOString(),failure_message:null})
        .eq("id",evidenceId).eq("status",evidence.status).eq("updated_at",evidence.updated_at).select("id").maybeSingle();
      if(claimQ.error)throw claimQ.error;
      if(!claimQ.data)return json({id:evidenceId,status:"generating"},202);
      const header=await headerLoader(service),spec=planningEvidenceSpec(evidence);
      const [pdf,docx]=await Promise.all([renderPdf(spec,header),renderDocx(spec,header)]);
      if(!(pdf instanceof Uint8Array)||pdf.length<5||new TextDecoder().decode(pdf.slice(0,5))!=="%PDF-")throw new Error("O PDF não foi gerado corretamente.");
      if(!(docx instanceof Uint8Array)||docx.length<4||docx[0]!==0x50||docx[1]!==0x4b)throw new Error("O DOCX não foi gerado corretamente.");
      const stem=actor+"/"+evidenceId+"/"+token,pdfPath=stem+".pdf",docxPath=stem+".docx";
      for(const [path,bytes,contentType] of [[pdfPath,pdf,"application/pdf"],[docxPath,docx,"application/vnd.openxmlformats-officedocument.wordprocessingml.document"]]){
        const q=await service.storage.from(BUCKET).upload(path,bytes,{contentType,upsert:false,cacheControl:"31536000"});
        if(q.error)throw q.error;
        uploaded.push(path);
      }
      const patch={status:"ready",pdf_path:pdfPath,docx_path:docxPath,file_name:"Planejamento_"+body.reference_month.slice(0,7)+"_"+fileName(evidence.snapshot.instructor_name)+"_v"+evidence.version,
        pdf_sha256:await sha256(pdf),docx_sha256:await sha256(docx),pdf_bytes:pdf.length,docx_bytes:docx.length,
        processing_token:null,processing_started_at:null,failure_message:null,updated_at:clock().toISOString()};
      const readyQ=await service.from("workshop_instructor_evidences").update(patch).eq("id",evidenceId).eq("processing_token",token).select("id").maybeSingle();
      if(readyQ.error)throw readyQ.error;
      if(!readyQ.data)throw new Error("A geração foi substituída por outra tentativa. Atualize a lista de planejamentos.");
      uploaded=[];
      return json(publicMetadata({...evidence,...patch}));
    }catch(error){
      if(service&&uploaded.length)await service.storage.from(BUCKET).remove(uploaded).catch(()=>{});
      if(service&&evidenceId&&token)await service.from("workshop_instructor_evidences")
        .update({status:"failed",failure_message:"Não foi possível concluir os arquivos. Tente novamente.",processing_token:null,processing_started_at:null,updated_at:clock().toISOString()})
        .eq("id",evidenceId).eq("processing_token",token).then(()=>{},()=>{});
      console.error("CRJ_PLANNING_EVIDENCE",error instanceof Error?error.message:String(error));
      return json({error:"Não foi possível concluir a evidência. Os blocos salvos e os rascunhos foram preservados. Tente novamente."},500);
    }
  };
}
Deno.serve(createEvidenceHandler());