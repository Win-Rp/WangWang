import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Handle, Position, NodeProps, useNodes, useReactFlow, NodeResizer } from '@xyflow/react';
import { Upload, RotateCw, RotateCcw, ZoomIn, ZoomOut, Image as ImageIcon, RefreshCw, Trash2, LayoutGrid, X, Check } from 'lucide-react';

interface ImageNodeData {
  label?: string;
  imageUrl?: string;
  imageUrls?: string[];
  rotation?: number;
  scale?: number;
}

export default function ImageNode({ data, id, selected }: NodeProps<any>) {
  const { setNodes } = useReactFlow();
  const nodes = useNodes();
  const [imageUrls, setImageUrls] = useState<string[]>(
    Array.isArray(data.imageUrls) ? data.imageUrls : data.imageUrl ? [data.imageUrl] : []
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [rotation, setRotation] = useState(data.rotation || 0);
  const [scale, setScale] = useState(data.scale || 1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGridCropOpen, setIsGridCropOpen] = useState(false);
  const [gridRows, setGridRows] = useState<number>(3);
  const [gridCols, setGridCols] = useState<number>(3);

  useEffect(() => {
    const nextUrls = Array.isArray(data.imageUrls) ? data.imageUrls : data.imageUrl ? [data.imageUrl] : [];
    if (JSON.stringify(nextUrls) !== JSON.stringify(imageUrls)) {
      setImageUrls(nextUrls);
      setActiveIndex(0);
    }
    if ((data.rotation || 0) !== rotation) {
      setRotation(data.rotation || 0);
    }
    if ((data.scale || 1) !== scale) {
      setScale(data.scale || 1);
    }
  }, [data.imageUrl, data.imageUrls, data.rotation, data.scale, imageUrls, rotation, scale]);

  const updateNodeData = (updates: Partial<ImageNodeData>) => {
    setNodes((nds) => nds.map((node) => {
      if (node.id === id) {
        return { ...node, data: { ...node.data, ...updates } };
      }
      return node;
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const result = event.target.result as string;
          setImageUrls([result]);
          setActiveIndex(0);
          updateNodeData({ imageUrl: result, imageUrls: [result] });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRotateCcw = () => {
    const next = rotation - 90;
    setRotation(next);
    updateNodeData({ rotation: next });
  };
  const handleRotateCw = () => {
    const next = rotation + 90;
    setRotation(next);
    updateNodeData({ rotation: next });
  };
  const handleZoomIn = () => {
    const next = Math.min(scale + 0.1, 3);
    setScale(next);
    updateNodeData({ scale: next });
  };
  const handleZoomOut = () => {
    const next = Math.max(scale - 0.1, 0.5);
    setScale(next);
    updateNodeData({ scale: next });
  };
  const handleReset = () => {
    setRotation(0);
    setScale(1);
    updateNodeData({ rotation: 0, scale: 1 });
  };

  const triggerUpload = () => fileInputRef.current?.click();
  const activeUrl = imageUrls[activeIndex] || null;
  const selfNode = useMemo(() => nodes.find((n) => n.id === id) || null, [nodes, id]);

  const createStoryboardGridNode = (rows: number, cols: number) => {
    if (!activeUrl) return;
    const safeRows = Math.max(1, Math.min(200, Math.floor(rows)));
    const safeCols = Math.max(1, Math.min(200, Math.floor(cols)));
    const baseX = selfNode?.position?.x ?? 0;
    const baseY = selfNode?.position?.y ?? 0;
    const w = selfNode?.width || (selfNode as any)?.measured?.width || 280;
    const size = Math.max(safeRows, safeCols);
    const tileH = size >= 20 ? 24 : size >= 10 ? 32 : size >= 6 ? 40 : 72;
    const gap = 4;
    const padding = 8;
    const header = 40;
    const gridW = safeCols * tileH + (safeCols - 1) * gap;
    const gridH = safeRows * tileH + (safeRows - 1) * gap;
    const width = Math.max(200, gridW + padding * 2);
    const height = Math.max(160, header + gridH + padding * 2);
    const newNodeId = `storyboard-grid-${Date.now()}`;
    const newNode = {
      id: newNodeId,
      type: 'storyboard-grid',
      position: { x: baseX + w + 80, y: baseY },
      data: {
        label: `分镜格子 ${safeRows}×${safeCols}`,
        sourceImageUrl: activeUrl,
        rows: safeRows,
        cols: safeCols,
      },
      style: { width, height },
    } as any;
    setNodes((nds) => nds.concat(newNode));
  };

  return (
    <div 
        className={`relative bg-gray-900 border-2 rounded-lg shadow-xl transition-all group flex flex-col ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'}`}
        style={{ width: '100%', height: '100%', minWidth: '200px', minHeight: '200px' }}
    >
      
      <NodeResizer minWidth={200} minHeight={200} isVisible={selected} lineClassName="border-blue-500" handleClassName="h-3 w-3 bg-white border-2 border-blue-500 rounded" />

      {/* Header */}
      <div className="bg-gray-800 px-3 py-2 rounded-t-lg flex items-center justify-between border-b border-gray-700 w-full group/header">
        <div className="flex items-center space-x-2">
          <ImageIcon size={14} className="text-purple-400" />
          <span className="text-sm font-medium text-gray-200">{data.label || '图片节点'}</span>
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
        <Handle type="target" position={Position.Left} className="w-3 h-3 bg-purple-500 z-50" />
        <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-500 z-50" />
      </div>

      {/* Content Area */}
      <div className="p-1 bg-gray-950 rounded-b-lg flex-1 flex flex-col overflow-hidden w-full relative group/image min-h-0">
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleFileChange} 
        />
        
        {activeUrl ? (
          <div className="w-full flex-1 min-h-[140px] overflow-hidden relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <img 
                src={activeUrl} 
                alt="Node content" 
                className="block transition-transform duration-200 w-full h-full object-contain"
                style={{ 
                  transform: `rotate(${rotation}deg) scale(${scale})`
                }} 
              />
            </div>

            {imageUrls.length > 1 && (
              <div className="nodrag absolute top-2 left-2 right-2 flex gap-2 overflow-x-auto no-scrollbar z-10">
                {imageUrls.map((url, idx) => (
                  <button
                    key={`${idx}-${url.slice(0, 24)}`}
                    type="button"
                    className={`w-10 h-10 flex-shrink-0 rounded overflow-hidden border ${idx === activeIndex ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-gray-800'} bg-gray-900`}
                    onClick={() => {
                      setActiveIndex(idx);
                      updateNodeData({ imageUrl: url });
                    }}
                    title={`第 ${idx + 1} 张`}
                  >
                    <img src={url} alt={`Image ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            
            {/* Toolbar inside image area */}
            {selected && (
              <div 
                className="nodrag absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 bg-gray-800/90 backdrop-blur-sm border border-gray-700 p-1 rounded-lg shadow-xl z-10"
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setGridRows(3);
                    setGridCols(3);
                    setIsGridCropOpen(true);
                  }}
                  className="p-1.5 hover:bg-gray-700 rounded text-gray-300"
                  title="宫格裁剪"
                >
                  <LayoutGrid size={14} />
                </button>
                <div className="w-px h-6 bg-gray-700 mx-1" />
                <button onClick={handleRotateCcw} className="p-1.5 hover:bg-gray-700 rounded text-gray-300" title="向左旋转">
                  <RotateCcw size={14} />
                </button>
                <button onClick={handleRotateCw} className="p-1.5 hover:bg-gray-700 rounded text-gray-300" title="向右旋转">
                  <RotateCw size={14} />
                </button>
                <div className="w-px h-6 bg-gray-700 mx-1" />
                <button onClick={handleZoomOut} className="p-1.5 hover:bg-gray-700 rounded text-gray-300" title="缩小">
                  <ZoomOut size={14} />
                </button>
                <button onClick={handleZoomIn} className="p-1.5 hover:bg-gray-700 rounded text-gray-300" title="放大">
                  <ZoomIn size={14} />
                </button>
                <button onClick={handleReset} className="p-1.5 hover:bg-gray-700 rounded text-gray-300" title="重置">
                  <RefreshCw size={14} />
                </button>
                <div className="w-px h-6 bg-gray-700 mx-1" />
                <button onClick={triggerUpload} className="p-1.5 hover:bg-gray-700 rounded text-gray-300" title="更换图片">
                  <Upload size={14} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <button 
            onClick={triggerUpload}
            className="nodrag flex flex-col items-center justify-center text-gray-500 hover:text-blue-400 transition-colors gap-2 p-4 border-2 border-dashed border-gray-800 hover:border-blue-500/50 rounded-lg w-full h-full"
          >
            <Upload size={24} />
            <span className="text-xs">点击上传图片</span>
          </button>
        )}
      </div>

      {isGridCropOpen && activeUrl && (
        <div
          className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center nodrag"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="w-[420px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
              <div className="text-sm text-gray-200 font-medium">宫格裁剪</div>
              <button
                className="p-1 rounded hover:bg-gray-700 text-gray-300"
                onClick={() => setIsGridCropOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs hover:bg-gray-700"
                  onClick={() => {
                    setGridRows(3);
                    setGridCols(3);
                  }}
                >
                  3×3
                </button>
                <button
                  className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs hover:bg-gray-700"
                  onClick={() => {
                    setGridRows(25);
                    setGridCols(25);
                  }}
                >
                  25×25
                </button>
                <div className="text-[10px] text-gray-500 ml-auto">拖出切片可生成图片节点</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <div className="text-xs text-gray-500 w-10">行</div>
                  <input
                    type="number"
                    className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                    value={gridRows}
                    min={1}
                    max={200}
                    onChange={(e) => setGridRows(Number(e.target.value))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-gray-500 w-10">列</div>
                  <input
                    type="number"
                    className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                    value={gridCols}
                    min={1}
                    max={200}
                    onChange={(e) => setGridCols(Number(e.target.value))}
                  />
                </div>
              </div>

              <button
                className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-2"
                onClick={() => {
                  createStoryboardGridNode(gridRows, gridCols);
                  setIsGridCropOpen(false);
                }}
              >
                <Check size={16} />
                创建分镜格子组件
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
