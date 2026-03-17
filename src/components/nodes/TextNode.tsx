import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, useReactFlow, NodeResizer } from '@xyflow/react';
import { Sparkles, Check, Globe, Trash2 } from 'lucide-react';

interface TextNodeData {
  label: string;
  content: string;
  prompt?: string;
  modelId?: string;
  onContentChange?: (content: string) => void;
}

export default function TextNode({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as TextNodeData;
  const { setNodes } = useReactFlow();
  const [content, setContent] = useState<string>(nodeData.content || '');
  const [prompt, setPrompt] = useState<string>(nodeData.prompt || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [models, setModels] = useState<{id: string, name: string}[]>([]);
  const [selectedModel, setSelectedModel] = useState(nodeData.modelId || '');
  const [isNetworking, setIsNetworking] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Close model menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update local state when data changes from outside
  useEffect(() => {
    if (nodeData.content !== undefined && nodeData.content !== content) setContent(nodeData.content);
    if (nodeData.prompt !== undefined && nodeData.prompt !== prompt) setPrompt(nodeData.prompt);
    if (nodeData.modelId !== undefined && nodeData.modelId !== selectedModel) setSelectedModel(nodeData.modelId);
  }, [nodeData.content, nodeData.prompt, nodeData.modelId, content, prompt, selectedModel]);

  // Fetch available text models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/settings/apis');
        const json = await res.json();
        const textConfigs = json.data.filter((c: any) => c.category === 'text');
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
      } catch (err) {
        console.error('Error fetching models:', err);
      }
    };
    
    if (selected) {
      fetchModels();
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

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    updateNodeData({ content: newContent });
    nodeData.onContentChange?.(newContent);
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newPrompt = e.target.value;
    setPrompt(newPrompt);
    updateNodeData({ prompt: newPrompt });
  };

  const handleModelSelect = (modelId: string) => {
      setSelectedModel(modelId);
      setIsModelMenuOpen(false);
      updateNodeData({ modelId });
  };

  const handleGenerate = async () => {
    if (!prompt || !selectedModel) return;
    
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          modelId: selectedModel,
          useNetworking: isNetworking
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

  return (
    <div className={`bg-gray-900 border-2 rounded-lg shadow-xl w-full h-full min-w-[200px] min-h-[150px] transition-all flex flex-col ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'}`}>
      
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

      {/* Content Area */}
      <div className="p-3 border-b border-gray-800 flex-1 flex flex-col min-h-0">
        <textarea
          ref={contentTextareaRef}
          className="nodrag w-full h-full min-w-0 bg-gray-950 text-gray-200 p-2 rounded border border-gray-700 focus:border-blue-500 outline-none resize-none text-sm font-mono"
          placeholder="输入文本内容..."
          value={content}
          onChange={handleContentChange}
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
              {/* Left: Model Selector */}
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
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
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
