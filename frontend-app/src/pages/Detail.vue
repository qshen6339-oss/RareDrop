<script setup>
import { t, categoryName, messageText, locale } from "../i18n";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useLiveRefresh } from "../useLiveRefresh";
import {
  ArrowLeft,
  Clock3,
  ArrowUpRight,
  Image as ImageIcon,
  MessageCircle,
  Gavel,
  Ban,
} from "lucide-vue-next";
import {
  api,
  state,
  money,
  date,
  remaining,
  itemImage,
  notify,
} from "../state";
const route = useRoute(),
  item = ref(null),
  bids = ref([]),
  questions = ref([]),
  categories = ref([]),
  media = ref(null),
  saleStatus = ref(null),
  cancelDialog = ref(null),
  loading = ref(true),
  error = ref(""),
  actionError = ref(""),
  busy = ref(false),
  amount = ref(""),
  question = ref(""),
  answers = ref({}),
  now = ref(Date.now()),
  tab = ref("description");
let disposed = false;
let loadRequest = 0;
const owner = computed(() => item.value?.creator_id === state.session?.user_id),
  cancelled = computed(() => saleStatus.value?.status === "CANCELLED"),
  closed = computed(() => cancelled.value || item.value?.end_date <= now.value),
  minimum = computed(() => (item.value?.current_bid || 0) + 1);
