import { createRouter, createWebHashHistory } from "vue-router/auto";
import { routes } from "vue-router/auto-routes";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});
router.beforeEach(async (to, from) => {
  if (to.meta.title) {
    document.title = to.meta.title;
  }
});

export default router;
