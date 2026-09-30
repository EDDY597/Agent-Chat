/* AgentChat 移动版:聊天式 UI(会话/多轮/皮肤)+ 多模型辩论与并行分发引擎 */
"use strict";

// ============ 工具 ============
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const SHORT = (spec) => spec.split("@").pop().split("/").pop().replace(":free", "");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// 极简 Markdown 渲染(离线可用)
function mdRender(text) {
  const lines = esc(text).split(/\r?\n/);
  let html = "", inCode = false, inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const line of lines) {
    if (line.startsWith("```")) { closeList(); html += inCode ? "</code></pre>" : "<pre><code>"; inCode = !inCode; continue; }
    if (inCode) { html += line + "\n"; continue; }
    const t = line.trim();
    if (/^- |^\* /.test(t)) { if (!inList) { html += "<ul>"; inList = true; } html += "<li>" + inline(t.slice(2)) + "</li>"; continue; }
    closeList();
    if (/^### /.test(t)) html += "<h3>" + inline(t.slice(4)) + "</h3>";
    else if (/^## /.test(t)) html += "<h2>" + inline(t.slice(3)) + "</h2>";
    else if (/^# /.test(t)) html += "<h2>" + inline(t.slice(2)) + "</h2>";
    else if (/^> /.test(t)) html += "<blockquote>" + inline(t.slice(2)) + "</blockquote>";
    else if (t) html += "<p>" + inline(t) + "</p>";
  }
  closeList(); if (inCode) html += "</code></pre>";
  return html;
  function inline(s) {
    return s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  }
}

// ============ 配置 ============
const PROVIDERS = {
  openrouter: { baseURL: "https://openrouter.ai/api/v1" },
  bigmodel: { baseURL: "https://open.bigmodel.cn/api/paas/v4" },
  siliconflow: { baseURL: "https://api.siliconflow.cn/v1" },
  modelscope: { baseURL: "https://api-inference.modelscope.cn/v1" },
  hunyuan: { baseURL: "https://api.hunyuan.cloud.tencent.com/v1" },
  xunfei: { baseURL: "https://spark-api-open.xf-yun.com/v1" },
};
// 第一方直连平台:界面上合并为「直连」组展示,底层各自路由
const DIRECT_MEMBERS = ["bigmodel", "hunyuan", "xunfei"];
const THEMES = [["light", "纯白"], ["dark", "纯黑"], ["glass", "磨砂玻璃"], ["warm", "暖米"]];
const DEFAULTS = {
  debateModels: "modelscope@Qwen/Qwen3.5-35B-A3B,modelscope@ZhipuAI/GLM-4.7-Flash,modelscope@stepfun-ai/Step-3.7-Flash,openrouter@inclusionai/ling-3.0-flash-sante:free",
  judge: "modelscope@ZhipuAI/GLM-5.2",
  paraWorkers: "siliconflow@Qwen/Qwen2.5-7B-Instruct,modelscope@Qwen/Qwen3.8-Flash-Next,modelscope@stepfun-ai/Step-3.7-Flash,modelscope@meituan-longcat/LongCat-Flash-Lite,openrouter@inclusionai/ling-3.0-flash-sante:free",
  debateRounds: 4,
  timeoutMs: 120000,
  thinking: "default",
};
const JUDGE_FALLBACKS = [
  "modelscope@Qwen/Qwen3.5-397B-A17B",
  "bigmodel@glm-4.7-flash",
  "openrouter@nvidia/nemotron-3-ultra-550b-a55b:free",
];
const MODEL_CATALOG = {
  "直连": [
    "bigmodel@glm-4.7-flash",
    "bigmodel@glm-4-flash-250414",
    "hunyuan@hunyuan-lite",
    "xunfei@spark-lite",
  ],
  modelscope: [
    "Qwen/Qwen3.5-397B-A17B", "Qwen/Qwen3.5-122B-A10B", "Qwen/Qwen3.5-35B-A3B",
    "Qwen/Qwen3.8-Flash-Next", "ZhipuAI/GLM-5.2", "ZhipuAI/GLM-4.7-Flash",
    "deepseek-ai/DeepSeek-V4-Flash-0731", "MiniMax/MiniMax-M3",
    "stepfun-ai/Step-3.7-Flash", "meituan-longcat/LongCat-Flash-Lite",
    "Shanghai_AI_Laboratory/Intern-S2-Preview",
  ],
  siliconflow: ["Qwen/Qwen2.5-7B-Instruct", "ByteDance-Seed/Seed-OSS-36B-Instruct"],
  openrouter: [
    "qwen/qwen3.8-27b:free", "google/gemma-4-31b-it:free",
    "inclusionai/ling-3.0-flash-sante:free", "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free", "thinkingmachines/inkling:free",
    "dots-studio/dots-3-note-preview:free", "stealth/space-bunny-alpha",
  ],
};
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const loadKeys = () => load("agentchat_keys", {});
const loadCfg = () => ({ ...DEFAULTS, ...load("agentchat_cfg", {}) });
function loadCustomCatalog() { return load("agentchat_custom_models", []); }
function fullCatalog() {
  const c = JSON.parse(JSON.stringify(MODEL_CATALOG));
  for (const spec of loadCustomCatalog()) {
    const i = spec.indexOf("@");
    if (i < 0) continue;
    const p = spec.slice(0, i);
    const group = DIRECT_MEMBERS.includes(p) ? "直连" : p;
    if (!c[group]) c[group] = [];
    if (!c[group].includes(spec)) c[group].push(spec);
  }
  return c;
}

function resolveModel(spec, keys) {
  let name, model;
  if (spec.includes("@")) { const i = spec.indexOf("@"); name = spec.slice(0, i); model = spec.slice(i + 1); }
  else { name = "openrouter"; model = spec; }
  const p = PROVIDERS[name];
  if (!p) throw new Error(`未知平台 "${name}"`);
  const key = keys[name];
  if (!key) throw new Error(`平台 ${name} 未填 key`);
  return { provider: name, model, baseURL: p.baseURL, key };
}
function resolveChain(specs, keys, log, role) {
  const out = [];
  for (const s of specs) {
    try { out.push(resolveModel(s, keys)); }
    catch (e) { log(`⚠ ${role || "候选"} ${s} 不可用: ${e.message}`, "err"); }
  }
  return out;
}

// ============ HTTP(超时 / 429 重试 / 可停止) ============
let cancelled = false;
const activeCtrls = new Set();
function stopAll() { cancelled = true; for (const c of activeCtrls) c.abort(); }

// 各平台"思考模式"参数映射(default=不干预,跟随平台默认)
function thinkingExtras(provider, thinking) {
  if (!thinking || thinking === "default") return {};
  if (provider === "bigmodel") return { thinking: { type: thinking === "on" ? "enabled" : "disabled" } };
  if (provider === "openrouter") return { reasoning: { enabled: thinking === "on" } };
  if (provider === "modelscope" || provider === "siliconflow")
    return { chat_template_kwargs: { enable_thinking: thinking === "on" } };
  return {};
}

async function chat(resolved, messages, maxTokens = 2000, timeoutMs = 120000) {
  let budget = maxTokens;
  const thinking = loadCfg().thinking || "default";
  const extras = thinkingExtras(resolved.provider, thinking);
  let useExtras = true; // 请求被 400 拒绝时自动去掉思考参数重试
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (cancelled) throw new Error("已停止");
    const ctrl = new AbortController();
    activeCtrls.add(ctrl);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${resolved.baseURL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${resolved.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: resolved.model, messages, max_tokens: budget,
          ...(useExtras ? extras : {}),
        }),
        signal: ctrl.signal,
      });
      if (res.status === 400 && Object.keys(extras).length && useExtras) {
        useExtras = false; // 该平台不接受思考参数,去掉后按平台默认重试
        continue;
      }
      if (res.status === 429 && attempt < 3) {
        // 限流:递增等待(10s → 25s)再重试,给平台配额窗口恢复时间
        await sleep(attempt === 1 ? 10000 : 25000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
      const data = await res.json();
      const choice = data.choices?.[0];
      const text = choice?.message?.content;
      if (!text || !text.trim()) {
        // 思考型模型常把预算花在 reasoning 上导致正文为空:自动翻倍预算重试
        if (attempt < 3) { budget = Math.min(budget * 2, 16000); continue; }
        throw new Error(`空响应(finish_reason=${choice?.finish_reason || "?"},预算加到 ${budget} 仍为空)`);
      }
      return text.trim();
    } catch (e) {
      if (cancelled) throw new Error("已停止");
      if (e.name === "AbortError") throw new Error(`超时(${timeoutMs / 1000}s)`);
      throw e;
    } finally { clearTimeout(timer); activeCtrls.delete(ctrl); }
  }
}