const ticker = setInterval(() => (now.value = Date.now()), 1000);
useLiveRefresh(load, () => !loading.value && !busy.value);
const detailTabs = ["description", "bids", "questions"];
function navigateTabs(event, index) {
  let target = index;
  if (event.key === "ArrowRight") target = (index + 1) % detailTabs.length;
  else if (event.key === "ArrowLeft")
    target = (index + detailTabs.length - 1) % detailTabs.length;
  else if (event.key === "Home") target = 0;
  else if (event.key === "End") target = detailTabs.length - 1;
  else return;
  event.preventDefault();
  tab.value = detailTabs[target];
  event.currentTarget.parentElement
    .querySelectorAll('[role="tab"]')
    [target].focus();
}
onUnmounted(() => {
  disposed = true;
  clearInterval(ticker);
});
async function load() {
  const current = ++loadRequest;
  try {
    const result = await Promise.all([
      api(`/item/${route.params.id}`),
      api(`/item/${route.params.id}/bid`),
      api(`/item/${route.params.id}/question`),
      api(`/item/${route.params.id}/categories`),
      api(`/item/${route.params.id}/media`),
      api(`/item/${route.params.id}/status`),
    ]);
    if (disposed || current !== loadRequest) return;
    [
      item.value,
      bids.value,
      questions.value,
      categories.value,
      media.value,
      saleStatus.value,
    ] = result;
    if (amount.value === "") amount.value = minimum.value;
    error.value = "";
  } catch (e) {
    if (!disposed && current === loadRequest) error.value = e.message;
  } finally {
    if (!disposed && current === loadRequest) loading.value = false;
  }
}
async function action(fn, success) {
  if (busy.value) return;
  busy.value = true;
  actionError.value = "";
  try {
    await fn();
    notify(success);
    await load();
  } catch (e) {
    actionError.value = e.message;
    await load();
  } finally {
    busy.value = false;
  }
}
function openCancellation() {
  if (!owner.value || closed.value || busy.value) return;
  actionError.value = "";
  cancelDialog.value.showModal();
}
function closeCancellation() {
  if (!busy.value) cancelDialog.value.close();
}
async function cancelListing() {
  await action(async () => {
    saleStatus.value = await api(`/item/${item.value.item_id}/cancel`, {
      method: "POST",
    });
    cancelDialog.value.close();
  }, "Listing cancelled. It is now in Ended / cancelled in your collection.");
}
async function placeBid() {
  await action(async () => {
    await api(`/item/${item.value.item_id}/bid`, {
      method: "POST",
      body: { amount: Number(amount.value) },
    });
    amount.value = "";
  }, "Your bid has been placed.");
}
async function ask() {
  await action(async () => {
    await api(`/item/${item.value.item_id}/question`, {
      method: "POST",
      body: { question_text: question.value },
    });
    question.value = "";
  }, "Your question has been sent to the seller.");
}
async function answer(q) {
  await action(
    () =>
      api(`/question/${q.question_id}`, {
        method: "POST",
        body: { answer_text: answers.value[q.question_id] },
      }),
    "Your answer has been published.",
  );
}
onMounted(load);
</script>
<template>
  <div class="page detail-page">
    <RouterLink class="back-link" to="/"
      ><ArrowLeft :size="17" /> {{ t("Back to the drop") }}
    </RouterLink>
    <div v-if="loading" class="loading" role="status">
      {{ t("Loading collectible…") }}
    </div>
    <div v-else-if="!item" class="empty error" role="alert">
      <h1>{{ t("Collectible unavailable") }}</h1>
      <p>{{ messageText(error) }}</p>
      <button class="button outline" @click="load">{{ t("Try again") }}</button>
    </div>
    <template v-else
      ><div v-if="error" class="error-box" role="alert">
        {{ messageText(error) }}
      </div>
      <div class="detail-top">
        <div class="detail-visual">
          <div class="detail-image">
            <img
              v-if="itemImage(media)"
              :src="itemImage(media)"
              :alt="item.name"
            />
            <div v-else class="no-image">
              <ImageIcon :size="60" />
              <p>{{ t("The seller has not supplied a photo.") }}</p>
            </div>
            <span class="detail-number">{{
              t("COLLECTIBLE #{id}", {
                id: String(item.item_id).padStart(4, "0"),
              })
            }}</span>
          </div>
          <p v-if="media?.image_key" class="photo-note">
            {{ t("Original artwork for a fictional demo collectible.") }}
          </p>
        </div>
        <section class="bid-panel">
          <div class="detail-tags">
            <span v-for="c in categories" :key="c.category_id" class="tag">{{
              categoryName(c.name)
            }}</span>
          </div>
          <h1>{{ item.name }}</h1>
          <RouterLink :to="`/users/${item.creator_id}`" class="seller-profile"
            ><span class="avatar"
              >{{ item.first_name[0] }}{{ item.last_name[0] }}</span
            ><span>
              {{ t("Listed by") }}
              <strong>{{ item.first_name }} {{ item.last_name }}</strong></span
            ><ArrowUpRight :size="16"
          /></RouterLink>
          <div class="price-box">
            <div>
              <p class="small-label">
                {{
                  cancelled
                    ? item.current_bid_holder
                      ? t("Last bid")
                      : t("Starting bid")
                    : closed
                      ? t("Final price")
                      : t("Current bid")
                }}
              </p>
              <strong>{{ money(item.current_bid) }}</strong>
              <p>
                {{
                  t(
                    bids.length === 1
                      ? "{count} bid · Started at {price}"
                      : "{count} bids · Started at {price}",
                    { count: bids.length, price: money(item.starting_bid) },
                  )
                }}
              </p>
            </div>
            <span class="timer" :class="{ closed }"
              ><Clock3 :size="17" />{{
                cancelled ? t("Cancelled") : remaining(item.end_date, now)
              }}</span
            >
          </div>
          <p class="closing">
            {{
              cancelled ? t("Cancelled") : closed ? t("Closed") : t("Closes")
            }}
            {{ date(cancelled ? saleStatus.cancelled_at : item.end_date) }}
          </p>
          <p v-if="cancelled" class="info-box cancelled-notice" role="status">
            {{
              t(
                "The seller cancelled this listing. Bidding is closed and there is no winning collector. Previous bids and questions remain available below.",
              )
            }}
          </p>
          <p v-else-if="closed" class="info-box">
            {{
              item.current_bid_holder
                ? t("Winning collector: {name}", {
                    name: `${item.current_bid_holder.first_name} ${item.current_bid_holder.last_name}`,
                  })
                : t("This auction ended without a bid.")
            }}
          </p>
          <div v-else-if="owner" class="seller-controls">
            <p class="info-box">
              {{
                t(
                  "This is your listing. You can answer collector questions below.",
                )
              }}
            </p>
            <button
              class="button danger full"
              type="button"
              :disabled="busy"
              @click="openCancellation"
            >
              <Ban :size="18" /> {{ t("Cancel listing") }}
            </button>
            <p class="field-help">
              {{
                t(
                  "Stop this auction and move it to your ended / cancelled listings.",
                )
              }}
            </p>
          </div>
          <form v-else-if="state.session" @submit.prevent="placeBid">
            <label>
              {{ t("Your bid (¥)") }}
              <input
                v-model="amount"
                type="number"
                :min="minimum"
                step="1"
                required
            /></label>
            <p class="field-help">
              {{
                t("Minimum next bid: {price}. Whole yuan only.", {
                  price: money(minimum),
                })
              }}
            </p>
            <button class="button purple-btn full" :disabled="busy">
              <Gavel :size="19" />{{
                busy ? t("Placing bid…") : t("Place bid")
              }}
            </button>
            <p class="field-help centered">
              {{ t("Demo bidding only. No payment is taken.") }}
            </p>
          </form>
          <RouterLink
            v-else
            :to="{ path: '/login', query: { next: route.fullPath } }"
            class="button purple-btn full"
          >
            {{ t("Sign in to bid") }} <ArrowUpRight :size="18"
          /></RouterLink>
          <div v-if="actionError" class="error-box" role="alert">
            {{ messageText(actionError) }}
          </div>
        </section>
      </div>
      <dialog
        ref="cancelDialog"
        class="cancel-dialog"
        aria-labelledby="cancel-title"
        aria-describedby="cancel-description"
        @cancel.prevent="closeCancellation"
      >
        <h2 id="cancel-title">{{ t("Cancel this listing?") }}</h2>
        <p class="cancel-item-name">{{ item.name }}</p>
        <p id="cancel-description">
          {{
            t(
              "This removes the item from the auction listings and stops further bids. Its details, photos and history will remain in your collection. You cannot reopen this auction.",
            )
          }}
        </p>
        <p v-if="bids.length" class="info-box">
          {{
            t(
              bids.length === 1
                ? "There is already {count} bid. Cancelling means none of these bids will win the item."
                : "There are already {count} bids. Cancelling means none of these bids will win the item.",
              { count: bids.length },
            )
          }}
        </p>
        <p v-if="actionError" class="error-box" role="alert">
          {{ messageText(actionError) }}
        </p>
        <div class="cancel-actions">
          <button
            type="button"
            class="button outline"
            :disabled="busy"
            autofocus
            @click="closeCancellation"
          >
            {{ t("Keep selling") }}
          </button>
          <button
            type="button"
            class="button danger"
            :disabled="busy || closed"
            @click="cancelListing"
          >
            {{ busy ? t("Cancelling…") : t("Yes, cancel listing") }}
          </button>
        </div>
      </dialog>
      <div class="detail-bottom">
        <div
          class="tabs"
          role="tablist"
          :aria-label="t('Collectible information')"
        >
          <button
            v-for="(tabKey, index) in detailTabs"
            :key="tabKey"
            role="tab"
            :id="`tab-${tabKey}`"
            :aria-controls="`panel-${tabKey}`"
            :tabindex="tab === tabKey ? 0 : -1"
            @keydown="navigateTabs($event, index)"
            :aria-selected="tab === tabKey"
            :class="{ active: tab === tabKey }"
            @click="tab = tabKey"
          >
            {{
              tabKey === "description"
                ? t("The details")
                : tabKey === "bids"
                  ? t("Bid history ({count})", { count: bids.length })
                  : t("Questions ({count})", { count: questions.length })
            }}
          </button>
        </div>
        <section
          v-if="tab === 'description'"
          class="tab-panel"
          role="tabpanel"
          id="panel-description"
          aria-labelledby="tab-description"
          tabindex="0"
        >
          <h2>{{ t("The story behind the find.") }}</h2>
          <p class="description-text">{{ item.description }}</p>
          <dl class="facts">
            <div>
              <dt>{{ t("Listed") }}</dt>
              <dd>{{ date(item.start_date) }}</dd>
            </div>
            <div>
              <dt>{{ t("Starting bid") }}</dt>
              <dd>{{ money(item.starting_bid) }}</dd>
            </div>
            <div>
              <dt>{{ t("Collection") }}</dt>
              <dd>
                {{
                  categories
                    .map((c) => categoryName(c.name))
                    .join(locale === "zh" ? "、" : ", ") || t("Uncategorized")
                }}
              </dd>
            </div>
          </dl>
        </section>
        <section
          v-else-if="tab === 'bids'"
          class="tab-panel"
          role="tabpanel"
          id="panel-bids"
          aria-labelledby="tab-bids"
          tabindex="0"
        >
          <h2>{{ t("Every bid tells a story.") }}</h2>
          <p v-if="!bids.length" class="muted">
            {{
              closed
                ? t("No bids were placed on this listing.")
                : t("No bids yet. Be the first collector to make a move.")
            }}
          </p>
          <div v-else class="bid-table">
            <table>
              <thead>
                <tr>
                  <th>{{ t("Collector") }}</th>
                  <th>{{ t("Bid") }}</th>
                  <th>{{ t("Placed") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in bids" :key="`${b.user_id}-${b.amount}`">
                  <td>
                    <RouterLink :to="`/users/${b.user_id}`"
                      >{{ b.first_name }} {{ b.last_name }}</RouterLink
                    >
                  </td>
                  <td>
                    <strong>{{ money(b.amount) }}</strong>
                  </td>
                  <td>{{ date(b.timestamp) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section
          v-else
          class="tab-panel questions"
          role="tabpanel"
          id="panel-questions"
          aria-labelledby="tab-questions"
          tabindex="0"
        >
          <h2>{{ t("A little more to know.") }}</h2>
          <p v-if="cancelled" class="muted">
            {{
              t(
                "This listing was cancelled. You can still read its question history.",
              )
            }}
          </p>
          <form v-else-if="state.session && !owner" @submit.prevent="ask">
            <label>
              {{ t("Ask the seller") }}
              <textarea
                v-model="question"
                required
                rows="3"
                :placeholder="
                  t('Ask about condition, packaging or the collectible…')
                "
              ></textarea></label
            ><button
              class="button purple-btn"
              :disabled="busy || !question.trim()"
            >
              <MessageCircle :size="18" /> {{ t("Send question") }}
            </button>
          </form>
          <p v-else-if="!state.session">
            <RouterLink
              :to="{ path: '/login', query: { next: route.fullPath } }"
            >
              {{ t("Sign in") }}
            </RouterLink>
            {{ t("to ask the seller a question.") }}
          </p>
          <p v-if="!questions.length" class="muted">
            {{ t("No questions yet.") }}
          </p>
          <article
            v-for="q in questions"
            :key="q.question_id"
            class="question-card"
          >
            <h3>{{ q.question_text }}</h3>
            <div v-if="q.answer_text" class="answer">
              <span class="small-label"> {{ t("SELLER'S ANSWER") }} </span>
              <p>{{ q.answer_text }}</p>
            </div>
            <p v-else class="muted">{{ t("Awaiting the seller's answer.") }}</p>
            <form v-if="owner" @submit.prevent="answer(q)">
              <label :for="`answer-${q.question_id}`">{{
                q.answer_text ? t("Update your answer") : t("Your answer")
              }}</label
              ><textarea
                :id="`answer-${q.question_id}`"
                v-model="answers[q.question_id]"
                required
                rows="2"
                :placeholder="q.answer_text || t('Share a helpful answer…')"
              ></textarea
              ><button
                class="button outline small"
                :disabled="busy || !answers[q.question_id]?.trim()"
              >
                {{ t("Publish answer") }}
              </button>
            </form>
          </article>
        </section>
      </div></template
    >
  </div>
</template>
