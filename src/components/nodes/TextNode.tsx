import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps, useReactFlow, NodeResizer, useEdges, useNodes } from '@xyflow/react';
import { Sparkles, Check, Globe, Trash2, User, Star, Image as ImageIcon } from 'lucide-react';

interface TextNodeData {
  label: string;
  content: string;
  prompt?: string;
  modelId?: string;
  agentId?: string;
  skillId?: string;
  onContentChange?: (content: string) => void;
}

export default function TextNode({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as TextNodeData;
  const { setNodes } = useReactFlow();
  const [content, setContent] = useState<string>(nodeData.content || '');
  const [prompt, setPrompt] = useState<string>(nodeData.prompt || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [models, setModels] = useState<{id: string, name: string}[]>([]);
  const [agents, setAgents] = useState<{id: string, name: string, system_prompt: string}[]>([]);
  const [skills, setSkills] = useState<{id: string, name: string, content: string}[]>([]);
  const [selectedModel, setSelectedModel] = useState(nodeData.modelId || '');
  const [selectedAgentId, setSelectedAgentId] = useState(nodeData.agentId || '');
  const [selectedSkillId, setSelectedSkillId] = useState(nodeData.skillId || '');
  const [isNetworking, setIsNetworking] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [isSkillMenuOpen, setIsSkillMenuOpen] = useState(false);
  const isComposing = useRef(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const skillMenuRef = useRef<HTMLDivElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  const edges = useEdges();
  const nodes = useNodes();

  const incoming = useMemo(() => {
    const incomingEdges = edges.filter((e) => e.target === id);
    const bySourceId = new Map(nodes.map((n) => [n.id, n] as const));

    const imageNodes: any[] = [];

    for (const e of incomingEdges) {
      const sourceNode = bySourceId.get(e.source);
      if (!sourceNode) continue;

      const handle = e.targetHandle ?? null;
      const isImagesHandle = handle === 'images' || handle === 'image-input';

      if (isImagesHandle && sourceNode.type === 'image') {
        imageNodes.push(sourceNode);
      } else if (handle === null && sourceNode.type === 'image') {
        imageNodes.push(sourceNode);
      }
    }

    imageNodes.sort((a, b) => a.position.y - b.position.y);

    return {
      upstreamImageNodes: imageNodes,
    };
  }, [edges, id, nodes]);

  const upstreamImageNodes = incoming.upstreamImageNodes;

  const referenceImages = useMemo(() => {
    return upstreamImageNodes
      .map((node: any) => ({
        id: node?.id as string,
        url: (node?.data?.imageUrl as string | undefined) || null
      }))
      .filter((n: any) => !!n.id);
  }, [upstreamImageNodes]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
      if (agentMenuRef.current && !agentMenuRef.current.contains(event.target as Node)) {
        setIsAgentMenuOpen(false);
      }
      if (skillMenuRef.current && !skillMenuRef.current.contains(event.target as Node)) {
        setIsSkillMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update local state when data changes from outside
  useEffect(() => {
    if (isComposing.current) return;
    if (nodeData.content !== undefined && nodeData.content !== content) setContent(nodeData.content);
    if (nodeData.prompt !== undefined && nodeData.prompt !== prompt) setPrompt(nodeData.prompt);
    if (nodeData.modelId !== undefined && nodeData.modelId !== selectedModel) setSelectedModel(nodeData.modelId);
    if (nodeData.agentId !== undefined && nodeData.agentId !== selectedAgentId) setSelectedAgentId(nodeData.agentId);
    if (nodeData.skillId !== undefined && nodeData.skillId !== selectedSkillId) setSelectedSkillId(nodeData.skillId);
  }, [nodeData.content, nodeData.prompt, nodeData.modelId, nodeData.agentId, nodeData.skillId, content, prompt, selectedModel, selectedAgentId, selectedSkillId]);

  // Fetch available text models and agents
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Models
        const modelRes = await fetch('/api/settings/apis');
        const modelJson = await modelRes.json();
        const textConfigs = modelJson.data.filter((c: any) => c.category === 'text');
        const availableModels: {id: string, name: string}[] = [];
        
        textConfigs.forEach((config: any) => {
          config.models.forEach((m: any) => {
            availableModels.push({
              id: m.model_id, 
              name: m.name || m.model_id
            });
          });
        });
        
        setModels(availableModels);
        if (!selectedModel && availableModels.length > 0) {
          setSelectedModel(availableModels[0].id);
          updateNodeData({ modelId: availableModels[0].id });
        }

        // Fetch Agents
        const agentRes = await fetch('/api/agents');
        const agentJson = await agentRes.json();
        if (agentJson.success) {
          setAgents(agentJson.data);
        }

        // Fetch Skills
        const skillRes = await fetch('/api/skills');
        const skillJson = await skillRes.json();
        if (skillJson.success) {
          setSkills(skillJson.data);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    
    if (selected) {
      fetchData();
    }
  }, [selected]);

  const updateNodeData = (updates: Partial<TextNodeData>) => {
    setNodes((nds) => nds.map((node) => {
      if (node.id === id) {
        return { ...node, data: { ...node.data, ...updates } };
      }
      return node;
    }));
  };

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    autoResizeTextarea(contentTextareaRef.current);
  }, [content]);

  useEffect(() => {
    autoResizeTextarea(promptTextareaRef.current);
  }, [prompt, selected]);

  useEffect(() => {
    if (selectedAgentId && selectedSkillId) {
      setSelectedSkillId('');
      updateNodeData({ skillId: '' });
    }
  }, [selectedAgentId, selectedSkillId]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    // Only update global state if not composing
    if (!isComposing.current) {
      updateNodeData({ content: newContent });
      nodeData.onContentChange?.(newContent);
    }
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newPrompt = e.target.value;
    setPrompt(newPrompt);
    // Only update global state if not composing
    if (!isComposing.current) {
      updateNodeData({ prompt: newPrompt });
    }
  };

  const handleCompositionStart = () => {
    isComposing.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>, type: 'content' | 'prompt') => {
    isComposing.current = false;
    const value = (e.target as HTMLTextAreaElement).value;
    if (type === 'content') {
      updateNodeData({ content: value });
      nodeData.onContentChange?.(value);
    } else {
      updateNodeData({ prompt: value });
    }
  };

  const handleModelSelect = (modelId: string) => {
      setSelectedModel(modelId);
      setIsModelMenuOpen(false);
      updateNodeData({ modelId });
  };

  const handleAgentSelect = (agentId: string) => {
      setSelectedAgentId(agentId);
      setIsAgentMenuOpen(false);
      if (agentId) {
        setSelectedSkillId('');
        updateNodeData({ agentId, skillId: '' });
        return;
      }
      updateNodeData({ agentId });
  };

  const handleSkillSelect = (skillId: string) => {
      setSelectedSkillId(skillId);
      setIsSkillMenuOpen(false);
      if (skillId) {
        setSelectedAgentId('');
        updateNodeData({ skillId, agentId: '' });
        return;
      }
      updateNodeData({ skillId });
  };

  const handleGenerate = async () => {
    if (!prompt || !selectedModel) return;
    
    const selectedAgent = agents.find(a => a.id === selectedAgentId);
    const selectedSkill = skills.find(s => s.id === selectedSkillId);
    
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          modelId: selectedModel,
          useNetworking: isNetworking,
          systemPrompt: selectedSkill?.content ?? selectedAgent?.system_prompt,
          inputImages: referenceImages.map(img => img.url).filter(Boolean)
        })
      });
      
      const json = await res.json();
      if (json.data) {
        const newContent = json.data;
        setContent(newContent);
        updateNodeData({ content: newContent });
        nodeData.onContentChange?.(newContent);
      } else {
        alert('生成失败: ' + (json.error || '未知错误'));
      }
    } catch (err) {
      console.error('Generation error:', err);
      alert('生成出错，请检查网络或配置');
    } finally {
      setIsGenerating(false);
    }
  };

  const currentModelName = models.find(m => m.id === selectedModel)?.name || '选择模型';
  const currentAgentName = agents.find(a => a.id === selectedAgentId)?.name || '选择智能体';
  const currentSkillName = skills.find(s => s.id === selectedSkillId)?.name || '选择技能';

  return (
    <div className={`bg-gray-900 border-2 rounded-lg shadow-xl w-full h-full min-w-[200px] min-h-[150px] transition-all flex flex-col ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'} ${isGenerating ? 'animate-flowline' : ''}`}>
      
      <NodeResizer minWidth={200} minHeight={150} isVisible={selected} lineClassName="border-blue-500" handleClassName="h-3 w-3 bg-white border-2 border-blue-500 rounded" />

      {/* Header */}
      <div className="bg-gray-800 px-3 py-2 rounded-t-lg flex items-center justify-between border-b border-gray-700 group/header">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-200">{nodeData.label || '文本节点'}</span>
        </div>
        
        {/* Delete Button */}
        <button 
            className="p-1 hover:bg-red-900/50 rounded text-gray-500 hover:text-red-400 transition-colors ml-auto mr-2 opacity-0 group-hover/header:opacity-100"
            onClick={(e) => {
                e.stopPropagation();
                setNodes(nds => nds.filter(n => n.id !== id));
            }}
        >
            <Trash2 size={14} />
        </button>

        {/* Handles */}
        <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500 z-50" />
        <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500 z-50" />
      </div>

      {/* Reference Images Area (Mirrors ImageGenNode) */}
      <div className="bg-[#0f0f0f] border-b border-gray-800 px-3 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar relative min-h-[44px]">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {referenceImages.length > 0 ? (
              referenceImages.map((img) => (
                <div
                  key={img.id}
                  className="w-9 h-9 bg-gray-900 rounded-md border border-gray-800 overflow-hidden flex-shrink-0 relative group/img cursor-pointer"
                >
                  {img.url ? (
                    <img src={img.url} alt="Ref" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={14} className="text-gray-700" />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="w-full flex items-center justify-center text-[10px] text-gray-600 h-9 italic">无参考图片</div>
            )}
          </div>
          <Handle 
            type="target" 
            position={Position.Left} 
            id="images" 
            className="w-4 h-4 bg-purple-500 z-50" 
            style={{ top: 22, left: -6 }} 
          />
      </div>

      {/* Content Area */}
      <div className="p-3 border-b border-gray-800 flex-1 flex flex-col min-h-0">
        <textarea
          ref={contentTextareaRef}
          className="nodrag w-full h-full min-w-0 bg-gray-950 text-gray-200 p-2 rounded border border-gray-700 focus:border-blue-500 outline-none resize-none text-sm font-mono"
          placeholder="输入文本内容..."
          value={content}
          onChange={handleContentChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={(e) => handleCompositionEnd(e, 'content')}
          style={{ overflow: 'hidden', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
        />
      </div>

      {/* AI Controls (Visible when selected) */}
      {selected && (
        <div className="p-3 bg-gray-900 rounded-b-lg border-t border-gray-800">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex flex-col gap-3 shadow-sm">
            {/* Top: Prompt Input */}
            <textarea
              ref={promptTextareaRef}
              className="nodrag w-full min-w-0 bg-transparent text-gray-200 text-sm placeholder-gray-500 outline-none resize-none h-16 leading-relaxed"
              placeholder="输入 AI 提示词..."
              value={prompt}
              onChange={handlePromptChange}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={(e) => handleCompositionEnd(e, 'prompt')}
              style={{ overflow: 'hidden', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />

            {/* Bottom: Toolbar */}
            <div className="flex items-center justify-between">
              {/* Left: Model & Agent Selectors */}
              <div className="flex items-center gap-3">
                {/* Model Selector */}
                <div className="relative" ref={modelMenuRef}>
                  <button
                    onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors group"
                  >
                    <Sparkles size={12} className="text-gray-500 group-hover:text-gray-300" />
                    <span>{currentModelName}</span>
                  </button>

                  {/* Model Dropdown Menu */}
                  {isModelMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                      {models.map(m => (
                        <button
                          key={m.id}
                          onClick={() => handleModelSelect(m.id)}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-700 transition-colors ${selectedModel === m.id ? 'bg-gray-700/50 text-blue-400' : 'text-gray-300'}`}
                        >
                          <span className="truncate">{m.name}</span>
                          {selectedModel === m.id && <Check size={12} />}
                        </button>
                      ))}
                      {models.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500">无可用模型</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Agent Selector */}
                <div className="relative" ref={agentMenuRef}>
                  <button
                    onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
                    className={`flex items-center gap-1.5 text-xs font-medium transition-colors group ${selectedAgentId ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    <User size={12} className={selectedAgentId ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'} />
                    <span>{currentAgentName}</span>
                  </button>

                  {/* Agent Dropdown Menu */}
                  {isAgentMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                      <button
                        onClick={() => handleAgentSelect('')}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-700 transition-colors ${!selectedAgentId ? 'bg-gray-700/50 text-blue-400' : 'text-gray-300'}`}
                      >
                        <span>无智能体</span>
                        {!selectedAgentId && <Check size={12} />}
                      </button>
                      <div className="h-[1px] bg-gray-700 my-1" />
                      {agents.map(a => (
                        <button
                          key={a.id}
                          onClick={() => handleAgentSelect(a.id)}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-700 transition-colors ${selectedAgentId === a.id ? 'bg-gray-700/50 text-blue-400' : 'text-gray-300'}`}
                        >
                          <span className="truncate">{a.name}</span>
                          {selectedAgentId === a.id && <Check size={12} />}
                        </button>
                      ))}
                      {agents.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500">暂无智能体</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Skill Selector */}
                <div className="relative" ref={skillMenuRef}>
                  <button
                    onClick={() => setIsSkillMenuOpen(!isSkillMenuOpen)}
                    className={`flex items-center gap-1.5 text-xs font-medium transition-colors group ${selectedSkillId ? 'text-yellow-400' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    <Star size={12} className={selectedSkillId ? 'text-yellow-400' : 'text-gray-500 group-hover:text-gray-300'} />
                    <span>{currentSkillName}</span>
                  </button>

                  {isSkillMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                      <button
                        onClick={() => handleSkillSelect('')}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-700 transition-colors ${!selectedSkillId ? 'bg-gray-700/50 text-blue-400' : 'text-gray-300'}`}
                      >
                        <span>无技能</span>
                        {!selectedSkillId && <Check size={12} />}
                      </button>
                      <div className="h-[1px] bg-gray-700 my-1" />
                      {skills.map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleSkillSelect(s.id)}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-700 transition-colors ${selectedSkillId === s.id ? 'bg-gray-700/50 text-yellow-400' : 'text-gray-300'}`}
                        >
                          <span className="truncate">{s.name}</span>
                          {selectedSkillId === s.id && <Check size={12} />}
                        </button>
                      ))}
                      {skills.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500">暂无技能</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                {/* Globe Icon (Web Search toggle) */}
                <button 
                  onClick={() => setIsNetworking(!isNetworking)}
                  className={`p-1 transition-colors ${isNetworking ? 'text-blue-400 bg-blue-400/10 rounded' : 'text-gray-500 hover:text-gray-300'}`}
                  title={isNetworking ? "已开启联网搜索" : "点击开启联网搜索"}
                >
                  <Globe size={14} />
                </button>

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className={`p-1.5 rounded hover:bg-gray-700 text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isGenerating ? 'animate-pulse' : ''}`}
                  title="生成内容"
                >
                  <Sparkles size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
