import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  useReactFlow,
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

// Custom Node Types (will implement later, using default for now or simple custom)
const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  'image-gen': ImageGenNode
};

const INITIAL_NODES: Node[] = [];
const INITIAL_EDGES: Edge[] = [];

const NODE_TYPES_LIST = [
  { type: 'text', label: '文本', icon: FileText },
  { type: 'image', label: '图片', icon: ImageIcon },
  { type: 'image-gen', label: '图片生成', icon: Sparkles },
  { type: 'script', label: '剧本', icon: FileText },
  { type: 'storyboard', label: '分镜', icon: ImageIcon },
  { type: 'video', label: '视频', icon: Film },
];

function CanvasContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [menu, setMenu] = useState<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<{ source: string; sourceHandle: string | null } | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, toObject, setViewport } = useReactFlow();
  const [projectId, setProjectId] = useState<string | null>(null);

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

  const saveProject = async () => {
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

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
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
      if (type === 'image-gen') {
        const sourceNode = nodes.find((n) => n.id === pendingConnection.source);
        if (sourceNode?.type === 'text') targetHandle = 'prompt';
        if (sourceNode?.type === 'image') targetHandle = 'images';
      }

      setEdges((eds) => addEdge({
        source: pendingConnection.source,
        sourceHandle: pendingConnection.sourceHandle,
        target: nodeId,
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
          <button onClick={saveProject} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1.5 rounded-full text-sm font-medium transition-colors">
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
          fitView
          colorMode="dark"
          panOnScroll
          selectionOnDrag
          panOnDrag={[1, 2]} // Pan on Left (1) or Middle (2) mouse button
          zoomOnDoubleClick={false}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background color="#333" variant={BackgroundVariant.Dots} />
          <Controls />
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
