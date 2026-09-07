/**
 * useUpdater Composable
 * Dialog state machine for the update offer, driven by updater IPC events
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import type {
  UpdateStatusEvent,
  UpdaterStatus,
  UpdaterSuggestedAction,
} from '../../shared/types';

/**
 * Dialog state machine states:
 * - 'offer': an update is offered, awaiting user consent
 * - 'downloading': a user-initiated download is in flight
 * - 'downloaded': the update is ready and a restart is suggested
 * - 'download-error': a user-initiated download failed
 * - null: the dialog is hidden
 */
export type UpdaterDialogState = 'offer' | 'downloading' | 'downloaded' | 'download-error' | null;

/**
 * useUpdater Composable
 *
 * Subscribes to updater status broadcasts and folds in a startup snapshot.
 * The dialog opens only for actionable events (offer, download progress,
 * downloaded restart) and hides permanently for the session once dismissed.
 *
 * @example
 * ```typescript
 * const { dialogState, dismiss, download, skipVersion, backToOffer, openChangelog } = useUpdater();
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

  /** Installed app version from the startup snapshot (display-only) */
  const currentVersion = ref<string>('');

  /** Error text shown in the 'download-error' state */
  const errorMessage = ref<string>('');

  /** Dialog state machine */
  const dialogState = ref<UpdaterDialogState>(null);

  /**
   * Once set, the dialog stays hidden for the rest of the session: every
   * subsequent broadcast (offer, downloading, progress, downloaded, error)
   * maps to null. Without gating progress events too, Escape-during-download
   * would let the next download-progress broadcast re-open the dialog.
   * Set by ✕ close, Later on downloaded, Escape/outside-click, and a
   * successful skipVersion().
   */
  let sessionDismissed = false;

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

    if (sessionDismissed) {
      dialogState.value = null;
      return;
    }

    switch (event.status) {
      case 'available':
        if (event.suggestedAction === 'install' || event.suggestedAction === 'open-page') {
          dialogState.value = 'offer';
        }
        break;
      case 'downloading':
        dialogState.value = 'downloading';
        break;
      case 'downloaded':
        if (event.suggestedAction === 'restart') {
          dialogState.value = 'downloaded';
        }
        break;
      case 'error':
        // Only a failed user-initiated download surfaces; startup-check
        // errors keep today's invisible behavior.
        if (dialogState.value === 'downloading') {
          errorMessage.value = event.error ?? '';
          dialogState.value = 'download-error';
        } else {
          dialogState.value = null;
        }
        break;
      // No dialog transition for the remaining statuses
      case 'idle':
      case 'checking':
      case 'not-available':
        break;
    }
  }

  // ============================================================================
  // OPERATIONS
  // ============================================================================

  /**
   * Hide the dialog and suppress every further broadcast this session
   */
  function dismiss(): void {
    sessionDismissed = true;
    dialogState.value = null;
  }

  /**
   * Download the offered update (win/linux consent flow). The response is
   * checked because main's guard failures (darwin / never-offered) return
   * failure WITHOUT broadcasting — an unchecked response would strand the
   * dialog at 0% forever.
   */
  async function download(): Promise<void> {
    dialogState.value = 'downloading';
    progress.value = 0;
    const response = await window.api.updater.downloadUpdate();
    if (!response.success) {
      errorMessage.value = response.error ?? '';
      dialogState.value = 'download-error';
    }
  }

  /**
   * Retry the download from the 'download-error' state (inherits the check)
   */
  function retryDownload(): Promise<void> {
    return download();
  }

  /**
   * Persist the decision to never be offered this exact version again;
   * on success hide the dialog for the rest of the session
   */
  async function skipVersion(): Promise<void> {
    const response = await window.api.updater.skipVersion();
    if (response.success) {
      sessionDismissed = true;
      dialogState.value = null;
    }
  }

  /**
   * Return from 'download-error' to 'offer' (dialog Back action) — no event
   * re-emits 'available', so the renderer must restore the offer itself
   */
  function backToOffer(): void {
    if (dialogState.value === 'download-error') {
      dialogState.value = 'offer';
    }
  }

  /**
   * Open the changelog: the offered version's release tag page. Uses the
   * offered-version ref, NEVER snapshot.currentVersion (the installed
   * version) — that would open the wrong release's page.
   */
  async function openChangelog(): Promise<void> {
    await window.api.updater.openReleasesPage(version.value);
  }

  /**
   * Install the downloaded update (app relaunches via main process)
   */
  async function install(): Promise<void> {
    await window.api.updater.installUpdate();
  }

  /**
   * Open the GitHub releases page for manual download (macOS flow); passes
   * no version so main opens the plain RELEASES_URL
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
    currentVersion.value = snapshot.currentVersion;
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
    currentVersion,
    errorMessage,
    dialogState,

    /**
     * @deprecated Derived alias of `dialogState !== null`, kept compiling
     * for UpdateNotification.vue until T5 rewrites the component. T5
     * removes this alias together with the old snackbar.
     */
    visible: computed(() => dialogState.value !== null),

    // Operations
    dismiss,
    download,
    retryDownload,
    skipVersion,
    backToOffer,
    openChangelog,
    install,
    openPage,
  };
}
