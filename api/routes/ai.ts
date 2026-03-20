import express, { type Request, type Response } from 'express';
import db from '../db/index.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = express.Router();

router.use(requireAuth);

type ApiConfigRow = {
  api_config_id: string;
  provider: string;
  base_url: string;
  api_key: string;
  model_id: string | null;
  model_name: string | null;
  is_default: number | null;
};

type ModelConfig = {
  id: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  models: Array<{ modelId: string; name: string; isDefault: boolean }>;
};

const SIZE_2K_MAP: Record<string, string> = {
  '1:1': '2048x2048',
  '3:4': '1728x2304',
  '4:3': '2304x1728',
  '16:9': '2848x1600',
  '9:16': '1600x2848',
  '3:2': '2496x1664',
  '2:3': '1664x2496',
  '21:9': '3136x1344',
};

const SIZE_1K_MAP: Record<string, string> = {
  '1:1': '1024x1024',
  '3:4': '864x1152',
  '4:3': '1152x864',
  '16:9': '1312x736',
  '9:16': '736x1312',
  '3:2': '1248x832',
  '2:3': '832x1248',
  '21:9': '1568x672',
};

const SIZE_3K_MAP: Record<string, string> = {
  '1:1': '3072x3072',
  '3:4': '2592x3456',
  '4:3': '3456x2592',
  '16:9': '4096x2304',
  '9:16': '2304x4096',
  '3:2': '3744x2496',
  '2:3': '2496x3744',
  '21:9': '4704x2016',
};

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/[`'"]/g, '').replace(/\/+$/, '');
const maskApiKey = (apiKey: string) => (apiKey.length <= 8 ? '***' : `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`);
const isSeedream3T2IModel = (modelId: string) =>
  modelId.includes('seedream-3-0-t2i') || modelId.includes('seedream-3.0-t2i');
const isGeminiModel = (modelId: string, provider?: string) => {
  const id = modelId.toLowerCase();
  // 包含 gemini 或 imagen 关键字的模型，或者明确指定为 Google 厂商的模型
  return id.includes('gemini') || id.includes('imagen') || id.startsWith('google/') || provider === 'Google';
};

const normalizeGeminiNativeBaseUrl = (baseUrl: string, provider?: string) => {
  let normalized = normalizeBaseUrl(baseUrl);
  
  // 移除可能存在的 /openai 或 /v1 后缀，以便重新构建原生路径
  normalized = normalized.replace(/\/openai$/i, '');
  
  // 对于 NewAPI 或 OpenAI 厂商，如果 URL 只是域名，通常需要补全路径
  if (provider === 'NewAPI' || provider === 'OpenAI') {
    // 如果没有版本号，补全 /v1beta
    if (!/\/v1(beta)?$/i.test(normalized)) {
      normalized = `${normalized}/v1beta`;
    }
  }

  // 统一转换为 v1beta 以支持原生协议
  if (/\/v1$/i.test(normalized)) {
    return normalized.replace(/\/v1$/i, '/v1beta');
  }
  
  return normalized;
};

const resolveGeminiImageSize = (quality: string | undefined) => {
  if (quality === '3K') return '4K';
  if (quality === '2K') return '2K';
  return '1K';
};

const inferMimeTypeFromUrl = (url: string) => {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
};

const toBase64 = (buffer: ArrayBuffer) => Buffer.from(buffer).toString('base64');

const parseDataUrl = (value: string): { mimeType: string; data: string } | null => {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(value.trim());
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
};

const imageUrlToInlineDataPart = async (value: string) => {
  const dataUrl = parseDataUrl(value);
  if (dataUrl) {
    return {
      inline_data: {
        mime_type: dataUrl.mimeType,
        data: dataUrl.data,
      },
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`参考图拉取失败(${resp.status})`);
  }

  const contentLength = Number(resp.headers.get('content-length') || '0');
  if (contentLength > 10 * 1024 * 1024) {
    throw new Error('参考图过大(>10MB)');
  }

  const buffer = await resp.arrayBuffer();
  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error('参考图过大(>10MB)');
  }

  const mimeType = resp.headers.get('content-type') || inferMimeTypeFromUrl(url.toString());
  return {
    inline_data: {
      mime_type: mimeType,
      data: toBase64(buffer),
    },
  };
};

const resolveRequestedModelId = (modelId: string) => {
  if (modelId === 'doubao-seedream-3.0-t2i') return 'doubao-seedream-3-0-t2i-250415';
  return modelId;
};

const resolveSize = (quality: string | undefined, aspectRatio: string | undefined, modelId: string) => {
  if (isSeedream3T2IModel(modelId)) {
    if (quality === '3K') return SIZE_3K_MAP[aspectRatio || ''] || '3072x3072';
    if (quality === '2K') return SIZE_2K_MAP[aspectRatio || ''] || '2048x2048';
    return SIZE_1K_MAP[aspectRatio || ''] || '1024x1024';
  }
  
  // 对于 Gemini 或其他非火山引擎模型，使用标准的 OpenAI 尺寸格式
  const q = quality === '3K' ? '3K' : '2K';
  const sizeMap = q === '3K' ? SIZE_3K_MAP : SIZE_2K_MAP;
  return sizeMap[aspectRatio || ''] || (q === '3K' ? '3072x3072' : '2048x2048');
};

const videoTaskConfigMap = new Map<string, { baseUrl: string; apiKey: string; provider: string }>();

const queryConfigsByCategory = async (category: string, userId: string): Promise<ModelConfig[]> => {
  const sql = `
    SELECT
      ac.id AS api_config_id,
      ac.provider,
      ac.base_url,
      ac.api_key,
      m.model_id,
      m.name AS model_name,
      m.is_default
    FROM api_configs ac
    LEFT JOIN models m ON ac.id = m.api_config_id
    WHERE ac.category = ? AND ac.user_id = ?
    ORDER BY ac.provider ASC
  `;

  const rows = await new Promise<ApiConfigRow[]>((resolve, reject) => {
    db.all(sql, [category, userId], (err, resultRows?: ApiConfigRow[]) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(resultRows || []);
    });
  });

  const grouped = new Map<string, ModelConfig>();
  rows.forEach((row) => {
    if (!grouped.has(row.api_config_id)) {
      grouped.set(row.api_config_id, {
        id: row.api_config_id,
        provider: row.provider,
        baseUrl: row.base_url,
        apiKey: row.api_key,
        models: [],
      });
    }
    if (row.model_id) {
      grouped.get(row.api_config_id)?.models.push({
        modelId: row.model_id,
        name: row.model_name || row.model_id,
        isDefault: !!row.is_default,
      });
    }
  });

  return Array.from(grouped.values());
};

const resolveConfigAndModel = async (category: string, userId: string, modelId?: string) => {
  const configs = await queryConfigsByCategory(category, userId);
  if (configs.length === 0) {
    const categoryName = category === 'video' ? '视频' : category === 'image' ? '图片' : '文本';
    return { error: `未找到${categoryName}模型配置，请先到设置页添加服务商。` };
  }

  if (modelId) {
    for (const config of configs) {
      const matched = config.models.find((m) => m.modelId === modelId);
      if (matched) return { config, modelId: matched.modelId };
    }
  }

  for (const config of configs) {
    const defaultModel = config.models.find((m) => m.isDefault);
    if (defaultModel) return { config, modelId: defaultModel.modelId };
  }

  for (const config of configs) {
    if (config.models.length > 0) {
      return { config, modelId: config.models[0].modelId };
    }
  }

  const categoryName = category === 'video' ? '视频' : category === 'image' ? '图片' : '文本';
  return { error: `当前${categoryName}服务商未配置可用模型，请先在设置页添加模型。` };
};

// AI text generation
router.post('/generate-text', async (req: Request, res: Response) => {
  const { prompt, modelId, useNetworking, systemPrompt, inputImages } = req.body;

  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ success: false, error: '提示词不能为空。' });
  }

  try {
    const resolved = await resolveConfigAndModel('text', req.user!.id, modelId);
    if ('error' in resolved) {
      return res.status(400).json({ success: false, error: resolved.error });
    }

    const { config, modelId: resolvedModelId } = resolved;
    if (!config.baseUrl || !config.apiKey) {
      return res.status(400).json({ success: false, error: '服务商配置缺少 Base URL 或 API Key。' });
    }

    const messages: any[] = [];
    
    // 1. Add System Prompt
    if (systemPrompt && String(systemPrompt).trim()) {
      messages.push({ role: 'system', content: String(systemPrompt).trim() });
    }

    // 2. Construct User Message (Multimodal if images exist)
    if (Array.isArray(inputImages) && inputImages.length > 0) {
      const content: any[] = [{ type: 'text', text: String(prompt).trim() }];
      
      inputImages.forEach((imgUrl: string) => {
        if (imgUrl && typeof imgUrl === 'string') {
          content.push({
            type: 'image_url',
            image_url: { url: imgUrl }
          });
        }
      });

      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: String(prompt).trim() });
    }

    const payload = {
      model: resolvedModelId,
      messages,
      stream: false,
    };

    const endpoint = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;
    console.log('[TextGen] 即将请求上游:', {
      provider: config.provider,
      url: endpoint,
      modelId: resolvedModelId,
      apiKeyMasked: maskApiKey(config.apiKey),
    });

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await upstream.json().catch(() => ({}));
    console.log('[TextGen] 上游响应详情:', JSON.stringify(result, null, 2));
    
    console.log('[TextGen] 上游响应概览:', {
      status: upstream.status,
      ok: upstream.ok,
      hasContent: !!result?.choices?.[0]?.message?.content,
      error: result?.error || result?.message || null,
    });

    if (!upstream.ok) {
      let upstreamMessage = result?.error?.message || result?.message || `上游请求失败(${upstream.status})`;
      
      // 特殊处理：如果报错提到 image_url 和 text，说明该模型不支持多模态输入
      if (upstreamMessage.includes('image_url') && upstreamMessage.includes('text')) {
        upstreamMessage = `生成失败：当前模型 (${resolvedModelId}) 可能不支持参考图片功能。请断开参考图片连接，或更换支持 Vision 的模型（如 gpt-4o, gemini-1.5 等）。\n\n原始错误：${upstreamMessage}`;
      }

      console.error('[TextGen] 上游返回错误:', result);
      return res.status(upstream.status).json({ success: false, error: upstreamMessage });
    }

    const content = result?.choices?.[0]?.message?.content;
    if (!content) {
      // 如果没有 content 但是有 error 对象，尝试提取
      const errorMessage = result?.error?.message || result?.message || '未从上游返回中解析到文本结果。';
      return res.status(502).json({ success: false, error: errorMessage, raw: result });
    }

    res.json({
      success: true,
      data: content,
      usage: result?.usage,
    });
  } catch (error: any) {
    console.error('[TextGen] 请求异常:', error);
    res.status(500).json({ success: false, error: error?.message || '文本生成请求失败。' });
  }
});

// Decompose script into storyboard shots
router.post('/decompose-script', async (req: Request, res: Response) => {
  const { script, modelId } = req.body;

  if (!script || !String(script).trim()) {
    return res.status(400).json({ success: false, error: '剧本内容不能为空。' });
  }

  try {
    const resolved = await resolveConfigAndModel('text', req.user!.id, modelId);
    if ('error' in resolved) {
      return res.status(400).json({ success: false, error: resolved.error });
    }

    const { config, modelId: resolvedModelId } = resolved;
    
    const systemPrompt = `你是一个专业的电影分镜师。你的任务是将用户提供的剧本拆解为一系列视觉镜头。
每个镜头需要包含：
1. 画面描述 (prompt): 简洁且具有视觉表现力的英文提示词，用于图片生成。
2. 建议时长 (duration): 该镜头的持续秒数 (通常为 3-8 秒)。

请严格按照 JSON 格式返回，格式如下：
{
  "shots": [
    { "prompt": "Shot 1 visual description in English", "duration": 5 },
    { "prompt": "Shot 2 visual description in English", "duration": 3 }
  ]
}
只返回 JSON，不要有任何其他文字说明。`;

    const payload = {
      model: resolvedModelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请拆解以下剧本：\n${script}` }
      ],
      response_format: { type: 'json_object' },
      stream: false,
    };

    const endpoint = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;
    console.log('[Decompose] 即将请求上游:', {
      provider: config.provider,
      url: endpoint,
      modelId: resolvedModelId,
      apiKeyMasked: maskApiKey(config.apiKey),
    });

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await upstream.json().catch(() => ({}));
    console.log('[Decompose] 上游响应:', {
      status: upstream.status,
      ok: upstream.ok,
      hasChoices: Array.isArray(result?.choices),
      error: result?.error || result?.message || null,
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ success: false, error: result?.error?.message || 'AI 拆解失败' });
    }

    let content = result?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ success: false, error: '未从上游返回中解析到结果。' });
    }

    // Try to parse JSON if it's wrapped in code blocks
    content = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(content);

    res.json({
      success: true,
      shots: parsed.shots || []
    });
  } catch (error: any) {
    console.error('[Decompose] 请求异常:', error);
    res.status(500).json({ success: false, error: error?.message || '剧本拆解失败。' });
  }
});

