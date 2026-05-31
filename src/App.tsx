import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ExportPdfModal } from "@/components/ExportPdfModal";
import { LeftRail } from "@/components/LeftRail";
import { RightPanel } from "@/components/RightPanel";
import { SettingsModal, type SettingsTab } from "@/components/SettingsModal";
import { StatusBar } from "@/components/StatusBar";
import { TopBar } from "@/components/TopBar";
import { ViewportHUD } from "@/components/ViewportHUD";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  setPriceOverrides,
  type AppSettings
} from "@/domain/app-settings";
import { bendLandingCells, bendPlacementGhost, placeBend } from "@/domain/bend-placement";
import { deserializeDesign, serializeDesign } from "@/domain/design-file";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import { eraseAtCell } from "@/domain/erase-placement";
import {
  DEFAULT_FREE_PLACEMENT_MEMORY,
  DEFAULT_FREE_PLACEMENT_ROTATION,
  freePlacementGhost,
  placeFreePart,
  rememberFreePlacementOrientation,
  type FreePlacementMemory,
  type FreePlacementRotation,
  type FreePlacementType
} from "@/domain/free-placement";
import {
  cancelObstaclePlacement,
  moveObstaclePlacementBase,
  obstaclePlacementDraftBounds,
  obstaclePlacementDraftHasFootprint,
  obstaclePlacementGhost,
  placeObstacleVolume,
  resizeObstaclePlacementHeight,
  setObstaclePlacementFootprint,
  startObstaclePlacement,
  type ObstaclePlacementDraft
} from "@/domain/obstacle-placement";
import { totalPathLength } from "@/domain/parts";
import { popUndo, pushUndo } from "@/domain/undo-history";
import { autoBuildOpenPortPair, type OptimizationMode } from "@/domain/pathfinder";
import { openPortMarkers, partLabels } from "@/domain/renderer-affordances";
import { placeTerminal, terminalLandingCells, terminalPlacementGhost } from "@/domain/terminal-placement";
import { placeTube, tubeLandingCells, tubePlacementGhost } from "@/domain/tube-placement";
import { validate } from "@/domain/validation";
import { Viewport } from "@/renderer/Viewport";
import type {
  AutoBuildSummary,
  Camera,
  DesignState,
  Ghost,
  Hint,
  Part,
  Scene,
  ToolId,
  Vec3
} from "@/types";

const OPTIMIZATION_MODE_LABELS: Record<OptimizationMode, string> = {
  shortest: "Shortest path",
  "fewest-bends": "Fewest bends"
};

const FILE_NAME = "BUILDING_07.kel2020";
const FILE_REVISION = "0.1";

const DEFAULT_CAMERA: Camera = { yaw: 0.55, pitch: 0.55, distance: 38 };
const DEFAULT_AUTO_BUILD_MODE: OptimizationMode = "fewest-bends";

const STARTER_HINT: Hint = {
  title: "Start by placing a blower",
  body: "Pick the Blower from the left rail, then click on the grid. Press R to rotate before placing."
};

const KEY_TOOL_MAP: Record<string, ToolId> = {
  v: "cursor",
  o: "obstacle",
  x: "erase"
};

function toolLabelShort(t: ToolId): string {
  return (
    {
      cursor: "Select",
      blower: "Blower · BL-2020-A",
      terminal: "Terminal · TM-2020-S",
      tube: "Tube 6ft · ST-06-4OD",
      bend: "Bend 90° · BN-90-3R",
      obstacle: "Obstacle volume",
      erase: "Erase"
    } satisfies Record<ToolId, string>
  )[t];
}

const kbdStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  padding: "1px 6px",
  borderRadius: 3,
  border: "1px solid var(--line-2)",
  background: "var(--panel-2)",
  color: "var(--text)"
} as const;

const DIRS: Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, 0, -1]
];

const DESIGN_METADATA = { filename: FILE_NAME, revision: FILE_REVISION };

function isFreePlacementTool(tool: ToolId): tool is FreePlacementType {
  return tool === "blower" || tool === "terminal";
}

function ghostOrientation(ghost: Ghost): Vec3 | null {
  if (ghost.type === "blower") return ghost.dir;
  if (ghost.type === "terminal") return ghost.axis;
  return null;
}

