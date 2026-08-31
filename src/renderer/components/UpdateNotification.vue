<template>
  <!-- Update Downloaded Snackbar (restart flow: Windows/Linux) -->
  <v-snackbar
    v-if="visible && status === 'downloaded'"
    v-model="visible"
    color="success"
    :timeout="-1"
    location="bottom"
    data-testid="update-snackbar"
  >
    <div class="d-flex align-center">
      <v-icon
        icon="mdi-check-circle"
        class="mr-2"
      />
      <div>
        <div class="font-weight-medium">
          Version {{ version }} downloaded — restart to update?
        </div>
      </div>
    </div>
    <template #actions>
      <v-btn
        color="white"
        variant="text"
        data-testid="update-restart"
        @click="handleInstall"
      >
        Restart
      </v-btn>
      <v-btn
        color="white"
        variant="text"
        data-testid="update-later"
        @click="dismiss"
      >
        Later
      </v-btn>
    </template>
  </v-snackbar>

  <!-- Update Available Snackbar (download page flow: macOS) -->
  <v-snackbar
    v-else-if="visible && status === 'available'"
    v-model="visible"
    color="success"
    :timeout="-1"
    location="bottom"
    data-testid="update-snackbar"
  >
    <div class="d-flex align-center">
      <v-icon
        icon="mdi-check-circle"
        class="mr-2"
      />
      <div>
        <div class="font-weight-medium">
          New version {{ version }} available
        </div>
      </div>
    </div>
    <template #actions>
      <v-btn
        color="white"
        variant="text"
        data-testid="update-download"
        @click="handleOpenPage"
      >
        Download
      </v-btn>
      <v-btn
        color="white"
        variant="text"
        data-testid="update-later"
        @click="dismiss"
      >
        Later
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
import { useUpdater } from '../composables/useUpdater';

const { status, version, visible, dismiss, install, openPage } = useUpdater();

async function handleInstall(): Promise<void> {
  await install();
}

async function handleOpenPage(): Promise<void> {
  await openPage();
}
</script>