// AI image generation
router.post('/generate-image', async (req: Request, res: Response) => {
  const { prompt, inputImages, quality, aspectRatio, modelId } = req.body as {
    prompt?: string;
    inputImages?: string[];
    quality?: '1K' | '2K' | '3K';
    aspectRatio?: string;
    modelId?: string;
  };

  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ success: false, error: '提示词不能为空。' });
  }

  try {
    console.log('[ImageGen] 接收到生成请求:', {
      promptLength: String(prompt || '').trim().length,
      modelId,
      quality,
      aspectRatio,
      inputImagesCount: Array.isArray(inputImages) ? inputImages.length : 0,
      inputImagesPreview: Array.isArray(inputImages) ? inputImages.slice(0, 3) : [],
    });

    const resolved = await resolveConfigAndModel('image', req.user!.id, modelId);
    if ('error' in resolved) {
      console.warn('[ImageGen] 配置解析失败:', resolved.error);
      return res.status(400).json({ success: false, error: resolved.error });
    }

    const { config, modelId: resolvedModelId } = resolved;
    const finalModelId = resolveRequestedModelId(resolvedModelId);
    if (!config.baseUrl || !config.apiKey) {
      console.warn('[ImageGen] 服务商配置不完整:', {
        provider: config.provider,
        baseUrl: config.baseUrl,
        hasApiKey: !!config.apiKey,
      });
      return res.status(400).json({ success: false, error: '服务商配置缺少 Base URL 或 API Key。' });
    }

    if (isGeminiModel(finalModelId, config.provider)) {
      const images = Array.isArray(inputImages)
        ? inputImages.filter((item) => typeof item === 'string' && item.trim().length > 0)
        : [];

      const parts: Array<Record<string, unknown>> = [{ text: String(prompt).trim() }];
      for (const img of images) {
        const part = await imageUrlToInlineDataPart(img);
        if (part) parts.push(part);
      }

      // 适配 NewAPI/OpenAI 兼容路径，强制转换为 Gemini Native 协议路径
      const nativeBaseUrl = normalizeGeminiNativeBaseUrl(config.baseUrl, config.provider);
      const endpoint = `${nativeBaseUrl}/models/${finalModelId}:generateContent`;
      
      const payload: Record<string, unknown> = {
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatio || '1:1',
            imageSize: resolveGeminiImageSize(quality),
          },
        },
      };

      console.log(`[ImageGen] 即将请求上游(Gemini Native${config.provider === 'NewAPI' ? ' via NewAPI' : ''}):`, {
        provider: config.provider,
        url: endpoint,
        resolvedModelId: finalModelId,
        apiKeyMasked: maskApiKey(config.apiKey),
      });

      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey,
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await upstream.json().catch(() => ({}));
      console.log('[ImageGen] 上游响应(Gemini Native):', {
        status: upstream.status,
        ok: upstream.ok,
        error: result?.error || result?.message || null,
      });

      if (!upstream.ok) {
        const upstreamMessage = result?.error?.message || result?.message || `上游请求失败(${upstream.status})`;
        return res.status(upstream.status).json({ success: false, error: upstreamMessage });
      }

      const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
      const imageUrls: string[] = [];

      for (const c of candidates) {
        const content = c?.content || null;
        const respParts = Array.isArray(content?.parts) ? content.parts : [];
        for (const p of respParts) {
          const inlineData = (p?.inline_data || p?.inlineData) as any;
          const data = inlineData?.data ? String(inlineData.data) : '';
          if (!data) continue;
          const mimeType = inlineData?.mime_type || inlineData?.mimeType || 'image/png';
          imageUrls.push(`data:${mimeType};base64,${data}`);
        }
      }

      if (imageUrls.length === 0) {
        return res.status(502).json({ success: false, error: '未从上游返回中解析到图片结果。' });
      }

      return res.json({
        success: true,
        imageUrl: imageUrls[0],
        imageUrls,
        usage: result?.usageMetadata || result?.usage || undefined,
      });
    }

    const payload: Record<string, unknown> = {
      model: finalModelId,
      prompt: String(prompt).trim(),
      size: resolveSize(quality, aspectRatio, finalModelId),
      response_format: 'url',
    };
    
    // 如果不是火山引擎模型，也不是 Gemini 模型（通常是 OpenAI 风格），
    // 我们可以根据需要添加一些参数。火山引擎需要 output_format，
    // 而 Gemini 的 OpenAI 兼容层通常对未知参数比较敏感，所以我们这里做下区分。
    if (isSeedream3T2IModel(finalModelId)) {
      // 保持现状
    } else if (isGeminiModel(finalModelId, config.provider)) {
      // Gemini 暂时不需要额外的非标参数
    } else {
      payload.output_format = 'png';
      payload.watermark = false;
    }

    const images = Array.isArray(inputImages)
      ? inputImages.filter((item) => typeof item === 'string' && item.trim().length > 0)
      : [];
    if (isSeedream3T2IModel(finalModelId)) {
      if (images.length > 0) {
        console.warn('[ImageGen] Seedream 3.0 t2i 为文生图模型，已忽略参考图参数。', {
          resolvedModelId: finalModelId,
          ignoredImagesCount: images.length,
        });
      }
    } else if (images.length === 1) payload.image = images[0];
    else if (images.length > 1) payload.image = images;

    const endpoint = `${normalizeBaseUrl(config.baseUrl)}/images/generations`;
    console.log('[ImageGen] 即将请求上游:', {
      provider: config.provider,
      url: endpoint,
      resolvedModelId: finalModelId,
      requestPayload: payload,
      apiKeyMasked: maskApiKey(config.apiKey),
    });

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await upstream.json().catch(() => ({}));
    console.log('[ImageGen] 上游响应:', {
      status: upstream.status,
      ok: upstream.ok,
      hasData: Array.isArray(result?.data),
      dataLength: Array.isArray(result?.data) ? result.data.length : 0,
      error: result?.error || result?.message || null,
      usage: result?.usage || null,
    });
    if (!upstream.ok) {
      const upstreamMessage = result?.error?.message || result?.message || `上游请求失败(${upstream.status})`;
      console.error('[ImageGen] 上游返回失败:', {
        status: upstream.status,
        message: upstreamMessage,
      });
      return res.status(upstream.status).json({ success: false, error: upstreamMessage });
    }

    const dataArray = Array.isArray(result?.data) ? result.data : [];
    const imageUrls = dataArray
      .map((item: any) => item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null))
      .filter((u: any) => typeof u === 'string' && u.trim().length > 0) as string[];

    if (imageUrls.length === 0) {
      console.error('[ImageGen] 未解析到图片 URL:', {
        firstData: dataArray[0] || null,
      });
      return res.status(502).json({ success: false, error: '未从上游返回中解析到图片结果。' });
    }

    res.json({
      success: true,
      imageUrl: imageUrls[0],
      imageUrls,
      images: dataArray.length > 0 ? dataArray : undefined,
      usage: result?.usage,
    });
  } catch (error: any) {
    console.error('[ImageGen] 请求异常:', error);
    res.status(500).json({ success: false, error: error?.message || '图片生成请求失败。' });
  }
});

