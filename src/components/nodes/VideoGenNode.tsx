import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, NodeProps, Position, useEdges, useNodes, useReactFlow, NodeResizer } from '@xyflow/react';
import { Check, Film, Sparkles, Trash2, Volume2, VolumeX, Image as ImageIcon, X } from 'lucide-react';

type Resolution = '480p' | '720p' | '1080p';
type Ratio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
type VideoMode = '文生视频' | '图生视频-基于首帧' | '图生视频-基于首尾帧' | '图生视频-基于参考图';

const MODEL_CONFIGS: Record<string, {
  supportAudio: boolean;
  supportI2VFirst: boolean;
  supportI2VFirstLast: boolean;
  durationRange: [number, number];
}> = {
  'doubao-seedance-1-5-pro-251215': {
    supportAudio: true,
    supportI2VFirst: true,
    supportI2VFirstLast: true,
    durationRange: [4, 12],
  },
  'doubao-seedance-1-0-pro-250528': {
    supportAudio: false,
    supportI2VFirst: true,
    supportI2VFirstLast: true,
    durationRange: [2, 12],
  },
  'doubao-seedance-1-0-pro-fast-251015': {
    supportAudio: false,
    supportI2VFirst: true,
    supportI2VFirstLast: false,
    durationRange: [2, 12],
  },
  'doubao-seedance-1-0-lite-t2v-250428': {
    supportAudio: false,
    supportI2VFirst: true,
    supportI2VFirstLast: true,
    durationRange: [2, 12],
  },
  'doubao-seedance-1-0-lite-i2v-250428': {
    supportAudio: false,
    supportI2VFirst: false,
    supportI2VFirstLast: false,
    durationRange: [2, 12],
  },
};

const DEFAULT_CONFIG = {
  supportAudio: false,
  supportI2VFirst: true,
  supportI2VFirstLast: true,
  durationRange: [2, 12] as [number, number],
};

interface VideoGenNodeData {
  label?: string;
  prompt?: string;
  promptRich?: Array<
    | { t: 'text'; v: string }
    | { t: 'img'; id: string; label: string; url?: string | null }
  >;
  modelId?: string;
  resolution?: Resolution;
  ratio?: Ratio;
  duration?: number;
  generateAudio?: boolean;
  generatedVideo?: string | null;
}

type PromptSegment =
  | { t: 'text'; v: string }
  | { t: 'img'; id: string; label: string; url?: string | null };

