<script setup>
import { t, categoryName, messageText } from "../i18n";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import {
  Search,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Layers,
  X,
  Sparkles,
} from "lucide-vue-next";
import ItemCard from "../components/ItemCard.vue";
import FeaturedCarousel from "../components/FeaturedCarousel.vue";
import { state, api, imagePath } from "../state";
import { useLiveRefresh } from "../useLiveRefresh";
import "../marketplace.css";
const query = ref(""),
  appliedQuery = ref(""),
  category = ref(""),
  group = ref(""),
  items = ref([]),
  collections = ref([]),
  groups = ref([]),
  featured = ref([]),
  total = ref(0),
  totalItems = ref(0),
  loading = ref(true),
  error = ref(""),
  syncError = ref(""),
  page = ref(0),
  now = ref(Date.now());
const pageSize = 12;
const selectedCollection = computed(() =>
  collections.value.find((c) => c.category_id === Number(category.value)),
);
const selectedGroup = computed(() =>
  groups.value.find((g) => g.id === group.value),
);
const filtered = computed(
  () => !!(category.value || group.value || appliedQuery.value),
);
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const visibleItems = computed(() =>
  items.value.filter((item) => item.end_date > now.value),
);
let request = 0;
let pending = false,
  hasLoaded = false,
  serverOffset = 0,
  nextExpiry = null;
