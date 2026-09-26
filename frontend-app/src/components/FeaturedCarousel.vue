<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Sparkles,
} from "lucide-vue-next";
import { t, categoryName } from "../i18n";
import { money, remaining, itemImage } from "../state";
const props = defineProps({
  items: { type: Array, default: () => [] },
  now: Number,
  loading: Boolean,
});
const index = ref(0),
  paused = ref(false),
  hovered = ref(false),
  focused = ref(false),
  reducedMotion = ref(false),
  hidden = ref(false);
const slides = computed(() =>
  props.items.filter((item) => item.end_date > props.now),
);
const active = computed(() => slides.value[index.value % slides.value.length]);
const playing = computed(
  () =>
    slides.value.length > 1 &&
    !paused.value &&
    !hovered.value &&
    !focused.value &&
    !reducedMotion.value &&
    !hidden.value,
);
let timer, motion;
function resetTimer() {
  clearInterval(timer);
  if (playing.value)
    timer = setInterval(() => {
      index.value = (index.value + 1) % slides.value.length;
    }, 5000);
}
function move(next) {
  index.value = (next + slides.value.length) % slides.value.length;
  paused.value = true;
}
function toggle() {
  paused.value = !paused.value;
  if (!paused.value) reducedMotion.value = false;
}
function visibility() {
  hidden.value = document.hidden;
}
function preference(event) {
  reducedMotion.value = event.matches;
}
watch(playing, resetTimer);
watch(
  () => slides.value.map((item) => item.item_id).join(","),
  (ids, previousIds) => {
    const previous = previousIds ? previousIds.split(",") : [];
    const activeId = previous[index.value % previous.length];
    const preserved = slides.value.findIndex(
      (item) => String(item.item_id) === activeId,
    );
    index.value =
      preserved >= 0
        ? preserved
        : Math.min(index.value, Math.max(0, slides.value.length - 1));
    resetTimer();
  },
);
onMounted(() => {
  motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion.value = motion.matches;
  paused.value = motion.matches;
  motion.addEventListener("change", preference);
  document.addEventListener("visibilitychange", visibility);
  visibility();
  resetTimer();
});
onUnmounted(() => {
  clearInterval(timer);
  motion?.removeEventListener("change", preference);
  document.removeEventListener("visibilitychange", visibility);
});
</script>
<template>
  <section
    class="featured-carousel"
    :class="{ 'carousel-empty': !active }"
    :aria-label="t('Featured collectibles')"
    aria-roledescription="carousel"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="focused = $event.currentTarget.contains($event.relatedTarget)"
  >
    <div class="featured-kicker">
      <Sparkles :size="15" /> {{ t("IN THE SPOTLIGHT") }}
    </div>
    <Transition name="featured-fade" mode="out-in">
      <RouterLink
        v-if="active"
        :key="active.item_id"
        :to="`/item/${active.item_id}`"
        class="featured-slide"
        :aria-label="t('View collectible: {name}', { name: active.name })"
      >
        <div class="featured-copy">
          <span class="featured-category">{{
            categoryName(active.categories[0]?.name)
          }}</span>
          <h2>{{ active.name }}</h2>
          <p class="featured-description">{{ active.description }}</p>
          <span class="small-label">{{ t("Current bid") }}</span
          ><strong class="featured-price">{{
            money(active.current_bid)
          }}</strong
          ><span class="featured-time">{{
            remaining(active.end_date, now)
          }}</span
          ><span class="featured-cta"
            >{{ t("Discover this collectible") }} <ArrowUpRight :size="18"
          /></span>
        </div>
        <div class="featured-art">
          <img :src="itemImage(active)" :alt="active.name" />
        </div>
      </RouterLink>
      <div v-else class="featured-fallback">
        <h2>{{ t("Your next grail.") }}<br />{{ t("One bid away.") }}</h2>
        <p>
          {{
            loading
              ? t("Finding your next collectible…")
              : t("More featured finds are coming soon.")
          }}
        </p>
        <img src="/images/raredrop-astronaut-rabbit.png" alt="" />
      </div>
    </Transition>
    <div v-if="slides.length > 1" class="carousel-controls">
      <div
        class="carousel-dots"
        :aria-label="t('Choose a featured collectible')"
      >
        <button
          v-for="(slide, n) in slides"
          :key="slide.item_id"
          type="button"
          :class="{ selected: n === index % slides.length }"
          :aria-label="
            t('Show slide {number}: {name}', {
              number: n + 1,
              name: slide.name,
            })
          "
          :aria-pressed="n === index % slides.length"
          @click="move(n)"
        ></button>
      </div>
      <span class="slide-counter"
        >{{ (index % slides.length) + 1 }} / {{ slides.length }}</span
      >
      <button
        type="button"
        :aria-label="t(paused ? 'Start slideshow' : 'Pause slideshow')"
        :aria-pressed="paused"
        @click="toggle"
      >
        <Play v-if="paused" :size="15" /><Pause v-else :size="15" />
      </button>
      <button
        type="button"
        :aria-label="t('Previous featured collectible')"
        @click="move(index - 1)"
      >
        <ChevronLeft :size="19" /></button
      ><button
        type="button"
        :aria-label="t('Next featured collectible')"
        @click="move(index + 1)"
      >
        <ChevronRight :size="19" />
      </button>
    </div>
  </section>
</template>
