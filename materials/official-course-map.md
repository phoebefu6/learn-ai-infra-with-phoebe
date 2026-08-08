# Official course map - learn-ai-infra-with-phoebe

Research date: 2026-08-06/07, four parallel research agents. **Every price and product fact carries a fetch date and must be re-verified before delivery** - this is the fastest-moving subject on the shelf. Prices came from vendors' machine-readable billing APIs (AWS Price List API, Azure Retail Prices API) wherever possible, never from marketing pages.

## Positioning
`deng` bucket, d3 - the platform-level capstone above learn-data-warehouse / learn-data-engineering / learn-analytics-engineering / learn-data-modeling. Those four teach how to build pieces; this one teaches how the pieces assemble into a platform that serves five personas, what each layer costs, and where the chokepoints are. Cross-links to learn-mcp (protocol), learn-rag / learn-ai-evals (the AI app layer), learn-data-governance (the policy layer).

**The deliverable:** a vendor-neutral reference architecture with named real options and cost bands per layer, mapped to DE / DA / DS / AI-engineer / client journeys.

## The organizing frame (this is the course's argument)

Eight layers. Each layer is taught by three questions: **what job does it do · which persona does it unblock · where is the chokepoint**. The chokepoint framing came out of the research and is the through-line: every layer in a modern stack is a fight over where truth lives and who holds the narrow waist.

| # | Layer | Job | Unblocks | The chokepoint |
|---|-------|-----|----------|----------------|
| 1 | Storage | cheap durable bytes, open formats | nobody yet | egress economics + retention terms |
| 2 | Table format + catalog | ACID + one source of truth on object storage | DE | **the catalog** (access control, credential vending, commit sequencing) |
| 3 | Ingestion + orchestration | data arrives reliably, observably | DE | the asset graph / DAG versioning |
| 4 | Lakehouse engine + transform | SQL at scale, modelled marts | DE -> DA | the compute contract |
| 5 | Semantic layer + BI | agreed metrics, dashboards, reports | DA | **metric definitions** |
| 6 | Compute + MLOps | train, register, deploy, monitor, CI/CD | DS | **the model registry** |
| 7 | LLM gateway + app runtime | routing, cost control, caching, observability | AI engineer | **the AI gateway** |
| 8 | Self-serve + governance | talk-to-data, permissions, lineage, cost attribution | clients | the semantic layer, again |

**The spine argument: self-serve is layer 8, not layer 1.** Every "let the business talk to the data" project that fails, fails because someone bought layer 8 while layers 2 and 5 were missing. The Microsoft ISE evaluation (below) is the evidence.

---

## VERIFIED FACTS - quote these exactly, with the fetch date

### Layer 1: storage economics (fetched 2026-08-06/07)

Storage list price, first tier, per TB-month, and egress:

| Provider | $/TB-month | Egress to internet |
|---|---|---|
| Wasabi Pay-Go | **$7.99** | $0, but capped at 1:1 vs stored volume (ToS risk, not billed) |
| Cloudflare R2 Standard | **$15.36** ($0.015/GB) | **$0, no ratio clause** |
| Cloudflare R2 Infrequent Access | **$10.24** ($0.01/GB) | $0 + $0.01/GB retrieval, 30-day minimum |
| Azure Blob Hot LRS (East US) | **~$21.30** ($0.0208/GB) | 100 GB free, then $0.08/GB |
| AWS S3 Standard (us-east-1) | **~$23.55** ($0.023/GB) | 100 GB free, then $0.09/GB |

- **AWS S3 tiers (Price List API, publicationDate 2026-08-06):** storage $0.023 / $0.022 (>50TB) / $0.021 (>500TB) per GB-month. Egress: first 100 GB/mo free (account-wide, all regions), then $0.090 (to 10TB) / $0.085 (next 40TB) / $0.070 (next 100TB) / $0.050 (>150TB) per GB. Requests: PUT/COPY/POST/LIST $5.00/million, GET $0.40/million.
- **THE HEADLINE NUMBER:** egressing 100 TB in one month = **$0 on R2**, **$0 on Wasabi only if you also store >=100 TB**, **~$8,563 on AWS**. Storage prices differ ~3x across vendors; the egress gap is effectively infinite.
- **THE RATIO THAT DRIVES ARCHITECTURE:** on S3, storage is $0.023/GB-month and egress is $0.09/GB - **downloading a byte once costs ~3.9x storing it for a month.**
- **Wasabi's free-egress policy, verbatim:** *"If your monthly egress data transfer is less than or equal to your active storage volume, then your storage use case is a good fit for Wasabi's free egress policy."* And: *"If your use case exceeds the guidelines of our free egress policy on a regular basis, we reserve the right to limit or suspend your service."* **This is a terms-of-service risk, not a metered overage** - there is no published penalty rate. Materially different risk profile from a billed line item.
- **Wasabi minimum storage duration, verbatim:** *"if stored objects are deleted before they have been stored with Wasabi for a certain number of days, a Timed Deleted Storage charge equal to the storage charge for the remaining days will be applied."* 90 days on Pay-Go, 30 on Reserved Capacity. Plus a 1 TB minimum billing (10 TB for Cloud NAS). So Wasabi is actively bad for short-lived, high-churn data.
- **Cloudflare R2 prices operations exactly 10% under AWS:** Class A $4.50/million vs S3 PUT $5.00; Class B $0.36/million vs S3 GET $0.40. R2 competes on zero egress and removes the counter-argument on operations. R2's zero-egress has **no ratio clause** - the stronger claim of the two.
- **AWS free-exit-egress (announced 2024-03-05, still live):** waives transfer-out for customers migrating off AWS, but **request-based, approval-gated, credited after the fact, and time-boxed to 90 days**. Regulation-driven (EU Data Act), not a rate-card change.

