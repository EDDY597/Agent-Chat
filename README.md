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
- **🎨 聊天式 UI**:底部输入框、会话历史抽屉、4 款皮肤(纯白/纯黑/磨砂玻璃/暖米)、免费模型置顶 + free 徽标、长按拖动排序阵容、下架检测

## 快速开始(手机 App)

1. 直接安装 [`dist/AgentChat.apk`](dist/AgentChat.apk)(debug 签名,允许未知来源即可);
2. 打开 App → 设置 → 填入任意一家平台的 API Key(仅存手机本机);
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
**聚合平台**:魔搭 ModelScope(国产旗舰免费池)、硅基流动、OpenRouter(`:free` 模型池)

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
