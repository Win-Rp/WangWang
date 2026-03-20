import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, NodeProps, Position, useEdges, useNodes, useReactFlow, NodeResizer } from '@xyflow/react';
import { Check, Image as ImageIcon, Monitor, Smartphone, SlidersHorizontal, Sparkles, Square, LayoutTemplate, X, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1', icon: Square },
  { label: '4:3', value: '4:3', icon: LayoutTemplate },
  { label: '3:4', value: '3:4', icon: Smartphone },
  { label: '16:9', value: '16:9', icon: Monitor },
  { label: '9:16', value: '9:16', icon: Smartphone },
  { label: '3:2', value: '3:2', icon: LayoutTemplate },
  { label: '2:3', value: '2:3', icon: Smartphone },
  { label: '21:9', value: '21:9', icon: Monitor },
];

type ImageQuality = '1K' | '2K' | '3K';

interface ImageGenNodeData {
  label?: string;
  prompt?: string;
  promptRich?: Array<
    | { t: 'text'; v: string }
    | { t: 'img'; id: string; label: string; url?: string | null }
  >;
  modelId?: string;
  quality?: ImageQuality;
  aspectRatio?: string;
  generatedImage?: string | null;
  generatedImages?: string[];
}

type PromptSegment =
  | { t: 'text'; v: string }
  | { t: 'img'; id: string; label: string; url?: string | null };