export default function VideoGenNode({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as VideoGenNodeData;
  const { setNodes } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes();

  const [prompt, setPrompt] = useState<string>(nodeData.prompt || '');
  const [promptRich, setPromptRich] = useState<PromptSegment[] | null>(nodeData.promptRich || null);
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
  const promptEditorRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<number | null>(null);

  const [mentionState, setMentionState] = useState<null | {
    startOffset: number;
    endOffset: number;
    query: string;
    activeIndex: number;
  }>(null);
  const isComposing = useRef(false);

  const updateNodeData = (updates: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        return { ...node, data: { ...node.data, ...updates } };
      })
    );
  };

  const incoming = useMemo(() => {
    const incomingEdges = edges.filter((e) => e.target === id);
    const bySourceId = new Map(nodes.map((n) => [n.id, n] as const));
    const textNodes: any[] = [];
    const imageNodes: any[] = [];
    const storyboardNodes: any[] = [];

    for (const e of incomingEdges) {
      const sourceNode = bySourceId.get(e.source);
      if (!sourceNode) continue;
      const handle = e.targetHandle ?? null;
      const isPromptHandle = handle === 'prompt' || handle === 'text-input' || handle === null;
      const isImagesHandle = handle === 'images' || handle === 'image-input' || handle === null;
      if (isPromptHandle && sourceNode.type === 'text') textNodes.push(sourceNode);
      if (isImagesHandle && sourceNode.type === 'image') imageNodes.push(sourceNode);
      if (sourceNode.type === 'storyboard') storyboardNodes.push(sourceNode);
    }

    imageNodes.sort((a, b) => a.position.y - b.position.y);
    return {
      upstreamTextNode: textNodes[0] || null,
      upstreamImageNodes: imageNodes,
      upstreamStoryboardNode: storyboardNodes[0] || null,
      hasOutputConnection: edges.some(e => e.source === id && e.sourceHandle === 'output')
    };
  }, [edges, id, nodes]);

  const upstreamTextNode = incoming.upstreamTextNode;
  const upstreamImageNodes = incoming.upstreamImageNodes;
  const upstreamStoryboardNode = incoming.upstreamStoryboardNode;
  const hasOutputConnection = incoming.hasOutputConnection;

  const referenceImages = useMemo(() => {
    const images = upstreamImageNodes.map((node: any) => ({
      id: node?.id as string,
      url: (node?.data?.imageUrl as string | undefined) || null
    }));

    if (upstreamStoryboardNode) {
      const storyboardShots = (upstreamStoryboardNode.data.shots || []) as any[];
      storyboardShots.forEach((shot, idx) => {
        if (shot.imageUrl) {
          images.push({
            id: `${upstreamStoryboardNode.id}-${shot.id}`,
            url: shot.imageUrl
          });
        }
      });
    }

    return images.filter((n: any) => !!n.id);
  }, [upstreamImageNodes, upstreamStoryboardNode]);

  const mentionCandidates = useMemo(() => {
    return referenceImages.map((img, idx) => ({
      id: img.id,
      label: `图片${idx + 1}`,
      url: img.url
    }));
  }, [referenceImages]);

  const imageUrls = useMemo(
    () => referenceImages.map(img => img.url).filter(Boolean) as string[],
    [referenceImages]
  );

  const modelConfig = useMemo(() => MODEL_CONFIGS[selectedModel] || DEFAULT_CONFIG, [selectedModel]);

  const mode: VideoMode = useMemo(() => {
    if (imageUrls.length === 0 || !modelConfig.supportI2VFirst) return '文生视频';
    if (imageUrls.length === 1) return '图生视频-基于首帧';
    if (imageUrls.length === 2 && modelConfig.supportI2VFirstLast) return '图生视频-基于首尾帧';
    return '图生视频-基于参考图';
  }, [imageUrls.length, modelConfig]);

  useEffect(() => {
    const nextPrompt = nodeData.prompt || '';
    if (!upstreamTextNode && !upstreamStoryboardNode && nextPrompt !== prompt) setPrompt(nextPrompt);
    
    const nextPromptRich = (nodeData.promptRich as PromptSegment[] | undefined) || null;
    if (!upstreamTextNode && !upstreamStoryboardNode) setPromptRich(nextPromptRich);

    // If storyboard is connected, prioritize its prompts if we want (or just use its first shot)
    if (upstreamStoryboardNode && !upstreamTextNode) {
        const shots = (upstreamStoryboardNode.data.shots || []) as any[];
        if (shots.length > 0) {
            const combinedPrompt = shots.map(s => s.prompt).join(', ');
            if (combinedPrompt !== prompt) {
                setPrompt(combinedPrompt);
                updateNodeData({ prompt: combinedPrompt });
            }
        }
    }

    const nextModel = nodeData.modelId || '';
    if (nextModel !== selectedModel) setSelectedModel(nextModel);
    const nextResolution = nodeData.resolution || '720p';
    if (nextResolution !== resolution) setResolution(nextResolution);
    const nextRatio = nodeData.ratio || '16:9';
    if (nextRatio !== ratio) setRatio(nextRatio);
    
    // Adjust duration if out of range
    const nextDuration = nodeData.duration || 5;
    const config = MODEL_CONFIGS[nextModel] || DEFAULT_CONFIG;
    const [min, max] = config.durationRange;
    const validDuration = Math.max(min, Math.min(nextDuration, max));
    if (validDuration !== duration) setDuration(validDuration);
    
    // Adjust audio if not supported
    const nextAudio = nodeData.generateAudio ?? true;
    const validAudio = config.supportAudio ? nextAudio : false;
    if (validAudio !== generateAudio) setGenerateAudio(validAudio);

    const nextVideo = nodeData.generatedVideo || null;
    if (nextVideo !== generatedVideo) setGeneratedVideo(nextVideo);
  }, [nodeData.prompt, nodeData.modelId, nodeData.resolution, nodeData.ratio, nodeData.duration, nodeData.generateAudio, nodeData.generatedVideo, upstreamTextNode, prompt, selectedModel, resolution, ratio, duration, generateAudio, generatedVideo]);

  useEffect(() => {
    if (upstreamTextNode) return;
    const editor = promptEditorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;

    if (promptRich) editor.innerHTML = segmentsToHtml(promptRich);
    else editor.innerHTML = segmentsToHtml([{ t: 'text', v: prompt }]);
  }, [prompt, promptRich, upstreamTextNode]);

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

  const escapeHtml = (s: string) => {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const segmentsToPlainText = (segments: PromptSegment[]) => {
    return segments.map((seg) => (seg.t === 'text' ? seg.v : seg.label)).join('');
  };

  const segmentsToHtml = (segments: PromptSegment[]) => {
    return segments
      .map((seg) => {
        if (seg.t === 'text') return escapeHtml(seg.v).replace(/\n/g, '<br />');
        const url = seg.url || '';
        const img = url
          ? `<img src="${escapeHtml(url)}" class="w-5 h-5 object-contain" />`
          : `<div class="w-5 h-5 bg-gray-700 border border-gray-600" />`;
        return `<span contenteditable="false" data-token="imageRef" data-id="${escapeHtml(seg.id)}" data-label="${escapeHtml(seg.label)}" data-url="${escapeHtml(url)}" class="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 align-middle">${img}<span class="text-xs text-gray-200">${escapeHtml(seg.label)}</span></span>`;
      })
      .join('');
  };

  const readSegmentsFromEditor = () => {
    const el = promptEditorRef.current;
    if (!el) return [] as PromptSegment[];

    const segments: PromptSegment[] = [];

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) segments.push({ t: 'text', v: text });
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as HTMLElement;

      if (element.tagName === 'BR') {
        segments.push({ t: 'text', v: '\n' });
        return;
      }

      if (element.dataset?.token === 'imageRef') {
        segments.push({
          t: 'img',
          id: element.dataset.id || '',
          label: element.dataset.label || '',
          url: element.dataset.url || null,
        });
        return;
      }

      Array.from(element.childNodes).forEach(walk);
    };

    Array.from(el.childNodes).forEach(walk);
    return segments;
  };

  const getCaretOffset = () => {
    const el = promptEditorRef.current;
    if (!el) return 0;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return segmentsToPlainText(readSegmentsFromEditor()).length;

    const range = selection.getRangeAt(0);
    const anchorNode = range.startContainer;
    const anchorOffset = range.startOffset;

    let offset = 0;
    let found = false;

    const visit = (node: Node) => {
      if (found) return;

      if (node === anchorNode) {
        if (node.nodeType === Node.TEXT_NODE) {
          offset += anchorOffset;
          found = true;
          return;
        }
        found = true;
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        offset += (node.textContent || '').length;
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as HTMLElement;

      if (element.tagName === 'BR') {
        offset += 1;
        return;
      }

      if (element.dataset?.token === 'imageRef') {
        offset += (element.dataset.label || '').length;
        return;
      }

      Array.from(element.childNodes).forEach(visit);
    };

    Array.from(el.childNodes).forEach(visit);
    return offset;
  };

  const offsetsToDomPosition = (targetOffset: number) => {
    const el = promptEditorRef.current;
    if (!el) return { node: null as Node | null, offset: 0 };

    let remaining = targetOffset;
    let resultNode: Node | null = null;
    let resultOffset = 0;

    const visit = (node: Node) => {
      if (resultNode) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const len = (node.textContent || '').length;
        if (remaining <= len) {
          resultNode = node;
          resultOffset = remaining;
          return;
        }
        remaining -= len;
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as HTMLElement;

      if (element.tagName === 'BR') {
        if (remaining <= 1) {
          resultNode = element.parentNode;
          resultOffset = Array.from(element.parentNode?.childNodes || []).indexOf(element) + 1;
          return;
        }
        remaining -= 1;
        return;
      }

      if (element.dataset?.token === 'imageRef') {
        const len = (element.dataset.label || '').length;
        if (remaining <= len) {
          resultNode = element.parentNode;
          resultOffset = Array.from(element.parentNode?.childNodes || []).indexOf(element);
          return;
        }
        remaining -= len;
        return;
      }

      Array.from(element.childNodes).forEach(visit);
    };

    Array.from(el.childNodes).forEach(visit);
    if (!resultNode) {
      resultNode = el;
      resultOffset = el.childNodes.length;
    }
    return { node: resultNode, offset: resultOffset };
  };

  const updateMentionStateFromEditor = (segments: PromptSegment[]) => {
    const text = segmentsToPlainText(segments);
    const caret = getCaretOffset();
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) {
      setMentionState(null);
      return;
    }

    const prev = before[at - 1];
    if (at > 0 && prev && !/\s/.test(prev)) {
      setMentionState(null);
      return;
    }

    const query = before.slice(at + 1);
    if (/\s/.test(query)) {
      setMentionState(null);
      return;
    }

    if (mentionCandidates.length === 0) {
      setMentionState(null);
      return;
    }

    setMentionState((prevState) => {
      const nextActive = prevState ? Math.min(prevState.activeIndex, mentionCandidates.length - 1) : 0;
      return {
        startOffset: at,
        endOffset: caret,
        query,
        activeIndex: nextActive,
      };
    });
  };

  const filteredMentionCandidates = useMemo(() => {
    if (!mentionState) return [];
    const q = mentionState.query.trim();
    if (!q) return mentionCandidates;
    return mentionCandidates.filter((c) => c.label.includes(q));
  }, [mentionCandidates, mentionState]);

  const replaceOffsetsWithToken = (startOffset: number, endOffset: number, token: { id: string; label: string; url: string | null }) => {
    const editor = promptEditorRef.current;
    if (!editor) return;

    const start = offsetsToDomPosition(startOffset);
    const end = offsetsToDomPosition(endOffset);

    if (!start.node || !end.node) return;

    const range = document.createRange();
    try {
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
    } catch {
      return;
    }

    range.deleteContents();

    const span = document.createElement('span');
    span.contentEditable = 'false';
    span.dataset.token = 'imageRef';
    span.dataset.id = token.id;
    span.dataset.label = token.label;
    span.dataset.url = token.url || '';
    span.className = 'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 align-middle';

    if (token.url) {
      const img = document.createElement('img');
      img.src = token.url;
      img.className = 'w-5 h-5 object-contain';
      span.appendChild(img);
    } else {
      const box = document.createElement('div');
      box.className = 'w-5 h-5 bg-gray-700 border border-gray-600';
      span.appendChild(box);
    }

    const label = document.createElement('span');
    label.className = 'text-xs text-gray-200';
    label.textContent = token.label;
    span.appendChild(label);

    range.insertNode(span);
    const space = document.createTextNode(' ');
    span.after(space);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const nextRange = document.createRange();
      nextRange.setStart(space, 1);
      nextRange.collapse(true);
      selection.addRange(nextRange);
    }

    const segments = readSegmentsFromEditor();
    const plain = segmentsToPlainText(segments);
    setPromptRich(segments);
    setPrompt(plain);
    updateNodeData({ prompt: plain, promptRich: segments });
  };

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

            // Propagate to connected video preview nodes
            const outputEdges = edges.filter(e => e.source === id && e.sourceHandle === 'output');
            outputEdges.forEach(edge => {
                setNodes(nds => nds.map(n => {
                    if (n.id === edge.target && n.type === 'video-preview') {
                        return { ...n, data: { ...n.data, videoUrl: json.videoUrl } };
                    }
                    return n;
                }));
            });

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
    let finalPrompt = prompt;
    if (promptRich) {
        finalPrompt = promptRich.map(seg => seg.t === 'img' ? seg.label : seg.v).join('');
    }
    if (upstreamTextNode) finalPrompt = upstreamTextNode.data.content as string;

    if (!finalPrompt || !String(finalPrompt).trim()) return;
    setIsGenerating(true);
    setTaskStatus('queued');
    try {
      const response = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          inputImages: modelConfig.supportI2VFirst ? imageUrls : [], // Filter out images if model doesn't support I2V
          modelId: selectedModel,
          generateAudio: modelConfig.supportAudio ? generateAudio : false, // Force false if not supported
          resolution,
          ratio,
          duration: Math.max(modelConfig.durationRange[0], Math.min(duration, modelConfig.durationRange[1])), // Clamp duration
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
    <div className={`relative bg-gray-900 border-2 rounded-lg shadow-xl w-full h-full min-w-[360px] min-h-[240px] transition-all flex flex-col ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'} ${isGenerating ? 'animate-flowline' : ''}`}>
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

      {/* Reference Images Section */}
      <div className="p-3 border-b border-gray-800">
        <div className="relative">
          <div className="text-xs text-gray-500 mb-1 flex justify-between">
            <span>参考图</span>
            <span className="text-[10px]">{referenceImages.length} 张</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 min-h-[44px] bg-gray-950/50 rounded p-1 border border-dashed border-gray-800">
            {referenceImages.length > 0 ? (
              referenceImages.map((node, idx) => (
                <div 
                  key={node.id} 
                  className="w-12 h-12 flex-shrink-0 rounded overflow-hidden border border-gray-800 bg-gray-900 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                  onClick={() => {
                    // Insert reference to prompt editor
                    const token = {
                      id: node.id,
                      label: `图片${idx + 1}`,
                      url: node.url
                    };
                    
                    const editor = promptEditorRef.current;
                    if (editor) {
                       const segments = readSegmentsFromEditor();
                       const newSegments = [...segments, { t: 'text' as const, v: ' ' }, { t: 'img' as const, id: token.id, label: token.label, url: token.url }];
                       const plain = segmentsToPlainText(newSegments);
                       setPromptRich(newSegments);
                       setPrompt(plain);
                       updateNodeData({ prompt: plain, promptRich: newSegments });
                       
                       setTimeout(() => {
                           editor.focus();
                           const range = document.createRange();
                           range.selectNodeContents(editor);
                           range.collapse(false);
                           const sel = window.getSelection();
                           sel?.removeAllRanges();
                           sel?.addRange(range);
                       }, 0);
                    }
                  }}
                  title="点击插入到提示词"
                >
                  {node.url ? (
                    <img src={node.url} alt="Input" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                      <ImageIcon size={12} className="text-gray-600" />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="w-full flex items-center justify-center text-xs text-gray-600 h-9">无输入图片</div>
            )}
          </div>

          <Handle type="target" position={Position.Left} id="images" className="w-4 h-4 bg-cyan-500 z-50" style={{ top: 44, left: -6 }} />
          <Handle type="target" position={Position.Left} id="image-input" className="w-4 h-4 bg-cyan-500 opacity-0 pointer-events-none" style={{ top: 44, left: -6 }} />
        </div>
      </div>

      {/* Video Preview / Generation Status Section */}
      {!hasOutputConnection && (
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
      )}

      {/* Loading Overlay (When preview is hidden) */}
      {hasOutputConnection && isGenerating && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm rounded-lg">
              <div className="flex flex-col items-center">
                  <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                  <span className="text-xs text-cyan-300 font-medium">{taskStatus || '生成中...'}</span>
              </div>
          </div>
      )}

      {/* Prompt Editor & Controls Section */}
      <div className="p-3 bg-gray-900 rounded-b-lg flex flex-col gap-3">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex flex-col gap-2 shadow-sm relative">
          {upstreamTextNode ? (
            <div className="text-gray-400 text-sm">
              <div className="text-xs italic">提示词由上游节点提供</div>
              <div className="mt-1 text-gray-500 text-xs truncate">{(upstreamTextNode.data.content as string) || '...'}</div>
            </div>
          ) : (
            <div
              ref={promptEditorRef}
              className="nodrag w-full min-w-0 bg-transparent text-gray-200 text-sm placeholder-gray-500 outline-none min-h-16 leading-relaxed whitespace-pre-wrap break-words"
              style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
              contentEditable
              suppressContentEditableWarning
              onFocus={() => {
                const editor = promptEditorRef.current;
                if (!editor) return;
                if (!promptRich) {
                  editor.innerHTML = segmentsToHtml([{ t: 'text', v: prompt }]);
                } else {
                  editor.innerHTML = segmentsToHtml(promptRich);
                }
              }}
              onInput={() => {
                const segments = readSegmentsFromEditor();
                const plain = segmentsToPlainText(segments);
                setPromptRich(segments);
                setPrompt(plain);
                if (!isComposing.current) {
                  updateNodeData({ prompt: plain, promptRich: segments });
                }
                updateMentionStateFromEditor(segments);
              }}
              onCompositionStart={() => {
                isComposing.current = true;
              }}
              onCompositionEnd={() => {
                isComposing.current = false;
                const segments = readSegmentsFromEditor();
                const plain = segmentsToPlainText(segments);
                updateNodeData({ prompt: plain, promptRich: segments });
              }}
              onKeyDown={(e) => {
                if (!mentionState) {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                  return;
                }

                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionState((s) => (s ? { ...s, activeIndex: Math.min(s.activeIndex + 1, Math.max(filteredMentionCandidates.length - 1, 0)) } : s));
                  return;
                }

                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionState((s) => (s ? { ...s, activeIndex: Math.max(s.activeIndex - 1, 0) } : s));
                  return;
                }

                if (e.key === 'Escape') {
                  e.preventDefault();
                  setMentionState(null);
                  return;
                }

                if (e.key === 'Enter') {
                  e.preventDefault();
                  const active = filteredMentionCandidates[Math.min(mentionState.activeIndex, filteredMentionCandidates.length - 1)];
                  if (active) {
                    replaceOffsetsWithToken(mentionState.startOffset, mentionState.endOffset, {
                      id: active.id,
                      label: active.label,
                      url: active.url,
                    });
                    setMentionState(null);
                  }
                  return;
                }
              }}
              data-placeholder="输入视频提示词，使用 @ 引用参考图…"
            />
          )}

          {mentionState && !upstreamTextNode && filteredMentionCandidates.length > 0 && (
            <div className="absolute left-3 right-3 bottom-[44px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-40 overflow-y-auto z-50">
              {filteredMentionCandidates.map((c, idx) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setMentionState((s) => (s ? { ...s, activeIndex: idx } : s))}
                  onClick={() => {
                    const s = mentionState;
                    if (!s) return;
                    replaceOffsetsWithToken(s.startOffset, s.endOffset, { id: c.id, label: c.label, url: c.url });
                    setMentionState(null);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${mentionState.activeIndex === idx ? 'bg-gray-800' : 'hover:bg-gray-800'} text-gray-200`}
                >
                  <div className="w-8 h-8 rounded bg-gray-800 border border-gray-700 overflow-hidden flex-shrink-0">
                    {c.url ? <img src={c.url} alt={c.label} className="w-full h-full object-contain" /> : null}
                  </div>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-1 pt-2 border-t border-gray-700/50">
            <div className="flex items-center gap-3 flex-wrap">
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
                className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none"
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
                className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none"
              >
                {Array.from({ length: modelConfig.durationRange[1] - modelConfig.durationRange[0] + 1 }).map((_, idx) => {
                  const sec = idx + modelConfig.durationRange[0];
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
                className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none"
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
                  if (!modelConfig.supportAudio) return;
                  const next = !generateAudio;
                  setGenerateAudio(next);
                  updateNodeData({ generateAudio: next });
                }}
                disabled={!modelConfig.supportAudio}
                className={`p-1 rounded transition-colors ${generateAudio ? 'text-cyan-300 bg-cyan-900/20' : 'text-gray-500 hover:text-gray-300'} ${!modelConfig.supportAudio ? 'opacity-30 cursor-not-allowed' : ''}`}
                title={!modelConfig.supportAudio ? '当前模型不支持音频' : (generateAudio ? '已开启音频' : '已关闭音频')}
              >
                {generateAudio ? <Volume2 size={12} /> : <VolumeX size={12} />}
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
          </div>
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="prompt-area" className="bg-blue-500 opacity-0 z-40" style={{ width: 44, height: 44, borderRadius: 9999, top: '86%', left: -22 }} />
      <Handle type="target" position={Position.Left} id="prompt" className="w-4 h-4 bg-blue-500 z-50" style={{ top: '88%', left: -6 }} />
      <Handle type="target" position={Position.Left} id="text-input" className="w-4 h-4 bg-blue-500 opacity-0 pointer-events-none" style={{ top: '88%', left: -6 }} />
    </div>
  );
}
