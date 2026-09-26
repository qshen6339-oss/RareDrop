import { reactive } from "vue";
import { t, intlLocale } from "./i18n";
import { announceDataChange } from "./liveRefresh.mjs";
import newProductImages from "./new-product-images.json";
let saved = null;
try {
  saved = JSON.parse(sessionStorage.getItem("raredrop-session") || "null");
} catch {}
export const state = reactive({
  session: saved?.user_id && saved?.session_token ? saved : null,
  notice: "",
  categories: [],
});
export function notify(message) {
  state.notice = message;
}
export async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(
      (import.meta.env.VITE_API_URL || "/api") + path,
      {
        cache: "no-store",
        ...options,
        signal: controller.signal,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(state.session
            ? { "X-Authorization": state.session.session_token }
            : {}),
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      },
    );
    const result = response.headers
      .get("content-type")
      ?.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      if (response.status === 401) {
        state.session = null;
        sessionStorage.removeItem("raredrop-session");
      }
      const error = new Error(
        result?.error_message || "This action could not be completed.",
      );
      error.status = response.status;
      throw error;
    }
    if (
      options.method &&
      !["GET", "HEAD"].includes(options.method.toUpperCase()) &&
      /^\/(?:item(?:-with-photo)?(?:\/|$)|question\/|users\/)/.test(path)
    )
      announceDataChange();
    return result;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error("The server took too long to respond. Please try again.");
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach the auction server. Check that the backend is running.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export async function login(values) {
  const session = await api("/login", { method: "POST", body: values });
  state.session = session;
  sessionStorage.setItem("raredrop-session", JSON.stringify(session));
}
export async function logout() {
  await api("/logout", { method: "POST" });
  state.session = null;
  sessionStorage.removeItem("raredrop-session");
  notify("You have signed out.");
}
export const money = (value) =>
  new Intl.NumberFormat(intlLocale(), {
    style: "currency",
    currency: "CNY",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(value || 0);
export const date = (value) =>
  new Date(value).toLocaleString(intlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
export const time = (value) =>
  new Date(value).toLocaleTimeString(intlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  });
export function remaining(end, now = Date.now()) {
  let seconds = Math.max(0, Math.floor((end - now) / 1000));
  if (!seconds) return t("Auction ended");
  const days = Math.floor(seconds / 86400),
    hours = Math.floor((seconds % 86400) / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return days
    ? t("{days}d {hours}h left", { days, hours })
    : t("{hours}h {minutes}m left", { hours, minutes });
}
export const imagePath = (key) =>
  ({
    dragon: "/images/raredrop-dragon-card.png",
    rabbit: "/images/raredrop-astronaut-rabbit.png",
    mecha: "/images/raredrop-cyan-mecha.png",
    limited: "/images/raredrop-starfall-collector-set.png",
    blindbox: "/images/raredrop-cloud-parade-blind-box.png",
    plush: "/images/raredrop-moonbean-cloud-plush.png",
    car: "/images/raredrop-neon-sprint-model-car.png",
    kit: "/images/raredrop-orbit-scout-model-kit.png",
    blocks: "/images/raredrop-pocket-galaxy-observatory.png",
    comic: "/images/raredrop-neon-city-comic.png",
    artbook: "/images/raredrop-worlds-of-wonder-art-book.png",
    pins: "/images/raredrop-cosmic-club-enamel-pins.png",
    charm: "/images/raredrop-lucky-comet-charm.png",
    stand: "/images/raredrop-starbound-cafe-acrylic-stand.png",
    ...newProductImages,
  })[key] || null;
export function itemImage(media) {
  if (/^\/item\/[1-9]\d*\/photo$/.test(media?.photo_url || ""))
    return (
      (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "") +
      media.photo_url
    );
  return imagePath(media?.image_key);
}
export async function enrich(items) {
  return Promise.all(
    items.map(async (item) => {
      const [details, media, categories, saleStatus] = await Promise.all([
        api(`/item/${item.item_id}`),
        api(`/item/${item.item_id}/media`),
        api(`/item/${item.item_id}/categories`),
        api(`/item/${item.item_id}/status`),
      ]);
      return {
        ...details,
        image_key: media.image_key,
        photo_url: media.photo_url,
        categories,
        ...saleStatus,
      };
    }),
  );
}