export default function ImageGenNode({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as ImageGenNodeData;
  const { setNodes } = useReactFlow();
  const [prompt, setPrompt] = useState<string>(nodeData.prompt || '');
  const [promptRich, setPromptRich] = useState<PromptSegment[] | null>(nodeData.promptRich || null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(nodeData.modelId || '');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [quality, setQuality] = useState<ImageQuality>(nodeData.quality || '1K');
  const [aspectRatio, setAspectRatio] = useState<string>(nodeData.aspectRatio || '16:9');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(nodeData.generatedImage || null);
  const [generatedImages, setGeneratedImages] = useState<string[]>(
    Array.isArray(nodeData.generatedImages)
      ? nodeData.generatedImages
      : nodeData.generatedImage
        ? [nodeData.generatedImage]
        : [],
  );
  const [activeGeneratedIndex, setActiveGeneratedIndex] = useState(0);
  const settingsRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const promptEditorRef = useRef<HTMLDivElement>(null);
  const [mentionState, setMentionState] = useState<null | {
    startOffset: number;
    endOffset: number;
    query: string;
    activeIndex: number;
  }>(null);
  const isComposing = useRef(false);
  
  const edges = useEdges();
  const nodes = useNodes();

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

    for (const e of incomingEdges) {
      const sourceNode = bySourceId.get(e.source);
      if (!sourceNode) continue;

      const handle = e.targetHandle ?? null;
      const isPromptHandle = handle === 'prompt' || handle === 'text-input' || handle === 'prompt-area';
      const isImagesHandle = handle === 'images' || handle === 'image-input';

      if (isPromptHandle && sourceNode.type === 'text') {
        textNodes.push(sourceNode);
      } else if (isImagesHandle && sourceNode.type === 'image') {
        imageNodes.push(sourceNode);
      } else if (handle === null) {
        if (sourceNode.type === 'text') textNodes.push(sourceNode);
        if (sourceNode.type === 'image') imageNodes.push(sourceNode);
      }
    }

    // Sort image nodes by Y position to maintain consistent order
    imageNodes.sort((a, b) => a.position.y - b.position.y);
    const byId = new Map(nodes.map((n) => [n.id, n] as const));

    return {
      upstreamTextNode: textNodes[0] || null,
      upstreamImageNodes: imageNodes,
      hasOutputConnection: edges.some((e) => e.source === id && e.sourceHandle === 'output' && byId.get(e.target)?.type === 'image'),
    };
  }, [edges, id, nodes]);

  const upstreamTextNode = incoming.upstreamTextNode;
  const upstreamImageNodes = incoming.upstreamImageNodes;
  const hasOutputConnection = incoming.hasOutputConnection;

  // Update prompt from upstream text node if connected
  useEffect(() => {
    if (upstreamTextNode) {
        // Assume text node stores content in data.content
        const textContent = upstreamTextNode.data.content as string;
        if (textContent && textContent !== prompt) {
            setPrompt(textContent);
            updateNodeData({ prompt: textContent });
        }
    }
  }, [upstreamTextNode, prompt]); // Added prompt to dependency

  useEffect(() => {
    const nextPrompt = nodeData.prompt || '';
    if (!upstreamTextNode && nextPrompt !== prompt) setPrompt(nextPrompt);

    const nextPromptRich = (nodeData.promptRich as PromptSegment[] | undefined) || null;
    if (!upstreamTextNode) {
      setPromptRich(nextPromptRich);
    }

    const nextModelId = nodeData.modelId || '';
    if (nextModelId !== selectedModel) setSelectedModel(nextModelId);

    const nextQuality = nodeData.quality || '1K';
    if (nextQuality !== quality) setQuality(nextQuality);

    const nextAspect = nodeData.aspectRatio || '16:9';
    if (nextAspect !== aspectRatio) setAspectRatio(nextAspect);

    const nextGenerated = nodeData.generatedImage || null;
    if (nextGenerated !== generatedImage) setGeneratedImage(nextGenerated);

    const nextGeneratedImages = Array.isArray(nodeData.generatedImages)
      ? nodeData.generatedImages
      : nextGenerated
        ? [nextGenerated]
        : [];
    if (JSON.stringify(nextGeneratedImages) !== JSON.stringify(generatedImages)) {
      setGeneratedImages(nextGeneratedImages);
      setActiveGeneratedIndex(0);
    }
  }, [
    nodeData.prompt,
    nodeData.modelId,
    nodeData.quality,
    nodeData.aspectRatio,
    nodeData.generatedImage,
    nodeData.generatedImages,
    upstreamTextNode,
    prompt,
    selectedModel,
    quality,
    aspectRatio,
    generatedImage,
    generatedImages,
  ]);

  useEffect(() => {
    if (upstreamTextNode) return;
    const editor = promptEditorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;

    if (promptRich) editor.innerHTML = segmentsToHtml(promptRich);
    else editor.innerHTML = segmentsToHtml([{ t: 'text', v: prompt }]);
  }, [prompt, promptRich, upstreamTextNode]);

  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (settingsRef.current && !settingsRef.current.contains(target)) setIsSettingsOpen(false);
      if (modelMenuRef.current && !modelMenuRef.current.contains(target)) setIsModelMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await apiFetch('/api/settings/apis');
        const json = await res.json();
        const configs = Array.isArray(json.data) ? json.data : [];
        const imageConfigs = configs.filter((c: any) => c.category === 'image');
        const configsToUse = imageConfigs.length > 0 ? imageConfigs : configs.filter((c: any) => c.category !== 'text');

        const availableModels: { id: string; name: string; isDefault?: boolean }[] = [];
        configsToUse.forEach((config: any) => {
          (config.models || []).forEach((m: any) => {
            const modelId = typeof m.model_id === 'string' ? m.model_id.trim() : '';
            if (!modelId || /\s/.test(modelId)) return;
            availableModels.push({
              id: modelId,
              name: m.name || modelId,
              isDefault: !!m.is_default,
            });
          });
        });

        setModels(availableModels.map(({ id: modelId, name }) => ({ id: modelId, name })));

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

  const currentModelName = models.find((m) => m.id === selectedModel)?.name || '选择模型';
  const generating = isGenerating || !!(nodeData as any).isGenerating;

  const propagateToConnectedImageNodes = (urls: string[], primaryUrl: string) => {
    const outputEdges = edges.filter((e) => e.source === id);
    if (outputEdges.length === 0) return;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    outputEdges.forEach((edge) => {
      const targetNode = byId.get(edge.target);
      if (targetNode && targetNode.type === 'image') {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === targetNode.id) {
              return { ...n, data: { ...n.data, imageUrl: primaryUrl, imageUrls: urls } };
            }
            return n;
          }),
        );
      }
    });
  };

  const handleGenerate = async () => {
    if (!hasOutputConnection) {
      alert('请先将输出端口连接到图片节点后再生成。');
      return;
    }
    setIsGenerating(true);
    try {
      // Process prompt: Replace image tokens with their labels (e.g., 图片1)
      let processedPrompt = prompt;
      if (promptRich) {
         processedPrompt = promptRich.map(seg => {
             if (seg.t === 'img') return seg.label;
             return seg.v;
         }).join('');
      }

      const response = await apiFetch('/api/ai/generate-image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: upstreamTextNode ? (upstreamTextNode.data.content as string) : processedPrompt,
          inputImages: upstreamImageNodes
            .flatMap((n: any) => {
              const urls = Array.isArray(n?.data?.imageUrls) ? n.data.imageUrls : [];
              const single = typeof n?.data?.imageUrl === 'string' ? [n.data.imageUrl] : [];
              return urls.length > 0 ? urls : single;
            })
            .filter((u: any) => typeof u === 'string' && u.trim().length > 0),
          modelId: selectedModel,
          quality,
          aspectRatio
        })
      });
      console.log('[ImageGenNode] 请求参数:', {
        prompt: upstreamTextNode ? (upstreamTextNode.data.content as string) : processedPrompt,
        inputImages: upstreamImageNodes.map(n => n?.data.imageUrl).filter(Boolean),
        modelId: selectedModel,
        quality,
        aspectRatio
      });
      
      const result = await response.json();
      console.log('[ImageGenNode] 接口返回:', result);
      const urls = Array.isArray(result?.imageUrls)
        ? result.imageUrls
        : result?.imageUrl
          ? [result.imageUrl]
          : [];

      if (result.success && urls.length > 0) {
        setGeneratedImages(urls);
        setActiveGeneratedIndex(0);
        setGeneratedImage(urls[0]);
        updateNodeData({ generatedImage: urls[0], generatedImages: urls });
        
        propagateToConnectedImageNodes(urls, urls[0]);

      } else {
        alert('生成失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      console.error('Generation error:', error);
      alert('生成出错，请检查网络');
    } finally {
      setIsGenerating(false);
    }
  };

  const referenceImages = useMemo(() => {
    return upstreamImageNodes
      .map((node: any) => ({
        id: node?.id as string,
        url:
          (Array.isArray(node?.data?.imageUrls) && node.data.imageUrls.length > 0
            ? (node.data.imageUrls[0] as string)
            : (node?.data?.imageUrl as string | undefined)) || null
      }))
      .filter((n: any) => !!n.id);
  }, [upstreamImageNodes]);

  const mentionCandidates = useMemo(() => {
    return referenceImages.map((img, idx) => ({
      id: img.id,
      label: `图片${idx + 1}`,
      url: img.url
    }));
  }, [referenceImages]);

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

  return (
    <div className={`relative bg-gray-900 border-2 rounded-lg shadow-xl w-full h-full min-w-[320px] min-h-[140px] transition-all flex flex-col ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'} ${generating ? 'animate-flowline' : ''}`}>
      
      {/* Header */}
      <div className="bg-gray-800 px-3 py-2 rounded-t-lg flex items-center justify-between border-b border-gray-700 group/header">
        <div className="flex items-center space-x-2">
          <ImageIcon size={16} className="text-purple-400" />
          <span className="text-sm font-medium text-gray-200">{nodeData.label || '图片生成'}</span>
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

        {/* Output Handle */}
        <Handle type="source" position={Position.Right} id="output" className="w-3 h-3 bg-purple-500 z-50" />
      </div>

      <NodeResizer minWidth={300} minHeight={140} isVisible={selected} lineClassName="border-blue-500" handleClassName="h-3 w-3 bg-white border-2 border-blue-500 rounded" />

      {/* Input Images (Top) */}
      <div className="p-3 border-b border-gray-800">
        <div className="relative">
          <div className="text-xs text-gray-500 mb-1 flex justify-between">
            <span>参考图</span>
            <span className="text-[10px]">{referenceImages.length} 张</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 min-h-[44px] bg-gray-950/50 rounded p-1 border border-dashed border-gray-800">
            {referenceImages.length > 0 ? (
              referenceImages.map((node) => (
                <div 
                  key={node.id} 
                  className="w-12 h-12 flex-shrink-0 rounded overflow-hidden border border-gray-800 bg-gray-900 transition-all"
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

          <Handle type="target" position={Position.Left} id="images" className="w-4 h-4 bg-purple-500 z-50" style={{ top: 44, left: 0 }} />
          <Handle type="target" position={Position.Left} id="image-input" className="w-4 h-4 bg-purple-500 opacity-0 pointer-events-none" style={{ top: 44, left: -6 }} />
        </div>
      </div>

      <div className="px-3 py-2 border-b border-gray-800 bg-gray-950/40 text-[11px] text-gray-500">
        {hasOutputConnection ? '已连接输出：生成结果将推送到下游图片节点。' : '未连接输出：请先将输出端口连接到图片节点后再生成。'}
      </div>

        <Handle type="target" position={Position.Left} className="w-4 h-4 bg-blue-500 opacity-0 pointer-events-none" style={{ top: '50%', left: -6 }} />
        <Handle type="target" position={Position.Left} id="prompt-area" className="bg-blue-500 opacity-0 z-40" style={{ width: 44, height: 44, borderRadius: 9999, top: '84%', left: -22 }} />
        <Handle type="target" position={Position.Left} id="prompt" className="w-4 h-4 bg-blue-500 z-50" style={{ top: '86%', left: 0 }} />
        <Handle type="target" position={Position.Left} id="text-input" className="w-4 h-4 bg-blue-500 opacity-0 pointer-events-none" style={{ top: '86%', left: -6 }} />
      </div>
  );
}
