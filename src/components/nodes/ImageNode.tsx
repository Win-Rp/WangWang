import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react';
import { Upload, RotateCw, RotateCcw, ZoomIn, ZoomOut, Image as ImageIcon, RefreshCw } from 'lucide-react';

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

  // Sync internal state with data if needed (optional, for saving)
  useEffect(() => {
    const currentImageUrl = imageUrl || undefined;
    // Check if values actually changed to avoid infinite loop
    if (
        data.imageUrl !== currentImageUrl || 
        data.rotation !== rotation || 
        data.scale !== scale
    ) {
        updateNodeData({ imageUrl: currentImageUrl, rotation, scale });
    }
  }, [imageUrl, rotation, scale, data.imageUrl, data.rotation, data.scale]);

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
          // updateNodeData is handled by useEffect
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRotateCcw = () => setRotation((prev) => prev - 90);
  const handleRotateCw = () => setRotation((prev) => prev + 90);
  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.1, 0.5));
  const handleReset = () => {
    setRotation(0);
    setScale(1);
  };

  const triggerUpload = () => fileInputRef.current?.click();

  return (
    <div className={`relative bg-gray-900 border-2 rounded-lg shadow-xl transition-all group ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'}`}>
      
      {/* Header */}
      <div className="bg-gray-800 px-3 py-2 rounded-t-lg flex items-center justify-between border-b border-gray-700 w-64">
        <div className="flex items-center space-x-2">
          <ImageIcon size={14} className="text-purple-400" />
          <span className="text-sm font-medium text-gray-200">{data.label || '图片节点'}</span>
        </div>
        {/* Handles */}
        <Handle type="target" position={Position.Left} className="w-3 h-3 bg-purple-500" />
        <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-500" />
      </div>

      {/* Content Area */}
      <div className="p-1 bg-gray-950 rounded-b-lg min-h-[150px] flex items-center justify-center overflow-hidden w-64 h-64 relative group/image">
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleFileChange} 
        />
        
        {imageUrl ? (
          <div className="w-full h-full flex items-center justify-center overflow-hidden relative">
            <img 
              src={imageUrl} 
              alt="Node content" 
              className="transition-transform duration-200"
              style={{ 
                transform: `rotate(${rotation}deg) scale(${scale})`,
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }} 
            />
            
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
