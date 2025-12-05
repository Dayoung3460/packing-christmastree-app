import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, Play, Zap, Move, ChevronUp, ChevronDown, RefreshCw, Shield, RotateCw, Plus, Minus, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Lock, Unlock
} from 'lucide-react';

// --- GEOMETRY ENGINE ---

const DEG_TO_RAD = Math.PI / 180;
const TREE_VERTICES = [
  { x: 0.0, y: 0.8 },      { x: 0.125, y: 0.5 },    { x: 0.0625, y: 0.5 },
  { x: 0.2, y: 0.25 },     { x: 0.1, y: 0.25 },     { x: 0.35, y: 0.0 },
  { x: 0.075, y: 0.0 },    { x: 0.075, y: -0.2 },   { x: -0.075, y: -0.2 },
  { x: -0.075, y: 0.0 },   { x: -0.35, y: 0.0 },    { x: -0.1, y: 0.25 },
  { x: -0.2, y: 0.25 },    { x: -0.0625, y: 0.5 },  { x: -0.125, y: 0.5 }
];

type Point = { x: number; y: number };
type Tree = { id: number; x: number; y: number; deg: number; colorHue: number; colorSat: number; colorLight: number };

// Generator for Random Start
const generateRandomTrees = (count: number): Tree[] => {
    const spread = Math.sqrt(count) * 0.8; 
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        x: (Math.random() - 0.5) * spread,
        y: (Math.random() - 0.5) * spread,
        deg: Math.random() * 360,
        colorHue: 120 + Math.random() * 40,
        colorSat: 60 + Math.random() * 30,
        colorLight: 25 + Math.random() * 20
    }));
};

// --- MATH HELPERS ---
const transformPoint = (p: Point, cx: number, cy: number, angleDeg: number): Point => {
  const rad = angleDeg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: cx + (p.x * cos - p.y * sin), y: cy + (p.x * sin + p.y * cos) };
};

const getTreePolygon = (tree: Tree): Point[] => 
  TREE_VERTICES.map(p => transformPoint(p, tree.x, tree.y, tree.deg));

const isPointInPoly = (p: Point, poly: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const intersect = ((poly[i].y > p.y) !== (poly[j].y > p.y)) &&
      (p.x < (poly[j].x - poly[i].x) * (p.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x);
    if (intersect) inside = !inside;
  }
  return inside;
};

const doLinesIntersect = (p1: Point, p2: Point, p3: Point, p4: Point): boolean => {
  const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
  if (det === 0) return false;
  const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
  const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;
  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
};

const checkOverlap = (poly1: Point[], poly2: Point[]): boolean => {
  for (const p of poly1) if (isPointInPoly(p, poly2)) return true;
  for (const p of poly2) if (isPointInPoly(p, poly1)) return true;
  for (let i = 0; i < poly1.length; i++) {
    for (let j = 0; j < poly2.length; j++) {
      if (doLinesIntersect(poly1[i], poly1[(i+1)%poly1.length], poly2[j], poly2[(j+1)%poly2.length])) return true;
    }
  }
  return false;
};

// Returns a SQUARE box
const getBoundingBox = (polys: Point[][]) => {
  if (polys.length === 0) return { size: 0, cx:0, cy:0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  polys.forEach(poly => poly.forEach(p => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }));
  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.max(width, height);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { size, cx, cy };
};

// --- OPTIMIZATION STRATEGIES ---

