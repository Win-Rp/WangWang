import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.ts';

const router = express.Router();
const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

type ConfigRow = {
  id: string;
  category: string;
  provider: string;
  base_url: string;
  api_key: string;
  model_id: string | null;
};

// Get all API configs
router.get('/apis', (req: Request, res: Response) => {
  const sql = `
    SELECT 
      ac.*,
      json_group_array(json_object(
        'id', m.id,
        'model_id', m.model_id,
        'name', m.name,
        'is_default', m.is_default
      )) as models
    FROM api_configs ac
    LEFT JOIN models m ON ac.id = m.api_config_id
    GROUP BY ac.id
  `;
  
  db.all(sql, [], (err, rows: any[]) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // Parse models JSON string
    const configs = rows.map((row: any) => ({
      ...row,
      models: JSON.parse(row.models as string).filter((m: any) => m.id !== null)
    }));
    res.json({ data: configs });
  });
});

// Create API config
router.post('/apis', (req: Request, res: Response) => {
  const { category, provider, base_url, api_key, models } = req.body;
  const configId = uuidv4();
  
  const insertConfigSql = `
    INSERT INTO api_configs (id, category, provider, base_url, api_key, is_verified)
    VALUES (?, ?, ?, ?, ?, 0)
  `;
  
  db.run(insertConfigSql, [configId, category, provider, base_url, api_key], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (models && Array.isArray(models) && models.length > 0) {
      const insertModelSql = `
        INSERT INTO models (id, api_config_id, model_id, name, is_default)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      let completed = 0;
      let hasError = false;
      
      models.forEach((model: any) => {
        if (hasError) return;
        
        const modelId = uuidv4();
        db.run(insertModelSql, [modelId, configId, model.model_id, model.name, model.is_default ? 1 : 0], (err) => {
          if (err) {
            hasError = true;
            console.error('Error inserting model:', err);
            // In a real app, we might want to rollback here
            return; 
          }
          completed++;
          if (completed === models.length) {
             res.status(201).json({ message: 'API config created successfully', id: configId });
          }
        });
      });
    } else {
      res.status(201).json({ message: 'API config created successfully', id: configId });
    }
  });
});

router.post('/apis/:id/test', async (req: Request, res: Response) => {
  const { id } = req.params;

  const sql = `
    SELECT
      ac.id,
      ac.category,
      ac.provider,
      ac.base_url,
      ac.api_key,
      m.model_id
    FROM api_configs ac
    LEFT JOIN models m ON ac.id = m.api_config_id
    WHERE ac.id = ?
  `;

  try {
    const rows = await new Promise<ConfigRow[]>((resolve, reject) => {
      db.all(sql, [id], (err, resultRows?: ConfigRow[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(resultRows || []);
      });
    });

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '未找到配置。' });
    }

    const config = rows[0];
    if (!config.base_url || !config.api_key) {
      return res.status(400).json({ success: false, message: 'Base URL 或 API Key 为空，无法测试。' });
    }

    const testUrl = `${normalizeBaseUrl(config.base_url)}/models`;
    console.log('[API Test] 开始测试配置:', {
      id: config.id,
      category: config.category,
      provider: config.provider,
      testUrl,
      modelsCount: rows.filter((r) => !!r.model_id).length,
    });

    const upstream = await fetch(testUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.api_key}`,
      },
    });

    const result = await upstream.json().catch(() => ({}));
    const isSuccess = upstream.ok;

    // Update is_verified status in database for THIS config and any other configs with same provider/url/key
    const updateSql = isSuccess 
      ? `UPDATE api_configs 
         SET is_verified = 1 
         WHERE id = ? 
         OR (provider = ? AND base_url = ? AND api_key = ?)`
      : `UPDATE api_configs SET is_verified = 0 WHERE id = ?`;
    
    const updateParams = isSuccess 
      ? [id, config.provider, config.base_url, config.api_key]
      : [id];

    db.run(updateSql, updateParams, (err) => {
      if (err) {
        console.error('[API Test] 更新验证状态失败:', err.message);
      } else if (isSuccess) {
        console.log(`[API Test] 已同步更新相同配置的厂商验证状态`);
      }
    });

    if (!isSuccess) {
      const message = result?.error?.message || result?.message || `测试失败(${upstream.status})`;
      console.warn('[API Test] 测试失败:', { id: config.id, status: upstream.status, message });
      return res.status(upstream.status).json({ success: false, message });
    }

    console.log('[API Test] 测试成功:', {
      id: config.id,
      provider: config.provider,
      status: upstream.status,
      modelListCount: Array.isArray(result?.data) ? result.data.length : 0,
    });

    return res.json({
      success: true,
      message: '连接测试成功',
      detail: {
        status: upstream.status,
        modelListCount: Array.isArray(result?.data) ? result.data.length : 0,
      },
    });
  } catch (error: any) {
    console.error('[API Test] 测试异常:', error);
    return res.status(500).json({ success: false, message: error?.message || '测试请求失败。' });
  }
});

