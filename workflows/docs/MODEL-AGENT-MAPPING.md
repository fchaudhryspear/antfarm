Here's every agent mapped to its optimal model, organized by swarm. I'm matching based on each agent's archetype and the specific cognitive demands of its role.

---

**📋 REQUIREMENTS SWARM (6 agents)**

| Agent | Model | Why |
|---|---|---|
| **intake-parser** | **Qwen 3.5:397b** | Forensic Linguist role needs broad NLP understanding, ambiguity resolution, structured extraction from messy natural language. Qwen 3.5's generalist strength and 201-language support handles diverse input formats best. |
| **product-strategist** | **Qwen 3.5:397b** | Product thinking requires breadth over depth — user empathy, market context, prioritization frameworks. Qwen 3.5's generalist reasoning fits better than a code-specialist model. |
| **technical-feasibility** | **DeepSeek V3.2** | "Staff Engineer 15yr" archetype demands the deepest technical reasoning on the list — assessing what exists, what breaks, what costs. V3.2's thinking mode and system-level comprehension is the closest to Opus-level architecture reasoning. |
| **security-compliance** | **DeepSeek V3.2** | Threat modeling requires methodical reasoning about attack surfaces, data flows, and compliance frameworks. V3.2's thinking mode excels at structured security analysis. |
| **ux-flow-designer** | **Kimi K2.5** | Best-in-class visual coding and UI understanding. Can reason about user flows, state coverage, and accessibility from a design-systems perspective. Native vision capability means it can reference UI patterns. |
| **prd-compiler** | **GLM-5** | Editor-in-Chief role synthesizes 4 domain reports into one executable JSON. GLM-5's strong instruction following (AA 50) and document processing keeps output structured and faithful. Synthesis ≠ deep reasoning — it needs reliability and format adherence. |

---

**🏗️ ARCHITECTURE SWARM (8 agents)**

| Agent | Model | Why |
|---|---|---|
| **arch-intake** | **Qwen 3.5:397b** | Bridge Translator parsing PRD into technical blocks is a structured extraction task. Qwen 3.5's broad technical vocabulary and strong instruction following handles the translation layer well. |
| **system-architect** | **DeepSeek V3.2** | This is the single most important agent to get right. Principal Systems Engineer needs to reason about boundaries, failure modes, scaling, and distributed system tradeoffs. V3.2 in thinking mode is the only model on your list that approaches Opus-level for this. |
| **api-designer** | **MiniMax M2.7** | REST contracts, validation schemas, versioning — this is detailed craftsman work where M2.7's deep-reading behavior (traces dependencies, analyzes call chains) produces more thorough API specs than faster models. 97% skill adherence matters for contract accuracy. |
| **data-architect** | **DeepSeek V3.2** | Schema design, index optimization, relationship modeling — requires deep reasoning about data access patterns, normalization tradeoffs, migration paths. V3.2's thinking mode handles the multi-variable optimization. |
| **frontend-architect** | **Kimi K2.5** | UI Systems Engineer needs to reason about component hierarchies, state management patterns, and bundle optimization. K2.5 dominates frontend architecture — it was trained on visual-to-code workflows and understands component systems natively. |
| **devops-architect** | **MiniMax M2.7** | Reliability Engineering needs production-systems thinking. M2.7 scored 57% on Terminal Bench 2 (complex operational logic) and demonstrated real production debugging capability — correlating monitoring metrics with deployment timelines. |
| **visual-designer** | **Kimi K2.5** | Mermaid flows, wireframes, design tokens — K2.5's visual coding capability is unmatched. It generates UI layouts from design specifications and handles design-system abstractions natively. |
| **arch-compiler** | **DeepSeek V3.2** | Chief Architect integrating 6 domain specs into one coherent architecture doc is the hardest synthesis task in the pipeline. V3.2's thinking mode can hold all 6 domains in context and reason about cross-cutting concerns. |

---

**⚡ IMPLEMENTATION SWARM (6 agents)**

