<script setup>
import { t, categoryName, messageText, locale } from "../i18n";
import { Clock3, ArrowUpRight, Image as ImageIcon } from "lucide-vue-next";
import { money, remaining, itemImage } from "../state";
defineProps({ item: Object, now: Number });
</script>
<template>
  <RouterLink :to="`/item/${item.item_id}`" class="item-card">
    <div
      class="item-image"
      :class="item.photo_url ? 'uploaded' : item.image_key || 'blank'"
    >
      <img
        v-if="itemImage(item)"
        :src="itemImage(item)"
        :alt="item.name"
        loading="lazy"
      />
      <div v-else class="no-image">
        <ImageIcon :size="40" /><span> {{ t("No photo provided") }} </span>
      </div>
      <span class="item-tag">{{
        categoryName(item.categories?.[0]?.name || t("Collectible"))
      }}</span
      ><span
        v-if="item.status === 'CANCELLED'"
        class="ended-badge cancelled-badge"
      >
        {{ t("Cancelled") }}
      </span>
      <span v-else-if="item.end_date <= now" class="ended-badge">
        {{ t("Ended") }}
      </span>
    </div>
    <div class="card-content">
      <p class="seller">{{ item.first_name }} {{ item.last_name }}</p>
      <h3>{{ item.name }}</h3>
      <div class="card-bottom">
        <div>
          <span class="small-label">{{
            item.status === "CANCELLED"
              ? item.current_bid_holder
                ? t("Last bid")
                : t("Starting bid")
              : item.end_date <= now
                ? t("Final price")
                : t("Current bid")
          }}</span
          ><strong>{{ money(item.current_bid) }}</strong>
        </div>
        <div class="card-time">
          <span
            ><Clock3 :size="14" />{{
              item.status === "CANCELLED"
                ? t("Cancelled")
                : remaining(item.end_date, now)
            }}</span
          ><ArrowUpRight class="card-arrow" :size="20" />
        </div>
      </div>
    </div>
  </RouterLink>
</template>
