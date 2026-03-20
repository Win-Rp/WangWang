import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEdges, useNodes, useReactFlow, useViewport } from '@xyflow/react';
import { X, Sparkles, Film, FileText, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type PanelType = 'text' | 'image-gen' | 'video' | null;
type PanelDock = 'top' | 'right' | 'bottom' | 'left';

type ModelOption = { id: string; name: string; isDefault?: boolean };
type AgentOption = { id: string; name: string; system_prompt: string };
type SkillOption = { id: string; name: string; content: string };

const SEEDANCE_MODEL_CONFIGS: Record<string, { resolutions: string[]; ratios: string[]; durationRange: [number, number]; supportAudio: boolean }> = {
  'doubao-seedance-1-5-pro-251215': {
    resolutions: ['480p', '720p', '1080p'],
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
    durationRange: [4, 12],
    supportAudio: true,
  },
  'doubao-seedance-1-0-pro-250528': {
    resolutions: ['480p', '720p', '1080p'],
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
    durationRange: [2, 12],
    supportAudio: true,
  },
  'doubao-seedance-1-0-pro-fast-251015': {
    resolutions: ['480p', '720p', '1080p'],
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
    durationRange: [2, 12],
    supportAudio: true,
  },
  'doubao-seedance-1-0-lite-t2v-250428': {
    resolutions: ['480p', '720p'],
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
    durationRange: [2, 12],
    supportAudio: true,
  },
  'doubao-seedance-1-0-lite-i2v-250428': {
    resolutions: ['480p', '720p'],
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
    durationRange: [2, 12],
    supportAudio: true,
  },
};

const DEFAULT_VIDEO_CONFIG = {
  resolutions: ['480p', '720p', '1080p'],
  ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
  durationRange: [2, 12] as [number, number],
  supportAudio: true,
};

export default function NodeFloatingPanel({
  selectedNodeId,
  wrapperRef,
  onClose,
}: {
  selectedNodeId: string | null;
  wrapperRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
}) {
  const { x, y, zoom } = useViewport();
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const pollTimerRef = useRef<number | null>(null);
  const promptComposingRef = useRef(false);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const panelType: PanelType = (selectedNode?.type as any) === 'text' ? 'text' : (selectedNode?.type as any) === 'image-gen' ? 'image-gen' : (selectedNode?.type as any) === 'video' ? 'video' : null;

  const [textModels, setTextModels] = useState<ModelOption[]>([]);
  const [imageModels, setImageModels] = useState<ModelOption[]>([]);
  const [videoModels, setVideoModels] = useState<ModelOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [skills, setSkills] = useState<SkillOption[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [taskStatus, setTaskStatus] = useState<string>('');
  const [promptDraft, setPromptDraft] = useState<string>('');

  const [mentionMenu, setMentionMenu] = useState<{ visible: boolean; index: number; query: string; cursor: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!panelType) return;
    const run = async () => {
      try {
        const res = await apiFetch('/api/settings/apis');
        const json = await res.json();
        const configs = Array.isArray(json.data) ? json.data : [];

        const toOptions = (category: string) => {
          const filtered = category === 'image'
            ? (configs.filter((c: any) => c.category === 'image').length > 0
              ? configs.filter((c: any) => c.category === 'image')
              : configs.filter((c: any) => c.category !== 'text'))
            : configs.filter((c: any) => c.category === category);

          const opts: ModelOption[] = [];
          filtered.forEach((config: any) => {
            (config.models || []).forEach((m: any) => {
              const id = typeof m.model_id === 'string' ? m.model_id.trim() : '';
              if (!id || /\s/.test(id)) return;
              opts.push({ id, name: m.name || id, isDefault: !!m.is_default });
            });
          });
          return opts;
        };

        setTextModels(toOptions('text'));
        setImageModels(toOptions('image'));
        setVideoModels(toOptions('video'));
      } catch {
        setTextModels([]);
        setImageModels([]);
        setVideoModels([]);
      }
    };
    run();
  }, [panelType]);

  useEffect(() => {
    if (panelType !== 'text') return;
    const run = async () => {
      try {
        const [a, s] = await Promise.all([apiFetch('/api/agents'), apiFetch('/api/skills')]);
        const aj = await a.json();
        const sj = await s.json();
        setAgents(aj?.success ? aj.data : []);
        setSkills(sj?.success ? sj.data : []);
      } catch {
        setAgents([]);
        setSkills([]);
      }
    };
    run();
  }, [panelType]);

  const updateNodeData = (updates: Record<string, unknown>) => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNodeId) return n;
        return { ...n, data: { ...n.data, ...updates } };
      }),
    );
  };

  const incoming = useMemo(() => {
    if (!selectedNode) return { upstreamTextNode: null as any, upstreamImageNodes: [] as any[] };
    const incomingEdges = edges.filter((e) => e.target === selectedNode.id);
    const bySourceId = new Map(nodes.map((n) => [n.id, n] as const));
    const textNodes: any[] = [];
    const imageNodes: any[] = [];
    for (const e of incomingEdges) {
      const sourceNode = bySourceId.get(e.source);
      if (!sourceNode) continue;
      const handle = e.targetHandle ?? null;
      const isPromptHandle = handle === 'prompt' || handle === 'prompt-area' || handle === 'text-input' || handle === null;
      const isImagesHandle = handle === 'images' || handle === 'image-input' || handle === null;
      if (isPromptHandle && sourceNode.type === 'text') textNodes.push(sourceNode);
      if (isImagesHandle && sourceNode.type === 'image') imageNodes.push(sourceNode);
    }
    imageNodes.sort((a, b) => a.position.y - b.position.y);
    return { upstreamTextNode: textNodes[0] || null, upstreamImageNodes: imageNodes };
  }, [edges, nodes, selectedNode]);

  const upstreamImageUrls = useMemo(() => {
    return incoming.upstreamImageNodes
      .flatMap((n: any) => {
        const urls = Array.isArray(n?.data?.imageUrls) ? n.data.imageUrls : [];
        const single = typeof n?.data?.imageUrl === 'string' ? [n.data.imageUrl] : [];
        return urls.length > 0 ? urls : single;
      })
      .filter((u: any) => typeof u === 'string' && u.trim().length > 0) as string[];
  }, [incoming.upstreamImageNodes]);

  const panelDock: PanelDock = (selectedNode?.data as any)?.panelDock || 'bottom';

  useEffect(() => {
    if (!selectedNodeId || !selectedNode) return;
    const data: any = selectedNode.data || {};
    if (data.panelDock) return;
    updateNodeData({ panelDock: 'bottom' });
  }, [selectedNodeId, selectedNode]);

  useEffect(() => {
    if (!selectedNodeId || !selectedNode) return;
    if (promptComposingRef.current) return;
    setPromptDraft(String((selectedNode.data as any)?.prompt || ''));
  }, [selectedNodeId, panelType]);

  const positionStyle = useMemo(() => {
    if (!selectedNode || !wrapperRef.current) return null;
    const nodeX = (selectedNode.position?.x || 0) * zoom + x;
    const nodeY = (selectedNode.position?.y || 0) * zoom + y;
    const w = (selectedNode.width || (selectedNode as any).measured?.width || 360) * zoom;
    const h = (selectedNode.height || (selectedNode as any).measured?.height || 260) * zoom;

    const gap = 8;
    const panelHeight = 520;
    const minPanelWidth = 320;
    const maxPanelWidth = 560;

    const panelWidth = Math.min(Math.max(w, minPanelWidth), maxPanelWidth);

    let leftRaw = nodeX;
    let topRaw = nodeY + h + gap;

    if (panelDock === 'top') {
      leftRaw = nodeX;
      topRaw = nodeY - panelHeight - gap;
    } else if (panelDock === 'right') {
      leftRaw = nodeX + w + gap;
      topRaw = nodeY;
    } else if (panelDock === 'left') {
      leftRaw = nodeX - panelWidth - gap;
      topRaw = nodeY;
    } else {
      leftRaw = nodeX;
      topRaw = nodeY + h + gap;
    }

    return { left: leftRaw, top: topRaw, width: panelWidth, maxHeight: panelHeight };
  }, [selectedNode, wrapperRef, x, y, zoom, panelDock]);

  const ensureDefaultModel = (category: 'text' | 'image' | 'video') => {
    if (!selectedNode) return;
    const data: any = selectedNode.data || {};
    if (data.modelId) return;
    const opts = category === 'text' ? textModels : category === 'image' ? imageModels : videoModels;
    if (opts.length === 0) return;
    const def = opts.find((m) => m.isDefault) || opts[0];
    updateNodeData({ modelId: def.id });
  };

  useEffect(() => {
    if (!selectedNode || !panelType) return;
    if (panelType === 'text') ensureDefaultModel('text');
    if (panelType === 'image-gen') ensureDefaultModel('image');
    if (panelType === 'video') ensureDefaultModel('video');
  }, [panelType, selectedNodeId, textModels, imageModels, videoModels]);

  const stopPolling = () => {
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  };

  const startPollingVideoTask = (taskId: string, modelId: string) => {
    stopPolling();
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const resp = await apiFetch(`/api/ai/generate-video/task/${taskId}?modelId=${encodeURIComponent(modelId)}`);
        const json = await resp.json();
        if (!json.success) {
          setTaskStatus(`失败: ${json.error || '查询失败'}`);
          setIsGenerating(false);
          updateNodeData({ isGenerating: false });
          stopPolling();
          return;
        }

        setTaskStatus(json.status || 'queued');
        if (json.status === 'succeeded') {
          stopPolling();
          setIsGenerating(false);
          updateNodeData({ isGenerating: false });
          if (json.videoUrl) {
            updateNodeData({ generatedVideo: json.videoUrl });
            const out = edges.filter((e) => e.source === selectedNodeId && e.sourceHandle === 'output');
            if (out.length > 0) {
              setNodes((nds) =>
                nds.map((n) => {
                  const hit = out.find((e) => e.target === n.id);
                  if (!hit) return n;
                  if (n.type !== 'video-preview') return n;
                  return { ...n, data: { ...n.data, videoUrl: json.videoUrl } };
                }),
              );
            }
          } else {
            setTaskStatus('失败: 未返回视频地址');
          }
        } else if (json.status === 'failed' || json.status === 'expired') {
          stopPolling();
          setIsGenerating(false);
          updateNodeData({ isGenerating: false });
          setTaskStatus(`失败: ${json.error?.message || json.error || json.status}`);
        }
      } catch (error: any) {
        setTaskStatus(`失败: ${error?.message || '网络错误'}`);
        setIsGenerating(false);
        updateNodeData({ isGenerating: false });
        stopPolling();
      }
    }, 4000);
  };

  const generateText = async () => {
    if (!selectedNode) return;
    const data: any = selectedNode.data || {};
    const prompt = String(data.prompt || '').trim();
    const modelId = String(data.modelId || '').trim();
    if (!prompt || !modelId) return;
    const selectedAgent = agents.find((a) => a.id === data.agentId);
    const selectedSkill = skills.find((s) => s.id === data.skillId);
    setIsGenerating(true);
    updateNodeData({ isGenerating: true });
    try {
      const res = await apiFetch('/api/ai/generate-text', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          modelId,
          useNetworking: !!data.useNetworking,
          systemPrompt: selectedSkill?.content ?? selectedAgent?.system_prompt,
          inputImages: upstreamImageUrls,
        }),
      });
      const json = await res.json();
      if (json.data) {
        updateNodeData({ content: json.data });
      } else {
        alert('生成失败: ' + (json.error || '未知错误'));
      }
    } catch (err) {
      alert('生成出错，请检查网络或配置');
    } finally {
      setIsGenerating(false);
      updateNodeData({ isGenerating: false });
    }
  };

  const generateImage = async () => {
    if (!selectedNode) return;
    const data: any = selectedNode.data || {};
    const modelId = String(data.modelId || '').trim();
    const prompt = incoming.upstreamTextNode ? String(incoming.upstreamTextNode.data.content || '').trim() : String(data.prompt || '').trim();
    if (!prompt || !modelId) return;
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const hasImageOutput = edges.some((e) => e.source === selectedNodeId && e.sourceHandle === 'output' && byId.get(e.target)?.type === 'image');
    if (!hasImageOutput) {
      alert('请先从输出端口连接到图片节点后再生成。');
      return;
    }
    setIsGenerating(true);
    updateNodeData({ isGenerating: true });
    try {
      const response = await apiFetch('/api/ai/generate-image', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          inputImages: upstreamImageUrls,
          modelId,
          quality: data.quality || '1K',
          aspectRatio: data.aspectRatio || '16:9',
        }),
      });
      const result = await response.json();
      const urls = Array.isArray(result?.imageUrls) ? result.imageUrls : result?.imageUrl ? [result.imageUrl] : [];
      if (!result.success || urls.length === 0) {
        alert('生成失败: ' + (result.error || '未知错误'));
        return;
      }
      updateNodeData({ generatedImage: urls[0], generatedImages: urls });
      const out = edges.filter((e) => e.source === selectedNodeId);
      if (out.length > 0) {
        setNodes((nds) =>
          nds.map((n) => {
            const hit = out.find((e) => e.target === n.id);
            if (!hit) return n;
            if (n.type !== 'image') return n;
            return { ...n, data: { ...n.data, imageUrl: urls[0], imageUrls: urls } };
          }),
        );
      }
    } catch (error: any) {
      alert('生成出错，请检查网络');
    } finally {
      setIsGenerating(false);
      updateNodeData({ isGenerating: false });
    }
  };

  const generateVideo = async () => {
    if (!selectedNode) return;
    const data: any = selectedNode.data || {};
    const modelId = String(data.modelId || '').trim();
    const prompt = incoming.upstreamTextNode ? String(incoming.upstreamTextNode.data.content || '').trim() : String(data.prompt || '').trim();
    if (!prompt || !modelId) return;
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const hasVideoOutput = edges.some((e) => e.source === selectedNodeId && e.sourceHandle === 'output' && byId.get(e.target)?.type === 'video-preview');
    if (!hasVideoOutput) {
      alert('请先从输出端口连接到视频预览节点后再生成。');
      return;
    }
    setIsGenerating(true);
    updateNodeData({ isGenerating: true });
    setTaskStatus('queued');
    try {
      const response = await apiFetch('/api/ai/generate-video', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          inputImages: upstreamImageUrls,
          modelId,
          generateAudio: !!data.generateAudio,
          resolution: data.resolution || '720p',
          ratio: data.ratio || '16:9',
          duration: typeof data.duration === 'number' ? data.duration : 5,
          videoMode: data.videoMode || 'auto',
        }),
      });
      const result = await response.json();
      if (!result.success || !result.taskId) {
        setIsGenerating(false);
        updateNodeData({ isGenerating: false });
        setTaskStatus(`失败: ${result.error || '创建任务失败'}`);
        return;
      }
      setTaskStatus('running');
      startPollingVideoTask(result.taskId, modelId);
    } catch (error: any) {
      setIsGenerating(false);
      updateNodeData({ isGenerating: false });
      setTaskStatus(`失败: ${error?.message || '网络错误'}`);
    }
  };

  const filteredImages = useMemo(() => {
    if (!mentionMenu) return [];
    return upstreamImageUrls.map((url, i) => ({ url, label: `图片${i + 1}`, index: i }));
  }, [mentionMenu, upstreamImageUrls]);

  if (!selectedNodeId || !selectedNode || !panelType || !positionStyle) return null;

  const data: any = selectedNode.data || {};
  const icon = panelType === 'text' ? FileText : panelType === 'image-gen' ? Sparkles : Film;
  const title = panelType === 'text' ? '文本节点 AI' : panelType === 'image-gen' ? '生图节点 AI' : '视频节点 AI';
  const models = panelType === 'text' ? textModels : panelType === 'image-gen' ? imageModels : videoModels;

  const currentVideoConfig = panelType === 'video' ? (SEEDANCE_MODEL_CONFIGS[data.modelId] || DEFAULT_VIDEO_CONFIG) : DEFAULT_VIDEO_CONFIG;

  const getAutoVideoMode = () => {
    const count = upstreamImageUrls.length;
    if (count === 0) return 'text_to_video';
    if (count === 1) return 'first_frame';
    if (count === 2) return 'first_last_frame';
    return 'reference_images';
  };

  const videoModeLabels: Record<string, string> = {
    text_to_video: '文生视频',
    first_frame: '图生视频-首帧',
    first_last_frame: '图生视频-首尾帧',
    reference_images: '图生视频-参考图',
  };

  const handleMentionSelect = (imgIdx: number) => {
    if (!mentionMenu || !textareaRef.current) return;
    const before = promptDraft.slice(0, mentionMenu.cursor - mentionMenu.query.length - 1);
    const after = promptDraft.slice(mentionMenu.cursor);
    const mentionText = `图片${imgIdx + 1} `;
    const newText = before + mentionText + after;
    setPromptDraft(newText);
    updateNodeData({ prompt: newText });
    setMentionMenu(null);
    
    // 聚焦回输入框并设置光标位置
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = before.length + mentionText.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  return (
    <div
      className="absolute z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
      style={{ left: positionStyle.left, top: positionStyle.top, width: (positionStyle as any).width, maxHeight: (positionStyle as any).maxHeight }}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {React.createElement(icon, { size: 14, className: 'text-blue-400' })}
          <div className="text-sm text-gray-200 font-medium">{title}</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`p-1 rounded hover:bg-gray-700 ${panelDock === 'top' ? 'text-blue-300' : 'text-gray-300'}`}
            onClick={() => updateNodeData({ panelDock: 'top' })}
            title="放到上方"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className={`p-1 rounded hover:bg-gray-700 ${panelDock === 'right' ? 'text-blue-300' : 'text-gray-300'}`}
            onClick={() => updateNodeData({ panelDock: 'right' })}
            title="放到右侧"
          >
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            className={`p-1 rounded hover:bg-gray-700 ${panelDock === 'bottom' ? 'text-blue-300' : 'text-gray-300'}`}
            onClick={() => updateNodeData({ panelDock: 'bottom' })}
            title="放到底部"
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            className={`p-1 rounded hover:bg-gray-700 ${panelDock === 'left' ? 'text-blue-300' : 'text-gray-300'}`}
            onClick={() => updateNodeData({ panelDock: 'left' })}
            title="放到左侧"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-700 text-gray-300"
            onClick={() => {
              stopPolling();
              onClose();
            }}
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 w-14">模型</div>
          <select
            className="nodrag flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
            value={data.modelId || ''}
            onChange={(e) => updateNodeData({ modelId: e.target.value })}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            {models.length === 0 && <option value="">无可用模型</option>}
          </select>
        </div>

        {panelType === 'text' && (
          <>
            <div className="flex items-start gap-2 relative">
              <div className="text-xs text-gray-500 w-14 pt-1">提示词</div>
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  className="nodrag w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none resize-none h-20 overflow-y-auto"
                  value={promptDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    const pos = e.target.selectionStart;
                    setPromptDraft(v);
                    if (!promptComposingRef.current) updateNodeData({ prompt: v });

                    // 检测 @
                    const textBefore = v.slice(0, pos);
                    const lastAt = textBefore.lastIndexOf('@');
                    if (lastAt !== -1 && !textBefore.slice(lastAt + 1).includes(' ')) {
                      const query = textBefore.slice(lastAt + 1);
                      setMentionMenu({ visible: true, index: 0, query, cursor: pos });
                    } else {
                      setMentionMenu(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (mentionMenu && filteredImages.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setMentionMenu(s => s ? { ...s, index: (s.index + 1) % filteredImages.length } : null);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setMentionMenu(s => s ? { ...s, index: (s.index - 1 + filteredImages.length) % filteredImages.length } : null);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        handleMentionSelect(filteredImages[mentionMenu.index].index);
                      } else if (e.key === 'Escape') {
                        setMentionMenu(null);
                      }
                    }
                  }}
                  onCompositionStart={() => {
                    promptComposingRef.current = true;
                  }}
                  onCompositionEnd={(e) => {
                    promptComposingRef.current = false;
                    const v = (e.target as HTMLTextAreaElement).value;
                    setPromptDraft(v);
                    updateNodeData({ prompt: v });
                  }}
                  onBlur={() => {
                    if (!promptComposingRef.current) updateNodeData({ prompt: promptDraft });
                    // 延迟关闭菜单以便点击
                    setTimeout(() => setMentionMenu(null), 200);
                  }}
                />

                {mentionMenu && filteredImages.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-[60] max-h-40 overflow-y-auto">
                    {filteredImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleMentionSelect(img.index)}
                        onMouseEnter={() => setMentionMenu(s => s ? { ...s, index: idx } : null)}
                        className={`w-full text-left px-2 py-1.5 text-[10px] flex items-center gap-2 hover:bg-gray-800 transition-colors ${mentionMenu.index === idx ? 'bg-gray-800 text-blue-300' : 'text-gray-300'}`}
                      >
                        <div className="w-8 h-8 rounded bg-gray-800 border border-gray-700 overflow-hidden flex-shrink-0">
                          <img src={img.url} alt={img.label} className="w-full h-full object-contain" />
                        </div>
                        <span className="font-medium">{img.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 w-14">智能体</div>
              <select
                className="nodrag flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                value={data.agentId || ''}
                onChange={(e) => updateNodeData({ agentId: e.target.value, skillId: e.target.value ? '' : data.skillId || '' })}
              >
                <option value="">无</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 w-14">技能</div>
              <select
                className="nodrag flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                value={data.skillId || ''}
                onChange={(e) => updateNodeData({ skillId: e.target.value, agentId: e.target.value ? '' : data.agentId || '' })}
              >
                <option value="">无</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                className="nodrag"
                checked={!!data.useNetworking}
                onChange={(e) => updateNodeData({ useNetworking: e.target.checked })}
              />
              联网搜索
              <span className="text-gray-500">（参考图 {upstreamImageUrls.length} 张）</span>
            </label>

            <button
              type="button"
              className="nodrag w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-60"
              disabled={isGenerating || !String(data.prompt || '').trim() || !String(data.modelId || '').trim()}
              onClick={generateText}
            >
              {isGenerating ? '生成中…' : '生成文本'}
            </button>
          </>
        )}

        {panelType === 'image-gen' && (
          <>
            <div className="flex items-start gap-2 relative">
              <div className="text-xs text-gray-500 w-14 pt-1">提示词</div>
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  className="nodrag w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none resize-none h-20 overflow-y-auto disabled:opacity-70"
                  value={incoming.upstreamTextNode ? String(incoming.upstreamTextNode.data.content || '') : promptDraft}
                  disabled={!!incoming.upstreamTextNode}
                  onChange={(e) => {
                    const v = e.target.value;
                    const pos = e.target.selectionStart;
                    setPromptDraft(v);
                    if (!promptComposingRef.current) updateNodeData({ prompt: v, promptRich: null });

                    // 检测 @
                    const textBefore = v.slice(0, pos);
                    const lastAt = textBefore.lastIndexOf('@');
                    if (lastAt !== -1 && !textBefore.slice(lastAt + 1).includes(' ')) {
                      const query = textBefore.slice(lastAt + 1);
                      setMentionMenu({ visible: true, index: 0, query, cursor: pos });
                    } else {
                      setMentionMenu(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (mentionMenu && filteredImages.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setMentionMenu(s => s ? { ...s, index: (s.index + 1) % filteredImages.length } : null);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setMentionMenu(s => s ? { ...s, index: (s.index - 1 + filteredImages.length) % filteredImages.length } : null);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        handleMentionSelect(filteredImages[mentionMenu.index].index);
                      } else if (e.key === 'Escape') {
                        setMentionMenu(null);
                      }
                    }
                  }}
                  onCompositionStart={() => {
                    promptComposingRef.current = true;
                  }}
                  onCompositionEnd={(e) => {
                    promptComposingRef.current = false;
                    const v = (e.target as HTMLTextAreaElement).value;
                    setPromptDraft(v);
                    updateNodeData({ prompt: v, promptRich: null });
                  }}
                  onBlur={() => {
                    if (!promptComposingRef.current) updateNodeData({ prompt: promptDraft, promptRich: null });
                    setTimeout(() => setMentionMenu(null), 200);
                  }}
                />

                {mentionMenu && filteredImages.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-[60] max-h-40 overflow-y-auto">
                    {filteredImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleMentionSelect(img.index)}
                        onMouseEnter={() => setMentionMenu(s => s ? { ...s, index: idx } : null)}
                        className={`w-full text-left px-2 py-1.5 text-[10px] flex items-center gap-2 hover:bg-gray-800 transition-colors ${mentionMenu.index === idx ? 'bg-gray-800 text-blue-300' : 'text-gray-300'}`}
                      >
                        <div className="w-8 h-8 rounded bg-gray-800 border border-gray-700 overflow-hidden flex-shrink-0">
                          <img src={img.url} alt={img.label} className="w-full h-full object-contain" />
                        </div>
                        <span className="font-medium">{img.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 w-14">质量</div>
              <select
                className="nodrag flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                value={data.quality || '1K'}
                onChange={(e) => updateNodeData({ quality: e.target.value })}
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="3K">3K</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 w-14">比例</div>
              <select
                className="nodrag flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                value={data.aspectRatio || '16:9'}
                onChange={(e) => updateNodeData({ aspectRatio: e.target.value })}
              >
                <option value="1:1">1:1</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="3:2">3:2</option>
                <option value="2:3">2:3</option>
                <option value="21:9">21:9</option>
              </select>
            </div>

            <button
              type="button"
              className="nodrag w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-60"
              disabled={isGenerating || !String(data.modelId || '').trim() || !String(incoming.upstreamTextNode ? incoming.upstreamTextNode.data.content : data.prompt || '').trim()}
              onClick={generateImage}
            >
              {isGenerating ? '生成中…' : `生成图片（参考图 ${upstreamImageUrls.length} 张）`}
            </button>
          </>
        )}

        {panelType === 'video' && (
          <>
            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 w-14">视频模式</div>
              <select
                className="nodrag flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                value={data.videoMode || 'auto'}
                onChange={(e) => updateNodeData({ videoMode: e.target.value })}
              >
                <option value="auto">自动识别 ({videoModeLabels[getAutoVideoMode()]})</option>
                <option value="text_to_video">文生视频</option>
                <option value="first_frame">图生视频-首帧</option>
                <option value="first_last_frame">图生视频-首尾帧</option>
                <option value="reference_images">图生视频-参考图</option>
              </select>
            </div>

            <div className="flex items-start gap-2 relative">
              <div className="text-xs text-gray-500 w-14 pt-1">提示词</div>
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  className="nodrag w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none resize-none h-20 overflow-y-auto disabled:opacity-70"
                  value={incoming.upstreamTextNode ? String(incoming.upstreamTextNode.data.content || '') : promptDraft}
                  disabled={!!incoming.upstreamTextNode}
                  onChange={(e) => {
                    const v = e.target.value;
                    const pos = e.target.selectionStart;
                    setPromptDraft(v);
                    if (!promptComposingRef.current) updateNodeData({ prompt: v, promptRich: null });

                    // 检测 @
                    const textBefore = v.slice(0, pos);
                    const lastAt = textBefore.lastIndexOf('@');
                    if (lastAt !== -1 && !textBefore.slice(lastAt + 1).includes(' ')) {
                      const query = textBefore.slice(lastAt + 1);
                      setMentionMenu({ visible: true, index: 0, query, cursor: pos });
                    } else {
                      setMentionMenu(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (mentionMenu && filteredImages.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setMentionMenu(s => s ? { ...s, index: (s.index + 1) % filteredImages.length } : null);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setMentionMenu(s => s ? { ...s, index: (s.index - 1 + filteredImages.length) % filteredImages.length } : null);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        handleMentionSelect(filteredImages[mentionMenu.index].index);
                      } else if (e.key === 'Escape') {
                        setMentionMenu(null);
                      }
                    }
                  }}
                  onCompositionStart={() => {
                    promptComposingRef.current = true;
                  }}
                  onCompositionEnd={(e) => {
                    promptComposingRef.current = false;
                    const v = (e.target as HTMLTextAreaElement).value;
                    setPromptDraft(v);
                    updateNodeData({ prompt: v, promptRich: null });
                  }}
                  onBlur={() => {
                    if (!promptComposingRef.current) updateNodeData({ prompt: promptDraft, promptRich: null });
                    setTimeout(() => setMentionMenu(null), 200);
                  }}
                />

                {mentionMenu && filteredImages.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-[60] max-h-40 overflow-y-auto">
                    {filteredImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleMentionSelect(img.index)}
                        onMouseEnter={() => setMentionMenu(s => s ? { ...s, index: idx } : null)}
                        className={`w-full text-left px-2 py-1.5 text-[10px] flex items-center gap-2 hover:bg-gray-800 transition-colors ${mentionMenu.index === idx ? 'bg-gray-800 text-blue-300' : 'text-gray-300'}`}
                      >
                        <div className="w-8 h-8 rounded bg-gray-800 border border-gray-700 overflow-hidden flex-shrink-0">
                          <img src={img.url} alt={img.label} className="w-full h-full object-contain" />
                        </div>
                        <span className="font-medium">{img.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-500 w-10">清晰度</div>
                <select
                  className="nodrag flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                  value={data.resolution || '720p'}
                  onChange={(e) => updateNodeData({ resolution: e.target.value })}
                >
                  {currentVideoConfig.resolutions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-500 w-10">比例</div>
                <select
                  className="nodrag flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                  value={data.ratio || '16:9'}
                  onChange={(e) => updateNodeData({ ratio: e.target.value })}
                >
                  {currentVideoConfig.ratios.map(r => (
                    <option key={r} value={r}>{r === 'adaptive' ? '自适应' : r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 w-14">时长</div>
              <select
                className="nodrag flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                value={typeof data.duration === 'number' ? data.duration : 5}
                onChange={(e) => updateNodeData({ duration: Number(e.target.value) })}
              >
                {Array.from({ length: currentVideoConfig.durationRange[1] - currentVideoConfig.durationRange[0] + 1 }).map((_, idx) => {
                  const d = idx + currentVideoConfig.durationRange[0];
                  return (
                    <option key={d} value={d}>{d}s</option>
                  );
                })}
              </select>
              {currentVideoConfig.supportAudio && (
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    className="nodrag"
                    checked={!!data.generateAudio}
                    onChange={(e) => updateNodeData({ generateAudio: e.target.checked })}
                  />
                  音频
                </label>
              )}
            </div>

            {taskStatus && <div className="text-xs text-gray-400">任务状态：{taskStatus}</div>}

            <button
              type="button"
              className="nodrag w-full bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-60"
              disabled={isGenerating || !String(data.modelId || '').trim() || !String(incoming.upstreamTextNode ? incoming.upstreamTextNode.data.content : data.prompt || '').trim()}
              onClick={generateVideo}
            >
              {isGenerating ? '生成中…' : `生成视频 (${videoModeLabels[data.videoMode === 'auto' || !data.videoMode ? getAutoVideoMode() : data.videoMode]})`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
