import express, { Request, Response } from 'express';
import db from '../db/index.js';

const router = express.Router();

// Generate Text
router.post('/generate-text', (req: Request, res: Response) => {
  const { prompt, modelId } = req.body;

  if (!prompt || !modelId) {
    res.status(400).json({ error: 'Prompt and modelId are required' });
    return;
  }

  // 1. Get API config for the model
  const sql = `
    SELECT ac.base_url, ac.api_key
    FROM api_configs ac
    JOIN models m ON ac.id = m.api_config_id
    WHERE m.model_id = ? AND ac.category = 'text'
  `;

  db.get(sql, [modelId], async (err, config: any) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!config) {
      res.status(404).json({ error: 'Model configuration not found' });
      return;
    }

    try {
      // 2. Call External API (OpenAI Compatible)
      const response = await fetch(`${config.base_url}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.api_key}`
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      const generatedText = data.choices?.[0]?.message?.content || '';

      res.json({ data: generatedText });

    } catch (error: any) {
      console.error('AI Generation Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

export default router;
