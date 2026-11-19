
    (() => {
      if (!barometreDependenciesAvailable()) return;
      const map = window.BAROMETRE_REGION_MAP;
      if (!map) {
        const message = document.getElementById("dependencyError");
        if (message) message.hidden = false;
        return;
      }
      window.BAROMETRE_REGION_MAP = null;
      const {
        buildScale, chartRefs, cockpitCenter, colorWithAlpha, createIndicatorCard, updateIndicatorCard,
        formatCount, formatCurrency, frNumber, monthLabel, quarterLabel, hideTooltip, paletteToken,
        regionsByCode, resetTerritoryPreview, setTheme, showTooltip, state, themeForRegion,
      } = map;
__DETAILS_DOM_SCRIPT__
      const DATA = window.BAROMETRE_BOOT;
      const detail = DATA.detail;
      const deferredSrc = window.BAROMETRE_DEFERRED_SRC;
      let deferredGzip = window.BAROMETRE_DEFERRED_GZIP;
      let departmentGeographyGzip = __DEPARTMENT_GEOGRAPHY_B64__;
      window.BAROMETRE_BOOT = null;
      window.BAROMETRE_DEFERRED_GZIP = null;
      const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
      const REDUCED_MOTION = motionPreference.matches;
      const REGION_PRIMARY_CITIES = new Map([
        ["11", { name: "Paris", coordinates: [2.3522, 48.8566] }],
        ["24", { name: "Tours", coordinates: [0.6848, 47.3941] }],
        ["27", { name: "Dijon", coordinates: [5.0415, 47.322] }],
        ["28", { name: "Le Havre", coordinates: [0.1079, 49.4944] }],
        ["32", { name: "Lille", coordinates: [3.0573, 50.6292] }],
        ["44", { name: "Strasbourg", coordinates: [7.7521, 48.5734] }],
        ["52", { name: "Nantes", coordinates: [-1.5536, 47.2184] }],
        ["53", { name: "Rennes", coordinates: [-1.6778, 48.1173] }],
        ["75", { name: "Bordeaux", coordinates: [-0.5792, 44.8378] }],
        ["76", { name: "Toulouse", coordinates: [1.4442, 43.6047] }],
        ["84", { name: "Lyon", coordinates: [4.8357, 45.764] }],
        ["93", { name: "Marseille", coordinates: [5.3698, 43.2965] }],
        ["94", { name: "Ajaccio", coordinates: [8.7386, 41.9189] }],
        ["01", { name: "Les Abymes", coordinates: [-61.5082, 16.2701] }],
        ["02", { name: "Fort-de-France", coordinates: [-61.0732, 14.6104] }],
        ["03", { name: "Saint-Laurent", coordinates: [-54.0325, 5.5015] }],
        ["04", { name: "Saint-Denis", coordinates: [55.4481, -20.8789] }],
        ["06", { name: "Mamoudzou", coordinates: [45.2279, -12.7806] }],
      ]);
      const videos = DATA.assets.videos;
      const nationalVideo = videos.national || videos.placeholder;
      const stageShell = document.getElementById("stageShell");
      const stagePoster = document.getElementById("stagePoster");
      const stageVideo = document.getElementById("stageVideo");
      const stageVideoToggle = document.getElementById("stageVideoToggle");
      const story = document.getElementById("story");
      const topicDescription = document.getElementById("topicDescription");
      const topicDescriptionText = topicDescription.textContent;
      const geoControl = document.getElementById("geoControl");
      const geoTrigger = document.getElementById("geoTrigger");
      const geoCurrent = document.getElementById("geoCurrent");
      const geoMenu = document.getElementById("geoMenu");
      Object.assign(state, {
        sectorEffectifsSeriesKey: null,
        sectorPayrollSeriesKey: null,
        sectorTreemapMetric: "effectifs_cvs",
        sectorDepartmentMetric: "effectifs_cvs",
        sectorDepartmentSectorKey: null,
        autoMetric: "economically_active",
        autoSector: null,
        pcolSectorKey: "population-entiere",
        pcolMode: "all",
        dpaeMode: "all",
        delaiSectorKey: "ensemble",
        delaiMode: "all",
      });

      let storyRenderHandle = null;
      let storyRenderGeneration = 0;
      let geographySelectorView = null;
      let deferredDataPromise = null;
      let departmentGeographyPromise = null;
      let departmentFocusTimeline = null;
      let regionTransitionToken = 0;
      let mapCameraMotion = null;
      let videoSource = null;
      let videoFailed = false;
      let stageInView = false;
      let videoWanted = !motionPreference.matches && !navigator.connection?.saveData;

      gsap.registerPlugin(ScrollTrigger);

      function formatPercent(value, digits = 1) {
        if (value == null || Number.isNaN(value)) return "—";
        return `${frNumber(value, digits)} %`;
      }

      function dateLabel(dateValue) {
        if (!dateValue) return "—";
        return monthLabel(dateValue);
      }

      function currentRegion() {
        return regionsByCode.get(state.selectedRegion);
      }

      function heroPayloadForScope() {
        if (state.phase === "national") return DATA.nationalHero;
        return currentRegion().hero;
      }

      function scopeLabel() {
        return state.phase === "national" ? "France entière" : currentRegion().name;
      }

      function refreshChapterPositions() {
        ScrollTrigger.removeEventListener("scrollEnd", refreshChapterPositions);
        if (state.phase === "landing") return;
        if (ScrollTrigger.isScrolling()) {
          ScrollTrigger.addEventListener("scrollEnd", refreshChapterPositions);
          return;
        }
        // Les chapitres ne sont pas épinglés. Mesurer chaque seuil conserve la position du lecteur.
        ScrollTrigger.getAll().forEach(trigger => trigger.refresh());
      }

      function renderHeaderActions() {
        topicDescription.textContent = state.phase === "region"
          ? `${topicDescriptionText} · ${currentRegion().name}`
          : topicDescriptionText;
        renderGeographySelector();
      }

      function selectedGeoKey() {
        return state.phase === "region"
          ? state.selectedHistorical?.key || state.selectedRegion
          : "national";
      }

      const SELECTOR_CURRENT_REGION_CODES = ["84", "27", "53", "24", "94", "44", "32", "11", "28", "75", "76", "52", "93"];
      const SELECTOR_OVERSEAS_REGION_CODES = ["01", "03", "04", "02", "06"];
      const SELECTOR_HISTORICAL_TERRITORIES = [
        ["alsace", "Alsace", "44"],
        ["aquitaine", "Aquitaine", "75"],
        ["auvergne", "Auvergne", "84"],
        ["basse-normandie", "Basse-Normandie", "28"],
        ["bourgogne", "Bourgogne", "27"],
        ["centre", "Centre", "24", true],
        ["champagne-ardenne", "Champagne-Ardenne", "44"],
        ["franche-comte", "Franche-Comté", "27"],
        ["haute-normandie", "Haute-Normandie", "28"],
        ["languedoc-roussillon", "Languedoc-Roussillon", "76"],
        ["limousin", "Limousin", "75"],
        ["lorraine", "Lorraine", "44"],
        ["midi-pyrenees", "Midi-Pyrénées", "76"],
        ["nord-pas-de-calais", "Nord-Pas-de-Calais", "32"],
        ["picardie", "Picardie", "32"],
        ["poitou-charentes", "Poitou-Charentes", "75"],
        ["rhone-alpes", "Rhône-Alpes", "84"],
        ["bretagne", "Bretagne", "53", true],
        ["corse", "Corse", "94", true],
        ["ile-de-france", "Île-de-France", "11", true],
        ["pays-de-la-loire", "Pays de la Loire", "52", true],
        ["provence-alpes-cote-d-azur", "Provence-Alpes-Côte d'Azur", "93", true],
      ];

      function setGeoMenuOpen(isOpen) {
        geoControl.classList.toggle("is-open", isOpen);
        geoTrigger.setAttribute("aria-expanded", String(isOpen));
      }

      function renderGeographySelector() {
        const activeKey = selectedGeoKey();
        const activeLabel = activeKey === "national" ? "France entière" : state.selectedHistorical?.label || currentRegion().name;
        const hasReturnAction = state.phase !== "landing";
        geoCurrent.textContent = activeLabel;
        geoTrigger.setAttribute("aria-label", `Choisir la zone géographique, actuellement ${activeLabel}`);
        geoControl.classList.toggle("has-return-action", hasReturnAction);
        if (geographySelectorView?.hasReturnAction === hasReturnAction) {
          if (geographySelectorView.activeKey !== activeKey) {
            geographySelectorView.optionButtons.forEach((button, key) => {
              button.classList.toggle("is-active", key === activeKey);
              button.setAttribute("aria-selected", String(key === activeKey));
            });
            geographySelectorView.activeKey = activeKey;
          }
          return;
        }
        const optionButtons = new Map();
        geoMenu.replaceChildren();

        const header = document.createElement("div");
        header.className = "geo-menu-action-header";
        const contextLabel = document.createElement("span");
        contextLabel.className = "geo-context-label";
        contextLabel.textContent = "Sélection du Territoire";
        header.appendChild(contextLabel);
        if (hasReturnAction) {
          const returnButton = document.createElement("button");
          returnButton.type = "button";
          returnButton.className = "geo-return-button";
          const returnIcon = svgElement("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
          returnIcon.append("\n              ", svgElement("polyline", { points: "15 18 9 12 15 6" }), "\n            ");
          returnButton.append("\n            ", returnIcon, "\n            ", textElement("span", "Retour à la carte"), "\n          ");
          returnButton.addEventListener("click", () => {
            setGeoMenuOpen(false);
            transitionToLanding();
          });
          header.appendChild(returnButton);
        }
        geoMenu.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "geo-selector-grid";
        geoMenu.appendChild(grid);

        const createColumn = (title, counterText = null) => {
          const column = document.createElement("div");
          column.className = "geo-selector-column";
          const titleBar = document.createElement("div");
          titleBar.className = "geo-column-title-bar";
          const titleElement = document.createElement("span");
          titleElement.className = "geo-column-title";
          titleElement.textContent = title;
          titleBar.appendChild(titleElement);
          if (counterText != null) {
            const counter = document.createElement("span");
            counter.className = "geo-column-counter";
            counter.textContent = String(counterText);
            titleBar.appendChild(counter);
          }
          column.appendChild(titleBar);
          grid.appendChild(column);
          return column;
        };

        const createActiveDot = () => {
          const dot = document.createElement("span");
          dot.className = "geo-active-dot";
          dot.setAttribute("aria-hidden", "true");
          return dot;
        };

        const nationalColumn = createColumn("National");
        const nationalButton = document.createElement("button");
        nationalButton.type = "button";
        nationalButton.className = `geo-national-card${activeKey === "national" ? " is-active" : ""}`;
        nationalButton.setAttribute("role", "option");
        nationalButton.setAttribute("aria-selected", String(activeKey === "national"));
        nationalButton.append(
          "\n          ", textElement("span", "France entière", "geo-national-title"),
          "\n          ", textElement("span", "Vue consolidée sur tout le territoire.", "geo-national-desc"), "\n        ",
        );
        nationalButton.addEventListener("click", () => {
          setGeoMenuOpen(false);
          transitionToNational();
        });
        nationalColumn.appendChild(nationalButton);
        optionButtons.set("national", nationalButton);

        const createList = (column) => {
          const list = document.createElement("ul");
          list.className = "geo-list-container";
          column.appendChild(list);
          return list;
        };

        const appendRegionRow = (list, region, historical = null) => {
          if (!region) return;
          const key = historical?.key || region.code;
          const item = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.className = `geo-selector-row${key === activeKey ? " is-active" : ""}`;
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", String(key === activeKey));
          if (historical) button.dataset.historicalTerritory = key;
          const label = document.createElement("span");
          label.textContent = historical?.label || region.name;
          button.appendChild(label);
          button.appendChild(createActiveDot());
          button.addEventListener("click", () => {
            setGeoMenuOpen(false);
            transitionToRegion(region.code, true, historical);
          });
          item.appendChild(button);
          list.appendChild(item);
          optionButtons.set(key, button);
        };

        const appendHistoricalRow = (list, [key, label, regionCode, sharesCurrentClip]) => {
          const src = videos.byHistorical?.[key] || (sharesCurrentClip ? videos.byRegion[regionCode] : null);
          if (src && src !== videos.placeholder) {
            appendRegionRow(list, regionsByCode.get(regionCode), { key, label, src });
            return;
          }
          const item = document.createElement("li");
          const row = document.createElement("div");
          row.className = "geo-selector-static-row";
          row.setAttribute("role", "option");
          row.setAttribute("aria-selected", "false");
          row.setAttribute("aria-disabled", "true");
          row.appendChild(textElement("span", label));
          row.appendChild(createActiveDot());
          item.appendChild(row);
          list.appendChild(item);
        };

        const currentColumn = createColumn("Actuelles", 13);
        const currentList = createList(currentColumn);
        SELECTOR_CURRENT_REGION_CODES.forEach((code) => appendRegionRow(currentList, regionsByCode.get(code)));

        const historicalColumn = createColumn("Anciennes", 22);
        const historicalList = createList(historicalColumn);
        SELECTOR_HISTORICAL_TERRITORIES.forEach((territory) => appendHistoricalRow(historicalList, territory));

        const overseasColumn = createColumn("Outre-mer", 5);
        const overseasList = createList(overseasColumn);
        SELECTOR_OVERSEAS_REGION_CODES.forEach((code) => appendRegionRow(overseasList, regionsByCode.get(code)));
        geographySelectorView = { hasReturnAction, activeKey, optionButtons };
      }

      function renderHero() {
        const title = document.getElementById("heroTitle");
        const heroKpis = document.getElementById("heroKpis");
        const heroData = heroPayloadForScope();
        const name = scopeLabel();
        const lastWord = Math.max(name.lastIndexOf(" "), name.lastIndexOf("-")) + 1;
        title.replaceChildren(name.slice(0, lastWord), textElement("span", name.slice(lastWord), "hero-title-accent"));
        const usesFallbackClip = state.phase === "region" && videoSource === videos.placeholder;
        const location = usesFallbackClip ? null : videos.locations?.[videoSource];
        document.getElementById("stageLocationName").textContent = location || state.selectedHistorical?.label || name;

        heroKpis.replaceChildren(...detail.indicators.map((indicator) => {
          const article = createIndicatorCard(indicator);
          updateIndicatorCard(article, indicator, heroData[indicator.key]);
          return article;
        }));
      }

      function syncVideoPlayback() {
        const available = state.phase !== "landing" && videoSource && !videoFailed;
        stageVideoToggle.hidden = !available;
        stageVideoToggle.setAttribute("aria-label", videoWanted ? "Mettre la vidéo en pause" : "Lire la vidéo");
        stageVideoToggle.toggleAttribute("data-pause", videoWanted);
        if (!available || !videoWanted || !stageInView || document.hidden) {
          stageVideo.pause();
          return;
        }
        if (stageVideo.getAttribute("src") !== videoSource) stageVideo.src = videoSource;
        if (!stageVideo.paused) return;
        const source = videoSource;
        stageVideo.play().catch((error) => {
          if (error.name === "NotAllowedError" && videoSource === source && videoWanted) {
            videoWanted = false;
            syncVideoPlayback();
          }
        });
      }

      function updateVideo(source) {
        if (source === videoSource && !videoFailed) return;
        videoSource = source;
        videoFailed = false;
        stageVideo.classList.remove("has-frame");
        if (stageVideo.hasAttribute("src")) {
          stageVideo.removeAttribute("src");
          stageVideo.load();
        }
        stagePoster.hidden = true;
        const poster = videos.posters?.[source];
        if (poster) {
          stagePoster.src = poster;
          stagePoster.hidden = !(stagePoster.complete && stagePoster.naturalWidth);
        } else {
          stagePoster.removeAttribute("src");
        }
        syncVideoPlayback();
      }

      function initStageMedia() {
        stageVideo.muted = true;
        stagePoster.addEventListener("load", () => {
          stagePoster.hidden = !stagePoster.naturalWidth;
        });
        stageVideo.addEventListener("playing", () => {
          if (stageVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            stageVideo.classList.add("has-frame");
          }
        });
        stageVideo.addEventListener("error", () => {
          if (!stageVideo.error || !stageVideo.hasAttribute("src")) return;
          videoFailed = true;
          stageVideo.classList.remove("has-frame");
          syncVideoPlayback();
        });
        stageVideoToggle.addEventListener("click", () => {
          videoWanted = !videoWanted;
          syncVideoPlayback();
        });
        motionPreference.addEventListener("change", () => {
          videoWanted = !motionPreference.matches && !navigator.connection?.saveData;
          syncVideoPlayback();
        });
        document.addEventListener("visibilitychange", syncVideoPlayback);
        new IntersectionObserver(([entry]) => {
          stageInView = entry.isIntersecting;
          syncVideoPlayback();
        }).observe(stageVideo);
      }

      function clearFocusOverlay() {
        departmentFocusTimeline?.kill();
        departmentFocusTimeline = null;
        chartRefs.regionMap.focusGroup?.selectAll("*").remove();
      }

      function setMapCameraMoving(isMoving) {
        stageShell.classList.toggle("is-camera-moving", isMoving);
        if (isMoving && !mapCameraMotion) {
          let finish;
          const finished = new Promise((resolve) => { finish = resolve; });
          mapCameraMotion = { finished, finish };
        } else if (!isMoving && mapCameraMotion) {
          const { finish } = mapCameraMotion;
          mapCameraMotion = null;
          finish();
        }
      }

      function applyCameraTransform() {
        const { cameraGroup, cameraState } = chartRefs.regionMap;
        if (!cameraGroup || !cameraState) return;
        cameraGroup.attr("transform", `translate(${cameraState.x},${cameraState.y}) scale(${cameraState.scale})`);
      }

      function getRegionCameraTargets(regionCode) {
        const selection = chartRefs.regionMap.pathByCode.get(regionCode);
        if (!selection) return [];
        const { x, y, width, height } = selection.node().getBBox();
        const fit = 620 / Math.max(width, height);
        const [centerX, centerY] = cockpitCenter();
        return [Math.max(1.8, Math.min(4.2, fit)), Math.max(1.8, Math.min(5.1, fit * 1.28))]
          .map((scale) => ({
            scale,
            x: centerX - (x + width / 2) * scale,
            y: centerY - (y + height / 2) * scale,
          }));
      }

      function animateCameraToTarget(target, { duration, ease }) {
        if (!target) return Promise.resolve();
        return new Promise((resolve) => {
          gsap.to(chartRefs.regionMap.cameraState, {
            ...target,
            duration,
            ease,
            onUpdate: applyCameraTransform,
            onComplete: resolve,
            onInterrupt: resolve,
          });
        });
      }

      function drawDepartmentFocusPaths(regionCode) {
        const focusGroup = chartRefs.regionMap.focusGroup;
        const generator = chartRefs.regionMap.pathGeneratorByCode.get(regionCode);
        if (!focusGroup || !generator || !DATA.geography.departments) return [];
        const features = geographyIndex(DATA.geography).departmentsByRegion.get(regionCode) || [];
        return focusGroup.selectAll("path").data(features).join("path")
          .attr("class", "focus-department-path")
          .attr("d", generator)
          .attr("stroke-dasharray", 1)
          .attr("stroke-dashoffset", 1)
          .attr("pathLength", 1)
          .attr("opacity", 0)
          .nodes();
      }

      function drawRegionCityMarker(regionCode) {
        const focusGroup = chartRefs.regionMap.focusGroup;
        const generator = chartRefs.regionMap.pathGeneratorByCode.get(regionCode);
        const city = REGION_PRIMARY_CITIES.get(regionCode);
        if (!focusGroup || !generator || !city || typeof generator.projection !== "function") return null;
        const projection = generator.projection();
        if (!projection) return null;
        const projected = projection(city.coordinates);
        if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return null;
        const [x, y] = projected;
        const group = focusGroup.append("g").attr("class", "focus-city").attr("opacity", 0);
        group.append("circle").attr("class", "focus-city-dot").attr("cx", x).attr("cy", y).attr("r", 3.6);
        group.append("text").attr("class", "focus-city-label").attr("x", x).attr("y", y - 14).text(city.name);
        return group.node();
      }

      function animateDepartmentFocus(regionCode) {
        const paths = drawDepartmentFocusPaths(regionCode);
        const cityMarker = drawRegionCityMarker(regionCode);
        if (!paths.length) return Promise.resolve();
        return new Promise((resolve) => {
          const timeline = gsap.timeline({ onComplete: resolve, onInterrupt: resolve });
          departmentFocusTimeline = timeline;
          const totalStagger = 0.7;
          const eachDelay = paths.length > 1 ? totalStagger / (paths.length - 1) : 0;
          paths.forEach((path, index) => {
            timeline.to(path, {
              attr: { "stroke-dashoffset": 0 },
              opacity: 1,
              duration: 0.62,
              ease: "power2.out",
            }, index * eachDelay);
          });
          if (cityMarker) {
            timeline.to(cityMarker, {
              opacity: 1,
              duration: 0.38,
              ease: "power2.out",
            }, Math.min(totalStagger * 0.45, 0.42));
          }
        });
      }

      async function loadDeferredGzip() {
        if (deferredGzip) return deferredGzip;
        if (!deferredSrc) throw new Error("Missing deferred payload source");
        const script = document.createElement("script");
        script.src = deferredSrc;
        try {
          await new Promise((resolve, reject) => {
            script.addEventListener("load", resolve, { once: true });
            script.addEventListener("error", () => reject(new Error("Unable to load deferred payload")), { once: true });
            document.head.append(script);
          });
          const encoded = window.BAROMETRE_DEFERRED_GZIP;
          if (!encoded || typeof encoded !== "string") throw new Error("Missing deferred payload");
          return encoded;
        } finally {
          window.BAROMETRE_DEFERRED_GZIP = null;
          script.remove();
        }
      }

      function decompressGzipText(encoded) {
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        return new Response(stream).text();
      }

      function ensureDepartmentGeography() {
        departmentGeographyPromise ??= Promise.resolve()
          .then(() => decompressGzipText(departmentGeographyGzip))
          .then((json) => {
            const departments = JSON.parse(json);
            if (!Array.isArray(departments?.features)) throw new Error("Invalid departmental geography");
            DATA.geography = { ...DATA.geography, departments };
            departmentGeographyGzip = null;
          })
          .catch((error) => {
            departmentGeographyPromise = null;
            throw error;
          });
        return departmentGeographyPromise;
      }

      async function parseDeferredData(encoded) {
        const json = await decompressGzipText(encoded);
        // Laisser la caméra finir et la vue régionale s'afficher avant de parser les séries.
        while (mapCameraMotion) {
          await mapCameraMotion.finished;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        return JSON.parse(json);
      }

      function ensureDeferredData() {
        if (DATA.modules && DATA.geography.departments) {
          return Promise.resolve(DATA);
        }
        deferredDataPromise ??= Promise.all([ensureDepartmentGeography(), loadDeferredGzip().then(parseDeferredData)])
          .then(([, { geography, modules }]) => {
            if (!modules) throw new Error("Invalid deferred payload");
            if (modules.sector) {
              state.sectorEffectifsSeriesKey ??= modules.sector.regional.national.defaultSeriesKey;
              state.sectorPayrollSeriesKey ??= modules.sector.regional.national.defaultSeriesKey;
              state.sectorDepartmentSectorKey ??= modules.sector.departmental.defaultSectorKey;
            }
            if (modules.auto) state.autoSector ??= modules.auto.defaultSector;
            if (Object.keys(geography || {}).length) DATA.geography = { ...DATA.geography, ...geography };
            DATA.modules = modules;
            deferredGzip = null;
            return DATA;
          })
          .catch((error) => {
            deferredDataPromise = null;
            throw error;
          });
        return deferredDataPromise;
      }

      function scheduleDeferredPreload() {
        const preload = () => {
          ensureDeferredData().catch((error) => console.error("Deferred payload error", error));
        };
        // Give the map a frame to paint before starting the chart payload.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if ("requestIdleCallback" in window) {
            window.requestIdleCallback(preload, { timeout: 1500 });
          } else {
            window.setTimeout(preload, 0);
          }
        }));
      }

      function resetCamera() {
        chartRefs.regionMap.cameraState.scale = 1;
        chartRefs.regionMap.cameraState.x = 0;
        chartRefs.regionMap.cameraState.y = 0;
        applyCameraTransform();
      }

      function scheduleStoryRender() {
        const generation = ++storyRenderGeneration;
        const transitionToken = regionTransitionToken;
        if (storyRenderHandle != null) cancelAnimationFrame(storyRenderHandle);
        storyRenderHandle = requestAnimationFrame(() => {
          storyRenderHandle = null;
          ensureDeferredData()
            .then(() => {
              if (generation !== storyRenderGeneration || transitionToken !== regionTransitionToken || state.phase === "landing") return;
              __CHAPTER_RENDER_FUNCTION__();
            })
            .catch((error) => console.error("Deferred payload error", error));
        });
      }

      function revealContent() {
        story.classList.add("is-visible");
        // Set initial animation styles before the browser can paint the story.
        mountScrollReveal();
      }

      function applyPhase(phase) {
        const activeControl = document.activeElement;
        const restoreKeyboardFocus = activeControl?.matches(":focus-visible")
          && (stageShell.contains(activeControl) || geoMenu.contains(activeControl));
        state.phase = phase;
        stageShell.dataset.phase = phase;
        if (phase === "landing") {
          state.mapHoverLocked = false;
          storyRenderGeneration += 1;
          if (storyRenderHandle != null) cancelAnimationFrame(storyRenderHandle);
          storyRenderHandle = null;
        }
        syncVideoPlayback();
        stageShell.classList.toggle("is-map-hover-locked", state.mapHoverLocked);
        renderHeaderActions();
        if (phase === "landing") {
          story.classList.remove("is-visible");
        }
        if (restoreKeyboardFocus) geoTrigger.focus({ preventScroll: true });
      }

      function transitionToLanding() {
        regionTransitionToken += 1;
        setMapCameraMoving(false);
        clearFocusOverlay();
        gsap.killTweensOf(chartRefs.regionMap.cameraState);
        state.selectedHistorical = null;
        updateVideo(null);
        resetCamera();
        setTheme(null);
        applyPhase("landing");
        resetTerritoryPreview();
        window.scrollTo({
          top: 0,
          behavior: REDUCED_MOTION ? "auto" : "smooth",
        });
      }

      function transitionToNational() {
        regionTransitionToken += 1;
        setMapCameraMoving(false);
        clearFocusOverlay();
        gsap.killTweensOf(chartRefs.regionMap.cameraState);
        state.selectedHistorical = null;
        updateVideo(nationalVideo);
        applyPhase("national");
        setTheme(state.selectedRegion);
        renderHero();
        revealContent();
        scheduleStoryRender();
      }

      async function transitionToRegion(regionCode, fromRail, historical = null) {
        const transitionToken = ++regionTransitionToken;
        const zoom = !REDUCED_MOTION && !fromRail && state.phase === "landing";
        const [approach, closeup] = zoom ? getRegionCameraTargets(regionCode) : [];
        setMapCameraMoving(zoom);
        state.mapHoverLocked = true;
        stageShell.classList.add("is-map-hover-locked");
        chartRefs.regionMap.pathByCode.forEach((element) => element.classed("is-hovered", false));
        dismissVizTooltip();
        hideTooltip();
        state.selectedRegion = regionCode;
        state.selectedHistorical = historical;
        setTheme(regionCode);
        updateVideo(historical?.src || videos.byRegion[regionCode] || currentRegion().video || videos.placeholder);
        clearFocusOverlay();
        gsap.killTweensOf(chartRefs.regionMap.cameraState);
        if (zoom) {
          resetCamera();
          const geographyReady = ensureDepartmentGeography().catch((error) => {
            console.error("Departmental geography error", error);
          });
          ensureDeferredData().catch((error) => {
            console.error("Deferred payload error", error);
          });
          await animateCameraToTarget(approach, { duration: 1.2, ease: "power2.inOut" });
          await geographyReady;
          if (transitionToken !== regionTransitionToken) return;
          await animateDepartmentFocus(regionCode);
          if (transitionToken !== regionTransitionToken) return;
          await animateCameraToTarget(closeup, { duration: 1.22, ease: "power2.out" });
          if (transitionToken !== regionTransitionToken) return;
          clearFocusOverlay();
        }
        applyPhase("region");
        setMapCameraMoving(false);
        renderHero();
        revealContent();
        scheduleStoryRender();
      }

      function renderMetricSwitch(containerId, items, activeKey, onChange) {
        renderButtonOptions(document.getElementById(containerId), items, activeKey, onChange);
      }

      function renderEmptyState(target, title, message) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.append(textElement("strong", title), textElement("p", message));
        target.replaceChildren(empty);
      }

