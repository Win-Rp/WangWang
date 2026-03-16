import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';

const router = express.Router();

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
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // Parse models JSON string
    const configs = rows.map(row => ({
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
    INSERT INTO api_configs (id, category, provider, base_url, api_key)
    VALUES (?, ?, ?, ?, ?)
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

// Update API config
router.put('/apis/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { category, provider, base_url, api_key, models } = req.body;
  
  const updateConfigSql = `
    UPDATE api_configs 
    SET category = ?, provider = ?, base_url = ?, api_key = ?
    WHERE id = ?
  `;
  
  db.run(updateConfigSql, [category, provider, base_url, api_key, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (models && Array.isArray(models)) {
      // First delete existing models for this config
      db.run('DELETE FROM models WHERE api_config_id = ?', [id], (err) => {
        if (err) {
          console.error('Error deleting old models:', err);
        }
        
        // Then insert new models
        if (models.length > 0) {
           const insertModelSql = `
            INSERT INTO models (id, api_config_id, model_id, name, is_default)
            VALUES (?, ?, ?, ?, ?)
          `;
          
          let completed = 0;
          models.forEach((model: any) => {
            const modelId = uuidv4();
             db.run(insertModelSql, [modelId, id, model.model_id, model.name, model.is_default ? 1 : 0], (err) => {
               completed++;
               if (completed === models.length) {
                 res.json({ message: 'API config updated successfully' });
               }
             });
          });
        } else {
          res.json({ message: 'API config updated successfully' });
        }
      });
    } else {
      res.json({ message: 'API config updated successfully' });
    }
  });
});

// Delete API config
router.delete('/apis/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  
  // Delete models first (foreign key constraint might require this depending on setup, though usually CASCADE handles it if configured, but here we do manual)
  db.run('DELETE FROM models WHERE api_config_id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    db.run('DELETE FROM api_configs WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'API config deleted successfully' });
    });
  });
});

export default router;