### Layer 2: table formats and the catalog war

- **The problem all formats solve:** object stores give cheap durable scale with **no transactions, no schema enforcement, no atomic multi-file operations**. A "table" is a directory of Parquet files. Open table formats add a transactional metadata layer over immutable data files.
- **Iceberg v3** (spec 2025): deletion vectors (row-level deletes without merge-on-read cost), row lineage (row ID + last-modified sequence number, making incremental/CDC a query not a diff job), VARIANT type, geospatial types.
- **Timeline:** Snowflake announces Polaris 2024-06-03 · **Databricks agrees to acquire Tabular 2024-06-04, reported north of $1B** (press-reported, never disclosed - label as REPORTED) · AWS S3 Tables 2024-12-03 · **Apache Polaris graduates to Top-Level Project 2026-02-19** · Databricks ships **Iceberg v3 GA + managed Iceberg in Unity Catalog 2026-05-28**.
- **The convergence claim (VENDOR, roadmap not shipped):** Databricks proposed Delta 5.0 adopt Iceberg v4's adaptive metadata tree, eliminating translation layers. **Iceberg v4 and Delta 5.0 are proposals. Do not teach convergence as accomplished fact.**
- **XTable translates METADATA, not data.** Say this explicitly - students assume interop means rewriting files. It does not. The Parquet was always compatible; only the metadata dialects differed. Same for Delta UniForm and OneLake metadata virtualization.
- **The battleground moved from format to catalog.** The catalog resolves metadata, controls access, vends credentials, sequences commits, and is the single API boundary between every engine and every byte. The Iceberg REST Catalog spec replaced per-engine connectors (Spark->Hive Metastore one way, Trino->Glue another) with plain HTTP, unlocking credential vending, remote signing, server-side commit conflict resolution, and scan planning with row filters applied before the plan returns.
- **The real lock-in surface is governance portability:** row-level security written in Unity Catalog does not transfer to Polaris. Catalog implementations: Apache Polaris (TLP), Snowflake Open Catalog (managed Polaris; free now, billing expected H1 2026 on REST API requests), Unity Catalog, AWS Glue/S3 Tables, Lakekeeper, Nessie, Gravitino, BigLake Metastore.
- **Honest trade-off nobody markets:** every translation layer is a second source of truth that can drift. UniForm-generated Iceberg metadata is derived, not authoritative - which is why Databricks' stated goal is eliminating translation entirely.
- **The three lakehouse vendors claim to unify three DIFFERENT axes** - Databricks unifies *workloads* (BI + ML on one copy), Microsoft Fabric unifies *organizational storage* (one OneLake per tenant, "You can't delete OneLake or create multiple OneLakes"), Snowflake unifies *workload types including transactional*. Ask which axis the actual pain sits on.
- **Medallion (bronze/silver/gold) is a naming convention, not a technology.** Nothing in Delta, Iceberg or Hudi enforces it. Value is shared vocabulary for "how cleaned is this table." Common failure: silver is bronze with renamed columns, gold is 40 unmaintained project tables.

### Layer 5: the semantic layer

- dbt Semantic Layer / MetricFlow (Apache 2.0, dbt v1.6+): semantic models -> entities (join keys), dimensions, measures, metrics. Serves via JDBC, GraphQL, Python SDK, and a **dbt MCP server**.
- **MetricFlow's real product is the join graph:** it "captures the types of each identifier and then helps users navigate to appropriate joins... to avoid the construction of fan out and chasm joins." A naive metrics layer silently double-counts on one-to-many joins. Students who learn only "define metrics in YAML" missed the hard part.
- **dbt's own admitted trade-offs:** requires a paid plan (Core users get local CLI only, no APIs/integrations); metered by "Queried Metrics"; "you're not materializing any data by default" so the warehouse pays compute on every query; no custom aggregations on measures.
- **The semantic layer is a compiler, not a storage layer.** It does not save warehouse spend; it moves cost from human duplication to machine compute plus a licence fee.
- Cube repositioned from "universal semantic layer" to "agentic analytics platform" with the same core product - teach reading the marketing shift.
- **Open Semantic Interchange (OSI)**, Snowflake-led, announced 2025-09-23: standardized YAML spec for exchanging semantic models. Partners include Alation, Atlan, BlackRock, Cube, dbt Labs, Hex, Mistral AI, Salesforce, Sigma, ThoughtSpot. (v1.0 date and repo UNVERIFIED - the dbt OSI blog post 404s.)

