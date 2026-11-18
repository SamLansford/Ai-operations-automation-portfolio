const toggle = document.querySelector(".nav-toggle"),
  nav = document.querySelector("#primary-nav");
function closeMenu() {
  toggle?.setAttribute("aria-expanded", "false");
  nav?.classList.remove("is-open");
  toggle?.setAttribute("aria-label", "Open navigation");
}
toggle?.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
  nav.classList.toggle("is-open", open);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && toggle?.getAttribute("aria-expanded") === "true") {
    closeMenu();
    toggle.focus();
  }
});
nav?.addEventListener("click", (e) => {
  if (e.target.closest("a")) closeMenu();
});
const filters = [...document.querySelectorAll("[data-filter]")];
for (const b of filters)
  b.addEventListener("click", () => {
    for (const other of filters)
      other.setAttribute("aria-pressed", String(other === b));
    let n = 0;
    for (const card of document.querySelectorAll("[data-category]")) {
      card.hidden =
        b.dataset.filter !== "all" &&
        card.dataset.category !== b.dataset.filter;
      if (!card.hidden) n++;
    }
    document.querySelector("#filter-status").textContent =
      n + " project" + (n === 1 ? "" : "s") + " shown";
  });
document.querySelector("#check-report")?.addEventListener("click", async () => {
  const holder = document.querySelector("#report-state"),
    message = document.querySelector("#report-message"),
    button = document.querySelector("#check-report");
  button.disabled = true;
  message.textContent = "Checking the generated website report…";
  try {
    const r = await fetch(holder.dataset.reportUrl, {
      method: "HEAD",
      redirect: "error",
    });
    if (!r.ok) throw Error();
    const a = document.createElement("a");
    a.href = holder.dataset.reportUrl;
    a.textContent = "Open generated website report";
    a.className = "text-link";
    message.replaceChildren(a);
  } catch {
    message.textContent =
      "No generated report is available in this build. Run the local website tests and report command first.";
  } finally {
    button.disabled = false;
  }
});


const demoFrame=document.querySelector('.demo-frame');
if(demoFrame)window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==demoFrame.contentWindow||event.data?.type!=='support-demo-height')return;
 const height=event.data.height;if(Number.isFinite(height)&&height>=300&&height<=10000)demoFrame.style.height=Math.ceil(height)+'px';
});

const showcaseTabs = [...document.querySelectorAll(".showcase-tabs [role=tab]")];
function syncDemoView() {
  const reviewer = document.getElementById("reviewer-tab");
  if (!reviewer || !demoFrame) return;
  demoFrame.contentWindow?.postMessage({
    type: "support-demo-view", reviewer: reviewer.getAttribute("aria-selected") === "true"
  }, location.origin);
}
demoFrame?.addEventListener("load", syncDemoView);
function showDemoTab(selected) {
  for (const tab of showcaseTabs) {
    const active = tab === selected;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !active;
  }
  syncDemoView();
}
showcaseTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => showDemoTab(tab));
  tab.addEventListener("keydown", (event) => {
    const next = { ArrowLeft: 1-index, ArrowRight: 1-index, Home: 0, End: 1 }[event.key];
    if (!Number.isInteger(next)) return;
    event.preventDefault();
    showDemoTab(showcaseTabs[next]);
    showcaseTabs[next].focus();
  });
});