const STRATEGIES = {
    ANNEALING: {
        id: 'ANNEALING', name: 'Anneal', paramName: 'Iter', defaultParam: 50,
        run: (trees: Tree[], param: number) => {
            let current = JSON.parse(JSON.stringify(trees));
            let best = JSON.parse(JSON.stringify(trees));
            let bestScore = getBoundingBox(current.map(getTreePolygon)).size;
            
            for(let i=0; i<param; i++) {
                const idx = Math.floor(Math.random()*current.length);
                const original = current[idx];
                current[idx] = { 
                    ...original, 
                    x: original.x + (Math.random()-0.5)*0.1, 
                    y: original.y + (Math.random()-0.5)*0.1,
                    deg: original.deg + (Math.random()-0.5)*5
                };
                
                const polys = current.map(getTreePolygon);
                let col = false;
                for(let k=0; k<polys.length; k++) {
                    if(k!==idx && checkOverlap(polys[idx], polys[k])) { col = true; break; }
                }

                if(!col) {
                    const sc = getBoundingBox(polys).size;
                    if(sc < bestScore) { bestScore = sc; best = JSON.parse(JSON.stringify(current)); }
                } else {
                    current[idx] = original; 
                }
            }
            return best;
        }
    },
    GENETIC: {
        id: 'GENETIC', name: 'Evo', paramName: 'Pop', defaultParam: 10,
        run: (trees: Tree[], param: number) => {
            let bestPop = [...trees];
            let bestScore = getBoundingBox(trees.map(getTreePolygon)).size;

            for(let p=0; p<param; p++) {
                const mutant = trees.map(t => ({
                    ...t,
                    x: t.x + (Math.random()-0.5)*0.1,
                    y: t.y + (Math.random()-0.5)*0.1,
                    deg: t.deg + (Math.random()-0.5)*2
                }));
                const polys = mutant.map(getTreePolygon);
                let valid = true;
                for(let i=0; i<polys.length; i++) {
                    for(let j=i+1; j<polys.length; j++) {
                        if(checkOverlap(polys[i], polys[j])) { valid = false; break; }
                    }
                    if(!valid) break;
                }
                if(valid) {
                    const sc = getBoundingBox(polys).size;
                    if(sc < bestScore) { bestScore = sc; bestPop = mutant; }
                }
            }
            return bestPop;
        }
    },
    PHYSICS: {
        id: 'PHYSICS', name: 'Repel', paramName: 'Force', defaultParam: 0.05,
        run: (trees: Tree[], param: number) => {
            const next = trees.map(t => ({...t}));
            const polys = next.map(getTreePolygon);
            for(let i=0; i<next.length; i++) {
                for(let j=i+1; j<next.length; j++) {
                    if(checkOverlap(polys[i], polys[j])) {
                        const dx = next[i].x - next[j].x;
                        const dy = next[i].y - next[j].y;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 0.01;
                        const pushX = (dx/dist) * param;
                        const pushY = (dy/dist) * param;
                        next[i].x += pushX; next[i].y += pushY;
                        next[j].x -= pushX; next[j].y -= pushY;
                    }
                }
            }
            return next;
        }
    },
    GRAVITY: {
        id: 'GRAVITY', name: 'Crush', paramName: 'Str', defaultParam: 0.02,
        run: (trees: Tree[], param: number) => {
            const next = trees.map(t => ({...t}));
            const polys = trees.map(getTreePolygon);
            const {cx, cy} = getBoundingBox(polys);
            next.forEach(t => {
                t.x += (cx - t.x) * param;
                t.y += (cy - t.y) * param;
            });
            return next;
        }
    }
};

// --- COMPONENT ---