### Layer 3: orchestration

- **Airflow:** "an open-source platform for developing, scheduling, and monitoring **batch-oriented** workflows." Airflow 3.0 (2025-04-22) is the first architectural break in five years, and the reason is **security not features**: the Task Execution Interface + Task SDKs mean tasks no longer need direct metadata-DB access, unlocking multi-cloud and untrusted-tenant execution. Also DAG Versioning (a DAG runs to completion on the version it started with), React/FastAPI UI, event-driven scheduling.
- **Project-published adoption (ASF, 2025-04-22):** 30M monthly downloads (30x since 2020), 80,000 organizations (from 25,000), 30% use it for MLOps, 10% for GenAI workflows. **Airflow Survey 2025: 5,818 responses from 122 countries - but sponsored and run by Astronomer, the commercial Airflow vendor. Disclose this.**
- **Dagster:** asset-centric. An asset definition is "a description, in code, of an asset that should exist and how to produce and update that asset." **Dagster deprecated its own founding primitive** (ops "have largely been replaced by assets") - which means older Dagster tutorials actively mislead. The asset model changes what failure means: in a task graph green means "exited zero"; in an asset graph a materialization means "this table exists at this version from these inputs," so lineage is a by-product rather than a separate catalog project.
- **Prefect:** "turns your Python functions into production-grade data pipelines." Flows and tasks as decorated Python; workflows "can branch, loop, and create tasks at runtime, rather than DAGs declared up front." ("Negative engineering" is the historical founding thesis, absent from the current site - teach it as history.)
- **GitHub stars, fetched via API 2026-08-07:** apache/airflow 46,403 (17,536 forks) · PrefectHQ/prefect 23,565 (2,446) · cube-js/cube 20,564 (2,104) · dagster-io/dagster 15,940 (2,231) · dbt-labs/metricflow 1,729 (196). **State explicitly that stars are a weak proxy** - cumulative, never decay, reward age. Fork ratio is the better signal: Airflow's 0.38 forks-per-star vs 0.10-0.14 for others.
- **Vendor stat discrepancies to use as critical-reading exercises:** Cube's homepage claims 18,000 GitHub stars (actual 20,564). Prefect claims "50.7k+" (actual repo 23,565 - presumably an org-wide aggregate). LiteLLM says "100+ LLMs" on docs and "140+" on marketing. Vendor stat blocks are frozen marketing artifacts, not telemetry.

### Layer 6: compute, GPUs, MLOps

**NVIDIA AI Enterprise - the one published rate card (docs page updated 2026-06-08):**
| Term | List / GPU |
|---|---|
| 1 year | **$4,500** |
| 3 years | $13,500 |
| 4 years | $18,000 |
| **5 years** | **$18,000** (five years for the price of four) |
| Perpetual (incl. 5yr support) | $22,500 |
| Cloud marketplace | **$1.00/GPU-hour** + CSP instance cost |

- **Break-even: $1/GPU-hr = $8,760/GPU-year, crossing the $4,500 self-managed price at ~51% annual utilization.**
- **Licensed per INSTALLED GPU**, not per GPU used, and one licence per physical GPU on multi-GPU cards. An 8-GPU DGX B300 carries $36,000/year in licensing before hardware. This is the line item first-pass budgets miss.
- EDU/Inception/Connect: 75% off ($1,125/GPU/year).
- **NIM has no separate price** - it is the delivery format for the AI Enterprise entitlement. Tiers: free hosted prototyping (build.nvidia.com) -> free self-hosted for dev/test -> 90-day trial -> production licence. Same container artifact throughout, only the licence changes: deliberate, frictionless lock-in. (The 16-GPU free-tier cap traces to a **July 2024** blog - verified but 2 years stale, flag it.)
- **NVIDIA publishes software prices to the dollar and NO list price for any DGX system.** Every DGX figure in circulation (the ~$3M GB200 NVL72 rack) traces to an HSBC analyst estimate. Budget by quote, not catalog. The useful planning number is physical: **DGX B300 = ~14 kW in 10U**. The facility constrains you before the budget does.
- **"AI Factory" is branding, not a technical standard** - no independent certifying body. What is falsifiable underneath: validated node counts, certified-partner lists, and **the storage sizing rule: ~12.5 Gb/s of storage bandwidth per GPU, linear** (16 GPUs -> ~200 Gb/s; 256 GPUs -> ~3.2 Tb/s). That rule turns a vendor conversation into arithmetic.
- Certified-storage lists are **architecture-specific**: the DGX SuperPOD list (DDN, IBM, NetApp, Dell PowerScale, WEKA, Pure Storage, VAST Data) is a *subset* of the general NVIDIA-Certified Storage list (which adds HPE, Hitachi Vantara, Nutanix). "NVIDIA-certified" alone does not qualify a vendor for a SuperPOD buy.

