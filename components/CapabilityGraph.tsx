"use client";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Blueprint } from "@/lib/schemas";
export default function CapabilityGraph({ bp }: { bp: Blueprint }) {
  const nodes: Node[] = []; const edges: Edge[] = [];
  const style = { background: "#17171a", color: "#ececec", border: "1px solid #333", borderRadius: 10, fontSize: 12, padding: 8 };
  nodes.push({ id: "core", position: { x: 320, y: 150 }, data: { label: bp.purpose.slice(0, 80) }, style: { ...style, background: "#e8ff47", color: "#111", fontWeight: 700 } });
  bp.inputs.slice(0, 4).forEach((v, i) => { nodes.push({ id: `in${i}`, position: { x: 0, y: 40 + i * 80 }, data: { label: `⬇ ${v}` }, style }); edges.push({ id: `e-in${i}`, source: `in${i}`, target: "core" }); });
  bp.capabilities.slice(0, 5).forEach((c, i) => { nodes.push({ id: `cap${i}`, position: { x: 300, y: -90 + i * 62 }, data: { label: c.name }, style }); edges.push({ id: `e-cap${i}`, source: "core", target: `cap${i}` }); });
  bp.outputs.slice(0, 4).forEach((v, i) => { nodes.push({ id: `out${i}`, position: { x: 620, y: 40 + i * 80 }, data: { label: `⬆ ${v}` }, style }); edges.push({ id: `e-out${i}`, source: "core", target: `out${i}` }); });
  bp.permissions.slice(0, 3).forEach((v, i) => { nodes.push({ id: `perm${i}`, position: { x: 300, y: 300 + i * 55 }, data: { label: `🔒 ${v}` }, style: { ...style, borderColor: "#7a2e2e" } }); edges.push({ id: `e-p${i}`, source: "core", target: `perm${i}` }); });
  return <div className="h-[420px] overflow-hidden rounded-xl border border-white/10 bg-[#111113]" role="img" aria-label="Capability graph: inputs flow into the library, capabilities and outputs flow out"><ReactFlow nodes={nodes} edges={edges} fitView colorMode="dark"><Background /><Controls /></ReactFlow></div>;
}
