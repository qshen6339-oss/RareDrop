<script setup>
import { t, categoryName, messageText, locale } from "../i18n";
import { reactive, ref, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowRight,
  Save,
  ArrowLeft,
  Upload,
  ImagePlus,
  X,
} from "lucide-vue-next";
import { state, api, notify, time } from "../state";
import { readDrafts, saveDraft, deleteDraft } from "../drafts";
import { preparePhoto, isPreparedPhoto } from "../photos";
const route = useRoute(),
  router = useRouter(),
  form = reactive({
    name: "",
    description: "",
    starting_bid: "",
    end_date: "",
    category_ids: [],
    photo: "",
    photo_name: "",
  }),
  draftId = ref(
    typeof route.query.draft === "string" ? route.query.draft : null,
  ),
  error = ref(""),
  busy = ref(false),
  preparing = ref(false),
  photoError = ref(""),
  photoInput = ref(null),
  savedAt = ref("");
const localDate = (value) => {
  const d = new Date(value);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const minDate = ref(localDate(Date.now() + 60000));
onMounted(async () => {
  try {
    if (!state.categories.length) state.categories = await api("/categories");
    if (draftId.value) {
      const entry = readDrafts(state.session.user_id).find(
        (d) => d.id === draftId.value,
      );
      if (!entry) throw new Error("This draft could not be found.");
      for (const key of Object.keys(form))
        if (entry.form[key] !== undefined) form[key] = entry.form[key];
      if (form.photo && !isPreparedPhoto(form.photo)) {
        form.photo = "";
        form.photo_name = "";
        photoError.value =
          "The saved photo could not be restored. Please choose it again.";
      }
    }
  } catch (e) {
    error.value = e.message;
  }
});
let photoRequest = 0;
onUnmounted(() => photoRequest++);
async function choosePhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const request = ++photoRequest;
  preparing.value = true;
  photoError.value = "";
  try {
    const data = await preparePhoto(file);
    if (request !== photoRequest) return;
    form.photo = data;
    form.photo_name = file.name;
  } catch (e) {
    if (request === photoRequest) photoError.value = e.message;
  } finally {
    if (request === photoRequest) {
      preparing.value = false;
      if (photoInput.value) photoInput.value.value = "";
    }
  }
}
function removePhoto() {
  photoRequest++;
  form.photo = "";
  form.photo_name = "";
  photoError.value = "";
  preparing.value = false;
  if (photoInput.value) photoInput.value.value = "";
}
function save() {
  if (busy.value || preparing.value) return;
  error.value = "";
  try {
    draftId.value = saveDraft(state.session.user_id, form, draftId.value);
    savedAt.value = Date.now();
    router.replace({ path: "/sell", query: { draft: draftId.value } });
    notify("Draft saved in this browser.");
  } catch (e) {
    error.value = e.message;
  }
}
async function publish() {
  if (busy.value || preparing.value) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await api(form.photo ? "/item-with-photo" : "/item", {
      method: "POST",
      ...(form.photo
        ? { headers: { "Content-Type": "application/vnd.raredrop.item+json" } }
        : {}),
      body: {
        name: form.name,
        description: form.description,
        starting_bid: Number(form.starting_bid),
        end_date: new Date(form.end_date).getTime(),
        category_ids: form.category_ids,
        ...(form.photo ? { photo: form.photo } : {}),
      },
    });
    let cleanup = "";
    if (draftId.value)
      try {
        deleteDraft(state.session.user_id, draftId.value);
      } catch {
        cleanup =
          " The item is published, but its local draft could not be removed.";
      }
    notify("Your collectible is live." + cleanup);
    router.push(`/item/${result.item_id}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="page sell-page">
    <RouterLink to="/" class="back-link"
      ><ArrowLeft :size="17" /> {{ t("Back to the drop") }}
    </RouterLink>
    <div class="section-title">
      <div>
        <p class="eyebrow purple">{{ t("PASS ON SOMETHING SPECIAL") }}</p>
        <h1>
          {{
            draftId
              ? t("Finish your listing.")
              : t("Make someone’s collection.")
          }}
        </h1>
        <p class="muted">
          {{
            t(
              "Tell the story of your collectible. Set the starting bid. Let the drop begin.",
            )
          }}
        </p>
      </div>
    </div>
    <div class="sell-layout">
      <form class="listing-form" @submit.prevent="publish">
        <label>
          {{ t("Collectible name") }}
          <input
            v-model="form.name"
            required
            maxlength="200"
            :placeholder="t('e.g. Astral Dragon — holographic collector card')"
        /></label>
        <fieldset class="photo-field">
          <legend>
            {{ t("Cover photo") }}
            <span class="muted"> {{ t("· optional") }} </span>
          </legend>
          <div v-if="form.photo" class="photo-preview">
            <img
              :src="form.photo"
              :alt="t('Your selected collectible photo')"
            />
            <div>
              <strong>{{ form.photo_name || t("Saved cover photo") }}</strong>
              <p class="field-help">
                {{ t("This photo will appear on your listing.") }}
              </p>
              <button
                type="button"
                class="button outline small"
                @click="removePhoto"
                :disabled="busy || preparing"
              >
                <X :size="16" /> {{ t("Remove photo") }}
              </button>
            </div>
          </div>
          <label class="photo-picker" :class="{ disabled: busy || preparing }">
            <input
              ref="photoInput"
              class="photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              :aria-label="t('Choose cover photo')"
              aria-describedby="photo-help"
              @change="choosePhoto"
              :disabled="busy || preparing"
            />
            <Upload v-if="form.photo" :size="22" /><ImagePlus
              v-else
              :size="28"
            />
            <span>{{
              preparing
                ? t("Preparing photo…")
                : form.photo
                  ? t("Choose a different photo")
                  : t("Choose a photo")
            }}</span>
          </label>
          <p id="photo-help" class="field-help">
            {{ t("JPG, PNG or WebP · up to 10 MB. One cover photo.") }}
          </p>
          <p v-if="preparing" role="status" class="field-help">
            {{ t("Preparing your photo for upload…") }}
          </p>
          <p v-if="photoError" role="alert" class="error-box">
            {{ messageText(photoError) }}
          </p>
        </fieldset>
        <fieldset>
          <legend>
            {{ t("Collections") }}
            <span class="muted"> {{ t("· choose all that apply") }} </span>
          </legend>
          <div class="checkboxes">
            <label
              v-for="c in state.categories"
              :key="c.category_id"
              :class="{ selected: form.category_ids.includes(c.category_id) }"
              ><input
                v-model="form.category_ids"
                type="checkbox"
                :value="c.category_id"
              />{{ categoryName(c.name) }}</label
            >
          </div>
        </fieldset>
        <label>
          {{ t("The details") }}
          <textarea
            v-model="form.description"
            rows="7"
            required
            maxlength="10000"
            :placeholder="
              t(
                'Describe the series, condition, edition, packaging and anything a collector should know.',
              )
            "
          ></textarea>
        </label>
        <div class="two-col">
          <label>
            {{ t("Starting bid (¥)") }}
            <input
              v-model="form.starting_bid"
              type="number"
              min="0"
              step="1"
              required
              placeholder="80" /></label
          ><label>
            {{ t("Auction ends") }}
            <input
              v-model="form.end_date"
              type="datetime-local"
              :min="minDate"
              required
          /></label>
        </div>
        <p class="field-help">
          {{
            t(
              "Enter whole yuan. The end time uses your device’s local time zone.",
            )
          }}
        </p>
        <div v-if="error" class="error-box" role="alert">
          {{ messageText(error) }}
        </div>
        <div class="form-actions">
          <button
            type="button"
            class="button outline"
            @click="save"
            :disabled="busy || preparing"
          >
            <Save :size="18" /> {{ t("Save draft") }}</button
          ><button class="button purple-btn" :disabled="busy || preparing">
            {{ busy ? t("Publishing…") : t("Publish auction")
            }}<ArrowRight :size="18" />
          </button>
        </div>
        <p v-if="savedAt" class="field-help">
          {{ t("Saved at {time} in this browser.", { time: time(savedAt) }) }}
        </p>
      </form>
      <aside class="listing-tips">
        <span class="tag lime-tag"> {{ t("COLLECTOR TO COLLECTOR") }} </span>
        <h2>{{ t("A great listing starts with the details.") }}</h2>
        <ol>
          <li>
            <strong> {{ t("Give it a name.") }} </strong>
            <p>
              {{
                t(
                  "Include the series, character or edition so collectors can find it.",
                )
              }}
            </p>
          </li>
          <li>
            <strong> {{ t("Be clear about condition.") }} </strong>
            <p>
              {{
                t(
                  "Mention wear, opened packaging, missing parts and what is included.",
                )
              }}
            </p>
          </li>
          <li>
            <strong> {{ t("Keep it friendly.") }} </strong>
            <p>
              {{
                t("Offensive language is checked before a listing goes live.")
              }}
            </p>
          </li>
        </ol>
        <div class="draft-tip">
          <Save :size="21" />
          <p>
            {{
              t(
                "Not ready? Save a draft and come back in this browser. Drafts stay with the account that saved them.",
              )
            }}
          </p>
        </div>
        <p class="field-help">
          {{
            t(
              "Add a clear photo of the actual collectible. Your cover photo is also kept when you save a draft in this browser.",
            )
          }}
        </p>
      </aside>
    </div>
  </div>
</template>
