const form=document.querySelector('#ticket-form'),message=document.querySelector('#message'),submit=document.querySelector('#submit'),result=document.querySelector('#result');
const examples={
  "shipping": {
    "message": "My desk lamp was supposed to arrive on Tuesday, but it is now Friday and I still have not received it. Could you check where the parcel is?",
    "note": "Expected category: SHIPPING. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "tracking": {
    "message": "The tracking for my backpack has been stuck on “label created” for four days. Has the package actually left the warehouse yet?",
    "note": "Expected category: SHIPPING. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "delivery": {
    "message": "Tracking says my coffee grinder was delivered this afternoon. I checked the porch and mailroom, but it is not there. What should I do next?",
    "note": "Expected category: SHIPPING. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "billing": {
    "message": "I bought one desk lamp, but my card statement shows two completed charges for the same purchase. Could you check the duplicate charge?",
    "note": "Expected category: BILLING. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "amount": {
    "message": "The checkout total for my headphones was $79, but the completed card charge is $94. Please explain the difference and correct it if this was a billing mistake.",
    "note": "Expected category: BILLING. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "invoice": {
    "message": "My invoice includes a gift-wrapping fee even though I did not choose gift wrapping. Could you review that charge?",
    "note": "Expected category: BILLING. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "refund": {
    "message": "The jacket arrived, but it does not fit. I would like to return it for a refund rather than exchange it. How do I start a return?",
    "note": "Expected category: REFUND. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "damaged": {
    "message": "The mug arrived with a cracked handle. I do not want a replacement; please tell me how to return it and get my money back.",
    "note": "Expected category: REFUND. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "refund-status": {
    "message": "I returned the unopened headphones last week and received confirmation that the return was accepted. I still have not received the refund. Can you check its status?",
    "note": "Expected category: REFUND. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "general": {
    "message": "Does the navy backpack have a padded laptop compartment, and will it fit a standard laptop? I am checking before I buy it.",
    "note": "Expected category: GENERAL. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "care": {
    "message": "Can the ceramic travel mug go in the dishwasher, or should it be washed by hand? I cannot find the care instructions.",
    "note": "Expected category: GENERAL. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "availability": {
    "message": "The olive version of the jacket is sold out in medium. Do you expect to restock that color and size soon?",
    "note": "Expected category: GENERAL. Check the returned category and reason after submitting. This is a synthetic customer scenario, not a recorded PASS."
  },
  "ambiguous": {
    "message": "My delivery arrived late and the item was damaged. I also see an extra charge on the invoice. I am not sure which issue to start with; can someone review the whole situation?",
    "note": "Mixed delivery, damage and billing issues: inspect the actual category and explanation. This probes ambiguity; a review request is possible but not guaranteed."
  },
  "email": {
    "message": "I have not received the return instructions for my jacket. Please send them to sample@example.invalid.",
    "note": "Expected: reject this fake email address before classification. No ticket should be accepted."
  },
  "url": {
    "message": "The desk lamp arrived with a bent stand. I uploaded a photo here: https://example.invalid/damaged-lamp. Can you help?",
    "note": "Expected: reject this reserved example URL before classification. No ticket should be accepted."
  },
  "phone": {
    "message": "I need help with a missing delivery. Please call me back at 555-010-1234 when someone is available.",
    "note": "Expected: reject this fake callback number before classification. No ticket should be accepted."
  },
  "short": {
    "message": "Help",
    "note": "Expected: block this incomplete four-character request because the minimum is 10 characters."
  },
  "long": {
    "message": "I am following up about a desk lamp that arrived with a loose switch. I tried the troubleshooting instructions, checked the packaging, and tested the lamp in another outlet, but the same problem keeps happening. I would appreciate clear instructions on the next steps and whether I should return it. I am following up about a desk lamp that arrived with a loose switch. I tried the troubleshooting instructions, checked the packaging, and tested the lamp in another outlet, but the same problem keeps happening. I would appreciate clear instructions on the next steps and whether I should return it. I am following up about a desk lamp that arrived with a loose switch. I tried the troubleshooting instructions, checked the packaging, and tested the lamp in another outlet, but the same problem keeps happening. I would appreciate clear instructions on the next steps and whether I should return it. I am following up about a desk lamp that arrived with a loose switch. I tried the troubleshooting instructions, checked the packaging, and tested the lamp in another outlet, but the same problem keeps happening. I would appreciate clear instructions on the next steps and whether I should return it. I am following up about a desk lamp that arrived with a loose switch. I tried the troubleshooting instructions, checked the packaging, and tested the lamp in another outlet, but the same problem keeps happening. I would appreciate clear instructions on the next steps and whether I should return it. I",
    "note": "Expected: reject this 1,501-character follow-up because the maximum is 1,500 characters. No accepted ticket should be created."
  }
};
let previous,sessionPromise;
let checkRunning=false,requestRunning=false;
function paint(state,badge,title,text,details=''){
  document.querySelector('.result').dataset.state=state;result.replaceChildren();
  const tag=document.createElement('span');tag.className='badge';tag.textContent=badge;
  const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=text;
  result.append(tag,h,p);if(details){const d=document.createElement('div');d.className='detail';d.textContent=details;result.append(d);}
  if(state==='success'||state==='error')h.scrollIntoView({block:'center'});
}
function session(){return sessionPromise??=fetch('/api/demo/session',{credentials:'same-origin'}).then(async r=>{if(!r.ok)throw Error('Session unavailable');return r.json();}).catch(e=>{sessionPromise=null;throw e;});}
for(const button of document.querySelectorAll('[data-example]'))button.addEventListener('click',()=>{const example=examples[button.dataset.example];message.value=example.message;document.querySelector('#example-note').textContent=example.note;for(const other of document.querySelectorAll('[data-example]'))other.setAttribute('aria-pressed',String(other===button));message.dispatchEvent(new Event('input'));message.focus();});
message.addEventListener('input',()=>{document.querySelector('#count').textContent=Array.from(message.value).length+' / 1,500';});
const errors={FICTIONAL_TICKET_REQUIRED:'Use a fictional message of 10–1,500 characters. Remove contact details, links, and long numbers.',REQUEST_CONFLICT:'This request ID already belongs to different content. Start a new fictional ticket.',RATE_LIMITED:'The demo has reached its short-term request limit. Please wait a minute.',DEMO_BUSY:'Two tickets are already processing. Please try again shortly.',AUTOMATION_TIMEOUT:'The automation took longer than expected. Submit the same message again to safely check or retry the existing request.',AUTOMATION_UNAVAILABLE:'The local automation is unavailable. It may be inactive or a dependency may be unavailable. Try again later.',REQUEST_NOT_ALLOWED:'Your demo session expired or this request was blocked. Refresh the page and try again.'};
form.addEventListener('submit',async event=>{
  event.preventDefault();if(checkRunning||requestRunning)return;
  const text=message.value.trim();if(previous?.message!==text)previous={message:text,requestId:crypto.randomUUID()};
  requestRunning=true;for(const b of document.querySelectorAll('[data-check]'))b.disabled=true;submit.disabled=true;submit.textContent='Processing ticket…';
  paint('loading','PROCESSING','Following the automation…','Validating the request, classifying it with local AI, and persisting the result.');
  try{
    const {csrf}=await session();
    const r=await fetch('/api/demo/tickets',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-demo-csrf':csrf},body:JSON.stringify({...previous,fictional:true}),signal:AbortSignal.timeout(50000)});
    const b=await r.json();
    if(!r.ok){if(r.status===403)sessionPromise=null;paint('error',r.status===504?'TIMEOUT':'REQUEST NOT COMPLETED','Let’s try that again.',errors[b.error]||'The request could not be completed. Please try again later.');showHistoryReceipt(b);if(r.status>=500&&await loadSavedTicket(previous.requestId))rememberTicket(previous.requestId);await refreshSubmissionHistory();return;}
    rememberTicket(previous.requestId);
    if(b.status==='AUTO_ROUTED')paint('success','AUTO_ROUTED',b.category,b.reason,`Saved demo ticket · ${b.ticketRef}`);
    else if(b.status==='PENDING_REVIEW')paint('success','PENDING_REVIEW',(b.category&&b.category!=='UNKNOWN'?b.category+' · Human review required':'A human review is needed.'),b.reviewReason||'The saved ticket requires review. No human decision has been made.',`Saved demo ticket · ${b.ticketRef}`);
    else paint('loading','PROCESSING','This ticket is still processing.','The automation already owns this request. Submit the same message shortly to check its saved result.');
    await loadSavedTicket(previous.requestId);showHistoryReceipt(b);await refreshSubmissionHistory();
  }catch(e){paint('error',e.name==='TimeoutError'?'TIMEOUT':'CONNECTION ERROR','The result is not available yet.',e.name==='TimeoutError'?errors.AUTOMATION_TIMEOUT:'Could not reach the local demo service. Check that it is running, then try again.');if(previous&&await loadSavedTicket(previous.requestId))rememberTicket(previous.requestId);await refreshSubmissionHistory();}
  finally{requestRunning=false;submit.disabled=false;for(const b of document.querySelectorAll('[data-check]'))b.disabled=false;submit.textContent='Classify ticket ↗';}
});

// Availability reflects the demo backend session, not a guarantee of AI uptime.
async function checkConnection(){
 submit.disabled=true;for(const b of document.querySelectorAll('[data-check]'))b.disabled=true;const status=document.querySelector('#service-status');
 if(location.hostname!=='127.0.0.1'){status.textContent='Public demo not connected. This preview cannot accept submissions.';return;}
 status.textContent='Checking demo service…';
 try{await session();status.textContent='Demo service connected. Submit a fictional ticket to check the automation.';void restoreTickets();void refreshSubmissionHistory();submit.disabled=false;for(const b of document.querySelectorAll('[data-check]'))b.disabled=false;}
 catch{status.textContent='Demo offline. Start the existing demo backend and workflow, then check connection again.';}
}
document.querySelector('#reconnect').addEventListener('click',()=>{sessionPromise=null;void checkConnection();});
void checkConnection();
if(window.parent!==window){
 const main=document.querySelector('main');
 const size=()=>parent.postMessage({type:'support-demo-height',height:Math.ceil(main.getBoundingClientRect().height)+24},location.origin);
 new ResizeObserver(size).observe(main);size();
}

// Fixed synthetic scenarios; no caller-provided record identifiers are selected.
const checkButtons=[...document.querySelectorAll('[data-check]')];
function showCheck(title,lines){
 const target=document.querySelector('#check-result');target.replaceChildren();
 const heading=document.createElement('h4');heading.textContent=title;target.append(heading);
 for(const line of lines){const p=document.createElement('p');p.textContent=line;target.append(p);}
}
for(const button of checkButtons)button.addEventListener('click',async()=>{
 if(checkRunning||requestRunning)return;
 checkRunning=true;submit.disabled=true;for(const b of checkButtons)b.disabled=true;
 const kind=button.dataset.check;
 showCheck('Running '+button.textContent,['Requests are being sent to the connected demo service. No result has been confirmed yet.']);
 const body={requestId:crypto.randomUUID(),message:examples.billing.message,fictional:true};
 try{
  const {csrf}=await session();
  async function send(data,includeToken=true){
   const headers={'content-type':'application/json'};if(includeToken)headers['x-demo-csrf']=csrf;
   const response=await fetch('/api/demo/tickets',{method:'POST',credentials:'same-origin',headers,body:JSON.stringify(data),signal:AbortSignal.timeout(50000)});
   const raw=await response.json();
   return {http:response.status,body:raw};
  }
  let replies;
  if(kind==='parallel')replies=await Promise.all([send(body),send(body)]);
  else if(kind==='conflict')replies=await Promise.all([send(body),send({...body,message:examples.refund.message})]);
  else if(kind==='retry')replies=[await send(body),await send(body)];
  else if(kind==='short')replies=[await send({...body,message:'Help'})];
  else if(kind==='contact')replies=[await send({...body,message:examples.email.message})];
  else if(kind==='identity')replies=[await send({...body,ticketId:'DEMO-CALLER-ID-NOT-ALLOWED'})];
  else if(kind==='csrf')replies=[await send(body,false)];
  const accepted=r=>[200,202].includes(r.http)&&['AUTO_ROUTED','PENDING_REVIEW','PROCESSING'].includes(r.body.status);
  let matched=false;
  if(kind==='parallel')matched=replies.every(accepted)&&replies[0].body.ticketRef===replies[1].body.ticketRef&&replies.some(r=>r.body.status!=='PROCESSING');
  else if(kind==='conflict')matched=replies.filter(accepted).length===1&&replies.filter(r=>r.http===409&&r.body.error==='REQUEST_CONFLICT').length===1;
  else if(kind==='retry')matched=replies.every(accepted)&&JSON.stringify(replies[0])===JSON.stringify(replies[1]);
  else matched=replies[0].http===(kind==='csrf'?403:400);
  const unavailable=replies.some(r=>[429,502,503,504].includes(r.http));
  const expected={parallel:'Both requests accepted for the same ticket reference; a processing reply may occur.',conflict:'One accepted request and one HTTP 409 conflict.',retry:'Identical HTTP response and saved ticket reference on retry.',short:'HTTP 400 validation rejection.',contact:'HTTP 400 validation rejection.',identity:'HTTP 400: callers cannot choose stored ticket IDs.',csrf:'HTTP 403: missing security token rejected.'};
  if(replies.some(accepted)){rememberTicket(body.requestId);await loadSavedTicket(body.requestId);}
  const details=replies.map((r,i)=>'Request '+(i+1)+': HTTP '+r.http+(accepted(r)?' · '+r.body.status+' · ticket '+String(r.body.ticketRef||'not returned'):' · rejected or unavailable'));
  showCheck(unavailable?'Inconclusive — service unavailable or rate limited':matched?'Response check passed':'Response check failed',['Expected: '+expected[kind],...details,'Database effects were not independently verified by this browser check.']);
 }catch{showCheck('Inconclusive — connection or timeout',['No successful result can be claimed. Check service availability before trying again.']);}
 finally{checkRunning=false;submit.disabled=false;for(const b of checkButtons)b.disabled=false;void refreshSubmissionHistory();}
});

if(new URLSearchParams(location.search).get('view')==='checks'){
 document.body.classList.add('checks-only');
 document.querySelector('.section-title h2').textContent='Choose a test to run';
 document.querySelector('.muted').textContent='These checks use fixed synthetic tickets. Click a test. Each run can create demo records.';
 message.required=false;
}

let ticketIds=[],selectedTicket=null,workspaceKey=null;
const savedTickets=new Map();
function renderTicketList(){
 const list=document.querySelector('#ticket-list');list.replaceChildren();
 if(!ticketIds.length){const p=document.createElement('p');p.textContent='No tickets submitted in this session yet.';list.append(p);return;}
 for(const id of ticketIds){const t=savedTickets.get(id);const button=document.createElement('button');button.type='button';button.className='ticket-row';button.setAttribute('aria-pressed',String(id===selectedTicket));button.textContent=t?'Ticket '+t.ticketRef+' · '+t.status+' · '+(t.category||'Awaiting classification'):'Submitted ticket · load saved details';button.addEventListener('click',()=>{void loadSavedTicket(id);});list.append(button);}
}
async function restoreTickets(){
 const data=await session();const key='support-demo-requests:'+data.workspaceId;
 if(workspaceKey===key)return;workspaceKey=key;savedTickets.clear();selectedTicket=null;
 try{const stored=JSON.parse(localStorage.getItem(key)||'[]');ticketIds=Array.isArray(stored)?stored.filter(x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x)).slice(0,25):[];}catch{ticketIds=[];}
 renderTicketList();if(ticketIds.length)await loadSavedTicket(ticketIds[0]);
}
function rememberTicket(id){
 if(!ticketIds.includes(id))ticketIds=[id,...ticketIds].slice(0,25);
 if(workspaceKey)try{localStorage.setItem(workspaceKey,JSON.stringify(ticketIds));}catch{}
 renderTicketList();
}
async function loadSavedTicket(id){
 selectedTicket=id;renderTicketList();const detail=document.querySelector('#ticket-detail');detail.textContent='Loading saved ticket…';
 try{
 const {csrf}=await session();const r=await fetch('/api/demo/ticket-status',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-demo-csrf':csrf},body:JSON.stringify({requestId:id}),signal:AbortSignal.timeout(20000)});
 const b=await r.json();if(selectedTicket!==id)return;
 if(!r.ok||!b.ticket){detail.textContent=r.status===404?'Ticket not found in this session. It may belong to an expired or different session.':'Saved details are unavailable. The submission result above is separate; retry Refresh saved status.';return;}
 const t=b.ticket;savedTickets.set(id,t);renderTicketList();detail.replaceChildren();
 const heading=document.createElement('h3');heading.textContent='Ticket '+t.ticketRef;detail.append(heading);
 const facts=[['Saved status',t.status],['AI category',t.category],['Classification reason',t.reason||'No accepted AI explanation yet'],['Human review',t.requiresReview?'Waiting for a reviewer (decisions not enabled here)':t.status==='FAILED'?'Operator attention needed; not in a reviewer decision queue':'Not currently required'],['Review reason',t.reviewReason||'None'],['Policy version',t.policyVersion||'Not available'],['Created',t.createdAt],['Updated',t.updatedAt],['Customer message',t.message]];
 const dl=document.createElement('dl');for(const [label,value]of facts){const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=value;dl.append(dt,dd);}detail.append(dl);
 const title=document.createElement('h4');title.textContent='Saved activity timeline';detail.append(title);const events=document.createElement('ol');
 const labels={TICKET_CREATED:'Ticket received',AI_CLASSIFICATION_ACCEPTED:'AI classification saved',HUMAN_REVIEW_REQUESTED:'Sent for human review',MODEL_UNAVAILABLE:'Classification service failed',HUMAN_REVIEW_DECIDED:'Human review decision saved'};
 for(const event of t.events){const li=document.createElement('li');li.textContent=(labels[event.type]||event.type)+' · '+event.at+(event.to?' · '+event.to:'');events.append(li);}detail.append(events);
 const note=document.createElement('p');note.className='small';note.textContent='Activity is read from persisted audit records (up to 50 events). Times are returned by the database. Human-review actions are not enabled in this demo.';detail.append(note);return true;
 }catch{if(selectedTicket===id)detail.textContent='Could not load saved details. Check the demo connection and retry.';}
}
document.querySelector('#refresh-tickets').addEventListener('click',()=>{if(selectedTicket)void loadSavedTicket(selectedTicket);else void restoreTickets();});

function showHistoryReceipt(body){if(body.historyRecorded===false){const p=document.createElement('p');p.className='history-warning';p.textContent='Submission history could not be confirmed as saved. Ticket processing and its audit are separate; no logging guarantee is made.';result.append(p);}}
async function refreshSubmissionHistory(){
 const list=document.querySelector('#submission-history-list');if(!list)return;list.textContent='Loading saved submission activity…';
 try{const {csrf}=await session();const r=await fetch('/api/demo/submission-history',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-demo-csrf':csrf},body:'{}',signal:AbortSignal.timeout(10000)});const body=await r.json();if(!r.ok||!Array.isArray(body.history)){list.textContent='Submission history is unavailable. Not every request can be recorded when the logger or application is unavailable.';return;}list.replaceChildren();
 if(!body.history.length){list.textContent='No saved submission activity in this session yet. Earlier unrecorded rejections cannot be reconstructed.';return;}
 const labels={REJECTED:'Rejected before automation — no new ticket created by this attempt',PROCESSED:'Ticket successfully processed',PENDING_REVIEW:'Ticket pending human review — no decision made',PROCESSING_FAILED:'Ticket created, but processing failed — operator attention needed',PROCESSING:'Ticket exists and is still processing',UNCONFIRMED:'Outcome unconfirmed — saved ticket could not be verified'};
 for(const event of body.history){const card=document.createElement('article');card.className='submission-event';card.dataset.outcome=event.outcome;const h=document.createElement('h3');h.textContent=labels[event.outcome]||'Recorded submission outcome';const p=document.createElement('p');p.textContent=event.createdAt+' UTC · HTTP '+event.httpStatus+' · Attempt '+event.attemptRef+(event.ticketRef?' · Ticket '+event.ticketRef:'');card.append(h,p);if(event.errorCode){const reason=document.createElement('p');reason.textContent=event.errorCode+' — '+(errors[event.errorCode]||'This request could not be completed.');card.append(reason);}if(event.outcome==='PENDING_REVIEW'){const note=document.createElement('p');note.textContent='This state comes from the saved ticket; reviewer actions require a separately authorized feature.';card.append(note);}list.append(card);}
 }catch{list.textContent='Could not load submission activity. Requests may be unrecorded if the logger or application was unavailable.';}
}
document.querySelector('#refresh-history')?.addEventListener('click',()=>{void refreshSubmissionHistory();});