async function chatChain(candidates, messages, maxTokens, opts, log) {
  const { timeoutMs, label } = opts;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      const text = await chat(c, messages, maxTokens, timeoutMs);
      if (i > 0) log(`  ↳ [${label}] 降级成功 → ${c.provider}/${c.model}`, "ok");
      return { text, used: c };
    } catch (e) {
      log(`  ↳ [${label}] ${c.provider}/${c.model} 失败(${e.message})${i < candidates.length - 1 ? ",降级" : ",候选全部失败"}`, "err");
    }
  }
  throw new Error(`[${label}] 所有候选模型失败`);
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const m = src.match(/\[[\s\S]*\]/) || src.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("输出里找不到 JSON");
  return JSON.parse(m[0]);
}

// ============ 引擎:辩论 / 并行 / 直聊 / 追问 ============
async function runDebate(topic, rounds, timeoutMs, log) {
  const keys = loadKeys(), cfg = loadCfg();
  const workers = resolveChain(cfg.debateModels.split(",").map((s) => s.trim()), keys, log, "辩手");
  if (!workers.length) throw new Error("没有可用的辩手模型");
  const judgeChain = resolveChain([cfg.judge, ...JUDGE_FALLBACKS], keys, log, "裁判候选");
  log(`辩手: ${workers.map((w) => SHORT(w.provider + "@" + w.model)).join(", ")}\n裁判: ${SHORT(judgeChain[0].provider + "@" + judgeChain[0].model)}`, "hl");

  const letters = "ABCDE";
  const transcript = [];
  let converged = false, judgeNote = "";
  for (let r = 1; r <= rounds; r++) {
    log(`\n── 第 ${r} 轮 ${r === 1 ? "(独立立论)" : "(交锋辩论)"} ──`, "hl");
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i], letter = letters[i];
      log(`[${letter}] ${SHORT(w.provider + "@" + w.model)} ...`);
      const others = transcript.filter((t) => t.round === r - 1 && t.model !== w.model)
        .map((t) => `【辩手${t.letter}(${t.short})】${t.text}`).join("\n\n");
      const messages = r === 1
        ? [
            { role: "system", content: `你是"辩手${letter}",你的底层模型是 ${w.model}。就用户给出的议题,独立、鲜明地给出你的立场与分析:先一句话亮结论,再给理由和关键取舍。不超过 400 字,不要客套。` },
            { role: "user", content: topic },
          ]
        : [
            { role: "system", content: `这是多模型辩论的第 ${r} 轮。你是"辩手${letter}"(底层模型 ${w.model}),你此前已有发言。目标是在轮数用尽前达成一致结论:如果你已认同其他辩手的主流观点,直接明确表示同意并收敛,不要为了反驳而反驳;只有存在实质分歧时才坚持,并说清理由。不超过 300 字。${judgeNote ? `\n主持人提示——当前核心分歧:${judgeNote}` : ""}` },
            { role: "user", content: `议题:${topic}\n\n其他辩手上一轮发言:\n\n${others || "(暂无,请深化你上一轮的论证)"}` },
          ];
      try {
        const text = await chat(w, messages, 2000, timeoutMs);
        transcript.push({ model: w.model, short: SHORT(w.provider + "@" + w.model), letter, round: r, text });
        log("ok", "ok");
      } catch (e) {
        transcript.push({ model: w.model, short: SHORT(w.provider + "@" + w.model), letter, round: r, text: `(发言失败: ${e.message})` });
        log(`失败: ${e.message}`, "err");
      }
      await sleep(1500);
    }
    if (r < rounds) {
      log("主持人判定共识 ...");
      const statements = transcript.filter((t) => t.round === r)
        .map((t) => `【辩手${t.letter}(${t.short})】${t.text}`).join("\n\n");
      try {
        const { text: raw } = await chatChain(judgeChain, [
          { role: "system", content: "你是辩论主持人。阅读所有辩手截至本轮的发言,判断是否已形成实质一致——只看结论是否相容,允许措辞和论证路径的差异。" },
          { role: "user", content: `议题:${topic}\n\n${statements}\n\n只输出 JSON,不要任何其他文字:{"consensus": true/false, "note": "若未一致,一句话指出当前核心分歧;若已一致,一句话概括共识"}` },
        ], 300, { timeoutMs, label: "共识判定" }, log);
        const m = raw.match(/\{[\s\S]*\}/);
        const j = m ? JSON.parse(m[0]) : {};
        judgeNote = String(j.note || "");
        if (j.consensus) { converged = true; log(`第 ${r} 轮已达成一致,提前收工`, "ok"); break; }
        log(`未一致${judgeNote ? `(${judgeNote})` : ""},继续`);
      } catch { log("共识判定失败,继续", "err"); }
    }
  }

  log("裁判合成统一意见 ...", "hl");
  const fullTranscript = transcript.map((t) => `### 第${t.round}轮 · 辩手${t.letter}(${t.short})\n${t.text}`).join("\n\n");
  const { text: consensus } = await chatChain(judgeChain, [
    { role: "system", content: "你是辩论主持人。以下是多位不同厂商的 AI 辩手就同一议题的完整辩论记录。请合成统一意见,用 Markdown 输出三节:## 共识点(所有或多数辩手认可的结论,逐条列出并注明是谁先提出的);## 主要分歧与裁决(列出分歧点,说明你采信哪一方及理由);## 最终建议(给出可执行的明确结论;若确无共识,给出多数意见并标注少数派异议)。只依据辩论记录本身,不要引入外部观点。" },
    { role: "user", content: `议题:${topic}\n\n${fullTranscript}` },
  ], 4000, { timeoutMs, label: "共识合成" }, log);
  const roundsUsed = new Set(transcript.map((t) => t.round)).size;
  return {
    transcript, roundsUsed, converged,
    consensus: `${consensus}\n\n---\n*实际 ${roundsUsed} 轮,${converged ? "达成共识" : "未完全收敛,按多数意见裁决"}*`,
    transcriptText: fullTranscript,
  };
}