| Agent | Model | Why |
|---|---|---|
| **scaffolder** | **Qwen3-Coder-Next** | Foundation building (migrations, deps, infra config) is structured code generation with tool interaction. Coder-Next's agentic design — it actually uses MCP tools, recovers from errors, and handles multi-step execution — makes it ideal for scaffolding where things often fail on first attempt. |
| **backend-engineer** | **Qwen3-Coder:480b** | Your validated Tier 1 Code model. Models, repos, services, routes, tests — this is sustained, high-volume backend code generation. The 480b's larger active parameter count gives it an edge on complex backend patterns over the sparser Coder-Next. |
| **backend-engineer-b** | **Qwen3-Coder-Next** | Edge Case Specialist handling webhooks, middleware, event handlers — these are shorter, more targeted implementations where Coder-Next's speed and agentic error recovery shine. It can iterate faster on tricky edge cases. |
| **frontend-engineer-a** | **Kimi K2.5** | Frontend Lead doing contexts, hooks, primary pages, types — K2.5 is the best frontend model on the list, period. It generates complete interactive layouts with animations from specs. |
| **frontend-engineer-b** | **Kimi K2.5** | Secondary pages, admin views, forms — same rationale. K2.5 handles the full spectrum of frontend work including form validation patterns and admin UI generation. |
| **devops-engineer** | **Qwen3-Coder-Next** | Monitoring configs, alarms, dashboards, CI/CD — these are highly structured, tool-heavy tasks where Coder-Next's reliability with tool calling and config file generation excels. |

---

**🔍 CODE REVIEW SWARM (11 agents)**

This is where MiniMax M2.7's deep-reading behavior becomes a pure asset. A reviewer that reads too much is a *good* reviewer.

| Agent | Model | Why |
|---|---|---|
| **security-auditor** | **DeepSeek V3.2** | Red Team Analyst running OWASP Top 10 analysis and SAST — requires reasoning about attack vectors, auth bypass scenarios, and injection patterns. V3.2's thinking mode methodically traces security implications. |
| **backend-architect** | **MiniMax M2.7** | Production Eng Reviewer assessing server-side architecture and DB patterns. M2.7's Terminal Bench 2 performance (57%) demonstrates exactly this capability — understanding complex operational logic, not just surface-level code patterns. |
| **code-quality** | **MiniMax M2.7** | Code Craftsman checking DRY, complexity, dead code, naming. M2.7 reads extensively before writing — it pulls in surrounding files, analyzes dependencies, traces call chains. That thoroughness catches quality issues other models miss. |
| **frontend-architect** | **Kimi K2.5** | UI Systems Reviewer needs to understand component architecture, state management antipatterns, and bundle optimization. K2.5's frontend specialization means it knows what good looks like. |
| **performance-engineer** | **MiniMax M2.7** | Performance Surgeon finding N+1 queries, bottlenecks, cold starts. M2.7 demonstrated the ability to correlate monitoring metrics with code patterns and identify missing database indexes in production scenarios. This is its strongest role. |
| **testing-strategist** | **GLM-5** | QA Architect assessing coverage, assertion quality, edge cases. GLM-5's strong agentic capability and instruction following makes it methodical about coverage analysis. It needs to be systematic, not creative. |
| **devops-engineer** | **MiniMax M2.7** | Reliability Auditor checking CI/CD, Docker, monitoring, secrets. M2.7's production-systems understanding (Terminal Bench 2) directly applies. |
| **documentation-specialist** | **Qwen 3.5:397b** | Technical Writer reviewing README, API docs, inline comments. Qwen 3.5's broad language capability and generalist strength produces better prose evaluation than code-specialist models. |
| **product-strategist** | **Qwen 3.5:397b** | Product-Minded Engineer checking feature completeness and user journey gaps. Same rationale as the requirements swarm version — product thinking needs breadth. |
| **ux-specialist** | **Kimi K2.5** | Accessibility-First Reviewer. K2.5 tops OCRBench (92.3%) and understands visual layouts natively. Best model for evaluating a11y, state coverage, and responsive design. |
| **consolidate** | **DeepSeek V3.2** | Technical Editor synthesizing 10 reports into prioritized JSON. This is the hardest synthesis task in the review swarm — it needs to weigh competing recommendations, resolve conflicts, and produce a coherent priority list. V3.2's thinking mode handles multi-source reasoning best. |

---

**🔧 CODE FIX SWARM (13 agents)**

