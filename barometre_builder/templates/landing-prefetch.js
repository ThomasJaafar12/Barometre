
    (() => {
      if (!["http:", "https:"].includes(location.protocol)) return;
      if (!document.createElement("link").relList.supports("prefetch")) return;
      const paths = __PREFETCH_PATHS__;
      const prefetch = () => {
        if (document.visibilityState !== "visible" || navigator.connection?.saveData) return;
        for (const path of paths) {
          const link = document.createElement("link");
          link.rel = "prefetch";
          link.href = path;
          document.head.append(link);
        }
      };
      const schedule = () => {
        if ("requestIdleCallback" in window) window.requestIdleCallback(prefetch);
        else window.setTimeout(prefetch, 0);
      };
      if (document.readyState === "complete") schedule();
      else window.addEventListener("load", schedule, { once: true });
    })();
