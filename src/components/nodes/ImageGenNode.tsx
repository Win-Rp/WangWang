import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, NodeProps, Position, useEdges, useNodes, useReactFlow, NodeResizer } from '@xyflow/react';
import { Check, Image as ImageIcon, Monitor, Smartphone, SlidersHorizontal, Sparkles, Square, LayoutTemplate, X, Trash2 } from 'lucide-react';

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

    return {
      upstreamTextNode: textNodes[0] || null,
      upstreamImageNodes: imageNodes,
      hasOutputConnection: edges.some(e => e.source === id && e.sourceHandle === 'output')
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
  }, [nodeData.prompt, nodeData.modelId, nodeData.quality, nodeData.aspectRatio, nodeData.generatedImage, upstreamTextNode, prompt, selectedModel, quality, aspectRatio, generatedImage]);

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
        const res = await fetch('/api/settings/apis');
        const json = await res.json();
        const configs = Array.isArray(json.data) ? json.data : [];
        const imageConfigs = configs.filter((c: any) => c.category === 'image');
        const configsToUse = imageConfigs.length > 0 ? imageConfigs : configs.filter((c: any) => c.category !== 'text');

        const availableModels: { id: string; name: string; isDefault?: boolean }[] = [];
        configsToUse.forEach((config: any) => {
          (config.models || []).forEach((m: any) => {
            availableModels.push({
              id: m.model_id,
              name: m.name || m.model_id,
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

  const handleGenerate = async () => {
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

      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: upstreamTextNode ? (upstreamTextNode.data.content as string) : processedPrompt,
          inputImages: upstreamImageNodes.map(n => n?.data.imageUrl).filter(Boolean),
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
      if (result.success && result.imageUrl) {
        setGeneratedImage(result.imageUrl);
        updateNodeData({ generatedImage: result.imageUrl });
        
        // Propagate to connected image nodes
        const outputEdges = edges.filter(e => e.source === id);
        const byId = new Map(nodes.map(n => [n.id, n]));
        
        outputEdges.forEach(edge => {
            const targetNode = byId.get(edge.target);
            if (targetNode && targetNode.type === 'image') {
                setNodes(nds => nds.map(n => {
                    if (n.id === targetNode.id) {
                        return { ...n, data: { ...n.data, imageUrl: result.imageUrl } };
                    }
                    return n;
                }));
            }
        });

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
        url: (node?.data?.imageUrl as string | undefined) || null
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
    <div className={`relative bg-gray-900 border-2 rounded-lg shadow-xl w-full h-full min-w-[320px] min-h-[200px] transition-all flex flex-col ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'} ${isGenerating ? 'animate-flowline' : ''}`}>
      
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

      <NodeResizer minWidth={300} minHeight={200} isVisible={selected} lineClassName="border-blue-500" handleClassName="h-3 w-3 bg-white border-2 border-blue-500 rounded" />

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
                  className="w-12 h-12 flex-shrink-0 rounded overflow-hidden border border-gray-800 bg-gray-900 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                  onClick={() => {
                    // Insert reference to prompt editor
                    const token = {
                      id: node.id,
                      label: `图片${referenceImages.findIndex(n => n.id === node.id) + 1}`,
                      url: node.url
                    };
                    
                    // Append to end if no selection
                    const editor = promptEditorRef.current;
                    if (editor) {
                       const segments = readSegmentsFromEditor();
                       const newSegments = [...segments, { t: 'text' as const, v: ' ' }, { t: 'img' as const, id: token.id, label: token.label, url: token.url }];
                       const plain = segmentsToPlainText(newSegments);
                       setPromptRich(newSegments);
                       setPrompt(plain);
                       updateNodeData({ prompt: plain, promptRich: newSegments });
                       
                       // Focus editor
                       setTimeout(() => {
                           editor.focus();
                           // Move caret to end
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

          <Handle type="target" position={Position.Left} id="images" className="w-4 h-4 bg-purple-500 z-50" style={{ top: 44, left: -6 }} />
          <Handle type="target" position={Position.Left} id="image-input" className="w-4 h-4 bg-purple-500 opacity-0 pointer-events-none" style={{ top: 44, left: -6 }} />
        </div>
      </div>

      {/* Generated Preview (Middle) */}
      {!hasOutputConnection && (
      <div
        className="relative bg-black flex items-center justify-center overflow-hidden border-b border-gray-800 group/preview flex-1 min-h-0"
      >
        {generatedImage ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <img src={generatedImage} alt="Generated" className="w-full h-full object-contain" />
            </div>
        ) : (
            <div className="text-gray-600 flex flex-col items-center">
                <Sparkles size={24} className="mb-2 opacity-20" />
                <span className="text-xs">等待生成</span>
            </div>
        )}
        
        {/* Loading Overlay */}
        {isGenerating && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 backdrop-blur-sm">
                <div className="flex flex-col items-center">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <span className="text-xs text-blue-400 font-medium">生成中...</span>
                </div>
            </div>
        )}
      </div>
      )}
      
      {/* Loading Overlay (When preview is hidden) */}
      {hasOutputConnection && isGenerating && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm rounded-lg">
              <div className="flex flex-col items-center">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                  <span className="text-xs text-blue-400 font-medium">生成中...</span>
              </div>
          </div>
      )}

      {/* Prompt + Toolbar (Bottom) */}
      <div className="p-3 bg-gray-900 rounded-b-lg">
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
              data-placeholder="输入生成提示词，使用 @ 引用参考图…"
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

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative" ref={modelMenuRef}>
                <button
                  onClick={() => setIsModelMenuOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors group"
                  title="选择模型"
                >
                  <Sparkles size={12} className="text-gray-500 group-hover:text-gray-300" />
                  <span className="max-w-28 truncate">{currentModelName}</span>
                </button>

                {isModelMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedModel(m.id);
                          setIsModelMenuOpen(false);
                          updateNodeData({ modelId: m.id });
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-800 transition-colors ${selectedModel === m.id ? 'bg-gray-800/50 text-blue-400' : 'text-gray-200'}`}
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

              <div className="relative" ref={settingsRef}>
                <button
                  onClick={() => setIsSettingsOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors group"
                  title="画质与比例"
                >
                  <SlidersHorizontal size={12} className="text-gray-500 group-hover:text-gray-300" />
                  <span>{quality} · {aspectRatio}</span>
                </button>

                {isSettingsOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 p-4 text-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-medium text-sm">画质与比例</span>
                      <button onClick={() => setIsSettingsOpen(false)} className="text-gray-500 hover:text-white">
                        <X size={14} />
                      </button>
                    </div>

                    <div className="mb-4">
                      <label className="text-xs text-gray-400 mb-2 block">画质</label>
                      <div className="flex bg-gray-800 p-1 rounded-lg">
                        {(['1K', '2K', '3K'] as ImageQuality[]).map((q) => (
                          <button
                            key={q}
                            onClick={() => {
                              setQuality(q);
                              updateNodeData({ quality: q });
                            }}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${quality === q ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'}`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-gray-400 mb-2 block">比例</label>
                      <div className="grid grid-cols-4 gap-2">
                        {ASPECT_RATIOS.map((ratio) => (
                          <button
                            key={ratio.value}
                            onClick={() => {
                              setAspectRatio(ratio.value);
                              updateNodeData({ aspectRatio: ratio.value });
                            }}
                            className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${aspectRatio === ratio.value ? 'bg-gray-700 border-blue-500 text-white' : 'border-gray-800 bg-gray-800/50 text-gray-400 hover:bg-gray-700'}`}
                          >
                            <ratio.icon size={14} className="mb-1" />
                            <span className="text-[10px]">{ratio.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || (!prompt && !upstreamTextNode)}
              className={`p-1.5 rounded hover:bg-gray-700 text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isGenerating ? 'animate-pulse' : ''}`}
              title="生成图片"
            >
              <Sparkles size={16} />
            </button>
          </div>
        </div>

        <Handle type="target" position={Position.Left} className="w-4 h-4 bg-blue-500 opacity-0 pointer-events-none" style={{ top: '50%', left: -6 }} />
        <Handle type="target" position={Position.Left} id="prompt-area" className="bg-blue-500 opacity-0 z-40" style={{ width: 44, height: 44, borderRadius: 9999, top: '84%', left: -22 }} />
        <Handle type="target" position={Position.Left} id="prompt" className="w-4 h-4 bg-blue-500 z-50" style={{ top: '86%', left: -6 }} />
        <Handle type="target" position={Position.Left} id="text-input" className="w-4 h-4 bg-blue-500 opacity-0 pointer-events-none" style={{ top: '86%', left: -6 }} />
      </div>
    </div>
  );
}
