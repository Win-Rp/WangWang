import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ApiConfig {
  id: string;
  category: string;
  provider: string;
  base_url: string;
  api_key: string;
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

const PROVIDERS: Record<string, { name: string; baseUrl: string; models: string[] }[]> = {
  text: [
    { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'] },
    { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k'] },
    { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-3.1-flash-lite-preview', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview'] },
  ],
  image: [
    { name: '火山引擎', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: ['doubao-seedream-5-0-260128', 'doubao-seedream-3-0-t2i-250415'] },
    { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['Gemini 3 Pro Image', 'Gemini 3.1 Flash Image'] },
    { name: 'Midjourney', baseUrl: '', models: ['mj-v6'] },
    { name: 'Stable Diffusion', baseUrl: '', models: ['sd-xl'] },
  ],
  video: [
    { name: '火山引擎', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: ['doubao-seedance-1-5-pro-251215', 'doubao-seedance-1-0-pro-250528', 'doubao-seedance-1-0-pro-fast-251015', 'doubao-seedance-1-0-lite-t2v-250428', 'doubao-seedance-1-0-lite-i2v-250428'] },
    { name: 'Runway', baseUrl: '', models: ['gen-2'] },
    { name: 'Pika', baseUrl: '', models: ['pika-1.0'] },
  ],
  audio: [
    { name: 'Suno', baseUrl: '', models: ['v3'] },
    { name: 'Udio', baseUrl: '', models: ['v1'] },
  ]
};

const normalizeProviderName = (provider: string) => {
  if (provider === 'Volcengine') return '火山引擎';
  return provider;
};

export default function Settings() {
  const [activeCategory, setActiveCategory] = useState('text');
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [customModelInput, setCustomModelInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ApiConfig | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<ApiConfig>>({
    category: 'text',
    provider: '',
    base_url: '',
    api_key: '',
    models: []
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 1600);
  };

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/settings/apis');
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

  const handleSave = async () => {
    const url = editingConfig 
      ? `/api/settings/apis/${editingConfig.id}`
      : '/api/settings/apis';
    
    const method = editingConfig ? 'PUT' : 'POST';
    
    const existingModels = formData.models || [];
    const fallbackDefaultModelId = existingModels[0]?.model_id;
    const defaultModelId = existingModels.find((m: any) => m.is_default)?.model_id || fallbackDefaultModelId;
    const normalizedModels = existingModels.map((m: any) => ({
      ...m,
      name: m.model_id,
      is_default: m.model_id === defaultModelId,
    }));

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, models: normalizedModels, provider: normalizeProviderName(formData.provider || ''), category: activeCategory }),
      });
      
      if (response.ok) {
        setShowAddModal(false);
        setEditingConfig(null);
        setFormData({ category: activeCategory, provider: '', base_url: '', api_key: '', models: [] });
        fetchConfigs();
        showToast('配置已保存');
      }
    } catch (error) {
      console.error('Error saving config:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个配置吗？')) return;
    
    try {
      await fetch(`/api/settings/apis/${id}`, { method: 'DELETE' });
      fetchConfigs();
    } catch (error) {
      console.error('Error deleting config:', error);
    }
  };

  const handleTestConfig = async (config: ApiConfig) => {
    setTestingId(config.id);
    try {
      const response = await fetch(`/api/settings/apis/${config.id}/test`, { method: 'POST' });
      const json = await response.json();
      if (response.ok && json?.success) {
        showToast(`测试成功：${config.provider} 配置可用`);
      } else {
        showToast(`测试失败：${json?.message || '未知错误'}`);
      }
    } catch (error: any) {
      showToast(`测试失败：${error?.message || '网络异常'}`);
    } finally {
      setTestingId(null);
    }
  };

  const openEditModal = (config: ApiConfig) => {
    const sortedModels = [...(config.models || [])].sort((a: any, b: any) => Number(!!b.is_default) - Number(!!a.is_default));
    const normalizedConfig = { ...config, provider: normalizeProviderName(config.provider), models: sortedModels };
    setEditingConfig(normalizedConfig);
    setFormData(normalizedConfig);
    setCustomModelInput('');
    setShowAddModal(true);
  };

  const openAddModal = () => {
    setEditingConfig(null);
    setFormData({ 
      category: activeCategory, 
      provider: '', 
      base_url: '', 
      api_key: '',
      models: []
    });
    setCustomModelInput('');
    setShowAddModal(true);
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const providerName = e.target.value;
    const providerConfig = PROVIDERS[activeCategory]?.find(p => p.name === providerName);
    
    if (providerConfig) {
      setFormData({
        ...formData,
        provider: providerName,
        base_url: providerConfig.baseUrl,
        models: providerConfig.models.length > 0 ? [{
          model_id: providerConfig.models[0],
          name: providerConfig.models[0],
          is_default: true
        }] : []
      });
    } else {
      setFormData({
        ...formData,
        provider: providerName,
        base_url: '',
        models: []
      });
    }
    setCustomModelInput('');
  };

  const filteredConfigs = configs.filter(c => c.category === activeCategory);
  const selectedProviderConfig = PROVIDERS[activeCategory]?.find((p) => p.name === normalizeProviderName(formData.provider || ''));
  const integratedModelIds = selectedProviderConfig?.models || [];
  const selectedModels = formData.models || [];

  const removeModel = (modelId: string) => {
    const nextModels = selectedModels.filter((m: any) => m.model_id !== modelId);
    if (nextModels.length > 0 && !nextModels.some((m: any) => m.is_default)) {
      nextModels[0].is_default = true;
    }
    setFormData({ ...formData, models: nextModels });
  };

  const toggleIntegratedModel = (modelId: string) => {
    const exists = selectedModels.some((m: any) => m.model_id === modelId);
    if (exists) {
      removeModel(modelId);
      showToast(`已停用模型：${modelId}`);
      return;
    }
    const nextModels = [
      ...selectedModels,
      { model_id: modelId, name: modelId, is_default: selectedModels.length === 0 }
    ];
    setFormData({ ...formData, models: nextModels });
    showToast(`已启用模型：${modelId}`);
  };

  const setModelAsDefault = (modelId: string) => {
    const exists = selectedModels.some((m: any) => m.model_id === modelId);
    const nextModels = exists
      ? selectedModels.map((m: any) => ({ ...m, is_default: m.model_id === modelId }))
      : [...selectedModels, { model_id: modelId, name: modelId, is_default: true }].map((m: any) => ({ ...m, is_default: m.model_id === modelId }));
    setFormData({ ...formData, models: nextModels });
    showToast(`默认模型已设置为：${modelId}`);
  };

  const addCustomModel = () => {
    const modelId = customModelInput.trim();
    if (!modelId) return;
    if (selectedModels.some((m: any) => m.model_id === modelId)) {
      setCustomModelInput('');
      return;
    }
    const nextModels = [
      ...selectedModels,
      { model_id: modelId, name: modelId, is_default: selectedModels.length === 0 }
    ];
    setFormData({ ...formData, models: nextModels });
    setCustomModelInput('');
    showToast(`已添加自定义模型：${modelId}`);
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center mb-8">
          <Link to="/" className="mr-4 p-2 hover:bg-gray-800 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-2xl font-bold">API 设置</h1>
        </div>

        {/* Categories */}
        <div className="flex space-x-4 mb-8 border-b border-gray-700 pb-4">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeCategory === cat.id 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Config List */}
        <div className="space-y-4">
          {activeCategory === 'image' && (
            <div className="mb-4 rounded-lg border border-blue-800/40 bg-blue-950/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-blue-200">Seedream 对接说明（OpenAI 兼容格式）</p>
                <a
                  href="https://www.volcengine.com/docs/82379/1824121?lang=zh#8bc49063"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md border border-blue-700 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-900/40 transition-colors"
                >
                  查看官方文档
                </a>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center text-gray-400 py-8">加载中...</div>
          ) : filteredConfigs.length === 0 ? (
            <div className="text-center text-gray-400 py-12 border border-dashed border-gray-700 rounded-lg">
              <p className="mb-4">暂无配置</p>
              <button 
                onClick={openAddModal}
                className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center"
              >
                <Plus size={16} className="mr-2" /> 添加服务商
              </button>
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <button 
                  onClick={openAddModal}
                  className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center"
                >
                  <Plus size={16} className="mr-2" /> 添加服务商
                </button>
              </div>
              {filteredConfigs.map(config => (
                <div key={config.id} className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold mb-1">{config.provider}</h3>
                      <p className="text-gray-400 text-sm">{config.base_url}</p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleTestConfig(config)}
                        disabled={testingId === config.id}
                        className="px-2 py-1 text-xs rounded border border-emerald-700 text-emerald-300 hover:bg-emerald-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {testingId === config.id ? '测试中...' : '测试'}
                      </button>
                      <button 
                        onClick={() => openEditModal(config)}
                        className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-300"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(config.id)}
                        className="p-2 hover:bg-gray-700 rounded transition-colors text-red-400"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-400 mb-2">已配置模型:</h4>
                    <div className="flex flex-wrap gap-2">
                      {config.models && config.models.map((model: any) => (
                        <span 
                          key={model.id || model.model_id} 
                          className={`px-2 py-1 text-xs rounded border ${
                            model.is_default 
                              ? 'bg-blue-900/30 border-blue-700 text-blue-300' 
                              : 'bg-gray-700 border-gray-600 text-gray-300'
                          }`}
                        >
                          {model.name} {model.is_default && '(默认)'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 w-full max-w-2xl rounded-xl border border-gray-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">
                {editingConfig ? '编辑配置' : '添加服务商'} - {CATEGORIES.find(c => c.id === activeCategory)?.name}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">服务商名称</label>
                <select
                  value={formData.provider}
                  onChange={handleProviderChange}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 appearance-none"
                >
                  <option value="">请选择服务商...</option>
                  {PROVIDERS[activeCategory]?.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Base URL</label>
                <input
                  type="text"
                  value={formData.base_url}
                  onChange={e => setFormData({...formData, base_url: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">API Key</label>
                <input
                  type="password"
                  value={formData.api_key}
                  onChange={e => setFormData({...formData, api_key: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="sk-..."
                />
              </div>
              
              <div className="border-t border-gray-800 pt-4 mt-4">
                <div className="mb-2">
                  <label className="block text-sm font-medium text-gray-400">模型配置</label>
                </div>

                <div className="mb-3 rounded-lg border border-gray-800 p-3">
                  <div className="text-xs text-gray-400 mb-2">模型列表（双击设为默认；若未开启会自动开启）</div>
                  {integratedModelIds.length > 0 ? (
                    <div className="space-y-2">
                      {integratedModelIds.map((modelId) => {
                        const selectedModel = selectedModels.find((m: any) => m.model_id === modelId);
                        const isEnabled = !!selectedModel;
                        const isDefault = !!selectedModel?.is_default;
                        return (
                          <div
                            key={modelId}
                            onDoubleClick={() => setModelAsDefault(modelId)}
                            className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded px-3 py-2"
                            title="双击设为默认模型"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm text-gray-200 break-all">{modelId}</span>
                              {isDefault && <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/50">默认</span>}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleIntegratedModel(modelId);
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? 'bg-blue-600' : 'bg-gray-600'}`}
                            >
                              <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">当前服务商暂无内置对接模型</div>
                  )}
                </div>

                <div className="mb-3 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
                  <div className="text-xs text-amber-200 mb-2">自定义模型</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customModelInput}
                      onChange={(e) => setCustomModelInput(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
                      placeholder="输入自定义模型ID"
                    />
                    <button
                      onClick={addCustomModel}
                      className="px-3 py-1.5 text-xs bg-amber-700 hover:bg-amber-600 rounded text-white"
                    >
                      添加
                    </button>
                  </div>
                  <div className="text-[11px] text-amber-300/90 mt-2">
                    提示：自定义模型未经过当前系统对接验证，可能存在无法调用的情况。
                  </div>
                </div>

                
              </div>
            </div>
            
            <div className="flex justify-end mt-8 gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 transition-colors flex items-center"
              >
                <Save size={18} className="mr-2" /> 保存
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed top-6 right-6 z-[70] px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-xs text-gray-100 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
