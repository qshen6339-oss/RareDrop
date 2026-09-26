import { onMounted, onUnmounted } from "vue";
import { createLiveRefresh } from "./liveRefresh.mjs";

export function useLiveRefresh(refresh, enabled) {
  let live;
  onMounted(() => {
    live = createLiveRefresh(refresh, enabled);
  });
  onUnmounted(() => live?.stop());
  return () => live?.refresh();
}
