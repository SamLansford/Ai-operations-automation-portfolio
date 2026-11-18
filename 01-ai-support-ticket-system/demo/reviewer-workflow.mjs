import {randomUUID} from 'node:crypto';
export const REVIEWER_ID='portfolio-demo-reviewer-1';
export const REVIEW_EVENT='DEMO_HUMAN_REVIEW_DECISION:v1';
export function validateReviewRequest(body){
 const fail=()=>({valid:false,httpStatus:400,error:'INVALID_REVIEW_REQUEST'});
 if(!body||typeof body!=='object'||Array.isArray(body)||!['pending','history','detail','decide','session-decide'].includes(body.action))return fail();
 const sessionDecision=body.action==='session-decide';
 const decision=body.action==='decide'||sessionDecision;
 const keys=decision?['action','ticketId','decisionId','decision','reason',...(sessionDecision?['demoActor']:[])]:body.action==='detail'?['action','ticketId']:['action'];
 if(Object.keys(body).some(k=>!keys.includes(k))||Object.keys(body).length!==keys.length)return fail();
 if((body.action==='detail'||decision)&&(typeof body.ticketId!=='string'||!/^DEMO-[A-Za-z0-9_-]{1,123}$/.test(body.ticketId)))return fail();
 if(sessionDecision&&(typeof body.demoActor!=='string'||!/^demo-session-[a-f0-9]{32}$/.test(body.demoActor)))return fail();
 if(decision&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.decisionId||'')||!['APPROVE','REJECT'].includes(body.decision)||typeof body.reason!=='string'||(sessionDecision?(!body.reason.trim()||body.reason.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.reason)):(body.reason.trim().length<5||body.reason.trim().length>500||/[\u0000-\u001f]/.test(body.reason)))))return fail();
 return {valid:true,action:decision?'decide':body.action,ticketId:body.ticketId||'',decisionId:body.decisionId||'',decision:body.decision||'',reason:body.reason?.trim()||'',reviewerId:sessionDecision?body.demoActor:'portfolio-demo-reviewer-1',newStatus:body.decision==='APPROVE'?'APPROVED':'REJECTED'};
}
export const decisionSql=`
SET @demo_review_locked=NULL;
SELECT ticket_id INTO @demo_review_locked FROM ai_support_portfolio_demo.tickets WHERE ticket_id=SUBSTRING($1,2) FOR UPDATE;
UPDATE ai_support_portfolio_demo.tickets SET processing_status=SUBSTRING($2,2),requires_review=0
WHERE ticket_id=SUBSTRING($3,2) AND processing_status='PENDING_REVIEW' AND requires_review=1
AND NOT EXISTS(SELECT 1 FROM ai_support_portfolio_demo.ticket_audit WHERE ticket_id=SUBSTRING($4,2) AND event_key='DEMO_HUMAN_REVIEW_DECISION:v1');
SET @demo_review_updated=ROW_COUNT();
INSERT INTO ai_support_portfolio_demo.ticket_audit(ticket_id,event_key,event_type,previous_status,new_status,reviewer_id,execution_id,details)
SELECT ticket_id,'DEMO_HUMAN_REVIEW_DECISION:v1','HUMAN_REVIEW_DECIDED','PENDING_REVIEW',processing_status,
SUBSTRING($5,2),SUBSTRING($6,2),JSON_OBJECT('decisionId',SUBSTRING($7,2),'decision',SUBSTRING($8,2),'reason',SUBSTRING($9,2),'policyVersion',policy_version,'originalEscalation',review_reason,'originalCategory',classification_category)
FROM ai_support_portfolio_demo.tickets WHERE ticket_id=SUBSTRING($10,2) AND @demo_review_updated=1;
SET @demo_review_audited=ROW_COUNT();
SELECT t.ticket_id,t.processing_status,a.reviewer_id,a.new_status,a.details,a.occurred_at,@demo_review_updated updated_rows,@demo_review_audited audit_rows
FROM (SELECT 1 x) seed LEFT JOIN ai_support_portfolio_demo.tickets t ON t.ticket_id=SUBSTRING($11,2)
LEFT JOIN ai_support_portfolio_demo.ticket_audit a ON a.ticket_id=t.ticket_id AND a.event_key='DEMO_HUMAN_REVIEW_DECISION:v1';`.replace(/\s*\r?\n\s*/g,' ');
export const readSql=`SELECT t.ticket_id,LEFT(t.customer_message,1500) customer_message,t.classification_category,t.classification_reason,t.requires_review,t.review_reason,t.processing_status,t.policy_version,t.created_at,t.updated_at,a.audit_id,a.event_type,a.previous_status,a.new_status,a.reviewer_id,a.execution_id,a.details,a.occurred_at
FROM ai_support_portfolio_demo.tickets t LEFT JOIN ai_support_portfolio_demo.ticket_audit a ON a.ticket_id=t.ticket_id AND SUBSTRING($1,2)='detail'
WHERE (SUBSTRING($2,2)='pending' AND t.processing_status='PENDING_REVIEW' AND t.requires_review=1)
OR (SUBSTRING($3,2)='history' AND t.processing_status IN ('APPROVED','REJECTED') AND EXISTS(SELECT 1 FROM ai_support_portfolio_demo.ticket_audit h WHERE h.ticket_id=t.ticket_id AND h.event_key='DEMO_HUMAN_REVIEW_DECISION:v1'))
OR (SUBSTRING($4,2)='detail' AND t.ticket_id=SUBSTRING($5,2))
ORDER BY t.updated_at DESC,t.ticket_id,a.audit_id LIMIT 50;`;
export function resolveReview(input,rows){
 const fail=(httpStatus,error)=>({httpStatus,error});if(rows.some(r=>r.error||(typeof r.message==='string'&&Object.hasOwn(r,'itemIndex')&&!Object.hasOwn(r,'ticket_id'))))return fail(503,'REVIEW_UNAVAILABLE');
 const data=rows.filter(r=>Object.hasOwn(r,'ticket_id'));
 if(input.action==='decide'){
  if(!data.length)return fail(503,'REVIEW_UNAVAILABLE');
  const row=data.find(r=>r.ticket_id);if(!row)return fail(404,'TICKET_NOT_FOUND');let details=row.details;try{if(typeof details==='string')details=JSON.parse(details);}catch{return fail(503,'REVIEW_UNAVAILABLE');}
  const same=row.processing_status===input.newStatus&&row.new_status===input.newStatus&&row.reviewer_id===input.reviewerId&&details?.decisionId===input.decisionId&&details?.decision===input.decision&&details?.reason===input.reason;
  if(!same)return fail(409,'REVIEW_CONFLICT');if(!((Number(row.updated_rows)===1&&Number(row.audit_rows)===1)||(Number(row.updated_rows)===0&&Number(row.audit_rows)===0)))return fail(503,'REVIEW_UNAVAILABLE');
  return{httpStatus:200,decision:{ticketId:row.ticket_id,status:row.processing_status,reviewerId:row.reviewer_id,decision:details.decision,reason:details.reason,at:String(row.occurred_at),replayed:Number(row.updated_rows)===0}};
 }
 const ticket=r=>({ticketId:r.ticket_id,message:String(r.customer_message||'').slice(0,1500),category:r.classification_category,reason:String(r.classification_reason||'').slice(0,500),status:r.processing_status,requiresReview:!!Number(r.requires_review),reviewReason:String(r.review_reason||'').slice(0,500),policyVersion:r.policy_version,createdAt:String(r.created_at),updatedAt:String(r.updated_at)});
 if(input.action!=='detail')return{httpStatus:200,tickets:data.filter(r=>r.ticket_id).slice(0,25).map(ticket),limit:25};
 if(!data[0]?.ticket_id)return fail(404,'TICKET_NOT_FOUND');const t=ticket(data[0]);t.events=data.filter(r=>r.event_type).slice(0,50).map(r=>{let d=r.details;try{if(typeof d==='string')d=JSON.parse(d);}catch{d=null;}return{type:r.event_type,from:r.previous_status,to:r.new_status,reviewerId:r.reviewer_id||null,execution:r.execution_id,at:String(r.occurred_at),decision:r.event_type==='HUMAN_REVIEW_DECIDED'?{decision:d?.decision,reason:String(d?.reason||'').slice(0,500)}:null};});return{httpStatus:200,ticket:t};
}
export function buildReviewerWorkflow(templates){
 const make=(name,type,parameters,position)=>({id:randomUUID(),name,type:'n8n-nodes-base.'+type,typeVersion:type==='webhook'?2.2:type==='mySql'?2.5:type==='respondToWebhook'?1.5:2,parameters,position});
 const webhook=make('Authenticated DEMO Reviewer Webhook','webhook',{httpMethod:'POST',path:'support-ticket-review-demo',authentication:'headerAuth',responseMode:'responseNode',options:{}},[0,0]);webhook.webhookId=randomUUID();webhook.credentials=templates.header;
 const validate=make('Validate DEMO Review Request','code',{mode:'runOnceForEachItem',jsCode:validateReviewRequest.toString()+'\nreturn {json:validateReviewRequest($json.body)};'},[220,0]);
 const branch=(name,expression,pos)=>{const n=structuredClone(templates.branch);n.id=randomUUID();n.name=name;n.position=pos;n.parameters.conditions.conditions[0].leftValue=expression;delete n.onError;return n;};
 const valid=branch('DEMO Review Request Valid?','={{ $json.valid }}',[440,0]),decide=branch('DEMO Decision Request?','={{ $json.action === "decide" }}',[660,0]);
 const sql=(name,query,replacement,pos,transaction=false)=>{const n=make(name,'mySql',{operation:'executeQuery',query,options:{...(transaction?{queryBatching:'transaction'}:{}),queryReplacement:replacement}},pos);n.credentials=templates.mysql;n.alwaysOutputData=true;n.onError='continueErrorOutput';return n;};
 const commit=sql('Commit DEMO Review Decision',decisionSql,"={{ [$json.ticketId,$json.newStatus,$json.ticketId,$json.ticketId,$json.reviewerId,String($execution.id),$json.decisionId,$json.decision,$json.reason,$json.ticketId,$json.ticketId].map(v=>'~'+v) }}",[880,-150],true);
 const read=sql('Read DEMO Review Workspace',readSql,"={{ [$json.action,$json.action,$json.action,$json.action,$json.ticketId].map(v=>'~'+v) }}",[880,150]);
 const response=make('Prepare DEMO Review Response','code',{mode:'runOnceForAllItems',jsCode:resolveReview.toString()+"\nreturn [{json:resolveReview($('Validate DEMO Review Request').first().json,$input.all().map(x=>x.json))}];"},[1100,0]);
 const error=make('Prepare DEMO Review Error','code',{mode:'runOnceForEachItem',jsCode:"return {json:{httpStatus:503,error:'REVIEW_UNAVAILABLE'}};"},[1100,250]);
 const send=make('Respond to DEMO Reviewer','respondToWebhook',{respondWith:'json',responseBody:'={{ JSON.stringify($json) }}',options:{responseCode:'={{ $json.httpStatus }}'}},[1320,0]);
 const connections={};const link=(from,outputs)=>connections[from]={main:outputs.map(names=>names.map(node=>({node,type:'main',index:0})))};
 link(webhook.name,[[validate.name]]);link(validate.name,[[valid.name]]);link(valid.name,[[decide.name],[send.name]]);link(decide.name,[[commit.name],[read.name]]);link(commit.name,[[response.name],[error.name]]);link(read.name,[[response.name],[error.name]]);link(response.name,[[send.name]]);link(error.name,[[send.name]]);
 return{name:'Portfolio 1 - Human Review Workspace - DEMO',nodes:[webhook,validate,valid,decide,commit,read,response,error,send],connections,settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false,saveExecutionProgress:false,executionTimeout:30}};
}
