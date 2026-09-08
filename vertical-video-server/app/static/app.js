/* Operator dashboard. Vanilla JS, no build step. */

const state = {
  config: null,
  tab: "projects",
  projectId: null,
  batchId: null,
  timer: null,
  draft: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const view = () => $("#view");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const fmtSeconds = (s) => {
  s = Math.round(Number(s) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}m` : m ? `${m}m${String(sec).padStart(2, "0")}s` : `${sec}s`;
};
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const badge = (s) => `<span class="badge ${esc(s)}">${esc(s)}</span>`;
const words = (t) => (String(t || "").match(/[A-Za-z0-9']+(?:-[A-Za-z0-9']+)*/g) || []).length;

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error("not authenticated");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

/* ------------------------------------------------------------------ auth */
function showLogin() {
  $("#login").hidden = false;
  $("#app").hidden = true;
  clearInterval(state.timer);
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/login", { method: "POST", body: { password: $("#password").value } });
    await boot();
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});

$("#logout").addEventListener("click", async () => {
  await api("/logout", { method: "POST" });
  showLogin();
});

document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    state.tab = btn.dataset.tab;
    state.projectId = null;
    state.batchId = null;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  })
);

async function boot() {
  try {
    await api("/me");
  } catch {
    showLogin();
    return;
  }
  $("#login").hidden = true;
  $("#app").hidden = false;
  state.config = await api("/config");
  renderQueueState();
  render();
  clearInterval(state.timer);
  state.timer = setInterval(refresh, 5000);
}

async function refresh() {
  try {
    state.config = await api("/config");
    renderQueueState();
    if (["projects", "jobs", "cost", "batches"].includes(state.tab) || state.projectId) render();
  } catch { /* transient */ }
}

function renderQueueState() {
  const q = state.config.queue, c = state.config.cost;
  const node = $("#queue-state");
  node.className = `queue ${q.paused ? "paused" : ""}`;
  node.textContent =
    `${q.paused ? `QUEUE PAUSED — ${q.reason}` : "queue running"} · ` +
    `${money(c.month_to_date_usd)}/${money(c.monthly_cap_usd)} this month · ` +
    `render_mode=${state.config.render_mode} · heygen ${state.config.heygen.mode}` +
    `${state.config.heygen.test ? " (test)" : ""} · cap ${state.config.heygen.max_segment_seconds}s/segment`;
}

/* ---------------------------------------------------------------- router */
function render() {
  if (state.projectId) return renderProject(state.projectId);
  if (state.batchId) return renderBatch(state.batchId);
  ({
    projects: renderProjects,
    new: renderNew,
    batches: renderBatches,
    jobs: renderJobs,
    exports: renderExports,
    cost: renderCost,
  }[state.tab] || renderProjects)();
}

function openProject(id) {
  state.projectId = id;
  render();
}

/* -------------------------------------------------------------- projects */
async function renderProjects() {
  const { projects } = await api("/projects");
  view().innerHTML = `
    <div class="row"><h2>Projects</h2><div class="spacer"></div>
      <button class="primary" id="go-new">New project</button></div>
    <div class="card"><table>
      <tr><th>Name</th><th>Tier</th><th>Length</th><th>Segments</th><th>Status</th>
          <th>Cost</th><th>Estimate</th><th></th></tr>
      ${projects.map((p) => `
        <tr>
          <td><a href="#" data-open="${p.id}">${esc(p.name)}</a>
            ${p.validation_ok ? "" : ' <span class="badge failed">script</span>'}
            ${p.source_project_id ? ' <span class="badge">re-cut</span>' : ""}</td>
          <td>${esc(p.tier)}</td>
          <td>${fmtSeconds(p.target_seconds)}</td>
          <td>${p.counts?.segments ?? "—"}</td>
          <td>${badge(p.status)}</td>
          <td>${money(p.cost_actual)}</td>
          <td class="muted">${p.estimate ? money(p.estimate.total_usd) : "—"}</td>
          <td><button data-open="${p.id}">open</button></td>
        </tr>`).join("")}
    </table></div>`;
  view().querySelectorAll("[data-open]").forEach((n) =>
    n.addEventListener("click", (e) => { e.preventDefault(); openProject(n.dataset.open); })
  );
  $("#go-new").addEventListener("click", () => {
    state.tab = "new";
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "new"));
    render();
  });
}

/* ------------------------------------------------------------ new project */
async function renderNew() {
  const d = state.draft || (state.draft = { name: "", seconds: 15, script: "", mode: "" });
  view().innerHTML = `
    <h2>New project</h2>
    <div class="grid two">
      <div class="card">
        <label>Name</label><input id="n-name" value="${esc(d.name)}" />
        <label>Target length (seconds)</label><input id="n-seconds" type="number" min="15" max="10800" value="${d.seconds}" />
        <label>Render mode</label>
        <select id="n-mode">
          <option value="">default (${esc(state.config.render_mode)})</option>
          <option value="composition">composition (HeyGen)</option>
          <option value="beats">beats (ComfyUI)</option>
        </select>
        <label>Template id (blank uses HEYGEN_TEMPLATE_ID)</label><input id="n-template" />
        <label>Script</label>
        <textarea id="n-script" rows="10" placeholder="Full narration. The planner splits it into beats.">${esc(d.script)}</textarea>
        <div class="row" style="margin-top:.6rem">
          <label style="margin:0"><input type="checkbox" id="n-test" checked style="width:auto"> test render (watermarked, no credits)</label>
          <div class="spacer"></div>
          <button class="primary" id="n-create">Plan it</button>
        </div>
        <p class="error" id="n-error"></p>
      </div>
      <div class="card" id="shape"></div>
    </div>`;

  const refreshShape = async () => {
    const seconds = Number($("#n-seconds").value) || 0;
    if (seconds <= 0) return;
    const s = await api(`/shape?target_seconds=${seconds}`);
    $("#shape").innerHTML = `
      <h3>What ${fmtSeconds(seconds)} becomes</h3>
      <p>Tier <b>${esc(s.tier)}</b> · <b>${s.segments}</b> segment(s) at the
         ${s.max_segment_seconds}s cap · word budget ~<b>${s.word_budget}</b>
         ${s.word_cap ? `· hard cap <b>${s.word_cap}</b> words` : ""}</p>
      ${s.windows ? `<div class="lanes">${s.windows.map((w) => `
          <div class="lane" style="flex:${(w.end - w.start).toFixed(3)};--role:${
            state.config.role_colours[w.role] || "#888"};">
            <h4>${esc(w.role)}</h4>
            <div class="window">${w.start.toFixed(1)}–${w.end.toFixed(1)}s</div>
            <div class="count">${w.word_budget} words</div>
          </div>`).join("")}</div>
        <p class="muted">Hook cap ${state.config.hook.max_words} words, pattern break inside
           ${state.config.hook.pattern_break_seconds}s.</p>` : ""}
      ${s.chapters ? `<p>~<b>${s.chapters}</b> chapters, each independently renderable and resumable.</p>` : ""}`;
  };
  $("#n-seconds").addEventListener("input", () => { state.draft.seconds = Number($("#n-seconds").value); refreshShape(); });
  refreshShape();

  $("#n-create").addEventListener("click", async () => {
    $("#n-error").textContent = "";
    try {
      const body = {
        name: $("#n-name").value || "untitled",
        target_seconds: Number($("#n-seconds").value),
        script: $("#n-script").value,
        test: $("#n-test").checked,
      };
      if ($("#n-mode").value) body.render_mode = $("#n-mode").value;
      if ($("#n-template").value) body.template_id = $("#n-template").value;
      const res = await api("/projects", { method: "POST", body });
      state.draft = null;
      openProject(res.project.id);
    } catch (err) {
      $("#n-error").textContent = err.message;
    }
  });
}

/* --------------------------------------------------------- project detail */
async function renderProject(id) {
  const data = await api(`/projects/${id}`);
  const p = data.project, prog = data.progress, v = data.validation || {};
  const jobs = (await api(`/jobs?project_id=${id}&limit=40`)).jobs;
  const hooks = (await api(`/projects/${id}/hooks`)).hooks;

  view().innerHTML = `
    <div class="row">
      <button id="back">&larr; projects</button>
      <h2 style="margin:0">${esc(p.name)}</h2>
      ${badge(p.status)}
      <span class="muted mono">${esc(p.tier)} · ${fmtSeconds(p.target_seconds)} ·
        ${prog.segments_total} segment(s) · ${prog.chapters_total} chapter(s) ·
        render_mode=${esc(p.render_mode)}</span>
      <div class="spacer"></div>
      <button class="primary" id="start">Start</button>
      <button id="pause">Pause</button>
      <button id="replan">Replan</button>
      <button id="export">Queue export</button>
      <button class="danger" id="cancel">Cancel</button>
    </div>
    <p class="error" id="p-error">${esc(p.error || "")}</p>
    ${renderValidation(v)}
    ${renderEstimate(p, prog)}
    ${renderProgress(prog)}
    ${p.tier === "short" ? renderLanes(prog) : renderChapters(prog)}
    ${renderHooks(hooks)}
    ${prog.output_path ? `<div class="card"><h3>Final</h3>
        <video controls src="/api/media?path=${encodeURIComponent(prog.output_path)}"
               style="max-height:60vh;border-radius:8px"></video>
        <p class="mono muted">${esc(prog.output_path)}</p></div>` : ""}
    <div class="card"><h3>Jobs</h3>${jobsTable(jobs)}</div>`;

  $("#back").addEventListener("click", () => { state.projectId = null; render(); });
  $("#start").addEventListener("click", () => act(`/projects/${id}/start`));
  $("#pause").addEventListener("click", () => act(`/projects/${id}/pause`));
  $("#cancel").addEventListener("click", () => act(`/projects/${id}/cancel`));
  $("#replan").addEventListener("click", () => act(`/projects/${id}/replan`));
  $("#export").addEventListener("click", async () => {
    await api("/exports", { method: "POST", body: { project_id: id, title: p.name } });
    state.tab = "exports"; state.projectId = null; render();
  });
  $("#confirm")?.addEventListener("click", () => act(`/projects/${id}/confirm`));
  wireLanes(id, prog);
  wireChapters();
  wireHooks(id);

  async function act(path) {
    try { await api(path, { method: "POST" }); render(); }
    catch (err) { $("#p-error").textContent = err.message; }
  }
}

function renderValidation(v) {
  const issues = v.issues || [];
  if (!issues.length) return "";
  return `<div class="card"><h3>Script validation</h3>${issues.map((i) => `
      <div class="notice ${i.level === "error" ? "bad" : ""}">
        <b>${esc(i.level)}</b> ${esc(i.code)} — ${esc(i.message)}
      </div>`).join("")}</div>`;
}

function renderEstimate(p, prog) {
  const e = p.estimate;
  if (!e) return "";
  const needs = p.status === "awaiting_confirmation";
  return `<div class="card">
    <div class="row"><h3 style="margin:0">Cost preflight</h3>
      <span class="muted">${esc(e.test_mode ? "test mode: watermarked, no credits" : "live renders")}</span>
      <div class="spacer"></div>
      <b>${money(e.total_usd)}</b>
      ${needs ? '<button class="primary" id="confirm">Confirm and allow spend</button>' : ""}
    </div>
    <table><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit cost</th><th>Cost</th><th>Note</th></tr>
      ${e.items.map((i) => `<tr><td>${esc(i.label)}</td><td>${i.quantity}</td><td>${esc(i.unit)}</td>
        <td>${money(i.unit_cost_usd)}</td><td>${money(i.cost_usd)}</td>
        <td class="muted">${esc(i.note)}</td></tr>`).join("")}
    </table>
    ${(e.notes || []).map((n) => `<div class="notice ${e.over_monthly_cap ? "bad" : ""}">${esc(n)}</div>`).join("")}
    <p class="muted mono">spent ${money(prog.cost_actual)} · month to date ${money(e.month_to_date_usd)}
       of ${money(e.monthly_cap_usd)} · disk ${prog.disk_mb} MB</p>
  </div>`;
}

function renderProgress(prog) {
  const pct = prog.percent || 0;
  return `<div class="card">
    <div class="row">
      <b>${prog.chapters_complete}/${prog.chapters_total} chapters</b>
      <div class="bar ${prog.segments_failed ? "failed" : ""}"><span style="width:${pct}%"></span></div>
      <span class="mono">${pct}%</span>
      <span class="muted mono">${prog.segments_complete}/${prog.segments_total} segments rendered
        ${prog.segments_failed ? `· ${prog.segments_failed} failed` : ""}</span>
    </div>
  </div>`;
}

/* short tier: four lanes, widths proportional to real duration */
function renderLanes(prog) {
  const beats = (prog.chapters[0]?.beats) || [];
  return `<div class="card">
    <h3>Beats</h3>
    <div class="lanes">
      ${beats.map((b) => `
        <div class="lane" style="flex:${b.duration_seconds.toFixed(3)};--role:${esc(b.colour)}">
          <h4>${esc(b.role)}</h4>
          <div class="window">${b.start_seconds.toFixed(1)}–${(b.start_seconds + b.duration_seconds).toFixed(1)}s</div>
          <div class="count" data-count="${b.index}">${b.words}/${b.word_budget} words</div>
          <textarea data-beat="${b.index}" data-budget="${b.word_budget}"
                    rows="4">${esc(b.narration)}</textarea>
        </div>`).join("")}
    </div>
    <div class="row"><button class="primary" id="save-beats">Save script</button>
      <span class="muted">Re-plans and re-validates. Nothing renders until you press Start.</span></div>
  </div>`;
}

function wireLanes(id, prog) {
  const areas = view().querySelectorAll("textarea[data-beat]");
  if (!areas.length) return;
  const update = (ta) => {
    const n = words(ta.value), budget = Number(ta.dataset.budget);
    const counter = view().querySelector(`[data-count="${ta.dataset.beat}"]`);
    counter.textContent = `${n}/${budget} words`;
    counter.classList.toggle("over", n > budget);
  };
  areas.forEach((ta) => { ta.addEventListener("input", () => update(ta)); update(ta); });
  $("#save-beats")?.addEventListener("click", async () => {
    const beats = (prog.chapters[0]?.beats || []).map((b, i) => ({
      narration: view().querySelector(`textarea[data-beat="${i}"]`).value,
      visual: b.visual,
    }));
    try {
      await api(`/projects/${id}`, { method: "PATCH", body: { spec: { beats } } });
      render();
    } catch (err) { $("#p-error").textContent = err.message; }
  });
}

/* mid/long: chapter list, segment boundaries drawn explicitly */
function renderChapters(prog) {
  return `<div class="card">
    <div class="row"><h3 style="margin:0">Chapters</h3>
      <span class="muted">hatched marks are seams — each one is an independent render joined with a
        ${state.config.video.crossfade_ms}ms crossfade</span></div>
    ${prog.chapters.map((c) => {
      const done = c.segments.filter((s) => s.status === "complete").length;
      const pct = c.segments.length ? Math.round((100 * done) / c.segments.length) : 0;
      return `<details class="chapter">
        <summary>
          <b>${c.index + 1}. ${esc(c.title)}</b>
          ${badge(c.status)}
          <span class="muted mono">${fmtSeconds(c.duration_seconds)} · ${c.segments.length} segment(s) ·
            ${money(c.cost)}</span>
          <div class="bar ${c.status === "complete" ? "complete" : c.status === "failed" ? "failed" : ""}">
            <span style="width:${pct}%"></span></div>
          <button data-rerender="${c.id}">re-render</button>
        </summary>
        <div class="body">
          ${c.error ? `<div class="notice bad error">${esc(c.error)}</div>` : ""}
          <div class="segstrip">
            ${c.segments.map((s, i) => `
              ${i ? '<div class="seam" title="seam"></div>' : ""}
              <div class="seg ${esc(s.status)}" style="flex:${s.duration_seconds.toFixed(2)}"
                   title="segment ${s.index} · ${s.duration_seconds.toFixed(1)}s · ${esc(s.status)}${
                     s.error ? " · " + esc(s.error) : ""}">
                ${s.index}</div>`).join("")}
          </div>
          ${c.segments.filter((s) => s.error).map((s) => `<div class="error">seg ${s.index}: ${esc(s.error)}</div>`).join("")}
          <div class="beatrow muted"><span>#</span><span>role</span><span>narration</span>
            <span>words</span><span>flags</span></div>
          ${c.beats.map((b) => `
            <div class="beatrow">
              <span class="role">${b.global_index}</span>
              <span class="role" style="color:${esc(b.colour)}">${esc(b.role)}</span>
              <span>${esc(b.narration) || '<span class="muted">(visual only)</span>'}</span>
              <span class="${b.words > b.word_budget ? "over" : ""}">${b.words}/${b.word_budget}</span>
              <span class="muted mono">${b.loopable ? "loop " : ""}${b.key_moment ? "key " : ""}${
                b.expensive ? "$$ " : ""}${esc(b.framing || "")}</span>
            </div>`).join("")}
          ${c.output_path ? `<p class="mono muted">${esc(c.output_path)}
            <a href="/api/media?path=${encodeURIComponent(c.output_path)}" target="_blank">play</a></p>` : ""}
        </div>
      </details>`;
    }).join("")}
  </div>`;
}

function wireChapters() {
  view().querySelectorAll("[data-rerender]").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await api(`/chapters/${btn.dataset.rerender}/rerender`, { method: "POST" });
      render();
    })
  );
}

/* hook variants */
function renderHooks(hooks) {
  return `<div class="card">
    <div class="row"><h3 style="margin:0">Hook variants</h3>
      <span class="muted">8 hooks, render the top 3 openings, pick from real output</span>
      <div class="spacer"></div>
      <button id="hooks-render">Render top 3</button></div>
    <textarea id="hooks-text" rows="4" placeholder="One hook per line">${
      esc(hooks.map((h) => h.text).join("\n"))}</textarea>
    <div class="row" style="margin:.4rem 0"><button id="hooks-save">Save hooks</button></div>
    ${hooks.length ? `<div class="videos">${hooks.map((h) => `
      <div>
        ${h.output_path ? `<video controls src="/api/media?path=${encodeURIComponent(h.output_path)}"></video>` : ""}
        <div class="mono ${h.valid ? "" : "error"}">${h.index + 1}. ${esc(h.text)}</div>
        <div class="muted mono">${h.word_count} words ${badge(h.status)}
          ${h.chosen ? '<span class="badge complete">chosen</span>' : ""}
          ${h.rejected ? '<span class="badge">reject kept</span>' : ""}</div>
        ${h.error ? `<div class="error">${esc(h.error)}</div>` : ""}
        <button data-choose="${h.id}">use this hook</button>
      </div>`).join("")}</div>` : ""}
  </div>`;
}

function wireHooks(id) {
  $("#hooks-save")?.addEventListener("click", async () => {
    const hooks = $("#hooks-text").value.split("\n").map((s) => s.trim()).filter(Boolean);
    await api(`/projects/${id}/hooks`, { method: "POST", body: { hooks } });
    render();
  });
  $("#hooks-render")?.addEventListener("click", async () => {
    await api(`/projects/${id}/hooks/render`, { method: "POST", body: { top_n: 3 } });
    render();
  });
  view().querySelectorAll("[data-choose]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/hooks/${b.dataset.choose}/choose`, { method: "POST" });
      render();
    })
  );
}