async function runParallel(topic, manualTasks, timeoutMs, log) {
  const keys = loadKeys(), cfg = loadCfg();
  const workerModels = resolveChain(cfg.paraWorkers.split(",").map((s) => s.trim()), keys, log, "worker");
  if (!workerModels.length) throw new Error("没有可用的 worker 模型");
  const judgeChain = resolveChain([cfg.judge, ...JUDGE_FALLBACKS], keys, log, "裁判候选");
  log(`工人: ${workerModels.map((w) => SHORT(w.provider + "@" + w.model)).join(", ")}\n裁判: ${SHORT(judgeChain[0].provider + "@" + judgeChain[0].model)}`, "hl");

  let tasks;
  if (manualTasks) {
    tasks = manualTasks.split("|").map((s) => s.trim()).filter(Boolean)
      .map((t, i) => ({ id: `T${i + 1}`, title: t.slice(0, 30), requirement: t }));
    log(`手动指定 ${tasks.length} 个子任务`, "hl");
  } else {
    const n = workerModels.length;
    log(`裁判拆解总任务为 ${n} 个子任务 ...`, "hl");
    const { text: raw } = await chatChain(judgeChain, [
      { role: "system", content: `你是任务调度师。把用户的总任务拆解成 ${n} 个相互独立、可并行执行的子任务:每个子任务单独完成即有交付价值,禁止互相依赖,合在一起恰好覆盖总任务。只输出 JSON 数组,不要其他文字:[{"id":"T1","title":"子任务短标题","requirement":"具体要求,包含质量标准"}]` },
      { role: "user", content: topic },
    ], 1200, { timeoutMs, label: "任务拆解" }, log);
    const arr = extractJson(raw);
    tasks = arr.map((t, i) => ({ id: String(t.id || `T${i + 1}`), title: String(t.title || `子任务${i + 1}`), requirement: String(t.requirement || t.title || "") }));
    log(`拆解完成: ${tasks.map((t) => t.id + "." + t.title).join(" / ")}`);
  }

  const executeMessages = (task) => [
    { role: "system", content: "你是执行者。只负责把你分到的子任务做完,输出可直接使用的完整结果(成品本身,不是计划或思路)。用 Markdown,按子任务要求组织内容。" },
    { role: "user", content: `总任务背景:${topic}\n\n你负责的子任务【${task.id}: ${task.title}】\n要求:${task.requirement}` },
  ];
  const doExecute = async (r, primary, spare) => {
    const { text, used } = await chatChain([primary, spare].filter(Boolean), executeMessages(r.task), 2000, { timeoutMs, label: `执行 ${r.task.id}` }, log);
    r.worker = used; r.text = text;
  };

  log(`\n并行派发给 ${workerModels.length} 个 worker ...`, "hl");
  let results = tasks.map((task, i) => ({ task, worker: workerModels[i % workerModels.length], text: "", error: null }));
  await Promise.all(results.map(async (r, i) => {
    await sleep(i * 1500);
    try {
      const idx = workerModels.indexOf(r.worker);
      await doExecute(r, r.worker, workerModels[(idx + 1) % workerModels.length]);
      log(`[${r.task.id}] ${SHORT(r.worker.provider + "@" + r.worker.model)}: ok,${r.text.length} 字`, "ok");
    } catch (e) {
      r.error = e.message;
      log(`[${r.task.id}] 执行失败: ${e.message}`, "err");
    }
  }));

  const review = async (subset) => {
    const payload = subset.map((r) => `【${r.task.id}: ${r.task.title}】(执行者 ${SHORT(r.worker.provider + "@" + r.worker.model)})\n要求:${r.task.requirement}\n提交内容:\n${r.text}`).join("\n\n===\n\n");
    const { text: raw } = await chatChain(judgeChain, [
      { role: "system", content: '你是验收官。逐项检查每个子任务的提交内容:是否完成要求、是否答非所问、质量是否可用。只输出 JSON 数组,不要其他文字:[{"id":"T1","pass":true,"reason":"一句话"}]' },
      { role: "user", content: `总任务:${topic}\n\n${payload}` },
    ], 1200, { timeoutMs, label: "验收" }, log);
    const verdicts = extractJson(raw);
    const byId = new Map(verdicts.map((v) => [String(v.id), v]));
    for (const r of subset) {
      const v = byId.get(r.task.id) || {};
      r.pass = v.pass !== false && !r.error;
      r.reason = String(v.reason || (r.error ? "执行失败" : "未给出意见"));
      log(`[${r.task.id}] ${r.pass ? "✅ 通过" : "❌ 驳回"} ${r.reason}`, r.pass ? "ok" : "err");
    }
  };
  log("\n裁判验收 ...", "hl");
  await review(results);

  const failed = results.filter((r) => !r.pass);
  for (const r of failed) {
    const idx = workerModels.indexOf(r.worker);
    const fallback = workerModels[(idx + 1) % workerModels.length];
    log(`\n[${r.task.id}] 补发 → ${SHORT(fallback.provider + "@" + fallback.model)}`, "hl");
    try { await doExecute(r, fallback, workerModels[(idx + 2) % workerModels.length]); r.error = null; }
    catch (e) { r.error = e.message; }
  }
  if (failed.length) await review(results.filter((r) => failed.includes(r)));

  log("总编收尾 ...", "hl");
  const merged = results
    .map((r) => `### ${r.task.id}: ${r.task.title}(执行者 ${SHORT(r.worker.provider + "@" + r.worker.model)},${r.pass ? "已验收" : "⚠️ 未通过验收"})\n${r.text}`)
    .join("\n\n");
  const { text: finalText } = await chatChain(judgeChain, [
    { role: "system", content: "你是总编。多位执行者已各自完成总任务的子任务,请做收尾:## 总体结论(总任务完成情况一段话);## 整合交付物(把各子任务结果整合成一份连贯、去重、风格统一的完整成品);## 遗留问题(未通过验收或质量存疑的部分,明确指出;没有则写'无')。只依据提交内容,不要自己新造结论;发现子任务之间矛盾时指出并采信更可靠的一方。" },
    { role: "user", content: `总任务:${topic}\n\n各子任务提交:\n\n${merged}` },
  ], 4000, { timeoutMs, label: "总结收尾" }, log);
  return { finalText, mergedText: merged };
}

