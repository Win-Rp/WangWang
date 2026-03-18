import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Handle, NodeProps, Position, useReactFlow, NodeResizer, useEdges, useNodes } from '@xyflow/react';
import { 
  Plus, 
  Trash2, 
  ImageIcon, 
  Sparkles, 
  ChevronUp, 
  ChevronDown,
  Layout,
  Clock,
  Play,
  Check,
  X,
  Wand2
} from 'lucide-react';

interface StoryboardShot {
  id: string;
  prompt: string;
  imageUrl?: string | null;
  duration: number;
  status: 'idle' | 'generating' | 'success' | 'error';
}

interface StoryboardNodeData {
  label?: string;
  shots: StoryboardShot[];
  globalStyle?: string;
  modelId?: string;
  textModelId?: string;
}

export default function StoryboardNode({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as StoryboardNodeData;
  const { setNodes } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes();

  const [imageModels, setImageModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedImageModel, setSelectedImageModel] = useState<string>(nodeData.modelId || '');
  const [textModels, setTextModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedTextModel, setSelectedTextModel] = useState<string>(nodeData.textModelId || '');
  
  const [isImageModelMenuOpen, setIsImageModelMenuOpen] = useState(false);
  const [isTextModelMenuOpen, setIsTextModelMenuOpen] = useState(false);
  const [isDecomposing, setIsDecomposing] = useState(false);

  const shots = useMemo(() => nodeData.shots || [], [nodeData.shots]);

  const incomingText = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'script');
    if (!edge) return null;
    const sourceNode = nodes.find(n => n.id === edge.source);
    if (sourceNode?.type === 'text') {
      return sourceNode.data.content as string;
    }
    return null;
  }, [edges, id, nodes]);

  const updateNodeData = useCallback((updates: Partial<StoryboardNodeData>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        return { ...node, data: { ...node.data, ...updates } };
      })
    );
  }, [id, setNodes]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/settings/apis');
        const json = await res.json();
        const configs = Array.isArray(json.data) ? json.data : [];
        
        const iModels: { id: string; name: string; isDefault?: boolean }[] = [];
        const tModels: { id: string; name: string; isDefault?: boolean }[] = [];
        
        configs.forEach((config: any) => {
          (config.models || []).forEach((m: any) => {
            const modelObj = {
              id: m.model_id,
              name: m.name || m.model_id,
              isDefault: !!m.is_default,
            };
            if (config.category === 'image') iModels.push(modelObj);
            if (config.category === 'text') tModels.push(modelObj);
          });
        });

        setImageModels(iModels.map(({ id: mId, name }) => ({ id: mId, name })));
        setTextModels(tModels.map(({ id: mId, name }) => ({ id: mId, name })));

        if (!selectedImageModel && iModels.length > 0) {
          const def = iModels.find((m) => m.isDefault) || iModels[0];
          setSelectedImageModel(def.id);
          updateNodeData({ modelId: def.id });
        }
        if (!selectedTextModel && tModels.length > 0) {
          const def = tModels.find((m) => m.isDefault) || tModels[0];
          setSelectedTextModel(def.id);
          updateNodeData({ textModelId: def.id });
        }
      } catch {
        setImageModels([]);
        setTextModels([]);
      }
    };

    if (selected) fetchModels();
  }, [selected, selectedImageModel, selectedTextModel, updateNodeData]);

  const addShot = () => {
    const newShot: StoryboardShot = {
      id: Math.random().toString(36).substr(2, 9),
      prompt: '',
      duration: 3,
      status: 'idle'
    };
    updateNodeData({ shots: [...shots, newShot] });
  };

  const removeShot = (shotId: string) => {
    updateNodeData({ shots: shots.filter(s => s.id !== shotId) });
  };

  const updateShot = (shotId: string, updates: Partial<StoryboardShot>) => {
    updateNodeData({
      shots: shots.map(s => s.id === shotId ? { ...s, ...updates } : s)
    });
  };

  const moveShot = (index: number, direction: 'up' | 'down') => {
    const newShots = [...shots];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newShots.length) return;
    
    [newShots[index], newShots[targetIndex]] = [newShots[targetIndex], newShots[index]];
    updateNodeData({ shots: newShots });
  };

  const handleGenerateShotImage = async (shotId: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot || !shot.prompt.trim()) return;

    updateShot(shotId, { status: 'generating' });

    try {
      const fullPrompt = nodeData.globalStyle 
        ? `${nodeData.globalStyle}, ${shot.prompt}` 
        : shot.prompt;

      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          modelId: selectedImageModel,
          quality: '1K',
          aspectRatio: '16:9'
        })
      });

      const result = await response.json();
      if (result.success && result.imageUrl) {
        updateShot(shotId, { 
          imageUrl: result.imageUrl, 
          status: 'success' 
        });
      } else {
        updateShot(shotId, { status: 'error' });
        console.error('Shot generation failed:', result.error);
      }
    } catch (error) {
      updateShot(shotId, { status: 'error' });
      console.error('Shot generation error:', error);
    }
  };

  const handleGenerateAll = async () => {
    for (const shot of shots) {
      if (shot.prompt.trim() && shot.status !== 'generating') {
        await handleGenerateShotImage(shot.id);
      }
    }
  };

  const handleAIDecompose = async () => {
    if (!incomingText || isDecomposing) return;

    setIsDecomposing(true);
    try {
      const response = await fetch('/api/ai/decompose-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: incomingText,
          modelId: selectedTextModel
        })
      });

      const result = await response.json();
      if (result.success && result.shots) {
        const newShots: StoryboardShot[] = result.shots.map((s: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          prompt: s.prompt,
          duration: s.duration || 3,
          status: 'idle' as const
        }));
        updateNodeData({ shots: newShots });
      } else {
        alert('拆解失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      console.error('Decompose error:', error);
      alert('AI 拆解失败');
    } finally {
      setIsDecomposing(false);
    }
  };

  const currentImageModelName = imageModels.find((m) => m.id === selectedImageModel)?.name || '选择模型';
  const currentTextModelName = textModels.find((m) => m.id === selectedTextModel)?.name || '选择模型';

  return (
    <div className={`relative bg-gray-900 border-2 rounded-lg shadow-xl w-full h-full min-w-[400px] min-h-[400px] transition-all flex flex-col ${selected ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-gray-700'}`}>
      {/* Node Resizer */}
      <NodeResizer 
        minWidth={400} 
        minHeight={300} 
        isVisible={selected} 
        lineClassName="border-purple-500" 
        handleClassName="h-3 w-3 bg-white border-2 border-purple-500 rounded" 
      />

      {/* Handles */}
      <Handle type="target" position={Position.Left} id="script" className="w-4 h-4 bg-purple-500 z-50" />
      <Handle type="source" position={Position.Right} id="output" className="w-4 h-4 bg-purple-500 z-50" />

      {/* Header */}
      <div className="bg-gray-800 px-3 py-2 rounded-t-lg flex items-center justify-between border-b border-gray-700 group/header">
        <div className="flex items-center space-x-2">
          <Layout size={16} className="text-purple-400" />
          <span className="text-sm font-medium text-gray-200">{nodeData.label || '分镜脚本'}</span>
        </div>
        <div className="flex items-center space-x-3">
          {/* Text Model Selection */}
          {incomingText && (
            <div className="relative">
              <button
                onClick={() => setIsTextModelMenuOpen((v) => !v)}
                className="flex items-center gap-1 text-[10px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
                title="选择 AI 拆解模型"
              >
                <Wand2 size={10} />
                <span className="max-w-20 truncate">{currentTextModelName}</span>
              </button>
              {isTextModelMenuOpen && (
                <div className="absolute top-full right-0 mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                  {textModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedTextModel(m.id);
                        setIsTextModelMenuOpen(false);
                        updateNodeData({ textModelId: m.id });
                      }}
                      className={`w-full text-left px-3 py-2 text-[10px] flex items-center justify-between hover:bg-gray-800 transition-colors ${selectedTextModel === m.id ? 'bg-gray-800/50 text-cyan-400' : 'text-gray-200'}`}
                    >
                      <span className="truncate">{m.name}</span>
                      {selectedTextModel === m.id && <Check size={10} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Image Model Selection */}
          <div className="relative">
            <button
              onClick={() => setIsImageModelMenuOpen((v) => !v)}
              className="flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
              title="选择图片预览模型"
            >
              <Sparkles size={10} />
              <span className="max-w-20 truncate">{currentImageModelName}</span>
            </button>
            {isImageModelMenuOpen && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                {imageModels.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedImageModel(m.id);
                      setIsImageModelMenuOpen(false);
                      updateNodeData({ modelId: m.id });
                    }}
                    className={`w-full text-left px-3 py-2 text-[10px] flex items-center justify-between hover:bg-gray-800 transition-colors ${selectedImageModel === m.id ? 'bg-gray-800/50 text-purple-400' : 'text-gray-200'}`}
                  >
                    <span className="truncate">{m.name}</span>
                    {selectedImageModel === m.id && <Check size={10} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={addShot}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-purple-400 transition-colors"
            title="添加镜头"
          >
            <Plus size={16} />
          </button>
          <button
            className="p-1 hover:bg-red-900/50 rounded text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover/header:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setNodes((nds) => nds.filter((n) => n.id !== id));
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Global Style & AI Magic Bar */}
      <div className="px-3 py-2 border-b border-gray-800 bg-gray-900/50 flex items-center gap-2">
        <Sparkles size={12} className="text-purple-500" />
        <input 
          type="text"
          value={nodeData.globalStyle || ''}
          onChange={(e) => updateNodeData({ globalStyle: e.target.value })}
          placeholder="全局风格描述 (如: 赛博朋克, 电影质感...)"
          className="bg-transparent border-none outline-none text-xs text-gray-300 w-full placeholder-gray-600"
        />
        {incomingText && (
          <button 
            onClick={handleAIDecompose}
            disabled={isDecomposing}
            className={`flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-900/30 text-cyan-400 hover:bg-cyan-900/50 transition-colors whitespace-nowrap border border-cyan-800/50 disabled:opacity-50`}
          >
            {isDecomposing ? (
              <div className="w-3 h-3 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Wand2 size={12} />
            )}
            <span className="text-[10px]">AI 拆解</span>
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 nodrag nowheel custom-scrollbar">
        {shots.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2 opacity-50">
            <ImageIcon size={32} />
            <p className="text-xs">暂无分镜，点击右上角 + 开始创作</p>
          </div>
        ) : (
          shots.map((shot, index) => (
            <div key={shot.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 flex gap-3 group/shot relative">
              {/* Shot Index & Controls */}
              <div className="flex flex-col items-center justify-between py-1 text-gray-500">
                <span className="text-[10px] font-bold">#{index + 1}</span>
                <div className="flex flex-col gap-1">
                  <button 
                    onClick={() => moveShot(index, 'up')}
                    disabled={index === 0}
                    className="p-0.5 hover:bg-gray-700 rounded disabled:opacity-20"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button 
                    onClick={() => moveShot(index, 'down')}
                    disabled={index === shots.length - 1}
                    className="p-0.5 hover:bg-gray-700 rounded disabled:opacity-20"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
              </div>

              {/* Shot Image Preview */}
              <div className="w-24 h-24 flex-shrink-0 bg-black rounded border border-gray-700 overflow-hidden relative group/img">
                {shot.imageUrl ? (
                  <img src={shot.imageUrl} alt={`Shot ${index + 1}`} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700">
                    {shot.status === 'generating' ? (
                      <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    ) : shot.status === 'error' ? (
                      <X size={20} className="text-red-500" />
                    ) : (
                      <ImageIcon size={20} />
                    )}
                  </div>
                )}
                <button 
                  className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${shot.status === 'generating' ? 'opacity-100' : 'opacity-0 group-hover/img:opacity-100'}`}
                  disabled={shot.status === 'generating' || !shot.prompt.trim()}
                  onClick={() => handleGenerateShotImage(shot.id)}
                >
                  <Sparkles size={16} className={`${shot.status === 'generating' ? 'animate-pulse' : ''} text-purple-400`} />
                </button>
              </div>

              {/* Shot Editor */}
              <div className="flex-1 flex flex-col gap-2">
                <textarea
                  value={shot.prompt}
                  onChange={(e) => updateShot(shot.id, { prompt: e.target.value })}
                  placeholder="镜头提示词..."
                  className="w-full h-16 bg-transparent text-gray-200 text-xs resize-none outline-none border-none p-0 placeholder-gray-600"
                />
                <div className="flex items-center justify-between pt-1 border-t border-gray-700/50">
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <Clock size={10} />
                    <input 
                      type="number" 
                      value={shot.duration}
                      onChange={(e) => updateShot(shot.id, { duration: Number(e.target.value) })}
                      className="w-8 bg-transparent border-none outline-none text-gray-400 p-0"
                    />
                    <span>s</span>
                  </div>
                  <button 
                    onClick={() => removeShot(shot.id)}
                    className="p-1 hover:bg-red-900/30 rounded text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover/shot:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 bg-gray-800/80 border-t border-gray-700 rounded-b-lg flex justify-between items-center px-4">
        <div className="text-[10px] text-gray-500">
          共 {shots.length} 个镜头
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleGenerateAll}
            disabled={shots.length === 0 || shots.every(s => !s.prompt.trim())}
            className="flex items-center gap-1.5 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs transition-colors disabled:opacity-50"
          >
            <Sparkles size={12} className="text-purple-400" />
            <span>生成所有预览</span>
          </button>
          <button 
            className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs transition-colors disabled:opacity-50"
            disabled={shots.length === 0}
          >
            <Play size={12} />
            <span>导出序列</span>
          </button>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #374151;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4b5563;
        }
      `}</style>
    </div>
  );
}


