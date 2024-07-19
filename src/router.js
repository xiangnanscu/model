import { createRouter, createWebHashHistory } from "vue-router/auto";
import { routes } from "vue-router/auto-routes";
import Playground from "../views/Playground.vue";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [...routes, { name: "Home", path: "/", component: Playground }],
});
router.beforeEach(async (to, from) => {
  if (to.meta.title) {
    document.title = to.meta.title;
  }
});

export default router;