| Agent | Model | Why |
|---|---|---|
| **setup** | **Qwen3-Coder-Next** | Advance Scout doing pre-flight, branching, shared file detection. Lightweight, tool-heavy, needs reliable execution. Coder-Next's agentic reliability is perfect. |
| **fix-security** | **DeepSeek V3.2** | Security Surgeon patching vulns with regression tests. Security fixes require understanding the vulnerability deeply enough to patch without breaking functionality. V3.2's thinking mode reasons through implications. |
| **fix-backend** | **Qwen3-Coder:480b** | Backend Surgeon fixing error handling, validation, patterns. Sustained code modification work where 480b's generation strength applies. |
| **fix-frontend** | **Kimi K2.5** | Frontend Surgeon fixing components, state, rendering. K2.5 for all frontend work. |
| **fix-performance** | **MiniMax M2.7** | Performance Surgeon fixing bottlenecks, queries, caching. M2.7 demonstrated reducing production incident recovery to under 3 minutes by tracing monitoring metrics to code — this is exactly that role. |
| **fix-code-quality** | **Qwen3-Coder-Next** | Code Janitor removing dead code, duplication, reducing complexity. These are targeted, well-scoped fixes where Coder-Next's speed and precision shine. |
| **fix-devops** | **Qwen3-Coder-Next** | Infrastructure Surgeon fixing CI/CD, Docker, monitoring config. Tool-interaction-heavy, structured fixes. |
| **fix-docs** | **Qwen 3.5:397b** | Technical Translator writing READMEs, docstrings, changelogs. Documentation needs good prose, not code depth. |
| **fix-tests** | **Qwen3-Coder-Next** | Test Surgeon writing missing unit/integration/edge tests. Test generation is Coder-Next's sweet spot — fast iteration, clear pass/fail signals for error recovery. |
| **fix-product** | **Qwen 3.5:397b** | Product Polish Specialist fixing UX gaps, error messages, routes. Product-facing changes need the generalist's understanding of user-facing quality. |
| **fix-ux** | **Kimi K2.5** | Accessibility Surgeon fixing a11y, loading states, responsive design. Frontend + accessibility = K2.5. |
| **consolidate-pr** | **MiniMax M2.7** | Release Engineer doing bisect rollback, integration test, PR creation. This is the "careful engineer" role — M2.7's thorough reading ensures the consolidated PR doesn't introduce regressions. |
| **post-review** | **MiniMax M2.7** | Integration Auditor verifying fixes didn't create new issues. Same deep-reading strength — M2.7 traces dependencies to find secondary effects. |

---

**✅ QA SWARM (5 agents)**

| Agent | Model | Why |
|---|---|---|
| **acceptance-validator** | **GLM-5** | Contract Auditor comparing PRD criteria vs actual code. Needs methodical, systematic comparison — not creative reasoning. GLM-5's strong instruction following and agentic capability handles structured validation well. |
| **e2e-tester** | **Qwen3-Coder-Next** | QA Automation Engineer writing & running E2E tests. Test authoring + execution is pure agentic coding. Coder-Next's tool use and error recovery means tests that actually run. |
| **load-tester** | **Qwen3-Coder-Next** | Performance QA Engineer writing k6/artillery scripts. Structured code generation for specific testing frameworks. |
| **regression-checker** | **MiniMax M2.7** | Regression Detective doing full suite runs and baseline comparison. M2.7's deep reading catches subtle regression patterns that faster models skip. |
| **qa-compiler** | **DeepSeek V3.2** | Quality Gate making GO/NO-GO/CONDITIONAL verdicts. This is a high-stakes judgment call that synthesizes all QA outputs. V3.2's thinking mode reasons through the tradeoffs before rendering a verdict. |

---

**🚀 RELEASE SWARM (4 agents)**

| Agent | Model | Why |
|---|---|---|
| **deploy-staging** | **Qwen3-Coder-Next** | Deployment Technician running deploy scripts and dry-run validation. Pure tool execution. Coder-Next's agentic reliability. |
| **smoke-tester** | **Qwen3-Coder-Next** | First User running HTTP smoke tests. Fast, targeted test execution. |
| **release-notes** | **Qwen 3.5:397b** | Technical Journalist writing changelog from git history. Needs good prose synthesis from structured data. |
| **release-compiler** | **DeepSeek V3.2** | Release Manager making deployment readiness assessment + rollback plan. High-stakes decision that needs thinking-mode reasoning about risk. |

