import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { AboutModal } from "@/components/AboutModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ExportPdfModal } from "@/components/ExportPdfModal";
import { LeftRail } from "@/components/LeftRail";
import { RightPanel } from "@/components/RightPanel";
import { SettingsModal, type SettingsTab } from "@/components/SettingsModal";
import { StatusBar } from "@/components/StatusBar";
import { TopBar } from "@/components/TopBar";
import { UpdateNotification } from "@/components/UpdateNotification";
import { ViewportHUD } from "@/components/ViewportHUD";
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings } from "@/domain/app-settings";
import { bendLandingCells, bendPlacementGhost, placeBend } from "@/domain/bend-placement";
import { deserializeDesign, serializeDesign } from "@/domain/design-file";
import { canRedo, canUndo, designHistoryReducer, initDesignHistory } from "@/domain/design-history";
import {
  DEFAULT_FILENAME,
  DEFAULT_REVISION,
  designFromScene,
  emptyDesign,
  partsWithinBuildArea
} from "@/domain/design-state";
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
import { partRegistry } from "@/domain/part-registry";
import {
  autoBuildOpenPortPair,
  type OptimizationMode,
  type UnroutedPair
} from "@/domain/pathfinder";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import { openPortMarkers, partLabels } from "@/domain/renderer-affordances";
import {
  placeTerminal,
  terminalLandingCells,
  terminalPlacementGhost
} from "@/domain/terminal-placement";
import { placeTube, tubeLandingCells, tubePlacementGhost } from "@/domain/tube-placement";
import { validate } from "@/domain/validation";
import { Viewport } from "@/renderer/Viewport";
import type { AutoBuildSummary, DesignState, Ghost, Hint, Scene, ToolId, Vec3 } from "@/types";

const OPTIMIZATION_MODE_LABELS: Record<OptimizationMode, string> = {
  shortest: "Shortest path",
  "fewest-bends": "Fewest bends"
};

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

/** "<name> · <part number>", read from the catalog rather than restated here. */
function catalogLabel(registryKey: string): string {
  const { name, partNo } = partRegistry.get(registryKey);
  return `${name} · ${partNo}`;
}

// Part names and numbers come from the catalog: ADR-0001 requires user-facing
// copy to interpolate reference data, not duplicate it. Obstacles are not parts
// (see CONTEXT.md) and the two non-placing tools have no catalog entry, so those
// three keep literal labels.
const TOOL_LABELS: Record<ToolId, string> = {
  cursor: "Select",
  blower: catalogLabel("blower"),
  terminal: catalogLabel("terminal"),
  tube: catalogLabel("tube6"),
  bend: catalogLabel("bend90"),
  obstacle: "Obstacle volume",
  erase: "Erase"
};

const kbdStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  padding: "1px 6px",
  borderRadius: 3,
  border: "1px solid var(--line-2)",
  background: "var(--panel-2)",
  color: "var(--text)"
} as const;

const DESIGN_METADATA = { filename: DEFAULT_FILENAME, revision: DEFAULT_REVISION };

function isFreePlacementTool(tool: ToolId): tool is FreePlacementType {
  return tool === "blower" || tool === "terminal";
}