router.post('/generate-video', async (req: Request, res: Response) => {
  const { prompt, inputImages, modelId, generateAudio, resolution, ratio, duration, videoMode } = req.body as {
    prompt?: string;
    inputImages?: string[];
    modelId?: string;
    generateAudio?: boolean;
    resolution?: '480p' | '720p' | '1080p';
    ratio?: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
    duration?: number;
    videoMode?: 'auto' | 'text_to_video' | 'first_frame' | 'first_last_frame' | 'reference_images';
  };

  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ success: false, error: '提示词不能为空。' });
  }

  try {
    const resolved = await resolveConfigAndModel('video', req.user!.id, modelId);
    if ('error' in resolved) {
      return res.status(400).json({ success: false, error: resolved.error });
    }

    const { config, modelId: resolvedModelId } = resolved;
    if (!config.baseUrl || !config.apiKey) {
      return res.status(400).json({ success: false, error: '服务商配置缺少 Base URL 或 API Key。' });
    }

    const images = Array.isArray(inputImages)
      ? inputImages.filter((item) => typeof item === 'string' && item.trim().length > 0)
      : [];

    const content: any[] = [{ type: 'text', text: String(prompt).trim() }];
    let mode: 'text_to_video' | 'first_frame' | 'first_last_frame' | 'reference_images' = 'text_to_video';
    
    // 如果用户手动指定了模式且图片数符合基本逻辑，则使用手动模式
    const effectiveMode = videoMode && videoMode !== 'auto' ? videoMode : null;

    if (effectiveMode === 'text_to_video' || (!effectiveMode && images.length === 0)) {
      mode = 'text_to_video';
    } else if (effectiveMode === 'first_frame' || (!effectiveMode && images.length === 1)) {
      mode = 'first_frame';
      if (images.length >= 1) {
        content.push({ type: 'image_url', image_url: { url: images[0] } });
      }
    } else if (effectiveMode === 'first_last_frame' || (!effectiveMode && images.length === 2)) {
      mode = 'first_last_frame';
      if (images.length >= 1) content.push({ type: 'image_url', role: 'first_frame', image_url: { url: images[0] } });
      if (images.length >= 2) content.push({ type: 'image_url', role: 'last_frame', image_url: { url: images[1] } });
    } else {
      mode = 'reference_images';
      images.forEach((url) => {
        content.push({ type: 'image_url', role: 'reference_image', image_url: { url } });
      });
    }

    const payload: Record<string, unknown> = {
      model: resolvedModelId,
      content,
      generate_audio: !!generateAudio,
      resolution: resolution || '720p',
      ratio: ratio || '16:9',
      duration: typeof duration === 'number' ? duration : 5,
      watermark: false,
    };

    const endpoint = `${normalizeBaseUrl(config.baseUrl)}/contents/generations/tasks`;
    console.log('[VideoGen] 创建任务请求:', {
      provider: config.provider,
      url: endpoint,
      modelId: resolvedModelId,
      mode,
      imagesCount: images.length,
      payload,
      apiKeyMasked: maskApiKey(config.apiKey),
    });

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const upstreamMessage = result?.error?.message || result?.message || `上游请求失败(${upstream.status})`;
      return res.status(upstream.status).json({ success: false, error: upstreamMessage });
    }

    const taskId = result?.id;
    if (!taskId) {
      return res.status(502).json({ success: false, error: '未从上游返回中解析到视频任务ID。' });
    }

    videoTaskConfigMap.set(taskId, {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      provider: config.provider,
    });

    return res.json({ success: true, taskId, mode, status: 'queued' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || '视频生成请求失败。' });
  }
});

