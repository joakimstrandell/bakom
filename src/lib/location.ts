type LocationError = "not_supported" | "denied" | "unavailable" | "timeout" | "unknown";

type LocationResult =
  | { success: true; lat: number; lng: number }
  | { success: false; error: LocationError };

type LocationState = {
  location: { lat: number; lng: number } | null;
  denied: boolean;
};

type LocationListener = (state: LocationState) => void;

const listeners = new Set<LocationListener>();
let currentState: LocationState = { location: null, denied: false };

function notify(state: Partial<LocationState>) {
  currentState = { ...currentState, ...state };
  for (const listener of listeners) {
    listener(currentState);
  }
}

/**
 * Subscribe to location state updates.
 * Returns unsubscribe function.
 */
export function subscribeLocation(listener: LocationListener): () => void {
  listeners.add(listener);
  // Immediately notify with current state
  listener(currentState);
  return () => listeners.delete(listener);
}

/**
 * Get current location state.
 */
export function getLocationState(): LocationState {
  return currentState;
}

/**
 * Check if location access has been denied.
 */
export function isLocationDenied(): boolean {
  return currentState.denied;
}

/**
 * Request user's location. Returns a promise with the result.
 * On success, notifies all subscribers. On denial, marks as denied.
 */
export function requestLocation(): Promise<LocationResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ success: false, error: "not_supported" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        notify({ location, denied: false });
        resolve({ success: true, ...location });
      },
      (err) => {
        let error: LocationError = "unknown";
        switch (err.code) {
          case err.PERMISSION_DENIED:
            error = "denied";
            notify({ denied: true });
            break;
          case err.POSITION_UNAVAILABLE:
            error = "unavailable";
            break;
          case err.TIMEOUT:
            error = "timeout";
            break;
        }
        resolve({ success: false, error });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