---

**🎵 PIPELINE ORCHESTRATOR (4 agents)**

| Agent | Model | Why |
|---|---|---|
| **pipeline-controller** | **DeepSeek V3.2** | Orchestra Conductor chaining 8 swarms with artifact passing. The most complex coordination role — needs to reason about dependencies, handle failures gracefully, and manage state across the entire pipeline. V3.2's thinking-in-tool-use is critical here. |
| **gate-keeper** | **GLM-5** | Decision Facilitator sending approval summaries to Telegram. Needs clear, structured communication and reliable decision framing. GLM-5's instruction following keeps gate decisions clean. |
| **pipeline-reporter** | **Qwen 3.5:397b** | Operations Analyst generating timing and metrics reports. Report generation from structured data — generalist territory. |
| **retrospective** | **DeepSeek V3.2** | Improvement Engineer analyzing performance and making recommendations. Needs to reason about systemic patterns across pipeline runs. V3.2's deep reasoning finds non-obvious optimization opportunities. |

---

**🐛 BUG-FIX (6 agents)**

| Agent | Model | Why |
|---|---|---|
| **triager** | **MiniMax M2.7** | Analyze, reproduce, classify severity. M2.7's production debugging capability (correlating logs, metrics, code) makes it the best triager. |
| **investigator** | **DeepSeek V3.2** | Trace to root cause, propose fix. Root cause analysis on complex bugs needs thinking-mode reasoning through multiple hypotheses. |
| **setup** | **Qwen3-Coder-Next** | Branch creation, baseline. Lightweight tool execution. |
| **fixer** | **Qwen3-Coder:480b** | Implement fix + regression test. Sustained code modification work. |
| **verifier** | **MiniMax M2.7** | Regression test, diff review. Deep reading verifies the fix didn't break something else. |
| **pr** | **Qwen 3.5:397b** | PR with proper description + labels. Technical writing for git — needs good prose. |

---

**🛡️ SECURITY AUDIT (11 agents)**

| Agent | Model | Why |
|---|---|---|
| **scanner/atlas** | **Qwen3-Coder-Next** | Vulnerability scanning is tool-execution-heavy. Coder-Next's reliable tool calling runs scanners and parses output. |
| **prioritizer/phil** | **DeepSeek V3.2** | Ranking and grouping findings requires reasoning about exploitability, blast radius, and business impact. Thinking mode. |
| **nexdev** | **Qwen3-Coder-Next** | Branch + baseline setup. Lightweight tool execution. |
| **fixer/simon** | **Qwen3-Coder:480b** | Implementing security fixes. Sustained code modification where getting the fix exactly right matters. |
| **lana** | **GLM-5** | Quality gate verification. Systematic, methodical checking that fixes meet security requirements. Instruction following > creativity. |
| **tester/tracy** | **Qwen3-Coder-Next** | Integration testing + post-fix audit. Test authoring and execution. |
| **ross** | **Qwen 3.5:397b** | PR creation. Technical writing. |

---

**MODEL DISTRIBUTION SUMMARY**

| Model | Agent Count | Primary Role |
|---|---|---|
| **DeepSeek V3.2** | 14 | Architecture, security, synthesis, high-stakes decisions |
| **Qwen3-Coder-Next** | 14 | Agentic tool execution, test writing, scaffolding, DevOps |
| **MiniMax M2.7** | 11 | Code review, performance, debugging, verification |
| **Kimi K2.5** | 7 | All frontend work, UX, visual design, accessibility |
| **Qwen 3.5:397b** | 10 | Documentation, product thinking, reports, PRs |
| **GLM-5** | 5 | Quality gates, systematic validation, instruction-heavy |
| **Qwen3-Coder:480b** | 4 | Heavy backend code generation and modification |
| **Total** | **65** | *(some agents share names across swarms)* |

Seven models cover all 74 agents. No Sonnet, no Opus needed. DeepSeek V3.2 handles the roles that previously demanded Opus-level reasoning. Qwen3-Coder-Next takes the high-volume agentic coding that Sonnet handled. MiniMax M2.7 fills the "careful reviewer" niche that Opus excelled at.