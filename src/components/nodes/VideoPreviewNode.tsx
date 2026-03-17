import React, { useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow, NodeResizer } from '@xyflow/react';
import { Film, Trash2 } from 'lucide-react';

interface VideoPreviewNodeData {
  label?: string;
  videoUrl?: string;
}

export default function VideoPreviewNode({ data, id, selected }: NodeProps<any>) {
  const { setNodes } = useReactFlow();
  const [videoUrl, setVideoUrl] = useState<string | null>(data.videoUrl || null);

  useEffect(() => {
    if ((data.videoUrl || null) !== videoUrl) {
      setVideoUrl(data.videoUrl || null);
    }
  }, [data.videoUrl]);

  return (
    <div 
        className={`relative bg-gray-900 border-2 rounded-lg shadow-xl transition-all group flex flex-col ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'}`}
        style={{ width: '100%', height: '100%', minWidth: '240px', minHeight: '180px' }}
    >
      
      <NodeResizer minWidth={240} minHeight={180} isVisible={selected} lineClassName="border-blue-500" handleClassName="h-3 w-3 bg-white border-2 border-blue-500 rounded" />

      {/* Header */}
      <div className="bg-gray-800 px-3 py-2 rounded-t-lg flex items-center justify-between border-b border-gray-700 w-full group/header">
        <div className="flex items-center space-x-2">
          <Film size={14} className="text-cyan-400" />
          <span className="text-sm font-medium text-gray-200">{data.label || '视频预览'}</span>
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
        <Handle type="target" position={Position.Left} className="w-3 h-3 bg-cyan-500 z-50" />
      </div>

      {/* Content Area */}
      <div className="p-1 bg-gray-950 rounded-b-lg flex-1 flex flex-col overflow-hidden w-full relative min-h-0">
        {videoUrl ? (
          <div className="w-full flex-1 overflow-hidden relative bg-black rounded">
            <video 
              src={videoUrl} 
              className="w-full h-full object-contain"
              controls
              playsInline
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-500 gap-2 p-4 border-2 border-dashed border-gray-800 rounded-lg w-full h-full bg-gray-950">
            <Film size={24} className="opacity-20" />
            <span className="text-xs">等待视频输入</span>
          </div>
        )}
      </div>
    </div>
  );
}
