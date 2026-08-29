import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ActiveToolBar } from "@/components/ActiveToolBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ControlsLegend } from "@/components/ControlsLegend";
import { QuickStartGuide } from "@/components/QuickStartGuide";
import { LeftRail } from "@/components/LeftRail";
import { FinalizeModal } from "@/components/FinalizeModal";
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
import { designFromScene, emptyDesign, newOccupantId } from "@/domain/design-state";
import {
  roomHeightFeet,
  roomRect,
  roomWalls,
  floorAtElevation,
  floorBaseElevation,
  floorSeparatorY,
  plenumBands
} from "@/domain/floors";
import { isAutoBuildPart, totalPathLength } from "@/domain/parts";
import { restOnObstacles, type ObstacleKind } from "@/domain/obstacle-placement";
import {
  attemptPlacement,
  commitObstacleDraft,
  INITIAL_PLACEMENT_SESSION,
  placementGhost,
  placementLandingCells,
  placementSessionReducer,
  type PlacementResult
} from "@/domain/placement-session";
import { autoBuildOpenPortPair, type UnroutedPair } from "@/domain/pathfinder";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import { BUILD_AREA } from "@/domain/sparse-grid";
import {
  floorShadows,
  ghostElevation,
  heightMarkers,
  heightMarkersVisible,
  openPortMarkers,
  placedPartShadows
} from "@/domain/renderer-affordances";
import { validate } from "@/domain/validation";
import type { Platform } from "@/platform/types";
import { Viewport, type ViewportShot } from "@/renderer/Viewport";
import type { CameraView } from "@/renderer/camera-views";
import type { AutoBuildSummary, DesignState, Scene, ToolId, Vec3 } from "@/types";

const KEY_TOOL_MAP: Record<string, ToolId> = {
  v: "cursor",
  o: "obstacle",
  x: "erase"
};

const PRODUCT_NAME = "PTSBLite";
const DESIGN_METADATA = {};

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

