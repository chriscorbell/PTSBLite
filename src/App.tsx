import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AboutModal } from "@/components/AboutModal";
import { ActiveToolBar } from "@/components/ActiveToolBar";
import { BomExportFooter } from "@/components/BomExportFooter";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LeftRail } from "@/components/LeftRail";
import { RightPanel } from "@/components/RightPanel";
import { StatusBar } from "@/components/StatusBar";
import { TopBar } from "@/components/TopBar";
import { ViewportHUD } from "@/components/ViewportHUD";
import { WelcomeScreen, type DesignSetup } from "@/components/WelcomeScreen";
import { generateBomPdf } from "@/domain/bom-pdf";
import { serializeDesign } from "@/domain/design-file";
import {
  isWorthKeeping,
  readStoredSession,
  UNREADABLE_SESSION_MESSAGE
} from "@/domain/session-autosave";
import { canRedo, canUndo, designHistoryReducer, initDesignHistory } from "@/domain/design-history";
import {
  DEFAULT_FILENAME,
  DEFAULT_REVISION,
  designFromScene,
  emptyDesign,
  newOccupantId
} from "@/domain/design-state";
import { totalPathLength } from "@/domain/parts";
import {
  attemptPlacement,
  commitObstacleDraft,
  INITIAL_PLACEMENT_SESSION,
  placementGhost,
  placementLandingCells,
  placementSessionReducer,
  type PlacementResult
} from "@/domain/placement-session";
import {
  autoBuildOpenPortPair,
  type OptimizationMode,
  type UnroutedPair
} from "@/domain/pathfinder";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import { openPortMarkers, partLabels } from "@/domain/renderer-affordances";
import { validate } from "@/domain/validation";
import type { Platform } from "@/platform/types";
import { Viewport, type ViewportHandle } from "@/renderer/Viewport";
import type { AutoBuildSummary, DesignState, Hint, Scene, ToolId, Vec3 } from "@/types";

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

const PRODUCT_NAME = "PTSBuilderLite";
const DESIGN_METADATA = { filename: DEFAULT_FILENAME, revision: DEFAULT_REVISION };

/**
 * How long to wait after a change before autosaving.
 *
 * Long enough that dragging a build-area field writes once rather than per
 * keystroke, short enough that a visitor closing the tab shortly after a
 * placement has already been covered by it rather than by the lifecycle flush.
 */
const AUTOSAVE_DEBOUNCE_MS = 800;

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

export type AppProps = {
  platform: Platform;
};