// ============ 会话(持久化) ============
let sessions = load("agentchat_sessions", []);
let curId = load("agentchat_cur", null);
let mode = null; // null=自动(有辩论上下文→追问,否则直聊);'debate'|'parallel'=一次性任务模式
let running = false;

function saveSessions() { save("agentchat_sessions", sessions); save("agentchat_cur", curId); }
function curSession() { return sessions.find((s) => s.id === curId) || sessions[0]; }
function newSession() {
  const s = { id: uid(), title: "新对话", createdAt: Date.now(), msgs: [], debate: null, followups: [] };
  sessions.unshift(s); curId = s.id; saveSessions(); renderSessions(); renderMsgs();
  closeDrawer();
}

// ============ UI:消息渲染 ============
function debateDetailsHtml(m) {
  if (!m.transcript || !m.transcript.length) return "";
  return `<details class="rec"><summary>展开完整辩论记录(${m.roundsUsed ?? "?"} 轮 · ${m.transcript.length} 条发言)</summary>` +
    m.transcript.map((t) => `<div class="sp"><b>第${t.round}轮 · 辩手${t.letter}(${t.short})</b>${mdRender(t.text)}</div>`).join("") + `</details>`;
}
function parallelDetailsHtml(m) {
  if (!m.mergedText) return "";
  return `<details class="rec"><summary>展开子任务提交记录</summary><div class="sp">${mdRender(m.mergedText)}</div></details>`;
}
// 导出结论为 Markdown:APK 走系统分享面板,浏览器直接下载
async function exportMd(name, text) {
  const cap = window.Capacitor?.Plugins;
  try {
    if (cap?.Filesystem && cap?.Share) {
      const r = await cap.Filesystem.writeFile({ path: name, data: text, directory: "CACHE", encoding: "UTF8" });
      await cap.Share.share({ title: name, url: r.uri, dialogTitle: "保存或分享辩论记录" });
      return;
    }
  } catch (e) { /* 分享取消或失败,回退到下载 */ }
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function taskExportText(m) {
  if (m.kind === "debate")
    return `# 多模型辩论: ${m.topic || ""}

## 统一意见

${m.text}

---

${m.transcriptText || ""}
`;
  return `# 并行分发: ${m.topic || ""}

## 总编收尾

${m.text}

---

## 子任务提交

${m.mergedText || ""}
`;
}
function bubbleHtml(m) {
  if (m.role === "user") return `<div class="msg user"><div class="bubble">${mdRender(m.text)}</div></div>`;
  const tag = m.kind === "debate" ? "🥊 辩论" : m.kind === "parallel" ? "🧩 并行" : m.kind === "follow" ? "↩ 追问" : "";
  const inner = m.kind === "debate"
    ? mdRender(m.text) + debateDetailsHtml(m)
    : m.kind === "parallel"
      ? mdRender(m.text) + parallelDetailsHtml(m)
      : mdRender(m.text);
  return `<div class="msg assistant">${tag ? `<div class="tag">${tag} · ${esc(m.topic || "")}</div>` : ""}<div class="bubble">${inner}` +
    (m.kind === "debate" || m.kind === "parallel" ? `<div class="actions"><button data-copy="${esc(m.text)}">复制</button><button data-exp="${esc(m.topic || "")}">导出 .md</button></div>` : "") +
    `</div></div>`;
}
function renderMsgs() {
  const s = curSession();
  if (!s.msgs.length) {
    $("#msgs").innerHTML = `<div class="empty">
      <div class="logo">AI</div>
      <h2>多模型协作台</h2>
      <p>普通输入 = 直聊;点 🥊 辩论或 🧩 并行再发送,跑多模型任务</p>
      <div class="sugg">
        <button data-s="该不该让孩子初中住校?">该不该让孩子初中住校?(辩论)</button>
        <button data-s="为我的登山装备店做一份线上营销方案">登山装备店线上营销方案(并行)</button>
        <button data-s="用三句话解释什么是光的全反射">用三句话解释光的全反射(直聊)</button>
      </div>
    </div>`;
    $("#msgs").querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => {
      $("#input").value = b.dataset.s;
      $("#input").focus();
      $("#input").dispatchEvent(new Event("input"));
    }));
    return;
  }
  $("#msgs").innerHTML = s.msgs.map(bubbleHtml).join("");
  $("#msgs").scrollTop = $("#msgs").scrollHeight;
  $("#msgs").querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => {
    navigator.clipboard.writeText(b.dataset.copy);
    b.textContent = "已复制"; setTimeout(() => (b.textContent = "复制"), 1200);
  }));
  const taskMsgs = s.msgs.map((m, i) => ({ m, i })).filter((x) => x.m.kind === "debate" || x.m.kind === "parallel");
  $("#msgs").querySelectorAll("[data-exp]").forEach((b, idx) => {
    const x = taskMsgs[idx];
    if (!x) return;
    b.onclick = () => exportMd(`agentchat-${x.m.kind}-${(x.m.ts || Date.now())}.md`, taskExportText(x.m));
  });
  updateHint();
}
function renderSessions() {
  $("#session-list").innerHTML = sessions.map((s) =>
    `<div class="sess ${s.id === curId ? "on" : ""}" data-id="${s.id}"><span class="t">${esc(s.title)}</span>` +
    `<span class="d">${new Date(s.createdAt).toLocaleDateString()}</span><button class="x" data-del="${s.id}">✕</button></div>`).join("");
  $("#session-list").querySelectorAll(".sess").forEach((el) => (el.onclick = (e) => {
    if (e.target.dataset.del) return;
    curId = el.dataset.id; saveSessions(); renderSessions(); renderMsgs(); closeDrawer();
  }));
  $("#session-list").querySelectorAll("[data-del]").forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const id = b.dataset.del;
    if (!confirm("删除这个对话?")) return;
    sessions = sessions.filter((s) => s.id !== id);
    if (curId === id) curId = sessions[0]?.id || null;
    if (!sessions.length) { newSession(); return; }
    saveSessions(); renderSessions(); renderMsgs();
  }));
}

