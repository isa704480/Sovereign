import React, { useState } from "react";

function Node({ node, depth, onOpen, activePath }) {
  const [open, setOpen] = useState(depth < 1);
  const pad = { paddingLeft: 8 + depth * 12 };
  if (node.dir) {
    return (
      <div>
        <button className="tnode dir" style={pad} onClick={() => setOpen((o) => !o)}>
          <span className="caret">{open ? "▾" : "▸"}</span>
          <span className="tname">{node.name}</span>
        </button>
        {open && node.children?.map((c) => <Node key={c.path} node={c} depth={depth + 1} onOpen={onOpen} activePath={activePath} />)}
      </div>
    );
  }
  return (
    <button
      className={`tnode file ${activePath === node.path ? "active" : ""}`}
      style={pad}
      onClick={() => onOpen(node)}
      title={node.name}
    >
      <span className="tdot">•</span>
      <span className="tname">{node.name}</span>
    </button>
  );
}

export default function FileTree({ nodes, onOpen, activePath }) {
  if (!nodes?.length) return <div className="tempty dim">Papka bo‘sh yoki tanlanmagan</div>;
  return (
    <div className="ftree">
      {nodes.map((n) => (
        <Node key={n.path} node={n} depth={0} onOpen={onOpen} activePath={activePath} />
      ))}
    </div>
  );
}
