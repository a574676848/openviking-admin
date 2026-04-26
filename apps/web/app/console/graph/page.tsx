"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ForceGraph2D, { type ForceGraphLink, type ForceGraphNode } from "react-force-graph-2d";
import { Box, Crosshair, Network, Radar, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsoleInspectorStack,
  ConsoleSurfaceCard,
  ConsoleTelemetryPanel,
  ConsoleStatsGrid,
} from "@/components/console/primitives";

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
  const router = useRouter();
  const graphRef = useRef<ForceGraph2D<GraphNode, GraphLink>>(null);

  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState("");
  const [data, setData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);

  const activeNode = hoverNode ?? selectedNode;

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
        if (list[0]) {
          setSelectedKb(list[0].id);
          void loadGraph(list[0].id);
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
  }, [loadGraph]);

  const density = data && data.nodes.length > 0 ? (data.links.length / data.nodes.length).toFixed(2) : "0.00";

  const graphColors = readGraphColors();

  const inspectorFields = activeNode
    ? [
        { label: "Label", value: activeNode.name },
        { label: "Node ID", value: activeNode.id, mono: true },
        { label: "Anchor URI", value: activeNode.vikingUri || "viking://unmapped", mono: true, tone: "brand" as const },
      ]
    : undefined;

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="知识图谱拓扑"
        subtitle="图谱运行态 / 知识关系分布"
        actions={
          <>
            <select
            value={selectedKb}
            onChange={(event) => {
              setSelectedKb(event.target.value);
              void loadGraph(event.target.value);
            }}
            className="ov-input min-w-[240px] px-4 py-3 font-mono text-sm font-black"
          >
            {kbs.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name}
              </option>
            ))}
            </select>
            <ConsoleButton type="button" onClick={() => graphRef.current?.zoomToFit(400, 80)}>
              <Crosshair size={14} strokeWidth={2.6} />
              重置视图
            </ConsoleButton>
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

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <ConsolePanel className="relative min-h-[640px] overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {data ? (
            <ForceGraph2D
              ref={graphRef}
              graphData={data}
              backgroundColor="transparent"
              cooldownTicks={80}
              nodeRelSize={6}
              enableNodeDrag
              linkDirectionalParticles={2}
              linkDirectionalParticleSpeed={0.006}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticleColor={() => graphColors.particle}
              linkColor={(link) => {
                const sourceId = getLinkNodeId(link.source);
                const targetId = getLinkNodeId(link.target);
                return neighbors.has(sourceId) && neighbors.has(targetId) ? graphColors.linkActive : graphColors.linkMuted;
              }}
              linkWidth={(link) => {
                const sourceId = getLinkNodeId(link.source);
                const targetId = getLinkNodeId(link.target);
                return neighbors.has(sourceId) && neighbors.has(targetId) ? 2 : 1;
              }}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const label = node.name;
                const fontSize = 12 / globalScale;
                ctx.font = `${fontSize}px Geist Mono, monospace`;
                const textWidth = ctx.measureText(label).width;
                const dimensions = [textWidth + fontSize * 0.7, fontSize + fontSize * 0.7] as [number, number];
                const isActive = activeNode?.id === node.id;
                const isNeighbor = neighbors.has(node.id);

                ctx.fillStyle = isActive ? graphColors.nodeActive : isNeighbor ? graphColors.nodeNeighbor : graphColors.nodeDefault;
                ctx.fillRect(node.x - dimensions[0] / 2, node.y - dimensions[1] / 2, dimensions[0], dimensions[1]);

                ctx.lineWidth = 2 / globalScale;
                ctx.strokeStyle = graphColors.stroke;
                ctx.strokeRect(node.x - dimensions[0] / 2, node.y - dimensions[1] / 2, dimensions[0], dimensions[1]);

                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = graphColors.text;
                ctx.fillText(label, node.x, node.y);

                node.__bckgDimensions = dimensions;
              }}
              nodePointerAreaPaint={(node, color, ctx) => {
                const dimensions = node.__bckgDimensions;
                if (!dimensions) {
                  return;
                }
                ctx.fillStyle = color;
                ctx.fillRect(node.x - dimensions[0] / 2, node.y - dimensions[1] / 2, dimensions[0], dimensions[1]);
              }}
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

          <ConsoleSurfaceCard
            tone="inverse"
            className="absolute bottom-4 left-4 flex items-center gap-3 px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.16em] shadow-[4px_4px_0px_var(--brand)]"
          >
            {loading ? <RefreshCw size={12} strokeWidth={2.6} className="animate-spin" /> : <Radar size={12} strokeWidth={2.6} />}
            {loading ? "图谱渲染中" : "图谱在线"}
          </ConsoleSurfaceCard>
        </ConsolePanel>

        <div className="flex flex-col gap-8">
          <ConsoleInspectorStack
            eyebrow="节点检查器"
            title="节点详情与跳转"
            fields={inspectorFields}
            action={
              activeNode
                ? {
                    label: "进入知识树定位",
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

          <ConsoleTelemetryPanel
            eyebrow="图谱规则"
            rules={[
              { text: "黄底节点 = 当前焦点" },
              { text: "黑线 = 焦点邻接关系" },
              { text: "蓝色粒子 = 关系方向流" },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