// ============ 发送主流程 ============
function setSendState(on) {
  const b = $("#btn-send");
  b.classList.toggle("stop", on);
  b.innerHTML = on
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.4-7.5c.8-.4.8-1.5 0-1.9L3.4 3.6c-.7-.3-1.5.3-1.3 1.1L4 11l9 1-9 1-1.9 6.3c-.2.8.6 1.4 1.3 1.1z"/></svg>`;
  b.setAttribute("aria-label", on ? "停止" : "发送");
}
function updateHint() {
  const s = curSession();
  $("#mode-hint").textContent = !mode && s.debate ? "直接输入 = 追问本场辩论" : "";
}
async function onSend() {
  if (running) { if (confirm("停止当前任务?")) stopAll(); return; }
  const input = $("#input");
  const text = input.value.trim();
  if (!text) return;
  const s = curSession();
  if (!s.debate && !mode) { /* 自动=直聊 */ }

  input.value = ""; input.style.height = "auto";
  s.msgs.push({ role: "user", kind: "user", text });
  if (s.msgs.length === 1) { s.title = text.slice(0, 20); renderSessions(); }
  saveSessions();
  $("#msgs").insertAdjacentHTML("beforeend", bubbleHtml(s.msgs[s.msgs.length - 1]));
  $("#msgs").scrollTop = $("#msgs").scrollHeight;

  running = true; cancelled = false;
  setSendState(true);
  $("#msgs").insertAdjacentHTML("beforeend",
    `<div class="msg assistant"><div class="bubble"><div class="status"></div></div></div>`);
  const bubbleEl = $("#msgs").lastElementChild;
  const statusEl = bubbleEl.querySelector(".status");
  $("#msgs").scrollTop = $("#msgs").scrollHeight;
  const log = (t, c) => {
    const line = document.createElement("div");
    if (c) line.className = c;
    line.textContent = t;
    statusEl.appendChild(line);
    while (statusEl.children.length > 40) statusEl.removeChild(statusEl.firstChild);
    statusEl.scrollTop = statusEl.scrollHeight;
    $("#msgs").scrollTop = $("#msgs").scrollHeight;
  };

  let msg = null;
  const timeoutMs = loadCfg().timeoutMs;
  try {
    if (mode === "debate") {
      log("🥊 开始辩论 …", "hl");
      const r = await runDebate(text, loadCfg().debateRounds, timeoutMs, log);
      msg = { role: "assistant", kind: "debate", ts: Date.now(), text: r.consensus, topic: text, transcript: r.transcript, roundsUsed: r.roundsUsed };
      s.debate = { topic: text, transcriptText: r.transcriptText, consensus: r.consensus };
      s.followups = [];
      log("辩论完成 ✓", "ok");
    } else if (mode === "parallel") {
      log("🧩 开始并行分发 …", "hl");
      const r = await runParallel(text, null, timeoutMs, log);
      msg = { role: "assistant", kind: "parallel", ts: Date.now(), text: r.finalText, topic: text, mergedText: r.mergedText };
      log("并行任务完成 ✓", "ok");
    } else if (s.debate) {
      log("↩ 追问(继承本场辩论上下文)…", "hl");
      const keys = loadKeys(), cfg = loadCfg();
      const judgeChain = resolveChain([cfg.judge, ...JUDGE_FALLBACKS], keys, log, "裁判候选");
      const prior = (s.followups || []).map((h) => `【问】${h.q}\n【答】${h.a}`).join("\n\n");
      const { text: a } = await chatChain(judgeChain, [
        { role: "system", content: "你是一场多模型辩论的主持人。多位不同厂商的辩手已完成辩论并形成统一意见,用户现在向你追问。请基于辩论的完整上下文回答,结论与统一意见保持一致;若追问超出辩论范围,可依据你自己的知识回答并注明这一点。用 Markdown,简洁。" },
        { role: "user", content: `议题:${s.debate.topic}\n\n${s.debate.transcriptText}\n\n## 统一意见\n${s.debate.consensus}\n\n${prior ? "## 此前追问\n" + prior + "\n\n" : ""}## 用户追问\n${text}` },
      ], 4000, { timeoutMs, label: "追问" }, log);
      s.followups = s.followups || [];
      s.followups.push({ q: text, a });
      msg = { role: "assistant", kind: "follow", text: a, topic: s.debate.topic };
    } else {
      const keys = loadKeys(), cfg = loadCfg();
      const judgeChain = resolveChain([cfg.judge, ...JUDGE_FALLBACKS], keys, log, "直聊");
      const history = s.msgs.filter((m) => m.kind === "user" || m.kind === "chat").slice(-12)
        .map((m) => ({ role: m.kind === "user" ? "user" : "assistant", content: m.text }));
      history[history.length - 1] = { role: "user", content: text };
      const { text: a } = await chatChain(judgeChain, [
        { role: "system", content: "你是简洁、专业的 AI 助手,用 Markdown 回答。" },
        ...history.slice(0, -1),
        { role: "user", content: text },
      ], 3000, { timeoutMs, label: "直聊" }, log);
      msg = { role: "assistant", kind: "chat", text: a };
    }
  } catch (e) {
    msg = { role: "assistant", kind: "chat", text: `**出错了:** ${e.message}` };
  }
  if (msg) {
    s.msgs.push(msg);
    saveSessions();
    bubbleEl.outerHTML = bubbleHtml(msg);
    renderMsgs();
  }
  running = false;
  setSendState(false);
  mode = null;
  document.querySelectorAll(".mchip").forEach((c) => c.classList.remove("on"));
  updateHint();
}

// ============ 输入区 / 模式芯片 ============
const inputEl = $("#input");
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); onSend(); }
});
$("#btn-send").onclick = onSend;
document.querySelectorAll(".mchip").forEach((c) => (c.onclick = () => {
  mode = mode === c.dataset.mode ? null : c.dataset.mode;
  document.querySelectorAll(".mchip").forEach((x) => x.classList.toggle("on", x.dataset.mode === mode));
  updateHint();
  inputEl.placeholder = mode === "debate" ? "输入辩论议题…"
    : mode === "parallel" ? "输入总任务…"
    : curSession().debate ? "输入消息…(=追问本场辩论)" : "输入消息…";
}));

// ============ 抽屉 ============
function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawer-mask").classList.remove("open"); }
$("#btn-menu").onclick = () => { $("#drawer").classList.add("open"); $("#drawer-mask").classList.add("open"); };
$("#drawer-mask").onclick = closeDrawer;
$("#btn-new").onclick = newSession;

// ============ 设置 ============
$("#btn-settings").onclick = () => { $("#settings").classList.remove("hide"); };
$("#btn-back").onclick = () => { $("#settings").classList.add("hide"); };
// 设置左侧分类菜单:事件委托绑定,切换面板,免长页滚动
$("#settings-nav").addEventListener("click", (e) => {
  const b = e.target.closest(".snav");
  if (!b) return;
  document.querySelectorAll("#settings-nav .snav").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".spane").forEach((s) => s.classList.toggle("on", s.id === "pane-" + b.dataset.pane));
});

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  save("agentchat_theme", t);
}
(function renderThemeChips() {
  const cur = load("agentchat_theme", "dark");
  applyTheme(cur);
  $("#theme-chips").innerHTML = THEMES.map(([v, n]) => `<button type="button" class="chip ${cur === v ? "on" : ""}" data-t="${v}">${n}</button>`).join("");
  $("#theme-chips").querySelectorAll(".chip").forEach((b) => (b.onclick = () => {
    applyTheme(b.dataset.t);
    $("#theme-chips").querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b));
  }));
})();

const keyFields = Object.keys(PROVIDERS).map((name) =>
  `<label>${name} 的 API Key</label><input type="password" id="key-${name}" placeholder="${PROVIDERS[name].baseURL}">`).join("");
$("#key-fields").innerHTML = keyFields;

