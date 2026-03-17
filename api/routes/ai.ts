import express, { type Request, type Response } from 'express';
import db from '../db/index.ts';

const router = express.Router();

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

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');
const maskApiKey = (apiKey: string) => (apiKey.length <= 8 ? '***' : `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`);
const isSeedream3T2IModel = (modelId: string) =>
  modelId.includes('seedream-3-0-t2i') || modelId.includes('seedream-3.0-t2i');
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
  const q = quality === '3K' ? '3K' : '2K';
  if (q === '3K') return SIZE_3K_MAP[aspectRatio || ''] || '3K';
  return SIZE_2K_MAP[aspectRatio || ''] || '2K';
};

const videoTaskConfigMap = new Map<string, { baseUrl: string; apiKey: string; provider: string }>();

const queryConfigsByCategory = async (category: string): Promise<ModelConfig[]> => {
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
    WHERE ac.category = ?
    ORDER BY ac.provider ASC
  `;

  const rows = await new Promise<ApiConfigRow[]>((resolve, reject) => {
    db.all(sql, [category], (err, resultRows?: ApiConfigRow[]) => {
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

const resolveConfigAndModel = async (category: string, modelId?: string) => {
  const configs = await queryConfigsByCategory(category);
  if (configs.length === 0) {
    return { error: `未找到${category === 'video' ? '视频' : '图片'}模型配置，请先到设置页添加服务商。` };
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

  return { error: `当前${category === 'video' ? '视频' : '图片'}服务商未配置可用模型，请先在设置页添加模型。` };
};

// Mock AI text generation
router.post('/generate-text', (req: Request, res: Response) => {
  const { prompt, modelId, useNetworking } = req.body;
  
  // Simulate delay
  setTimeout(() => {
    res.json({ 
      success: true, 
      data: `[${modelId || 'Default Model'}] Generated content for: ${prompt} ${useNetworking ? '(Networked)' : ''}` 
    });
  }, 1000);
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

    const resolved = await resolveConfigAndModel('image', modelId);
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

    const payload: Record<string, unknown> = {
      model: finalModelId,
      prompt: String(prompt).trim(),
      size: resolveSize(quality, aspectRatio, finalModelId),
      response_format: 'url',
    };
    if (!isSeedream3T2IModel(finalModelId)) {
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
      endpoint,
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

    const first = Array.isArray(result?.data) ? result.data[0] : null;
    const imageUrl = first?.url || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : null);

    if (!imageUrl) {
      console.error('[ImageGen] 未解析到图片 URL:', {
        firstData: first || null,
      });
      return res.status(502).json({ success: false, error: '未从上游返回中解析到图片结果。' });
    }

    res.json({
      success: true,
      imageUrl,
      images: Array.isArray(result?.data) ? result.data : undefined,
      usage: result?.usage,
    });
  } catch (error: any) {
    console.error('[ImageGen] 请求异常:', error);
    res.status(500).json({ success: false, error: error?.message || '图片生成请求失败。' });
  }
});

router.post('/generate-video', async (req: Request, res: Response) => {
  const { prompt, inputImages, modelId, generateAudio, resolution, ratio, duration } = req.body as {
    prompt?: string;
    inputImages?: string[];
    modelId?: string;
    generateAudio?: boolean;
    resolution?: '480p' | '720p' | '1080p';
    ratio?: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
    duration?: number;
  };

  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ success: false, error: '提示词不能为空。' });
  }

  try {
    const resolved = await resolveConfigAndModel('video', modelId);
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
    let mode: 'text' | 'first_frame' | 'first_last_frame' | 'reference_images' = 'text';
    if (images.length === 1) {
      mode = 'first_frame';
      content.push({ type: 'image_url', image_url: { url: images[0] } });
    } else if (images.length === 2) {
      mode = 'first_last_frame';
      content.push({ type: 'image_url', role: 'first_frame', image_url: { url: images[0] } });
      content.push({ type: 'image_url', role: 'last_frame', image_url: { url: images[1] } });
    } else if (images.length > 2) {
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
      endpoint,
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
      const resolved = await resolveConfigAndModel('video', modelId);
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
    const upstream = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    const result = await upstream.json().catch(() => ({}));
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
