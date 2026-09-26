<script setup>
import { t, categoryName, messageText, locale } from "../i18n";
import { ref, onMounted } from "vue";
import { Files, Plus, Trash2, Pencil, ArrowRight } from "lucide-vue-next";
import { state, date } from "../state";
import { readDrafts, deleteDraft } from "../drafts";
import { isPreparedPhoto } from "../photos";
const drafts = ref([]),
  error = ref(""),
  confirming = ref(null);
function load() {
  try {
    drafts.value = readDrafts(state.session.user_id);
  } catch (e) {
    error.value = e.message;
  }
}
function remove(id) {
  try {
    deleteDraft(state.session.user_id, id);
    confirming.value = null;
    load();
  } catch (e) {
    error.value = e.message;
  }
}
onMounted(load);
</script>
<template>
  <div class="page drafts-page">
    <div class="section-title">
      <div>
        <p class="eyebrow purple">{{ t("GOOD FINDS TAKE TIME") }}</p>
        <h1>{{ t("Your drafts") }} <span class="purple">.</span></h1>
        <p class="muted">
          {{ t("Saved in this browser, ready when you are.") }}
        </p>
      </div>
      <RouterLink to="/sell" class="button purple-btn"
        ><Plus :size="18" /> {{ t("New listing") }}
      </RouterLink>
    </div>
    <div v-if="error" role="alert" class="error-box">
      {{ messageText(error) }}
    </div>
    <div v-else-if="!drafts.length" class="empty">
      <Files :size="44" />
      <h2>{{ t("A little room for ideas.") }}</h2>
      <p>{{ t("Save an unfinished listing and it will appear here.") }}</p>
      <RouterLink to="/sell" class="button outline">
        {{ t("Create your first draft") }} <ArrowRight :size="18"
      /></RouterLink>
    </div>
    <div v-else class="draft-list">
      <article v-for="d in drafts" :key="d.id" class="draft-row">
        <div class="draft-icon">
          <img
            v-if="isPreparedPhoto(d.form.photo)"
            :src="d.form.photo"
            alt=""
          /><Files v-else :size="25" />
        </div>
        <div class="draft-info">
          <span class="small-label"> {{ t("UNPUBLISHED") }} </span>
          <h2>{{ d.form.name || t("Untitled collectible") }}</h2>
          <p>{{ t("Saved {time}", { time: date(d.updated) }) }}</p>
        </div>
        <div v-if="confirming === d.id" class="delete-confirm">
          <span> {{ t("Delete this draft?") }} </span
          ><button class="button danger small" @click="remove(d.id)">
            {{ t("Delete") }}</button
          ><button class="button outline small" @click="confirming = null">
            {{ t("Keep") }}
          </button>
        </div>
        <div v-else class="draft-actions">
          <RouterLink
            :to="{ path: '/sell', query: { draft: d.id } }"
            class="button outline small"
            ><Pencil :size="16" /> {{ t("Continue editing") }} </RouterLink
          ><button
            class="icon-button"
            :aria-label="
              t('Delete draft {name}', {
                name: d.form.name || t('Untitled collectible'),
              })
            "
            @click="confirming = d.id"
          >
            <Trash2 :size="19" />
          </button>
        </div>
      </article>
    </div>
  </div>
</template>
