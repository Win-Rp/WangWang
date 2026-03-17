# 火山引擎 Seedream 5.0 Lite 对接计划

## 目标
- 新增图片模型厂商支持：火山引擎（Volcengine）。
- 支持模型：`doubao-seedream-5-0-260128`。
- 按 OpenAI 兼容方式对接图片生成能力，覆盖当前组件已有能力（文生图、单/多参考图）。
- 在页面中补充对接说明入口，指向：
  `https://www.volcengine.com/docs/82379/1824121?lang=zh#8bc49063`。

## 已确认的官方 OpenAI 兼容要点（用于实现）
- 基础地址：`https://ark.cn-beijing.volces.com/api/v3`
- 接口：`POST /images/generations`
- 鉴权：`Authorization: Bearer <ARK_API_KEY>`
- 关键参数：
  - `model`：`doubao-seedream-5-0-260128`
  - `prompt`
  - `size`：可用 `"2K"`/`"3K"` 或像素值（如 `2048x2048`）
  - `image`：可为单图 URL 或 URL 数组（多参考图）
  - `output_format`：`png` / `jpeg`（5.0 lite 支持）
  - `response_format`：建议 `url`
  - `watermark`：布尔值
  - 可选增强：`sequential_image_generation`、`sequential_image_generation_options`、`tools`

## 代码改造方案
1. 后端路由 `api/routes/ai.ts`
   - 将 `/generate-image` 从 mock 改为真实外部调用。
   - 根据 `modelId` 在配置表中反查对应图片服务商配置（`/api/settings/apis` 同源数据结构）。
   - 使用配置中的 `base_url + api_key` 调用 OpenAI 兼容 `images/generations`。
   - 请求体映射规则：
     - `prompt` 直传
     - `quality` 映射到 `size`（先保持当前 UI 语义：`1K/2K/3K`，其中 5.0 lite 最低建议落到 `2K`，避免无效参数）
     - `inputImages` 为 0 张不传 `image`；1 张传字符串；多张传数组
     - 默认 `output_format: "png"`、`response_format: "url"`、`watermark: false`
   - 返回结构保持前端兼容：`{ success, imageUrl }`；若厂商返回多图，先取首图并预留扩展字段。
   - 增加错误透传与兜底提示（HTTP 状态码、厂商错误 message）。

2. 设置页 `src/pages/Settings.tsx`
   - 在图片模型 Provider 中新增 `Volcengine` 预设。
   - 预填：
     - `baseUrl = https://ark.cn-beijing.volces.com/api/v3`
     - 默认模型：`doubao-seedream-5-0-260128`
   - 在图片配置区块增加“对接说明”外链入口（打开官方文档）。

3. 图片节点 `src/components/nodes/ImageGenNode.tsx`
   - 保持现有交互不变，仅确保请求参数与后端映射一致。
   - 如后端回传扩展字段（多图），先兼容单图主流程，不破坏当前输出链路。

4. 数据与兼容性
   - 不修改现有 DB 表结构（`api_configs/models` 已满足需要）。
   - 兼容已有其他图片服务商配置，不引入破坏性变更。

## 验证计划
- 静态检查：`npm run check`
- 关键流程验证：
  - 设置页新增 Volcengine 配置并保存。
  - 画布选择 `doubao-seedream-5-0-260128` 模型生成图片。
  - 无参考图、单参考图、多参考图三种请求体分别验证。
  - 异常场景：缺失 key / base_url / 远端报错，前端可见明确错误。
- 回归验证：确认文本节点与其他页面不受影响。

## 实施假设
- 当前项目运行环境可直接出网访问 `ark.cn-beijing.volces.com`。
- 用户会在设置页填写有效 `ARK_API_KEY`。
- 第一阶段以“非流式 + 单张返回”为主，组图/流式能力先不在 UI 开关中暴露。
