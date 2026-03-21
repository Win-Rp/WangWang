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
import { 
  Settings, FileText, Film, Image as ImageIcon, Play, Sparkles, 
  Plus, LayoutGrid, LogOut
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import TextNode from '../components/nodes/TextNode';
import ImageNode from '../components/nodes/ImageNode';
import ImageGenNode from '../components/nodes/ImageGenNode';
import VideoGenNode from '../components/nodes/VideoGenNode';
import VideoPreviewNode from '../components/nodes/VideoPreviewNode';
import StoryboardNode from '../components/nodes/StoryboardNode';
import StoryboardGridNode from '../components/nodes/StoryboardGridNode';
import AssetManager from '../components/AssetManager';
import NodeFloatingPanel from '../components/NodeFloatingPanel';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

// Custom Node Types (will implement later, using default for now or simple custom)
const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  'image-gen': ImageGenNode,
  video: VideoGenNode,
  'video-preview': VideoPreviewNode,
  storyboard: StoryboardNode,
  'storyboard-grid': StoryboardGridNode
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
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout request failed', e);
    }
    logout();
    navigate('/login');
   }, [logout, navigate]);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('My Project');
  const [isAssetManagerOpen, setIsAssetManagerOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Handle Space key for panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        if (!isSpacePressed) setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed]);

  const isHydratingRef = useRef(false);
   const hasLoadedRef = useRef(false);
   const saveTimerRef = useRef<number | null>(null);
   const savingRef = useRef(false);
   const savePendingRef = useRef(false);
   const dirtyRef = useRef(false);
   const lastSnapshotRef = useRef<string>('');
   const hasInitSnapshotRef = useRef(false);

   const buildPersistedFlow = useCallback(() => {
    const flow: any = toObject();
    flow.nodes = Array.isArray(flow.nodes)
      ? flow.nodes.map((n: any) => {
          const { selected, dragging, positionAbsolute, ...rest } = n || {};
          return rest;
        })
      : [];
    flow.edges = Array.isArray(flow.edges)
      ? flow.edges.map((e: any) => {
          const { selected, ...rest } = e || {};
          return rest;
        })
      : [];
    return flow;
   }, [toObject]);

   const flushSave = useCallback(async () => {
    if (!projectId) return;
    if (isHydratingRef.current || !hasLoadedRef.current) return;
    if (savingRef.current) {
      savePendingRef.current = true;
      return;
    }

    dirtyRef.current = false;
    savingRef.current = true;

    try {
      const flow = buildPersistedFlow();
      const resp = await apiFetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: projectName,
          canvas_data: flow,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error('Project auto-save failed:', err);
      }
    } catch (error) {
      console.error('Error saving project:', error);
    } finally {
      savingRef.current = false;
      if (savePendingRef.current) {
        savePendingRef.current = false;
        window.setTimeout(() => {
          flushSave();
        }, 0);
      }
    }
   }, [projectId, projectName, buildPersistedFlow]);

   const scheduleAutoSave = useCallback(() => {
    if (!projectId) return;
    if (isHydratingRef.current || !hasLoadedRef.current) return;
    dirtyRef.current = true;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      flushSave();
    }, 600);
   }, [projectId, flushSave]);

   useEffect(() => {
    if (!projectId) return;
    if (isHydratingRef.current || !hasLoadedRef.current) return;
    const snap = JSON.stringify(buildPersistedFlow());
    if (!hasInitSnapshotRef.current) {
      hasInitSnapshotRef.current = true;
      lastSnapshotRef.current = snap;
      return;
    }
    if (snap !== lastSnapshotRef.current) {
      lastSnapshotRef.current = snap;
      scheduleAutoSave();
    }
   }, [projectId, nodes, edges, buildPersistedFlow, scheduleAutoSave]);

   useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      flushSave();
    };
   }, [flushSave]);

  // Load latest project on mount
  useEffect(() => {
    const loadProject = async () => {
      try {
        isHydratingRef.current = true;
        const res = await apiFetch('/api/projects');
        const data = await res.json();
        if (data.data && data.data.length > 0) {
          const project = data.data[0];
          setProjectId(project.id);
          setProjectName(project.name || 'My Project');
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
          hasLoadedRef.current = true;
        } else {
          // Create new project if none exists
          createNewProject();
        }
      } catch (error) {
        console.error('Error loading project:', error);
      } finally {
        isHydratingRef.current = false;
      }
    };
    loadProject();
  }, [setNodes, setEdges, setViewport]);

  const createNewProject = async () => {
    try {
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: 'My Project',
          canvas_data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
        })
      });
      const data = await res.json();
      if (data.data) {
        setProjectId(data.data.id);
        setProjectName(data.data.name || 'My Project');
        hasLoadedRef.current = true;
      }
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const onNodesChangeAuto = useCallback(
    (changes: any[]) => {
      onNodesChange(changes);
      const meaningful = changes.some((c) => c?.type && c.type !== 'select' && c.type !== 'dimensions');
      if (meaningful) scheduleAutoSave();
    },
    [onNodesChange, scheduleAutoSave],
  );

  const onEdgesChangeAuto = useCallback(
    (changes: any[]) => {
      onEdgesChange(changes);
      const meaningful = changes.some((c) => c?.type && c.type !== 'select');
      if (meaningful) scheduleAutoSave();
    },
    [onEdgesChange, scheduleAutoSave],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'default',
            style: { strokeWidth: 4 },
          },
          eds,
        ),
      );
      scheduleAutoSave();
    },
    [setEdges, scheduleAutoSave],
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      scheduleAutoSave();
    },
    [setEdges, scheduleAutoSave],
  );

  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => {
        const strokeWidth = (e.style as any)?.strokeWidth;
        if (typeof strokeWidth === 'number') return e;
        return { ...e, type: e.type || 'default', style: { ...(e.style || {}), strokeWidth: 4 } };
      }),
    );
  }, [setEdges]);

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
          if (targetType === 'text') {
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
          scheduleAutoSave()
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

  const onSelectionChange = useCallback((params: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNodeId(params.nodes?.[0]?.id || null);
  }, []);

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
    const defaultCustomStyleByType: Record<string, { width: number; height: number }> = {
      text: { width: 360, height: 260 },
      image: { width: 280, height: 220 },
      'image-gen': { width: 360, height: 180 },
      video: { width: 360, height: 200 },
      storyboard: { width: 520, height: 520 },
      'video-preview': { width: 360, height: 260 },
    };

    const newNode: Node = {
      id: nodeId,
      type: isCustomNode ? type : 'default',
      position,
      data: { 
        label: `${label}节点`,
        content: '',
        prompt: '',
      },
      style: isCustomNode
        ? defaultCustomStyleByType[type] || { width: 360, height: 260 }
        : { 
        background: '#1e1e1e', 
        color: '#fff', 
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '10px',
        width: 150
      },
    };

    setNodes((nds) => nds.concat(newNode));
    scheduleAutoSave()
    
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
          if (type === 'text') {
            const sourceNode = nodes.find((n) => n.id === pendingConnection.source);
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

  const addImageNodeFromDrop = useCallback(
    (clientX: number, clientY: number, imageUrl: string) => {
      const position = screenToFlowPosition({ x: clientX, y: clientY });
      const nodeId = `image-${Date.now()}`;
      const newNode: Node = {
        id: nodeId,
        type: 'image',
        position,
        data: {
          label: '图片节点',
          imageUrl,
          imageUrls: [imageUrl],
          rotation: 0,
          scale: 1,
        },
        style: { width: 280, height: 220 },
      };
      setNodes((nds) => nds.concat(newNode));
      scheduleAutoSave()
    },
    [screenToFlowPosition, setNodes, scheduleAutoSave],
  );

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
          <div className="flex items-center bg-gray-800 rounded-full px-3 py-1 border border-gray-700">
            <span className="text-xs text-gray-400 mr-2">{user?.email}</span>
            <button 
              onClick={handleLogout} 
              className="text-gray-400 hover:text-red-400 transition-colors p-1"
              title="退出登录"
            >
              <LogOut size={16} />
            </button>
          </div>
          <Link to="/settings" className="p-2 text-gray-400 hover:text-white transition-colors">
            <Settings size={20} />
          </Link>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center">
            <Play size={14} className="mr-1.5" /> 运行工作流
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div 
        className="flex-1 relative overflow-hidden min-h-0" 
        ref={reactFlowWrapper} 
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes('application/x-wangwang-image-url')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          const url = e.dataTransfer.getData('application/x-wangwang-image-url');
          if (!url) return;
          e.preventDefault();
          addImageNodeFromDrop(e.clientX, e.clientY, url);
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChangeAuto}
          onEdgesChange={onEdgesChangeAuto}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onPaneClick={onPaneClick}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneContextMenu={onPaneContextMenu}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{ type: 'default', style: { strokeWidth: 4 }, interactionWidth: 24 }}
          connectionLineStyle={{ strokeWidth: 4 }}
          onMoveEnd={() => scheduleAutoSave()}
          colorMode="dark"
          panOnScroll
          selectionOnDrag={!isSpacePressed}
          panOnDrag={isSpacePressed ? [1, 2] : [2]} // Pan on Left (1) or Middle (2) when Space is held, else only Middle
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
          
          <Panel position="bottom-center" className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-xl p-3 text-xs text-gray-400 select-none pointer-events-none mb-2 shadow-2xl flex items-center space-x-6">
            <div className="flex items-center">
              <div className="flex space-x-1 mr-2">
                <span className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded min-w-[32px] text-center border border-gray-600 shadow-sm font-medium">空格</span>
                <span className="text-gray-500 font-bold">+</span>
                <span className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded border border-gray-600 shadow-sm font-medium">左键</span>
              </div>
              <span className="text-gray-300">移动画布</span>
            </div>
            <div className="flex items-center">
              <div className="flex space-x-1 mr-2">
                <span className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded border border-gray-600 shadow-sm font-medium">Ctrl</span>
                <span className="text-gray-500 font-bold">+</span>
                <span className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded border border-gray-600 shadow-sm font-medium">滚轮</span>
              </div>
              <span className="text-gray-300">缩放画布</span>
            </div>
            <div className="flex items-center">
              <span className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded mr-2 min-w-[32px] text-center border border-gray-600 shadow-sm font-medium">右键</span>
              <span className="text-gray-300">添加组件</span>
            </div>
            <div className="flex items-center">
              <div className="flex space-x-1 mr-2">
                <span className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded border border-gray-600 shadow-sm font-medium">Del</span>
                <span className="text-gray-500 font-bold">/</span>
                <span className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded border border-gray-600 shadow-sm font-medium">BS</span>
              </div>
              <span className="text-gray-300">删除节点</span>
            </div>
          </Panel>
        </ReactFlow>

        <NodeFloatingPanel
          selectedNodeId={selectedNodeId}
          wrapperRef={reactFlowWrapper}
          onClose={() => {
            setSelectedNodeId(null);
            setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
          }}
        />

        {/* Vertical Side Toolbar */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col bg-[#1e1e1e] border border-gray-800 rounded-2xl shadow-2xl p-2 space-y-2 z-40">
          <button className="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center hover:bg-gray-200 transition-colors shadow-lg">
            <Plus size={20} />
          </button>
          <div className="w-8 h-[1px] bg-gray-800 mx-auto" />
          <button 
            onClick={() => setIsAssetManagerOpen(!isAssetManagerOpen)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isAssetManagerOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            title="资产管理"
          >
            <LayoutGrid size={20} />
          </button>
        </div>

        {/* Asset Manager Panel */}
        {isAssetManagerOpen && (
          <AssetManager onClose={() => setIsAssetManagerOpen(false)} />
        )}

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