**GPU cloud on-demand, per GPU-hour (fetched 2026-08-07, first-party feeds):**
| Accelerator | RunPod | Lambda | CoreWeave | AWS | Azure |
|---|---|---|---|---|---|
| H100 SXM 80GB | $2.69 | $3.99 | $6.155 | **$6.88** | **$12.29** |
| H200 141GB | $3.59 | not priced | $6.305 | $7.912 | - |
| B200 180GB | $5.89 | $6.69 | $8.60 | $14.24 | - |
| A100 80GB | - | $2.79 | $2.70 | $3.431 | - |

- **CoreWeave is NOT cheap on list** - $6.155 vs AWS $6.88 is an 11% discount, not the 2-3x the neocloud narrative implies. The real discounters are RunPod (2.56x) and Lambda (1.72x). CoreWeave's value is committed contracts (up to 60%, tiers unpublished) and InfiniBand fabric.
- **Two denominator traps:** CoreWeave publishes **per-instance** prices - divide by 8 or be wrong by 8x, and HGX shapes are sold as whole 8-GPU nodes only (no single-GPU SKU). And Lambda's committed clusters are **inverted**: a 16-GPU H100 cluster is $6.16/GPU-hr, **54% MORE** than the 8x on-demand $3.99, because you are buying fabric and guaranteed capacity.
- **AWS Savings Plans (first-party feed):** p5.48xlarge 3yr All Upfront = $20.6950/hr = **$2.587/GPU-hr, 62% off** on-demand. 1yr All Upfront = $4.045/GPU-hr (41% off).
- **Azure H100 SPOT at $2.27/GPU-hr is below AWS's 3-year reserved rate** and about half Lambda's on-demand. For interruptible batch - backfills, embedding regeneration, offline scoring - spot inside an existing contract is frequently the cheapest compute available, without leaving the security perimeter.
- **Prices move violently: AWS cut P5 by 44% effective 2025-06-01** (P5en -25%, P4d/P4de -33%). Azure's $98.32/hr for 8xH100 is *exactly* AWS's pre-cut price - never matched.
- **SemiAnalysis GPU Price Index composite: H100 $2.82/GPU-hr (April 2026), down 57% from $6.62 in 2H 2023.** Published list prices substantially overstate what the market actually pays.
- **DATA QUALITY LESSON:** the aggregator instances.vantage.sh labels AWS's 3yr-no-upfront rate ($23.777/hr) as "1-Year Reserved." AWS's real 1-year rates are $32-35/hr. **A 32% error in the most-linked GPU pricing aggregator.** Use first-party billing feeds.

**Build vs rent - the finding is about the literature:**
- **Seven of the nine top-ranking TCO analyses are published by GPU cloud providers or infrastructure vendors, and every one concludes "rent."** No peer-reviewed or neutral-consultancy public TCO model was found. **Teach this as the finding.**
- Commonly cited break-even: 50-70% sustained utilization (all vendor-sourced - directional, not measurement).
- **The critique that matters:** vendor thresholds are quoted against **on-demand** rates. Re-run against AWS 3-year reserved at $2.587/GPU-hr and the ownership case degrades sharply. Almost no vendor analysis does this comparison - that omission is the tell.
- SemiAnalysis (independent-ish, sells research to the industry) prices a 1,024-GPU H100 cluster at ~$35,375-39,750 capex per GPU all-in including network.
- **Depreciation is the assumption that decides the answer, and it is publicly contested:** CoreWeave uses 6 years (raised from 5), Nebius 4, **Amazon shortened a subset 6->5 years effective 2025-01-01, a $700M cut to operating income**, Meta *extended* its estimate in 2025. Two companies moved in opposite directions in the same year under identical technology. Nvidia argues 4-6 years (long-interested); Michael Burry argues 2-3 while holding ~$1.1B notional in puts (short-interested). **Frame the disagreement; do not settle it.**

**MLOps and the model registry:**
- **Definition to teach:** a model registry is the versioned system of record between experimentation and production - where a trained artifact becomes a governed, addressable, promotable object. Five properties: named versioned artifacts · mutable pointers for promotion · lineage to training run and data · metadata/annotations · approval gates.
- **Why it is THE governance chokepoint:** upstream is plural and messy (many experiments, notebooks, people); downstream is singular and consequential (one artifact serving traffic). The registry is the narrow waist where all four governance questions can be answered: what is in production, where did it come from, who approved it, how do I undo it. **Corollary: a registry developers can bypass by deploying from S3 provides zero governance regardless of its UI.**
- **MLflow deprecated Model Stages as of 2.9.0** in favour of aliases (`models:/MyModel@champion`) + tags. Stages encoded environment into the model object so "Production" meant different things in different clusters and you could not have two candidates at once. Aliases decouple pointer from artifact: `@champion` and `@challenger` coexist, rollback is a pointer reassignment.
- **Google's skew-vs-drift split beats a generic "drift" bucket:** training-serving skew is a bug you shipped (preprocessing mismatch, present day one - fix the code); prediction drift is the world changing under a correct model (retrain). Blurring them wastes weeks.
- **VENDOR RISK, live examples:** *"Amazon SageMaker Model Monitor is no longer open to new customers"* (verbatim, AWS docs) - a governance-critical component of a flagship service, quietly closed. Vertex AI is now "Gemini Enterprise Agent Platform." Check for these notices before designing around any managed feature.
- Kubeflow's own 2023 survey (90 responses): 49% in production; Pipelines 90%, Notebooks 76%, KServe 62%. Top gaps: documentation 55%, tutorials 50%. **90% Pipelines usage means most "Kubeflow adoptions" are really orchestration adoptions** - and KFP's portable IR means you can get the authoring model without the cluster. Rule of thumb: you need a platform team already running Kubernetes before Kubeflow is a net win.

