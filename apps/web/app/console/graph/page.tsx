"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import ForceGraph2D, { type ForceGraphLink, type ForceGraphNode } from "react-force-graph-2d";
import { Box, Crosshair, Maximize2, Network, RotateCcw, X } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useApp } from "@/components/app-provider";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsoleInspectorStack,
  ConsoleStatsGrid,
  ConsoleSelect,
} from "@/components/console/primitives";
import { cx } from "@/components/console/shared";

/** Neo 主题色板 SSR 兜底值 — 与 CSS 自定义属性语义一致 */
const SSR_GRAPH_COLORS = {
  particle: "#0011FF",   // --brand
  nodeActive: "#FFE600", // --warning
  nodeNeighbor: "#FFFFFF", // --bg-card
  nodeDefault: "rgba(255,255,255,0.88)",
  stroke: "#000",        // --text-primary
  text: "#000",          // --text-primary
  linkActive: "#000",    // --text-primary
  linkMuted: "rgba(0,0,0,0.12)",
} as const;

/** 从 CSS 自定义属性读取 Neo 主题色板，用于 Canvas 渲染层 */
function readGraphColors(): Record<keyof typeof SSR_GRAPH_COLORS, string> {
  if (typeof window === "undefined") {
    return SSR_GRAPH_COLORS;
  }
  const style = getComputedStyle(document.documentElement);
  return {
    particle: style.getPropertyValue("--brand").trim() || SSR_GRAPH_COLORS.particle,
    nodeActive: style.getPropertyValue("--warning").trim() || SSR_GRAPH_COLORS.nodeActive,
    nodeNeighbor: style.getPropertyValue("--bg-card").trim() || SSR_GRAPH_COLORS.nodeNeighbor,
    nodeDefault: SSR_GRAPH_COLORS.nodeDefault,
    stroke: style.getPropertyValue("--text-primary").trim() || SSR_GRAPH_COLORS.stroke,
    text: style.getPropertyValue("--text-primary").trim() || SSR_GRAPH_COLORS.text,
    linkActive: style.getPropertyValue("--text-primary").trim() || SSR_GRAPH_COLORS.linkActive,
    linkMuted: SSR_GRAPH_COLORS.linkMuted,
  };
}

interface KnowledgeBase {
  id: string;
  name: string;
}

interface GraphNode extends ForceGraphNode {
  id: string;
  name: string;
  vikingUri?: string;
  x: number;
  y: number;
  __bckgDimensions?: [number, number];
}

type GraphLink = ForceGraphLink<GraphNode>;

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

function getLinkNodeId(node: string | number | GraphNode | undefined) {
  if (!node) {
    return "";
  }
  if (typeof node === "object" && "id" in node) {
    return String(node.id);
  }
  return String(node);
}