router.get('/generate-video/task/:taskId', async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const { modelId } = req.query as { modelId?: string };

  try {
    let config = videoTaskConfigMap.get(taskId);
    if (!config) {
      const resolved = await resolveConfigAndModel('video', req.user!.id, modelId);
      if ('error' in resolved) {
        return res.status(400).json({ success: false, error: resolved.error });
      }
      config = {
        baseUrl: resolved.config.baseUrl,
        apiKey: resolved.config.apiKey,
        provider: resolved.config.provider,
      };
    }

    const endpoint = `${normalizeBaseUrl(config.baseUrl)}/contents/generations/tasks/${taskId}`;
    console.log('[VideoTask] 查询任务状态:', {
      taskId,
      provider: config.provider,
      url: endpoint,
      apiKeyMasked: maskApiKey(config.apiKey),
    });

    const upstream = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    const result = await upstream.json().catch(() => ({}));
    console.log('[VideoTask] 上游响应:', {
      status: upstream.status,
      ok: upstream.ok,
      taskStatus: result?.status,
      error: result?.error || result?.message || null,
    });

    if (!upstream.ok) {
      const upstreamMessage = result?.error?.message || result?.message || `上游请求失败(${upstream.status})`;
      return res.status(upstream.status).json({ success: false, error: upstreamMessage });
    }

    const status = result?.status || 'queued';
    if (status === 'succeeded') {
      videoTaskConfigMap.delete(taskId);
    }

    return res.json({
      success: true,
      status,
      taskId,
      videoUrl: result?.content?.video_url || null,
      raw: result,
      error: result?.error || null,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || '视频任务查询失败。' });
  }
});

export default router;