// 模型阵容点选芯片
let selDebate = [], selJudge = "", selPara = "";
let paramState = { rounds: "4", timeout: "120000", thinking: "default" };
function chipBtn(spec, selIdx, extra) {
  return `<button type="button" class="chip ${selIdx >= 0 || extra === "on" ? "on" : ""} ${extra === "add" ? "add" : ""}" data-spec="${esc(spec)}">` +
    (selIdx >= 0 ? `<span class="ord">${selIdx + 1}</span>` : "") +
    (extra === "add" ? "＋ 自定义" : esc(SHORT(spec))) + `</button>`;
}
function renderChips() {
  const cat = fullCatalog();
  const dead = load("agentchat_dead_models", []);
  const render = (boxId, selArr, multi) => {
    // 裁判盒传的是字符串(单选),统一成数组再做展示,交互层再写回各自变量
    const selList = Array.isArray(selArr) ? selArr : (selArr ? [selArr] : []);
    const savedOrder = load("agentchat_order-" + boxId.replace("#", ""), []); // 用户拖动过的自定义排列
    let html = "";
    for (const [p, models] of Object.entries(cat)) {
      html += `<div class="plat">${p}</div><div class="chips">`;
      const hiddenSpecs = load("agentchat_hidden_models", []);
      const specs = models.map((m) => (m.includes("@") ? m : `${p}@${m}`)).filter((s) => !hiddenSpecs.includes(s));
      // 有自定义排列:全部按用户排的顺序渲染(含未选);否则默认 已选优先 + 目录序
      const inSaved = (s) => savedOrder.includes(s);
      const ordered = savedOrder.length
        ? [
            ...savedOrder.filter((s) => specs.includes(s)),
            ...selList.filter((s) => specs.includes(s) && !inSaved(s)),
            ...specs.filter((s) => !inSaved(s) && !selList.includes(s)),
          ]
        : [
            ...selList.filter((s) => specs.includes(s)),
            ...specs.filter((s) => !selList.includes(s)),
          ];
      for (const spec of ordered) {
        const isDead = dead.includes(spec);
        html += multi
          ? `<button type="button" class="chip ${selList.indexOf(spec) >= 0 ? "on" : ""} ${isDead ? "dead" : ""}" data-spec="${esc(spec)}" ${isDead ? `title="平台已无此模型"` : ""}>${selList.indexOf(spec) >= 0 ? `<span class="ord">${selList.indexOf(spec) + 1}</span>` : ""}<span class="chipx" data-x="1" title="${selList.indexOf(spec) >= 0 ? "从阵容移除" : "从模型库删除"}">×</span>${esc(SHORT(spec))}${isDead ? " ⚠" : ""}</button>`
          : chipBtn(spec, selList.includes(spec) ? 0 : -1);
      }
      html += `<button type="button" class="chip add" data-add="1">＋ 自定义</button></div>`;
    }
    const box = $(boxId);
    box.innerHTML = (editBoxId === boxId ? `<button type="button" class="donebtn">✓ 完成(退出编辑)</button>` : "") + html;
    box.classList.toggle("editing", editBoxId === boxId);
    const done = box.querySelector(".donebtn");
    if (done) done.onclick = () => { editBoxId = null; renderChips(); };
    bindDragOnce(box, () => selArr);
    box.querySelectorAll(".chip").forEach((b) => bindChipDrag(b, box, () => selArr, boxId));
    box.querySelectorAll(".chip").forEach((b) => (b.onclick = (e) => {
      if (e.target.classList.contains("chipx")) {
        if (b.classList.contains("on")) {
          // 已选:移出阵容(保持编辑态,可连续操作)
          if (multi) { const i = selArr.indexOf(b.dataset.spec); if (i >= 0) selArr.splice(i, 1); }
          else selJudge = "";
        } else {
          // 未选:从模型库删除(隐藏),可从"添加模型"里带"已删除"徽标恢复
          const hid = load("agentchat_hidden_models", []);
          if (!hid.includes(b.dataset.spec)) hid.push(b.dataset.spec);
          save("agentchat_hidden_models", hid);
          save("agentchat_custom_models", loadCustomCatalog().filter((s) => s !== b.dataset.spec));
        }
        renderChips();
        return;
      }
      if (editBoxId === boxId) {
        // 编辑态:未选芯片点击 = 加入选区;已选芯片主体点击 = 不做事;✕ 拖后误触由 justDragged 拦
        if (justDragged) return;
        if (b.classList.contains("add")) { openModal(boxId, multi, "直连"); return; }
        if (!b.classList.contains("on")) {
          if (multi) selArr.push(b.dataset.spec); else selJudge = b.dataset.spec;
          renderChips();
        }
        return;
      }
      if (b.classList.contains("add")) {
        openModal(boxId, multi, "直连");
        return;
      }
      const spec = b.dataset.spec;
      if (multi) {
        const i = selArr.indexOf(spec);
        if (i >= 0) selArr.splice(i, 1); else selArr.push(spec);
      } else {
        selJudge = selJudge === spec ? "" : spec; // 单选盒:写回全局(原来只改局部,选择不生效)
      }
      renderChips();
    }));
  };
  render("#box-debate", selDebate, true);
  render("#box-judge", selJudge, false);
  render("#box-para", selPara, true);
}
// 长按(350ms)进入拖动,移动到其他选中芯片交换位置,松手按 DOM 顺序写回阵容
let dragCtx = null, justDragged = false;
let editBoxId = null; // 当前处于编辑态(显示×)的阵容盒
function bindDragOnce(box, getArr) {
  if (box.dataset.dragBound) return;
  box.dataset.dragBound = "1";
  box.addEventListener("pointermove", (e) => {
    if (!dragCtx) return;
    if (!dragCtx.moved) {
      const dx = e.clientX - dragCtx.startX, dy = e.clientY - dragCtx.startY;
      if (Math.hypot(dx, dy) < 5) return;          // 未超阈值 = 还在点击,不进入拖动
      dragCtx.moved = true;
      dragCtx.el.classList.add("dragging");
      document.body.style.touchAction = "none";
    }
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest(".chip:not(.add)");
    if (!el || el === dragCtx.el || !box.contains(el)) return;
    if (el.parentNode !== dragCtx.el.parentNode) return; // 拖动限定同平台分组内
    const ons = [...box.querySelectorAll(".chip.on")];
    const to = ons.indexOf(el);
    // 芯片在各组的 .chips 子容器里,参照节点要用同一父容器
    const ref = to < ons.indexOf(dragCtx.el) ? el : el.nextSibling;
    el.parentNode.insertBefore(dragCtx.el, ref);
    // 即时提交:整个面板的自定义排列落盘;阵容顺序按视觉顺序重建(单选盒无排序,跳过)
    const arr = getArr();
    if (!Array.isArray(arr)) return;
    save("agentchat_order-" + box.id, [...box.querySelectorAll(".chip:not(.add)")].map((x) => x.dataset.spec));
    const newOrder = [...box.querySelectorAll(".chip.on")].map((x) => x.dataset.spec);
    arr.length = 0;
    newOrder.forEach((s) => arr.push(s));
  });
  const finish = () => {
    if (!dragCtx) return;
    if (dragCtx.moved) {
      dragCtx.el.classList.remove("dragging");
      document.body.style.touchAction = "";
      justDragged = true;
      setTimeout(() => (justDragged = false), 300);
    }
    dragCtx = null;
    renderChips(); // 刷新序号;顺序已在 move 时即时提交
  };
  box.addEventListener("pointerup", finish);
  box.addEventListener("pointercancel", finish);
}
function bindChipDrag(b, box, getArr, boxId) {
  b.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("chipx")) return;
    if (b.classList.contains("add")) return;
    if (editBoxId === boxId) {
      // 编辑态:任意芯片(含未选)按下即待拖,移动超阈值进入拖动
      dragCtx = { el: b, spec: b.dataset.spec, startX: e.clientX, startY: e.clientY, moved: false };
      return;
    }
    // 常态:长按任意芯片(含未选)进入编辑态
    const t = setTimeout(() => {
      editBoxId = boxId;
      box.classList.add("editing");
      renderChips(); // 渲染「完成」按钮
    }, 350);
    const c = () => clearTimeout(t);
    b.addEventListener("pointerup", c, { once: true });
    b.addEventListener("pointerleave", c, { once: true });
  });
}

