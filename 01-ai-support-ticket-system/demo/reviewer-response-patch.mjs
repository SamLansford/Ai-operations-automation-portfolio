export function patchDemoReviewResponses(intake,lookup){
 const a=structuredClone(intake),b=structuredClone(lookup),pub=a.nodes.find(n=>n.name==='Prepare Public Response');
 const start=pub.parameters.jsCode.indexOf("  if (row.processing_status === 'REJECTED')"),end=pub.parameters.jsCode.indexOf("  if (row.processing_status !== 'AUTO_ROUTED'",start);if(start<0||end<0)throw Error('TERMINAL_RESPONSE_MARKER_MISSING');
 pub.parameters.jsCode=pub.parameters.jsCode.slice(0,start)+`  if (['APPROVED','REJECTED'].includes(row.processing_status)) {
    return {json:{...fields,isValid:true,errors:[],status:row.processing_status,processingStatus:row.processing_status,
      classification:{category:row.classification_category||'UNKNOWN',reason:row.classification_reason||'',isValid:['SHIPPING','REFUND','BILLING','GENERAL'].includes(row.classification_category),requiresReview:false},
      requiresReview:false,reviewReason:String(row.review_reason||'').slice(0,500),httpStatus:200}};
  }
`+pub.parameters.jsCode.slice(end);
 const read=b.nodes.find(n=>n.name==='Read Demo Ticket and Audit');if(!read.parameters.query.includes('a.reviewer_id'))read.parameters.query=read.parameters.query.replace('a.event_type,','a.event_type,a.event_key,a.reviewer_id,a.details,');
 const prep=b.nodes.find(n=>n.name==='Prepare Demo Ticket Detail');prep.parameters.jsCode=prep.parameters.jsCode.replace('return [{json:{httpStatus:200,ticket:',`let savedDecision=null;const event=rows.find(r=>r.event_key==='DEMO_HUMAN_REVIEW_DECISION:v1');if(event){try{const d=typeof event.details==='string'?JSON.parse(event.details):event.details;savedDecision={decision:d.decision,reason:String(d.reason||'').slice(0,500),reviewerId:event.reviewer_id,at:String(event.occurred_at)};}catch{}}return [{json:{httpStatus:200,ticket:`);prep.parameters.jsCode=prep.parameters.jsCode.replace('requiresReview:!!Number(row.requires_review),','requiresReview:!!Number(row.requires_review),decision:savedDecision,');
 return{intake:a,lookup:b};
}
