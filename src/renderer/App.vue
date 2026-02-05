<template>
  <v-app>
    <v-main>
      <v-container>
        <v-row justify="center">
          <v-col
            cols="12"
            md="8"
          >
            <v-card class="elevation-2">
              <v-card-title class="text-h4 text-center py-4">
                <v-icon
                  icon="mdi-file-document-edit"
                  size="large"
                  class="mr-2"
                />
                Document Prefiller
              </v-card-title>
              <v-card-text>
                <p class="text-body-1 text-center">
                  Welcome to the Document Prefiller application!
                </p>
                <v-divider class="my-4" />
                <v-row
                  justify="center"
                  class="mt-4"
                >
                  <v-btn
                    color="primary"
                    prepend-icon="mdi-plus"
                  >
                    New Document
                  </v-btn>
                  <v-btn
                    color="secondary"
                    prepend-icon="mdi-folder-open"
                    class="ml-2"
                  >
                    Open Document
                  </v-btn>
                </v-row>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
// App component setup
</script>

<style scoped>
/* Vuetify styles are handled by the framework */
</style>