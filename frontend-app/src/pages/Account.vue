<script setup>
import { t, categoryName, messageText, locale } from "../i18n";
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute } from "vue-router";
import { Plus, Files, PackageOpen, Pencil } from "lucide-vue-next";
import { state, api, enrich, notify } from "../state";
import { useLiveRefresh } from "../useLiveRefresh";
import ItemCard from "../components/ItemCard.vue";
const route = useRoute(),
  profile = ref(null),
  tab = ref("selling"),
  items = ref([]),
  loading = ref(true),
  error = ref(""),
  syncError = ref(""),
  nameDialog = ref(null),
  firstName = ref(""),
  lastName = ref(""),
  savingName = ref(false),
  nameError = ref(""),
  now = ref(Date.now()),
  own = computed(() => profile.value?.user_id === state.session?.user_id),
  nameChanged = computed(
    () =>
      firstName.value.trim() !== profile.value?.first_name ||
      lastName.value.trim() !== profile.value?.last_name,
  );
const clock = setInterval(() => (now.value = Date.now()), 1000);
onUnmounted(() => {
  clearInterval(clock);
  request++;
  disposed = true;
});
let request = 0,
  pending = false,
  disposed = false;
const refresh = useLiveRefresh(
  () => load(true),
  () => !pending && !savingName.value && !nameDialog.value?.open,
);
async function select(key) {
  tab.value = key;
  return load();
}
async function load(silent = false) {
  silent = silent === true && !!profile.value;
  const current = ++request;
  const selected = tab.value;
  pending = true;
  if (!silent) {
    loading.value = true;
    error.value = "";
  }
  try {
    const updated = await api(
      `/users/${route.params.id || state.session?.user_id}`,
    );
    if (disposed || current !== request) return;
    const enriched = await enrich(updated[selected]);
    if (disposed || current !== request) return;
    profile.value = updated;
    items.value = enriched;
    error.value = "";
    syncError.value = "";
  } catch (e) {
    if (!disposed && current === request) {
      if (silent) syncError.value = e.message;
      else error.value = e.message;
    }
  } finally {
    if (!disposed && current === request) {
      loading.value = false;
      pending = false;
    }
  }
}
onMounted(load);
function editName() {
  firstName.value = profile.value.first_name;
  lastName.value = profile.value.last_name;
  nameError.value = "";
  nameDialog.value.showModal();
}
function closeNameEditor() {
  if (!savingName.value) nameDialog.value.close();
}
async function saveName() {
  if (savingName.value || !own.value || !nameChanged.value) return;
  savingName.value = true;
  nameError.value = "";
  try {
    const updated = await api(`/users/${profile.value.user_id}`, {
      method: "PATCH",
      body: {
        first_name: firstName.value.trim(),
        last_name: lastName.value.trim(),
      },
    });
    Object.assign(profile.value, updated);
    nameDialog.value.close();
    notify("Your name has been updated.");
    await select(tab.value);
  } catch (e) {
    nameError.value = e.message;
  } finally {
    savingName.value = false;
  }
}
</script>
<template>
  <div class="page account-page">
    <div v-if="profile" class="profile-header">
      <span class="avatar big"
        >{{ [...profile.first_name][0] }}{{ [...profile.last_name][0] }}</span
      >
      <div>
        <p class="eyebrow purple">
          {{ own ? t("YOUR COLLECTOR SPACE") : t("COLLECTOR PROFILE") }}
        </p>
        <div class="profile-name">
          <h1>
            {{ profile.first_name }} {{ profile.last_name
            }}<span class="purple">.</span>
          </h1>
          <button
            v-if="own"
            type="button"
            class="button outline small"
            @click="editName"
          >
            <Pencil :size="15" /> {{ t("Edit name") }}
          </button>
        </div>
        <p class="muted">
          {{
            own
              ? t("The finds, the bids, the ones worth keeping.")
              : t("Explore this collector’s listings and auction activity.")
          }}
        </p>
      </div>
      <div v-if="own" class="profile-actions">
        <RouterLink class="button purple-btn" to="/sell"
          ><Plus :size="18" /> {{ t("List an item") }} </RouterLink
        ><RouterLink class="button outline" to="/drafts"
          ><Files :size="18" /> {{ t("My drafts") }}
        </RouterLink>
      </div>
    </div>
    <dialog
      v-if="profile"
      ref="nameDialog"
      class="name-dialog"
      aria-labelledby="name-title"
      aria-describedby="name-description"
      @cancel.prevent="closeNameEditor"
    >
      <h2 id="name-title">{{ t("Edit your name") }}</h2>
      <p id="name-description" class="muted">
        {{ t("This name appears on your profile, listings and bids.") }}
      </p>
      <form class="name-form" @submit.prevent="saveName">
        <label for="profile-first-name">
          {{ t("First name") }}
          <input
            id="profile-first-name"
            v-model="firstName"
            name="first_name"
            autocomplete="given-name"
            maxlength="50"
            required
            :disabled="savingName"
            autofocus
          />
        </label>
        <label for="profile-last-name">
          {{ t("Last name") }}
          <input
            id="profile-last-name"
            v-model="lastName"
            name="last_name"
            autocomplete="family-name"
            maxlength="50"
            required
            :disabled="savingName"
          />
        </label>
        <p class="field-help">
          {{
            t(
              "Up to 50 characters for each name. Chinese and other languages are supported.",
            )
          }}
        </p>
        <p v-if="nameError" class="error-box" role="alert">
          {{ messageText(nameError) }}
        </p>
        <div class="name-actions">
          <button
            type="button"
            class="button outline"
            :disabled="savingName"
            @click="closeNameEditor"
          >
            {{ t("Cancel") }}
          </button>
          <button
            type="submit"
            class="button purple-btn"
            :disabled="
              savingName ||
              !nameChanged ||
              !firstName.trim() ||
              !lastName.trim()
            "
          >
            {{ savingName ? t("Saving…") : t("Save name") }}
          </button>
        </div>
      </form>
    </dialog>
    <div v-if="profile" class="tabs">
      <button
        v-for="[key, label] in [
          ['selling', 'Selling'],
          ['bidding_on', 'Bidding on'],
          ['auctions_ended', 'Ended / cancelled'],
        ]"
        :key="key"
        :class="{ active: tab === key }"
        @click="select(key)"
      >
        {{ t(label) }} <span>{{ profile[key].length }}</span>
      </button>
    </div>
    <p v-if="syncError" class="error-box" role="status">
      {{ t("Updates paused. Reconnecting automatically…") }}
      <button class="text-button" @click="refresh">{{ t("Try again") }}</button>
    </p>
    <div v-if="error" class="error-box" role="alert">
      {{ messageText(error) }}
      <button class="text-button" @click="load">{{ t("Try again") }}</button>
    </div>
    <div v-else-if="loading" class="loading" role="status">
      {{ t("Loading collection…") }}
    </div>
    <div v-else-if="items.length" class="item-grid">
      <ItemCard
        v-for="item in items"
        :key="item.item_id"
        :item="item"
        :now="now"
      />
    </div>
    <div v-else class="empty">
      <PackageOpen :size="42" />
      <h2>{{ t("Room for your next find.") }}</h2>
      <p>
        {{
          tab === "bidding_on"
            ? t("No bids to show here yet.")
            : tab === "selling"
              ? t("No active listings to show here yet.")
              : t("No ended or cancelled listings to show here yet.")
        }}
      </p>
      <RouterLink to="/" class="button purple-btn">
        {{ t("Explore the drop") }}
      </RouterLink>
    </div>
  </div>
</template>
