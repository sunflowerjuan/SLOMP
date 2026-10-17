import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../api/ApiError";
import { listMunicipalities } from "../api/municipalities";
import type { Municipality } from "../api/municipalities";
import { sortMunicipalities } from "../domain/municipality";

export type MunicipalitiesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; municipalities: Municipality[] };

// The municipalities for the selector. The list is read again whenever the
// window gets focus, so a municipality added in another tab shows up here.
export function useMunicipalities() {
  const [state, setState] = useState<MunicipalitiesState>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listMunicipalities(controller.signal)
      .then((municipalities) => setState({ status: "ready", municipalities }))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: getErrorMessage(caught) });
        }
      });
    return () => controller.abort();
  }, [attempt]);

  // Quiet re-read: what is on screen stays until the new list arrives, and a
  // failure keeps it.
  const refresh = useCallback(async () => {
    try {
      const municipalities = await listMunicipalities();
      setState({ status: "ready", municipalities });
    } catch {
      // Ignored: the list on screen is still valid.
    }
  }, []);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  const add = useCallback((municipality: Municipality) => {
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            municipalities: sortMunicipalities([
              ...current.municipalities,
              municipality,
            ]),
          }
        : current,
    );
  }, []);

  return { state, retry, refresh, add };
}