__CHAPTER_MODULES_SCRIPT__

      function initGeographySelector() {
        geoTrigger.addEventListener("click", () => {
          setGeoMenuOpen(!geoControl.classList.contains("is-open"));
        });
        document.addEventListener("click", (event) => {
          if (!geoControl.contains(event.target)) {
            setGeoMenuOpen(false);
          }
        });
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && geoControl.classList.contains("is-open")) {
            setGeoMenuOpen(false);
            geoTrigger.focus();
          }
        });
      }

      function mountScrollReveal() {
        if (REDUCED_MOTION) return;
        const revealItems = gsap.utils.toArray(".section-card, .snap-card")
          .filter((element) => !element.dataset.revealMounted);
        revealItems.forEach((element) => {
          element.dataset.revealMounted = "true";
          element.classList.add("is-scroll-revealing");
          gsap.from(element, {
            opacity: 0,
            y: 24,
            duration: 0.75,
            ease: "power2.out",
            clearProps: "opacity,transform",
            onComplete: () => element.classList.remove("is-scroll-revealing"),
            scrollTrigger: {
              trigger: element,
              // Le dernier chapitre reste accessible même avant le chargement de ses graphiques.
              start: () => Math.min(element.getBoundingClientRect().top + window.scrollY - window.innerHeight * .82,
                ScrollTrigger.maxScroll(window) - 1),
              once: true,
            },
          });
        });
      }

      function boot() {
        initGeographySelector();
        initStageMedia();
        renderHeaderActions();
        scheduleDeferredPreload();
        if (!REDUCED_MOTION) {
          new ResizeObserver(refreshChapterPositions).observe(story);
          onFontsReady(refreshChapterPositions);
        }
        map.hydrate({
          activateRegion: (code) => transitionToRegion(code, false),
          activateTerritory: (code) => code === "national" ? transitionToNational() : transitionToRegion(code, true),
          toggleGeography: () => geoTrigger.click(),
        });
      }

      boot();
    })();
  