// 自定义模型弹层:按组拉取 /models 列表,搜索 + 点选(缓存 24h,可强制刷新)
// 「直连」组 = 第一方平台合并展示(bigmodel/hunyuan/xunfei),底层各自路由
let modalTarget = null;   // {boxId, multi}
let modalGroup = "直连";
let modalRows = null;     // 完整规格数组 | {error: string} | null(加载中)
let modalFilter = "";
const FREE_KNOWN = /:free$|-free$|glm-4\.7-flash|glm-4-flash|hunyuan-lite|spark-lite/i;
function paramNameB(m) { // 从模型名解析参数规模(十亿),如 Qwen2.5-7B → 7
  const x = m.match(/(\d+(?:\.\d+)?)\s*[bB](?![a-zA-Z])/);
  return x ? parseFloat(x[1]) : null;
}
function isFreeSpec(spec) { // 各平台免费语义不同:魔搭全列表免费可调,硅基流动看参数规模,OpenRouter 看后缀,直连看精选名单
  const i = spec.indexOf("@");
  const plat = spec.slice(0, i), m = spec.slice(i + 1);
  if (plat === "openrouter") return /:free$|-free$/i.test(m);
  if (plat === "modelscope") return true;
  if (plat === "siliconflow") { const b = paramNameB(m); return b !== null ? b <= 9 : /lite|flash|small/i.test(m); }
  if (DIRECT_MEMBERS.includes(plat)) return /glm-4\.7-flash|glm-4-flash|hunyuan-lite|spark-lite/i.test(m);
  return FREE_KNOWN.test(spec);
}

function openModal(boxId, multi, presetGroup) {
  modalTarget = { boxId, multi };
  modalGroup = presetGroup || "直连";
  modalFilter = "";
  const groups = Object.keys(MODEL_CATALOG);
  $("#modal-plats").innerHTML = groups
    .map((g) => `<button type="button" class="chip ${g === modalGroup ? "on" : ""}" data-p="${esc(g)}">${esc(g)}</button>`).join("");
  $("#modal-plats").querySelectorAll(".chip").forEach((b) => (b.onclick = () => {
    modalGroup = b.dataset.p;
    $("#modal-plats").querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b));
    loadModalModels(false);
  }));
  $("#modal-search").value = "";
  $("#modal").classList.remove("hide");
  loadModalModels(false);
}
function closeModal() { $("#modal").classList.add("hide"); modalTarget = null; }

