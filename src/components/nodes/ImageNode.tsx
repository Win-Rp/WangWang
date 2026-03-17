import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow, NodeResizer } from '@xyflow/react';
import { Upload, RotateCw, RotateCcw, ZoomIn, ZoomOut, Image as ImageIcon, RefreshCw, Trash2 } from 'lucide-react';

interface ImageNodeData {
  label?: string;
  imageUrl?: string;
  rotation?: number;
  scale?: number;
}

export default function ImageNode({ data, id, selected }: NodeProps<any>) {
  const { setNodes } = useReactFlow();
  const [imageUrl, setImageUrl] = useState<string | null>(data.imageUrl || null);
  const [rotation, setRotation] = useState(data.rotation || 0);
  const [scale, setScale] = useState(data.scale || 1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ((data.imageUrl || null) !== imageUrl) {
      setImageUrl(data.imageUrl || null);
    }
    if ((data.rotation || 0) !== rotation) {
      setRotation(data.rotation || 0);
    }
    if ((data.scale || 1) !== scale) {
      setScale(data.scale || 1);
    }
  }, [data.imageUrl, data.rotation, data.scale]);

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
          setImageUrl(result);
          updateNodeData({ imageUrl: result });
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
        
        {imageUrl ? (
          <div className="w-full flex-1 min-h-[140px] overflow-hidden relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <img 
                src={imageUrl} 
                alt="Node content" 
                className="block transition-transform duration-200 w-full h-full object-contain"
                style={{ 
                  transform: `rotate(${rotation}deg) scale(${scale})`
                }} 
              />
            </div>
            
            {/* Toolbar inside image area */}
            {selected && (
              <div 
                className="nodrag absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 bg-gray-800/90 backdrop-blur-sm border border-gray-700 p-1 rounded-lg shadow-xl z-10"
                onDoubleClick={(e) => e.stopPropagation()}
              >
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
    </div>
  );
}