### Layer 7: the LLM / AI gateway

- **Best primary definition (Azure API Management, doc updated 2026-06-25):** *"a set of capabilities that help you manage your AI backends effectively. Use these capabilities to secure, scale, monitor, and govern AI models, agents, and tools."* Note it *"extends API Management's existing API gateway; it's not a separate offering."*
- Capabilities verified across Azure/Kong/LiteLLM/Cloudflare/Portkey/MLflow: unified OpenAI-compatible API · routing and failover · cost tracking and budgets · token rate limiting · semantic + exact caching · observability · key management and guardrails.
- **Microsoft's stated motivation is the most concrete "why" any vendor gives:** with one app you cap TPM on the deployment; with twenty apps *"you need to make sure that one app doesn't use the whole TPM quota and block other apps."* It is a noisy-neighbour problem over prepaid throughput.
- **LiteLLM SDK vs Proxy - the rule to teach:** the SDK gives one application many providers; **the proxy gives many applications one governed door.** Anything needing a shared view across teams (budgets, attribution, key rotation, audit) is structurally impossible in the SDK.
- **Boundary cases:** **Amazon Bedrock is NOT a gateway** - its Converse API unifies the surface *for models AWS hosts*; it does not proxy first-party OpenAI/Anthropic APIs or do cross-provider attribution. Azure's docs treat Bedrock as *a backend the gateway manages*. **OpenRouter is only partly a gateway** - it runs its own credit billing rather than your provider accounts, so it intermediates the commercial relationship too: every prompt transits a third party, and you lose direct rate-limit negotiation.
- **The highest-leverage asset:** the gateway is where production traffic becomes an eval set (Azure logs prompts/completions to Azure Monitor; MLflow explicitly enables "dataset collection from real-world traffic for building evaluation benchmarks"). Ties directly to learn-ai-evals.
- **Honest trade-offs to teach as prominently as benefits:** (1) you inserted a single point of failure into 100% of AI traffic in the name of reliability - if it is down, healthy providers are effectively down too; (2) added latency on every call (LiteLLM rewrote its core in Rust and publishes p99 overhead precisely because buyers interrogate this - self-reported and unaudited); (3) unified APIs are lowest-common-denominator, which is why passthrough endpoints exist as escape hatches - an admission the abstraction leaks; (4) the gateway concentrates every provider key and every prompt in one system - **Palo Alto Networks acquiring Portkey (completed 2026-05-29) is the market pricing exactly this**; (5) vendor risk on the critical path - Cloudflare deprecated its Universal Endpoint, SageMaker Model Monitor closed to new customers.
- **THE STRUCTURAL INSIGHT (the course's best single line): MLflow, the canonical MLOps tool, now ships an AI gateway.** The **model registry is the chokepoint for models you train; the AI gateway is the chokepoint for models you rent.** Both answer the same four questions. Layers 6 and 7 are one governance pattern in two eras.

### Layer 8: self-serve / talk-to-your-data - THE EVIDENCE SECTION

**The number that sets expectations: GPT-4o scores 86.6% on Spider 1.0 and 10.1% on Spider 2.0** (632 real-world enterprise workflow problems; databases with 1,000+ columns, largest over 3,000; multiple dialects; queries often exceeding 100 lines). Same model. That gap is the distance between demo conditions and an enterprise warehouse.

**The fix is semantic context, not a better model - Microsoft ISE evaluation of Databricks Genie on LiveSQLBench (published 2026-05-07, bias-flagged: Microsoft evaluating a Databricks product, but with published reproducible methodology, unlike any vendor accuracy claim):**
| Condition | Accuracy |
|---|---|
| Genie, empty configuration | **9.50%** |
| Genie + column descriptions | **69.23%** |
| Genie + feedback mechanism (3 iterations) | **88.50%** |
| GitHub Copilot CLI (Claude Sonnet 4.5), metadata only | 66.70% |
| ...+ domain hints | 80.77% |

**A 7x improvement from metadata work.** You are not buying accuracy; you are buying a tool that will be as accurate as the semantic groundwork underneath it.

- **Databricks' own best-practices page is the honest product spec:** *"Quality table and column descriptions in Unity Catalog are critical for Genie accuracy"*, **"Genie Agents support up to 30 tables or views"**, **"Aim for five or fewer tables. The more focused your selection, the better"**. Five tables is a curated data mart, not an enterprise warehouse.
- **Microsoft's Power BI Copilot disclaimer is the slide-ready quote:** *"You need to prepare data to work with Copilot... Without this prep, Copilot can struggle to interpret data correctly - leading to generic, inaccurate, or even misleading outputs."* Also: when a question is not answerable from the semantic model, "it answers from the large language model's general knowledge" - an under-appreciated failure mode. And identical prompts return a **cached** response within a rolling 24-hour window.
- **Snowflake Cortex Analyst is the only vendor publishing a number: "90%+ SQL accuracy"** - on an **internal, unpublished 150-question suite**. To their credit they published methodology and the baseline: **GPT-4o single-shot scored 51% on that same internal eval despite 86.6% on public Spider 1.0**, and a semantic model lifted the same LLM from **57% to 78% on BIRD**. Databricks, ThoughtSpot and Microsoft publish **no accuracy figure at all** - treat the absence as informative.
- **Academic baselines:** BIRD human performance **92.96%**; best leaderboard system 81.95%. **LiveSQLBench (contamination-controlled) leader at 48%** as of 2026-03-02, most cluster 35-40%.
- **THE MOST SOPHISTICATED CAVEAT - the benchmarks are broken too.** Peer-reviewed, CIDR 2026, Jin/Choi/Zhu/Kang (UIUC): **"In BIRD Mini-Dev, we find that 52.8% of the problems contain annotation errors"** and **"Among its 121 problems with open-sourced gold SQL queries, we identify an annotation error rate of 66.1%"** for Spider 2.0-Snow. Re-evaluating agents after corrections moved one from 62% to 81% and from 4th to 1st place. Conclusion: *"annotation errors remain a barrier to robust benchmarking in text-to-SQL, with direct implications for leaderboard validity."*
- **So the honest teaching position: nobody currently has a trustworthy public measurement of enterprise text-to-SQL accuracy.** Any single number - 90% or 10% - is a claim about a specific setup, not a property of the technology. (Spider 2.0-Snow leaderboard tops at 96.70% from vendor self-submissions on a benchmark that is two-thirds mis-annotated.)
- **The failure mode that matters is not bad SQL - it is plausible SQL with wrong business logic.** Microsoft ISE: most remaining failures across all systems were "business logic errors" - incomplete aggregations, incorrect metric calculations, ambiguous interpretations. A syntactically valid query returning a confidently wrong number, with nothing to flag it. This is exactly why the semantic layer exists.

### Real platform builds (named, dated, with published outcomes)

- **Airbnb, the strongest teaching arc** - three artifacts, six years, one company's own engineering blog: **Dataportal** (2017, "Democratizing Data at Airbnb," discovery vs tribal knowledge) -> **Minerva** (2021-04-30, metrics platform: 12,000+ metrics, 4,000+ dimensions, 200+ data producers; COVID dashboard built in days, 11,000 views) -> **Metis** (2023-06-08, governance: Dataportal UI + Unified Metadata Service + Lineage Service on Apache Atlas; **100M+ lineage nodes, 300M+ edges, 1,000+ weekly data users**).
- **Uber Hudi** (2026-01-16, own blog): 19,500 Hudi datasets, 350 logical PB, **6 trillion rows/day ingested, 10 PB/day**, 350,000 commits/day, 4 million analytical queries/week, largest table 400+ billion rows; Record Index lookup 1-2ms; ingestion latency hours -> minutes.
- **Uber Michelangelo** (2024-05-02): ~400 active ML projects, 20,000+ training jobs/month, 5,000+ models in production, **10M real-time predictions/sec at peak**, 5,000+ GPUs.
- **GetYourGuide** (2025-01-29, own blog) - the honest migration case because it publishes **effort next to benefit**: Snowflake -> Databricks, 750 tables, **20% operational cost reduction**; PoC 1.5 months / 1 FTE, migration 4.5 months / ~2 FTE; 98%+ queries working post-migration, 72% under 10s.
- **LinkedIn OpenHouse** (2024-03-04): 3,500+ managed tables, 550+ daily active users, **6+ months reduction in time-to-market for dbt**, 50% reduction in end-user operational overhead.
- **Netflix**: Maestro (orchestration) + Metaflow (3,000+ AI/ML projects) - and notably Netflix does *not* publish a single unified all-persona portal the way Airbnb does. Useful contrast.
- **Spotify Backstage** is a **category error** if cited as a data platform - it is a software/service catalog and developer portal. Name the error explicitly; it is the canonical "one internal portal" pattern, not a data platform.

### Data mesh, honestly

- **Dehghani's original definition (2019-05-20) INCLUDES centralized governance and a shared platform:** *"an intentionally designed distributed data architecture, under centralized governance and standardization for interoperability, enabled by a shared and harmonized self-serve data infrastructure."* Slogan: "serving over ingesting." **Most "data mesh failed" stories are stories about organizations that dropped those two parts.**
- **Michelin's 3-year retrospective (2022-05-20, own blog) is the best honest retro found:** local teams **bypassed central tools and built redundant BI**; Michelin chose federation over mandate; semantic alignment across domains was harder than expected; they could initially measure only platform usage, not per-product quality. **60% of data used in local solutions came from central products by year 2 - federation beat mandate.**
- **JPMorgan's AWS-co-authored case study is headlined "drive significant value" and contains zero cost, time, scale or adoption numbers.** Show it as an example of the genre.

### Failure stories - and why the good ones are all ERP

**No named company has publicly cancelled a data-platform program with disclosed losses in 2024-2026.** Searched hard. **That vacuum is the lesson: ERP failures become public because auditors and shareholders force disclosure; data-platform failures stay private.**

- **Birmingham City Council / Oracle Fusion** - the strongest case because it is independently audited and still unfolding: original estimate **£19M** (2018, go-live target Dec 2020) -> approved budget £131M by 2024 -> **total forecast £144.4M through 2027/28**, with a separate report putting cumulative cost at **£216.5M by 2026**. Went live April 2022 knowing the system was unfit; testing incomplete because the build was too unstable to test. Custom bank reconciliation failed, leaving the council unable to produce auditable accounts. **Fraud-detection audit trail disabled 18+ months. £2 billion in transactions misallocated to the wrong fiscal years.** Grant Thornton's 66-page audit (Feb 2025) found the failures were **process failures - governance, technical oversight, vendor management - not resourcing or technical failures.**
- **Lidl / SAP** - abandoned 2018 after 7 years, ~€201M budgeted -> **~€500M spent**, reverted to legacy. **Root cause is a DATA MODEL conflict:** Lidl runs inventory on purchase price, SAP for Retail assumes retail price. Lidl refused to change the process, so the software was customized until the customization ate the project. Directly transferable to "conform to the platform's semantic layer or bend it."
- **Academic (arXiv 2606.08266, 2026-06-06)**, "What Went Wrong with Data Lakes? A 15-Year Reality Check": documentary analysis of 64 sources + ~500 field reality checks across Morocco and West Africa, 2010-2025. Qualitative synthesis, regional scope - **not a survey, say so.** Core thesis: **"governance debt."** Five-stage degradation: rapid ingestion -> governance deferral -> trust erosion -> retreat to warehouses -> archive state. **Usable swamp diagnostics: >50% of datasets lack ownership; <40% metadata completeness; >40% dormant datasets; >20% duplication; no automated quality validation.**

### Statistics: what may be cited, and what may not

**Usable with the caveat stated:**
- Gartner (2026-04-07, survey of **782 I&O leaders** Nov-Dec 2025): only **28%** of AI use cases in infrastructure & operations fully succeed and meet ROI expectations; **20% fail outright.**
- Gartner (2025-02-26, **248 data management leaders**): **63%** lack or are unsure they have the right data management practices for AI. (The companion "60% of AI projects abandoned through 2026" is a **prediction**, label it.)
- **MIT Project NANDA (Aug 2025): 95% of enterprise GenAI pilots deliver no measurable P&L return.** Methodology is thin - 52 executive interviews, 153 leader surveys, 300 public deployments - **always state the sample size.** Its least-quoted and most relevant finding: **buying from specialist vendors succeeded ~67% of the time; internal builds succeeded at roughly one-third that rate.** This belongs in the leader track as the honest counterweight to building a platform.
- dbt Labs 2026 State of Analytics Engineering (**363 practitioners**, released 2026-04-14): 83% say increasing trust in data is important (up from 66%); speed importance 50% -> 71%. **Vendor-sponsored, self-selecting audience - directional only.**

**DO NOT CITE (checked and rejected):** "Gartner says 85% of big data projects fail" (a 2017 analyst remark laundered into a permanent statistic) · "80% of data lake projects fail" (vendor blogs only) · any 2025/26 measured Iceberg-vs-Delta market share · the Ventana "51% Delta / 27% Iceberg" figure · shelfware and catalog-accuracy statistics from OvalEdge/Atlan/Sifflet · SaaS-sprawl numbers ("2,191 applications," "275 SaaS apps," "44% cite tool sprawl") · "Backstage has 89% market share" · Power BI Copilot accuracy percentages from consulting blogs · ThoughtSpot's 77.22% "Dialpad study" · any 2025/26 MLOps tool adoption survey · Airflow Survey version-adoption percentages (in Astronomer's report, not the ASF page) · Iceberg v4 / Delta 5.0 technical details beyond Databricks' own blog.

