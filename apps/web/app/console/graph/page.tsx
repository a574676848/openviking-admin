"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ForceGraph2D, { type ForceGraphLink, type ForceGraphNode } from "react-force-graph-2d";
import { ArrowRight, Box, Crosshair, Network, Radar, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
} from "@/components/console/primitives";

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

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="知识图谱拓扑"
        subtitle="Graph Runtime / Knowledge Relation Map"
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

      <section className="grid grid-cols-1 gap-[var(--border-width)] border-[var(--border-width)] border-[var(--border)] bg-[var(--border)] lg:grid-cols-4">
        <ConsoleMetricCard label="Nodes" value={(data?.nodes.length ?? 0).toLocaleString()} />
        <ConsoleMetricCard label="Links" value={(data?.links.length ?? 0).toLocaleString()} tone="brand" />
        <ConsoleMetricCard label="Density" value={density} tone="warning" />
        <ConsoleMetricCard
          label="Focused"
          value={activeNode ? String(neighbors.size).padStart(2, "0") : "00"}
          tone="danger"
        />
      </section>

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
              linkDirectionalParticleColor={() => "#0011FF"}
              linkColor={(link) => {
                const sourceId = getLinkNodeId(link.source);
                const targetId = getLinkNodeId(link.target);
                return neighbors.has(sourceId) && neighbors.has(targetId) ? "#000" : "rgba(0,0,0,0.12)";
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

                ctx.fillStyle = isActive ? "#FFE600" : isNeighbor ? "#FFFFFF" : "rgba(255,255,255,0.88)";
                ctx.fillRect(node.x - dimensions[0] / 2, node.y - dimensions[1] / 2, dimensions[0], dimensions[1]);

                ctx.lineWidth = 2 / globalScale;
                ctx.strokeStyle = "#000";
                ctx.strokeRect(node.x - dimensions[0] / 2, node.y - dimensions[1] / 2, dimensions[0], dimensions[1]);

                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#000";
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
              description="select a knowledge base or ingest data first"
              className="flex h-full min-h-[640px] items-center justify-center"
            />
          )}

          <div className="absolute bottom-4 left-4 flex items-center gap-3 border-[3px] border-[var(--border)] bg-black px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-[4px_4px_0px_var(--brand)]">
            {loading ? <RefreshCw size={12} strokeWidth={2.6} className="animate-spin" /> : <Radar size={12} strokeWidth={2.6} />}
            {loading ? "rendering graph" : "graph online"}
          </div>
        </ConsolePanel>

        <div className="flex flex-col gap-8">
          <ConsolePanel className="p-6">
            <ConsolePanelHeader eyebrow="Node Inspector" title="节点详情与跳转" />
            {activeNode ? (
              <div className="mt-6 space-y-4">
                <div className="border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-5">
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Label
                  </p>
                  <p className="mt-3 break-all font-sans text-3xl font-black text-[var(--text-primary)]">{activeNode.name}</p>
                </div>
                <div className="border-[3px] border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Node ID
                  </p>
                  <p className="mt-3 break-all font-mono text-xs font-bold text-[var(--text-secondary)]">{activeNode.id}</p>
                </div>
                <div className="border-[3px] border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Anchor URI
                  </p>
                  <p className="mt-3 break-all font-mono text-xs font-bold text-[var(--brand)]">
                    {activeNode.vikingUri || "viking://unmapped"}
                  </p>
                </div>
                <ConsoleButton
                  type="button"
                  onClick={() =>
                    router.push(`/console/knowledge-tree?kbId=${selectedKb}&nodeId=${encodeURIComponent(activeNode.id)}`)
                  }
                  className="w-full justify-center py-4"
                >
                  进入知识树定位
                  <ArrowRight size={14} strokeWidth={2.6} />
                </ConsoleButton>
              </div>
            ) : (
              <ConsoleEmptyState icon={Box} title="尚未选中节点" description="hover or click a node to inspect it" className="mt-6 py-10" />
            )}
          </ConsolePanel>

          <ConsolePanel className="p-6">
            <ConsolePanelHeader eyebrow="Graph Rules" />
            <div className="mt-6 space-y-4 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              <p>黄底节点 = 当前焦点</p>
              <p>黑线 = 焦点邻接关系</p>
              <p>蓝色粒子 = 关系方向流</p>
            </div>
          </ConsolePanel>
        </div>
      </section>
    </div>
  );
}
