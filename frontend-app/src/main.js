import { createApp } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App.vue";
import Browse from "./pages/Browse.vue";
import Detail from "./pages/Detail.vue";
import Auth from "./pages/Auth.vue";
import Account from "./pages/Account.vue";
import Sell from "./pages/Sell.vue";
import Drafts from "./pages/Drafts.vue";
import { state } from "./state";
import "./style.css";
import { updateDocumentLanguage } from "./i18n";
updateDocumentLanguage();
const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: "/", component: Browse },
    { path: "/item/:id", component: Detail },
    { path: "/login", component: Auth },
    { path: "/register", component: Auth },
    { path: "/account", component: Account, meta: { auth: true } },
    { path: "/users/:id", component: Account },
    { path: "/sell", component: Sell, meta: { auth: true } },
    { path: "/drafts", component: Drafts, meta: { auth: true } },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
router.beforeEach((to) =>
  to.meta.auth && !state.session
    ? { path: "/login", query: { next: to.fullPath } }
    : true,
);
createApp(App).use(router).mount("#app");
