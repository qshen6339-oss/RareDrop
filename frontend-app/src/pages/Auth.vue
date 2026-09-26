<script setup>
import { t, categoryName, messageText, locale } from "../i18n";
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Zap, ArrowRight, Eye, EyeOff } from "lucide-vue-next";
import { api, login, notify } from "../state";
const route = useRoute(),
  router = useRouter(),
  register = computed(() => route.path === "/register");
const form = reactive({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  }),
  busy = ref(false),
  error = ref(""),
  show = ref(false);
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    if (register.value) await api("/users", { method: "POST", body: form });
    await login({ email: form.email, password: form.password });
    notify(
      register.value ? "Your collector account is ready." : "Welcome back.",
    );
    const next =
      typeof route.query.next === "string" &&
      route.query.next.startsWith("/") &&
      !route.query.next.startsWith("//")
        ? route.query.next
        : "/account";
    router.push(next);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="page auth-page">
    <div class="auth-art">
      <p class="eyebrow">
        <Zap :size="18" /> {{ t("RAREDROP COLLECTORS CLUB") }}
      </p>
      <h1>
        {{ t("Good taste.") }} <br />
        {{ t("Great finds.") }}
      </h1>
      <img
        src="/images/raredrop-cyan-mecha.png"
        :alt="t('An original cyan mecha collectible')"
      />
      <p>{{ t("Your collection starts with a little curiosity.") }}</p>
    </div>
    <section class="auth-form">
      <p class="eyebrow purple">
        {{ register ? t("JOIN THE DROP") : t("BACK FOR ANOTHER FIND?") }}
      </p>
      <h1>{{ register ? t("Your next chapter.") : t("Welcome back.") }}</h1>
      <p class="muted">
        {{
          register
            ? t("Create an account to bid, ask questions and sell.")
            : t("Sign in and pick up where you left off.")
        }}
      </p>
      <form @submit.prevent="submit">
        <div v-if="register" class="two-col">
          <label>
            {{ t("First name") }}
            <input
              v-model="form.first_name"
              required
              maxlength="100"
              autocomplete="given-name" /></label
          ><label>
            {{ t("Last name") }}
            <input
              v-model="form.last_name"
              required
              maxlength="100"
              autocomplete="family-name"
          /></label>
        </div>
        <label>
          {{ t("Email address") }}
          <input
            v-model.trim="form.email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com" /></label
        ><label>
          {{ t("Password") }}
          <div class="password-input">
            <input
              v-model="form.password"
              :type="show ? 'text' : 'password'"
              required
              :minlength="register ? 8 : undefined"
              :maxlength="register ? 30 : undefined"
              :autocomplete="register ? 'new-password' : 'current-password'"
            /><button
              type="button"
              class="icon-button"
              @click="show = !show"
              :aria-label="show ? t('Hide password') : t('Show password')"
            >
              <EyeOff v-if="show" :size="19" /><Eye v-else :size="19" />
            </button></div
        ></label>
        <p v-if="register" class="field-help">
          {{
            t(
              "8–30 characters, with uppercase, lowercase, a number and a symbol.",
            )
          }}
        </p>
        <div v-if="error" class="error-box" role="alert">
          {{ messageText(error) }}
        </div>
        <button class="button purple-btn full" :disabled="busy">
          {{
            busy
              ? t("Please wait…")
              : register
                ? t("Create account")
                : t("Sign in")
          }}<ArrowRight :size="18" />
        </button>
      </form>
      <p class="auth-switch">
        {{ register ? t("Already a collector?") : t("New to the drop?") }}
        <RouterLink
          :to="{ path: register ? '/login' : '/register', query: route.query }"
          >{{ register ? t("Sign in") : t("Create an account") }}</RouterLink
        >
      </p>
      <details class="demo-help">
        <summary>{{ t("Try the coursework demo") }}</summary>
        <p>
          {{ t("Buyer:") }} <strong>alex@raredrop.example</strong><br />
          {{ t("Seller:") }} <strong>sky@raredrop.example</strong><br />
          {{ t("Password:") }} <strong>RareDrop2026!</strong>
        </p>
        <p>
          {{ t("Demo auctions use fictional goods. No money changes hands.") }}
        </p>
      </details>
    </section>
  </div>
</template>
