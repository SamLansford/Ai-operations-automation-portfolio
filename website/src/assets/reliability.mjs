const root = document.querySelector("#reliability-dashboard");
if (root) {
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const status = root.querySelector("[data-status]"),
    history = root.querySelector("[data-history]"),
    detail = root.querySelector("[data-detail]"),
    more = root.querySelector("[data-more]");
  let cursor = null;
  if(new URLSearchParams(location.search).get("needsReview")==="1")root.querySelector("[data-review-filter]").value="review";
  const when = (x) =>
    x
      ? new Date(
          x.includes("T") ? x : x.replace(" ", "T") + "Z",
        ).toLocaleString()
      : "Not recorded";
  async function read(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw Error("unavailable");
    return r.json();
  }
  async function select(id) {
    detail.textContent = "Loading stored checks…";
    try {
      const run = await read("/api/reliability/runs/" + id);
      detail.replaceChildren();
      detail.append(el("h3", run.suite));
      if (run.counts.FAIL || run.counts.ERROR)
        detail.append(
          el(
            "p",
            "Needs human review — this recorded failure remains in history.",
            "review-attention",
          ),
        );
      detail.append(
        el(
          "p",
          run.outcome +
            " · " +
            run.environment +
            " · " +
            run.dependencyMode +
            " · " +
            run.provenance,
        ),
      );
      detail.append(
        el(
          "p",
          "Execution date: " +
            when(run.observedAt || run.completedAt || run.startedAt) +
            " · Duration: " +
            (run.durationMs === null
              ? "not recorded"
              : (run.durationMs / 1000).toFixed(2) + "s"),
        ),
      );
      detail.append(
        el(
          "p",
          "Freshness: " +
            run.freshness +
            (run.freshness === "UNKNOWN"
              ? " — tested code fingerprint unavailable"
              : run.freshness === "STALE"
                ? " — source/config differs from captured run"
                : " — captured source fingerprint matches; not an uptime guarantee"),
        ),
      );
      detail.append(
        el(
          "p",
          "Revision: " +
            (run.revision || "not available") +
            (run.dirty ? " (working copy changed)" : ""),
        ),
      );
      const counts = el("div", undefined, "result-counts");
      for (const key of ["PASS", "FAIL", "SKIP", "ERROR"])
        counts.append(
          el(
            "span",
            key + ": " + run.counts[key],
            "outcome outcome-" + key.toLowerCase(),
          ),
        );
      detail.append(counts);
      detail.append(
        el(
          "p",
          "Counts belong only to this run. Suites and category tags overlap; do not add them into a reliability score.",
          "small",
        ),
      );
      for (const limitation of run.limitations)
        detail.append(el("p", limitation, "small"));
      const coverage = el("details");
      coverage.append(el("summary", "Validation categories in this run"));
      for (const category of root.categoryNames || []) {
        const cases = run.results.filter((r) =>
          r.categories.includes(category),
        );
        coverage.append(
          el(
            "p",
            category +
              ": " +
              (cases.length
                ? cases.length + " recorded checks"
                : "NOT TESTED in this run"),
          ),
        );
      }
      detail.append(coverage);
      const list = el("div", undefined, "stored-checks");
      for (const result of run.results) {
        const card = el("article", undefined, "stored-check");
        card.append(
          el("h4", result.name),
          el(
            "strong",
            result.outcome,
            "outcome outcome-" + result.outcome.toLowerCase(),
          ),
        );
        if (result.durationMs !== null)
          card.append(el("p", result.durationMs + " ms", "small"));
        if (result.errorCode)
          card.append(
            el(
              "p",
              "Error: " + result.errorCode + " — raw diagnostics withheld",
            ),
          );
        if (result.categories.length)
          card.append(el("p", result.categories.join(" · "), "small"));
        if (Object.keys(result.evidence).length)
          card.append(el("pre", JSON.stringify(result.evidence, null, 2)));
        list.append(card);
      }
      detail.append(list);
      const link = el("a", "Stored evidence JSON");
      link.href = "/api/reliability/runs/" + run.runId;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      detail.append(link);
    } catch {
      detail.textContent =
        "Stored run could not be loaded. No PASS is assumed.";
    }
  }
  async function load(append = false) {
    status.textContent = "Loading stored test evidence…";
    try {
      const data = await read(
        "/api/reliability/runs?limit=20" +
          (root.querySelector("[data-review-filter]")?.value === "review"
            ? "&needsReview=1"
            : "") +
          (append && cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
      root.categoryNames = data.categories;
      if (!append) history.replaceChildren();
      if (!data.runs.length && !append) {
        status.textContent =
          root.querySelector("[data-review-filter]")?.value === "review"
            ? "No failed or errored runs need review in this filter."
            : "NO RESULTS — no test run has been stored.";
        detail.textContent =
          root.querySelector("[data-review-filter]")?.value === "review"
            ? "No failed or errored runs match this filter. All recorded runs remain in the full history."
            : "NOT TESTED: no stored evidence is available.";
        more.hidden = true;
        return;
      }
      for (const run of data.runs) {
        const b = el(
          "button",
          run.suite +
            " · " +
            run.outcome +
            " · " +
            when(run.observedAt || run.completedAt),
          "run-row",
        );
        b.type = "button";
        b.addEventListener("click", () => {
          void select(run.runId);
        });
        history.append(b);
      }
      cursor = data.nextCursor;
      more.hidden = !cursor;
      status.textContent =
        "Stored evidence loaded. Select a run to inspect its actual checks.";
      if (!append) await select(data.runs[0].runId);
    } catch {
      status.textContent =
        "Results service unavailable. No passing status is assumed.";
      history.replaceChildren();
      detail.textContent =
        "Try refreshing when the read-only results service is available.";
      more.hidden = true;
    }
  }
  root.querySelector("[data-refresh]").addEventListener("click", () => {
    void load();
  });
  more.addEventListener("click", () => {
    void load(true);
  });
  root.querySelector("[data-review-filter]")?.addEventListener("change", () => {
    cursor = null;
    void load();
  });
  const runButton=root.querySelector('[data-run-safe]'),progress=root.querySelector('[data-validation-progress]');
  let validationSession=null,running=false,requestId=null;
  async function availability(){
    if(!runButton||running)return;
    try{const r=await fetch('/api/validation/session',{credentials:'same-origin',signal:AbortSignal.timeout(12000)});const b=await r.json();validationSession=r.ok&&b.available?b:null;runButton.disabled=!validationSession||b.busy;
      if(!running)progress.textContent=validationSession?(b.busy?'Another validation is running. Check availability shortly.':'Ready: fixed isolated/mock checks only. No ticket, database-integration or workflow tests.'):'Safe validation unavailable. No test execution can start.';
    }catch{validationSession=null;runButton.disabled=true;progress.textContent='Safe validation unavailable. No passing status is assumed.';}
  }
  function showJob(job){
    progress.replaceChildren();progress.append(el('p',job.state+' · '+(job.outcome||'Running')+' · '+(job.durationMs/1000).toFixed(1)+'s · isolated/mock checks'));
    const list=el('ol');for(const step of job.steps){const li=el('li',step.label+' — '+step.state+(step.outcome?' / '+step.outcome:'')+(step.durationMs!==undefined?' · '+(step.durationMs/1000).toFixed(2)+'s':''));if(step.runId&&step.persistence==='MYSQL'){const b=el('button','Inspect stored checks','text-link');b.type='button';b.addEventListener('click',()=>{void select(step.runId);});li.append(b);}if(step.persistence&&step.persistence!=='MYSQL')li.append(el('span',' · Database persistence not confirmed; retained locally when possible.'));list.append(li);}progress.append(list);
    if(job.state==='COMPLETED')progress.append(el('p',Object.entries(job.counts).map(([k,v])=>k+': '+v).join(' · ')));
  }
  runButton?.addEventListener('click',async()=>{
    if(running||!validationSession)return;running=true;runButton.disabled=true;requestId??=crypto.randomUUID();progress.textContent='Starting fixed safe validation…';
    try{const response=await fetch('/api/validation/jobs',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-validation-csrf':validationSession.csrf,'x-validation-request':requestId},body:'{}',signal:AbortSignal.timeout(12000)});let job=await response.json();if(!response.ok){progress.textContent=response.status===429?'Validation start limit reached. Try again later.':response.status===409?'Validation is already running. Try again after it completes.':'Validation cannot start. Check local service availability.';return;}
      const until=Date.now()+140000;showJob(job);
      while(job.state!=='COMPLETED'&&Date.now()<until){await new Promise(r=>setTimeout(r,1000));const r=await fetch('/api/validation/jobs/'+job.jobId,{credentials:'same-origin',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('JOB_UNAVAILABLE');job=await r.json();showJob(job);}
      if(job.state!=='COMPLETED'){progress.append(el('p','Polling deadline reached. No completion or passing status is assumed. The server owns its bounded job.'));return;}
      requestId=null;const filter=root.querySelector('[data-review-filter]');if(filter)filter.value='all';await load();const stored=[...job.steps].reverse().find(s=>s.runId&&s.persistence==='MYSQL');if(stored)await select(stored.runId);
    }catch{progress.textContent='Could not confirm validation status. Recorded failures are preserved; retry uses the same request identifier.';}
    finally{running=false;try{const r=await fetch('/api/validation/session',{credentials:'same-origin',signal:AbortSignal.timeout(12000)});const b=await r.json();validationSession=r.ok&&b.available?b:null;runButton.disabled=!validationSession||b.busy;}catch{runButton.disabled=true;validationSession=null;}}
  });
  root.querySelector('[data-refresh]')?.addEventListener('click',()=>{void availability();});
  void availability();
  void load();
}
