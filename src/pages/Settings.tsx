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
  ],
  image: [
    { name: 'Midjourney', baseUrl: '', models: ['mj-v6'] },
    { name: 'Stable Diffusion', baseUrl: '', models: ['sd-xl'] },
  ],
  video: [
    { name: 'Runway', baseUrl: '', models: ['gen-2'] },
    { name: 'Pika', baseUrl: '', models: ['pika-1.0'] },
  ],
  audio: [
    { name: 'Suno', baseUrl: '', models: ['v3'] },
    { name: 'Udio', baseUrl: '', models: ['v1'] },
  ]
};

export default function Settings() {
  const [activeCategory, setActiveCategory] = useState('text');
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/settings/apis');
      const data = await response.json();
      setConfigs(data.data || []);
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
    
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, category: activeCategory }),
      });
      
      if (response.ok) {
        setShowAddModal(false);
        setEditingConfig(null);
        setFormData({ category: activeCategory, provider: '', base_url: '', api_key: '', models: [] });
        fetchConfigs();
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

  const openEditModal = (config: ApiConfig) => {
    setEditingConfig(config);
    setFormData(config);
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
        models: providerConfig.models.map((mid, index) => ({
          model_id: mid,
          name: mid, // Use model_id as name since we hide name input
          is_default: index === 0
        }))
      });
    } else {
      setFormData({
        ...formData,
        provider: providerName,
        base_url: '',
        models: []
      });
    }
  };

  const filteredConfigs = configs.filter(c => c.category === activeCategory);

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
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-400">模型列表</label>
                  <button 
                    onClick={() => {
                      const newModels = [...(formData.models || [])];
                      newModels.push({ model_id: '', name: '', is_default: newModels.length === 0 });
                      setFormData({...formData, models: newModels});
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center"
                  >
                    <Plus size={12} className="mr-1" /> 添加模型
                  </button>
                </div>
                
                <div className="space-y-3">
                  {formData.models?.map((model: any, index: number) => (
                    <div key={index} className="flex gap-2 items-center">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={model.model_id}
                          onChange={e => {
                            const newModels = [...(formData.models || [])];
                            newModels[index].model_id = e.target.value;
                            newModels[index].name = e.target.value; // Sync name with ID
                            setFormData({...formData, models: newModels});
                          }}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
                          placeholder="模型ID (gpt-4)"
                        />
                      </div>
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="default_model"
                          checked={model.is_default}
                          onChange={() => {
                            const newModels = (formData.models || []).map((m: any, i: number) => ({
                              ...m,
                              is_default: i === index
                            }));
                            setFormData({...formData, models: newModels});
                          }}
                          className="mr-2"
                        />
                        <span className="text-xs text-gray-400 mr-2">默认</span>
                        <button
                          onClick={() => {
                            const newModels = (formData.models || []).filter((_: any, i: number) => i !== index);
                            if (model.is_default && newModels.length > 0) {
                              newModels[0].is_default = true;
                            }
                            setFormData({...formData, models: newModels});
                          }}
                          className="text-red-400 hover:text-red-300 p-1"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
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
    </div>
  );
}