export default function SantaWorkbenchMobileV10() {
  const [treeCount, setTreeCount] = useState(10);
  const [trees, setTrees] = useState<Tree[]>(() => generateRandomTrees(10));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [scale, setScale] = useState(100); 
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [selectedStrategy, setSelectedStrategy] = useState<keyof typeof STRATEGIES>('ANNEALING');
  const [strategyParam, setStrategyParam] = useState(STRATEGIES['ANNEALING'].defaultParam);
  const [isComputing, setIsComputing] = useState(false);
  const [isNoOverlapMode, setIsNoOverlapMode] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Computed Values
  const treePolygons = useMemo(() => trees.map(t => ({ id: t.id, poly: getTreePolygon(t) })), [trees]);
  const boundingBox = useMemo(() => getBoundingBox(treePolygons.map(tp => tp.poly)), [treePolygons]);
  const targetSide = useMemo(() => Math.sqrt(0.35 * trees.length), [trees.length]);

  const collisions = useMemo(() => {
    const colSet = new Set<number>();
    for (let i = 0; i < treePolygons.length; i++) {
      for (let j = i + 1; j < treePolygons.length; j++) {
        if (checkOverlap(treePolygons[i].poly, treePolygons[j].poly)) {
          colSet.add(treePolygons[i].id);
          colSet.add(treePolygons[j].id);
        }
      }
    }
    return colSet;
  }, [treePolygons]);

  const currentScore = useMemo(() => {
    if (trees.length === 0) return 0;
    return (boundingBox.size ** 2) / trees.length;
  }, [boundingBox.size, trees.length]);

  // --- INTERACTION STATE ---
  const [isDragging, setIsDragging] = useState(false);

  // --- AUTO ZOOM LOGIC ---
  const autoZoom = () => {
    if (canvasRef.current && boundingBox.size > 0) {
        const { clientWidth, clientHeight } = canvasRef.current;
        const minDim = Math.min(clientWidth, clientHeight);
        const paddingFactor = 0.8; // 80% of screen
        const newScale = (minDim * paddingFactor) / boundingBox.size;
        
        // Center view on bounding box
        const newPanX = clientWidth/2 - (boundingBox.cx * newScale);
        const newPanY = clientHeight/2 + (boundingBox.cy * newScale); // Y inverted

        setScale(newScale);
        setPan({ x: newPanX, y: newPanY });
    }
  };

  // Trigger AutoZoom: On Mount, On Tree Count Change, On Strategy Run, On Drag End
  useEffect(() => {
    if (!isDragging) {
        // Debounce slightly to allow state to settle
        const timer = setTimeout(autoZoom, 50);
        return () => clearTimeout(timer);
    }
  }, [treeCount, trees.length, isDragging, boundingBox.size]); 

  // Handlers
  const handleTreeCountChange = (delta: number) => {
    const newCount = Math.max(1, Math.min(50, treeCount + delta));
    if (newCount !== treeCount) {
        setTreeCount(newCount);
        setTrees(generateRandomTrees(newCount));
        setSelectedId(null);
    }
  };

  const reset = () => {
    setTrees(generateRandomTrees(treeCount));
  };

  const handleStrategyRun = () => {
    setIsComputing(true);
    setTimeout(() => {
        const strategy = STRATEGIES[selectedStrategy];
        const newTrees = strategy.run(trees, strategyParam);
        setTrees(newTrees);
        setIsComputing(false);
    }, 50);
  };

  const updateTree = (id: number, updates: Partial<Tree>) => setTrees(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));

  // --- INTERACTION LOGIC ---
  const pointers = useRef<Map<number, {x: number, y: number}>>(new Map());
  const interactionMode = useRef<'NONE' | 'PAN' | 'DRAG' | 'ROTATE'>('NONE');
  const initialData = useRef<{
    panX: number, panY: number, 
    treeX: number, treeY: number, treeDeg: number,
    angle: number, 
  }>({ panX: 0, panY: 0, treeX: 0, treeY: 0, treeDeg: 0, angle: 0 });

  const getPointerPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if(!rect) return { x: e.clientX, y: e.clientY };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getAngle = (p1: {x:number, y:number}, p2: {x:number, y:number}) => Math.atan2(p2.y - p1.y, p2.x - p1.x);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = getPointerPos(e);
    pointers.current.set(e.pointerId, pos);
    
    // Hit Test
    const worldX = (pos.x - pan.x) / scale;
    const worldY = -(pos.y - pan.y) / scale; 

    let hitId: number | null = null;
    let minDist = 0.5; 
    
    trees.forEach(t => {
        const d = Math.sqrt(Math.pow(t.x - worldX, 2) + Math.pow(t.y - worldY, 2));
        if (d < minDist) {
            minDist = d;
            hitId = t.id;
        }
    });

    if (pointers.current.size === 1) {
        if (hitId !== null) {
            setSelectedId(hitId);
            interactionMode.current = 'DRAG';
            setIsDragging(true); // Start drag tracking
            const t = trees.find(x => x.id === hitId)!;
            initialData.current = { ...initialData.current, treeX: t.x, treeY: t.y };
        } else {
            if(selectedId) setSelectedId(null);
            interactionMode.current = 'PAN';
            initialData.current = { ...initialData.current, panX: pan.x, panY: pan.y };
        }
    } else if (pointers.current.size === 2) {
        interactionMode.current = 'ROTATE';
        const pts = Array.from(pointers.current.values());
        const angle = getAngle(pts[0], pts[1]);
        if (selectedId) {
            const t = trees.find(x => x.id === selectedId)!;
            initialData.current = { ...initialData.current, angle: angle, treeDeg: t.deg };
        }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const pos = getPointerPos(e);
    pointers.current.set(e.pointerId, pos);
    const pts = Array.from(pointers.current.values());

    if (interactionMode.current === 'DRAG' && pts.length === 1 && selectedId) {
        const dx = e.movementX / scale;
        const dy = -e.movementY / scale; 

        setTrees(prev => {
            const t = prev.find(tr => tr.id === selectedId);
            if (!t) return prev;

            let nextX = t.x + dx;
            let nextY = t.y + dy;

            if (isNoOverlapMode) {
                const candFull = { ...t, x: nextX, y: nextY };
                const polyFull = getTreePolygon(candFull);
                let collidesFull = false;
                const otherPolys = prev.filter(pt => pt.id !== selectedId).map(getTreePolygon);

                for (const other of otherPolys) {
                    if (checkOverlap(polyFull, other)) { collidesFull = true; break; }
                }

                if (!collidesFull) {
                    return prev.map(tr => tr.id === selectedId ? candFull : tr);
                } else {
                    const candX = { ...t, x: nextX, y: t.y };
                    const polyX = getTreePolygon(candX);
                    let collidesX = false;
                    for (const other of otherPolys) {
                        if (checkOverlap(polyX, other)) { collidesX = true; break; }
                    }

                    if (!collidesX) {
                         return prev.map(tr => tr.id === selectedId ? candX : tr);
                    } else {
                        const candY = { ...t, x: t.x, y: nextY };
                        const polyY = getTreePolygon(candY);
                        let collidesY = false;
                        for (const other of otherPolys) {
                            if (checkOverlap(polyY, other)) { collidesY = true; break; }
                        }
                        if(!collidesY) {
                            return prev.map(tr => tr.id === selectedId ? candY : tr);
                        }
                    }
                    return prev;
                }
            } else {
                return prev.map(tr => tr.id === selectedId ? { ...tr, x: nextX, y: nextY } : tr);
            }
        });

    } else if (interactionMode.current === 'PAN' && pts.length === 1) {
        setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
        
    } else if (interactionMode.current === 'ROTATE' && pts.length === 2 && selectedId) {
        const currentAngle = getAngle(pts[0], pts[1]);
        const deltaAngle = currentAngle - initialData.current.angle;
        updateTree(selectedId, { deg: initialData.current.treeDeg - deltaAngle * (180/Math.PI) });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (pointers.current.size === 0) {
        interactionMode.current = 'NONE';
        setIsDragging(false); // End drag, allow auto-zoom to settle
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (selectedId !== null) {
        const dir = e.deltaY > 0 ? 1 : -1;
        const currentDeg = trees.find(t => t.id === selectedId)?.deg || 0;
        updateTree(selectedId, { deg: currentDeg + dir * 5 });
    } else {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        setScale(s => Math.max(20, Math.min(500, s * factor)));
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-200 overflow-hidden select-none font-sans touch-none">
      
      {/* 1. HEADER (Stats) */}
      <div className="flex-none bg-slate-800 border-b border-slate-700 px-4 py-2 z-20 flex justify-between items-center shadow-lg h-14">
        {/* Tree Count */}
        <div className="flex flex-col">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Count</div>
            <div className="flex items-center gap-1">
                <button onClick={() => handleTreeCountChange(-1)} className="p-1 bg-slate-700 rounded hover:bg-slate-600 active:bg-slate-500">
                    <Minus size={12} />
                </button>
                <span className="font-mono font-bold text-white w-6 text-center">{treeCount}</span>
                <button onClick={() => handleTreeCountChange(1)} className="p-1 bg-slate-700 rounded hover:bg-slate-600 active:bg-slate-500">
                    <Plus size={12} />
                </button>
            </div>
        </div>

        {/* Score */}
        <div className="text-center">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Score</div>
             <div className="text-lg font-mono font-bold leading-none text-blue-400">
                {currentScore.toFixed(3)}
            </div>
        </div>

        {/* Errors/Reset */}
        <div className="flex items-center gap-3">
             <button onClick={reset} className="p-2 bg-slate-700 rounded-full hover:bg-slate-600">
                <RefreshCw size={14} className="text-slate-300" />
            </button>
            <div className="text-right">
                 <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-right">Errors</div>
                 <div className={`text-lg font-mono font-bold leading-none text-right ${collisions.size === 0 ? 'text-slate-600' : 'text-rose-500'}`}>
                    {collisions.size}
                 </div>
            </div>
        </div>
      </div>

      {/* 2. PERSISTENT EDIT TOOLBAR (Always On) */}
      <div className="flex-none bg-slate-800/80 backdrop-blur-sm border-b border-slate-700 px-2 py-2 z-20 h-14 flex items-center gap-2 overflow-x-auto no-scrollbar">
         {/* No Overlap Toggle */}
         <button 
            onClick={() => setIsNoOverlapMode(!isNoOverlapMode)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-all shrink-0 ${isNoOverlapMode ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/50' : 'bg-slate-700 border-slate-600 text-slate-400'}`}
        >
            <Shield size={14} fill={isNoOverlapMode ? "currentColor" : "none"} />
            <span className="text-[10px] font-bold uppercase">{isNoOverlapMode ? "Physics ON" : "Physics OFF"}</span>
        </button>

        {selectedId ? (
            <>
                <div className="w-px h-8 bg-slate-700 mx-1 shrink-0" />
                
                {/* Nudge X */}
                <div className="flex items-center bg-slate-700 rounded border border-slate-600 px-1 gap-1 h-9 shrink-0">
                    <button onClick={() => updateTree(selectedId, { x: trees.find(t=>t.id===selectedId)!.x - 0.05 })} className="p-1 hover:bg-slate-600 rounded"><ArrowLeft size={12} /></button>
                    <div className="flex flex-col w-8 items-center">
                        <span className="text-[6px] text-slate-400 font-bold">X</span>
                        <span className="text-[10px] font-mono leading-none">{trees.find(t => t.id === selectedId)?.x.toFixed(1)}</span>
                    </div>
                    <button onClick={() => updateTree(selectedId, { x: trees.find(t=>t.id===selectedId)!.x + 0.05 })} className="p-1 hover:bg-slate-600 rounded"><ArrowRight size={12} /></button>
                </div>

                {/* Nudge Y */}
                <div className="flex items-center bg-slate-700 rounded border border-slate-600 px-1 gap-1 h-9 shrink-0">
                    <button onClick={() => updateTree(selectedId, { y: trees.find(t=>t.id===selectedId)!.y + 0.05 })} className="p-1 hover:bg-slate-600 rounded"><ArrowDown size={12} /></button>
                    <div className="flex flex-col w-8 items-center">
                        <span className="text-[6px] text-slate-400 font-bold">Y</span>
                        <span className="text-[10px] font-mono leading-none">{trees.find(t => t.id === selectedId)?.y.toFixed(1)}</span>
                    </div>
                    <button onClick={() => updateTree(selectedId, { y: trees.find(t=>t.id===selectedId)!.y - 0.05 })} className="p-1 hover:bg-slate-600 rounded"><ArrowUp size={12} /></button>
                </div>

                {/* Rotation */}
                <div className="flex items-center gap-1 h-9 bg-slate-700 rounded border border-slate-600 px-2 flex-1 min-w-[80px]">
                    <RotateCw size={12} className="text-slate-400 shrink-0" />
                    <input type="range" min="0" max="360" 
                        value={Math.round(trees.find(t => t.id === selectedId)?.deg || 0)} 
                        onChange={(e) => updateTree(selectedId, { deg: parseFloat(e.target.value) })}
                        className="flex-1 h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                </div>
            </>
        ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic">
                Tap a tree to edit
            </div>
        )}
      </div>

      {/* 3. CANVAS */}
      <div ref={canvasRef} className="flex-1 relative bg-[#15161c] overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
            backgroundImage: `linear-gradient(#444 1px, transparent 1px), linear-gradient(90deg, #444 1px, transparent 1px)`,
            backgroundSize: `${scale}px ${scale}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
        }}/>
        <div className="absolute h-px w-full bg-slate-700 pointer-events-none" style={{ top: pan.y }}/>
        <div className="absolute w-px h-full bg-slate-700 pointer-events-none" style={{ left: pan.x }}/>

        {treePolygons.map(({ id, poly }) => {
            const isSelected = id === selectedId;
            const isCollision = collisions.has(id);
            const tree = trees.find(t => t.id === id);
            const fill = isCollision 
                ? `hsl(${350 + (id*17)%20}, ${80 + (id*5)%20}%, ${50 + (id*3)%10}%)`
                : `hsl(${tree?.colorHue}, ${tree?.colorSat}%, ${tree?.colorLight}%)`;
            const stroke = isCollision 
                ? `hsl(0, 90%, 40%)` 
                : isSelected ? "#3b82f6" : `hsl(${tree?.colorHue}, ${tree?.colorSat}%, ${Math.max(10, (tree?.colorLight||30) - 15)}%)`;

            const pathData = "M " + poly.map(p => `${p.x * scale},${-p.y * scale}`).join(" L ") + " Z";
            return (
                <div key={id} className="absolute pointer-events-none" style={{ left: pan.x, top: pan.y }}>
                    <svg className="overflow-visible">
                        <path d={pathData} 
                            fill={fill}
                            fillOpacity={0.8}
                            stroke={stroke}
                            strokeWidth={isSelected ? 2 : 1}
                        />
                         {isSelected && <circle cx={poly[0].x * scale} cy={-poly[0].y * scale} r={4} fill="white" />}
                    </svg>
                </div>
            );
        })}
        
        {/* Dynamic Target Box */}
         <div className="absolute border-2 border-dashed border-blue-500/30 pointer-events-none"
            style={{ 
                left: pan.x, 
                top: pan.y - targetSide * scale, 
                width: targetSide * scale, 
                height: targetSide * scale 
            }} />
        
        {/* Actual Bounding Box */}
        {trees.length > 0 && (
            <div className="absolute border-2 border-yellow-400 pointer-events-none transition-all duration-100"
                style={{ 
                    left: pan.x + (boundingBox.cx - boundingBox.size/2) * scale, 
                    top: pan.y - (boundingBox.cy + boundingBox.size/2) * scale, 
                    width: boundingBox.size * scale, 
                    height: boundingBox.size * scale 
                }} />
        )}
      </div>

      {/* 4. BOTTOM DRAWER (LOGIC ONLY) */}
      <div className={`flex-none bg-slate-800 border-t border-slate-700 transition-all duration-300 flex flex-col z-30 shadow-2xl`}
           style={{ height: isMenuOpen ? '180px' : '40px' }}>
           
        {/* Handle */}
        <div 
            className="flex items-center justify-center h-[40px] bg-slate-800 shrink-0 border-b border-slate-700 cursor-pointer"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
            <div className="flex items-center gap-2 text-slate-400">
                <Zap size={14} />
                <span className="text-[10px] font-bold uppercase">Strategy / Logic</span>
                {isMenuOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-900">
            <div className="space-y-3">
                {/* Strategy Buttons */}
                <div className="grid grid-cols-4 gap-2">
                    {Object.values(STRATEGIES).map(strat => (
                        <button key={strat.id} onClick={() => { setSelectedStrategy(strat.id as any); setStrategyParam(strat.defaultParam); }}
                            className={`py-2 rounded text-[10px] font-bold text-center border transition-all truncate ${selectedStrategy === strat.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                            {strat.name}
                        </button>
                    ))}
                </div>

                {/* Parameter + Run */}
                <div className="flex items-center gap-2 h-10">
                    <div className="bg-slate-800/50 rounded p-2 border border-slate-700 flex-1 flex items-center gap-2">
                            <div className="flex flex-col min-w-[30px]">
                            <span className="text-[8px] text-slate-400 font-bold uppercase">{STRATEGIES[selectedStrategy].paramName}</span>
                            <span className="text-xs text-white font-mono leading-none">{strategyParam}</span>
                            </div>
                            <input type="range" 
                            min={selectedStrategy === 'GRAVITY' || selectedStrategy === 'PHYSICS' ? 0 : 0} 
                            max={selectedStrategy === 'GRAVITY' || selectedStrategy === 'PHYSICS' ? 1 : selectedStrategy === 'ANNEALING' ? 200 : 20} 
                            step={selectedStrategy === 'GRAVITY' || selectedStrategy === 'PHYSICS' ? 0.01 : 1}
                            value={strategyParam} onChange={(e) => setStrategyParam(parseFloat(e.target.value))}
                            className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                    </div>

                    <button onClick={handleStrategyRun} disabled={isComputing}
                        className={`w-10 h-10 rounded font-bold shadow-lg flex items-center justify-center shrink-0 active:scale-95 ${isComputing ? 'bg-slate-700 text-slate-500' : 'bg-emerald-500 text-white'}`}>
                        {isComputing ? <div className="animate-spin w-3 h-3 border-2 border-white/30 border-t-white rounded-full"/> : <Play size={16} fill="currentColor" />}
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}