/* ---------------------------------------------------------------- batches */
async function renderBatches() {
  const { batches } = await api("/batches");
  view().innerHTML = `
    <h2>Batch mode</h2>
    <div class="card">
      <p class="muted">One block per short: first line is the name, the rest is the script.
         Blocks separated by a blank line. At four beats each this is affordable, and volume is
         the strategy at that length.</p>
      <label>Batch name</label><input id="b-name" value="batch" />
      <label>Seconds per short</label><input id="b-seconds" type="number" value="15" />
      <label>Shorts</label>
      <textarea id="b-items" rows="12" placeholder="Cold open&#10;You have been doing this wrong...&#10;&#10;Second short&#10;..."></textarea>
      <div class="row" style="margin-top:.5rem">
        <label style="margin:0"><input type="checkbox" id="b-start" style="width:auto"> queue immediately</label>
        <div class="spacer"></div><button class="primary" id="b-create">Create batch</button>
      </div>
      <p class="error" id="b-error"></p>
    </div>
    <div class="card"><h3>Batches</h3><table>
      <tr><th>Name</th><th>Shorts</th><th>Created</th><th></th></tr>
      ${batches.map((b) => `<tr><td>${esc(b.name)}</td><td>${b.count}</td>
        <td class="muted mono">${esc(b.created_at)}</td>
        <td><button data-batch="${b.id}">grid</button></td></tr>`).join("")}
    </table></div>`;

  view().querySelectorAll("[data-batch]").forEach((b) =>
    b.addEventListener("click", () => { state.batchId = b.dataset.batch; render(); })
  );

  $("#b-create").addEventListener("click", async () => {
    const blocks = $("#b-items").value.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const items = blocks.map((block) => {
      const [name, ...rest] = block.split("\n");
      return { name: name.trim(), script: rest.join(" ").trim(), target_seconds: Number($("#b-seconds").value) };
    });
    try {
      await api("/batches", {
        method: "POST",
        body: { name: $("#b-name").value, items, start: $("#b-start").checked },
      });
      render();
    } catch (err) { $("#b-error").textContent = err.message; }
  });
}

