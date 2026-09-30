# Agent-Chat

多模型协作工具箱:让多个免费大模型**自动辩论达成共识**、**并行分工完成任务**,官方免费 API 直连,零成本、零封号风险。

包含两个交付形态:

| 形态 | 位置 | 说明 |
|------|------|------|
| 📱 **Android App** | [`app/`](app/) + [`dist/AgentChat.apk`](dist/AgentChat.apk) | 聊天式界面(参照豆包/DeepSeek),内置多皮肤、会话管理、点选式模型阵容 |
| 💻 **桌面 CLI** | [`cli/`](cli/) | `debate.mjs` / `parallel.mjs`,供终端或 ZCode/Claude Code 等 agent 直接调用 |

## 能力

- **🥊 多模型辩论**:多个跨厂商模型独立立论 → 多轮交锋 → 旗舰裁判判定共识并合成统一意见;轮次自适应(达成共识提前收工)
- **🧩 并行分发**:裁判拆解总任务 → 多模型并行各领子任务 → 逐项验收(不合格自动换模型补发)→ 总编整合成品
- **↩ 多轮追问**:辩论/并行结果可继续追问,自动继承全部上下文
- **🛡 健壮性**:单次调用超时、429 递增退避、空响应自动加倍预算重试、跨平台降级链、思考模式开关(GLM/Qwen/OpenRouter 各自适配)
- **🎨 聊天式 UI**:底部输入框、会话历史抽屉、4 款皮肤(纯白/纯黑/磨砂玻璃/暖米)、免费模型置顶 + free 徽标
- **🖐 阵容编辑**:长按任意芯片进编辑态 → 任意芯片(含未选)可拖动排序(同平台内)、点 × 移出阵容或从模型库删除、点未选即加入、自动保存排列
- **🩺 模型体检**:「检查已选模型」= 下架核对 + 真实可用性探测(三态判定:失效自动移除 / 可服务保留 / 限流超时保留并标注);key 异常时只提醒、绝不误删
- **⏳ 等待反馈**:回复前的"打字中"三点动画 + 阶段日志,不会出现空泡
- **🧠 思考模式开关**:按平台自动映射(GLM `thinking` / Qwen `enable_thinking` / OpenRouter `reasoning`),不支持时自动去掉参数重试
- **🛡 健壮性**:单次超时、429 递增退避、平台"空壳响应"快速识别(魔搭无实例时会返回 200 空壳,不再白等)、跨平台降级链

## 快速开始(手机 App)

1. 直接安装 [`dist/AgentChat.apk`](dist/AgentChat.apk)(debug 签名,允许未知来源即可);
2. 打开 App → 设置 → 填入任意一家平台的 API Key(仅存手机本机);
   用 Cloudflare 的话需填两栏:API Key(令牌)+ 账户 ID(32 位十六进制,控制台右侧栏);
3. 「辩论」页输入议题开辩,或「并行」页分发任务。

## 快速开始(桌面 CLI)

```bash
cd cli
cp providers.example.json providers.json   # 填入至少一个平台的 key(勿提交)
node debate.mjs "该不该换工作?"            # 辩论出共识
node parallel.mjs "总任务..."              # 并行分发 → 验收 → 合成
```

## 支持的模型源

**直连(官方第一方)**:智谱 bigmodel(`glm-4.7-flash` 免费)、腾讯混元(`hunyuan-lite` 免费)、讯飞星火(`spark lite` 免费)
**Cloudflare Workers AI**:独立分组。免费计划每天 10,000 neurons(≈28 万 tokens,实测 406 tokens = 14.5 neurons),含 `qwen3.8-27b`、`qwq-32b`、`gpt-oss-120b`、`llama-4-scout`、`nemotron-3-120b`、`glm-4.7-flash` 等 24 个可用模型(自动过滤付费限定)。需要「账户 ID + API 令牌」两个值,令牌权限选 `Account → Workers AI → Read` 即可。**仅手机 App 与桌面 CLI 可用**:其服务端不允许浏览器跨域调用(CORS 预检返回 405)。
**聚合平台**:魔搭 ModelScope(国产旗舰免费池)、硅基流动、OpenRouter(`:free` 模型池)

> 默认阵容只包含**已核实免费**的模型;首次安装时还会再过滤一遍免费判定,确保开箱不消耗付费额度。

## 重新构建 App

```bash
cd app
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# 产物: android/app/build/outputs/apk/debug/app-debug.apk
```

环境要求:Node 18+、JDK 17、Android SDK 34。预览网页版:`node serve.mjs` 后浏览器打开 http://127.0.0.1:8765。

## 安全

- 所有 key 只存手机本机 localStorage / 本地 `providers.json`,**不随代码分发**;
- 仓库只含 `providers.example.json` 模板,提交前已做密钥泄漏扫描。

## 相关

- 技能封装(多模型辩论/并行分发的 agent 技能版):[EDDY597/EddyPower](https://github.com/EDDY597/EddyPower)
- 设计灵感来源:[ziwang-Physics/AgentChat](https://github.com/ziwang-Physics/AgentChat)(浏览器自动化方案,本项目改为官方 API 路线,无封号风险)

## License

MIT
