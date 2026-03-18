import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Panel,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  useReactFlow,
  useViewport,
  ReactFlowProvider,
  BackgroundVariant,
  FinalConnectionState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Settings, FileText, Film, Image as ImageIcon, Play, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

import TextNode from '../components/nodes/TextNode';
import ImageNode from '../components/nodes/ImageNode';
import ImageGenNode from '../components/nodes/ImageGenNode';
import VideoGenNode from '../components/nodes/VideoGenNode';
import VideoPreviewNode from '../components/nodes/VideoPreviewNode';
import StoryboardNode from '../components/nodes/StoryboardNode';

// Custom Node Types (will implement later, using default for now or simple custom)
const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  'image-gen': ImageGenNode,
  video: VideoGenNode,
  'video-preview': VideoPreviewNode,
  storyboard: StoryboardNode
};

const INITIAL_NODES: Node[] = [];
const INITIAL_EDGES: Edge[] = [];

function ZoomDisplay() {
  const { zoom } = useViewport();
  const { zoomTo } = useReactFlow();
  const [inputValue, setInputValue] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(Math.round(zoom * 100).toString());
    }
  }, [zoom, isEditing]);

  const handleCommit = () => {
    setIsEditing(false);
    let val = parseInt(inputValue, 10);
    if (isNaN(val)) {
      setInputValue(Math.round(zoom * 100).toString());
      return;
    }
    val = Math.max(10, Math.min(val, 300)); // Limit 10% - 300%
    zoomTo(val / 100, { duration: 300 });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommit();
    }
  };

  return (
    <Panel position="bottom-left" className="bg-gray-800 text-white px-2 py-1 rounded text-xs border border-gray-700 select-none ml-14">
      {isEditing ? (
        <div className="flex items-center">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown}
            className="w-8 bg-transparent outline-none text-center"
            autoFocus
          />
          <span>%</span>
        </div>
      ) : (
        <span onClick={() => setIsEditing(true)} className="cursor-pointer min-w-[2rem] text-center inline-block">
          {Math.round(zoom * 100)}%
        </span>
      )}
    </Panel>
  );
}

const NODE_TYPES_LIST = [
  { type: 'text', label: '文本', icon: FileText },
  { type: 'image', label: '图片', icon: ImageIcon },
  { type: 'image-gen', label: '图片生成', icon: Sparkles },
  { type: 'script', label: '剧本', icon: FileText },
  { type: 'storyboard', label: '分镜', icon: ImageIcon },
  { type: 'video', label: '视频生成', icon: Film },
  { type: 'video-preview', label: '视频预览', icon: Play },
];

function CanvasContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [menu, setMenu] = useState<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<{ source: string; sourceHandle: string | null } | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, toObject, setViewport } = useReactFlow();
  const [projectId, setProjectId] = useState<string | null>(null);

  const saveProject = useCallback(async () => {
    if (!projectId) return;
    
    const flow = toObject();
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvas_data: flow
        })
      });
      console.log('Project auto-saved');
    } catch (error) {
      console.error('Error saving project:', error);
    }
  }, [projectId, toObject]);

  // Auto-save on unmount
  useEffect(() => {
    return () => {
      saveProject();
    };
  }, [saveProject]);

  // Load latest project on mount
  useEffect(() => {
    const loadProject = async () => {
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        if (data.data && data.data.length > 0) {
          const project = data.data[0];
          setProjectId(project.id);
          if (project.canvas_data) {
            const flow = JSON.parse(project.canvas_data);
            if (flow) {
              setNodes(flow.nodes || []);
              setEdges(flow.edges || []);
              if (flow.viewport) {
                setViewport(flow.viewport);
              }
            }
          }
        } else {
          // Create new project if none exists
          createNewProject();
        }
      } catch (error) {
        console.error('Error loading project:', error);
      }
    };
    loadProject();
  }, [setNodes, setEdges, setViewport]);

  const createNewProject = async () => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'My Project',
          canvas_data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
        })
      });
      const data = await res.json();
      if (data.data) {
        setProjectId(data.data.id);
      }
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const handleManualSave = async () => {
    if (!projectId) return;
    
    const flow = toObject();
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvas_data: flow
        })
      });
      alert('保存成功');
    } catch (error) {
      console.error('Error saving project:', error);
      alert('保存失败');
    }
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (!connectionState.isValid && connectionState.fromNode) {
        if (connectionState.toNode) {
          const sourceType = connectionState.fromNode.type;
          const targetType = connectionState.toNode.type;

          let targetHandle: string | null = null;
          if (targetType === 'image-gen') {
            if (sourceType === 'text') targetHandle = 'prompt-area';
            if (sourceType === 'image') targetHandle = 'images';
          }
          if (targetType === 'video') {
            if (sourceType === 'text') targetHandle = 'prompt-area';
            if (sourceType === 'image') targetHandle = 'images';
            if (sourceType === 'storyboard') targetHandle = 'prompt-area';
          }
          if (targetType === 'video-preview') {
            if (sourceType === 'video') targetHandle = null;
          }

          setEdges((eds) =>
            addEdge(
              {
                source: connectionState.fromNode!.id,
                sourceHandle: connectionState.fromHandle?.id || null,
                target: connectionState.toNode!.id,
                targetHandle,
              },
              eds,
            ),
          )
          setPendingConnection(null)
          setMenu(null)
          return
        }

        const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;
        const pane = reactFlowWrapper.current?.getBoundingClientRect();
        if (pane) {
          setMenu({
            x: clientX - pane.left,
            y: clientY - pane.top,
            clientX,
            clientY,
          });
          setPendingConnection({
            source: connectionState.fromNode.id,
            sourceHandle: connectionState.fromHandle?.id || null
          });
        }
      }
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setMenu(null);
    setPendingConnection(null);
  }, []);

  const onNodeClick = useCallback((event: React.MouseEvent, _node: Node) => {
    event.stopPropagation(); // Prevent pane click
    setMenu(null);
    setPendingConnection(null);
  }, []);

  // Double click to open menu
  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Prevent default behavior to stop zooming
      event.preventDefault();
      
      const pane = reactFlowWrapper.current?.getBoundingClientRect();
      if (pane) {
        setMenu({
          x: event.clientX - pane.left,
          y: event.clientY - pane.top,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }
    },
    []
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const pane = reactFlowWrapper.current?.getBoundingClientRect();
      if (pane) {
        setMenu({
          x: event.clientX - pane.left,
          y: event.clientY - pane.top,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }
    },
    []
  );

  const addNode = (type: string, label: string) => {
    if (!menu) return;
    
    const position = screenToFlowPosition({
      x: menu.clientX,
      y: menu.clientY,
    });

    const nodeId = `${type}-${Date.now()}`;

    // Check if the type is supported in nodeTypes
    const isCustomNode = Object.keys(nodeTypes).includes(type);

    const newNode: Node = {
      id: nodeId,
      type: isCustomNode ? type : 'default',
      position,
      data: { 
        label: `${label}节点`,
        content: '',
        prompt: '',
      },
      style: isCustomNode ? undefined : { 
        background: '#1e1e1e', 
        color: '#fff', 
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '10px',
        width: 150
      },
    };

    setNodes((nds) => nds.concat(newNode));
    
    if (pendingConnection) {
      let targetHandle: string | null = null;
      let sourceHandle: string | null = pendingConnection.sourceHandle;
      let source = pendingConnection.source;
      let target = nodeId;

      // Check if connection started from an ImageGenNode input handle (left side)
      // This means we are dragging FROM an input TO create a source node (reverse connection)
      const pendingNode = nodes.find(n => n.id === pendingConnection.source);
      if (pendingNode?.type === 'image-gen') {
        // List of input handles on ImageGenNode
        const inputHandles = ['images', 'prompt', 'image-input', 'prompt-area', 'text-input'];
        if (sourceHandle && inputHandles.includes(sourceHandle)) {
            // Reverse the connection: New Node -> ImageGenNode
            source = nodeId;
            target = pendingConnection.source;
            targetHandle = sourceHandle;
            sourceHandle = null; // New node uses default source handle
            
            // Validate compatibility based on new node type
            if (type === 'image') {
                if (targetHandle === 'prompt' || targetHandle === 'prompt-area' || targetHandle === 'text-input') {
                    // Image node cannot connect to text input
                    console.warn('Cannot connect Image node to Text input');
                    setPendingConnection(null);
                    setMenu(null);
                    return; 
                }
            } else if (type === 'text') {
                if (targetHandle === 'images' || targetHandle === 'image-input') {
                    // Text node cannot connect to image input
                     console.warn('Cannot connect Text node to Image input');
                     setPendingConnection(null);
                     setMenu(null);
                     return;
                }
            }
        }
      }
      if (pendingNode?.type === 'video') {
        const inputHandles = ['images', 'prompt', 'image-input', 'text-input'];
        if (sourceHandle && inputHandles.includes(sourceHandle)) {
          source = nodeId;
          target = pendingConnection.source;
          targetHandle = sourceHandle;
          sourceHandle = null;
          if (type === 'image' && targetHandle === 'prompt') {
            setPendingConnection(null);
            setMenu(null);
            return;
          }
          if (type === 'text' && (targetHandle === 'images' || targetHandle === 'image-input')) {
            setPendingConnection(null);
            setMenu(null);
            return;
          }
        }
      }

      // Normal connection logic (Source Node -> New Node)
      if (source === pendingConnection.source) {
          if (type === 'image-gen') {
            const sourceNode = nodes.find((n) => n.id === pendingConnection.source);
            if (sourceNode?.type === 'text') targetHandle = 'prompt';
            if (sourceNode?.type === 'image') targetHandle = 'images';
          }
          if (type === 'video') {
            const sourceNode = nodes.find((n) => n.id === pendingConnection.source);
            if (sourceNode?.type === 'text') targetHandle = 'prompt-area';
            if (sourceNode?.type === 'image') targetHandle = 'images';
          }
          if (type === 'video-preview') {
            const sourceNode = nodes.find((n) => n.id === pendingConnection.source);
            if (sourceNode?.type === 'video') targetHandle = null;
          }
          
          // Handle connection from ImageGenNode to ImageNode (or other nodes)
          if (type === 'image' && pendingConnection.sourceHandle === 'output') {
             // ImageNode does not have specific input handles, it uses the default Left handle
             // So we don't need to set targetHandle (it will be null, which means default handle)
          }
      }

      setEdges((eds) => addEdge({
        source,
        sourceHandle,
        target,
        targetHandle
      }, eds));
      setPendingConnection(null);
    }
    
    setMenu(null);
  };

  return (
    <div className="h-screen w-screen bg-[#1a1a1a] flex flex-col">
      {/* Header */}
      <div className="h-14 bg-[#1a1a1a] border-b border-gray-800 flex items-center justify-between px-4 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            {/* Pixel Dog Icon Placeholder */}
            <span className="text-xs">🐶</span>
          </div>
          <span className="font-bold text-white">旺旺</span>
        </div>
        <div className="flex items-center space-x-4">
          <Link to="/settings" className="p-2 text-gray-400 hover:text-white transition-colors">
            <Settings size={20} />
          </Link>
          <button onClick={handleManualSave} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1.5 rounded-full text-sm font-medium transition-colors">
            保存
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center">
            <Play size={14} className="mr-1.5" /> 运行工作流
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div 
        className="flex-1 relative" 
        ref={reactFlowWrapper} 
        style={{ height: 'calc(100vh - 3.5rem)' }}
        onDoubleClick={onPaneDoubleClick}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onPaneClick={onPaneClick}
          onNodeClick={onNodeClick}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          colorMode="dark"
          panOnScroll
          selectionOnDrag
          panOnDrag={[1, 2]} // Pan on Left (1) or Middle (2) mouse button
          zoomOnDoubleClick={false}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background color="#333" variant={BackgroundVariant.Dots} />
          <Controls />
          <MiniMap 
            style={{ height: 120 }} 
            zoomable 
            pannable 
            className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden"
            nodeColor={(n) => {
              if (n.type === 'image') return '#3b82f6';
              if (n.type === 'image-gen') return '#8b5cf6';
              if (n.type === 'video') return '#06b6d4';
              if (n.type === 'text') return '#10b981';
              return '#fff';
            }}
            maskColor="rgba(0, 0, 0, 0.6)"
          />
          <ZoomDisplay />
        </ReactFlow>

        {/* Context Menu for Adding Nodes */}
        {menu && (
          <div
            className="absolute bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-2 w-48 z-50"
            style={{ top: menu.y, left: menu.x }}
          >
            <div className="text-xs text-gray-500 mb-2 px-2">添加组件</div>
            {NODE_TYPES_LIST.map((item) => (
              <button
                key={item.type}
                onClick={() => addNode(item.type, item.label)}
                className="w-full text-left px-2 py-2 hover:bg-gray-700 rounded flex items-center text-sm text-gray-200"
              >
                <item.icon size={16} className="mr-2 text-blue-400" />
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Property Panel - Removed as requested */}
      </div>
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasContent />
    </ReactFlowProvider>
  );
}