async function renderBatch(id) {
  const data = await api(`/batches/${id}`);
  view().innerHTML = `
    <div class="row"><button id="back">&larr; batches</button><h2 style="margin:0">${esc(data.batch.name)}</h2></div>
    <div class="videos">
      ${data.projects.map((p) => `
        <div class="card">
          ${p.output_path ? `<video controls src="/api/media?path=${encodeURIComponent(p.output_path)}"></video>`
            : '<div class="muted mono" style="aspect-ratio:9/16;display:grid;place-items:center">no output yet</div>'}
          <div><b>${esc(p.name)}</b></div>
          <div class="row">${badge(p.status)}<span class="muted mono">${money(p.cost_actual)}</span>
            <div class="spacer"></div><button data-open="${p.id}">open</button></div>
          ${p.error ? `<div class="error">${esc(p.error)}</div>` : ""}
        </div>`).join("")}
    </div>`;
  $("#back").addEventListener("click", () => { state.batchId = null; render(); });
  view().querySelectorAll("[data-open]").forEach((n) =>
    n.addEventListener("click", () => { state.batchId = null; openProject(n.dataset.open); })
  );
}

/* ------------------------------------------------------------------- jobs */
function jobsTable(jobs) {
  return `<table>
    <tr><th>Created</th><th>Step</th><th>Provider</th><th>Status</th><th>Try</th><th>Cost</th><th>Detail</th></tr>
    ${jobs.map((j) => `<tr>
      <td class="mono muted">${esc((j.created_at || "").replace("T", " ").slice(0, 19))}</td>
      <td class="mono">${esc(j.step)}</td>
      <td class="mono">${esc(j.provider || "—")}${j.provider_job_id ? `<br><span class="muted">${esc(j.provider_job_id)}</span>` : ""}</td>
      <td>${badge(j.status)}</td>
      <td>${j.attempts}</td>
      <td>${money(j.cost)}</td>
      <td>
        ${j.error ? `<div class="error">${esc(j.error)}</div>` : ""}
        <details class="raw"><summary class="muted">payload / response</summary>
          <pre>${esc(JSON.stringify({ payload: j.payload, response: j.response }, null, 2))}</pre>
        </details>
      </td></tr>`).join("")}
  </table>`;
}

