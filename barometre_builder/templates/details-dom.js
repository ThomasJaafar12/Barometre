      // Les textes issus des sources ne passent jamais par un interpréteur HTML.
      function textElement(tag, text, className = "") {
        const element = document.createElement(tag);
        element.textContent = text == null ? "" : String(text);
        if (className) element.className = className;
        return element;
      }

      function svgElement(tag, attributes = {}) {
        const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
        return element;
      }

      function textLines(target, lines) {
        target.replaceChildren();
        lines.forEach((line, index) => {
          if (index) target.append(document.createElement("br"));
          target.append(document.createTextNode(String(line)));
        });
      }

      function rangeLegend(target, first, last) {
        target.replaceChildren(textElement("span", first), textElement("span", "→"), textElement("span", last));
      }

      function rankingArticle(title, value, scope, annualChange = null) {
        const article = document.createElement("article");
        article.className = "ranking-item";
        const topline = document.createElement("div");
        topline.className = "topline";
        topline.append(textElement("strong", title), textElement("strong", value));
        article.append(topline, textElement("span", scope));
        if (annualChange !== null) article.append(textElement("small", annualChange));
        return article;
      }
      // Les index de données ne conservent ni nœuds DOM ni objets D3 mutables.
      const geographyIndexes = new WeakMap();
      function geographyIndex(geography) {
        let index = geographyIndexes.get(geography);
        if (index) return index;
        index = { departmentsByRegion: new Map(), departmentByCode: new Map(), regionByCode: new Map() };
        (geography.regions?.features || []).forEach((feature) => index.regionByCode.set(feature.properties.code, feature));
        (geography.departments?.features || []).forEach((feature) => {
          const { code, region } = feature.properties;
          index.departmentByCode.set(code, feature);
          const features = index.departmentsByRegion.get(region) || [];
          features.push(feature);
          index.departmentsByRegion.set(region, features);
        });
        geographyIndexes.set(geography, index);
        return index;
      }

      // Ce registre est l'état des contrôles montés, distinct des caches de données.
      const buttonOptionViews = new WeakMap();
      function renderButtonOptions(container, items, activeKey, onSelect, { ariaPressed = false, skipActive = false } = {}) {
        const signature = JSON.stringify(items.map((item) => [item.key, item.label]));
        let view = buttonOptionViews.get(container);
        if (!view || view.signature !== signature || view.ariaPressed !== ariaPressed) {
          view = { signature, ariaPressed, buttons: [], activeKey, onSelect, skipActive };
          container.replaceChildren();
          items.forEach((item) => {
            const button = textElement("button", item.label, "metric-button");
            button.type = "button";
            button.addEventListener("click", () => {
              if (!view.skipActive || item.key !== view.activeKey) view.onSelect(item.key);
            });
            view.buttons.push({ key: item.key, button });
            container.appendChild(button);
          });
          buttonOptionViews.set(container, view);
        }
        view.activeKey = activeKey;
        view.onSelect = onSelect;
        view.skipActive = skipActive;
        view.buttons.forEach(({ key, button }) => {
          const isActive = key === activeKey;
          button.classList.toggle("is-active", isActive);
          if (ariaPressed) button.setAttribute("aria-pressed", String(isActive));
        });
      }

      const fontReadyCallbacks = new Set();
      let fontsReadyBound = false;
      let fontsReadySettled = false;
      function onFontsReady(callback) {
        if (!document.fonts?.ready) return;
        if (fontsReadySettled) {
          queueMicrotask(callback);
          return;
        }
        fontReadyCallbacks.add(callback);
        if (fontsReadyBound) return;
        fontsReadyBound = true;
        document.fonts.ready.then(() => {
          fontsReadySettled = true;
          fontReadyCallbacks.forEach((readyCallback) => queueMicrotask(readyCallback));
          fontReadyCallbacks.clear();
        }).catch(() => fontReadyCallbacks.clear());
      }
