<template>
  <!--
    Consent-first update dialog. The ONLY sanctioned wiring: v-dialog's
    default close (Escape / outside click) flips the model to false and the
    handler maps that to dismiss() (session dismissal). A plain v-model on a
    local ref would close visually WITHOUT sessionDismissed, so the next
    broadcast would re-open the dialog. All actions live in the default slot
    (v-dialog has no #actions slot — only v-snackbar does).
  -->
  <v-dialog
    max-width="480"
    data-testid="update-dialog"
    :model-value="dialogState !== null"
    @update:model-value="(v: boolean) => { if (!v) dismiss() }"
  >
    <!-- Offer: consent flow -->
    <v-card v-if="dialogState === 'offer'">
      <v-card-title>Update available</v-card-title>
      <v-card-text>
        Version {{ version }} is available (you have {{ currentVersion }}).
      </v-card-text>
      <v-card-actions>
        <v-btn
          v-if="suggestedAction === 'install'"
          color="primary"
          variant="elevated"
          data-testid="update-install"
          @click="download"
        >
          Install update
        </v-btn>
        <v-btn
          v-else
          color="primary"
          variant="elevated"
          data-testid="update-get-update"
          @click="openPage"
        >
          Get update
        </v-btn>
        <v-btn
          variant="text"
          data-testid="update-skip"
          @click="skipVersion"
        >
          Skip this version
        </v-btn>
        <v-btn
          variant="text"
          data-testid="update-changelog"
          @click="openChangelog"
        >
          View changelog
        </v-btn>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          aria-label="Close"
          data-testid="update-close"
          @click="dismiss"
        />
      </v-card-actions>
    </v-card>

    <!-- Downloading: progress only -->
    <v-card v-else-if="dialogState === 'downloading'">
      <v-card-text>
        <div class="mb-2">
          Downloading version {{ version }}…
        </div>
        <v-progress-linear
          data-testid="update-progress"
          :model-value="progress"
        />
      </v-card-text>
    </v-card>

    <!-- Downloaded: restart confirmation (never auto-restarts) -->
    <v-card v-else-if="dialogState === 'downloaded'">
      <v-card-text>
        Version {{ version }} downloaded — restart to update?
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          variant="elevated"
          data-testid="update-restart"
          @click="install"
        >
          Restart now
        </v-btn>
        <v-btn
          variant="text"
          data-testid="update-later"
          @click="dismiss"
        >
          Later
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Download failed: recoverable, no dead end -->
    <v-card v-else-if="dialogState === 'download-error'">
      <v-card-text data-testid="update-error-text">
        {{ errorMessage }}
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          variant="elevated"
          data-testid="update-retry"
          @click="retryDownload"
        >
          Try again
        </v-btn>
        <v-btn
          variant="text"
          data-testid="update-back"
          @click="backToOffer"
        >
          Back
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { useUpdater } from '../composables/useUpdater';

const {
  version,
  progress,
  suggestedAction,
  currentVersion,
  errorMessage,
  dialogState,
  dismiss,
  download,
  retryDownload,
  skipVersion,
  backToOffer,
  openChangelog,
  install,
  openPage,
} = useUpdater();
</script>
