import React, { useState, useEffect } from 'react';
import { 
  X, Search, Plus, Trash2, Edit2, 
  LayoutGrid, Type, Image as ImageIcon, 
  Film, Music, User, Star, ChevronDown, Save
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

interface Skill {
  id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface AssetManagerProps {
  onClose: () => void;
}

const CATEGORIES = [
  { id: 'all', name: '全部', icon: LayoutGrid },
  { id: 'text', name: '文案', icon: Type },
  { id: 'image', name: '图片', icon: ImageIcon },
  { id: 'video', name: '视频', icon: Film },
  { id: 'audio', name: '音频', icon: Music },
  { id: 'agent', name: '智能体', icon: User },
  { id: 'skill', name: '技能', icon: Star },
];

export default function AssetManager({ onClose }: AssetManagerProps) {
  const [activeCategory, setActiveCategory] = useState('agent');
  const [searchQuery, setSearchQuery] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingType, setEditingType] = useState<'agent' | 'skill'>('agent');
  const [currentAgent, setCurrentAgent] = useState<Partial<Agent> | null>(null);
  const [currentSkill, setCurrentSkill] = useState<Partial<Skill> | null>(null);

  useEffect(() => {
    fetchAgents();
    fetchSkills();
  }, []);

  const fetchAgents = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (data.success) {
        setAgents(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSkills = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      if (data.success) {
        setSkills(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAgent = async () => {
    if (!currentAgent?.name || !currentAgent?.system_prompt) {
      alert('请填写完整信息');
      return;
    }

    const method = currentAgent.id ? 'PUT' : 'POST';
    const url = currentAgent.id ? `/api/agents/${currentAgent.id}` : '/api/agents';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentAgent),
      });
      const data = await res.json();
      if (data.success) {
        setIsEditing(false);
        setCurrentAgent(null);
        fetchAgents();
      }
    } catch (err) {
      console.error('Failed to save agent:', err);
    }
  };

  const handleSaveSkill = async () => {
    if (!currentSkill?.name || !currentSkill?.content) {
      alert('请填写完整信息');
      return;
    }

    const method = currentSkill.id ? 'PUT' : 'POST';
    const url = currentSkill.id ? `/api/skills/${currentSkill.id}` : '/api/skills';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentSkill),
      });
      const data = await res.json();
      if (data.success) {
        setIsEditing(false);
        setCurrentSkill(null);
        fetchSkills();
      }
    } catch (err) {
      console.error('Failed to save skill:', err);
    }
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm('确定要删除这个智能体吗？')) return;
    try {
      const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchAgents();
      }
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  const handleDeleteSkill = async (id: string) => {
    if (!confirm('确定要删除这个技能吗？')) return;
    try {
      const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchSkills();
      }
    } catch (err) {
      console.error('Failed to delete skill:', err);
    }
  };

  const filteredAgents = agents.filter(agent => 
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.system_prompt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    skill.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryCount = (categoryId: string) => {
    if (categoryId === 'agent') return agents.length;
    if (categoryId === 'skill') return skills.length;
    return 0;
  };

  return (
    <div className="absolute inset-y-0 right-0 w-[480px] bg-[#1a1a1a] border-l border-gray-800 flex flex-col z-[100] shadow-2xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-blue-600/20 rounded-lg">
            <LayoutGrid size={18} className="text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-white">我的资产</h2>
        </div>
        <button 
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Workspace Selector */}
        <div className="px-4 py-3 flex items-center space-x-2 text-sm">
          <span className="text-gray-500">空间:</span>
          <button className="flex items-center space-x-1.5 bg-gray-800/50 hover:bg-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-700 text-gray-200 transition-colors">
            <User size={14} className="text-purple-400" />
            <span>当前</span>
            <ChevronDown size={14} className="text-gray-500" />
          </button>
        </div>

        {/* Categories */}
        <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
                activeCategory === cat.id 
                ? 'bg-blue-600/10 border-blue-600/50 text-blue-400 shadow-sm' 
                : 'bg-gray-800/30 border-gray-700/50 text-gray-400 hover:bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <cat.icon size={16} />
              <span>{cat.name}</span>
              <span className="text-[10px] bg-gray-700/50 px-1.5 py-0.5 rounded-md ml-1 opacity-50">{getCategoryCount(cat.id)}</span>
            </button>
          ))}
        </div>

        {/* Filter Toolbar */}
        <div className="px-4 py-3 flex items-center gap-2">
          <div className="flex bg-gray-800/50 p-1 rounded-lg border border-gray-700">
            <button className="px-4 py-1 rounded-md text-xs bg-gray-700 text-white shadow-sm">全部</button>
            <button className="px-4 py-1 rounded-md text-xs text-gray-400 hover:text-white transition-colors">收藏</button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={16} />
            <input 
              type="text" 
              placeholder="搜索资产名称、内容、标签..."
              className="w-full bg-gray-900/50 border border-gray-800 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-600 outline-none transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
          {activeCategory === 'agent' ? (
            <div className="space-y-3">
              <button 
                onClick={() => {
                  setCurrentAgent({ name: '', system_prompt: '' });
                  setEditingType('agent');
                  setIsEditing(true);
                }}
                className="w-full flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-800 hover:border-blue-500/50 hover:bg-blue-500/5 rounded-2xl text-gray-500 hover:text-blue-400 transition-all group"
              >
                <Plus size={20} className="group-hover:scale-110 transition-transform" />
                <span className="font-medium">新建智能体</span>
              </button>

              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3 text-gray-600">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs">加载中...</p>
                </div>
              ) : filteredAgents.length > 0 ? (
                filteredAgents.map(agent => (
                  <div 
                    key={agent.id}
                    className="bg-gray-800/30 border border-gray-800/50 hover:border-gray-700 rounded-2xl p-4 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
                          <User size={20} className="text-purple-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-200">{agent.name}</h3>
                          <p className="text-[10px] text-gray-500">{new Date(agent.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setCurrentAgent(agent);
                            setEditingType('agent');
                            setIsEditing(true);
                          }}
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteAgent(agent.id)}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed bg-gray-900/30 p-2 rounded-lg border border-gray-800/50">
                      {agent.system_prompt}
                    </p>
                  </div>
                ))
              ) : (
                <div className="py-20 flex flex-col items-center justify-center space-y-4 text-gray-600 opacity-50">
                  <div className="w-16 h-16 bg-gray-800/50 rounded-full flex items-center justify-center">
                    <LayoutGrid size={32} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">暂无资产</p>
                    <p className="text-[10px]">资产会在节点生成内容后自动保存</p>
                  </div>
                </div>
              )}
            </div>
          ) : activeCategory === 'skill' ? (
            <div className="space-y-3">
              <button
                onClick={() => {
                  setCurrentSkill({ name: '', content: '' });
                  setEditingType('skill');
                  setIsEditing(true);
                }}
                className="w-full flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-gray-800 hover:border-blue-500/50 hover:bg-blue-500/5 rounded-2xl text-gray-500 hover:text-blue-400 transition-all group"
              >
                <Plus size={20} className="group-hover:scale-110 transition-transform" />
                <span className="font-medium">新建技能</span>
              </button>

              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3 text-gray-600">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs">加载中...</p>
                </div>
              ) : filteredSkills.length > 0 ? (
                filteredSkills.map(skill => (
                  <div
                    key={skill.id}
                    className="bg-gray-800/30 border border-gray-800/50 hover:border-gray-700 rounded-2xl p-4 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-yellow-600/20 rounded-xl flex items-center justify-center">
                          <Star size={20} className="text-yellow-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-200">{skill.name}</h3>
                          <p className="text-[10px] text-gray-500">{new Date(skill.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setCurrentSkill(skill);
                            setEditingType('skill');
                            setIsEditing(true);
                          }}
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteSkill(skill.id)}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed bg-gray-900/30 p-2 rounded-lg border border-gray-800/50">
                      {skill.content}
                    </p>
                  </div>
                ))
              ) : (
                <div className="py-20 flex flex-col items-center justify-center space-y-4 text-gray-600 opacity-50">
                  <div className="w-16 h-16 bg-gray-800/50 rounded-full flex items-center justify-center">
                    <LayoutGrid size={32} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">暂无资产</p>
                    <p className="text-[10px]">资产会在节点生成内容后自动保存</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-20 flex flex-col items-center justify-center space-y-4 text-gray-600 opacity-50">
              <div className="w-16 h-16 bg-gray-800/50 rounded-full flex items-center justify-center">
                <LayoutGrid size={32} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">暂无资产</p>
                <p className="text-[10px]">资产会在节点生成内容后自动保存</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 text-center border-t border-gray-800/50">
        <p className="text-[10px] text-gray-500 flex items-center justify-center gap-2">
          <span className="w-1 h-1 bg-yellow-500 rounded-full animate-pulse" />
          点击插入 · 拖拽到画布 · 右键管理
        </p>
      </div>

      {/* Edit Modal Overlay */}
      {isEditing && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="w-full bg-[#1e1e1e] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span>
                  {editingType === 'agent'
                    ? (currentAgent?.id ? '编辑智能体' : '新建智能体')
                    : (currentSkill?.id ? '编辑技能' : '新建技能')}
                </span>
              </h3>
              <button 
                onClick={() => {
                  setIsEditing(false);
                  setCurrentAgent(null);
                  setCurrentSkill(null);
                }}
                className="text-gray-500 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">名称</label>
                <input 
                  type="text" 
                  placeholder={editingType === 'agent' ? '给智能体起个名字...' : '给技能起个名字...'}
                  className="w-full bg-gray-900 border border-gray-800 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 rounded-xl px-4 py-2.5 text-sm text-gray-200 outline-none transition-all"
                  value={editingType === 'agent' ? (currentAgent?.name || '') : (currentSkill?.name || '')}
                  onChange={(e) => {
                    if (editingType === 'agent') {
                      setCurrentAgent(prev => ({ ...prev!, name: e.target.value }));
                      return;
                    }
                    setCurrentSkill(prev => ({ ...prev!, name: e.target.value }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">
                  {editingType === 'agent' ? '系统提示词' : '技能内容'}
                </label>
                <textarea 
                  placeholder={editingType === 'agent' ? '定义智能体的角色和行为，例如：你是一个专业的文案翻译专家...' : '定义技能的内容，例如：生成代码前先澄清需求，再给出实现与验收清单...'}
                  className="w-full h-40 bg-gray-900 border border-gray-800 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 rounded-xl px-4 py-3 text-sm text-gray-200 outline-none resize-none transition-all custom-scrollbar"
                  value={editingType === 'agent' ? (currentAgent?.system_prompt || '') : (currentSkill?.content || '')}
                  onChange={(e) => {
                    if (editingType === 'agent') {
                      setCurrentAgent(prev => ({ ...prev!, system_prompt: e.target.value }));
                      return;
                    }
                    setCurrentSkill(prev => ({ ...prev!, content: e.target.value }));
                  }}
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => {
                    setIsEditing(false);
                    setCurrentAgent(null);
                    setCurrentSkill(null);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-800 text-gray-400 text-sm font-medium hover:bg-gray-800 hover:text-white transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={editingType === 'agent' ? handleSaveAgent : handleSaveSkill}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center space-x-2"
                >
                  <Save size={16} />
                  <span>保存配置</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