---

## infra-live.js canon - VERIFIED IN-BROWSER 2026-08-07, quote exactly

**Ladder canon** (defaults: 50 TB stored, 20 TB/month egress, 400 query-hours, 200 GPU-hours, 8 installed GPUs, 40M tokens):

| Layers on | Monthly bill | Personas unblocked |
|---|---|---|
| none | $0 | 0 / 5 |
| + storage | $1,178 | 0 / 5 |
| + catalog | $1,578 | 0 / 5 |
| + orchestration | $2,178 | **1 / 5** (DE) |
| + engine | $3,778 | 1 / 5 |
| + semantic + BI | $5,878 | **2 / 5** (DA) |
| + MLOps | $9,395 | **3 / 5** (DS) |
| + gateway | $9,795 | **4 / 5** (AI engineer) |
| + self-serve | **$11,295** | **5 / 5** ($135,540/yr) |

**Trap 1 - self-serve without semantics:** turn layer 5 off while layer 8 is on. The client persona stays *unblocked* but flips **red: "Answering confidently from ungoverned metrics - plausible SQL, wrong business logic."** Count drops to 3/5. The client deliberately does NOT require the semantic layer in the model, because a self-serve tool will happily answer without one - that is the entire lesson.

**Trap 2 - direct read (egress):** adds **$1,784/month, $21,402/year** at 20 TB, taking the bill to **$13,079/month**.