/**
 * Resolve after the browser has had a chance to paint. requestAnimationFrame
 * alone runs *before* paint, so the timeout hands control back afterwards.
 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

/** Explain what auto-build could not route, or null when it routed everything. */
function unroutedMessage(unrouted: UnroutedPair[]): string | null {
  if (unrouted.length === 0) return null;
  const count = `${unrouted.length} pair(s)`;
  if (unrouted.some((pair) => pair.reason === "over-budget")) {
    return `${count} exceeded the ${MAX_CENTERLINE_FEET}ft budget and were left unrouted.`;
  }
  // A search that ran out of budget has not proved anything; say so, rather than
  // claiming no route exists.
  if (unrouted.some((pair) => pair.reason === "search-limit")) {
    return `${count} were too complex to route. Try moving the endpoints closer or clearing obstacles.`;
  }
  return `${count} had no route and were skipped.`;
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
      // The assertion is required: this @types/react has no index signature for
      // CSS custom properties, so a bare object literal is not assignable to
      // `style`. no-unnecessary-type-assertion disagrees with tsc here.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      ({
        "--topbar-left-padding": `${Math.max(10, titleBarInset)}px`,
        "--topbar-right-padding": `${Math.max(10, titleBarRightInset)}px`
      }) as CSSProperties & Record<"--topbar-left-padding" | "--topbar-right-padding", string>,
    [titleBarInset, titleBarRightInset]
  );
  // The design and its undo/redo stacks move together, so they are one reducer.
  // `dispatchHistory` is stable, which is what lets the history callbacks below
  // stay stable without mirroring the current design into a ref.
  const [history, dispatchHistory] = useReducer(designHistoryReducer, DESIGN_METADATA, (metadata) =>
    initDesignHistory(emptyDesign(metadata))
  );
  const design = history.present;
  const undoAvailable = canUndo(history);
  const redoAvailable = canRedo(history);

  const [tool, setToolRaw] = useState<ToolId>("cursor");
  const [hoverCell, setHoverCell] = useState<Vec3 | null>(null);
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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [autoBuilding, setAutoBuilding] = useState(false);
  const [autoBuildJustRan, setAutoBuildJustRan] = useState(false);
  const [autoBuildSummary, setAutoBuildSummary] = useState<AutoBuildSummary | null>(null);
  const [optimizationMode, setOptimizationMode] =
    useState<OptimizationMode>(DEFAULT_AUTO_BUILD_MODE);
  const [activeElevation, setActiveElevation] = useState(0);
  const [showLabels, setShowLabels] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errorFlash, setErrorFlashRaw] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Switching tools abandons anything in flight for the previous one. */
  const selectTool = useCallback((next: ToolId) => {
    setToolRaw(next);
    setFreePlacementRotation(DEFAULT_FREE_PLACEMENT_ROTATION);
    setObstacleDraft(null);
  }, []);

  const setErrorFlash = useCallback((msg: string | null) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setErrorFlashRaw(msg);
    if (msg) {
      flashTimer.current = setTimeout(() => setErrorFlashRaw(null), 2400);
    }
  }, []);

  /**
   * Drop the transient bits tied to the design we just moved away from: an
   * in-flight obstacle draft, and a stale auto-build toast describing a route
   * that is no longer on screen.
   */
  const clearTransientAfterHistoryMove = useCallback(() => {
    setObstacleDraft(null);
    setAutoBuildJustRan(false);
    setAutoBuildSummary(null);
    setDirty(true);
  }, []);

  /** Apply a design change as a single undoable step. A new edit clears redo. */
  const commitDesign = useCallback((next: DesignState) => {
    dispatchHistory({ type: "commit", design: next });
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    if (!undoAvailable) return;
    dispatchHistory({ type: "undo" });
    clearTransientAfterHistoryMove();
  }, [undoAvailable, clearTransientAfterHistoryMove]);

  const redo = useCallback(() => {
    if (!redoAvailable) return;
    dispatchHistory({ type: "redo" });
    clearTransientAfterHistoryMove();
  }, [redoAvailable, clearTransientAfterHistoryMove]);

  // Load persisted global settings once on startup and apply pricing overrides so
  // the BOM/quote reflect the user's saved prices.
  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await window.ptsbuilder?.getSettings();
      if (!active) return;
      const merged = mergeSettings(DEFAULT_SETTINGS, loaded?.data ?? null);
      setSettings(merged);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Surface the on-brand "update ready" prompt. Listen for the live push and
  // also query for an update that finished downloading before this listener
  // attached (autoUpdateSupported platforms only — elsewhere it stays null).
  useEffect(() => {
    const unsubscribe = window.ptsbuilder?.onUpdateDownloaded((info) => {
      setUpdateReady(info.version);
    });
    let active = true;
    void (async () => {
      const pending = await window.ptsbuilder?.getPendingUpdate();
      if (active && pending) setUpdateReady(pending.version);
    })();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const updateSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    void window.ptsbuilder?.setSettings(JSON.stringify(next, null, 2));
  }, []);

  const updateMetadata = useCallback(
    (metadata: DesignState["metadata"]) => {
      const d = design;
      const prev = d.metadata.buildArea;
      const next = metadata.buildArea;
      const areaChanged =
        prev.width !== next.width || prev.depth !== next.depth || prev.height !== next.height;
      if (!areaChanged) {
        // Cosmetic metadata (name/revision): swap in place, not an undoable edit.
        dispatchHistory({ type: "replace-present", design: { ...d, metadata } });
        setDirty(true);
        return;
      }
      // Build area changed: drop any parts that no longer fit the new bounds and
      // rebuild the grid. Commit as one undoable step so the deletion is reversible.
      const keptParts = partsWithinBuildArea(d.parts, next);
      commitDesign(designFromScene({ parts: keptParts, obstacles: d.obstacles }, metadata));
    },
    [commitDesign, design]
  );

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
      if (KEY_TOOL_MAP[k] && !e.metaKey && !e.ctrlKey) selectTool(KEY_TOOL_MAP[k]);
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
      if (k === "escape") selectTool("cursor");
      if (k === "[" && !e.metaKey && !e.ctrlKey) {
        setActiveElevation((y) => Math.max(-20, y - 1));
      }
      if (k === "]" && !e.metaKey && !e.ctrlKey) {
        setActiveElevation((y) => Math.min(20, y + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, undo, redo, selectTool]);

  /**
   * The ghost is derived, not stored. It was previously computed in an effect
   * that called setGhostState, which cost a second render pass on every mouse
   * move — the hover cell changes, React renders, the effect runs, React renders
   * again. Computing it during render halves that, and removes the possibility
   * of the stored ghost disagreeing with the state it was supposed to reflect.
   */
  const ghostState = useMemo<Ghost | null>(() => {
    if (!hoverCell || tool === "cursor" || tool === "erase") return null;
    if (tool === "blower") {
      return freePlacementGhost({
        type: tool,
        design,
        cell: hoverCell,
        memory: freePlacementMemory,
        rotationSteps: freePlacementRotation.horizontalSteps,
        verticalRotationSteps: freePlacementRotation.verticalSteps
      });
    }
    if (tool === "terminal") {
      return terminalPlacementGhost({
        design,
        cell: hoverCell,
        memory: freePlacementMemory,
        rotationSteps: freePlacementRotation.horizontalSteps,
        verticalRotationSteps: freePlacementRotation.verticalSteps
      });
    }
    if (tool === "tube") return tubePlacementGhost(design, hoverCell);
    if (tool === "bend") {
      return bendPlacementGhost(design, hoverCell, { rotationIndex: ghostRotation });
    }
    if (tool === "obstacle") return obstaclePlacementGhost(obstacleDraft, hoverCell);
    return null;
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
        setFreePlacementMemory((memory) =>
          rememberFreePlacementOrientation(memory, tool, orientation)
        );
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
          return;
        }
        if (!obstaclePlacementDraftHasFootprint(obstacleDraft)) {
          setObstacleDraft(setObstaclePlacementFootprint(obstacleDraft, cell));
          return;
        }
        return;
      }
    },
    [
      commitDesign,
      tool,
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
      const json = JSON.stringify(serializeDesign(design, __APP_VERSION__), null, 2);
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
      dispatchHistory({ type: "reset", design: parsed.design });
      selectTool("cursor");
      setAutoBuildJustRan(false);
      setExportOpen(false);
      setStatusOpen(false);
      setDirty(false);
      setErrorFlash(null);
    } catch (err) {
      setErrorFlash(`Open failed: ${String(err)}`);
    }
  }, [dirty, selectTool, setErrorFlash]);

  const runAutoBuild = useCallback(async () => {
    setAutoBuilding(true);
    setAutoBuildJustRan(false);
    // The search is synchronous and blocks the thread. Without yielding first,
    // React batches this state change with the one after it and the pending
    // indicator never reaches the screen. Routing typically takes under 40ms,
    // but an unroutable pair exhausts the search space and can take ~1.7s --
    // exactly when the user most needs to see that something is happening.
    await nextPaint();

    let result;
    try {
      result = autoBuildOpenPortPair(design, { mode: optimizationMode });
    } finally {
      setAutoBuilding(false);
    }

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
    selectTool("cursor");
    commitDesign(result.design);
    setErrorFlash(unroutedMessage(result.unroutedPairs));
  }, [commitDesign, design, optimizationMode, selectTool, setErrorFlash]);

  const resetActiveInteraction = useCallback(() => {
    selectTool("cursor");
    setAutoBuildJustRan(false);
  }, [selectTool]);

  const clearAllParts = useCallback(() => {
    if (design.parts.length === 0) return;
    setConfirm({
      title: "Clear all parts",
      message: "Remove every placed part? Obstacles will remain. This can be undone.",
      confirmLabel: "Clear parts",
      onConfirm: () => {
        commitDesign(designFromScene({ parts: [], obstacles: design.obstacles }, design.metadata));
        resetActiveInteraction();
        setErrorFlash(null);
      }
    });
  }, [commitDesign, design, resetActiveInteraction, setErrorFlash]);

  const clearAllObstacles = useCallback(() => {
    if (design.obstacles.length === 0) return;
    setConfirm({
      title: "Clear all obstacles",
      message: "Remove every obstacle? Placed parts will remain. This can be undone.",
      confirmLabel: "Clear obstacles",
      onConfirm: () => {
        commitDesign(designFromScene({ parts: design.parts, obstacles: [] }, design.metadata));
        resetActiveInteraction();
        setErrorFlash(null);
      }
    });
  }, [commitDesign, design, resetActiveInteraction, setErrorFlash]);

  const warnings = useMemo(() => validate(design), [design]);

  const viewportScene: Scene = useMemo(
    () => ({
      parts: design.parts,
      obstacles: design.obstacles,
      hint: design.parts.length === 0 ? STARTER_HINT : null,
      autoBuildJustRan,
      autoBuildSummary
    }),
    [design, autoBuildJustRan, autoBuildSummary]
  );

  const landingCells = useMemo(() => {
    if (tool === "terminal") return terminalLandingCells(design);
    if (tool === "tube") return tubeLandingCells(design);
    if (tool === "bend") return bendLandingCells(design);
    return [];
  }, [tool, design]);

  const portMarkers = useMemo(() => openPortMarkers(design, tool), [design, tool]);
  const labels = useMemo(() => partLabels(design), [design]);

  return (
    <div className="app-shell" style={shellStyle}>
      <TopBar
        onOpen={() => void handleOpen()}
        onSave={() => void handleSave()}
        onEdit={setSettingsTab}
        onUndo={undo}
        onRedo={redo}
        canUndo={undoAvailable}
        canRedo={redoAvailable}
        bomOpen={rightOpen}
        onToggleBom={() => setRightOpen((o) => !o)}
        showLabels={showLabels}
        onShowLabelsChange={setShowLabels}
        onAbout={() => setAboutOpen(true)}
      />
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <LeftRail
          tool={tool}
          onTool={selectTool}
          partCount={design.parts.length}
          obstacleCount={design.obstacles.length}
          onClearParts={clearAllParts}
          onClearObstacles={clearAllObstacles}
        />
        <div style={{ flex: 1, position: "relative", background: "#0B0E13", overflow: "hidden" }}>
          <Viewport
            scene={viewportScene}
            buildArea={design.metadata.buildArea}
            ghost={ghostState}
            tool={tool}
            onPlace={onPlace}
            onHover={setHoverCell}
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
            pricing={settings.pricing}
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
              <span style={{ fontWeight: 600 }}>{TOOL_LABELS[tool]}</span>
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
        onAutoBuild={() => void runAutoBuild()}
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
          onOpenSettings={(tab) => {
            setExportOpen(false);
            setSettingsTab(tab);
          }}
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
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {updateReady && (
        <UpdateNotification version={updateReady} onDismiss={() => setUpdateReady(null)} />
      )}
    </div>
  );
}
