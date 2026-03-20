import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Save, X, AlignLeft, Image as ImageIcon, Video, Mic, Book, Eye, EyeOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

interface ApiConfig {
  id: string;
  category: string;
  provider: string;
  base_url: string;
  api_key: string;
  is_verified?: boolean | number;
  models: Model[];
}

interface Model {
  id?: string;
  model_id: string;
  name: string;
  is_default: boolean;
}

const CATEGORIES = [
  { id: 'text', name: '文本模型' },
  { id: 'image', name: '图片模型' },
  { id: 'video', name: '视频模型' },
  { id: 'audio', name: '声音模型' },
];

const PROVIDERS: Record<string, { name: string; models: string[] }[]> = {
  text: [
    { name: 'Google', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-pro-exp', 'gemini-2.0-flash-exp'] },
    { name: 'OpenAI', models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'] },
    { name: 'xAI', models: ['grok-1', 'grok-1.5'] },
    { name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { name: '火山引擎', models: ['doubao-pro-32k', 'doubao-lite-32k'] },
    { name: '阿里', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
    { name: 'NewAPI', models: ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'imagen-3.0-generate-001'] }
  ],
  image: [
    { name: 'Google', models: ['imagen-3.0-generate-001', 'imagen-3.0-fast-generate-001', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'] },
    { name: 'OpenAI', models: ['dall-e-3', 'dall-e-2'] },
    { name: 'xAI', models: [] },
    { name: 'DeepSeek', models: [] },
    { name: '火山引擎', models: ['doubao-seedream-5-0-260128', 'doubao-seedream-3-0-t2i-250415'] },
    { name: '阿里', models: ['wanx-v1'] },
    { name: 'NewAPI', models: ['imagen-3.0-generate-001', 'imagen-3.0-fast-generate-001', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'] }
  ],
  video: [
    { name: 'Google', models: [] },
    { name: 'OpenAI', models: ['sora-1.0'] },
    { name: 'xAI', models: [] },
    { name: 'DeepSeek', models: [] },
    { name: '火山引擎', models: ['doubao-seedance-1-5-pro-251215', 'doubao-seedance-1-0-pro-250528', 'doubao-seedance-1-0-pro-fast-251015', 'doubao-seedance-1-0-lite-t2v-250428', 'doubao-seedance-1-0-lite-i2v-250428'] },
    { name: '阿里', models: [] },
    { name: 'NewAPI', models: [] }
  ],
  audio: [
    { name: 'Google', models: [] },
    { name: 'OpenAI', models: ['tts-1', 'tts-1-hd', 'whisper-1'] },
    { name: 'xAI', models: [] },
    { name: 'DeepSeek', models: [] },
    { name: '火山引擎', models: [] },
    { name: '阿里', models: ['sambert-zh-nan'] },
    { name: 'NewAPI', models: [] }
  ]
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  'Google': 'https://generativelanguage.googleapis.com/v1beta/openai',
  'OpenAI': 'https://api.openai.com/v1',
  'xAI': 'https://api.x.ai/v1',
  'DeepSeek': 'https://api.deepseek.com',
  '火山引擎': 'https://ark.cn-beijing.volces.com/api/v3',
  '阿里': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'NewAPI': 'https://your-newapi-domain/v1'
};

const normalizeProviderName = (provider: string) => {
  if (provider === 'Volcengine') return '火山引擎';
  if (provider === 'Zhipu') return '阿里'; // Handle legacy data if any
  return provider;
};

const getCategoryIcon = (categoryId: string, size: number = 16) => {
  switch (categoryId) {
    case 'text': return <AlignLeft size={size} />;
    case 'image': return <ImageIcon size={size} />;
    case 'video': return <Video size={size} />;
    case 'audio': return <Mic size={size} />;
    default: return null;
  }
};

interface ProviderCardProps {
  providerName: string;
  providerConfigs: ApiConfig[];
  onUpdateModels: (config: ApiConfig, newModels: Model[]) => Promise<void>;
  fetchConfigs: () => Promise<void>;
}

const ProviderCard: React.FC<ProviderCardProps> = ({ providerName, providerConfigs, onUpdateModels, fetchConfigs }) => {
  const [activeTab, setActiveTab] = useState('text');
  const [showKey, setShowKey] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'success' | 'error' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [localApiKey, setLocalApiKey] = useState('');
  const [localBaseUrl, setLocalBaseUrl] = useState('');
  const [isAddingCustomModel, setIsAddingCustomModel] = useState(false);
  const [newCustomModelId, setNewCustomModelId] = useState('');

  const activeConfig = providerConfigs.find(c => c.category === activeTab);
  const isVerified = activeConfig?.is_verified === 1 || activeConfig?.is_verified === true;
  
  // Set initial local state when tab or provider configs change
  useEffect(() => {
    setLocalApiKey(activeConfig?.api_key || '');
    setLocalBaseUrl(activeConfig?.base_url || DEFAULT_BASE_URLS[providerName] || '');
    // Sync local test status with backend verified status
    if (activeConfig) {
      setTestStatus(isVerified ? 'success' : null);
    } else {
      setTestStatus(null);
    }
  }, [activeTab, activeConfig, providerName, isVerified]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const handleSaveConfig = async (syncAll: boolean = false) => {
    if (!localApiKey.trim() && !syncAll) {
      if (activeConfig) {
        if (confirm(`确定要删除 ${providerName} 的 ${CATEGORIES.find(c => c.id === activeTab)?.name.replace('模型', '')} 配置吗？`)) {
          try {
            await apiFetch(`/api/settings/apis/${activeConfig.id}`, { method: 'DELETE' });
            await fetchConfigs();
            showToast('配置已删除');
          } catch (error) {
            console.error('Error deleting config:', error);
          }
        }
      }
      return;
    }

    const categoriesToUpdate = syncAll ? CATEGORIES.map(c => c.id) : [activeTab];
    
    try {
      showToast(syncAll ? '正在同步所有分类...' : '正在保存...');
      
      const promises = categoriesToUpdate.map(async (cat) => {
        const existingCatConfig = providerConfigs.find(c => c.category === cat);
        const payload = {
          category: cat,
          provider: normalizeProviderName(providerName),
          base_url: localBaseUrl.trim() || DEFAULT_BASE_URLS[providerName] || '',
          api_key: localApiKey.trim(),
          models: existingCatConfig?.models || []
        };

        const url = existingCatConfig 
          ? `/api/settings/apis/${existingCatConfig.id}`
          : '/api/settings/apis';
        const method = existingCatConfig ? 'PUT' : 'POST';

        return apiFetch(url, {
          method,
          body: JSON.stringify(payload),
        });
      });

      const results = await Promise.all(promises);
      if (results.every(r => r.ok)) {
        showToast(syncAll ? '已同步到所有分类' : '配置已保存');
        await fetchConfigs();
      } else {
        showToast('部分配置保存失败');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      showToast('保存失败');
    }
  };

  const handleTestConfig = async () => {
    if (!activeConfig) {
       showToast('请先保存配置后再测试');
       return;
    }
    
    setTestingId(activeConfig.id);
    setTestStatus(null);
    try {
      const response = await apiFetch(`/api/settings/apis/${activeConfig.id}/test`, { method: 'POST' });
      const json = await response.json();
      if (response.ok && json?.success) {
        showToast(`测试成功：配置可用`);
        setTestStatus('success');
        // Refresh configs to update is_verified state
        await fetchConfigs();
      } else {
        showToast(`测试失败：${json?.message || '未知错误'}`);
        setTestStatus('error');
      }
    } catch (error: any) {
      showToast(`测试失败：${error?.message || '网络异常'}`);
      setTestStatus('error');
    } finally {
      setTestingId(null);
    }
  };

  const fetchProviderModels = async () => {
    if (!activeConfig) {
      showToast('请先填写并保存 API Key');
      return;
    }
    
    showToast('正在获取模型列表...');
    try {
      console.log(`[FetchModels] Starting fetch for provider: ${providerName}, category: ${activeTab}`);
      // 1. Get built-in models from PROVIDERS constant
      const builtInModels = PROVIDERS[activeTab]?.find(p => p.name === providerName)?.models || [];
      console.log(`[FetchModels] Built-in models count: ${builtInModels.length}`);
      
      // 2. Fetch models from upstream API via backend proxy
      let fetchedModels: string[] = [];
      try {
        console.log(`[FetchModels] Calling backend proxy: /api/settings/apis/${activeConfig.id}/models/fetch`);
        const response = await apiFetch(`/api/settings/apis/${activeConfig.id}/models/fetch`);
        const data = await response.json();
        if (response.ok && Array.isArray(data.models)) {
          fetchedModels = data.models;
          console.log(`[FetchModels] Upstream models fetched: ${fetchedModels.length}`);
        } else {
          console.error(`[FetchModels] Backend returned error:`, data);
        }
      } catch (e) {
        console.warn('Failed to fetch from upstream, using presets only:', e);
      }

      // 3. Merge current, built-in and fetched models
      const currentModels = activeConfig.models || [];
      console.log(`[FetchModels] Current enabled models count: ${currentModels.length}`);
      const newModels = [...currentModels];
      
      // Add models from presets and upstream, avoiding duplicates
      const allSourceModels = Array.from(new Set([...builtInModels, ...fetchedModels]));
      console.log(`[FetchModels] Total unique source models (built-in + upstream): ${allSourceModels.length}`);
      
      let addedCount = 0;
      allSourceModels.forEach(mId => {
        if (!newModels.some(m => m.model_id === mId)) {
           newModels.push({ 
             model_id: mId, 
             name: mId, 
             is_default: newModels.length === 0 
           });
           addedCount++;
        }
      });
      
      console.log(`[FetchModels] Total models after merge: ${newModels.length}, New models added: ${addedCount}`);
      
      await onUpdateModels(activeConfig, newModels);
      showToast(fetchedModels.length > 0 ? `已获取 ${fetchedModels.length} 个模型` : '已更新预设模型');
    } catch (e) {
      console.error('Fetch models error:', e);
      showToast('获取失败，请检查配置');
    }
  };

  const isConnected = !!activeConfig;

  // Build the list of models to display
  const builtInModels = PROVIDERS[activeTab]?.find(p => p.name === providerName)?.models || [];
  const enabledModels = activeConfig?.models || [];
  
  const displayModels: Array<{ id: string, name: string, is_enabled: boolean, is_default: boolean, is_builtin: boolean }> = [];
  
  builtInModels.forEach(modelId => {
    const enabled = enabledModels.find(m => m.model_id === modelId);
    displayModels.push({
      id: modelId,
      name: enabled ? enabled.name : modelId,
      is_enabled: !!enabled,
      is_default: !!enabled?.is_default,
      is_builtin: true
    });
  });

  enabledModels.forEach(m => {
    if (!builtInModels.includes(m.model_id)) {
      displayModels.push({ 
        id: m.model_id,
        name: m.name,
        is_enabled: true,
        is_default: m.is_default,
        is_builtin: false
      });
    }
  });

  const handleToggleModel = async (modelId: string) => {
    if (!activeConfig) {
      showToast('请先配置并保存 API Key');
      return;
    }
    const exists = activeConfig.models.some(m => m.model_id === modelId);
    let nextModels;
    if (exists) {
      nextModels = activeConfig.models.filter(m => m.model_id !== modelId);
      if (nextModels.length > 0 && !nextModels.some(m => m.is_default)) {
        nextModels[0].is_default = true;
      }
    } else {
      nextModels = [...activeConfig.models, { model_id: modelId, name: modelId, is_default: activeConfig.models.length === 0 }];
    }
    await onUpdateModels(activeConfig, nextModels);
  };

  const handleSetDefault = async (modelId: string) => {
    if (!activeConfig) return;
    const exists = activeConfig.models.some(m => m.model_id === modelId);
    let nextModels = exists
      ? activeConfig.models.map(m => ({ ...m, is_default: m.model_id === modelId }))
      : [...activeConfig.models, { model_id: modelId, name: modelId, is_default: true }].map(m => ({ ...m, is_default: m.model_id === modelId }));
    await onUpdateModels(activeConfig, nextModels);
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!activeConfig) return;
    
    // Safety check: don't allow deleting built-in models
    const builtInModels = PROVIDERS[activeTab]?.find(p => p.name === providerName)?.models || [];
    if (builtInModels.includes(modelId)) {
      showToast('不能删除内置模型');
      return;
    }

    if (confirm(`确定要删除模型 ${modelId} 吗？`)) {
      const nextModels = activeConfig.models.filter(m => m.model_id !== modelId);
      // If the deleted model was the default, set the first remaining one as default
      if (activeConfig.models.find(m => m.model_id === modelId)?.is_default && nextModels.length > 0) {
        nextModels[0].is_default = true;
      }
      await onUpdateModels(activeConfig, nextModels);
      showToast('模型已删除');
    }
  };

  return (
    <div className="bg-gray-800 text-gray-100 rounded-2xl p-6 flex flex-col w-full border border-gray-700 shadow-sm relative overflow-hidden">
      {/* Dark theme alternative for card (if keeping the dark aesthetic) */}
      <div className="absolute inset-0 bg-gray-800/80 pointer-events-none z-[-1]"></div>
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-200 shadow-sm">
            {providerName.charAt(0)}
          </div>
          <h3 className="text-lg font-bold text-white">{providerName}</h3>
          <div className={`w-2 h-2 rounded-full ${
            testStatus === 'success' ? 'bg-green-500' : 
            testStatus === 'error' ? 'bg-red-500' : 
            isConnected ? 'bg-blue-400' : 'bg-gray-500'
          }`}></div>
        </div>
        <a href="#" className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1 transition-colors">
          <Book size={14} /> 开通教程
        </a>
      </div>

      {/* Base URL and API Key */}
      <div className="flex flex-col gap-3 mb-6 bg-gray-900 rounded-xl px-4 py-3 shadow-inner z-10 border border-gray-700">
        <div className="flex items-center">
          <span className="text-xs font-medium w-16 text-gray-500 shrink-0">URL</span>
          <div className="flex-1 flex items-center min-w-0">
            <input 
              type="text"
              value={localBaseUrl}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="flex-1 bg-transparent text-sm text-gray-300 focus:outline-none focus:text-white placeholder-gray-600 truncate"
            />
          </div>
        </div>
        
        <div className="h-px w-full bg-gray-800"></div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center">
            <span className="text-xs font-medium w-16 text-gray-500 shrink-0">Key</span>
            <div className="flex-1 flex items-center min-w-0">
              <input 
                type={showKey ? "text" : "password"}
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
                placeholder="输入你的 API Key"
                className="flex-1 bg-transparent text-sm text-gray-300 tracking-widest focus:outline-none focus:text-white placeholder-gray-600 placeholder:tracking-normal truncate"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-1 border-t border-gray-800/50 pt-2">
            <button onClick={() => setShowKey(!showKey)} className="p-1.5 hover:text-gray-300 transition-colors rounded text-gray-500" title={showKey ? "隐藏" : "显示"}>
              {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
            </button>
            <button 
              onClick={() => handleSaveConfig(false)}
              className="p-1.5 hover:text-blue-400 transition-colors rounded text-gray-500"
              title="保存到当前分类"
            >
              <Save size={14}/>
            </button>
            <button 
              onClick={() => handleSaveConfig(true)}
              className="text-[10px] px-1.5 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              title="将此 URL 和 Key 应用到该厂商的所有分类"
            >
              同步全部分类
            </button>
            <button 
              onClick={handleTestConfig}
              disabled={testingId === activeConfig?.id && testingId !== null}
              className="text-xs px-3 py-1 rounded bg-blue-900/40 text-blue-400 hover:bg-blue-800/50 transition-colors border border-blue-700/50 disabled:opacity-50"
            >
              {testingId === activeConfig?.id ? '测试中...' : '测试连通性'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-gray-900/50 p-1 rounded-xl z-10">
        {CATEGORIES.map(cat => {
          const isActive = activeTab === cat.id;
          return (
            <button 
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors ${
                isActive ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {getCategoryIcon(cat.id)}
              {cat.name.replace('模型', '')}
            </button>
          );
        })}
      </div>

      {/* Models List Header */}
      <div className="flex justify-between items-center mb-4 px-1 z-10">
        <div className="flex items-center gap-2">
          <div className="text-gray-400">{getCategoryIcon(activeTab, 18)}</div>
          <span className="font-medium text-gray-200">{CATEGORIES.find(c => c.id === activeTab)?.name.replace('模型', '')}</span>
          <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full font-medium shadow-sm">{displayModels.length}</span>
        </div>
        <div className="flex gap-2 items-center">
          {isAddingCustomModel ? (
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 z-20">
              <input 
                type="text"
                value={newCustomModelId}
                onChange={(e) => setNewCustomModelId(e.target.value)}
                placeholder="输入模型 ID"
                className="bg-transparent text-xs text-white focus:outline-none w-28"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (newCustomModelId.trim()) {
                      handleToggleModel(newCustomModelId.trim());
                      setNewCustomModelId('');
                      setIsAddingCustomModel(false);
                    }
                  } else if (e.key === 'Escape') {
                    setIsAddingCustomModel(false);
                  }
                }}
              />
              <button 
                onClick={() => {
                  if (newCustomModelId.trim()) {
                    handleToggleModel(newCustomModelId.trim());
                    setNewCustomModelId('');
                    setIsAddingCustomModel(false);
                  }
                }}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium px-1"
              >
                确定
              </button>
              <button 
                onClick={() => setIsAddingCustomModel(false)}
                className="text-gray-500 hover:text-gray-400"
              >
                <X size={12}/>
              </button>
            </div>
          ) : (
            <>
              <button 
                onClick={fetchProviderModels}
                disabled={!isVerified}
                className={`text-sm flex items-center gap-1 transition-colors bg-blue-900/20 px-2 py-1 rounded ${
                  isVerified ? 'text-blue-400 hover:text-blue-300' : 'text-gray-600 cursor-not-allowed opacity-50'
                }`}
                title={!isVerified ? "请先通过连通性测试" : "一键获取模型"}
              >
                一键获取
              </button>
              <button 
                onClick={() => {
                  if (!activeConfig) {
                    showToast('请先填写并保存 API Key');
                    return;
                  }
                  if (!isVerified) {
                    showToast('请先通过连通性测试');
                    return;
                  }
                  setIsAddingCustomModel(true);
                }}
                className={`text-sm flex items-center gap-1 transition-colors px-2 py-1 ${
                  isVerified ? 'text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed opacity-50'
                }`}
                title={!isVerified ? "请先通过连通性测试" : "添加模型"}
              >
                <Plus size={14}/> 添加
              </button>
            </>
          )}
        </div>
      </div>

      {/* Models List */}
      <div className={`space-y-1 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar -mr-2 z-10 transition-opacity ${!isVerified ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
        {!isVerified && isConnected && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="bg-gray-900/80 px-4 py-2 rounded-lg border border-gray-700 text-xs text-amber-400 shadow-xl">
              请先完成连通性测试以配置模型
            </div>
          </div>
        )}
        {displayModels.length > 0 ? displayModels.map(model => (
          <div 
            key={model.id} 
            onDoubleClick={() => isVerified && model.is_enabled && handleSetDefault(model.id)}
            className="flex items-center justify-between p-3 hover:bg-gray-700/50 rounded-xl group transition-colors relative"
            title={isVerified && model.is_enabled ? "双击设为默认模型" : ""}
          >
            <div className="flex flex-col min-w-0 pr-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm truncate font-medium ${model.is_enabled ? 'text-gray-200' : 'text-gray-500'}`}>
                  {model.name}
                </span>
                {model.is_default && (
                  <span className="text-[10px] bg-blue-900/40 text-blue-300 border border-blue-700/50 px-1.5 py-0.5 rounded shrink-0">默认</span>
                )}
              </div>
              <span className="text-xs text-gray-500 truncate">{model.id}</span>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-3">
              {!model.is_builtin && model.is_enabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteModel(model.id);
                  }}
                  className="p-1 hover:text-red-400 text-gray-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="删除此模型"
                >
                  <X size={14} />
                </button>
              )}
              
              <button
                type="button"
                disabled={!isVerified}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleModel(model.id);
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  model.is_enabled ? 'bg-blue-600' : 'bg-gray-600'
                } ${!isVerified ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  model.is_enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>
        )) : (
          <div className="text-center text-sm text-gray-500 py-8">
            当前资源类型下暂无模型
          </div>
        )}
      </div>
    </div>
  );
};

const PROVIDER_ORDER = ['Google', 'OpenAI', 'xAI', 'DeepSeek', '火山引擎', '阿里', 'NewAPI'];

export default function Settings() {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 1600);
  };

  const fetchConfigs = async () => {
    try {
      const response = await apiFetch('/api/settings/apis');
      const data = await response.json();
      const normalized = (data.data || []).map((config: ApiConfig) => ({
        ...config,
        provider: normalizeProviderName(config.provider),
      }));
      setConfigs(normalized);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching configs:', error);
      setLoading(false);
    }
  };

  const handleUpdateModels = async (config: ApiConfig, newModels: Model[]) => {
    try {
      const response = await apiFetch(`/api/settings/apis/${config.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...config, models: newModels }),
      });
      if (response.ok) {
        await fetchConfigs();
      } else {
        showToast('更新失败');
      }
    } catch (error) {
      console.error('Error updating models:', error);
      showToast('更新失败');
    }
  };

  const groupedConfigs = configs.reduce<Record<string, ApiConfig[]>>((acc, cfg) => {
    const key = normalizeProviderName(cfg.provider);
    if (!acc[key]) acc[key] = [];
    acc[key].push(cfg);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center mb-8 border-b border-gray-800 pb-4">
          <Link to="/" className="mr-4 p-2 hover:bg-gray-800 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-2xl font-bold">API 配置</h1>
        </div>

        {/* Header section */}
        <div className="flex justify-between items-center mb-8 mt-4">
          <h2 className="text-xl font-bold text-gray-200">厂商资源池</h2>
        </div>

        {/* Provider Grouped List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center text-gray-400 py-12">加载中...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
              {PROVIDER_ORDER.map(providerName => (
                <ProviderCard
                  key={providerName}
                  providerName={providerName}
                  providerConfigs={groupedConfigs[providerName] || []}
                  onUpdateModels={handleUpdateModels}
                  fetchConfigs={fetchConfigs}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed top-6 right-6 z-[70] px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-xs text-gray-100 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
