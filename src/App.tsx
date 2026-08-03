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
import { ExportPdfModal } from "@/components/ExportPdfModal";
import { LeftRail } from "@/components/LeftRail";
import { RightPanel } from "@/components/RightPanel";
import { SettingsModal, type SettingsTab } from "@/components/SettingsModal";
import { StatusBar } from "@/components/StatusBar";
import { TopBar } from "@/components/TopBar";
import { UpdateNotification } from "@/components/UpdateNotification";
import { ViewportHUD } from "@/components/ViewportHUD";
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings } from "@/domain/app-settings";
import { deserializeDesign, serializeDesign } from "@/domain/design-file";
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
};

export default function App({ platform }: AppProps) {
  const { titleBarInset, titleBarRightInset } = platform.chrome;
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

  // Load persisted global settings once on startup and apply pricing overrides so
  // the BOM/quote reflect the user's saved prices.
  useEffect(() => {
    const store = platform.settings;
    if (!store) return;
    let active = true;
    void (async () => {
      const loaded = await store.load();
      if (!active) return;
      setSettings(mergeSettings(DEFAULT_SETTINGS, loaded.data ?? null));
      // A missing file on first run reports no error and no data. An actual
      // read failure looks identical from `data` alone, and silently showing
      // defaults would invite an installer to re-enter prices that are still
      // on disk, unreadable.
      if (loaded.error) {
        setErrorFlash(`Could not read saved settings: ${loaded.error}`);
      }
    })();
    return () => {
      active = false;
    };
  }, [platform.settings, setErrorFlash]);

  // Surface the on-brand "update ready" prompt. Listen for the live push and
  // also query for an update that finished downloading before this listener
  // attached (autoUpdateSupported platforms only — elsewhere it stays null).
  useEffect(() => {
    const updates = platform.updates;
    if (!updates) return;
    const unsubscribe = updates.onDownloaded((info) => {
      setUpdateReady(info.version);
    });
    let active = true;
    void (async () => {
      const pending = await updates.getPending();
      if (active && pending) setUpdateReady(pending.version);
    })();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [platform.updates]);

  const updateSettings = useCallback(
    (next: AppSettings) => {
      // Applied on screen either way — the installer's typing should not vanish
      // because the disk refused it — but a failed write has to be said out
      // loud. Settings hold the only copy of part prices and the tax rate
      // (ADR-0003), so silently losing them means the next launch blocks quote
      // export again with no explanation (issue #73).
      setSettings(next);
      const store = platform.settings;
      if (!store) return;
      void (async () => {
        const result = await store.save(JSON.stringify(next, null, 2));
        if (!result.ok) {
          setErrorFlash(`Settings not saved: ${result.error ?? "unknown error"}`);
        }
      })();
    },
    [platform.settings, setErrorFlash]
  );

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
    setExportOpen(false);
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
        title: "Close PTSBuilder",
        message: "This design has unsaved changes. They will be lost.",
        confirmLabel: "Discard and close",
        onConfirm: () => void gate.confirm()
      });
    });
  }, [dirty, platform.closeGate]);

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
        onOpen={handleOpen}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSaveAs()}
        documentLabel={`${displayFilename(session)}${dirty ? " •" : ""}`}
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
            errorFlash={errorFlash}
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
            pricing={settings.pricing}
            taxRate={settings.taxRate}
            onExport={() => setExportOpen(true)}
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
      {exportOpen && (
        <ExportPdfModal
          design={design}
          savePdf={platform.savePdf}
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
      {aboutOpen && (
        <AboutModal
          openExternal={platform.openExternal}
          updates={platform.updates}
          onClose={() => setAboutOpen(false)}
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
      {updateReady && platform.updates && (
        <UpdateNotification
          version={updateReady}
          updates={platform.updates}
          onDismiss={() => setUpdateReady(null)}
        />
      )}
    </div>
  );
}