**Egress-mode canon** (50 TB stored / 20 TB egressed): Wasabi **$400/mo** ($4,794/yr) · Cloudflare R2 **$768/mo** ($9,216/yr) · AWS S3 **$2,961/mo** ($35,533/yr, of which $1,784 is egress). **S3 costs $2,193/month more than R2 - $26,317 a year, almost all of it egress.** Push egress above stored volume and the Wasabi row flips to a warning: outside the 1:1 free-egress policy, which is a suspension risk rather than a billed overage.

### Original design notes

**Mode `ladder`:** eight layer toggles. Three things move together: the **persona board** (5 personas flip blocked -> working, each with the specific job unlocked), the **monthly bill** (computed from volume inputs), and **coverage**.

Cost model inputs (defaults): 50 TB stored · 20 TB/month egressed to analytics · 400 warehouse query-hours · 200 GPU-hours · 40M LLM tokens.

**Trap 1 - the egress lever:** an "analytics reads directly from cloud storage" toggle. Negligible at 1 TB, dominant at 50 TB, computed from the real S3 tiers ($0.09/$0.085/$0.070/$0.050 per GB) against R2/Wasabi at $0.
**Trap 2 - self-serve before semantics:** turning on layer 8 while layer 5 is off unblocks clients on the board but flips them to a **red "answering confidently from ungoverned metrics"** state, citing the 9.50% empty-configuration number.