const refresh = useLiveRefresh(
  () => load(true),
  () => !pending,
);
const clock = setInterval(() => {
  now.value = Date.now() + serverOffset;
  if (nextExpiry && now.value >= nextExpiry) {
    nextExpiry = null;
    refresh();
  }
}, 1000);
onUnmounted(() => {
  clearInterval(clock);
  request++;
});
async function load(silent = false) {
  silent = silent === true && hasLoaded;
  const current = ++request;
  pending = true;
  if (!silent) {
    loading.value = true;
    error.value = "";
  }
  try {
    const params = new URLSearchParams({
      limit: pageSize,
      offset: page.value * pageSize,
    });
    if (appliedQuery.value) params.set("q", appliedQuery.value);
    if (category.value) params.set("category_id", category.value);
    if (group.value) params.set("group", group.value);
    const result = await api("/discover?" + params);
    if (current !== request) return;
    serverOffset = result.server_time - Date.now();
    now.value = result.server_time;
    nextExpiry = result.next_expiry;
    hasLoaded = true;
    error.value = "";
    syncError.value = "";
    items.value = result.items;
    total.value = result.total;
    totalItems.value = result.total_items;
    collections.value = result.collections;
    state.categories = result.collections;
    groups.value = result.groups;
    featured.value = result.featured;
    if (page.value >= pages.value) {
      page.value = pages.value - 1;
      return load(silent);
    }
  } catch (e) {
    if (current === request) {
      if (silent) syncError.value = e.message;
      else error.value = e.message;
    }
  } finally {
    if (current === request) {
      loading.value = false;
      pending = false;
    }
  }
}
function search() {
  appliedQuery.value = query.value.trim();
  page.value = 0;
  load();
}
function chooseCategory(id) {
  category.value = id ? String(id) : "";
  group.value = "";
}
function chooseGroup(id) {
  group.value = group.value === id ? "" : id;
  category.value = "";
}
function clearFilters() {
  query.value = "";
  appliedQuery.value = "";
  category.value = "";
  group.value = "";
  page.value = 0;
  load();
}
function turn(delta) {
  page.value = Math.min(pages.value - 1, Math.max(0, page.value + delta));
  load();
}
watch([category, group], () => {
  page.value = 0;
  load();
});
onMounted(load);
</script>
<template>
  <div class="page browse-page marketplace-page">
    <div class="marketplace-heading">
      <div>
        <p class="eyebrow purple">
          <Sparkles :size="15" />{{ t("THE COLLECTOR'S CORNER") }}
        </p>
        <h1>{{ t("Find your kind of rare.") }}</h1>
      </div>
      <form class="search marketplace-search" @submit.prevent="search">
        <Search :size="20" /><input
          v-model="query"
          :aria-label="t('Search collectibles')"
          :placeholder="t('Search cards, plush toys and more…')"
          type="search"
        /><button class="search-submit" type="submit">{{ t("Search") }}</button>
      </form>
    </div>
    <div class="discovery-layout">
      <aside class="category-sidebar" :aria-label="t('Collection filters')">
        <h2><LayoutGrid :size="18" />{{ t("Collections") }}</h2>
        <button
          type="button"
          :class="{ selected: !category && !group }"
          :aria-pressed="!category && !group"
          @click="chooseCategory('')"
        >
          <span>{{ t("All collectibles") }}</span
          ><span class="category-count">{{ totalItems }}</span></button
        ><button
          v-for="c in collections"
          :key="c.category_id"
          type="button"
          :class="{ selected: Number(category) === c.category_id }"
          :aria-pressed="Number(category) === c.category_id"
          @click="chooseCategory(c.category_id)"
        >
          <span>{{ categoryName(c.name) }}</span
          ><span class="category-count">{{ c.count }}</span>
        </button>
        <p v-if="loading && !collections.length" class="muted">
          {{ t("Please wait…") }}
        </p>
      </aside>
      <FeaturedCarousel :items="featured" :now="now" :loading="loading" />
      <aside class="collection-groups" :aria-label="t('Explore four worlds')">
        <button
          v-for="g in groups"
          :key="g.id"
          type="button"
          class="collection-group"
          :class="[g.id, { selected: group === g.id }]"
          :aria-pressed="group === g.id"
          @click="chooseGroup(g.id)"
        >
          <span class="group-copy"
            ><strong>{{ t(g.name) }}</strong
            ><span>{{ t(g.description) }}</span
            ><small
              >{{ t("{count} collectibles", { count: g.count }) }}
              <ArrowUpRight :size="13" /></small></span
          ><img :src="imagePath(g.image_key)" alt="" />
        </button>
        <div
          v-if="loading && !groups.length"
          class="group-loading"
          role="status"
        >
          {{ t("Please wait…") }}
        </div>
      </aside>
    </div>
    <section
      id="auctions"
      class="catalog marketplace-catalog"
      :aria-label="t('Auctions')"
      :aria-busy="loading"
    >
      <div class="section-title">
        <div>
          <p class="eyebrow muted">{{ t("THE GOOD STUFF") }}</p>
          <h2>
            {{
              selectedCollection
                ? categoryName(selectedCollection.name)
                : selectedGroup
                  ? t(selectedGroup.name)
                  : t("Discover the drop")
            }}<span class="purple">.</span>
          </h2>
        </div>
        <p class="catalog-count" role="status">
          {{ t("{count} collectibles", { count: total }) }}
        </p>
      </div>
      <div class="mobile-category-filter">
        <label for="mobile-collection"
          ><Layers :size="17" />{{ t("Collections") }}</label
        ><select
          id="mobile-collection"
          :value="category"
          @change="chooseCategory($event.target.value)"
        >
          <option value="">{{ t("All collections") }}</option>
          <option
            v-for="c in collections"
            :key="c.category_id"
            :value="c.category_id"
          >
            {{ categoryName(c.name) }} ({{ c.count }})
          </option>
        </select>
      </div>
      <div v-if="filtered" class="active-filters">
        <span v-if="appliedQuery">{{ t("Search") }}: {{ appliedQuery }}</span
        ><span v-if="selectedCollection">{{
          categoryName(selectedCollection.name)
        }}</span
        ><span v-if="selectedGroup">{{ t(selectedGroup.name) }}</span
        ><button type="button" @click="clearFilters">
          <X :size="14" />{{ t("Clear filters") }}
        </button>
      </div>
      <p v-if="syncError" class="error-box" role="status">
        {{ t("Updates paused. Reconnecting automatically…") }}
        <button class="text-button" @click="refresh">
          {{ t("Try again") }}
        </button>
      </p>
      <div v-if="error" class="empty error" role="alert">
        <h3>{{ t("We couldn't load the drop.") }}</h3>
        <p>{{ messageText(error) }}</p>
        <button class="button purple-btn" @click="load">
          {{ t("Try again") }}
        </button>
      </div>
      <div v-else-if="loading" class="loading" role="status">
        <span class="spinner"></span>{{ t("Finding your next collectible…") }}
      </div>
      <div v-else-if="!visibleItems.length" class="empty">
        <Search :size="34" />
        <h3>{{ t("No collectibles found") }}</h3>
        <p>{{ t("Try another name or collection.") }}</p>
        <button class="button outline" @click="clearFilters">
          {{ t("Clear filters") }}
        </button>
      </div>
      <div v-else class="item-grid">
        <ItemCard
          v-for="item in visibleItems"
          :key="item.item_id"
          :item="item"
          :now="now"
        />
      </div>
      <div v-if="!loading && pages > 1" class="pagination">
        <button
          class="button outline small"
          :disabled="page === 0"
          @click="turn(-1)"
        >
          <ChevronLeft :size="18" />{{ t("Previous") }}</button
        ><span>{{
          t("Page {page} of {pages}", { page: page + 1, pages })
        }}</span
        ><button
          class="button outline small"
          :disabled="page + 1 >= pages"
          @click="turn(1)"
        >
          {{ t("Next") }}<ChevronRight :size="18" />
        </button>
      </div>
    </section>
    <section class="sell-banner">
      <div>
        <p class="eyebrow">{{ t("MAKE ROOM FOR YOUR NEXT FAVORITE") }}</p>
        <h2>{{ t("Someone's grail is on your shelf.") }}</h2>
      </div>
      <RouterLink to="/sell" class="button dark"
        >{{ t("List your collectible") }}<ArrowRight :size="18"
      /></RouterLink>
    </section>
  </div>
</template>
