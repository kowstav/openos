"use client";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Blueprint } from "@/lib/schemas";
export const capabilityId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "capability";
type BpWithIds = Omit<Blueprint, "capabilities"> & { capabilities: { name: string; description: string; id?: string }[] };
export default function CapabilityGraph({ bp, selected = [], onToggle }: { bp: BpWithIds; selected?: string[]; onToggle?: (id: string) => void }) {
  const nodes: Node[] = []; const edges: Edge[] = [];
  const style = { background: "#fffdf6", color: "#1c1a14", border: "1.5px solid #1c1a14", borderRadius: 8, fontSize: 12, padding: 8 };
  nodes.push({ id: "core", position: { x: 320, y: 150 }, data: { label: bp.purpose.slice(0, 80) }, style: { ...style, background: "#d9e021", color: "#1c1a14", fontWeight: 700 } });
  bp.inputs.slice(0, 4).forEach((v, i) => { nodes.push({ id: `in${i}`, position: { x: 0, y: 40 + i * 80 }, data: { label: `↓ ${v}` }, style }); edges.push({ id: `e-in${i}`, source: `in${i}`, target: "core" }); });
  bp.capabilities.slice(0, 6).forEach((c, i) => { const cid = c.id || capabilityId(c.name); const on = selected.includes(cid); nodes.push({ id: `cap${i}`, position: { x: 300, y: -90 + i * 62 }, data: { label: `${on ? "✓ " : ""}${c.name}` }, style: on ? { ...style, border: "2.5px solid #1c1a14", background: "#eef3c8" } : style }); edges.push({ id: `e-cap${i}`, source: "core", target: `cap${i}` }); });
  bp.outputs.slice(0, 4).forEach((v, i) => { nodes.push({ id: `out${i}`, position: { x: 620, y: 40 + i * 80 }, data: { label: `↑ ${v}` }, style }); edges.push({ id: `e-out${i}`, source: "core", target: `out${i}` }); });
  bp.permissions.slice(0, 3).forEach((v, i) => { nodes.push({ id: `perm${i}`, position: { x: 300, y: 310 + i * 55 }, data: { label: `🔒 ${v}` }, style: { ...style, borderColor: "#7a2e2e" } }); edges.push({ id: `e-p${i}`, source: "core", target: `perm${i}` }); });
  return (<div>
    <div className="h-[440px] overflow-hidden rounded-lg border border-[#1c1a14] bg-[#fffdf6]" role="img" aria-label="Capability graph: inputs flow into the library, capabilities and outputs flow out"><ReactFlow nodes={nodes} edges={edges} fitView colorMode="light" onNodeClick={(_, n) => { if (n.id.startsWith("cap")) { const idx = Number(n.id.slice(3)); const cap = bp.capabilities[idx]; if (cap) onToggle?.(cap.id || capabilityId(cap.name)); } }}><Background /><Controls /></ReactFlow></div>
    <p className="mt-2 text-xs text-[#5c5747]">{onToggle ? "Click a capability node to include or exclude it from your app. Selected capabilities shape the generated workflow." : "Inputs → library → capabilities → outputs. Locks show required permissions."}</p>
    {selected.length > 0 && <p className="mt-1 text-xs text-[#1c1a14] font-semibold">In your app: {selected.join(" · ")}</p>}
  </div>);
}