Honesty rail: the cost arithmetic is real and computed live from published rate cards fetched 2026-08-06/07; the persona outcomes are a teaching model, not a simulation of your organization.

---

## Per-session coverage - leader track (6 x 45 min)

| Session | Covers |
|---|---|
| a1 What AI infra actually is now | the eight layers, the persona map, what changed 2024-2026, the agent-grounding shift |
| a2 The layer map and what each buys | which persona each layer unblocks, why self-serve is layer 8, the chokepoint frame |
| a3 Build vs buy vs rent | the captured literature, depreciation as the deciding assumption, the MIT NANDA build-vs-buy finding |
| a4 The cost model | storage vs egress asymmetry, GPU rate reality vs list, NVAIE per-installed-GPU, token spend |
| a5 Real launches and honest failures | Airbnb's six-year arc, GetYourGuide's effort-and-benefit, Birmingham and Lidl, the failure-publication vacuum |
| a6 Your platform roadmap | sequencing that avoids shelfware, what to fund first, the questions to ask vendors |

## Per-session coverage - practitioner track (10 x 45 min)

| Session | Covers |
|---|---|
| b1 The eight layers and five personas | the frame, the ladder demo, the chokepoint idea |
| b2 Storage + open table formats | egress economics, retention terms, the format war, XTable translates metadata not data |
| b3 Catalog, lineage, governance | the REST catalog spec, credential vending, governance portability as the real lock-in |
| b4 Ingestion + orchestration | Airflow 3's security break, Dagster's asset model, choosing by failure semantics |
| b5 The lakehouse engine and the DA's surface | medallion honestly, SQL/Python surfaces, warehouse vs lakehouse convergence |
| b6 Semantic layer, dashboards, reporting | MetricFlow's join graph, metric truth as a chokepoint, PDF/report generation |
| b7 Compute + MLOps | GPU economics, the registry as narrow waist, aliases over stages, skew vs drift |
| b8 The LLM gateway and shipping AI apps | SDK vs proxy, the four capabilities, gateway as eval-set collector, the trade-offs |
| b9 Self-serve: talk-to-data, and why it comes last | the 10.1% number, the 9.50->69.23->88.50 ladder, five-table reality, broken benchmarks |
| b10 Capstone: your reference architecture | all eight layers costed and sequenced for your five personas, with a defence round |

## Not covered by design (honest list)
- Kubernetes operations and cluster administration -> named, not taught
- Network engineering, security architecture, hardware procurement
- Any single vendor's certification path
- Streaming architecture in depth (Kafka/Flink) -> pointer to deng shelf
- Data governance policy and regulation -> learn-data-governance, learn-ai-governance
- Agent construction -> learn-ai-agents, learn-mcp, learn-rag