// Fetch model list from upstream provider
router.get('/apis/:id/models/fetch', async (req: Request, res: Response) => {
  const { id } = req.params;
  const sql = 'SELECT base_url, api_key FROM api_configs WHERE id = ?';

  try {
    const config = await new Promise<any>((resolve, reject) => {
      db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!config) return res.status(404).json({ error: 'Config not found' });
    if (!config.base_url || !config.api_key) return res.status(400).json({ error: 'Configuration incomplete' });

    const fetchUrl = `${normalizeBaseUrl(config.base_url)}/models`;
    console.log(`[API Fetch Models] Requesting models from: ${fetchUrl}`);
    
    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.api_key}` },
    });

    console.log(`[API Fetch Models] Upstream responded with status: ${response.status}`);
    const data = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      console.error(`[API Fetch Models] Fetch failed:`, data);
      return res.status(response.status).json({ 
        error: data?.error?.message || data?.message || `Upstream error (${response.status})` 
      });
    }

    // OpenAI compatible format returns data as array of model objects
    const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
    console.log(`[API Fetch Models] Successfully fetched ${models.length} models`);
    res.json({ models });
  } catch (error: any) {
    console.error('[API Fetch Models] Error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch models from provider' });
  }
});

// Update API config
router.put('/apis/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { category, provider, base_url, api_key, models } = req.body;
  
  // First, get the current config to see if URL or Key changed
  db.get('SELECT base_url, api_key, is_verified FROM api_configs WHERE id = ?', [id], (err, currentConfig: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!currentConfig) return res.status(404).json({ error: 'Config not found' });

    // Only reset is_verified if URL or Key changed
    const urlChanged = currentConfig.base_url !== base_url;
    const keyChanged = currentConfig.api_key !== api_key;
    const isVerified = (urlChanged || keyChanged) ? 0 : currentConfig.is_verified;

    const updateConfigSql = `
      UPDATE api_configs 
      SET category = ?, provider = ?, base_url = ?, api_key = ?, is_verified = ?
      WHERE id = ?
    `;
    
    db.run(updateConfigSql, [category, provider, base_url, api_key, isVerified, id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (models && Array.isArray(models)) {
      db.run('DELETE FROM models WHERE api_config_id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (models.length === 0) {
          return res.status(200).json({ message: 'API config updated successfully' });
        }
        
        const insertModelSql = `
          INSERT INTO models (id, api_config_id, model_id, name, is_default)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        let completed = 0;
        let hasError = false;
        models.forEach((model: any) => {
          if (hasError) return;
          const modelId = uuidv4();
          db.run(insertModelSql, [modelId, id, model.model_id, model.name, model.is_default ? 1 : 0], (_err) => {
            if (_err) {
              hasError = true;
              res.status(500).json({ error: _err.message });
              return;
            }
            completed++;
            if (completed === models.length) {
              res.status(200).json({ message: 'API config updated successfully' });
            }
          });
        });
      });
    } else {
      res.status(200).json({ message: 'API config updated successfully' });
    }
    });
  });
});

// Delete API config
router.delete('/apis/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.run('DELETE FROM api_configs WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM models WHERE api_config_id = ?', [id], (_err) => {
      if (_err) return res.status(500).json({ error: _err.message });
      res.json({ message: 'API config deleted successfully' });
    });
  });
});

export default router;
