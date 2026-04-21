      const COLOR_SYSTEM = DATA.colorSystem || { enabled: false, defaultPalette: null, palettes: [] };
      const paletteStorageKey = "barometre.dev.palette";
      const regionIndexByCode = new Map(regionOrder.map((code, index) => [code, index]));
      const palettesByKey = new Map((COLOR_SYSTEM.palettes || []).map((palette) => [palette.key, palette]));
      const sceneCatalog = mapSceneConfig.catalog || { assets: {}, groups: [], roles: [] };
      const sceneCatalogById = new Map(Object.entries(sceneCatalog.assets || {}));
      const sceneRoleOptions = sceneCatalog.roles && sceneCatalog.roles.length ? sceneCatalog.roles : ["water", "terrain", "nature", "landmark", "sprite", "effect", "decor"];
      const paletteState = {
        key: null,
      };
      const sceneEditorState = {
        activeLayerId: null,
        activeScope: "mainland",
        dockCollapsed: false,
        dirty: false,
        draggedAssetId: null,
        dropScope: null,
        editing: false,
        filters: {
          role: "all",
          search: "",
          source: "all",
        },
        expandedLayerIds: {},
        layout: null,
        panelTab: "assets",
        selectedObjectId: null,
        tab: "colors",
      };

      function deepClone(value) {
        if (value == null) return value;
        if (typeof structuredClone === "function") {
          return structuredClone(value);
        }
        return JSON.parse(JSON.stringify(value));
      }

      function roundSceneValue(value, digits = 6) {
        return Number(Number(value).toFixed(digits));
      }

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function slugifySceneLabel(value) {
        return String(value || "")
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "layer";
      }

      function sceneEditorAvailable() {
        return Boolean(mapSceneConfig && mapSceneConfig.layout && sceneCatalogById.size);
      }

      function sceneFeatureAvailable() {
        return sceneEditorAvailable() || (typeof sceneCanToggle === "function" ? sceneCanToggle() : false);
      }

      function sceneStudioActive() {
        return sceneEditorAvailable() && sceneEditorState.tab === "scene";
      }

      function sceneEditorActive() {
        return sceneStudioActive() && sceneEditorState.editing;
      }

      function sceneScopeKeys() {
        return Object.keys((sceneEditorState.layout && sceneEditorState.layout.scopes) || {});
      }

      function sceneScopeLabel(scopeKey) {
        if (scopeKey === "mainland") return "Mainland";
        const region = regionsByCode.get(scopeKey);
        return region ? region.name : scopeKey;
      }

      function sceneScopeFrame(scopeKey) {
        if (scopeKey === "mainland") {
          return {
            x: mapLayout.mainlandExtent[0],
            y: mapLayout.mainlandExtent[1],
            width: mapLayout.mainlandExtent[2] - mapLayout.mainlandExtent[0],
            height: mapLayout.mainlandExtent[3] - mapLayout.mainlandExtent[1],
          };
        }
        return mapLayout.domInsets[scopeKey] || null;
      }

      function sceneScopeState(scopeKey = sceneEditorState.activeScope) {
        return sceneEditorState.layout && sceneEditorState.layout.scopes
          ? sceneEditorState.layout.scopes[scopeKey]
          : null;
      }

      function ensureSceneScopeState() {
        if (!sceneEditorAvailable()) return;
        const scopes = sceneScopeKeys();
        if (!scopes.length) return;
        if (!scopes.includes(sceneEditorState.activeScope)) {
          sceneEditorState.activeScope = scopes[0];
        }
        const scope = sceneScopeState();
        if (!scope) return;
        const availableLayerIds = scope.layers.map((layer) => layer.id);
        if (!availableLayerIds.includes(sceneEditorState.activeLayerId)) {
          sceneEditorState.activeLayerId = availableLayerIds[0] || null;
        }
      }

      function selectedSceneObjectRef() {
        if (!sceneEditorState.layout || !sceneEditorState.selectedObjectId) return null;
        return Object.entries(sceneEditorState.layout.scopes || {}).reduce((match, [scopeKey, scope]) => {
          if (match) return match;
          const index = (scope.objects || []).findIndex((objectConfig) => objectConfig.id === sceneEditorState.selectedObjectId);
          if (index === -1) return null;
          return { index, object: scope.objects[index], scope, scopeKey };
        }, null);
      }

      function compiledSceneObjectRef() {
        if (!sceneEditorState.selectedObjectId) return null;
        return Object.entries(mapSceneConfig.scopes || {}).reduce((match, [scopeKey, scope]) => {
          if (match) return match;
          const objectConfig = (scope.objects || []).find((object) => object.id === sceneEditorState.selectedObjectId);
          return objectConfig ? { object: objectConfig, scopeKey } : null;
        }, null);
      }

      function sceneLayerForObject(scopeKey, layerId) {
        const scope = sceneScopeState(scopeKey);
        return scope ? scope.layers.find((layer) => layer.id === layerId) || null : null;
      }

      function expandedSceneLayerId(scopeKey = sceneEditorState.activeScope) {
        return sceneEditorState.expandedLayerIds[scopeKey] || null;
      }

      function setExpandedSceneLayer(scopeKey, layerId) {
        if (!scopeKey) return;
        if (layerId) {
          sceneEditorState.expandedLayerIds[scopeKey] = layerId;
        } else {
          delete sceneEditorState.expandedLayerIds[scopeKey];
        }
      }

      function defaultSceneOpacity(role) {
        switch (role) {
          case "water":
            return 0.36;
          case "effect":
            return 0.22;
          case "sprite":
            return 0.74;
          case "terrain":
          case "landmark":
          case "nature":
            return 0.82;
          default:
            return 0.84;
        }
      }

      function nextSceneObjectId(scopeKey, layerId) {
        const prefix = `${scopeKey}-${slugifySceneLabel(layerId)}`;
        const existingIds = new Set((sceneScopeState(scopeKey)?.objects || []).map((objectConfig) => objectConfig.id));
        let counter = (sceneScopeState(scopeKey)?.objects || []).length + 1;
        let candidate = `${prefix}-${String(counter).padStart(2, "0")}`;
        while (existingIds.has(candidate)) {
          counter += 1;
          candidate = `${prefix}-${String(counter).padStart(2, "0")}`;
        }
        return candidate;
      }

      function nextSceneLayerId(scopeKey, label) {
        const base = slugifySceneLabel(label);
        const existingIds = new Set((sceneScopeState(scopeKey)?.layers || []).map((layer) => layer.id));
        if (!existingIds.has(base)) return base;
        let index = 2;
        let candidate = `${base}-${index}`;
        while (existingIds.has(candidate)) {
          index += 1;
          candidate = `${base}-${index}`;
        }
        return candidate;
      }

      function maxSceneOrder(scopeKey, layerId) {
        return Math.max(-1, ...(sceneScopeState(scopeKey)?.objects || []).filter((objectConfig) => objectConfig.layerId === layerId).map((objectConfig) => objectConfig.order));
      }

      function compileSceneLayout(layout) {
        const compiledScopes = {};
        const usedAssets = new Set();
        Object.entries(layout.scopes || {}).forEach(([scopeKey, scope]) => {
          const frame = sceneScopeFrame(scopeKey);
          if (!frame) return;
          const layerOrderById = Object.fromEntries((scope.layers || []).map((layer) => [layer.id, layer.order]));
          const objects = (scope.objects || [])
            .slice()
            .sort((left, right) => (layerOrderById[left.layerId] ?? 0) - (layerOrderById[right.layerId] ?? 0) || left.order - right.order || String(left.id).localeCompare(String(right.id)))
            .map((objectConfig) => {
              const shouldRenderPlaceholder = !objectConfig.assetId && (objectConfig.placeholder || objectConfig.placeholderId);
              const compiled = {
                id: objectConfig.id,
                assetId: objectConfig.assetId || null,
                layerId: objectConfig.layerId,
                layer: objectConfig.layerId,
                order: objectConfig.order,
                role: objectConfig.role,
                x: roundSceneValue(frame.x + objectConfig.x * frame.width, 2),
                y: roundSceneValue(frame.y + objectConfig.y * frame.height, 2),
                width: roundSceneValue(objectConfig.width * frame.width, 2),
                height: roundSceneValue(objectConfig.height * frame.height, 2),
                visiblePhases: deepClone(objectConfig.visiblePhases || ["landing", "national"]),
                zIndex: (layerOrderById[objectConfig.layerId] ?? 0) * 100 + objectConfig.order,
              };
              if (objectConfig.assetId) {
                compiled.asset = objectConfig.assetId;
                usedAssets.add(objectConfig.assetId);
              }
              if (objectConfig.crop) compiled.crop = deepClone(objectConfig.crop);
              if (objectConfig.motion) compiled.motion = deepClone(objectConfig.motion);
              if (objectConfig.placeholderId) compiled.placeholderId = objectConfig.placeholderId;
              if (shouldRenderPlaceholder) compiled.placeholder = true;
              if (Number.isFinite(objectConfig.opacity)) compiled.opacity = objectConfig.opacity;
              if (Number.isFinite(objectConfig.rotation) && objectConfig.rotation !== 0) compiled.rotation = objectConfig.rotation;
              return compiled;
            });
          compiledScopes[scopeKey] = {
            layers: deepClone(scope.layers || []),
            objects,
          };
        });
        const assets = {};
        usedAssets.forEach((assetId) => {
          if (sceneCatalog.assets[assetId]) {
            assets[assetId] = deepClone(sceneCatalog.assets[assetId]);
          }
        });
        return { assets, scopes: compiledScopes };
      }

      function validateSceneLayout(layout) {
        Object.entries(layout.scopes || {}).forEach(([scopeKey, scope]) => {
          const layerIds = new Set((scope.layers || []).map((layer) => layer.id));
          (scope.objects || []).forEach((objectConfig) => {
            if (!layerIds.has(objectConfig.layerId)) {
              throw new Error(`Layer '${objectConfig.layerId}' introuvable dans ${scopeKey}.`);
            }
            if (objectConfig.assetId && !sceneCatalogById.has(objectConfig.assetId)) {
              throw new Error(`Asset '${objectConfig.assetId}' introuvable dans le catalogue.`);
            }
            ["x", "y", "width", "height"].forEach((field) => {
              if (!Number.isFinite(Number(objectConfig[field]))) {
                throw new Error(`Champ '${field}' invalide pour ${objectConfig.id}.`);
              }
            });
          });
        });
        return compileSceneLayout(layout);
      }

      function setSceneDirty(value) {
        sceneEditorState.dirty = value;
        updateSceneDirtyBadge();
      }

      function syncSceneRuntime({ rerender = true } = {}) {
        if (!sceneEditorAvailable()) return;
        const compiled = compileSceneLayout(sceneEditorState.layout);
        mapSceneConfig.layout = deepClone(sceneEditorState.layout);
        mapSceneConfig.scopes = compiled.scopes;
        mapSceneConfig.assets = compiled.assets;
        if (rerender && chartRefs.regionMap.rootGroup) {
          rerenderMapScene();
        }
        refreshSceneEditorUi();
      }

      function selectedSceneAsset() {
        const selected = selectedSceneObjectRef();
        return selected && selected.object.assetId ? sceneCatalog.assets[selected.object.assetId] : null;
      }

      function setSceneTab(tab) {
        sceneEditorState.tab = tab;
        document.querySelectorAll("[data-dev-tab]").forEach((button) => {
          const isActive = button.dataset.devTab === tab;
          button.classList.toggle("is-active", isActive);
          button.setAttribute("aria-pressed", String(isActive));
        });
        document.querySelectorAll("[data-dev-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.devPanel !== tab;
          panel.classList.toggle("is-active", panel.dataset.devPanel === tab);
        });
        if (tab === "scene") {
          const panel = document.getElementById("palettePanel");
          const toggle = document.getElementById("paletteToggleButton");
          if (panel) panel.hidden = false;
          if (toggle) toggle.setAttribute("aria-expanded", "true");
          setSceneEditing(true);
          if (typeof transitionToLanding === "function" && state.phase !== "landing") {
            transitionToLanding();
          }
        } else if (sceneEditorState.editing) {
          setSceneEditing(false);
        }
        updateSceneDockUi();
        refreshSceneEditorUi();
      }

      function setScenePanelTab(tab) {
        sceneEditorState.panelTab = tab;
        updateSceneDockUi();
      }

      function setSceneDockCollapsed(collapsed) {
        sceneEditorState.dockCollapsed = Boolean(collapsed);
        updateSceneDockUi();
      }

      function updateSceneDockUi() {
        const panel = document.getElementById("palettePanel");
        const toggle = document.getElementById("paletteToggleButton");
        const dockTabs = document.querySelectorAll("[data-scene-editor-tab]");
        const dockPanels = document.querySelectorAll("[data-scene-editor-panel]");
        const collapseButton = document.getElementById("sceneDockToggleButton");
        if (panel) {
          panel.classList.toggle("is-scene-tab", sceneEditorState.tab === "scene");
          panel.classList.toggle("is-scene-collapsed", sceneEditorState.tab === "scene" && sceneEditorState.dockCollapsed);
          if (sceneStudioActive()) {
            panel.hidden = false;
          }
        }
        document.body.classList.toggle("scene-studio-open", sceneStudioActive());
        if (toggle) {
          if (sceneStudioActive()) {
            toggle.setAttribute("aria-expanded", "true");
          }
          toggle.classList.toggle("is-active", sceneStudioActive());
        }
        dockTabs.forEach((button) => {
          const isActive = button.dataset.sceneEditorTab === sceneEditorState.panelTab;
          button.classList.toggle("is-active", isActive);
          button.setAttribute("aria-pressed", String(isActive));
        });
        dockPanels.forEach((section) => {
          const isActive = section.dataset.sceneEditorPanel === sceneEditorState.panelTab;
          section.hidden = sceneEditorState.tab !== "scene" || !isActive || sceneEditorState.dockCollapsed;
          section.classList.toggle("is-active", isActive && !sceneEditorState.dockCollapsed);
        });
        if (collapseButton) {
          collapseButton.setAttribute("aria-pressed", String(sceneEditorState.dockCollapsed));
          collapseButton.setAttribute("aria-label", sceneEditorState.dockCollapsed ? "Ouvrir le dock" : "Réduire le dock");
          collapseButton.textContent = sceneEditorState.dockCollapsed ? "⇠" : "⇢";
        }
      }

      function setSceneEditing(enabled) {
        if (!sceneEditorAvailable()) return;
        sceneEditorState.editing = Boolean(enabled);
        document.body.classList.toggle("scene-editor-active", sceneEditorActive());
        const button = document.getElementById("sceneEditorModeButton");
        if (button) {
          button.classList.toggle("is-active", sceneEditorState.editing);
          button.setAttribute("aria-pressed", String(sceneEditorState.editing));
          button.textContent = sceneEditorState.editing ? "Édition active" : "Édition inactive";
        }
        if (sceneEditorState.editing && typeof setSceneMode === "function") {
          setSceneMode("premium");
          updateSceneModeControl();
        }
        hideTooltip();
        refreshSceneEditorAfterRender();
      }

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
      sceneEditorState.layout = sceneEditorAvailable() ? deepClone(mapSceneConfig.layout) : null;

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
        if (sceneStudioActive()) {
          panel.hidden = false;
          toggle.setAttribute("aria-expanded", "true");
          return;
        }
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      }

      function updateSceneModeControl() {
        const container = document.getElementById("sceneModeControl");
        const buttons = document.querySelectorAll("[data-scene-mode]");
        if (!container || !buttons.length) return;
        if (!sceneFeatureAvailable()) {
          container.hidden = true;
          return;
        }
        container.hidden = false;
        const activeMode = typeof sceneMode === "function" ? sceneMode() : "off";
        buttons.forEach((button) => {
          const isActive = button.dataset.sceneMode === activeMode;
          button.classList.toggle("is-active", isActive);
          button.setAttribute("aria-pressed", String(isActive));
        });
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

      function assetCardMatchesFilters(asset) {
        const search = sceneEditorState.filters.search.trim().toLowerCase();
        const sourceMatches = sceneEditorState.filters.source === "all" || asset.source === sceneEditorState.filters.source;
        const roleMatches = sceneEditorState.filters.role === "all" || (asset.role || "decor") === sceneEditorState.filters.role;
        if (!sourceMatches || !roleMatches) return false;
        if (!search) return true;
        return [asset.id, asset.role, asset.notes, asset.targetRegion]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      }

      function renderSceneAssetCatalog() {
        const target = document.getElementById("sceneAssetCatalog");
        if (!target) return;
        const assets = Object.values(sceneCatalog.assets || {}).filter(assetCardMatchesFilters);
        assets.sort((left, right) => left.source.localeCompare(right.source) || left.id.localeCompare(right.id));
        if (!assets.length) {
          target.innerHTML = '<p class="dev-scene-empty">Aucun asset ne correspond aux filtres.</p>';
          return;
        }
        target.innerHTML = assets.map((asset) => `
          <button
            class="dev-scene-asset${selectedSceneObjectRef() && selectedSceneObjectRef().object.assetId === asset.id ? " is-active" : ""}"
            type="button"
            draggable="true"
            data-scene-asset-id="${asset.id}">
            <span class="dev-scene-asset-head">
              <strong>${asset.id}</strong>
              <span class="dev-scene-meta">${asset.source}</span>
            </span>
            <span class="dev-scene-asset-preview">
              <img src="${asset.src}" alt="${asset.id}">
            </span>
            <small>${asset.role || "decor"}${asset.targetRegion ? ` · ${asset.targetRegion}` : ""}</small>
          </button>
        `).join("");
      }

      function updateSceneDirtyBadge() {
        const badge = document.getElementById("sceneDirtyBadge");
        if (!badge) return;
        badge.textContent = sceneEditorState.dirty ? "Dirty" : "Synced";
        badge.classList.toggle("is-dirty", sceneEditorState.dirty);
      }

      function renderSceneScopeSelects() {
        ensureSceneScopeState();
        const scopes = sceneScopeKeys();
        ["sceneScopeSelect", "sceneObjectScope"].forEach((id) => {
          const select = document.getElementById(id);
          if (!select) return;
          const currentValue = id === "sceneScopeSelect"
            ? sceneEditorState.activeScope
            : (selectedSceneObjectRef() ? selectedSceneObjectRef().scopeKey : sceneEditorState.activeScope);
          select.innerHTML = scopes.map((scopeKey) => `<option value="${scopeKey}">${sceneScopeLabel(scopeKey)}</option>`).join("");
          select.value = currentValue || scopes[0] || "";
        });
      }

      function renderSceneFilters() {
        const sourceSelect = document.getElementById("sceneSourceFilter");
        const roleSelect = document.getElementById("sceneRoleFilter");
        if (sourceSelect) {
          sourceSelect.innerHTML = ['<option value="all">Toutes sources</option>']
            .concat((sceneCatalog.groups || []).map((group) => `<option value="${group.id}">${group.label}</option>`))
            .join("");
          sourceSelect.value = sceneEditorState.filters.source;
        }
        if (roleSelect) {
          roleSelect.innerHTML = ['<option value="all">Tous rôles</option>']
            .concat(sceneRoleOptions.map((role) => `<option value="${role}">${role}</option>`))
            .join("");
          roleSelect.value = sceneEditorState.filters.role;
        }
      }

      function renderSceneLayerList() {
        const target = document.getElementById("sceneLayerList");
        if (!target) return;
        const scope = sceneScopeState();
        if (!scope) {
          target.innerHTML = '<p class="dev-scene-empty">Aucun scope disponible.</p>';
          return;
        }
        const orderedLayers = scope.layers.slice().sort((left, right) => left.order - right.order);
        const expandedLayerId = expandedSceneLayerId(sceneEditorState.activeScope);
        target.innerHTML = orderedLayers.map((layer) => `
          <div class="dev-scene-layer-row${sceneEditorState.activeLayerId === layer.id ? " is-active" : ""}${expandedLayerId === layer.id ? " is-expanded" : ""}" data-layer-id="${layer.id}">
            <div class="dev-scene-layer-main">
              <strong>${expandedLayerId === layer.id ? "▾" : "▸"} ${layer.label}</strong>
              <span class="dev-scene-layer-count">${(scope.objects || []).filter((objectConfig) => objectConfig.layerId === layer.id).length} obj</span>
            </div>
            <div class="dev-scene-layer-actions">
              <button class="dev-scene-icon" type="button" data-layer-action="up" data-layer-id="${layer.id}">↑</button>
              <button class="dev-scene-icon" type="button" data-layer-action="down" data-layer-id="${layer.id}">↓</button>
              <button class="dev-scene-icon" type="button" data-layer-action="rename" data-layer-id="${layer.id}">Rename</button>
              <button class="dev-scene-icon" type="button" data-layer-action="delete" data-layer-id="${layer.id}">Delete</button>
            </div>
            ${expandedLayerId === layer.id ? `
              <div class="dev-scene-layer-tree" data-layer-tree="${layer.id}">
                ${(scope.objects || [])
                  .filter((objectConfig) => objectConfig.layerId === layer.id)
                  .slice()
                  .sort((left, right) => left.order - right.order || String(left.id).localeCompare(String(right.id)))
                  .map((objectConfig) => `
                    <button
                      class="dev-scene-layer-tree-item${sceneEditorState.selectedObjectId === objectConfig.id ? " is-active" : ""}"
                      type="button"
                      data-layer-object-id="${objectConfig.id}"
                      data-layer-id="${layer.id}">
                      <span class="dev-scene-layer-tree-label">${objectConfig.id}</span>
                      <span class="dev-scene-layer-tree-meta">${objectConfig.assetId || objectConfig.placeholderId || "placeholder"}</span>
                    </button>
                  `)
                  .join("") || '<p class="dev-scene-empty">Aucun objet dans ce layer.</p>'}
              </div>
            ` : ""}
          </div>
        `).join("");
      }

      function renderSceneObjectAssetSelect(objectConfig) {
        const select = document.getElementById("sceneObjectAssetId");
        if (!select) return;
        const groups = sceneCatalog.groups || [];
        const options = ['<option value="">Placeholder / none</option>']
          .concat(groups.map((group) => `
            <optgroup label="${group.label}">
              ${group.assetIds.map((assetId) => `<option value="${assetId}">${assetId}</option>`).join("")}
            </optgroup>
          `))
          .join("");
        select.innerHTML = options;
        select.value = objectConfig.assetId || "";
      }

      function renderSceneLayerSelect(scopeKey, activeLayerId) {
        const select = document.getElementById("sceneObjectLayerId");
        const scope = sceneScopeState(scopeKey);
        if (!select || !scope) return;
        select.innerHTML = (scope.layers || [])
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((layer) => `<option value="${layer.id}">${layer.label}</option>`)
          .join("");
        select.value = activeLayerId || (scope.layers[0] ? scope.layers[0].id : "");
      }

      function renderSceneInspector() {
        const empty = document.getElementById("sceneInspectorEmpty");
        const form = document.getElementById("sceneInspectorForm");
        const selected = selectedSceneObjectRef();
        if (!empty || !form) return;
        if (!selected) {
          empty.hidden = false;
          form.hidden = true;
          return;
        }
        empty.hidden = true;
        form.hidden = false;
        renderSceneObjectAssetSelect(selected.object);
        renderSceneLayerSelect(selected.scopeKey, selected.object.layerId);
        renderSceneScopeSelects();
        document.getElementById("sceneObjectId").value = selected.object.id || "";
        document.getElementById("sceneObjectScope").value = selected.scopeKey;
        document.getElementById("sceneObjectRole").value = selected.object.role || "";
        document.getElementById("sceneObjectOrder").value = selected.object.order;
        document.getElementById("sceneObjectX").value = selected.object.x;
        document.getElementById("sceneObjectY").value = selected.object.y;
        document.getElementById("sceneObjectWidth").value = selected.object.width;
        document.getElementById("sceneObjectHeight").value = selected.object.height;
        document.getElementById("sceneObjectRotation").value = selected.object.rotation || 0;
        document.getElementById("sceneObjectOpacity").value = selected.object.opacity != null ? selected.object.opacity : "";
        const phases = selected.object.visiblePhases || [];
        document.getElementById("scenePhaseLanding").checked = phases.includes("landing");
        document.getElementById("scenePhaseNational").checked = phases.includes("national");
        const crop = selected.object.crop || {};
        document.getElementById("sceneCropX").value = crop.x ?? "";
        document.getElementById("sceneCropY").value = crop.y ?? "";
        document.getElementById("sceneCropWidth").value = crop.width ?? "";
        document.getElementById("sceneCropHeight").value = crop.height ?? "";
        const motion = selected.object.motion || {};
        document.getElementById("sceneMotionType").value = motion.type || "";
        document.getElementById("sceneMotionEase").value = motion.ease || "";
        document.getElementById("sceneMotionDx").value = motion.dx ?? "";
        document.getElementById("sceneMotionDy").value = motion.dy ?? "";
        document.getElementById("sceneMotionDuration").value = motion.duration ?? "";
        document.getElementById("sceneMotionDelay").value = motion.delay ?? "";
        document.getElementById("sceneMotionScale").value = motion.scale ?? "";
        document.getElementById("sceneMotionOpacity").value = motion.opacity ?? "";
        document.getElementById("sceneMotionYoyo").checked = Boolean(motion.yoyo);
      }

      function refreshSceneEditorUi() {
        if (!sceneEditorAvailable()) return;
        ensureSceneScopeState();
        renderSceneScopeSelects();
        renderSceneFilters();
        renderSceneAssetCatalog();
        renderSceneLayerList();
        renderSceneInspector();
        updateSceneDirtyBadge();
        updateSceneDockUi();
      }

      function selectSceneObject(scopeKey, objectId) {
        sceneEditorState.selectedObjectId = objectId;
        sceneEditorState.activeScope = scopeKey;
        sceneEditorState.panelTab = "inspector";
        const selected = selectedSceneObjectRef();
        sceneEditorState.activeLayerId = selected ? selected.object.layerId : sceneEditorState.activeLayerId;
        refreshSceneEditorAfterRender();
        refreshSceneEditorUi();
      }

      function clearSceneSelection() {
        sceneEditorState.selectedObjectId = null;
        refreshSceneEditorAfterRender();
        refreshSceneEditorUi();
      }

      function pointFromClient(clientX, clientY) {
        const svgNode = landingMapSvg.node();
        if (!svgNode || !svgNode.getScreenCTM()) return null;
        const point = svgNode.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        return point.matrixTransform(svgNode.getScreenCTM().inverse());
      }

      function detectSceneScopeFromPoint(point) {
        if (!point) return null;
        return sceneScopeKeys().find((scopeKey) => {
          const frame = sceneScopeFrame(scopeKey);
          return frame
            && point.x >= frame.x
            && point.x <= frame.x + frame.width
            && point.y >= frame.y
            && point.y <= frame.y + frame.height;
        }) || null;
      }

      function defaultSceneLayerForAsset(scopeKey, asset) {
        const scope = sceneScopeState(scopeKey);
        if (!scope || !scope.layers.length) return null;
        if (scope.layers.some((layer) => layer.id === sceneEditorState.activeLayerId)) {
          return sceneEditorState.activeLayerId;
        }
        if (asset && asset.role) {
          const roleLayer = scope.layers.find((layer) => layer.id === asset.role);
          if (roleLayer) return roleLayer.id;
        }
        const firstNonWater = scope.layers.find((layer) => layer.id !== "water");
        return (firstNonWater || scope.layers[0]).id;
      }

      function createSceneObjectFromAsset(assetId, scopeKey, point) {
        const asset = sceneCatalog.assets[assetId];
        const scope = sceneScopeState(scopeKey);
        const frame = sceneScopeFrame(scopeKey);
        if (!asset || !scope || !frame) return;
        const crop = asset.contentBox || { x: 0, y: 0, width: asset.width, height: asset.height };
        const widthPx = Math.min(asset.suggestedWidthPx || Math.min(asset.width, frame.width * 0.18), frame.width * 0.84);
        const heightPx = widthPx * (crop.height / crop.width);
        const width = clamp(widthPx / frame.width, 0.02, 1);
        const height = clamp(heightPx / frame.height, 0.02, 1);
        const scopePoint = point || { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
        const normalizedX = clamp((scopePoint.x - frame.x) / frame.width - width / 2, 0, Math.max(0, 1 - width));
        const normalizedY = clamp((scopePoint.y - frame.y) / frame.height - height / 2, 0, Math.max(0, 1 - height));
        const layerId = defaultSceneLayerForAsset(scopeKey, asset);
        const objectConfig = {
          id: nextSceneObjectId(scopeKey, layerId || asset.role || "layer"),
          assetId,
          layerId,
          order: maxSceneOrder(scopeKey, layerId) + 1,
          role: asset.role || "decor",
          x: roundSceneValue(normalizedX),
          y: roundSceneValue(normalizedY),
          width: roundSceneValue(width),
          height: roundSceneValue(height),
          rotation: 0,
          opacity: defaultSceneOpacity(asset.role || "decor"),
          visiblePhases: ["landing", "national"],
        };
        if (crop) {
          objectConfig.crop = deepClone(crop);
        }
        scope.objects.push(objectConfig);
        sceneEditorState.activeScope = scopeKey;
        sceneEditorState.activeLayerId = layerId;
        sceneEditorState.selectedObjectId = objectConfig.id;
        setSceneDirty(true);
        syncSceneRuntime();
      }

      function replaceSelectedObjectAsset(assetId) {
        const selected = selectedSceneObjectRef();
        const asset = sceneCatalog.assets[assetId];
        if (!selected || !asset) return;
        selected.object.assetId = assetId;
        selected.object.role = asset.role || selected.object.role || "decor";
        if (asset.contentBox) {
          selected.object.crop = deepClone(asset.contentBox);
        } else {
          delete selected.object.crop;
        }
        delete selected.object.placeholder;
        delete selected.object.placeholderId;
        setSceneDirty(true);
        syncSceneRuntime();
      }

      function moveSceneObjectPointer(event, scopeKey, objectId) {
        const selected = selectedSceneObjectRef();
        const frame = sceneScopeFrame(scopeKey);
        if (!selected || !frame) return;
        const startPoint = pointFromClient(event.clientX, event.clientY);
        if (!startPoint) return;
        const origin = { x: selected.object.x, y: selected.object.y };
        const move = (moveEvent) => {
          const point = pointFromClient(moveEvent.clientX, moveEvent.clientY);
          if (!point) return;
          const dx = (point.x - startPoint.x) / frame.width;
          const dy = (point.y - startPoint.y) / frame.height;
          selected.object.x = roundSceneValue(clamp(origin.x + dx, 0, Math.max(0, 1 - selected.object.width)));
          selected.object.y = roundSceneValue(clamp(origin.y + dy, 0, Math.max(0, 1 - selected.object.height)));
          setSceneDirty(true);
          syncSceneRuntime();
        };
        const stop = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
      }

      function resizeSceneObjectPointer(event) {
        const selected = selectedSceneObjectRef();
        const frame = selected ? sceneScopeFrame(selected.scopeKey) : null;
        if (!selected || !frame) return;
        const startPoint = pointFromClient(event.clientX, event.clientY);
        if (!startPoint) return;
        const origin = { width: selected.object.width, height: selected.object.height };
        const move = (moveEvent) => {
          const point = pointFromClient(moveEvent.clientX, moveEvent.clientY);
          if (!point) return;
          const dx = (point.x - startPoint.x) / frame.width;
          const dy = (point.y - startPoint.y) / frame.height;
          selected.object.width = roundSceneValue(clamp(origin.width + dx, 0.02, Math.max(0.02, 1 - selected.object.x)));
          selected.object.height = roundSceneValue(clamp(origin.height + dy, 0.02, Math.max(0.02, 1 - selected.object.y)));
          setSceneDirty(true);
          syncSceneRuntime();
        };
        const stop = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
      }

      function rotateSceneObjectPointer(event) {
        const selectedCompiled = compiledSceneObjectRef();
        const selected = selectedSceneObjectRef();
        if (!selectedCompiled || !selected) return;
        const center = {
          x: selectedCompiled.object.x + selectedCompiled.object.width / 2,
          y: selectedCompiled.object.y + selectedCompiled.object.height / 2,
        };
        const move = (moveEvent) => {
          const point = pointFromClient(moveEvent.clientX, moveEvent.clientY);
          if (!point) return;
          const angle = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90;
          selected.object.rotation = roundSceneValue(angle, 2);
          setSceneDirty(true);
          syncSceneRuntime();
        };
        const stop = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
      }

      function ensureSceneOverlayGroup() {
        if (!chartRefs.regionMap.featureLayer) return null;
        let overlay = chartRefs.regionMap.featureLayer.select(".scene-editor-overlay");
        if (overlay.empty()) {
          overlay = chartRefs.regionMap.featureLayer.append("g").attr("class", "scene-editor-overlay");
        }
        return overlay;
      }

      function updateSceneObjectSelectionClasses() {
        document.querySelectorAll("[data-scene-object-id]").forEach((node) => {
          node.classList.toggle("is-scene-editor-selected", sceneEditorActive() && node.getAttribute("data-scene-object-id") === sceneEditorState.selectedObjectId);
          node.classList.toggle(
            "is-scene-editor-layer-selected",
            sceneEditorActive()
              && node.getAttribute("data-scene-scope") === sceneEditorState.activeScope
              && node.getAttribute("data-scene-layer-id") === expandedSceneLayerId(sceneEditorState.activeScope)
          );
        });
      }

      function renderSceneEditorOverlay() {
        const overlay = ensureSceneOverlayGroup();
        if (!overlay) return;
        overlay.selectAll("*").remove();
        if (sceneEditorState.dropScope) {
          const frame = sceneScopeFrame(sceneEditorState.dropScope);
          if (frame) {
            overlay.append("rect")
              .attr("class", "scene-editor-scope-highlight")
              .attr("x", frame.x)
              .attr("y", frame.y)
              .attr("width", frame.width)
              .attr("height", frame.height)
              .attr("rx", sceneEditorState.dropScope === "mainland" ? 22 : 18);
          }
        }
        if (!sceneEditorActive()) return;
        const selected = compiledSceneObjectRef();
        if (!selected) return;
        const objectConfig = selected.object;
        const box = overlay.append("rect")
          .attr("class", "scene-editor-selection-box")
          .attr("x", objectConfig.x)
          .attr("y", objectConfig.y)
          .attr("width", objectConfig.width)
          .attr("height", objectConfig.height);
        overlay.append("text")
          .attr("class", "scene-editor-selection-label")
          .attr("x", objectConfig.x)
          .attr("y", Math.max(16, objectConfig.y - 8))
          .text(objectConfig.id);
        overlay.append("circle")
          .attr("class", "scene-editor-handle")
          .attr("cx", objectConfig.x + objectConfig.width)
          .attr("cy", objectConfig.y + objectConfig.height)
          .attr("r", 7)
          .on("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            resizeSceneObjectPointer(event);
          });
        overlay.append("circle")
          .attr("class", "scene-editor-handle is-rotate")
          .attr("cx", objectConfig.x + objectConfig.width / 2)
          .attr("cy", objectConfig.y - 18)
          .attr("r", 7)
          .on("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            rotateSceneObjectPointer(event);
          });
        if (selected.object.rotation) {
          box.attr("transform", `rotate(${selected.object.rotation} ${objectConfig.x + objectConfig.width / 2} ${objectConfig.y + objectConfig.height / 2})`);
        }
      }

      function refreshSceneEditorAfterRender() {
        bindSceneEditorMapInteractions();
        updateSceneObjectSelectionClasses();
        renderSceneEditorOverlay();
      }

      function bindSceneEditorFrame(frame, entry) {
        frame.style("pointer-events", "all");
        frame.style("cursor", "move");
        frame.on("pointerdown.scene-editor", (event) => {
          if (!sceneEditorActive() || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          selectSceneObject(entry.scopeKey, entry.object.id);
          moveSceneObjectPointer(event, entry.scopeKey, entry.object.id);
        });
      }

      function handleSceneAssetDragOver(event) {
        if (!sceneEditorActive()) return;
        const assetId = event.dataTransfer ? event.dataTransfer.getData("text/plain") : sceneEditorState.draggedAssetId;
        if (!assetId) return;
        const point = pointFromClient(event.clientX, event.clientY);
        sceneEditorState.dropScope = detectSceneScopeFromPoint(point);
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = sceneEditorState.dropScope ? "copy" : "none";
        }
        renderSceneEditorOverlay();
      }

      function handleSceneAssetDrop(event) {
        if (!sceneEditorActive()) return;
        const assetId = event.dataTransfer ? event.dataTransfer.getData("text/plain") : sceneEditorState.draggedAssetId;
        const point = pointFromClient(event.clientX, event.clientY);
        const scopeKey = detectSceneScopeFromPoint(point);
        sceneEditorState.draggedAssetId = null;
        sceneEditorState.dropScope = null;
        if (!assetId || !scopeKey) {
          renderSceneEditorOverlay();
          return;
        }
        event.preventDefault();
        createSceneObjectFromAsset(assetId, scopeKey, point);
      }

      function handleSceneBackgroundPointerDown(event) {
        if (!sceneEditorActive()) return;
        if (event.target.closest("[data-scene-object-id]") || event.target.closest(".scene-editor-handle")) return;
        clearSceneSelection();
      }

      function bindSceneEditorMapInteractions() {
        const svgNode = landingMapSvg.node();
        const stageShell = document.getElementById("stageShell");
        if (svgNode && svgNode.dataset.sceneEditorBound !== "true") {
          svgNode.dataset.sceneEditorBound = "true";
          svgNode.addEventListener("pointerdown", handleSceneBackgroundPointerDown);
        }
        if (stageShell && stageShell.dataset.sceneEditorBound !== "true") {
          stageShell.dataset.sceneEditorBound = "true";
          stageShell.addEventListener("dragenter", handleSceneAssetDragOver);
          stageShell.addEventListener("dragover", handleSceneAssetDragOver);
          stageShell.addEventListener("drop", handleSceneAssetDrop);
          stageShell.addEventListener("pointerdown", handleSceneBackgroundPointerDown);
        }
        if (!document.body.dataset.sceneEditorDragBound) {
          document.body.dataset.sceneEditorDragBound = "true";
          document.addEventListener("dragover", (event) => {
            if (!sceneEditorActive()) return;
            const assetId = event.dataTransfer ? event.dataTransfer.getData("text/plain") : sceneEditorState.draggedAssetId;
            if (!assetId) return;
            if (event.target.closest("#stageShell")) {
              handleSceneAssetDragOver(event);
              return;
            }
            sceneEditorState.dropScope = null;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
            renderSceneEditorOverlay();
          });
          document.addEventListener("drop", (event) => {
            if (!sceneEditorActive()) return;
            if (event.target.closest("#stageShell")) {
              handleSceneAssetDrop(event);
              return;
            }
            sceneEditorState.draggedAssetId = null;
            sceneEditorState.dropScope = null;
            renderSceneEditorOverlay();
          });
        }
      }

      function normalizeLayerOrders(scope) {
        scope.layers
          .sort((left, right) => left.order - right.order)
          .forEach((layer, index) => {
            layer.order = index;
          });
      }

      function createSceneLayer() {
        const scope = sceneScopeState();
        if (!scope) return;
        const label = window.prompt("Nom du layer", "new-layer");
        if (!label) return;
        const layer = {
          id: nextSceneLayerId(sceneEditorState.activeScope, label),
          label,
          order: scope.layers.length,
        };
        scope.layers.push(layer);
        sceneEditorState.activeLayerId = layer.id;
        setSceneDirty(true);
        syncSceneRuntime();
      }

      function renameSceneLayer(layerId) {
        const scope = sceneScopeState();
        const layer = scope ? scope.layers.find((entry) => entry.id === layerId) : null;
        if (!layer) return;
        const label = window.prompt("Nouveau nom du layer", layer.label);
        if (!label) return;
        layer.label = label;
        setSceneDirty(true);
        syncSceneRuntime({ rerender: false });
      }

      function deleteSceneLayer(layerId) {
        const scope = sceneScopeState();
        if (!scope) return;
        if ((scope.objects || []).some((objectConfig) => objectConfig.layerId === layerId)) {
          window.alert("Ce layer contient encore des objets. Déplacez-les ou supprimez-les avant.");
          return;
        }
        scope.layers = scope.layers.filter((layer) => layer.id !== layerId);
        normalizeLayerOrders(scope);
        sceneEditorState.activeLayerId = scope.layers[0] ? scope.layers[0].id : null;
        setSceneDirty(true);
        syncSceneRuntime();
      }

      function moveSceneLayer(layerId, direction) {
        const scope = sceneScopeState();
        if (!scope) return;
        const orderedLayers = scope.layers.slice().sort((left, right) => left.order - right.order);
        const index = orderedLayers.findIndex((layer) => layer.id === layerId);
        if (index === -1) return;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= orderedLayers.length) return;
        [orderedLayers[index], orderedLayers[targetIndex]] = [orderedLayers[targetIndex], orderedLayers[index]];
        orderedLayers.forEach((layer, order) => {
          layer.order = order;
        });
        scope.layers = orderedLayers;
        setSceneDirty(true);
        syncSceneRuntime();
      }

      function deleteSelectedSceneObject() {
        const selected = selectedSceneObjectRef();
        if (!selected) return;
        selected.scope.objects.splice(selected.index, 1);
        sceneEditorState.selectedObjectId = null;
        setSceneDirty(true);
        syncSceneRuntime();
      }

      function applySceneInspectorValues() {
        const selected = selectedSceneObjectRef();
        if (!selected) return;
        const objectConfig = selected.object;
        const nextScope = document.getElementById("sceneObjectScope").value;
        const nextLayerId = document.getElementById("sceneObjectLayerId").value;
        if (nextScope && nextScope !== selected.scopeKey) {
          selected.scope.objects.splice(selected.index, 1);
          const targetScope = sceneScopeState(nextScope);
          const fallbackLayer = targetScope && targetScope.layers.some((layer) => layer.id === nextLayerId)
            ? nextLayerId
            : (targetScope && targetScope.layers[0] ? targetScope.layers[0].id : objectConfig.layerId);
          objectConfig.layerId = fallbackLayer;
          targetScope.objects.push(objectConfig);
          sceneEditorState.activeScope = nextScope;
          sceneEditorState.activeLayerId = fallbackLayer;
        } else if (nextLayerId) {
          objectConfig.layerId = nextLayerId;
          sceneEditorState.activeLayerId = nextLayerId;
        }
        const nextAssetId = document.getElementById("sceneObjectAssetId").value;
        if (nextAssetId) {
          objectConfig.assetId = nextAssetId;
          delete objectConfig.placeholder;
          delete objectConfig.placeholderId;
        } else {
          delete objectConfig.assetId;
          if (objectConfig.placeholderId) {
            objectConfig.placeholder = true;
          }
        }
        objectConfig.role = document.getElementById("sceneObjectRole").value || objectConfig.role;
        objectConfig.order = Number.parseInt(document.getElementById("sceneObjectOrder").value, 10) || 0;
        objectConfig.width = roundSceneValue(clamp(Number(document.getElementById("sceneObjectWidth").value || 0.02), 0.02, 1));
        objectConfig.height = roundSceneValue(clamp(Number(document.getElementById("sceneObjectHeight").value || 0.02), 0.02, 1));
        objectConfig.x = roundSceneValue(clamp(Number(document.getElementById("sceneObjectX").value || 0), 0, Math.max(0, 1 - objectConfig.width)));
        objectConfig.y = roundSceneValue(clamp(Number(document.getElementById("sceneObjectY").value || 0), 0, Math.max(0, 1 - objectConfig.height)));
        objectConfig.rotation = roundSceneValue(Number(document.getElementById("sceneObjectRotation").value || 0), 2);
        const opacityValue = document.getElementById("sceneObjectOpacity").value;
        if (opacityValue === "") {
          delete objectConfig.opacity;
        } else {
          objectConfig.opacity = clamp(Number(opacityValue), 0, 1);
        }
        objectConfig.visiblePhases = [
          document.getElementById("scenePhaseLanding").checked ? "landing" : null,
          document.getElementById("scenePhaseNational").checked ? "national" : null,
        ].filter(Boolean);
        const cropFields = {
          x: document.getElementById("sceneCropX").value,
          y: document.getElementById("sceneCropY").value,
          width: document.getElementById("sceneCropWidth").value,
          height: document.getElementById("sceneCropHeight").value,
        };
        if (Object.values(cropFields).every((value) => value === "")) {
          delete objectConfig.crop;
        } else {
          objectConfig.crop = {
            x: Number(cropFields.x || 0),
            y: Number(cropFields.y || 0),
            width: Number(cropFields.width || 1),
            height: Number(cropFields.height || 1),
          };
        }
        const motion = {};
        const motionFields = {
          type: document.getElementById("sceneMotionType").value.trim(),
          ease: document.getElementById("sceneMotionEase").value.trim(),
          dx: document.getElementById("sceneMotionDx").value,
          dy: document.getElementById("sceneMotionDy").value,
          duration: document.getElementById("sceneMotionDuration").value,
          delay: document.getElementById("sceneMotionDelay").value,
          scale: document.getElementById("sceneMotionScale").value,
          opacity: document.getElementById("sceneMotionOpacity").value,
        };
        if (motionFields.type) motion.type = motionFields.type;
        if (motionFields.ease) motion.ease = motionFields.ease;
        ["dx", "dy", "duration", "delay", "scale", "opacity"].forEach((key) => {
          if (motionFields[key] !== "") motion[key] = Number(motionFields[key]);
        });
        if (document.getElementById("sceneMotionYoyo").checked) motion.yoyo = true;
        if (Object.keys(motion).length) {
          objectConfig.motion = motion;
        } else {
          delete objectConfig.motion;
        }
        setSceneDirty(true);
        syncSceneRuntime();
      }

      function downloadSceneLayout() {
        if (!sceneEditorAvailable()) return;
        try {
          validateSceneLayout(sceneEditorState.layout);
        } catch (error) {
          window.alert(error.message);
          return;
        }
        const json = JSON.stringify(sceneEditorState.layout, null, 2);
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "layout.json";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setSceneDirty(false);
      }

      function handleSceneKeyboard(event) {
        if (!sceneEditorAvailable()) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && sceneEditorState.tab === "scene") {
          event.preventDefault();
          downloadSceneLayout();
          return;
        }
        if (!sceneEditorActive()) return;
        if ((event.key === "Delete" || event.key === "Backspace") && sceneEditorState.selectedObjectId && !event.target.closest("input, textarea, select")) {
          event.preventDefault();
          deleteSelectedSceneObject();
        }
        if (event.key === "Escape") {
          clearSceneSelection();
        }
      }

      function initPaletteDevtools() {
        const container = document.getElementById("paletteDevtools");
        const toggle = document.getElementById("paletteToggleButton");
        const panel = document.getElementById("palettePanel");
        const list = document.getElementById("paletteButtons");
        const sceneButtons = document.querySelectorAll("[data-scene-mode]");
        const sceneDockTabs = document.querySelectorAll("[data-scene-editor-tab]");
        const tabs = document.querySelectorAll("[data-dev-tab]");
        const sceneAssetCatalog = document.getElementById("sceneAssetCatalog");
        const layerList = document.getElementById("sceneLayerList");
        const sceneEditorForm = document.getElementById("sceneInspectorForm");
        const sceneScopeSelect = document.getElementById("sceneScopeSelect");

        if (!container || !toggle || !panel || !list) return;
        if (!COLOR_SYSTEM.enabled && !sceneEditorAvailable()) {
          container.remove();
          return;
        }

        container.hidden = false;
        list.innerHTML = "";
        (COLOR_SYSTEM.palettes || []).forEach((palette) => {
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

        tabs.forEach((button) => {
          if (button.dataset.devTab === "scene" && !sceneEditorAvailable()) {
            button.hidden = true;
            return;
          }
          button.addEventListener("click", () => setSceneTab(button.dataset.devTab));
        });

        sceneDockTabs.forEach((button) => {
          button.addEventListener("click", () => setScenePanelTab(button.dataset.sceneEditorTab));
        });

        sceneButtons.forEach((button) => {
          button.addEventListener("click", () => {
            if (typeof setSceneMode === "function") {
              setSceneMode(button.dataset.sceneMode);
            }
            updateSceneModeControl();
          });
        });

        toggle.addEventListener("click", (event) => {
          event.stopPropagation();
          if (sceneStudioActive()) {
            panel.hidden = false;
            toggle.setAttribute("aria-expanded", "true");
            return;
          }
          const expanded = toggle.getAttribute("aria-expanded") === "true";
          panel.hidden = expanded;
          toggle.setAttribute("aria-expanded", String(!expanded));
        });

        panel.addEventListener("click", (event) => {
          event.stopPropagation();
        });

        document.addEventListener("click", (event) => {
          if (sceneStudioActive()) return;
          if (!container.contains(event.target)) {
            closePalettePanel();
          }
        });

        document.addEventListener("keydown", (event) => {
          if (sceneStudioActive()) return;
          if (event.key === "Escape" && !sceneEditorActive()) {
            closePalettePanel();
          }
        });
        document.addEventListener("keydown", handleSceneKeyboard);

        document.getElementById("sceneEditorModeButton")?.addEventListener("click", () => {
          setSceneEditing(!sceneEditorState.editing);
        });
        document.getElementById("sceneDockToggleButton")?.addEventListener("click", () => {
          setSceneDockCollapsed(!sceneEditorState.dockCollapsed);
        });
        document.getElementById("sceneSaveButton")?.addEventListener("click", downloadSceneLayout);
        document.getElementById("sceneAddLayerButton")?.addEventListener("click", createSceneLayer);
        document.getElementById("sceneDeleteObjectButton")?.addEventListener("click", deleteSelectedSceneObject);
        document.getElementById("sceneAssetSearch")?.addEventListener("input", (event) => {
          sceneEditorState.filters.search = event.target.value || "";
          renderSceneAssetCatalog();
        });
        document.getElementById("sceneSourceFilter")?.addEventListener("change", (event) => {
          sceneEditorState.filters.source = event.target.value;
          renderSceneAssetCatalog();
        });
        document.getElementById("sceneRoleFilter")?.addEventListener("change", (event) => {
          sceneEditorState.filters.role = event.target.value;
          renderSceneAssetCatalog();
        });
        sceneScopeSelect?.addEventListener("change", (event) => {
          sceneEditorState.activeScope = event.target.value;
          ensureSceneScopeState();
          refreshSceneEditorUi();
          refreshSceneEditorAfterRender();
        });
        sceneAssetCatalog?.addEventListener("dragstart", (event) => {
          const target = event.target.closest("[data-scene-asset-id]");
          if (!target) return;
          sceneEditorState.draggedAssetId = target.dataset.sceneAssetId;
          target.classList.add("is-dragging");
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("text/plain", target.dataset.sceneAssetId);
          }
        });
        sceneAssetCatalog?.addEventListener("dragend", (event) => {
          const target = event.target.closest("[data-scene-asset-id]");
          if (target) target.classList.remove("is-dragging");
          sceneEditorState.draggedAssetId = null;
          sceneEditorState.dropScope = null;
          renderSceneEditorOverlay();
        });
        sceneAssetCatalog?.addEventListener("click", (event) => {
          const target = event.target.closest("[data-scene-asset-id]");
          if (!target || !sceneEditorAvailable()) return;
          if (sceneEditorState.selectedObjectId && sceneEditorActive()) {
            replaceSelectedObjectAsset(target.dataset.sceneAssetId);
            return;
          }
          if (sceneEditorActive()) {
            const frame = sceneScopeFrame(sceneEditorState.activeScope);
            if (frame) {
              createSceneObjectFromAsset(target.dataset.sceneAssetId, sceneEditorState.activeScope, {
                x: frame.x + frame.width / 2,
                y: frame.y + frame.height / 2,
              });
            }
          }
        });
        layerList?.addEventListener("click", (event) => {
          const actionTarget = event.target.closest("[data-layer-action]");
          const objectTarget = event.target.closest("[data-layer-object-id]");
          const row = event.target.closest("[data-layer-id]");
          if (actionTarget) {
            const layerId = actionTarget.dataset.layerId;
            const action = actionTarget.dataset.layerAction;
            if (action === "up") moveSceneLayer(layerId, -1);
            if (action === "down") moveSceneLayer(layerId, 1);
            if (action === "rename") renameSceneLayer(layerId);
            if (action === "delete") deleteSceneLayer(layerId);
            return;
          }
          if (objectTarget) {
            selectSceneObject(sceneEditorState.activeScope, objectTarget.dataset.layerObjectId);
            return;
          }
          if (row) {
            const layerId = row.dataset.layerId;
            sceneEditorState.activeLayerId = layerId;
            setExpandedSceneLayer(
              sceneEditorState.activeScope,
              expandedSceneLayerId(sceneEditorState.activeScope) === layerId ? null : layerId
            );
            renderSceneLayerList();
            refreshSceneEditorAfterRender();
          }
        });
        sceneEditorForm?.addEventListener("input", applySceneInspectorValues);
        sceneEditorForm?.addEventListener("change", applySceneInspectorValues);

        bindSceneEditorMapInteractions();
        if (sceneEditorAvailable()) {
          ensureSceneScopeState();
          syncSceneRuntime({ rerender: false });
        }
        updatePaletteDevtools();
        updateSceneModeControl();
        refreshSceneEditorUi();
        setSceneTab("colors");
        setSceneEditing(false);
        updateSceneDockUi();
      }