export default function App() {
  const titleBarInset = useMemo(() => {
    if (window.ptsbuilder) return window.ptsbuilder.titleBarInset;
    return navigator.platform.toLowerCase().includes("mac") ? 86 : 0;
  }, []);
  const titleBarRightInset = useMemo(() => {
    if (window.ptsbuilder) return window.ptsbuilder.titleBarRightInset;
    return navigator.platform.toLowerCase().includes("win") ? 148 : 0;
  }, []);
  const shellStyle = useMemo(
    () =>
      ({
        "--topbar-left-padding": `${Math.max(10, titleBarInset)}px`,
        "--topbar-right-padding": `${Math.max(10, titleBarRightInset)}px`
      }) as CSSProperties & Record<"--topbar-left-padding" | "--topbar-right-padding", string>,
    [titleBarInset, titleBarRightInset]
  );
  const [design, setDesign] = useState<DesignState>(() => emptyDesign(DESIGN_METADATA));
  const [tool, setTool] = useState<ToolId>("cursor");
  const [hoverCell, setHoverCell] = useState<Vec3 | null>(null);
  const [ghostState, setGhostState] = useState<Ghost | null>(null);
  const [obstacleDraft, setObstacleDraft] = useState<ObstaclePlacementDraft | null>(null);
  const [ghostRotation, setGhostRotation] = useState(0);
  const [freePlacementMemory, setFreePlacementMemory] = useState<FreePlacementMemory>(
    DEFAULT_FREE_PLACEMENT_MEMORY
  );
  const [freePlacementRotation, setFreePlacementRotation] = useState<FreePlacementRotation>(
    DEFAULT_FREE_PLACEMENT_ROTATION
  );
  const [rightOpen, setRightOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [autoBuilding, setAutoBuilding] = useState(false);
  const [autoBuildJustRan, setAutoBuildJustRan] = useState(false);
  const [autoBuildSummary, setAutoBuildSummary] = useState<AutoBuildSummary | null>(null);
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>(DEFAULT_AUTO_BUILD_MODE);
  const [activeElevation, setActiveElevation] = useState(0);
  const [showLabels, setShowLabels] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errorFlash, setErrorFlashRaw] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setErrorFlash = useCallback((msg: string | null) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setErrorFlashRaw(msg);
    if (msg) {
      flashTimer.current = setTimeout(() => setErrorFlashRaw(null), 2400);
    }
  }, []);

  // Undo/redo history. `designRef` mirrors the latest committed design so the
  // stable history callbacks can read it without re-binding every render.
  const designRef = useRef(design);
  designRef.current = design;
  const undoStackRef = useRef<DesignState[]>([]);
  const redoStackRef = useRef<DesignState[]>([]);
  // Reactive mirrors of the stack depths so the toolbar buttons can enable/disable.
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const syncHistoryFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  /** Apply a design change as a single undoable step. A new edit clears redo. */
  const commitDesign = useCallback((next: DesignState) => {
    undoStackRef.current = pushUndo(undoStackRef.current, designRef.current);
    redoStackRef.current = [];
    designRef.current = next;
    setDesign(next);
    setDirty(true);
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  // Restore a design from history and drop any in-flight interaction or stale
  // auto-build toast tied to the state we just moved away from.
  const restoreDesign = useCallback((next: DesignState) => {
    designRef.current = next;
    setDesign(next);
    setObstacleDraft(null);
    setGhostState(null);
    setAutoBuildJustRan(false);
    setAutoBuildSummary(null);
    setDirty(true);
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  const undo = useCallback(() => {
    const popped = popUndo(undoStackRef.current);
    if (!popped) return;
    undoStackRef.current = popped.rest;
    redoStackRef.current = pushUndo(redoStackRef.current, designRef.current);
    restoreDesign(popped.entry);
  }, [restoreDesign]);

  const redo = useCallback(() => {
    const popped = popUndo(redoStackRef.current);
    if (!popped) return;
    redoStackRef.current = popped.rest;
    undoStackRef.current = pushUndo(undoStackRef.current, designRef.current);
    restoreDesign(popped.entry);
  }, [restoreDesign]);

  // Load persisted global settings once on startup and apply pricing overrides so
  // the BOM/quote reflect the user's saved prices.
  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await window.ptsbuilder?.getSettings();
      if (!active) return;
      const merged = mergeSettings(DEFAULT_SETTINGS, loaded?.data ?? null);
      setSettings(merged);
      setPriceOverrides(merged.pricing);
    })();
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    setPriceOverrides(next.pricing);
    void window.ptsbuilder?.setSettings(JSON.stringify(next, null, 2));
  }, []);

  const updateMetadata = useCallback((metadata: DesignState["metadata"]) => {
    setDesign((d) => ({ ...d, metadata }));
    setDirty(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "z" && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (k === "y" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        redo();
        return;
      }
      if (KEY_TOOL_MAP[k] && !e.metaKey && !e.ctrlKey) setTool(KEY_TOOL_MAP[k]);
      if (k === "r" && !e.metaKey && !e.ctrlKey) {
        if (isFreePlacementTool(tool)) {
          setFreePlacementRotation((rotation) =>
            e.shiftKey
              ? { ...rotation, verticalSteps: rotation.verticalSteps + 1 }
              : { horizontalSteps: rotation.horizontalSteps + 1, verticalSteps: 0 }
          );
        } else {
          setGhostRotation((r) => (r + (e.shiftKey ? 3 : 1)) % 4);
        }
      }
      if (k === "escape") {
        setTool("cursor");
        setGhostState(null);
        setObstacleDraft((draft) => cancelObstaclePlacement(draft));
        setFreePlacementRotation(DEFAULT_FREE_PLACEMENT_ROTATION);
      }
      if (k === "[" && !e.metaKey && !e.ctrlKey) {
        setActiveElevation((y) => Math.max(-20, y - 1));
      }
      if (k === "]" && !e.metaKey && !e.ctrlKey) {
        setActiveElevation((y) => Math.min(20, y + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, undo, redo]);

  useEffect(() => {
    setFreePlacementRotation(DEFAULT_FREE_PLACEMENT_ROTATION);
    setObstacleDraft(null);
  }, [tool]);

  useEffect(() => {
    if (!hoverCell || tool === "cursor" || tool === "erase") {
      setGhostState(null);
      return;
    }
    if (tool === "blower") {
      setGhostState(
        freePlacementGhost({
          type: tool,
          design,
          cell: hoverCell,
          memory: freePlacementMemory,
          rotationSteps: freePlacementRotation.horizontalSteps,
          verticalRotationSteps: freePlacementRotation.verticalSteps
        })
      );
    } else if (tool === "terminal") {
      setGhostState(
        terminalPlacementGhost({
          design,
          cell: hoverCell,
          memory: freePlacementMemory,
          rotationSteps: freePlacementRotation.horizontalSteps,
          verticalRotationSteps: freePlacementRotation.verticalSteps
        })
      );
    } else if (tool === "tube") {
      setGhostState(tubePlacementGhost(design, hoverCell));
    } else if (tool === "bend") {
      setGhostState(bendPlacementGhost(design, hoverCell, { rotationIndex: ghostRotation }));
    } else if (tool === "obstacle") {
      setGhostState(obstaclePlacementGhost(obstacleDraft, hoverCell));
    }
  }, [
    hoverCell,
    tool,
    ghostRotation,
    design,
    freePlacementMemory,
    freePlacementRotation,
    obstacleDraft
  ]);

  const cancelObstacleDraft = useCallback(() => {
    setObstacleDraft((draft) => cancelObstaclePlacement(draft));
    setGhostState(null);
  }, []);

  const commitObstacleDraft = useCallback(() => {
    if (!obstaclePlacementDraftHasFootprint(obstacleDraft)) return;
    const bounds = obstaclePlacementDraftBounds(obstacleDraft);
    const result = placeObstacleVolume(design, {
      id: "o" + Math.random().toString(36).slice(2, 8),
      cornerA: bounds.min,
      cornerB: bounds.max
    });
    if (!result.ok) {
      setErrorFlash(result.message);
      return;
    }
    commitDesign(result.design);
    setObstacleDraft(null);
    setGhostState(null);
    setAutoBuildJustRan(false);
  }, [commitDesign, design, obstacleDraft, setErrorFlash]);

  const setObstacleBaseY = useCallback((baseY: number) => {
    setObstacleDraft((draft) => (draft ? moveObstaclePlacementBase(draft, baseY) : draft));
  }, []);

  const setObstacleHeight = useCallback((height: number) => {
    setObstacleDraft((draft) => (draft ? resizeObstaclePlacementHeight(draft, height) : draft));
  }, []);

  const onPlace = useCallback(
    (cell: Vec3, _e?: MouseEvent, target?: { partId?: string }) => {
      if (tool === "cursor") return;
      if (tool === "erase") {
        const result = eraseAtCell(design, cell);
        if (!result.ok) {
          setErrorFlash(result.message);
          return;
        }
        commitDesign(result.design);
        setAutoBuildJustRan(false);
        return;
      }
      if (tool === "terminal") {
        const result = placeTerminal(design, {
          id: "p" + Math.random().toString(36).slice(2, 8),
          cell,
          memory: freePlacementMemory,
          rotationSteps: freePlacementRotation.horizontalSteps,
          verticalRotationSteps: freePlacementRotation.verticalSteps
        });
        if (!result.ok) {
          setErrorFlash(result.message);
          return;
        }
        commitDesign(result.design);
        const orientation = result.part.type === "terminal" ? result.part.axis : null;
        if (orientation) {
          setFreePlacementMemory((memory) =>
            rememberFreePlacementOrientation(memory, "terminal", orientation)
          );
        }
        setFreePlacementRotation(DEFAULT_FREE_PLACEMENT_ROTATION);
        setAutoBuildJustRan(false);
        return;
      }
      if (tool === "blower") {
        const preview = freePlacementGhost({
          type: tool,
          design,
          cell,
          memory: freePlacementMemory,
          rotationSteps: freePlacementRotation.horizontalSteps,
          verticalRotationSteps: freePlacementRotation.verticalSteps
        });
        const orientation = preview ? ghostOrientation(preview) : freePlacementMemory[tool];
        if (!orientation) return;
        const result = placeFreePart(design, {
          id: "p" + Math.random().toString(36).slice(2, 8),
          type: tool,
          cell,
          orientation
        });
        if (!result.ok) {
          setErrorFlash(result.message);
          return;
        }
        commitDesign(result.design);
        setFreePlacementMemory((memory) => rememberFreePlacementOrientation(memory, tool, orientation));
        setFreePlacementRotation(DEFAULT_FREE_PLACEMENT_ROTATION);
        setAutoBuildJustRan(false);
        return;
      }
      if (tool === "tube") {
        const result = placeTube(design, {
          id: "p" + Math.random().toString(36).slice(2, 8),
          cell,
          sourcePartId: target?.partId
        });
        if (!result.ok) {
          setErrorFlash(result.message);
          return;
        }
        commitDesign(result.design);
        setAutoBuildJustRan(false);
        return;
      }
      if (tool === "bend") {
        const result = placeBend(design, {
          id: "p" + Math.random().toString(36).slice(2, 8),
          cell,
          sourcePartId: target?.partId,
          rotationIndex: ghostRotation
        });
        if (!result.ok) {
          setErrorFlash(result.message);
          return;
        }
        commitDesign(result.design);
        setAutoBuildJustRan(false);
        return;
      }
      if (tool === "obstacle") {
        if (!obstacleDraft) {
          const result = startObstaclePlacement(design, cell);
          if (!result.ok) {
            setErrorFlash(result.message);
            return;
          }
          setObstacleDraft(result.draft);
          setGhostState(obstaclePlacementGhost(result.draft, cell));
          return;
        }
        if (!obstaclePlacementDraftHasFootprint(obstacleDraft)) {
          const nextDraft = setObstaclePlacementFootprint(obstacleDraft, cell);
          setObstacleDraft(nextDraft);
          setGhostState(obstaclePlacementGhost(nextDraft, cell));
          return;
        }
        return;
      }
      const g = ghostState;
      if (!g) return;
      const id = "p" + Math.random().toString(36).slice(2, 8);
      const newPart: Part = { id, ...g } as Part;
      commitDesign({ ...design, parts: [...design.parts, newPart] });
      setAutoBuildJustRan(false);
    },
    [
      commitDesign,
      tool,
      ghostState,
      setErrorFlash,
      design,
      freePlacementMemory,
      freePlacementRotation,
      ghostRotation,
      obstacleDraft
    ]
  );

  const handleSave = useCallback(async () => {
    const api = window.ptsbuilder;
    if (!api) {
      setErrorFlash("Save is unavailable: file bridge not connected.");
      return;
    }
    try {
      const json = JSON.stringify(serializeDesign(design), null, 2);
      const result = await api.saveDesign(json);
      if (result.canceled) return;
      if (result.error) {
        setErrorFlash(`Save failed: ${result.error}`);
        return;
      }
      setDirty(false);
      setErrorFlash(null);
    } catch (err) {
      setErrorFlash(`Save failed: ${String(err)}`);
    }
  }, [design, setErrorFlash]);

  const handleOpen = useCallback(async () => {
    const api = window.ptsbuilder;
    if (!api) {
      setErrorFlash("Open is unavailable: file bridge not connected.");
      return;
    }
    if (dirty) {
      const proceed = window.confirm(
        "You have unsaved changes. Open another design and discard them?"
      );
      if (!proceed) return;
    }
    try {
      const result = await api.openDesign();
      if (result.canceled) return;
      if (result.error || result.contents === null) {
        setErrorFlash(`Open failed: ${result.error ?? "could not read file"}`);
        return;
      }
      const parsed = deserializeDesign(result.contents);
      if (!parsed.ok) {
        setErrorFlash(`Open failed: ${parsed.message}`);
        return;
      }
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryFlags();
      designRef.current = parsed.design;
      setDesign(parsed.design);
      setTool("cursor");
      setGhostState(null);
      setObstacleDraft(null);
      setFreePlacementRotation(DEFAULT_FREE_PLACEMENT_ROTATION);
      setAutoBuildJustRan(false);
      setExportOpen(false);
      setStatusOpen(false);
      setDirty(false);
      setErrorFlash(null);
    } catch (err) {
      setErrorFlash(`Open failed: ${String(err)}`);
    }
  }, [dirty, setErrorFlash, syncHistoryFlags]);

  const runAutoBuild = useCallback(() => {
    setAutoBuilding(true);
    setAutoBuildJustRan(false);
    const result = autoBuildOpenPortPair(design, { mode: optimizationMode });
    setAutoBuilding(false);
    if (!result.ok) {
      setErrorFlash(result.message);
      return;
    }
    setAutoBuildSummary({
      lengthFeet: totalPathLength(result.parts),
      bends: result.parts.filter((part) => part.type === "bend").length,
      obstacles: design.obstacles.length,
      modeLabel: OPTIMIZATION_MODE_LABELS[optimizationMode],
      unrouted: result.unroutedPairs.length
    });
    setAutoBuildJustRan(true);
    setTool("cursor");
    commitDesign(result.design);
    if (result.unroutedPairs.length > 0) {
      const overBudget = result.unroutedPairs.some((pair) => pair.reason === "over-budget");
      setErrorFlash(
        overBudget
          ? `${result.unroutedPairs.length} pair(s) exceeded the 300ft budget and were left unrouted.`
          : `${result.unroutedPairs.length} pair(s) had no route and were skipped.`
      );
    } else {
      setErrorFlash(null);
    }
  }, [commitDesign, design, optimizationMode, setErrorFlash]);

  const resetActiveInteraction = useCallback(() => {
    setTool("cursor");
    setGhostState(null);
    setObstacleDraft(null);
    setFreePlacementRotation(DEFAULT_FREE_PLACEMENT_ROTATION);
    setAutoBuildJustRan(false);
  }, []);

  const clearAllParts = useCallback(() => {
    if (design.parts.length === 0) return;
    const proceed = window.confirm("Clear all placed parts? Obstacles will remain.");
    if (!proceed) return;
    commitDesign(designFromScene({ parts: [], obstacles: design.obstacles }, design.metadata));
    resetActiveInteraction();
    setErrorFlash(null);
  }, [commitDesign, design, resetActiveInteraction, setErrorFlash]);

  const clearAllObstacles = useCallback(() => {
    if (design.obstacles.length === 0) return;
    const proceed = window.confirm("Clear all obstacles? Placed parts will remain.");
    if (!proceed) return;
    commitDesign(designFromScene({ parts: design.parts, obstacles: [] }, design.metadata));
    resetActiveInteraction();
    setErrorFlash(null);
  }, [commitDesign, design, resetActiveInteraction, setErrorFlash]);

  const warnings = useMemo(() => validate(design), [design]);

  const viewportScene: Scene = useMemo(
    () => ({
      parts: design.parts,
      obstacles: design.obstacles,
      camera: DEFAULT_CAMERA,
      hint: design.parts.length === 0 ? STARTER_HINT : null,
      autoBuildJustRan,
      autoBuildSummary
    }),
    [design, autoBuildJustRan, autoBuildSummary]
  );

  const landingCells = useMemo(
    () => {
      if (tool === "terminal") return terminalLandingCells(design);
      if (tool === "tube") return tubeLandingCells(design);
      if (tool === "bend") return bendLandingCells(design);
      return [];
    },
    [tool, design]
  );

  const portMarkers = useMemo(() => openPortMarkers(design, tool), [design, tool]);
  const labels = useMemo(() => partLabels(design), [design]);

  return (
    <div className="app-shell" style={shellStyle}>
      <TopBar
        onOpen={handleOpen}
        onSave={handleSave}
        onEdit={setSettingsTab}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        bomOpen={rightOpen}
        onToggleBom={() => setRightOpen((o) => !o)}
        showLabels={showLabels}
        onShowLabelsChange={setShowLabels}
      />
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <LeftRail
          tool={tool}
          onTool={setTool}
          partCount={design.parts.length}
          obstacleCount={design.obstacles.length}
          onClearParts={clearAllParts}
          onClearObstacles={clearAllObstacles}
        />
        <div style={{ flex: 1, position: "relative", background: "#0B0E13", overflow: "hidden" }}>
          <Viewport
            scene={viewportScene}
            ghost={ghostState}
            tool={tool}
            camera={DEFAULT_CAMERA}
            onPlace={onPlace}
            onHover={setHoverCell}
            autoBuildPulse={autoBuilding}
            landingCells={landingCells}
            activeElevation={activeElevation}
            portMarkers={portMarkers}
            labels={labels}
            showLabels={showLabels}
          />
          <ViewportHUD
            scene={viewportScene}
            tool={tool}
            autoBuilding={autoBuilding}
            errorFlash={errorFlash}
            obstacleDraft={obstacleDraft}
            onObstacleBaseYChange={setObstacleBaseY}
            onObstacleHeightChange={setObstacleHeight}
            onObstacleConfirm={commitObstacleDraft}
            onObstacleCancel={cancelObstacleDraft}
          />
          <RightPanel
            open={rightOpen}
            onClose={() => setRightOpen(false)}
            design={design}
            taxRate={settings.taxRate}
            onExport={() => setExportOpen(true)}
          />
          {tool !== "cursor" && (
            <div
              style={{
                position: "absolute",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(11,14,19,0.92)",
                border: "1px solid var(--line-2)",
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 12,
                color: "var(--text)",
                display: "flex",
                gap: 12,
                alignItems: "center",
                pointerEvents: "none",
                fontFamily: "var(--font-sans)",
                whiteSpace: "nowrap",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
              }}
            >
              <span
                style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }}
              />
              <span style={{ color: "var(--text-mut)" }}>Tool</span>
              <span style={{ fontWeight: 600 }}>{toolLabelShort(tool)}</span>
              {(tool === "blower" ||
                tool === "terminal" ||
                tool === "tube" ||
                tool === "bend" ||
                tool === "obstacle") && (
                <>
                  <span style={{ width: 1, height: 14, background: "var(--line)" }} />
                  {(tool === "blower" ||
                    tool === "terminal" ||
                    tool === "tube" ||
                    tool === "bend") && (
                    <span
                      style={{
                        color: "var(--text-mut)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4
                      }}
                    >
                      <kbd style={kbdStyle}>R</kbd>
                      <span>/</span>
                      <kbd style={kbdStyle}>Shift+R</kbd>
                      <span>rotate</span>
                    </span>
                  )}
                  <span
                    style={{
                      color: "var(--text-mut)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    <kbd style={kbdStyle}>Esc</kbd> cancel
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <StatusBar
        design={design}
        warnings={warnings}
        expanded={statusOpen}
        onToggle={() => setStatusOpen((s) => !s)}
        onAutoBuild={runAutoBuild}
        autoBuilding={autoBuilding}
        optimizationMode={optimizationMode}
        onOptimizationModeChange={setOptimizationMode}
      />
      {exportOpen && (
        <ExportPdfModal
          design={design}
          settings={settings}
          onClose={() => setExportOpen(false)}
          onError={setErrorFlash}
        />
      )}
      {settingsTab && (
        <SettingsModal
          tab={settingsTab}
          settings={settings}
          onSettingsChange={updateSettings}
          metadata={design.metadata}
          onMetadataChange={updateMetadata}
          onClose={() => setSettingsTab(null)}
        />
      )}
    </div>
  );
}
