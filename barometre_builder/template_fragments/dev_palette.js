      const COLOR_SYSTEM = DATA.colorSystem || { enabled: false, defaultPalette: null, palettes: [] };
      const paletteStorageKey = "barometre.dev.palette";
      const regionIndexByCode = new Map(regionOrder.map((code, index) => [code, index]));
      const palettesByKey = new Map((COLOR_SYSTEM.palettes || []).map((palette) => [palette.key, palette]));
      const paletteState = {
        key: null,
      };

      function readStoredPaletteKey() {
        try {
          return window.localStorage.getItem(paletteStorageKey);
        } catch (error) {
          return null;
        }
      }

      function writeStoredPaletteKey(key) {
        try {
          window.localStorage.setItem(paletteStorageKey, key);
        } catch (error) {
          // Ignore storage failures in static exports.
        }
      }

      function initialPaletteKey() {
        const stored = readStoredPaletteKey();
        if (stored && palettesByKey.has(stored)) return stored;
        if (COLOR_SYSTEM.defaultPalette && palettesByKey.has(COLOR_SYSTEM.defaultPalette)) return COLOR_SYSTEM.defaultPalette;
        return COLOR_SYSTEM.palettes[0] ? COLOR_SYSTEM.palettes[0].key : null;
      }

      paletteState.key = initialPaletteKey();

      function currentPalette() {
        return palettesByKey.get(paletteState.key)
          || palettesByKey.get(COLOR_SYSTEM.defaultPalette)
          || COLOR_SYSTEM.palettes[0]
          || null;
      }

      function paletteToken(name, fallback = null) {
        const palette = currentPalette();
        return palette && palette.tokens && palette.tokens[name] != null ? palette.tokens[name] : fallback;
      }

      function themeForRegion(regionCode) {
        const region = regionsByCode.get(regionCode);
        const palette = currentPalette();
        const index = regionIndexByCode.get(regionCode);
        const paletteTheme = palette && Array.isArray(palette.regionThemes) && index != null
          ? palette.regionThemes[index]
          : null;
        return paletteTheme || (region ? region.theme : DATA.regions[0].theme);
      }

      function closePalettePanel() {
        const panel = document.getElementById("palettePanel");
        const toggle = document.getElementById("paletteToggleButton");
        if (!panel || !toggle) return;
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      }

      function updatePaletteDevtools() {
        const palette = currentPalette();
        const description = document.getElementById("paletteDescription");
        const buttons = document.querySelectorAll("[data-palette-key]");
        buttons.forEach((button) => {
          const isActive = palette && button.dataset.paletteKey === palette.key;
          button.classList.toggle("is-active", isActive);
          const badge = button.querySelector(".dev-palette-badge");
          if (badge) badge.textContent = isActive ? "active" : "palette";
        });
        if (description) {
          description.textContent = palette ? palette.description : "";
        }
      }

      function rerenderPaletteViews() {
        renderLandingMap();
        renderHero();
        renderSwitchRail();
        if (state.phase !== "landing") {
          scheduleStoryRender();
        }
      }

      function applyCurrentPalette({ persist = true, rerender = false } = {}) {
        const palette = currentPalette();
        if (!palette) return;
        Object.entries(palette.tokens || {}).forEach(([tokenName, value]) => {
          document.documentElement.style.setProperty(`--${tokenName}`, value);
        });
        if (persist) writeStoredPaletteKey(palette.key);
        setTheme(state.selectedRegion);
        updatePaletteDevtools();
        if (rerender) {
          rerenderPaletteViews();
        }
      }

      function setActivePalette(paletteKey, { persist = true, rerender = true } = {}) {
        if (!palettesByKey.has(paletteKey)) return;
        paletteState.key = paletteKey;
        applyCurrentPalette({ persist, rerender });
      }

      function initPaletteDevtools() {
        const container = document.getElementById("paletteDevtools");
        const toggle = document.getElementById("paletteToggleButton");
        const panel = document.getElementById("palettePanel");
        const list = document.getElementById("paletteButtons");

        if (!container || !toggle || !panel || !list) return;
        if (!COLOR_SYSTEM.enabled || !COLOR_SYSTEM.palettes.length) {
          container.remove();
          return;
        }

        container.hidden = false;
        list.innerHTML = "";
        COLOR_SYSTEM.palettes.forEach((palette) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "dev-palette-option";
          button.dataset.paletteKey = palette.key;
          const theme = Array.isArray(palette.regionThemes) && palette.regionThemes.length
            ? palette.regionThemes[0]
            : { accent: "#ffffff", secondary: "#d9d9d9" };
          button.innerHTML = `
            <span class="dev-palette-option-head">
              <strong>${palette.label}</strong>
              <span class="dev-palette-badge">palette</span>
            </span>
            <span class="dev-palette-swatches">
              <span class="dev-palette-swatch" style="background:${theme.accent}"></span>
              <span class="dev-palette-swatch" style="background:${theme.secondary}"></span>
              <span class="dev-palette-swatch" style="background:${palette.tokens.warning}"></span>
              <span class="dev-palette-swatch" style="background:${palette.tokens.danger}"></span>
            </span>
          `;
          button.addEventListener("click", () => {
            setActivePalette(palette.key);
            closePalettePanel();
          });
          list.appendChild(button);
        });

        toggle.addEventListener("click", (event) => {
          event.stopPropagation();
          const expanded = toggle.getAttribute("aria-expanded") === "true";
          panel.hidden = expanded;
          toggle.setAttribute("aria-expanded", String(!expanded));
        });

        panel.addEventListener("click", (event) => {
          event.stopPropagation();
        });

        document.addEventListener("click", (event) => {
          if (!container.contains(event.target)) {
            closePalettePanel();
          }
        });

        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            closePalettePanel();
          }
        });

        updatePaletteDevtools();
      }
