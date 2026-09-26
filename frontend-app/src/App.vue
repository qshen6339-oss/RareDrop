<script setup>
import { t, messageText, locale, setLocale } from "./i18n";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Zap,
  Plus,
  UserRound,
  LogOut,
  X,
  Files,
  ArrowUpRight,
} from "lucide-vue-next";
import { state, api, logout, notify } from "./state";
const router = useRouter();
const main = ref(null);
onMounted(async () => {
  try {
    state.categories = await api("/categories");
  } catch {}
});
async function signOut() {
  try {
    await logout();
    router.push("/");
  } catch (error) {
    notify(error.message);
  }
}
</script>
<template>
  <a class="skip" href="#main" @click.prevent="main?.focus()">
    {{ t("Skip to content") }}
  </a>
  <header class="header">
    <div class="header-inner">
      <RouterLink to="/" class="brand" :aria-label="t('RareDrop home')"
        ><span class="brand-icon"><Zap :size="24" fill="currentColor" /></span
        >RareDrop<span class="brand-dot">®</span></RouterLink
      >
      <nav :aria-label="t('Main navigation')">
        <RouterLink to="/" exact-active-class="active">
          {{ t("Discover") }} </RouterLink
        ><RouterLink to="/account" active-class="active">
          {{ t("My collection") }} </RouterLink
        ><RouterLink to="/drafts" active-class="active" class="draft-nav"
          ><Files :size="16" /> {{ t("Drafts") }}
        </RouterLink>
        <div class="language-switch" role="group" :aria-label="t('Language')">
          <button
            type="button"
            lang="zh-CN"
            :aria-pressed="locale === 'zh'"
            @click="setLocale('zh')"
          >
            中文
          </button>
          <button
            type="button"
            lang="en"
            :aria-pressed="locale === 'en'"
            @click="setLocale('en')"
          >
            English
          </button>
        </div>
      </nav>
      <div class="header-actions">
        <RouterLink to="/sell" class="button lime small"
          ><Plus :size="17" /> {{ t("List an item") }} </RouterLink
        ><template v-if="state.session"
          ><RouterLink
            to="/account"
            class="icon-button"
            :aria-label="t('My account')"
            ><UserRound :size="20" /></RouterLink
          ><button
            @click="signOut"
            class="icon-button"
            :aria-label="t('Sign out')"
          >
            <LogOut :size="19" /></button></template
        ><RouterLink v-else to="/login" class="login-link">
          {{ t("Sign in") }} <ArrowUpRight :size="16"
        /></RouterLink>
      </div>
    </div>
  </header>
  <div v-if="state.notice" class="notice" role="status">
    {{ messageText(state.notice)
    }}<button
      class="icon-button"
      @click="state.notice = ''"
      :aria-label="t('Dismiss notification')"
    >
      <X :size="18" />
    </button>
  </div>
  <main id="main" ref="main" tabindex="-1">
    <RouterView :key="$route.path" />
  </main>
  <footer class="footer">
    <RouterLink to="/" class="brand footer-brand"
      ><Zap :size="20" />RareDrop</RouterLink
    >
    <p>{{ t("For the joy of the find.") }}</p>
    <span> {{ t("Coursework demo · Simulated auctions · No payments") }} </span>
  </footer>
</template>