async function renderJobs() {
  const { jobs } = await api("/jobs?limit=150");
  view().innerHTML = `<h2>Jobs</h2>
    <p class="muted">Provider errors are shown verbatim. Every job keeps the full payload it sent, so a
       video that lands can be diffed against one that does not.</p>
    <div class="card">${jobsTable(jobs)}</div>`;
}

/* ---------------------------------------------------------------- exports */
async function renderExports() {
  const { exports } = await api("/exports");
  const { projects } = await api("/projects?status=complete");
  view().innerHTML = `
    <h2>Export queue</h2>
    <p class="muted">Per-platform copy. Publishing is manual — nothing here posts anywhere.</p>
    <div class="card">
      <div class="row">
        <select id="x-project" style="max-width:280px">
          ${projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
        </select>
        <select id="x-platform" style="max-width:140px">
          <option value="tiktok">TikTok</option><option value="reels">Reels</option>
          <option value="shorts">Shorts</option><option value="other">Other</option>
        </select>
        <button class="primary" id="x-add">Add</button>
      </div>
    </div>
    <div class="card"><table>
      <tr><th>Platform</th><th>Title</th><th>Description</th><th>Hashtags</th><th>File</th><th>Status</th><th></th></tr>
      ${exports.map((x) => `<tr data-x="${x.id}">
        <td class="mono">${esc(x.platform)}</td>
        <td><input data-f="title" value="${esc(x.title)}" /></td>
        <td><textarea data-f="description" rows="2">${esc(x.description)}</textarea></td>
        <td><input data-f="hashtags" value="${esc((x.hashtags || []).join(" "))}" /></td>
        <td class="mono muted">${x.file_path ? `<a href="/api/media?path=${encodeURIComponent(x.file_path)}" target="_blank">open</a>` : "—"}</td>
        <td>${badge(x.status)}</td>
        <td><button data-save="${x.id}">save</button>
            <button data-pub="${x.id}">published</button>
            <button class="danger" data-del="${x.id}">×</button></td>
      </tr>`).join("")}
    </table></div>`;

  $("#x-add").addEventListener("click", async () => {
    const project_id = $("#x-project").value;
    if (!project_id) return;
    await api("/exports", { method: "POST", body: { project_id, platform: $("#x-platform").value } });
    render();
  });
  const readRow = (id) => {
    const row = view().querySelector(`tr[data-x="${id}"]`);
    return {
      title: row.querySelector('[data-f="title"]').value,
      description: row.querySelector('[data-f="description"]').value,
      hashtags: row.querySelector('[data-f="hashtags"]').value.split(/\s+/).filter(Boolean),
    };
  };
  view().querySelectorAll("[data-save]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/exports/${b.dataset.save}`, { method: "PATCH", body: readRow(b.dataset.save) });
      render();
    })
  );
  view().querySelectorAll("[data-pub]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/exports/${b.dataset.pub}`, { method: "PATCH", body: { ...readRow(b.dataset.pub), status: "published" } });
      render();
    })
  );
  view().querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/exports/${b.dataset.del}`, { method: "DELETE" });
      render();
    })
  );
}

/* ------------------------------------------------------------------- cost */
async function renderCost() {
  const c = await api("/cost");
  const paused = state.config.queue.paused;
  view().innerHTML = `
    <h2>Cost</h2>
    <div class="card">
      <div class="row">
        <b style="font-size:1.4rem">${money(c.month_to_date_usd)}</b>
        <span class="muted">of ${money(c.monthly_cap_usd)} this month · ${money(c.remaining_usd)} left</span>
        <div class="bar"><span style="width:${Math.min(100, (100 * c.month_to_date_usd) / (c.monthly_cap_usd || 1))}%"></span></div>
        <div class="spacer"></div>
        ${paused ? '<button class="primary" id="q-resume">Resume queue</button>'
                 : '<button class="danger" id="q-pause">Pause queue</button>'}
      </div>
      <p class="muted mono">by kind: ${Object.entries(c.by_kind).map(([k, v]) => `${k} ${money(v)}`).join(" · ") || "nothing spent"}</p>
    </div>
    <div class="grid two">
      <div class="card"><h3>Per video</h3><table>
        <tr><th>Project</th><th>Cost</th></tr>
        ${c.per_project.map((p) => `<tr><td><a href="#" data-open="${p.project_id}">${esc(p.name)}</a></td>
          <td>${money(p.cost_usd)}</td></tr>`).join("")}
      </table></div>
      <div class="card"><h3>Recent entries</h3><table>
        <tr><th>When</th><th>Kind</th><th>Amount</th><th>Detail</th></tr>
        ${c.recent.map((e) => `<tr><td class="mono muted">${esc(e.created_at.replace("T", " ").slice(0, 19))}</td>
          <td class="mono">${esc(e.kind)}</td><td>${money(e.amount_usd)}</td>
          <td class="mono muted">${esc(JSON.stringify(e.detail))}</td></tr>`).join("")}
      </table></div>
    </div>`;
  $("#q-pause")?.addEventListener("click", async () => {
    await api("/queue/pause", { method: "POST", body: { reason: "paused by operator" } });
    state.config = await api("/config"); renderQueueState(); render();
  });
  $("#q-resume")?.addEventListener("click", async () => {
    try {
      await api("/queue/resume", { method: "POST" });
      state.config = await api("/config"); renderQueueState(); render();
    } catch (err) { alert(err.message); }
  });
  view().querySelectorAll("[data-open]").forEach((n) =>
    n.addEventListener("click", (e) => { e.preventDefault(); openProject(n.dataset.open); })
  );
}

boot();