async function fetchPlatformIds(platform, keys) {
  const p = resolveModel(platform + "@x", keys);
  const res = await fetch(`${p.baseURL}/models`, {
    headers: { Authorization: `Bearer ${p.key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const ids = (data.data || []).map((m) => m.id).sort();
  if (!ids.length) throw new Error("平台返回空列表");
  return ids;
}

async function loadModalModels(force) {
  const cache = load("agentchat_modelcache", {});
  const ck = "group:" + modalGroup;
  const c = cache[ck];
  if (!force && c && Date.now() - c.ts < 86400000) { modalRows = c.rows; renderModelList(); return; }
  modalRows = null;
  renderModelList();
  try {
    let rows = [], errors = [];
    if (modalGroup === "直连") {
      const keys = loadKeys();
      const members = DIRECT_MEMBERS.filter((p) => keys[p]);
      // 精选免费模型永远置顶显示(不依赖列表接口)
      rows = [...MODEL_CATALOG["直连"]];
      if (!members.length) {
        errors.push("直连组至少要填一个成员平台 key(bigmodel / hunyuan / xunfei)");
      } else {
        const r = await Promise.all(members.map(async (p) => {
          try { return (await fetchPlatformIds(p, keys)).map((id) => `${p}@${id}`); }
          catch (e) { errors.push(`${p}: ${e.message}`); return []; }
        }));
        for (const list of r) for (const spec of list) if (!rows.includes(spec)) rows.push(spec);
      }
    } else {
      const ids = await fetchPlatformIds(modalGroup, loadKeys());
      rows = ids.map((id) => `${modalGroup}@${id}`);
    }
    if (!rows.length) throw new Error(errors.join(";") || "没有可用模型");
    modalRows = rows;
    cache[ck] = { ts: Date.now(), rows };
    save("agentchat_modelcache", cache);
    if (errors.length) modalRows = { rows, note: errors.join(";") };
  } catch (e) {
    const reason = e.name === "TimeoutError" ? "15 秒无响应(网络不通或被墙)" : /fetch/i.test(e.message) ? "请求被拦截(电脑浏览器预览时属跨域限制,手机 APK 内无此问题)" : e.message;
    modalRows = { error: reason };
  }
  renderModelList();
}

function addSpec(spec) {
  // 若该模型曾被"从模型库删除",重新添加即恢复
  save("agentchat_hidden_models", load("agentchat_hidden_models", []).filter((s) => s !== spec));
  const cc = loadCustomCatalog();
  if (!cc.includes(spec)) cc.push(spec);
  save("agentchat_custom_models", cc);
  if (modalTarget) {
    if (modalTarget.boxId === "#box-debate") { if (!selDebate.includes(spec)) selDebate.push(spec); }
    else if (modalTarget.boxId === "#box-para") { if (!selPara.includes(spec)) selPara.push(spec); }
    else selJudge = spec;
  }
  closeModal();
  renderChips();
}

function renderModelList() {
  const list = $("#modal-list");
  if (!modalRows) {
    list.innerHTML = `<div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
    return;
  }
  // 兼容两种形态:纯数组(拉取成功) / {rows, note|error}(直连组部分失败等)
  const rowsAll = Array.isArray(modalRows) ? modalRows : (modalRows.rows || []);
  const note = !Array.isArray(modalRows) ? modalRows.note : null;
  if (modalRows.error) {
    list.innerHTML = `<div class="merr">拉取失败:${esc(modalRows.error)}<br>点右上 ⟳ 重试。</div>`;
    return;
  }
  const NON_CHAT = /embed|rerank|voice|image|tts|audio|video|ocr|whisper|speech/i;
  const f = modalFilter.toLowerCase();
  const addedSet = new Set([...loadCustomCatalog(), ...selDebate, ...(selJudge ? [selJudge] : []), ...selPara]);
  const hiddenSet = new Set(load("agentchat_hidden_models", []));
  const rows = rowsAll.filter((spec) => !NON_CHAT.test(spec) && !addedSet.has(spec) && spec.toLowerCase().includes(f))
    .sort((a, b) => (isFreeSpec(b) ? 1 : 0) - (isFreeSpec(a) ? 1 : 0)); // 免费模型置顶
  if (!rows.length) { list.innerHTML = `<div class="merr">没有匹配的模型</div>`; return; }
  list.innerHTML =
    (note ? `<div class="merr" style="padding:6px 10px">${esc(note)}</div>` : "") +
    rows.map((spec) =>
      `<div class="mrow" data-spec="${esc(spec)}"><span class="mid">${esc(SHORT(spec))}</span>` +
      (addedSet.has(spec) ? `<span class="badge-added">已添加</span>` : "") +
      (hiddenSet.has(spec) ? `<span class="badge-hidden">已删除</span>` : "") +
      (isFreeSpec(spec) ? `<span class="badge-free">free</span>` : "") +
      `</div>`).join("");
  list.querySelectorAll(".mrow").forEach((r) => (r.onclick = () => addSpec(r.dataset.spec)));
}
$("#modal-search").addEventListener("input", (e) => { modalFilter = e.target.value.trim(); renderModelList(); });
$("#modal-refresh").onclick = () => loadModalModels(true);
$("#modal-cancel").onclick = closeModal;
$("#modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };
(function initSettings() {
  const keys = loadKeys(), cfg = loadCfg();
  for (const name of Object.keys(PROVIDERS)) $("#key-" + name).value = keys[name] || "";
  selDebate = (cfg.debateModels || "").split(",").map((s) => s.trim()).filter(Boolean);
  selJudge = cfg.judge || "";
  selPara = (cfg.paraWorkers || "").split(",").map((s) => s.trim()).filter(Boolean);
  paramState = { rounds: String(cfg.debateRounds || 4), timeout: String(cfg.timeoutMs || 120000), thinking: cfg.thinking || "default" };
  renderParams();
  renderChips();
})();
// 运行参数:点选芯片组(替代原生 select)
function optChips(boxId, options, value, onPick) {
  const box = $(boxId);
  box.innerHTML = options.map(([v, n]) => `<button type="button" class="chip ${String(v) === String(value) ? "on" : ""}" data-v="${v}">${n}</button>`).join("");
  box.querySelectorAll(".chip").forEach((b) => (b.onclick = () => { onPick(b.dataset.v); }));
}
function renderParams() {
  optChips("#cfg-rounds", [["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"]], paramState.rounds,
    (v) => { paramState.rounds = v; renderParams(); });
  optChips("#cfg-timeout", [["60000", "60 秒"], ["120000", "120 秒"], ["240000", "240 秒"]], paramState.timeout,
    (v) => { paramState.timeout = v; renderParams(); });
  optChips("#cfg-thinking", [["default", "跟随默认"], ["off", "关闭思考"], ["on", "强制思考"]], paramState.thinking,
    (v) => { paramState.thinking = v; renderParams(); });
}
// 已选模型体检:对照平台实时列表,标出已下架模型
$("#cfg-check").onclick = async () => {
  const btn = $("#cfg-check");
  btn.disabled = true; btn.textContent = "检查中…";
  try {
    const keys = loadKeys();
    const sel = [...selDebate, ...(selJudge ? [selJudge] : []), ...selPara];
    const plats = [...new Set(sel.map((s) => s.split("@")[0]))];
    const cache = load("agentchat_modelcache", {});
    const lists = await Promise.all(plats.map(async (p) => {
      if (!keys[p]) return [p, { error: "未填 key" }];
      try {
        let ids;
        const c = cache[p];
        if (c && Date.now() - c.ts < 86400000) ids = c.ids;
        else {
          const res = await fetch(`${PROVIDERS[p].baseURL}/models`, {
            headers: { Authorization: `Bearer ${keys[p]}` },
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const d = await res.json();
          ids = (d.data || []).map((m) => m.id).sort();
          cache[p] = { ts: Date.now(), ids };
          save("agentchat_modelcache", cache);
        }
        return [p, { ids }];
      } catch (e) { return [p, { error: e.message }]; }
    }));
    const listMap = Object.fromEntries(lists);
    const dead = [];
    for (const spec of sel) {
      const i = spec.indexOf("@");
      const L = listMap[spec.slice(0, i)];
      if (L && L.ids && !L.ids.includes(spec.slice(i + 1))) dead.push(spec);
    }
    if (dead.length) {
      // 直接从阵容和自定义库中移除失效模型
      const deadSet = new Set(dead);
      selDebate = selDebate.filter((s) => !deadSet.has(s));
      if (deadSet.has(selJudge)) selJudge = "";
      selPara = selPara.filter((s) => !deadSet.has(s));
      save("agentchat_custom_models", loadCustomCatalog().filter((s) => !deadSet.has(s)));
      save("agentchat_dead_models", []);
      renderChips();
    } else {
      save("agentchat_dead_models", []);
      renderChips();
    }
    const unknown = plats.filter((p) => listMap[p].error).map((p) => `${p}(${listMap[p].error})`);
    btn.textContent = dead.length
      ? `已移除 ${dead.length} 个失效模型`
      : unknown.length ? `已选模型可用;未能检查:${unknown.join(",")}` : "已选模型全部可用 ✓";
  } catch (e) {
    btn.textContent = "检查失败:" + e.message.slice(0, 40);
  } finally {
    btn.disabled = false;
    setTimeout(() => (btn.textContent = "检查已选模型(下架检测)"), 4000);
  }
};
$("#cfg-save").onclick = () => {
  const keys = {};
  for (const name of Object.keys(PROVIDERS)) { const v = $(`#key-${name}`).value.trim(); if (v) keys[name] = v; }
  save("agentchat_keys", keys);
  save("agentchat_cfg", {
    debateModels: selDebate.join(",") || DEFAULTS.debateModels,
    judge: selJudge || DEFAULTS.judge,
    paraWorkers: selPara.join(",") || DEFAULTS.paraWorkers,
    debateRounds: parseInt(paramState.rounds, 10) || 4,
    timeoutMs: parseInt(paramState.timeout, 10) || 120000,
    thinking: paramState.thinking || "default",
  });
  $("#cfg-save").textContent = "已保存 ✓";
  setTimeout(() => ($("#cfg-save").textContent = "保存设置"), 1500);
};

// ============ 启动 ============
if (!sessions.length) { sessions = []; newSession(); }
else if (!curSession()) { curId = sessions[0].id; saveSessions(); }
renderSessions();
renderMsgs();
updateHint();
