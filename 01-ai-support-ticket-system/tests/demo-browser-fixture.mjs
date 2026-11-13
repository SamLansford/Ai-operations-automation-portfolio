// UI-only deterministic fixture. No n8n/MySQL/model calls. Never used by normal startup.
import {createDemoServer} from '../demo/server.mjs';
const server=createDemoServer({secret:'browser-fixture-signing-000000000000000',webhookKey:'browser-fixture-webhook-000000000000000',origin:'http://127.0.0.1:8788',limit:100,fetch:async(_,opts)=>{
  const {message}=JSON.parse(opts.body);await new Promise(r=>setTimeout(r,700));
  if(message.includes('QA timeout'))throw Object.assign(Error(),{name:'TimeoutError'});
  if(message.includes('QA unavailable'))return new Response('{}',{status:503});
  if(message.includes('QA pending'))return new Response(JSON.stringify({processingStatus:'PENDING_REVIEW'}),{status:202});
  return new Response(JSON.stringify({processingStatus:'CLASSIFIED',classification:{category:'BILLING',reason:'Synthetic UI fixture: the fictional customer reports a duplicate charge.'}}),{status:200});
}});
server.listen(8788,'127.0.0.1',()=>console.log('UI FIXTURE ONLY: http://127.0.0.1:8788/support-ticket (no n8n/MySQL calls)'));
