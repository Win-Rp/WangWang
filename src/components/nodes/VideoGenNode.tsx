import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, NodeProps, Position, useEdges, useNodes, useReactFlow, NodeResizer } from '@xyflow/react';
import { Check, Film, Sparkles, Trash2, Volume2, VolumeX } from 'lucide-react';

type Resolution = '480p' | '720p' | '1080p';
type Ratio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
type VideoMode = '文生视频' | '图生视频-基于首帧' | '图生视频-基于首尾帧' | '图生视频-基于参考图';

interface VideoGenNodeData {
  label?: string;
  prompt?: string;
  modelId?: string;
  resolution?: Resolution;
  ratio?: Ratio;
  duration?: number;
  generateAudio?: boolean;
  generatedVideo?: string | null;
}

export default function VideoGenNode({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as VideoGenNodeData;
  const { setNodes } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes();

  const [prompt, setPrompt] = useState<string>(nodeData.prompt || '');
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(nodeData.modelId || '');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [resolution, setResolution] = useState<Resolution>(nodeData.resolution || '720p');
  const [ratio, setRatio] = useState<Ratio>(nodeData.ratio || '16:9');
  const [duration, setDuration] = useState<number>(nodeData.duration || 5);
  const [generateAudio, setGenerateAudio] = useState<boolean>(nodeData.generateAudio ?? true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [taskStatus, setTaskStatus] = useState<string>('');
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(nodeData.generatedVideo || null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<number | null>(null);

  const incoming = useMemo(() => {
    const incomingEdges = edges.filter((e) => e.target === id);
    const bySourceId = new Map(nodes.map((n) => [n.id, n] as const));
    const textNodes: any[] = [];
    const imageNodes: any[] = [];

    for (const e of incomingEdges) {
      const sourceNode = bySourceId.get(e.source);
      if (!sourceNode) continue;
      const handle = e.targetHandle ?? null;
      const isPromptHandle = handle === 'prompt' || handle === 'text-input' || handle === null;
      const isImagesHandle = handle === 'images' || handle === 'image-input' || handle === null;
      if (isPromptHandle && sourceNode.type === 'text') textNodes.push(sourceNode);
      if (isImagesHandle && sourceNode.type === 'image') imageNodes.push(sourceNode);
    }

    imageNodes.sort((a, b) => a.position.y - b.position.y);
    return {
      upstreamTextNode: textNodes[0] || null,
      upstreamImageNodes: imageNodes,
    };
  }, [edges, id, nodes]);

  const upstreamTextNode = incoming.upstreamTextNode;
  const upstreamImageNodes = incoming.upstreamImageNodes;
  const imageUrls = useMemo(
    () => upstreamImageNodes.map((n: any) => n?.data?.imageUrl).filter((u: any) => !!u) as string[],
    [upstreamImageNodes]
  );

  const mode: VideoMode = useMemo(() => {
    if (imageUrls.length === 0) return '文生视频';
    if (imageUrls.length === 1) return '图生视频-基于首帧';
    if (imageUrls.length === 2) return '图生视频-基于首尾帧';
    return '图生视频-基于参考图';
  }, [imageUrls.length]);

  const updateNodeData = (updates: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        return { ...node, data: { ...node.data, ...updates } };
      })
    );
  };

  useEffect(() => {
    const nextPrompt = nodeData.prompt || '';
    if (!upstreamTextNode && nextPrompt !== prompt) setPrompt(nextPrompt);
    const nextModel = nodeData.modelId || '';
    if (nextModel !== selectedModel) setSelectedModel(nextModel);
    const nextResolution = nodeData.resolution || '720p';
    if (nextResolution !== resolution) setResolution(nextResolution);
    const nextRatio = nodeData.ratio || '16:9';
    if (nextRatio !== ratio) setRatio(nextRatio);
    const nextDuration = nodeData.duration || 5;
    if (nextDuration !== duration) setDuration(nextDuration);
    const nextAudio = nodeData.generateAudio ?? true;
    if (nextAudio !== generateAudio) setGenerateAudio(nextAudio);
    const nextVideo = nodeData.generatedVideo || null;
    if (nextVideo !== generatedVideo) setGeneratedVideo(nextVideo);
  }, [nodeData.prompt, nodeData.modelId, nodeData.resolution, nodeData.ratio, nodeData.duration, nodeData.generateAudio, nodeData.generatedVideo, upstreamTextNode, prompt, selectedModel, resolution, ratio, duration, generateAudio, generatedVideo]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/settings/apis');
        const json = await res.json();
        const configs = Array.isArray(json.data) ? json.data : [];
        const videoConfigs = configs.filter((c: any) => c.category === 'video');
        const availableModels: { id: string; name: string; isDefault?: boolean }[] = [];
        videoConfigs.forEach((config: any) => {
          (config.models || []).forEach((m: any) => {
            availableModels.push({
              id: m.model_id,
              name: m.name || m.model_id,
              isDefault: !!m.is_default,
            });
          });
        });
        setModels(availableModels.map((m) => ({ id: m.id, name: m.name })));
        if (!selectedModel && availableModels.length > 0) {
          const defaultModel = availableModels.find((m) => m.isDefault) || availableModels[0];
          setSelectedModel(defaultModel.id);
          updateNodeData({ modelId: defaultModel.id });
        }
      } catch {
        setModels([]);
      }
    };
    if (selected) fetchModels();
  }, [selected, selectedModel]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    };
  }, []);

  const currentModelName = models.find((m) => m.id === selectedModel)?.name || '选择模型';

  const startPollingTask = (taskId: string) => {
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const resp = await fetch(`/api/ai/generate-video/task/${taskId}?modelId=${encodeURIComponent(selectedModel)}`);
        const json = await resp.json();
        if (!json.success) {
          setTaskStatus(`失败: ${json.error || '查询失败'}`);
          setIsGenerating(false);
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
          return;
        }

        setTaskStatus(json.status || 'queued');
        if (json.status === 'succeeded') {
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
          setIsGenerating(false);
          if (json.videoUrl) {
            setGeneratedVideo(json.videoUrl);
            updateNodeData({ generatedVideo: json.videoUrl });
          } else {
            setTaskStatus('失败: 未返回视频地址');
          }
        } else if (json.status === 'failed' || json.status === 'expired') {
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
          setIsGenerating(false);
          setTaskStatus(`失败: ${json.error?.message || json.error || json.status}`);
        }
      } catch (error: any) {
        setTaskStatus(`失败: ${error?.message || '网络错误'}`);
        setIsGenerating(false);
        if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      }
    }, 4000);
  };

  const handleGenerate = async () => {
    const finalPrompt = upstreamTextNode ? (upstreamTextNode.data.content as string) : prompt;
    if (!finalPrompt || !String(finalPrompt).trim()) return;
    setIsGenerating(true);
    setTaskStatus('queued');
    try {
      const response = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          inputImages: imageUrls,
          modelId: selectedModel,
          generateAudio,
          resolution,
          ratio,
          duration,
        }),
      });
      const result = await response.json();
      if (!result.success || !result.taskId) {
        setIsGenerating(false);
        setTaskStatus(`失败: ${result.error || '创建任务失败'}`);
        return;
      }
      setTaskStatus('running');
      startPollingTask(result.taskId);
    } catch (error: any) {
      setIsGenerating(false);
      setTaskStatus(`失败: ${error?.message || '网络错误'}`);
    }
  };

  return (
    <div className={`relative bg-gray-900 border-2 rounded-lg shadow-xl w-full h-full min-w-[360px] min-h-[240px] transition-all flex flex-col ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'}`}>
      <div className="bg-gray-800 px-3 py-2 rounded-t-lg flex items-center justify-between border-b border-gray-700 group/header">
        <div className="flex items-center space-x-2">
          <Film size={16} className="text-cyan-400" />
          <span className="text-sm font-medium text-gray-200">{nodeData.label || '视频生成'}</span>
        </div>
        <button
          className="p-1 hover:bg-red-900/50 rounded text-gray-500 hover:text-red-400 transition-colors ml-auto mr-2 opacity-0 group-hover/header:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setNodes((nds) => nds.filter((n) => n.id !== id));
          }}
        >
          <Trash2 size={14} />
        </button>
        <Handle type="source" position={Position.Right} id="output" className="w-3 h-3 bg-cyan-500 z-50" />
      </div>

      <NodeResizer minWidth={340} minHeight={220} isVisible={selected} lineClassName="border-blue-500" handleClassName="h-3 w-3 bg-white border-2 border-blue-500 rounded" />

      <div className="p-3 border-b border-gray-800">
        <div className="text-xs text-gray-400 mb-2 flex items-center justify-between">
          <span>输入模式：{mode}</span>
          <span>参考图：{imageUrls.length} 张</span>
        </div>
        {upstreamTextNode ? (
          <div className="text-xs text-gray-500 truncate">提示词来自上游文本节点：{(upstreamTextNode.data.content as string) || '...'}</div>
        ) : (
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              updateNodeData({ prompt: e.target.value });
            }}
            className="nodrag w-full min-w-0 bg-gray-950 text-gray-200 p-2 rounded border border-gray-700 outline-none resize-none text-sm"
            style={{ overflow: 'hidden', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
            placeholder="输入视频提示词..."
            rows={3}
          />
        )}
      </div>

      <div className="relative flex-1 min-h-0 bg-black border-b border-gray-800 overflow-hidden">
        {generatedVideo ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <video src={generatedVideo} controls className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
            <Film size={24} className="mb-2 opacity-20" />
            <span className="text-xs">等待生成</span>
          </div>
        )}
        {isGenerating && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 backdrop-blur-sm">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-2"></div>
              <span className="text-xs text-cyan-300">{taskStatus || '生成中...'}</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 bg-gray-900 rounded-b-lg flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative" ref={modelMenuRef}>
            <button
              onClick={() => setIsModelMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
            >
              <Sparkles size={12} />
              <span className="max-w-24 truncate">{currentModelName}</span>
            </button>
            {isModelMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.id);
                      setIsModelMenuOpen(false);
                      updateNodeData({ modelId: m.id });
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-800 transition-colors ${selectedModel === m.id ? 'bg-gray-800/50 text-cyan-300' : 'text-gray-200'}`}
                  >
                    <span className="truncate">{m.name}</span>
                    {selectedModel === m.id && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={resolution}
            onChange={(e) => {
              const v = e.target.value as Resolution;
              setResolution(v);
              updateNodeData({ resolution: v });
            }}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
          >
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>

          <select
            value={duration}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDuration(v);
              updateNodeData({ duration: v });
            }}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
          >
            {Array.from({ length: 9 }).map((_, idx) => {
              const sec = idx + 4;
              return (
                <option key={sec} value={sec}>
                  {sec}s
                </option>
              );
            })}
          </select>

          <select
            value={ratio}
            onChange={(e) => {
              const v = e.target.value as Ratio;
              setRatio(v);
              updateNodeData({ ratio: v });
            }}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
            <option value="1:1">1:1</option>
            <option value="21:9">21:9</option>
            <option value="adaptive">adaptive</option>
          </select>

          <button
            onClick={() => {
              const next = !generateAudio;
              setGenerateAudio(next);
              updateNodeData({ generateAudio: next });
            }}
            className={`p-1.5 rounded transition-colors ${generateAudio ? 'text-cyan-300 bg-cyan-900/20' : 'text-gray-500 hover:text-gray-300'}`}
            title={generateAudio ? '已开启音频' : '已关闭音频'}
          >
            {generateAudio ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || (!prompt && !upstreamTextNode)}
          className={`p-1.5 rounded hover:bg-gray-700 text-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isGenerating ? 'animate-pulse' : ''}`}
          title="生成视频"
        >
          <Sparkles size={16} />
        </button>

        <Handle type="target" position={Position.Left} id="images" className="w-4 h-4 bg-cyan-500 z-50" style={{ top: 56, left: -6 }} />
        <Handle type="target" position={Position.Left} id="image-input" className="w-4 h-4 bg-cyan-500 opacity-0 pointer-events-none" style={{ top: 56, left: -6 }} />
        <Handle type="target" position={Position.Left} id="prompt" className="w-4 h-4 bg-blue-500 z-50" style={{ top: '88%', left: -6 }} />
        <Handle type="target" position={Position.Left} id="text-input" className="w-4 h-4 bg-blue-500 opacity-0 pointer-events-none" style={{ top: '88%', left: -6 }} />
      </div>
    </div>
  );
}