/** Explain what Auto-Build could not route, or null when it routed everything. */
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
  // The volume placement and the viewport work in: the fixed build area,
  // never the room — parts may be placed outside the room (ADR-0017).
  const buildArea = BUILD_AREA;
  const undoAvailable = canUndo(history);
  const redoAvailable = canRedo(history);

  // One value, not seven: the placement rules that tie them together live in
  // the domain module, where they can be tested without a renderer.
  const [placement, dispatchPlacement] = useReducer(
    placementSessionReducer,
    INITIAL_PLACEMENT_SESSION
  );
  const tool = placement.tool;
  const obstacleDraft = placement.obstacleDraft;
  const obstacleKind = placement.obstacleKind;
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
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  // The View menu's two settings: which angle the camera was last sent to, and
  // whether height markers stay on rather than following the armed tool.
  const [cameraView, setCameraView] = useState<CameraView | null>(null);
  const [markersPinned, setMarkersPinned] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [autoBuilding, setAutoBuilding] = useState(false);
  const [autoBuildJustRan, setAutoBuildJustRan] = useState(false);
  const [autoBuildSummary, setAutoBuildSummary] = useState<AutoBuildSummary | null>(null);
  const [errorFlash, setErrorFlashRaw] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Filled in by the viewport. Null until it has a renderer, and again once it
  // does not — a browser without WebGL exports the parts list on its own.
  const captureRef = useRef<(() => ViewportShot[]) | null>(null);

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
    console.warn(`PTSBLite: stored design could not be read - ${storedSession.reason}`);
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
   * in-flight obstacle draft, and a stale Auto-Build toast describing a route
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
      if ((k === "1" || k === "2") && !e.metaKey && !e.ctrlKey && design.metadata.multiFloor) {
        const floor = k === "1" ? 1 : 2;
        dispatchPlacement({
          type: "set-elevation",
          elevation: floorBaseElevation(design.metadata, floor),
          buildArea
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectTool, buildArea, welcome, design.metadata]);

  const ghostState = useMemo(() => placementGhost(placement, design), [placement, design]);

  const cancelObstacleDraft = useCallback(() => {
    dispatchPlacement({ type: "cancel-obstacle-draft" });
  }, []);

  const commitObstacle = useCallback(() => {
    const { session, result } = commitObstacleDraft(placement, design, newOccupantId(design, "o"));
    dispatchPlacement({ type: "apply-attempt", session });
    applyPlacementResult(result);
  }, [applyPlacementResult, design, placement]);

  const setObstacleKind = useCallback((kind: ObstacleKind) => {
    dispatchPlacement({ type: "set-obstacle-kind", kind });
  }, []);

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

  /**
   * Where the pointer's cell actually lands. A blower or terminal aimed at an
   * impenetrable obstacle steps up on top of it rather than being refused —
   * the client builds shelves out of them and stands equipment on top. Tubes
   * and bends continue from a port and are left alone, and the obstacle tool
   * has to be able to draw over what is already there.
   */
  const restingCell = useCallback(
    (cell: Vec3): Vec3 =>
      tool === "blower" || tool === "terminal" ? restOnObstacles(design, cell, buildArea) : cell,
    [tool, design, buildArea]
  );

  const onHover = useCallback(
    (cell: Vec3) => dispatchPlacement({ type: "hover", cell: restingCell(cell) }),
    [restingCell]
  );

  const onPlace = useCallback(
    (cell: Vec3, target?: { partId?: string }) => {
      const { session, result } = attemptPlacement(
        placement,
        design,
        restingCell(cell),
        newOccupantId(design, "p"),
        target?.partId
      );
      dispatchPlacement({ type: "apply-attempt", session });
      applyPlacementResult(result);
    },
    [applyPlacementResult, design, placement, restingCell]
  );

  const exportBom = useCallback(async () => {
    try {
      // Taken now rather than held from earlier: the design on screen when the
      // PDF is asked for is the one the document should show.
      const views = captureRef.current?.() ?? [];
      const bytes = await generateBomPdf(design, { productName: PRODUCT_NAME, views });
      const result = await platform.savePdf(bytes, bomFilename());
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
      message: "Your current design will be lost.",
      confirmLabel: "Start new design",
      cancelLabel: "Keep current design",
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
      result = autoBuildOpenPortPair(design);
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
      obstacles: design.obstacles.filter((obstacle) => !obstacle.penetrable).length,
      unrouted: result.unroutedPairs.length
    });
    setAutoBuildJustRan(true);
    selectTool("cursor");
    commitDesign(result.design);
    setErrorFlash(unroutedMessage(result.unroutedPairs));
  }, [commitDesign, design, selectTool, setErrorFlash]);

  const resetActiveInteraction = useCallback(() => {
    selectTool("cursor");
    setAutoBuildJustRan(false);
  }, [selectTool]);

  /** Remove every part Auto-Build placed, as one undoable step. */
  const clearAutoBuild = useCallback(() => {
    const kept = design.parts.filter((part) => !isAutoBuildPart(part));
    if (kept.length === design.parts.length) return;
    setConfirm({
      title: "Clear Auto-Build",
      message:
        "Remove every part Auto-Build placed? Manually placed parts remain. This can be undone.",
      confirmLabel: "Clear Auto-Build",
      onConfirm: () => {
        commitDesign(
          designFromScene({ parts: kept, obstacles: design.obstacles }, design.metadata)
        );
        resetActiveInteraction();
        setAutoBuildSummary(null);
        setErrorFlash(null);
      }
    });
  }, [commitDesign, design, resetActiveInteraction, setErrorFlash]);

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
      autoBuildJustRan,
      autoBuildSummary
    }),
    [design, autoBuildJustRan, autoBuildSummary]
  );

  const landingCells = useMemo(() => placementLandingCells(placement, design), [placement, design]);

  // Which floor the placement plane is on, or null for a single-floor design.
  const activeFloor = design.metadata.multiFloor
    ? floorAtElevation(design.metadata, activeElevation)
    : null;
  // The camera follows the active floor, not every elevation nudge: a keypress
  // fine-tuning the plane should not yank the view around.
  const focusY = activeFloor ? floorBaseElevation(design.metadata, activeFloor) : 0;

  const selectFloor = useCallback(
    (floor: 1 | 2) => {
      dispatchPlacement({
        type: "set-elevation",
        elevation: floorBaseElevation(design.metadata, floor),
        buildArea
      });
    },
    [buildArea, design.metadata]
  );

  // What the armed part would be placed at. Read off the ghost itself, not the
  // placement plane: a part resting on an obstacle sits above the plane, and an
  // obstacle draft carries a base and height of its own that the plane knows
  // nothing about.
  const armedElevation = ghostState ? ghostElevation(ghostState) : activeElevation;

  const portMarkers = useMemo(() => openPortMarkers(design, tool), [design, tool]);
  // Heights are labelled only while a placement tool is armed: they answer the
  // question elevation raises, and would be clutter the rest of the time.
  const markersOn = heightMarkersVisible(tool, markersPinned);
  const markers = useMemo(() => (markersOn ? heightMarkers(design) : []), [markersOn, design]);
  // Memoized for identity: the viewport rebuilds its ground group when this
  // prop changes, and the bands only actually change with the metadata.
  const plenum = useMemo(() => plenumBands(design.metadata), [design.metadata]);
  // Memoized for identity like the bands: the viewport rebuilds its ground
  // group when these change, and the room only actually changes with a new
  // design.
  // Where parts sit over the floors below them. The placed ones change only
  // with the design; the armed one is keyed to the ghost, so it follows the
  // pointer and the elevation keys without touching the design.
  const placedShadows = useMemo(() => placedPartShadows(design), [design]);
  const shadows = useMemo(
    () => [...placedShadows, ...floorShadows(ghostState, design.metadata)],
    [placedShadows, ghostState, design.metadata]
  );
  const room = useMemo(() => roomRect(design.metadata), [design.metadata]);
  const walls = useMemo(() => roomWalls(design.metadata), [design.metadata]);

  return (
    <div className="app-shell">
      <TopBar
        onNew={handleNew}
        productName={PRODUCT_NAME}
        onUndo={undo}
        onRedo={redo}
        canUndo={undoAvailable}
        canRedo={redoAvailable}
        onAutoBuild={() => void runAutoBuild()}
        autoBuilding={autoBuilding}
        onView={(next) => setCameraView(next && { ...next })}
        markersPinned={markersPinned}
        onToggleMarkers={() => setMarkersPinned((on) => !on)}
      />
      <div className="app-main">
        <LeftRail
          tool={tool}
          onTool={selectTool}
          partCount={design.parts.length}
          obstacleCount={design.obstacles.length}
          autoBuildPartCount={design.parts.filter(isAutoBuildPart).length}
          onClearParts={clearAllParts}
          onClearObstacles={clearAllObstacles}
          onClearAutoBuild={clearAutoBuild}
        />
        <div className="viewport-area">
          <Viewport
            scene={viewportScene}
            buildArea={buildArea}
            separatorY={floorSeparatorY(design.metadata)}
            roomTop={roomHeightFeet(design.metadata)}
            ghost={ghostState}
            tool={tool}
            onPlace={onPlace}
            onHover={onHover}
            landingCells={landingCells}
            activeElevation={activeElevation}
            activeFloor={activeFloor}
            focusY={focusY}
            plenumBands={plenum}
            heightMarkers={markers}
            ghostHeight={markersOn ? armedElevation : null}
            floorShadows={shadows}
            roomRect={room}
            roomWalls={walls}
            portMarkers={portMarkers}
            view={cameraView}
            captureRef={captureRef}
          />
          <ViewportHUD
            scene={viewportScene}
            tool={tool}
            activeFloor={activeFloor}
            onSelectFloor={selectFloor}
            obstacleKind={obstacleKind}
            onObstacleKindChange={setObstacleKind}
            autoBuilding={autoBuilding}
            errorFlash={errorFlash ?? autosaveError ?? exportError}
            obstacleDraft={obstacleDraft}
            buildArea={buildArea}
            onObstacleBaseYChange={setObstacleBaseY}
            onObstacleHeightChange={setObstacleHeight}
            onObstacleConfirm={commitObstacle}
            onObstacleCancel={cancelObstacleDraft}
          />
          <QuickStartGuide />
          <ControlsLegend />
          <ActiveToolBar tool={tool} elevation={armedElevation} floor={activeFloor} />
        </div>
      </div>
      <StatusBar
        design={design}
        warnings={warnings}
        expanded={statusOpen}
        onToggle={() => setStatusOpen((s) => !s)}
        onFinalize={() => setFinalizeOpen(true)}
      />
      {finalizeOpen && (
        <FinalizeModal
          design={design}
          warnings={warnings}
          onClose={() => setFinalizeOpen(false)}
          onExport={exportBom}
        />
      )}
      {welcome && (
        <WelcomeScreen
          stored={welcome.stored}
          greeting={welcome.greeting}
          onContinue={continueStored}
          onCreate={createDesign}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={confirm.cancelLabel}
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

/**
 * What the exported BOM is called. A constant now that designs carry no name:
 * the room's dimensions are the only thing that distinguishes one from
 * another, and they belong in the document rather than the filename.
 */
function bomFilename(): string {
  return "BOM.pdf";
}
