/* infra-live.js - the platform build-out simulator.
   Usage:
     <div class="infrabox" data-mode="ladder" data-layers=""></div>
     <div class="infrabox" data-mode="egress"></div>
   data-layers = which layers start ON (comma list of:
     storage,catalog,orchestration,engine,semantic,mlops,gateway,selfserve,directread).

   Two traps:
     - "directread" (analytics reads straight from cloud object storage) is negligible
       at small volumes and dominates the bill at scale. Real S3 egress tiers.
     - turning on "selfserve" while "semantic" is OFF unblocks the client persona and
       immediately flags it red: confidently wrong answers from ungoverned metrics.

   Honesty rail: the cost arithmetic is real, computed live from published rate cards
   fetched 2026-08-06/07. The persona outcomes are a teaching model, not a simulation
   of any particular organization.
*/
(function () {
  "use strict";

  /* ---------- published rate cards (fetched 2026-08-06/07) ---------- */

  var RATES = {
    s3StorageGB: 0.023,          // S3 Standard, us-east-1, first 50TB
    r2StorageGB: 0.015,          // Cloudflare R2 Standard
    wasabiTB: 7.99,              // Wasabi Pay-Go, 1TB minimum
    /* S3 data-transfer-out tiers, after the 100GB/month free allowance */
    s3EgressTiers: [
      { upToGB: 10 * 1024, rate: 0.090 },
      { upToGB: 50 * 1024, rate: 0.085 },
      { upToGB: 150 * 1024, rate: 0.070 },
      { upToGB: Infinity, rate: 0.050 }
    ],
    s3FreeEgressGB: 100,
    warehouseHour: 4.00,         // representative lakehouse SQL compute, per hour
    catalogMonth: 400,           // managed catalog + governance baseline
    orchestrationMonth: 600,     // managed orchestration + observability
    semanticMonth: 900,          // semantic layer licence band
    biSeatMonth: 1200,           // BI seats for the analyst team
    gpuHour: 2.587,             // AWS p5 3yr All Upfront, per GPU-hour
    nvaieGpuYear: 4500,          // NVIDIA AI Enterprise, per installed GPU
    gpuCount: 8,
    tokensPerMillion: 2.50,      // blended LLM cost per million tokens
    gatewayMonth: 300,
    selfServeMonth: 1500
  };

  var DEFAULTS = { storedTB: 50, egressTB: 20, queryHours: 400, gpuHours: 200, tokensM: 40 };

  /* ---------- the eight layers ---------- */

  var LAYERS = [
    { key: "storage",       n: 1, label: "Storage",                 job: "Cheap durable bytes in open formats" },
    { key: "catalog",       n: 2, label: "Table format + catalog",  job: "ACID and one source of truth on object storage" },
    { key: "orchestration", n: 3, label: "Ingestion + orchestration", job: "Data arrives reliably, on schedule, observably" },
    { key: "engine",        n: 4, label: "Lakehouse engine",        job: "SQL at scale, modelled marts" },
    { key: "semantic",      n: 5, label: "Semantic layer + BI",     job: "Agreed metrics, dashboards, reports" },
    { key: "mlops",         n: 6, label: "Compute + MLOps",         job: "Train, register, deploy, monitor, CI/CD" },
    { key: "gateway",       n: 7, label: "LLM gateway + app runtime", job: "Routing, cost control, caching, observability" },
    { key: "selfserve",     n: 8, label: "Self-serve + governance", job: "Talk-to-data, permissions, lineage, attribution" },
    { key: "directread",    n: 0, label: "Analytics reads direct from cloud storage", job: "Skip the engine - query the object store over the internet", trap: true }
  ];

  /* ---------- the five personas ---------- */

  var PERSONAS = [
    { key: "de", label: "Data engineer",
      needs: ["storage", "catalog", "orchestration"],
      blocked: "No governed place to land data, and nothing to run the pipelines.",
      working: "Ingests, transforms and cleans on ACID tables, on a schedule, with lineage." },
    { key: "da", label: "Data analyst",
      needs: ["storage", "catalog", "orchestration", "engine", "semantic"],
      blocked: "Can write SQL, but every dashboard redefines the metrics.",
      working: "Builds dashboards and PDF reports on agreed metric definitions." },
    { key: "ds", label: "Data scientist",
      needs: ["storage", "catalog", "orchestration", "engine", "mlops"],
      blocked: "Can train in a notebook - nothing to register, deploy or monitor.",
      working: "Trains, registers, deploys and monitors models through CI/CD." },
    { key: "aie", label: "AI engineer",
      needs: ["storage", "catalog", "engine", "gateway"],
      blocked: "Can call an LLM, but with no routing, budget or audit trail.",
      working: "Ships LLM applications with cost control, fallbacks and traced prompts." },
    /* Deliberately does NOT require the semantic layer: a self-serve tool will happily
       answer without it. That is the trap - unblocked and confidently wrong. */
    { key: "client", label: "Business client",
      needs: ["storage", "catalog", "orchestration", "engine", "selfserve"],
      blocked: "Waits in the analyst queue for every question.",
      working: "Asks questions and self-builds dashboards on governed metrics." }
  ];

  /* ---------- cost model ---------- */

  function egressCostS3(gb) {
    var billable = Math.max(0, gb - RATES.s3FreeEgressGB), cost = 0, prev = 0, i;
    for (i = 0; i < RATES.s3EgressTiers.length; i++) {
      var t = RATES.s3EgressTiers[i];
      var band = Math.min(billable, t.upToGB) - prev;
      if (band > 0) { cost += band * t.rate; prev = Math.min(billable, t.upToGB); }
      if (billable <= t.upToGB) break;
    }
    return cost;
  }

  function computeBill(on, inputs) {
    var lines = [];
    var storedGB = inputs.storedTB * 1024;

    if (on.storage) {
      lines.push({ label: "Object storage (S3 Standard)", amount: storedGB * RATES.s3StorageGB });
    }
    if (on.catalog) lines.push({ label: "Catalog + governance", amount: RATES.catalogMonth });
    if (on.orchestration) lines.push({ label: "Orchestration + observability", amount: RATES.orchestrationMonth });
    if (on.engine) lines.push({ label: "Lakehouse query compute", amount: inputs.queryHours * RATES.warehouseHour });
    if (on.semantic) {
      lines.push({ label: "Semantic layer", amount: RATES.semanticMonth });
      lines.push({ label: "BI seats", amount: RATES.biSeatMonth });
    }
    if (on.mlops) {
      lines.push({ label: "GPU compute (AWS p5, 3yr reserved)", amount: inputs.gpuHours * RATES.gpuHour });
      lines.push({ label: "NVIDIA AI Enterprise (" + RATES.gpuCount + " installed GPUs)", amount: RATES.gpuCount * RATES.nvaieGpuYear / 12 });
    }
    if (on.gateway) {
      lines.push({ label: "LLM tokens", amount: inputs.tokensM * RATES.tokensPerMillion });
      lines.push({ label: "AI gateway", amount: RATES.gatewayMonth });
    }
    if (on.selfserve) lines.push({ label: "Self-serve + governance tooling", amount: RATES.selfServeMonth });

    var egress = 0;
    if (on.directread && on.storage) {
      egress = egressCostS3(inputs.egressTB * 1024);
      lines.push({ label: "Egress: analytics reading over the internet", amount: egress, trap: true });
    }

    var total = lines.reduce(function (a, l) { return a + l.amount; }, 0);
    return { lines: lines, total: total, egress: egress };
  }

  function personaState(p, on) {
    var missing = p.needs.filter(function (k) { return !on[k]; });
    if (missing.length) return { state: "blocked", missing: missing };
    if (p.key === "client" && !on.semantic) return { state: "warn" };
    return { state: "ok" };
  }

  /* ---------- rendering ---------- */

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function money(n) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }

  function rail(text) {
    var p = document.createElement("p");
    p.className = "ag-rail";
    p.textContent = text;
    return p;
  }

  function parseLayers(block) {
    var attr = block.getAttribute("data-layers");
    var start = attr === null ? "storage,catalog,orchestration,engine,semantic,mlops,gateway,selfserve" : attr;
    var on = {};
    LAYERS.forEach(function (l) { on[l.key] = false; });
    start.split(",").forEach(function (k) {
      k = k.trim(); if (on.hasOwnProperty(k)) on[k] = true;
    });
    return on;
  }

  /* ---- ladder mode ---- */

  function wireLadder(block) {
    block.classList.add("infrabox-ready");
    var on = parseLayers(block);
    var inputs = {
      storedTB: parseFloat(block.getAttribute("data-stored") || DEFAULTS.storedTB),
      egressTB: parseFloat(block.getAttribute("data-egress") || DEFAULTS.egressTB),
      queryHours: DEFAULTS.queryHours,
      gpuHours: DEFAULTS.gpuHours,
      tokensM: DEFAULTS.tokensM
    };

    var bar = document.createElement("div");
    bar.className = "sql-bar";
    bar.innerHTML = '<span class="sql-dot"></span><span class="sql-title">Platform build-out - who is unblocked, and what does it cost</span>';
    block.appendChild(bar);

    var layerWrap = document.createElement("div");
    layerWrap.className = "if-layers";
    block.appendChild(layerWrap);

    var bill = document.createElement("div"); bill.className = "if-bill";
    block.appendChild(bill);
    var personaWrap = document.createElement("div"); personaWrap.className = "if-personas";
    block.appendChild(personaWrap);
    var verdict = document.createElement("div");
    block.appendChild(verdict);
    block.appendChild(rail("The cost arithmetic is real: computed live in your browser from published rate cards fetched 2026-08-06/07 (AWS S3 storage and egress tiers, AWS p5 3-year reserved GPU rate, NVIDIA AI Enterprise per-installed-GPU list price). Vendor prices change fast - re-check before planning against them. The persona outcomes are a teaching model, not a simulation of your organization."));

    LAYERS.forEach(function (l) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "if-layer" + (on[l.key] ? " if-on" : "") + (l.trap ? " if-trap" : "");
      btn.innerHTML = '<span class="if-num">' + (l.trap ? "!" : l.n) + "</span>" +
        "<span>" + esc(l.label) + "<br><span style=\"font-weight:600;opacity:.75\">" + esc(l.job) + "</span></span>" +
        '<span class="if-cost"></span>';
      btn.addEventListener("click", function () {
        on[l.key] = !on[l.key];
        btn.classList.toggle("if-on", on[l.key]);
        render();
      });
      layerWrap.appendChild(btn);
    });

    function render() {
      var b = computeBill(on, inputs);
      var okCount = PERSONAS.filter(function (p) { return personaState(p, on).state === "ok"; }).length;

      bill.innerHTML =
        '<div class="ev-tile ev-money"><b>' + money(b.total) + '</b><span>estimated monthly bill</span></div>' +
        '<div class="ev-tile"><b>' + okCount + " / 5</b><span>personas fully unblocked</span></div>" +
        '<div class="ev-tile"><b>' + money(b.total * 12) + '</b><span>annualized</span></div>';

      personaWrap.innerHTML = "";
      PERSONAS.forEach(function (p) {
        var st = personaState(p, on);
        var d = document.createElement("div");
        d.className = "if-persona " + (st.state === "ok" ? "if-ok" : st.state === "warn" ? "if-warn" : "");
        var text;
        if (st.state === "ok") text = p.working;
        else if (st.state === "warn") text = "Answering confidently from ungoverned metrics - plausible SQL, wrong business logic.";
        else text = p.blocked;
        d.innerHTML = "<b>" + esc(p.label) + "</b><span>" + esc(text) + "</span>";
        personaWrap.appendChild(d);
      });

      var msgs = [];
      if (on.selfserve && !on.semantic) {
        msgs.push("TRAP - self-serve without a semantic layer. Your clients are unblocked and answering from ungoverned metrics. Microsoft's evaluation of Databricks Genie measured exactly this: 9.50% accuracy with an empty configuration, rising to 69.23% once column descriptions existed. You did not buy accuracy; you bought a tool that is as accurate as the metadata under it.");
      }
      if (on.directread && b.egress > 0) {
        msgs.push("EGRESS - reading " + inputs.egressTB + " TB/month over the internet adds " + money(b.egress) +
          " a month, " + money(b.egress * 12) + " a year, on AWS's published tiers. The same traffic costs $0 on Cloudflare R2, and $0 on Wasabi only while monthly egress stays under your stored volume. On S3, downloading a byte once costs about 3.9x storing it for a month.");
      }
      if (msgs.length) {
        verdict.className = "ag-verdict ag-fail";
        verdict.textContent = msgs.join("  ");
      } else if (okCount === 5) {
        verdict.className = "ag-verdict ag-pass";
        verdict.textContent = "All five personas working, at " + money(b.total) + " a month. Note the order that got you here: storage and catalog before anything, semantics before self-serve. Every layer you skipped would have shown up as a persona stuck or a client confidently wrong.";
      } else {
        verdict.className = "ag-verdict ag-quiet";
        verdict.textContent = "";
      }

      var costTiles = layerWrap.querySelectorAll(".if-cost");
      LAYERS.forEach(function (l, i) {
        if (!on[l.key]) { costTiles[i].textContent = ""; return; }
        var only = {}; LAYERS.forEach(function (x) { only[x.key] = false; });
        only[l.key] = true; only.storage = on.storage;
        var sub = computeBill(only, inputs);
        var amt = l.key === "storage" ? sub.total : sub.total - (on.storage ? inputs.storedTB * 1024 * RATES.s3StorageGB : 0);
        costTiles[i].textContent = money(Math.max(0, amt)) + "/mo";
      });
    }

    render();
  }

  /* ---- egress mode: the storage-economics comparison ---- */

  function wireEgress(block) {
    block.classList.add("infrabox-ready");

    var bar = document.createElement("div");
    bar.className = "sql-bar";
    bar.innerHTML = '<span class="sql-dot"></span><span class="sql-title">Storage economics - the same workload on four providers</span>';
    block.appendChild(bar);

    var ctrl = document.createElement("div");
    ctrl.className = "ev-ctrl";
    ctrl.innerHTML =
      '<label class="ev-lab">Stored <input class="ev-num if-stored" type="number" min="1" step="1" value="50"> TB</label>' +
      '<label class="ev-lab">Egress / month <input class="ev-num if-egress" type="number" min="0" step="1" value="20"> TB</label>';
    block.appendChild(ctrl);

    var table = document.createElement("div"); table.className = "ag-score-table";
    block.appendChild(table);
    var verdict = document.createElement("div");
    block.appendChild(verdict);
    block.appendChild(rail("Every figure is computed live from published rate cards fetched 2026-08-06/07: AWS S3 Standard storage and its four data-transfer-out tiers after the 100 GB monthly allowance, Cloudflare R2 Standard, and Wasabi Pay-Go. Wasabi's 1 TB billing minimum and 90-day minimum retention on pay-go are not modelled here - both matter for small or high-churn workloads."));

    function render() {
      var storedTB = parseFloat(block.querySelector(".if-stored").value) || 0;
      var egressTB = parseFloat(block.querySelector(".if-egress").value) || 0;
      var storedGB = storedTB * 1024, egressGB = egressTB * 1024;

      var s3 = storedGB * RATES.s3StorageGB + egressCostS3(egressGB);
      var r2 = storedGB * RATES.r2StorageGB;
      var wasabi = Math.max(1, storedTB) * RATES.wasabiTB;
      var wasabiOk = egressTB <= storedTB;

      var rows = [
        { name: "AWS S3 Standard", total: s3, note: "storage " + money(storedGB * RATES.s3StorageGB) + " + egress " + money(egressCostS3(egressGB)), ok: true },
        { name: "Cloudflare R2 Standard", total: r2, note: "storage only - egress is $0, with no ratio clause", ok: true },
        { name: "Wasabi Pay-Go", total: wasabi, note: wasabiOk
            ? "storage only - egress within the 1:1 policy"
            : "egress " + egressTB + " TB EXCEEDS stored " + storedTB + " TB - outside the free-egress policy", ok: wasabiOk }
      ];
      rows.sort(function (a, b) { return a.total - b.total; });

      table.innerHTML = "";
      rows.forEach(function (r) {
        var d = document.createElement("div");
        d.className = "ag-score-row " + (r.ok ? "ag-row-pass" : "ag-row-fail");
        d.innerHTML = '<span class="ag-mark">' + (r.ok ? "✓" : "!") + "</span>" +
          '<span class="ag-q">' + esc(r.name) + '<span class="ag-why">' + esc(r.note) + "</span></span>" +
          '<span class="ag-out">' + money(r.total) + " / month  ·  " + money(r.total * 12) + " / year</span>";
        table.appendChild(d);
      });

      var gap = s3 - r2;
      verdict.className = "ag-verdict " + (gap > 0 ? "ag-fail" : "ag-pass");
      verdict.textContent = "At " + storedTB + " TB stored and " + egressTB + " TB egressed a month, S3 costs " +
        money(gap) + " more than R2 - " + money(gap * 12) + " a year, almost all of it egress. Storage prices across these vendors differ about 3x; the egress gap is effectively infinite." +
        (wasabiOk ? "" : " And note Wasabi's row: exceeding the 1:1 egress-to-storage ratio is a terms-of-service risk, not a billed overage - there is no penalty rate, only the published right to limit or suspend service.");
    }

    block.querySelector(".if-stored").addEventListener("input", render);
    block.querySelector(".if-egress").addEventListener("input", render);
    render();
  }

  /* ---------- boot ---------- */

  function boot() {
    var blocks = document.querySelectorAll(".infrabox");
    Array.prototype.forEach.call(blocks, function (block) {
      if (block.classList.contains("infrabox-ready")) return;
      var mode = block.getAttribute("data-mode") || "ladder";
      if (mode === "egress") wireEgress(block); else wireLadder(block);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