export default function App({ platform }: AppProps) {
  const sessionStore = platform.session;

  // Read at first render rather than in an effect. This is the design the app
  // starts from, not a reaction to something — an effect would render the empty
  // design first, then replace it, and `localStorage` is synchronous anyway.
  const [storedSession] = useState(() => readStoredSession(sessionStore.load()));
  // The design and its undo/redo stacks move together, so they are one reducer.
  // `dispatchHistory` is stable, which is what lets the history callbacks below
  // stay stable without mirroring the current design into a ref.
  const [history, dispatchDocument] = useReducer(
    designHistoryReducer,
    DESIGN_METADATA,
    (metadata) => initDesignHistory(emptyDesign(metadata))
  );
  const design = history.present;
  const documentLabel = design.metadata.filename;
  const buildArea = design.metadata.buildArea;
  const undoAvailable = canUndo(history);
  const redoAvailable = canRedo(history);

  const viewportRef = useRef<ViewportHandle>(null);

  // One value, not seven: the placement rules that tie them together live in
  // the domain module, where they can be tested without a renderer.
  const [placement, dispatchPlacement] = useReducer(
    placementSessionReducer,
    INITIAL_PLACEMENT_SESSION
  );
  const tool = placement.tool;
  const obstacleDraft = placement.obstacleDraft;
  const activeElevation = placement.activeElevation;

  // Every visit starts on the welcome screen: a continue/new/delete choice when
  // a design is stored, the setup form otherwise. Null once answered. "New"
  // from the top bar reopens it, without the greeting.
  const [welcome, setWelcome] = useState<{ stored: DesignState | null; greeting: boolean } | null>(
    () => ({
      stored: storedSession.status === "restorable" ? storedSession.design : null,
      greeting: true
    })
  );
  // Set when a write fails, cleared when one succeeds. While it holds a message
  // there is genuinely unsaved work, which is the only time Lite warns on exit.
  const [autosaveError, setAutosaveError] = useState<string | null>(
    storedSession.status === "unreadable" ? UNREADABLE_SESSION_MESSAGE : null
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const [rightOpen, setRightOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [autoBuilding, setAutoBuilding] = useState(false);
  const [autoBuildJustRan, setAutoBuildJustRan] = useState(false);
  const [autoBuildSummary, setAutoBuildSummary] = useState<AutoBuildSummary | null>(null);
  const [optimizationMode, setOptimizationMode] =
    useState<OptimizationMode>(DEFAULT_AUTO_BUILD_MODE);
  const [showLabels, setShowLabels] = useState(false);
  const [errorFlash, setErrorFlashRaw] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectTool = useCallback((next: ToolId) => {
    dispatchPlacement({ type: "select-tool", tool: next });
  }, []);

  const setErrorFlash = useCallback((msg: string | null) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setErrorFlashRaw(msg);
    if (msg) {
      flashTimer.current = setTimeout(() => {
        flashTimer.current = null;
        setErrorFlashRaw(null);
      }, 2400);
    }
  }, []);

  // A payload this build cannot read is set aside rather than dropped: an
  // unsupported schema usually means a rollback or a missed migration, and a
  // later deployment may manage what this one could not. The reason goes to the
  // console, not to the visitor, who can do nothing with it.
  useEffect(() => {
    if (storedSession.status !== "unreadable") return;
    console.warn(`PTSBuilderLite: stored design could not be read - ${storedSession.reason}`);
    sessionStore.preserveUnreadable();
  }, [storedSession, sessionStore]);

  // Autosave, debounced so a drag does not write on every frame. Nothing is
  // written while the welcome screen is open, or the blank design behind it
  // would overwrite the one being offered.
  useEffect(() => {
    if (welcome) return;
    if (!isWorthKeeping(design)) {
      // Starting over empties the design. Leaving the previous one in storage
      // would offer it back on the next visit, after the visitor discarded it.
      sessionStore.clear();
      return;
    }
    const timer = setTimeout(() => {
      const result = sessionStore.store(JSON.stringify(serializeDesign(design, __APP_VERSION__)));
      setAutosaveError(result.ok ? null : result.error);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [design, welcome, sessionStore]);

  // Write immediately when the tab is being hidden or torn down, which is the
  // last chance the browser gives. `visibilitychange` is the reliable one and
  // covers a tab switch; `pagehide` covers navigation and the back/forward
  // cache. Both are idempotent, and neither survives a crash — the debounce
  // above is what covers that.
  useEffect(() => {
    if (welcome) return;
    const flush = () => {
      if (!isWorthKeeping(design)) return;
      sessionStore.store(JSON.stringify(serializeDesign(design, __APP_VERSION__)));
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [design, welcome, sessionStore]);

  // The only time a browser build warns on the way out. Normally autosave means
  // there is nothing to lose and the prompt would be pure friction — but once a
  // write has failed there is, and the browser's own dialog is all there is.
  useEffect(() => {
    if (!autosaveError) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [autosaveError, sessionStore]);

  // A flash pending at unmount would otherwise fire into a component that is no
  // longer mounted.
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );

  /**
   * Drop the transient bits tied to the design we just moved away from: an
   * in-flight obstacle draft, and a stale auto-build toast describing a route
   * that is no longer on screen.
   */
  const clearTransientAfterHistoryMove = useCallback(() => {
    dispatchPlacement({ type: "cancel-obstacle-draft" });
    setAutoBuildJustRan(false);
    setAutoBuildSummary(null);
  }, []);

  /** Apply a design change as a single undoable step. A new edit clears redo. */
  const commitDesign = useCallback((next: DesignState) => {
    dispatchDocument({ type: "commit", design: next });
  }, []);

  /** Commit whatever a placement attempt decided, or flash why it failed. */
  const applyPlacementResult = useCallback(
    (result: PlacementResult) => {
      if (result.status === "error") {
        setErrorFlash(result.message);
        return;
      }
      if (result.status === "committed") {
        commitDesign(result.design);
        setAutoBuildJustRan(false);
      }
    },
    [commitDesign, setErrorFlash]
  );

  const undo = useCallback(() => {
    if (!undoAvailable) return;
    dispatchDocument({ type: "undo" });
    clearTransientAfterHistoryMove();
  }, [undoAvailable, clearTransientAfterHistoryMove]);

  const redo = useCallback(() => {
    if (!redoAvailable) return;
    dispatchDocument({ type: "redo" });
    clearTransientAfterHistoryMove();
  }, [redoAvailable, clearTransientAfterHistoryMove]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While the welcome screen is up there is no design being edited yet, and
      // a shortcut would reach the app behind the dialog.
      if (welcome) return;
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
        dispatchPlacement({ type: "rotate", reverse: e.shiftKey });
      }
      if (k === "escape") selectTool("cursor");
      if (k === "[" && !e.metaKey && !e.ctrlKey) {
        dispatchPlacement({ type: "nudge-elevation", delta: -1, buildArea });
      }
      if (k === "]" && !e.metaKey && !e.ctrlKey) {
        dispatchPlacement({ type: "nudge-elevation", delta: 1, buildArea });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectTool, buildArea, welcome]);

  const ghostState = useMemo(() => placementGhost(placement, design), [placement, design]);

  const cancelObstacleDraft = useCallback(() => {
    dispatchPlacement({ type: "cancel-obstacle-draft" });
  }, []);

  const commitObstacle = useCallback(() => {
    const { session, result } = commitObstacleDraft(placement, design, newOccupantId(design, "o"));
    dispatchPlacement({ type: "apply-attempt", session });
    applyPlacementResult(result);
  }, [applyPlacementResult, design, placement]);

  const setObstacleBaseY = useCallback(
    (baseY: number) => {
      dispatchPlacement({ type: "set-obstacle-base", baseY, buildArea });
    },
    [buildArea]
  );

  const setObstacleHeight = useCallback(
    (height: number) => {
      dispatchPlacement({ type: "set-obstacle-height", height, buildArea });
    },
    [buildArea]
  );

  const onPlace = useCallback(
    (cell: Vec3, target?: { partId?: string }) => {
      const { session, result } = attemptPlacement(
        placement,
        design,
        cell,
        newOccupantId(design, "p"),
        target?.partId
      );
      dispatchPlacement({ type: "apply-attempt", session });
      applyPlacementResult(result);
    },
    [applyPlacementResult, design, placement]
  );

  const exportBom = useCallback(async () => {
    try {
      const bytes = await generateBomPdf(design, { productName: PRODUCT_NAME });
      const result = await platform.savePdf(bytes, bomFilename(design));
      setExportError(result.error ? `Export failed: ${result.error}` : null);
    } catch (err) {
      setExportError(`Export failed: ${String(err)}`);
    }
  }, [design, platform]);

  /** Clear transient state when the current design is replaced. */
  const resetForNewDesign = useCallback(() => {
    selectTool("cursor");
    setAutoBuildJustRan(false);
    setAutoBuildSummary(null);
    setStatusOpen(false);
    setErrorFlash(null);
  }, [selectTool, setErrorFlash]);

  // "New" reopens the welcome screen's setup form, so every design starts by
  // answering the same questions. The current design stays on screen (and in
  // storage) until the new one is actually created.
  const handleNew = useCallback(() => {
    const startNew = () => setWelcome({ stored: null, greeting: false });
    if (!isWorthKeeping(design)) {
      startNew();
      return;
    }
    setConfirm({
      title: "Start a new design?",
      message: "This replaces the design currently stored in this browser.",
      confirmLabel: "Start new design",
      onConfirm: startNew
    });
  }, [design]);

  /** Restore the design the welcome screen offered. */
  const continueStored = useCallback(
    (stored: DesignState) => {
      dispatchDocument({ type: "reset", design: stored });
      resetForNewDesign();
      setWelcome(null);
    },
    [resetForNewDesign]
  );

  const deleteStored = useCallback(() => sessionStore.clear(), [sessionStore]);

  /** Create the design the setup form described. Replaces whatever was stored. */
  const createDesign = useCallback(
    (setup: DesignSetup) => {
      sessionStore.clear();
      dispatchDocument({ type: "reset", design: emptyDesign({ ...DESIGN_METADATA, ...setup }) });
      resetForNewDesign();
      setWelcome(null);
    },
    [resetForNewDesign, sessionStore]
  );

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

  const landingCells = useMemo(() => placementLandingCells(placement, design), [placement, design]);

  const portMarkers = useMemo(() => openPortMarkers(design, tool), [design, tool]);
  const labels = useMemo(() => partLabels(design), [design]);

  return (
    <div className="app-shell">
      <TopBar
        onNew={handleNew}
        documentLabel={documentLabel}
        productName={PRODUCT_NAME}
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
      <div className="app-main">
        <LeftRail
          tool={tool}
          onTool={selectTool}
          partCount={design.parts.length}
          obstacleCount={design.obstacles.length}
          onClearParts={clearAllParts}
          onClearObstacles={clearAllObstacles}
        />
        <div className="viewport-area">
          <Viewport
            ref={viewportRef}
            scene={viewportScene}
            buildArea={design.metadata.buildArea}
            ghost={ghostState}
            tool={tool}
            onPlace={onPlace}
            onHover={(cell) => dispatchPlacement({ type: "hover", cell })}
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
            errorFlash={errorFlash ?? autosaveError ?? exportError}
            obstacleDraft={obstacleDraft}
            buildArea={buildArea}
            onObstacleBaseYChange={setObstacleBaseY}
            onObstacleHeightChange={setObstacleHeight}
            onObstacleConfirm={commitObstacle}
            onObstacleCancel={cancelObstacleDraft}
          />
          <RightPanel
            open={rightOpen}
            onClose={() => setRightOpen(false)}
            design={design}
            footer={<BomExportFooter onExport={exportBom} />}
          />
          <ActiveToolBar tool={tool} />
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
        onZoom={(delta) => viewportRef.current?.zoomBy(delta)}
        onResetView={() => viewportRef.current?.resetView()}
      />
      {aboutOpen && (
        <AboutModal
          productName={PRODUCT_NAME}
          openExternal={platform.openExternal}
          onClose={() => setAboutOpen(false)}
        />
      )}
      {welcome && (
        <WelcomeScreen
          stored={welcome.stored}
          greeting={welcome.greeting}
          onContinue={continueStored}
          onDeleteStored={deleteStored}
          onCreate={createDesign}
        />
      )}
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
    </div>
  );
}

/** "BOM_MAIN_LOOP.pdf" from a design named "Main Loop". */
function bomFilename(design: DesignState): string {
  const base = design.metadata.filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase();
  return `BOM_${base || "UNTITLED"}.pdf`;
}
