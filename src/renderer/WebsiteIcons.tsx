import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const WebsiteIconsContext = createContext({
  enabled: false,
  ready: false,
  setEnabled: async (_enabled: boolean): Promise<void> => {},
});

export function WebsiteIconsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void window.latch
      .websiteIcons()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setEnabled(result.value);
          setReady(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <WebsiteIconsContext.Provider
      value={{
        enabled,
        ready,
        async setEnabled(value) {
          const result = await window.latch.setWebsiteIcons(value);
          if (!result.ok) throw new Error('Could not update website icons.');
          setEnabled(result.value);
        },
      }}
    >
      {children}
    </WebsiteIconsContext.Provider>
  );
}

export const useWebsiteIcons = () => useContext(WebsiteIconsContext);
