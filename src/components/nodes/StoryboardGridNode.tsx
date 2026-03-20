import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, NodeProps, NodeResizer, Position, useReactFlow } from '@xyflow/react';
import { Trash2, LayoutGrid } from 'lucide-react';

type StoryboardGridNodeData = {
  label?: string;
  sourceImageUrl?: string;
  rows?: number;
  cols?: number;
};

export default function StoryboardGridNode({ data, id, selected }: NodeProps) {
  const nodeData = data as unknown as StoryboardGridNodeData;
  const { setNodes } = useReactFlow();
  const [imgReady, setImgReady] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tileDataUrls, setTileDataUrls] = useState<string[] | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentSize, setContentSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const rows = Math.max(1, Math.min(200, Number(nodeData.rows || 3)));
  const cols = Math.max(1, Math.min(200, Number(nodeData.cols || 3)));
  const sourceImageUrl = typeof nodeData.sourceImageUrl === 'string' ? nodeData.sourceImageUrl : '';

  useEffect(() => {
    setImgReady(false);
    imgRef.current = null;
    setTileDataUrls(null);
    if (!sourceImageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImgReady(true);
    };
    img.onerror = () => {
      imgRef.current = img;
      setImgReady(false);
    };
    img.src = sourceImageUrl;
  }, [sourceImageUrl]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      setContentSize({ width: cr.width, height: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tileAspect = useMemo(() => {
    const img = imgRef.current;
    if (!imgReady || !img || !img.width || !img.height) return 1;
    const tileW = img.width / cols;
    const tileH = img.height / rows;
    if (!tileW || !tileH) return 1;
    return tileW / tileH;
  }, [imgReady, rows, cols]);

  const gapPx = 4;

  const tileFit = useMemo(() => {
    const availableW = Math.max(0, contentSize.width);
    const availableH = Math.max(0, contentSize.height);
    if (!availableW || !availableH) return { tileW: 24, tileH: 24 };

    const maxTileW = Math.max(8, Math.floor((availableW - gapPx * (cols - 1)) / cols));
    const maxTileH = Math.max(8, Math.floor((availableH - gapPx * (rows - 1)) / rows));

    const w1 = maxTileW;
    const h1 = Math.max(8, Math.floor(w1 / tileAspect));
    if (h1 <= maxTileH) return { tileW: w1, tileH: h1 };

    const h2 = maxTileH;
    const w2 = Math.max(8, Math.floor(h2 * tileAspect));
    return { tileW: w2, tileH: h2 };
  }, [contentSize.width, contentSize.height, cols, rows, tileAspect]);

  const cropTileToDataUrl = (r: number, c: number) => {
    const img = imgRef.current;
    if (!img || !img.width || !img.height) return null;

    const sx = Math.round((c * img.width) / cols);
    const sy = Math.round((r * img.height) / rows);
    const ex = Math.round(((c + 1) * img.width) / cols);
    const ey = Math.round(((r + 1) * img.height) / rows);
    const sw = Math.max(1, ex - sx);
    const sh = Math.max(1, ey - sy);

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    try {
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!imgReady) return;
    const total = rows * cols;
    if (total > 64) {
      setTileDataUrls(null);
      return;
    }
    const next: string[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const url = cropTileToDataUrl(r, c);
        next.push(url || '');
      }
    }
    setTileDataUrls(next);
  }, [imgReady, rows, cols, sourceImageUrl]);

  return (
    <div
      className={`relative bg-gray-900 border-2 rounded-lg shadow-xl w-full h-full transition-all flex flex-col ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-700'}`}
    >
      <NodeResizer minWidth={240} minHeight={200} isVisible={selected} lineClassName="border-blue-500" handleClassName="h-3 w-3 bg-white border-2 border-blue-500 rounded" />

      <div className="bg-gray-800 px-3 py-2 rounded-t-lg flex items-center justify-between border-b border-gray-700 group/header">
        <div className="flex items-center gap-2">
          <LayoutGrid size={14} className="text-purple-400" />
          <span className="text-sm font-medium text-gray-200">{nodeData.label || '分镜格子'}</span>
          <span className="text-[10px] text-gray-500">{rows}×{cols}</span>
        </div>

        <button
          className="p-1 hover:bg-red-900/50 rounded text-gray-500 hover:text-red-400 transition-colors ml-auto opacity-0 group-hover/header:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setNodes((nds) => nds.filter((n) => n.id !== id));
          }}
          title="删除"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div ref={contentRef} className="p-2 bg-gray-950 flex-1 min-h-0 overflow-hidden">
        {sourceImageUrl ? (
          <div
            className="grid"
            style={{
              gap: gapPx,
              gridTemplateColumns: `repeat(${cols}, ${tileFit.tileW}px)`,
              gridAutoRows: `${tileFit.tileH}px`,
              justifyContent: 'center',
              alignContent: 'center',
            }}
          >
            {Array.from({ length: rows * cols }).map((_, idx) => {
              const r = Math.floor(idx / cols);
              const c = idx % cols;
              const tileUrl = Array.isArray(tileDataUrls) ? tileDataUrls[idx] : '';
              return (
                <div
                  key={idx}
                  className="nodrag relative rounded border border-gray-800 bg-gray-900 overflow-hidden"
                  style={{
                    width: tileFit.tileW,
                    height: tileFit.tileH,
                  }}
                  draggable
                  onDragStart={(e) => {
                    const url = tileUrl || (imgReady ? cropTileToDataUrl(r, c) : null);
                    if (!url) return;
                    e.dataTransfer.setData('application/x-wangwang-image-url', url);
                    e.dataTransfer.setData('text/plain', url);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title="拖出创建图片节点"
                >
                  {tileUrl ? (
                    <img src={tileUrl} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none select-none" />
                  ) : (
                    <img
                      src={sourceImageUrl}
                      alt=""
                      draggable={false}
                      className="absolute top-0 left-0 pointer-events-none select-none"
                      style={{
                        width: cols * tileFit.tileW,
                        height: rows * tileFit.tileH,
                        transform: `translate(${-c * tileFit.tileW}px, ${-r * tileFit.tileH}px)`,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-600">
            未设置图片
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-purple-500 z-50" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-500 z-50" />
    </div>
  );
}
