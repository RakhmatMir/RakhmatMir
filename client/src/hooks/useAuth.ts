import { useEffect, useState } from "react";
import { api, setCsrf, type User } from "../lib/api";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);
  const [sourceJson, setSourceJson] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const health = await api.health();
        setSeeded(health.seeded);
        setSourceJson(health.sourceJson);
        if (!health.seeded) {
          setLoading(false);
          return;
        }
        const me = await api.me();
        setCsrf(me.csrfToken);
        setUser(me.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { user, loading, seeded, sourceJson, setUser };
}
