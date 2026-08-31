/**
 * useUpdater Composable
 * Manages auto-update notification state driven by updater IPC events
 */

import { ref, onMounted, onUnmounted } from 'vue';
import type {
  UpdateStatusEvent,
  UpdaterStatus,
  UpdaterSuggestedAction,
} from '../../shared/types';

/**
 * useUpdater Composable
 *
 * Subscribes to updater status broadcasts and folds in a startup snapshot.
 * The snackbar is shown only for actionable states ('restart' | 'open-page');
 * checking/not-available/downloading/error/idle stay silent.
 *
 * @example
 * ```typescript
 * const { status, version, progress, suggestedAction, visible, dismiss, install, openPage } = useUpdater();
 * ```
 */
export function useUpdater() {
  // ============================================================================
  // STATE
  // ============================================================================

  /** Current updater status */
  const status = ref<UpdaterStatus>('idle');

  /** Version of the available update, when known */
  const version = ref<string>('');

  /** Download progress (0-100), only during 'downloading' */
  const progress = ref<number>(0);

  /** Suggested action for the user, when an action is required */
  const suggestedAction = ref<UpdaterSuggestedAction | null>(null);

  /** Whether the notification snackbar is shown */
  const visible = ref<boolean>(false);

  /**
   * Guards the snapshot fold-in: invoke resolution and ipcRenderer.on delivery
   * have no ordering guarantee, so a snapshot taken before a fresher broadcast
   * must not clobber it when the response arrives late.
   */
  let receivedEvent = false;

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  /**
   * Fold an UpdateStatusEvent (broadcast or snapshot payload) into the refs
   */
  function applyEvent(event: UpdateStatusEvent): void {
    status.value = event.status;
    version.value = event.version ?? '';
    progress.value = event.progress ?? 0;
    suggestedAction.value = event.suggestedAction ?? null;
    visible.value =
      event.suggestedAction === 'restart' || event.suggestedAction === 'open-page';
  }

  // ============================================================================
  // OPERATIONS
  // ============================================================================

  /**
   * Hide the notification without acting
   */
  function dismiss(): void {
    visible.value = false;
  }

  /**
   * Install the downloaded update (app relaunches via main process)
   */
  async function install(): Promise<void> {
    await window.api.updater.installUpdate();
  }

  /**
   * Open the GitHub releases page for manual download (macOS flow)
   */
  async function openPage(): Promise<void> {
    await window.api.updater.openReleasesPage();
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onMounted(async () => {
    const updater = window.api?.updater;
    if (!updater) {
      return;
    }

    // (1) Subscribe FIRST so a broadcast always wins over the snapshot
    updater.onUpdaterStatus((event: UpdateStatusEvent) => {
      receivedEvent = true;
      applyEvent(event);
    });

    // (2) THEN take the pure startup snapshot (no network activity)
    const snapshot = await updater.getUpdateState();
    if (!snapshot.supported) {
      // Dev mode / portable / unsupported platform: render nothing
      return;
    }
    if (!receivedEvent) {
      applyEvent(snapshot.status);
    }
  });

  onUnmounted(() => {
    window.api?.updater.removeUpdaterStatusListener();
  });

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    status,
    version,
    progress,
    suggestedAction,
    visible,

    // Operations
    dismiss,
    install,
    openPage,
  };
}
