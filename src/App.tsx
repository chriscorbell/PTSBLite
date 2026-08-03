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
import { ActiveToolBar } from "@/components/ActiveToolBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LeftRail } from "@/components/LeftRail";
import { RightPanel } from "@/components/RightPanel";
import { StatusBar } from "@/components/StatusBar";
import { TopBar } from "@/components/TopBar";
import { ViewportHUD } from "@/components/ViewportHUD";
import { deserializeDesign, serializeDesign } from "@/domain/design-file";
import {
  isWorthKeeping,
  readStoredSession,
  UNREADABLE_SESSION_MESSAGE
} from "@/domain/session-autosave";
import { canRedo, canUndo } from "@/domain/design-history";
import {
  displayFilename,
  documentSessionReducer,
  initDocumentSession,
  isDirty
} from "@/domain/document-session";
import {
  DEFAULT_FILENAME,
  DEFAULT_REVISION,
  designFromScene,
  emptyDesign,
  newOccupantId,
  obstaclesWithinBuildArea,
  partsWithinBuildArea
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
import type { ProductSurfaces } from "@/products/types";
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

/** "2 parts and 1 obstacle", for the shrink confirmation. */
function describeLoss(parts: number, obstacles: number): string {
  const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  if (parts > 0 && obstacles > 0) {
    return `${plural(parts, "part")} and ${plural(obstacles, "obstacle")}`;
  }
  return parts > 0 ? plural(parts, "part") : plural(obstacles, "obstacle");
}

export type AppProps = {
  /** The host this is running inside. See `src/platform/types.ts`. */
  platform: Platform;
  /** What differs between PTSBuilder and PTSBuilderLite. */
  product: ProductSurfaces;
};

export default function App({ platform, product }: AppProps) {
  const { titleBarInset, titleBarRightInset } = platform.chrome;
  // A host that autosaves a session has no Open, Save or Save As, and no
  // unsaved state to mark — the design is never not saved.
  const usesFiles = platform.documents.kind === "files";
  const sessionStore = platform.documents.kind === "session" ? platform.documents : null;

  // Read at first render rather than in an effect. This is the design the app
  // starts from, not a reaction to something — an effect would render the empty
  // design first, then replace it, and `localStorage` is synchronous anyway.
  const [storedSession] = useState(() =>
    readStoredSession(sessionStore ? sessionStore.load() : null)
  );
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
  const [session, dispatchDocument] = useReducer(
    documentSessionReducer,
    DESIGN_METADATA,
    (metadata) => initDocumentSession(emptyDesign(metadata))
  );
  const history = session.history;
  const design = history.present;
  const dirty = isDirty(session);
  // The bullet marks unsaved work against a file. A session that autosaves has
  // nothing to mark, so Lite shows the name alone.
  const documentLabel = usesFiles
    ? `${displayFilename(session)}${dirty ? " •" : ""}`
    : displayFilename(session);
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

  // The design found in storage, until the visitor answers. Null once they have.
  const [restoreOffer, setRestoreOffer] = useState<DesignState | null>(
    storedSession.status === "restorable" ? storedSession.design : null
  );
  // Set when a write fails, cleared when one succeeds. While it holds a message
  // there is genuinely unsaved work, which is the only time Lite warns on exit.
  const [autosaveError, setAutosaveError] = useState<string | null>(
    storedSession.status === "unreadable" ? UNREADABLE_SESSION_MESSAGE : null
  );
  const [rightOpen, setRightOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  // Which settings screen is open, if any. The id comes from the product's own
  // menu; App does not know what the screens are.
  const [settingsTab, setSettingsTab] = useState<string | null>(null);
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
    console.warn(`PTSBuilder: stored design could not be read - ${storedSession.reason}`);
    sessionStore?.preserveUnreadable();
  }, [storedSession, sessionStore]);

  // Autosave, debounced so a drag does not write on every frame. Nothing is
  // written until the visitor answers the restore offer, or the blank design
  // they are looking at would overwrite the one being offered.
  useEffect(() => {
    if (!sessionStore || restoreOffer) return;
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
  }, [design, restoreOffer, sessionStore]);

  // Write immediately when the tab is being hidden or torn down, which is the
  // last chance the browser gives. `visibilitychange` is the reliable one and
  // covers a tab switch; `pagehide` covers navigation and the back/forward
  // cache. Both are idempotent, and neither survives a crash — the debounce
  // above is what covers that.
  useEffect(() => {
    if (!sessionStore || restoreOffer) return;
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
  }, [design, restoreOffer, sessionStore]);

  // The only time a browser build warns on the way out. Normally autosave means
  // there is nothing to lose and the prompt would be pure friction — but once a
  // write has failed there is, and the browser's own dialog is all there is.
  useEffect(() => {
    if (!sessionStore || !autosaveError) return;
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

  const updateMetadata = useCallback(
    (metadata: DesignState["metadata"]) => {
      const d = design;
      const prev = d.metadata.buildArea;
      const next = metadata.buildArea;
      const areaChanged =
        prev.width !== next.width || prev.depth !== next.depth || prev.height !== next.height;
      if (!areaChanged) {
        // Cosmetic metadata (name/revision): swap in place, not an undoable edit.
        dispatchDocument({ type: "replace-present", design: { ...d, metadata } });
        return;
      }
      // Build area changed: parts that no longer fit are removed, and obstacles
      // are clipped to the new bounds. Both are destructive, so say what will be
      // lost first — it was previously silent, and only discoverable by noticing
      // the design had fewer parts in it than before (issue #12).
      const keptParts = partsWithinBuildArea(d.parts, next);
      const droppedParts = d.parts.length - keptParts.length;
      const droppedObstacles =
        d.obstacles.length - obstaclesWithinBuildArea(d.obstacles, next).length;

      const apply = () => {
        commitDesign(designFromScene({ parts: keptParts, obstacles: d.obstacles }, metadata));
        // The active plane and any half-built obstacle may now sit above the
        // ceiling; both are re-derived from the area rather than left stale.
        dispatchPlacement({ type: "constrain-to-build-area", buildArea: next });
      };

      if (droppedParts === 0 && droppedObstacles === 0) {
        apply();
        return;
      }
      setConfirm({
        title: "Shrink build area",
        message: `${describeLoss(droppedParts, droppedObstacles)} will no longer fit and will be removed. This can be undone.`,
        confirmLabel: "Shrink and remove",
        onConfirm: apply
      });
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
  }, [undo, redo, selectTool, buildArea]);

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

  /**
   * Write the document. `promptForPath` forces the dialog, which is what Save
   * As does; Save only prompts when the document has no home yet.
   */
  const writeDocument = useCallback(
    async (promptForPath: boolean) => {
      const documents = platform.documents;
      if (documents.kind !== "files") {
        setErrorFlash("Save is unavailable: this build does not use files.");
        return false;
      }
      try {
        const json = JSON.stringify(serializeDesign(design, __APP_VERSION__), null, 2);
        const result = await documents.save({
          json,
          path: promptForPath ? null : session.path
        });
        if (result.canceled) return false;
        if (result.error || !result.path) {
          setErrorFlash(`Save failed: ${result.error ?? "no path returned"}`);
          return false;
        }
        dispatchDocument({ type: "saved", path: result.path });
        setErrorFlash(null);
        return true;
      } catch (err) {
        setErrorFlash(`Save failed: ${String(err)}`);
        return false;
      }
    },
    [design, platform.documents, session.path, setErrorFlash]
  );

  const handleSave = useCallback(() => writeDocument(false), [writeDocument]);
  const handleSaveAs = useCallback(() => writeDocument(true), [writeDocument]);

  /** Clear the transient state that belonged to the document being replaced. */
  const resetForNewDocument = useCallback(() => {
    selectTool("cursor");
    setAutoBuildJustRan(false);
    setAutoBuildSummary(null);
    setStatusOpen(false);
    setErrorFlash(null);
  }, [selectTool, setErrorFlash]);

  const openDocument = useCallback(async () => {
    const documents = platform.documents;
    if (documents.kind !== "files") {
      setErrorFlash("Open is unavailable: this build does not use files.");
      return;
    }
    try {
      const result = await documents.open();
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
      dispatchDocument({
        type: "opened",
        design: parsed.design,
        path: result.path ?? ""
      });
      resetForNewDocument();
    } catch (err) {
      setErrorFlash(`Open failed: ${String(err)}`);
    }
  }, [platform.documents, resetForNewDocument, setErrorFlash]);

  /**
   * Run `action`, but if there is unsaved work ask first. Replaces a raw
   * window.confirm, which is modal to the OS, unstyled, and untestable.
   */
  const guardUnsaved = useCallback(
    (title: string, confirmLabel: string, action: () => void) => {
      if (!dirty) {
        action();
        return;
      }
      setConfirm({
        title,
        message: "This design has unsaved changes. They will be lost.",
        confirmLabel,
        onConfirm: action
      });
    },
    [dirty]
  );

  const handleOpen = useCallback(() => {
    guardUnsaved("Open another design", "Discard and open", () => void openDocument());
  }, [guardUnsaved, openDocument]);

  // The host vetoes the window close and asks here, because only the app knows
  // whether there is unsaved work. Re-subscribing when `dirty` changes rather
  // than mirroring it into a ref: refs must not be written during render, and
  // a listener swap per commit is far cheaper than that unsafety.
  useEffect(() => {
    const gate = platform.closeGate;
    if (!gate) return;
    return gate.onRequested(() => {
      if (!dirty) {
        void gate.confirm();
        return;
      }
      setConfirm({
        title: `Close ${product.name}`,
        message: "This design has unsaved changes. They will be lost.",
        confirmLabel: "Discard and close",
        onConfirm: () => void gate.confirm()
      });
    });
  }, [dirty, platform.closeGate, product.name]);

  const handleNew = useCallback(() => {
    guardUnsaved("New design", "Discard and start over", () => {
      dispatchDocument({ type: "new", design: emptyDesign(DESIGN_METADATA) });
      resetForNewDocument();
    });
  }, [guardUnsaved, resetForNewDocument]);

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
    <div className="app-shell" style={shellStyle}>
      <TopBar
        onNew={handleNew}
        {...(usesFiles
          ? {
              onOpen: handleOpen,
              onSave: () => void handleSave(),
              onSaveAs: () => void handleSaveAs()
            }
          : {})}
        documentLabel={documentLabel}
        productName={product.name}
        settingsMenu={product.settingsMenu}
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
            errorFlash={errorFlash ?? autosaveError ?? product.error}
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
            footer={product.renderBomFooter({ design, openSettings: setSettingsTab })}
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
      {settingsTab &&
        product.renderSettings({
          tab: settingsTab,
          metadata: design.metadata,
          onMetadataChange: updateMetadata,
          onClose: () => setSettingsTab(null)
        })}
      {aboutOpen && (
        <AboutModal
          productName={product.name}
          openExternal={platform.openExternal}
          updates={platform.updates}
          onClose={() => setAboutOpen(false)}
        />
      )}
      {restoreOffer && (
        <ConfirmDialog
          title="Pick up where you left off?"
          message="This browser has a design you were working on. Restoring it replaces the empty one you are looking at."
          confirmLabel="Restore it"
          cancelLabel="Start fresh"
          onConfirm={() => {
            dispatchDocument({ type: "opened", design: restoreOffer, path: "" });
            setRestoreOffer(null);
            resetForNewDocument();
          }}
          onCancel={() => {
            // Declining discards it. Saying yes to "start fresh" and then
            // finding the old design offered again on the next visit would make
            // the answer meaningless.
            sessionStore?.clear();
            setRestoreOffer(null);
          }}
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
      {product.renderOverlays({ design, openSettings: setSettingsTab })}
    </div>
  );
}