export default function GraphPage() {
  const { theme } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const graphRef = useRef<ForceGraph2D<GraphNode, GraphLink>>(null);
  const fullScreenGraphRef = useRef<ForceGraph2D<GraphNode, GraphLink>>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState("");
  const [data, setData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 640 });
  const initialKbId = searchParams.get("kbId");

  const activeNode = hoverNode ?? selectedNode;

  // 监听容器大小变化
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height: height || 640 });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (isFullScreen) {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsFullScreen(false);
      };
      window.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden"; // 禁用滚动

      return () => {
        window.removeEventListener("keydown", handleEsc);
        document.body.style.overflow = "";
      };
    }
  }, [isFullScreen]);

  // 全屏切换后的自适应
  useEffect(() => {
    if (isFullScreen) {
      const timer = setTimeout(() => {
        fullScreenGraphRef.current?.zoomToFit(400, 80);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        graphRef.current?.zoomToFit(400, 80);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isFullScreen, data]);

  const neighbors = useMemo(() => {
    const target = activeNode;
    const result = new Set<string>();
    if (!target || !data) {
      return result;
    }

    result.add(target.id);
    data.links.forEach((link) => {
      const sourceId = getLinkNodeId(link.source);
      const targetId = getLinkNodeId(link.target);
      if (sourceId === target.id) {
        result.add(targetId);
      }
      if (targetId === target.id) {
        result.add(sourceId);
      }
    });
    return result;
  }, [activeNode, data]);

  const loadGraph = useCallback(async (kbId: string) => {
    if (!kbId) {
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.get<GraphData>(`/knowledge-tree/graph?kbId=${kbId}`);
      setData(response);
      setSelectedNode(null);
      setHoverNode(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const list = await apiClient.get<KnowledgeBase[]>("/knowledge-bases");
        if (!active) {
          return;
        }
        setKbs(list);
        const nextKbId = list.find((kb) => kb.id === initialKbId)?.id ?? list[0]?.id;
        if (nextKbId) {
          setSelectedKb(nextKbId);
          void loadGraph(nextKbId);
        } else {
          setLoading(false);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [initialKbId, loadGraph]);

  const density = data && data.nodes.length > 0 ? (data.links.length / data.nodes.length).toFixed(2) : "0.00";

  const graphColors = readGraphColors();
  const isStarry = theme === "starry";

  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const fontSize = 11 / globalScale;
    ctx.font = `600 ${fontSize}px Geist Mono, "Microsoft YaHei", sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const paddingH = fontSize * 1.6;
    const paddingV = fontSize * 1.2;
    const dimensions = [textWidth + paddingH, fontSize + paddingV] as [number, number];
    const isActive = activeNode?.id === node.id;
    const isNeighbor = neighbors.has(node.id);

    if (isStarry) {
      // --- 浩瀚星空 (Starry Sky) ---
      // 深邃暗色 · 星芒漫游
      const r = 6 / globalScale;
      ctx.beginPath();
      ctx.roundRect(node.x - dimensions[0] / 2, node.y - dimensions[1] / 2, dimensions[0], dimensions[1], r);
      
      if (isActive) {
        ctx.fillStyle = "#FFE600"; // 焦点星芒黄
        ctx.shadowColor = "#FFE600";
        ctx.shadowBlur = 30 / globalScale;
      } else if (isNeighbor) {
        ctx.fillStyle = "rgba(0, 240, 255, 0.25)"; // 星际氧气蓝
        ctx.strokeStyle = "rgba(0, 240, 255, 0.8)";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
        ctx.shadowColor = "#00F0FF";
        ctx.shadowBlur = 15 / globalScale;
      } else {
        ctx.fillStyle = "rgba(10, 25, 45, 0.85)";
        ctx.strokeStyle = "rgba(0, 240, 255, 0.2)";
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      }
      ctx.fill();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isActive ? "#000000" : "#FFFFFF";
      ctx.fillText(label, node.x, node.y);
    } else {
      // --- 星智流光 (Neo / Luminous) ---
      // 圆润柔和 · 呼吸感
      const r = 4 / globalScale;
      ctx.beginPath();
      ctx.roundRect(node.x - dimensions[0] / 2, node.y - dimensions[1] / 2, dimensions[0], dimensions[1], r);

      if (isActive) {
        ctx.fillStyle = "#00E676"; // 焦点呼吸绿
        ctx.shadowColor = "rgba(0, 230, 118, 0.6)";
        ctx.shadowBlur = 25 / globalScale;
      } else if (isNeighbor) {
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#00C853"; // 邻接清新绿
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
        ctx.shadowColor = "rgba(0, 200, 83, 0.2)";
        ctx.shadowBlur = 12 / globalScale;
      } else {
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
        // 给个微弱的底部投影增强呼吸感
        ctx.shadowColor = "rgba(0, 0, 0, 0.04)";
        ctx.shadowOffsetY = 2 / globalScale;
        ctx.shadowBlur = 4 / globalScale;
      }
      ctx.fill();

      // 左侧装饰条 (Neo 特色)
      if (isActive || isNeighbor) {
        ctx.fillStyle = isActive ? "#000" : "#00C853";
        ctx.fillRect(node.x - dimensions[0] / 2, node.y - dimensions[1] / 2, 3 / globalScale, dimensions[1]);
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isActive ? "#FFFFFF" : "#000000";
      ctx.fillText(label, node.x, node.y);
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    node.__bckgDimensions = dimensions;
  }, [activeNode, neighbors, isStarry, graphColors]);

  const nodePointerAreaPaint = useCallback((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
    const dimensions = node.__bckgDimensions;
    if (!dimensions) return;
    ctx.fillStyle = color;
    ctx.fillRect(node.x - dimensions[0] / 2, node.y - dimensions[1] / 2, dimensions[0], dimensions[1]);
  }, []);

  const fullScreenContent = isFullScreen && typeof document !== "undefined" && createPortal(
    <div className={cx(
      "fixed inset-0 z-[2000] flex items-center justify-center backdrop-blur-xl animate-in fade-in duration-500 p-4 sm:p-8",
      isStarry ? "bg-black/80" : "bg-white/60"
    )}>
      <div className={cx(
        "relative flex h-full w-full flex-col overflow-hidden rounded-3xl border shadow-[0_0_100px_rgba(0,0,0,0.2)] animate-in zoom-in-95 duration-500",
        isStarry ? "bg-[#050505] border-white/10" : "bg-[var(--bg-base)] border-[var(--border)]"
      )}>
        {/* 顶部控制栏 */}
        <div className={cx(
          "flex h-20 items-center justify-between border-b px-8",
          isStarry ? "border-white/5 bg-white/[0.02]" : "border-[var(--border)] bg-white/40"
        )}>
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--brand)] to-[#4D61FF] text-white shadow-lg shadow-[var(--brand)]/20">
              <Network size={24} strokeWidth={2.6} />
            </div>
            <div>
              <h2 className={cx("text-xl font-black tracking-tight", isStarry ? "text-white" : "text-[var(--text-primary)]")}>图谱全屏探索</h2>
              <p className={cx("text-[10px] font-bold uppercase tracking-[0.2em]", isStarry ? "text-white/40" : "text-[var(--text-muted)]")}>{selectedKb}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fullScreenGraphRef.current?.zoomToFit(400, 80)}
              className={cx(
                "flex h-12 w-12 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95",
                isStarry ? "bg-white/5 text-white hover:bg-white/10" : "bg-black/5 text-[var(--text-primary)] hover:bg-black/10"
              )}
              title="重置视图"
            >
              <RotateCcw size={20} />
            </button>
            <button
              onClick={() => setIsFullScreen(false)}
              className={cx(
                "group flex h-12 w-12 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95",
                isStarry ? "bg-white/5 text-white hover:bg-white/10" : "bg-black/5 text-[var(--text-primary)] hover:bg-black/10"
              )}
            >
              <X size={24} className="transition-transform group-hover:rotate-90" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 cursor-grab active:cursor-grabbing">
          {data && (
            <ForceGraph2D
              ref={fullScreenGraphRef}
              graphData={data}
              width={window.innerWidth - (typeof window !== "undefined" && window.innerWidth < 640 ? 32 : 64)}
              height={window.innerHeight - (typeof window !== "undefined" && window.innerWidth < 640 ? 32 : 64) - 80}
              backgroundColor="transparent"
              nodeRelSize={6}
              enableNodeDrag
              linkDirectionalParticles={isStarry ? 5 : 2}
              linkDirectionalParticleSpeed={0.008}
              linkDirectionalParticleWidth={isStarry ? 3 : 2}
              linkDirectionalParticleColor={() => isStarry ? "#00F0FF" : graphColors.particle}
              linkColor={(link) => {
                const sourceId = getLinkNodeId(link.source);
                const targetId = getLinkNodeId(link.target);
                const isRelevant = neighbors.has(sourceId) && neighbors.has(targetId);
                if (isStarry) return isRelevant ? "rgba(0, 240, 255, 0.9)" : "rgba(255, 255, 255, 0.06)";
                return isRelevant ? "#0011FF" : "rgba(0, 0, 0, 0.08)";
              }}
              linkWidth={(link) => (neighbors.has(getLinkNodeId(link.source)) && neighbors.has(getLinkNodeId(link.target)) ? 2.5 : 1)}
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={nodePointerAreaPaint}
              onNodeHover={(node) => setHoverNode(node ?? null)}
              onNodeClick={(node) => {
                setSelectedNode(node);
                fullScreenGraphRef.current?.centerAt(node.x, node.y, 500);
              }}
            />
          )}
        </div>
        
        {/* 底部交互指引 */}
        <div className={cx(
          "absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 rounded-full border px-8 py-3 backdrop-blur-2xl",
          isStarry ? "border-white/5 bg-white/[0.03]" : "border-black/5 bg-black/[0.03]"
        )}>
          {[
            { label: "缩放", desc: "滚动鼠标" },
            { label: "移动", desc: "左键拖拽" },
            { label: "聚焦", desc: "点击节点" },
            { label: "退出", desc: "ESC 键" },
          ].map((item, i) => (
            <div key={i} className={cx(
              "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest",
              isStarry ? "text-white/50" : "text-[var(--text-secondary)]"
            )}>
              <span className="text-[var(--brand)]">{item.label}</span>
              <span className="opacity-40">{item.desc}</span>
              {i < 3 && <div className={cx("ml-2 h-1 w-1 rounded-full", isStarry ? "bg-white/10" : "bg-black/10")} />}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );

  const inspectorFields = activeNode
    ? [
        { label: "标签", value: activeNode.name },
        { label: "节点 ID", value: activeNode.id, mono: true },
        { label: "锚点 URI", value: activeNode.vikingUri || "viking://unmapped", mono: true, tone: "brand" as const },
      ]
    : undefined;

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="知识图谱拓扑"
        subtitle="图谱运行态 / 知识关系分布"
        actions={
          <>
            <ConsoleSelect
              value={selectedKb}
              onChange={(event) => {
                setSelectedKb(event.target.value);
                void loadGraph(event.target.value);
              }}
              className="min-w-[240px]"
            >
              {kbs.map((kb) => (
                <option key={kb.id} value={kb.id} className={isStarry ? "bg-[#1e293b] text-white" : "bg-white text-black"}>
                  {kb.name}
                </option>
              ))}
            </ConsoleSelect>
          </>
        }
      />

      <ConsoleStatsGrid className="lg:grid-cols-4">
        <ConsoleMetricCard label="节点数" value={(data?.nodes.length ?? 0).toLocaleString()} />
        <ConsoleMetricCard label="连线数" value={(data?.links.length ?? 0).toLocaleString()} tone="brand" />
        <ConsoleMetricCard label="图密度" value={density} tone="warning" />
        <ConsoleMetricCard
          label="焦点范围"
          value={activeNode ? String(neighbors.size).padStart(2, "0") : "00"}
          tone="danger"
        />
      </ConsoleStatsGrid>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.4fr_0.6fr]">
        <div 
          ref={containerRef}
          className="ov-card relative overflow-hidden min-h-[640px] bg-[var(--bg-card)]"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* 右上角操作按钮 */}
          <div className="absolute right-4 top-4 z-10 flex gap-2">
            <button
              type="button"
              onClick={() => graphRef.current?.zoomToFit(400, 80)}
              className="flex h-12 w-12 items-center justify-center bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--brand)] transition-all hover:scale-105 active:scale-95 shadow-sm rounded-2xl"
              title="重置视图位置"
            >
              <RotateCcw size={20} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              onClick={() => setIsFullScreen(true)}
              className="flex h-12 w-12 items-center justify-center bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--brand)] transition-all hover:scale-105 active:scale-95 shadow-sm rounded-2xl"
              title="全屏弹窗展示"
            >
              <Maximize2 size={20} strokeWidth={2.6} />
            </button>
          </div>

          {data ? (
            <ForceGraph2D
              ref={graphRef}
              graphData={data}
              width={containerSize.width}
              height={containerSize.height}
              backgroundColor="transparent"
              cooldownTicks={80}
              nodeRelSize={6}
              enableNodeDrag
              linkDirectionalParticles={isStarry ? 4 : 2}
              linkDirectionalParticleSpeed={0.006}
              linkDirectionalParticleWidth={isStarry ? 3 : 2}
              linkDirectionalParticleColor={() => isStarry ? "#00F0FF" : graphColors.particle}
              linkColor={(link) => {
                const sourceId = getLinkNodeId(link.source);
                const targetId = getLinkNodeId(link.target);
                const isRelevant = neighbors.has(sourceId) && neighbors.has(targetId);
                if (isStarry) return isRelevant ? "rgba(0, 240, 255, 0.8)" : "rgba(255, 255, 255, 0.08)";
                return isRelevant ? "rgba(0, 200, 83, 0.8)" : "rgba(0, 0, 0, 0.08)";
              }}
              linkWidth={(link) => {
                const sourceId = getLinkNodeId(link.source);
                const targetId = getLinkNodeId(link.target);
                const isRelevant = neighbors.has(sourceId) && neighbors.has(targetId);
                return isRelevant ? 2.5 : 1;
              }}
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={nodePointerAreaPaint}
              onNodeHover={(node) => setHoverNode(node ?? null)}
              onNodeClick={(node) => {
                setSelectedNode(node);
                graphRef.current?.centerAt(node.x, node.y, 300);
              }}
              onBackgroundClick={() => setSelectedNode(null)}
            />
          ) : (
            <ConsoleEmptyState
              icon={Network}
              title={loading ? "正在装载图谱..." : "暂无可渲染图谱"}
              description="请先选择知识库，或先导入知识数据后再查看图谱。"
              className="flex h-full min-h-[640px] items-center justify-center"
            />
          )}
        </div>

        <div className="flex flex-col gap-8">
          <ConsoleInspectorStack
            eyebrow="节点检查器"
            fields={inspectorFields}
            action={
              activeNode
                ? {
                    label: "回到知识树",
                    onClick: () =>
                      router.push(
                        `/console/knowledge-tree?kbId=${selectedKb}&nodeId=${encodeURIComponent(activeNode.id)}`,
                      ),
                  }
                : undefined
            }
            emptyState={
              !activeNode
                ? { icon: Box, title: "尚未选中节点", description: "请悬停或点击节点后查看详细信息。" }
                : undefined
            }
          />
        </div>
      </section>

      {fullScreenContent}
    </div>
  );
}
