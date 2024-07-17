import { reactive } from "vue";
import { useCookies } from "@vueuse/integrations/useCookies";

const cookies = useCookies();
const sessionCookie = cookies.get("session");
const sessionStorage = localStorage.getItem("session");

const getAnonymousSession = () =>
  reactive({
    user: {
      id: null,
      username: "tourist",
    },
    roles: {},
  });

const removeSession = () => {
  localStorage.removeItem("session");
  cookies.remove("session");
};

const refreshSession = () => {
  removeSession();
  return getAnonymousSession();
};

const getSession = () => {
  if (!sessionCookie || !sessionStorage) {
    return refreshSession();
  }
  try {
    const session = JSON.parse(sessionStorage);
    if (typeof session !== "object" || typeof session.user !== "object") {
      return refreshSession();
    }
    if (!session.expire) {
      return refreshSession();
    }
    if (new Date().getTime() > session.expire) {
      return refreshSession();
    }
    if (typeof session.user !== "object" || !session.user.id) {
      return refreshSession();
    }
    return reactive(session);
  } catch (error) {
    return refreshSession();
  }
};

const session = getSession();

const useSession = () => {
  return session;
};

export { getAnonymousSession, removeSession, useSession };
export default useSession;
