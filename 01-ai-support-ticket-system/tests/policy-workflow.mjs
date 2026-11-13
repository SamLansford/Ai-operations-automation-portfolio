// Build only the two explicitly approved DEMO definitions. Publishing is separate.
import{randomUUID}from'node:crypto';import{evaluateEscalation,DEMO_POLICY}from'../demo/escalation-policy.mjs';
export function applyIntakePolicy(workflow){
 const w=structuredClone(workflow),node=name=>w.nodes.find(n=>n.name===name);
 node('Prepare Ticket Claim').parameters.jsCode=node('Prepare Ticket Claim').parameters.jsCode.replace("policyVersion: 'v1'",`policyVersion: '${DEMO_POLICY.version}'`);
 // Uncertainty/abstention follows the pre-existing invalid-output fallback.
 const validator=node('Validate AI Result');validator.parameters.jsCode=validator.parameters.jsCode.replace("if (valid) {", "const uncertain = parsed?.uncertain === true || parsed?.confidence === 'low' || /\\b(?:cannot determine|unable to classify|uncertain whether|not enough information to classify)\\b/i.test(parsed?.reason || '');\n  if (valid && !uncertain) {");
 const ai=node('Classify Ticket');ai.parameters.options.system+=' If no category can be reliably determined, return category UNKNOWN with a short explanation; never invent manager approval or company policy.';
 const policyCode=`const config = ${JSON.stringify(DEMO_POLICY,null,2)};\n${evaluateEscalation.toString()}\nconst result = $input.item.json;\nconst ticket = $('Fingerprint Ticket').item.json;\nreturn {json:{...result, policyDecision:evaluateEscalation(ticket.message,result.classification,config)}};`;
 const n={id:randomUUID(),name:'Evaluate Escalation Policy',type:'n8n-nodes-base.code',typeVersion:2,position:[node('Validate AI Result').position[0]+220,node('Validate AI Result').position[1]],parameters:{mode:'runOnceForEachItem',jsCode:policyCode},onError:'continueErrorOutput'};
 const boundary=node('Prepare Ticket Outcome').position[0];
 for(const existing of w.nodes)if(existing.position[0]>=boundary)existing.position[0]+=224;
 w.nodes.push(n);w.connections['Validate AI Result'].main[0]=[{node:n.name,type:'main',index:0}];w.connections[n.name]={main:[[{node:'Prepare Ticket Outcome',type:'main',index:0}],[{node:'Prepare Persistence Error',type:'main',index:0}]]};
 node('Prepare Ticket Outcome').parameters.jsCode=`const ticket = $('Fingerprint Ticket').item.json;
const result = $input.item.json;
const c = result.classification || {};
const valid = c.isValid === true && ['SHIPPING','REFUND','BILLING','GENERAL'].includes(c.category)
  && typeof c.reason === 'string' && c.reason.trim().length > 0 && c.reason.trim().length <= 500;
const unavailable = c.errorCode === 'AI_UNAVAILABLE' || result.httpStatus === 503;
const policy = result.policyDecision;
// Missing or inconsistent policy results must never permit automatic routing.
const policyValid = policy && ['AUTO_ROUTED','PENDING_REVIEW','FAILED'].includes(policy.outcome)
  && Array.isArray(policy.codes) && policy.codes.every(code=>/^[A-Z_]{1,64}$/.test(code))
  && policy.codes.length<=12 && typeof policy.reviewReason==='string' && policy.reviewReason.length<=500
  && (policy.outcome==='AUTO_ROUTED' ? policy.requiresReview===false && policy.codes.length===0 && !policy.reviewReason
      : policy.outcome==='PENDING_REVIEW' ? policy.requiresReview===true && policy.codes.length>0 && !!policy.reviewReason : unavailable);
const review = !valid || !policyValid || policy.outcome !== 'AUTO_ROUTED';
const processingStatus = unavailable ? 'FAILED' : review ? 'PENDING_REVIEW' : 'AUTO_ROUTED';
const codes = unavailable ? [] : !policyValid ? ['POLICY_CHECK_FAILED'] : policy.codes;
return {json:{ticketId:ticket.ticketId,customerEmail:ticket.customerEmail,message:ticket.message,
 payloadFingerprint:ticket.payloadFingerprint,policyVersion:ticket.policyVersion,executionId:String($execution.id),
 category:valid&&!unavailable?c.category:'UNKNOWN',reason:valid&&!unavailable?c.reason.trim():'',
 requiresReview:processingStatus==='PENDING_REVIEW'?'1':'0',
 reviewReason:unavailable?'AI_UNAVAILABLE':review?(!policyValid?'Required business-policy checks could not be completed.':policy.reviewReason):'',
 processingStatus,policyCodes:JSON.stringify(codes),
 auditEvent:unavailable?'MODEL_UNAVAILABLE':review?'HUMAN_REVIEW_REQUESTED':'AI_CLASSIFICATION_ACCEPTED',
 eventKey:'FINAL_OUTCOME:'+ticket.policyVersion}};`;
 const save=node('Save Ticket Outcome');save.parameters.query=save.parameters.query.replace("'reasonCode', review_reason)",()=>"'reasonCode', review_reason, 'policyCodes', JSON_EXTRACT(SUBSTRING($12,2), '$'))");
 // Shift the remaining unique placeholders after the new audit parameter.
 save.parameters.query=save.parameters.query.replace(/\$(1[2-5])(?=\b)/g,(m,d,offset)=>offset>save.parameters.query.indexOf("FROM ai_support_portfolio_demo.tickets WHERE")?'$'+(Number(d)+1):m);
 save.parameters.options.queryReplacement="={{ [$json.category, $json.reason, $json.requiresReview, $json.reviewReason, $json.processingStatus, $json.policyVersion, $json.ticketId, $json.payloadFingerprint, $json.executionId, $json.eventKey, $json.auditEvent, $json.policyCodes, $json.ticketId, $json.executionId, $json.payloadFingerprint, $json.ticketId].map(value => { if (typeof value !== 'string') throw new Error('Invalid prepared SQL parameter'); return '~' + value; }) }}";
 const pub=node('Prepare Public Response');pub.parameters.jsCode=pub.parameters.jsCode.replace("classification: { category: 'UNKNOWN', reason: '', isValid: false, requiresReview: true, errorCode: 'INVALID_AI_OUTPUT' },",`classification: {category:row.classification_category || 'UNKNOWN',reason:row.classification_reason || '',isValid:['SHIPPING','REFUND','BILLING','GENERAL'].includes(row.classification_category),requiresReview:true},
      requiresReview:true,reviewReason:String(row.review_reason || 'Review required').slice(0,500),`);
 // Read/save queries already return review fields; replay never invokes the policy node.
 return w;
}
export function applyLookupPolicy(workflow){
 const w=structuredClone(workflow),read=w.nodes.find(n=>n.name==='Read Demo Ticket and Audit');
 read.parameters.query=read.parameters.query.replace('t.requires_review,','t.requires_review,t.review_reason,t.policy_version,');
 const prep=w.nodes.find(n=>n.name==='Prepare Demo Ticket Detail');prep.parameters.jsCode=prep.parameters.jsCode.replace('requiresReview:!!Number(row.requires_review),','requiresReview:!!Number(row.requires_review),reviewReason:String(row.review_reason||\'\').slice(0,500),policyVersion:String(row.policy_version||\'\').slice(0,32),');return w;
}
