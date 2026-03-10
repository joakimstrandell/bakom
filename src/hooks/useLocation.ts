import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { requestLocation, subscribeLocation, getLocationState } from "../lib/location";

type LocationHookState = {
  location: { lat: number; lng: number } | null;
  loading: boolean;
  error: string | null;
  denied: boolean;
};

export function useLocation() {
  const { t } = useTranslation();
  const initialState = getLocationState();
  const [state, setState] = useState<LocationHookState>({
    location: initialState.location,
    loading: false,
    error: null,
    denied: initialState.denied,
  });

  // Subscribe to location updates from the service
  useEffect(() => {
    return subscribeLocation(({ location, denied }) => {
      setState((prev) => ({ ...prev, location, denied }));
    });
  }, []);

  const locate = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const result = await requestLocation();

    if (result.success) {
      setState((prev) => ({
        ...prev,
        loading: false,
        location: { lat: result.lat, lng: result.lng },
      }));
      return true;
    } else {
      const errorMessages: Record<string, string> = {
        not_supported: t("location.not_supported"),
        denied: t("location.denied"),
        unavailable: t("location.unavailable"),
        timeout: t("location.timeout"),
        unknown: t("location.error"),
      };
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMessages[result.error],
      }));
      return false;
    }
  }, [t]);

  return {
    location: state.location,
    loading: state.loading,
    error: state.error,
    denied: state.denied,
    locate,
  };
}
