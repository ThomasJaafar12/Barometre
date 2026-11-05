
    (() => {
      if (!barometreDependenciesAvailable()) return;
__DETAILS_DOM_SCRIPT__
      const DATA = window.BAROMETRE_BOOT;
      const detail = DATA.detail;
      let deferredGzip = window.BAROMETRE_DEFERRED_GZIP;
      window.BAROMETRE_BOOT = null;
      window.BAROMETRE_DEFERRED_GZIP = null;
      const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const regionOrder = DATA.meta.experienceRegionCodes;
      const domCodes = new Set(DATA.meta.domRegionCodes);
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
      const MAINLAND_REGION_LABELS = new Map([
        ["11", { lines: ["Île-de-", "France"], dy: 8 }],
        ["24", { lines: ["Centre-Val", "de Loire"], dy: 4 }],
        ["27", { lines: ["Bourgogne-", "Franche-Comté"], dx: 28, dy: 8, fontSize: 11 }],
        ["28", { lines: ["Normandie"], dy: -6 }],
        ["32", { lines: ["Hauts-de-", "France"], dx: 24, dy: -18 }],
        ["44", { lines: ["Grand Est"], dx: 34, dy: -6 }],
        ["52", { lines: ["Pays de", "la Loire"], dx: -28, dy: -4 }],
        ["53", { lines: ["Bretagne"], dx: -18, dy: -8 }],
        ["75", { lines: ["Nouvelle-", "Aquitaine"], dx: -26, dy: 18 }],
        ["76", { lines: ["Occitanie"], dx: 18, dy: 28 }],
        ["84", { lines: ["Auvergne-", "Rhône-Alpes"], dx: 22, dy: 10, fontSize: 11.2 }],
        ["93", { lines: ["Provence-Alpes-", "Côte d'Azur"], dx: 42, dy: 20, fontSize: 10.8 }],
        ["94", { lines: ["Corse"], dy: -42 }],
      ]);
      const mapLayout = DATA.meta.mapLayout;
      const regionsByCode = new Map(DATA.regions.map((region) => [region.code, region]));
      const DISPLAY_POLYGON_AREA_RATIO = 0.01;
      const nationalVideo = DATA.assets.videos.placeholder;
      const stageShell = document.getElementById("stageShell");
      const stageVideo = document.getElementById("stageVideo");
      const mapStage = document.getElementById("mapStage");
      const story = document.getElementById("story");
      const publicationMeta = document.getElementById("publicationMeta");
      const geoControl = document.getElementById("geoControl");
      const geoTrigger = document.getElementById("geoTrigger");
      const geoCurrent = document.getElementById("geoCurrent");
      const geoMenu = document.getElementById("geoMenu");
      const tooltip = document.getElementById("tooltip");
      const tooltipLabel = document.getElementById("tooltipLabel");
      const tooltipValue = document.getElementById("tooltipValue");
      const landingMapShadowSvg = d3.select("#landingMapShadow");
      const landingMapSvg = d3.select("#landingMap");

      const state = {
        phase: "landing",
        selectedRegion: "11",
        mapHoverLocked: false,
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
      };

      const publicationLabel = DATA.meta.publicationDateLabel && DATA.meta.publicationIssueNumber
        ? `${DATA.meta.publicationDateLabel} – N°${DATA.meta.publicationIssueNumber}`
        : "24 juin 2026 – N°189";

      const chartRefs = {
        regionMap: {
          cameraGroup: null,
          cameraState: { scale: 1, x: 0, y: 0 },
          focusGroup: null,
          pathByCode: new Map(),
          labelByCode: new Map(),
          rootGroup: null,
          pathGeneratorByCode: new Map(),
        },
      };
      let storyRenderHandle = null;
      let storyRenderGeneration = 0;
      let scrollRefreshFrame = null;
      let scrollRefresh260 = null;
      let scrollRefresh900 = null;
      let scrollRefreshFontsBound = false;
      let geographySelectorView = null;
      const rankingHeightFrames = new WeakMap();
      const compositeMapViews = new WeakMap();
      let deferredDataPromise = null;
      let regionTransitionToken = 0;

      gsap.registerPlugin(ScrollTrigger);

      const COLOR_SYSTEM = DATA.colorSystem || { tokens: {}, regionThemes: [] };
      const colorTokens = COLOR_SYSTEM.tokens || {};

      function applyColorTokens() {
        Object.entries(colorTokens).forEach(([tokenName, value]) => {
          document.documentElement.style.setProperty(`--${tokenName}`, value);
        });
      }

      function paletteToken(name, fallback = null) {
        return colorTokens[name] != null ? colorTokens[name] : fallback;
      }

      function themeForRegion(regionCode) {
        const index = regionOrder.indexOf(regionCode);
        const theme = index >= 0 && Array.isArray(COLOR_SYSTEM.regionThemes)
          ? COLOR_SYSTEM.regionThemes[index]
          : null;
        const fallback = Array.isArray(COLOR_SYSTEM.regionThemes) && COLOR_SYSTEM.regionThemes.length
          ? COLOR_SYSTEM.regionThemes[0]
          : null;
        return theme || (regionCode && regionsByCode.get(regionCode) ? regionsByCode.get(regionCode).theme : null) || fallback || {
          accent: "#0EA5A8",
          accentDeep: "#0B1D3A",
          secondary: "#2B82F6",
          glow: "#0EA5A8",
        };
      }

__CHAPTER_REGISTRY_SCRIPT__

      function colorWithAlpha(color, alphaHex = "55") {
        return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
          ? `${color}${alphaHex}`
          : color;
      }

      function setTheme(regionCode) {
        const theme = themeForRegion(regionCode);
        document.documentElement.style.setProperty("--accent", theme.accent);
        document.documentElement.style.setProperty("--accent-deep", theme.accentDeep);
        document.documentElement.style.setProperty("--accent-secondary", theme.secondary);
        document.documentElement.style.setProperty("--accent-glow", colorWithAlpha(theme.glow));
      }

      const decimalNumberFormatters = new Map([0, 1, 2].map((digits) => [digits, new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: digits, maximumFractionDigits: digits,
      })]));
      const integerNumberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
      const monthDateFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" });

      function frNumber(value, digits = 1) {
        if (value == null || Number.isNaN(value)) return "—";
        let formatter = decimalNumberFormatters.get(digits);
        if (!formatter) {
          formatter = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
          decimalNumberFormatters.set(digits, formatter);
        }
        return formatter.format(Number(value));
      }

      function formatCount(value) {
        if (value == null || Number.isNaN(value)) return "—";
        const abs = Math.abs(value);
        if (abs >= 1e6) return `${frNumber(value / 1e6, 2)} M`;
        if (abs >= 1e3) return `${frNumber(value / 1e3, 1)} k`;
        return integerNumberFormatter.format(Number(value));
      }

      function formatCurrency(value) {
        if (value == null || Number.isNaN(value)) return "—";
        const abs = Math.abs(value);
        if (abs >= 1e9) return `${frNumber(value / 1e9, 1)} Md€`;
        if (abs >= 1e6) return `${frNumber(value / 1e6, 1)} M€`;
        return `${integerNumberFormatter.format(Number(value))} €`;
      }

      function formatPercent(value, digits = 1) {
        if (value == null || Number.isNaN(value)) return "—";
        return `${frNumber(value, digits)} %`;
      }

      function monthLabel(dateValue) {
        if (!dateValue) return "—";
        const date = new Date(`${dateValue}T00:00:00`);
        return Number.isNaN(date.valueOf()) ? date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : monthDateFormatter.format(date);
      }

      function quarterLabel(dateValue) {
        if (!dateValue) return "—";
        const date = new Date(`${dateValue}T00:00:00`);
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        return `T${quarter} ${date.getFullYear()}`;
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

      function mapRegionValues() {
        if (state.phase === "national") {
          return new Map(DATA.regions.map((region) => [region.code, primaryHeroValue(region)]));
        }
        return new Map();
      }

      function hydrateChapterSections() {
        chapterRegistry.forEach((chapter) => {
          const section = document.getElementById(chapter.id);
          if (!section) return;
          section.dataset.tone = chapter.tone;
          const kicker = section.querySelector("[data-chapter-kicker]");
          const title = section.querySelector("[data-chapter-title]");
          const meta = section.querySelector("[data-chapter-meta]");
          if (kicker) kicker.textContent = chapter.sectionKicker;
          if (title) {
            const highlight = document.createElement("span");
            const period = document.createElement("span");
            highlight.className = "chapter-title-highlight";
            highlight.textContent = chapter.sectionTitleHighlight;
            period.className = "chapter-title-period";
            period.textContent = ".";
            title.replaceChildren(
              document.createTextNode(chapter.sectionTitlePrefix),
              highlight,
              document.createTextNode(chapter.sectionTitleSuffix),
              period,
            );
          }
          if (meta) meta.textContent = chapter.sectionMeta;
        });
      }

      function refreshScrollTriggers() {
        ScrollTrigger.refresh();
      }

      function scheduleScrollTriggerRefresh() {
        if (REDUCED_MOTION || !window.ScrollTrigger) return;
        // Garder les jalons existants sans multiplier les tâches ni repousser leur échéance.
        if (scrollRefreshFrame == null) {
          scrollRefreshFrame = requestAnimationFrame(() => {
            refreshScrollTriggers();
            scrollRefreshFrame = requestAnimationFrame(() => {
              scrollRefreshFrame = null;
              refreshScrollTriggers();
            });
          });
        }
        if (scrollRefresh260 == null) {
          scrollRefresh260 = window.setTimeout(() => {
            scrollRefresh260 = null;
            refreshScrollTriggers();
          }, 260);
        }
        if (scrollRefresh900 == null) {
          scrollRefresh900 = window.setTimeout(() => {
            scrollRefresh900 = null;
            refreshScrollTriggers();
          }, 900);
        }
        if (!scrollRefreshFontsBound) {
          scrollRefreshFontsBound = true;
          onFontsReady(refreshScrollTriggers);
        }
      }

      function renderHeaderActions() {
        renderGeographySelector();
      }

      function selectedGeoKey() {
        return state.phase === "region" ? state.selectedRegion : "national";
      }

      const SELECTOR_CURRENT_REGION_CODES = ["84", "27", "53", "24", "94", "44", "32", "11", "28", "75", "76", "52", "93"];
      const SELECTOR_OVERSEAS_REGION_CODES = ["01", "03", "04", "02", "06"];
      const SELECTOR_HISTORICAL_TERRITORIES = [
        "Alsace",
        "Aquitaine",
        "Auvergne",
        "Basse-Normandie",
        "Bourgogne",
        "Centre",
        "Champagne-Ardenne",
        "Franche-Comté",
        "Haute-Normandie",
        "Languedoc-Roussillon",
        "Limousin",
        "Lorraine",
        "Midi-Pyrénées",
        "Nord-Pas-de-Calais",
        "Picardie",
        "Poitou-Charentes",
        "Rhône-Alpes",
        "Bretagne",
        "Corse",
        "Île-de-France",
        "Pays de la Loire",
        "Provence-Alpes-Côte d'Azur",
      ];

      function setGeoMenuOpen(isOpen) {
        geoControl.classList.toggle("is-open", isOpen);
        geoTrigger.setAttribute("aria-expanded", String(isOpen));
      }

      function renderGeographySelector() {
        const activeKey = selectedGeoKey();
        const activeLabel = activeKey === "national" ? "France entière" : currentRegion().name;
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
          transitionToNational(true);
        });
        nationalColumn.appendChild(nationalButton);
        optionButtons.set("national", nationalButton);

        const createList = (column) => {
          const list = document.createElement("ul");
          list.className = "geo-list-container";
          column.appendChild(list);
          return list;
        };

        const appendRegionRow = (list, region) => {
          if (!region) return;
          const item = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.className = `geo-selector-row${region.code === activeKey ? " is-active" : ""}`;
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", String(region.code === activeKey));
          const label = document.createElement("span");
          label.textContent = region.name;
          button.appendChild(label);
          button.appendChild(createActiveDot());
          button.addEventListener("click", () => {
            setGeoMenuOpen(false);
            transitionToRegion(region.code, true);
          });
          item.appendChild(button);
          list.appendChild(item);
          optionButtons.set(region.code, button);
        };

        const appendHistoricalRow = (list, labelText) => {
          const item = document.createElement("li");
          const row = document.createElement("div");
          row.className = "geo-selector-static-row";
          row.setAttribute("role", "option");
          row.setAttribute("aria-selected", "false");
          row.setAttribute("aria-disabled", "true");
          const label = document.createElement("span");
          label.textContent = labelText;
          row.appendChild(label);
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
        const eyebrow = document.getElementById("heroEyebrow");
        const title = document.getElementById("heroTitle");
        const lead = document.getElementById("heroLead");
        const heroDates = document.getElementById("heroDates");
        const heroKpis = document.getElementById("heroKpis");
        const national = state.phase === "national";
        const heroData = heroPayloadForScope();
        eyebrow.textContent = national ? "France entière" : currentRegion().group === "dom" ? "Outre-mer" : "Région";
        title.textContent = national ? "France entière" : currentRegion().name;
        const available = detail.indicators.filter((indicator) => heroData[indicator.key]?.value != null).length;
        const introduction = `${detail.label} · ${national ? "France entière" : currentRegion().name}.`;
        lead.textContent = available === 0
          ? `${introduction} Données indisponibles pour ce territoire.`
          : available < detail.indicators.length
          ? `${introduction} Certains indicateurs ne sont pas disponibles pour ce territoire.`
          : introduction;

        heroDates.replaceChildren();
        heroKpis.replaceChildren();
        detail.indicators.forEach((indicator) => {
          const point = heroData[indicator.key];
          const period = indicator.frequency === "quarter" ? quarterLabel(point?.date) : monthLabel(point?.date);
          if (point?.date) {
            heroDates.appendChild(textElement("span", `${indicator.dateLabel} · ${period}`, "hero-chip"));
          }
          const article = document.createElement("article");
          article.className = "kpi-card";
          article.dataset.indicator = indicator.key;
          const label = textElement("span", "", "label");
          label.appendChild(textElement("span", indicator.label, `text-highlight text-highlight--${indicator.key}`));
          const value = indicator.format === "currency" ? formatCurrency(point?.value) : formatCount(point?.value);
          article.append(label, textElement("strong", value),
            textElement("span", point?.value == null ? `Donnée indisponible${point?.date ? ` · ${period}` : ""}` : period, "meta"));
          heroKpis.appendChild(article);
        });
      }

      function primaryHeroValue(region) {
        return region.hero[detail.primaryIndicator]?.value ?? null;
      }

      function buildScale(domain, colors) {
        return d3.scaleLinear().domain(domain).range(colors).clamp(true);
      }

      function ringArea(ring) {
        const points = ring && ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
          ? ring.slice(0, -1)
          : ring;
        if (!points || points.length < 3) return 0;
        let area = 0;
        for (let index = 0; index < points.length; index += 1) {
          const [x1, y1] = points[index];
          const [x2, y2] = points[(index + 1) % points.length];
          area += (x1 * y2) - (x2 * y1);
        }
        return Math.abs(area / 2);
      }

      function polygonArea(polygon) {
        if (!polygon || !polygon.length) return 0;
        return ringArea(polygon[0]);
      }

      function pruneDisplayGeometry(geometry) {
        if (!geometry || geometry.type !== "MultiPolygon") return geometry;
        const rankedPolygons = geometry.coordinates
          .map((polygon) => ({ polygon, area: polygonArea(polygon) }))
          .filter((entry) => entry.area > 0)
          .sort((left, right) => right.area - left.area);
        if (rankedPolygons.length <= 1) return geometry;
        const minimumArea = rankedPolygons[0].area * DISPLAY_POLYGON_AREA_RATIO;
        const keptPolygons = rankedPolygons
          .filter((entry) => entry.area >= minimumArea)
          .map((entry) => entry.polygon);
        if (!keptPolygons.length) {
          return { type: "Polygon", coordinates: rankedPolygons[0].polygon };
        }
        return keptPolygons.length === 1
          ? { type: "Polygon", coordinates: keptPolygons[0] }
          : { type: "MultiPolygon", coordinates: keptPolygons };
      }

      const displayRegionFeatures = DATA.geography.regions.features.map((feature) => ({
        ...feature,
        geometry: pruneDisplayGeometry(feature.geometry),
      }));
      const displayRegionsGeojson = { ...DATA.geography.regions, features: displayRegionFeatures };
      const displayRegionFeatureByCode = new Map(displayRegionFeatures.map((feature) => [feature.properties.code, feature]));

      let tooltipMoveFrame = null;
      let tooltipClientX = 0;
      let tooltipClientY = 0;

      function applyTooltipPosition() {
        tooltipMoveFrame = null;
        tooltip.style.transform = `translate3d(${tooltipClientX}px, ${tooltipClientY}px, 0) translate(-50%, calc(-100% - 10px))`;
      }

      function moveTooltip(event) {
        tooltipClientX = event.clientX;
        tooltipClientY = event.clientY;
        if (tooltipMoveFrame != null) return;
        tooltipMoveFrame = requestAnimationFrame(applyTooltipPosition);
      }

      function showTooltip(event, label, value) {
        if (tooltipMoveFrame != null) {
          cancelAnimationFrame(tooltipMoveFrame);
          tooltipMoveFrame = null;
        }
        tooltipClientX = event.clientX;
        tooltipClientY = event.clientY;
        applyTooltipPosition();
        if (tooltipLabel.textContent !== label) tooltipLabel.textContent = label;
        if (tooltipValue.textContent !== value) tooltipValue.textContent = value;
        tooltip.classList.add("is-visible");
      }

      function hideTooltip() {
        if (tooltipMoveFrame != null) {
          cancelAnimationFrame(tooltipMoveFrame);
          tooltipMoveFrame = null;
        }
        tooltip.classList.remove("is-visible");
      }

      function drawCompositeMap(selection, featureCollection, config) {
        const viewKey = selection.node();
        const geometryKey = JSON.stringify([Boolean(config.showMainlandLabels), Boolean(config.isolateShadows), config.hoverClass || ""]);
        const previousView = !config.clickable ? compositeMapViews.get(viewKey) : null;
        if (previousView && previousView.featureCollection === featureCollection && previousView.geometryKey === geometryKey
          && previousView.refs.rootGroup.node().parentNode === viewKey) {
          previousView.update(config);
          return previousView.refs;
        }
        selection.selectAll("*").remove();
        if (config.shadowSelection) config.shadowSelection.selectAll("*").remove();
        const staticShadowRoot = config.isolateShadows && config.shadowSelection
          ? config.shadowSelection.append("g").attr("class", "map-root")
          : null;
        const staticShadowLayer = staticShadowRoot
          ? staticShadowRoot.append("g").attr("class", "map-static-shadow-layer").attr("aria-hidden", "true")
          : null;
        const root = selection.append("g").attr("class", "map-root");
        const cameraGroup = root.append("g").attr("class", "camera-group");
        const hoverShadowLayer = config.isolateShadows
          ? cameraGroup.append("g").attr("class", "map-hover-shadow-layer").attr("aria-hidden", "true")
          : null;
        const hoverEffectPaths = hoverShadowLayer
          ? [
              hoverShadowLayer.append("path").attr("class", "map-hover-effect-path map-hover-depth-far").attr("transform", "translate(0 12)").attr("display", "none"),
              hoverShadowLayer.append("path").attr("class", "map-hover-effect-path map-hover-depth-near").attr("transform", "translate(0 7)").attr("display", "none"),
              hoverShadowLayer.append("path").attr("class", "map-hover-effect-path map-hover-glow-outer").attr("display", "none"),
              hoverShadowLayer.append("path").attr("class", "map-hover-effect-path map-hover-glow-inner").attr("display", "none"),
            ]
          : [];
        const featureLayer = cameraGroup.append("g").attr("class", "feature-layer");
        const focusGroup = cameraGroup.append("g").attr("class", "focus-layer");
        const features = featureCollection.features;
        const mainlandFeatures = features.filter((feature) => !domCodes.has(config.regionResolver(feature)));
        const projection = d3.geoMercator().fitExtent(
          [[mapLayout.mainlandExtent[0], mapLayout.mainlandExtent[1]], [mapLayout.mainlandExtent[2], mapLayout.mainlandExtent[3]]],
          { type: "FeatureCollection", features: mainlandFeatures },
        );
        const path = d3.geoPath(projection);
        const pathByCode = new Map();
        const labelByCode = new Map();
        const pathGeneratorByCode = new Map();
        let hoveredElement = null;
        let activeTooltipDatum = null;
        let activeTooltipEvent = null;
        const clearPathTooltip = () => {
          activeTooltipDatum = null;
          activeTooltipEvent = null;
          hideTooltip();
        };
        const clearHoverShadow = () => {
          hoverEffectPaths.forEach((effectPath) => effectPath.attr("display", "none").attr("d", null));
        };
        const clearPathHover = () => {
          if (!config.hoverClass) return;
          if (hoveredElement) hoveredElement.classed(config.hoverClass, false);
          hoveredElement = null;
          clearHoverShadow();
        };
        const canUseHoverEffect = () => !config.canHover || config.canHover();
        const canShowPathTooltip = () => !config.canShowTooltip || config.canShowTooltip();
        const setPathHover = (element, datum, pathGenerator, enabled) => {
          if (!config.hoverClass) return;
          if (enabled && !canUseHoverEffect()) {
            clearPathHover();
            return;
          }
          if (enabled) {
            if (hoveredElement !== element) clearPathHover();
            hoveredElement = element;
            element.classed(config.hoverClass, true);
            if (hoverEffectPaths.length) {
              const hoverEffect = config.hoverEffectResolver ? config.hoverEffectResolver(datum) : null;
              if (hoverEffect) {
                const pathData = pathGenerator(datum);
                hoverEffectPaths.forEach((effectPath) => {
                  effectPath
                    .attr("d", pathData)
                    .style("--region-hover-shadow", hoverEffect.shadow)
                    .attr("display", null);
                });
              } else {
                clearHoverShadow();
              }
            }
            return;
          }
          if (hoveredElement === element) clearPathHover();
        };
        const bindPathInteractions = (element, key, pathGenerator) => {
          element
            .on("mouseenter", (event, datum) => {
              if (!canUseHoverEffect()) {
                clearPathHover();
              } else {
                setPathHover(element, datum, pathGenerator, true);
              }
              if (!canShowPathTooltip()) {
                clearPathTooltip();
                return;
              }
              activeTooltipDatum = datum;
              activeTooltipEvent = event;
              const tooltipText = config.tooltipResolver(datum);
              showTooltip(event, tooltipText.label, tooltipText.value);
            })
            .on("mousemove", (event, datum) => {
              if (!canUseHoverEffect()) clearPathHover();
              if (!canShowPathTooltip()) {
                clearPathTooltip();
                return;
              }
              activeTooltipDatum = datum;
              activeTooltipEvent = event;
              moveTooltip(event);
            })
            .on("mouseleave", (event, datum) => {
              setPathHover(element, datum, pathGenerator, false);
              clearPathTooltip();
            });
          if (config.clickable) {
            element.on("click", () => {
              clearPathHover();
              clearPathTooltip();
              config.onClick(key);
            });
          }
        };

        if (staticShadowLayer) {
          const mainlandShadowGroup = staticShadowLayer.append("g").attr("class", "map-static-mainland-shadow");
          mainlandFeatures
            .filter((feature) => !config.shadowFeatureFilter || config.shadowFeatureFilter(feature))
            .forEach((feature) => {
              mainlandShadowGroup.append("path").datum(feature).attr("class", "map-static-shadow-shape").attr("d", path);
            });
        }

        const mainlandGroup = featureLayer.append("g").attr("class", "mainland-layer");
        const labelLayer = config.showMainlandLabels ? featureLayer.append("g").attr("class", "mainland-label-layer") : null;
        mainlandFeatures.forEach((feature) => {
          const key = config.keyResolver(feature);
          const element = mainlandGroup.append("path")
            .datum(feature)
            .attr("class", config.className(feature))
            .attr("d", path)
            .attr("fill", config.fillResolver(feature))
            .attr("data-code", key);
          bindPathInteractions(element, key, path);
          pathByCode.set(key, element);
          pathGeneratorByCode.set(key, path);
        });
        if (labelLayer) {
          mainlandFeatures.forEach((feature) => {
            const code = config.regionResolver(feature);
            const region = regionsByCode.get(code);
            if (!region) return;
            const layout = MAINLAND_REGION_LABELS.get(code) || { lines: [region.name] };
            const [baseX, baseY] = path.centroid(feature);
            if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) return;
            const x = baseX + (layout.dx || 0);
            const lineHeight = layout.lineHeight || 14;
            const startY = baseY + (layout.dy || 0) - ((layout.lines.length - 1) * lineHeight) / 2;
            const text = labelLayer.append("text")
              .attr("class", "map-region-label")
              .attr("x", x)
              .attr("y", startY)
              .attr("data-code", code);
            if (layout.fontSize) {
              text.style("font-size", `${layout.fontSize}px`);
            }
            layout.lines.forEach((line, index) => {
              text.append("tspan")
                .attr("x", x)
                .attr("y", startY + index * lineHeight)
                .text(line);
            });
            labelByCode.set(code, text);
          });
        }

        Object.entries(mapLayout.domInsets).forEach(([regionCode, inset]) => {
          const insetFeatures = features.filter((feature) => config.regionResolver(feature) === regionCode);
          const insetProjection = d3.geoMercator().fitExtent(
            [[inset.x + 18, inset.y + 34], [inset.x + inset.width - 18, inset.y + inset.height - 18]],
            { type: "FeatureCollection", features: insetFeatures },
          );
          const insetPath = d3.geoPath(insetProjection);
          if (staticShadowLayer) {
            const insetShadowGroup = staticShadowLayer.append("g").attr("class", `map-static-inset-shadow inset-${regionCode}`);
            insetShadowGroup.append("rect")
              .attr("class", "map-static-inset-card-shadow")
              .attr("x", inset.x)
              .attr("y", inset.y)
              .attr("width", inset.width)
              .attr("height", inset.height)
              .attr("rx", 24);
            const insetPathShadowGroup = insetShadowGroup.append("g").attr("class", "map-static-inset-path-shadow");
            insetFeatures
              .filter((feature) => !config.shadowFeatureFilter || config.shadowFeatureFilter(feature))
              .forEach((feature) => {
                insetPathShadowGroup.append("path").datum(feature).attr("class", "map-static-shadow-shape").attr("d", insetPath);
              });
          }
          const group = featureLayer.append("g").attr("class", `inset inset-${regionCode}`);
          group.append("rect").attr("class", "inset-card").attr("x", inset.x).attr("y", inset.y).attr("width", inset.width).attr("height", inset.height).attr("rx", 24);
          const pathGroup = group.append("g").attr("class", "inset-path-layer");
          group.append("text").attr("class", "inset-label").attr("x", inset.x + 16).attr("y", inset.y + 22).text(regionsByCode.get(regionCode).name);
          insetFeatures.forEach((feature) => {
            const key = config.keyResolver(feature);
            const element = pathGroup.append("path")
              .datum(feature)
              .attr("class", config.className(feature))
              .attr("d", insetPath)
              .attr("fill", config.fillResolver(feature))
              .attr("data-code", key);
            bindPathInteractions(element, key, insetPath);
            pathByCode.set(key, element);
            pathGeneratorByCode.set(key, insetPath);
          });
        });

        const refs = {
          rootGroup: root,
          cameraGroup,
          cameraState: { scale: 1, x: 0, y: 0 },
          staticShadowLayer,
          hoverEffectPaths,
          featureLayer,
          focusGroup,
          pathByCode,
          labelByCode,
          pathGeneratorByCode,
        };
        // La carte interactive d'accueil conserve sa reconstruction et ses animations.
        // Ce registre ne sert qu'aux vues départementales : les événements lisent le contexte courant.
        if (!config.clickable) {
          compositeMapViews.set(viewKey, { featureCollection, geometryKey, refs, update(nextConfig) {
            clearPathHover();
            config = nextConfig;
            pathByCode.forEach((element) => {
              const feature = element.datum();
              element.attr("class", config.className(feature)).attr("fill", config.fillResolver(feature));
            });
            if (activeTooltipDatum && activeTooltipEvent && tooltip.classList.contains("is-visible")) {
              const activePath = pathByCode.get(config.keyResolver(activeTooltipDatum));
              if (activePath?.node().isConnected && activePath.node().matches(":hover") && canShowPathTooltip()) {
                const tooltipText = config.tooltipResolver(activeTooltipDatum);
                showTooltip(activeTooltipEvent, tooltipText.label, tooltipText.value);
              } else {
                clearPathTooltip();
              }
            }
          } });
        }
        return refs;
      }

      function renderLandingMap() {
        const regionValues = mapRegionValues();
        const numericValues = [...regionValues.values()].filter((value) => value != null);
        const colorScale = numericValues.length
          ? buildScale(d3.extent(numericValues), [paletteToken("map-national-low", "rgba(255,255,255,0.08)"), paletteToken("map-national-high", "rgba(120,236,203,0.9)")])
          : () => paletteToken("map-national-low", "rgba(255,255,255,0.08)");
        chartRefs.regionMap = drawCompositeMap(landingMapSvg, displayRegionsGeojson, {
          clickable: true,
          showMainlandLabels: true,
          hoverClass: "is-hovered",
          isolateShadows: state.phase === "landing",
          shadowSelection: landingMapShadowSvg,
          shadowFeatureFilter: (feature) => regionsByCode.get(feature.properties.code).hasData,
          hoverEffectResolver: (feature) => {
            const region = regionsByCode.get(feature.properties.code);
            if (!region.hasData) return null;
            const theme = themeForRegion(feature.properties.code);
            return { shadow: colorWithAlpha(theme.glow) };
          },
          canHover: () => state.phase === "landing" && !state.mapHoverLocked,
          canShowTooltip: () => !state.mapHoverLocked,
          keyResolver: (feature) => feature.properties.code,
          regionResolver: (feature) => feature.properties.code,
          className: (feature) => `path-region${regionsByCode.get(feature.properties.code).hasData ? "" : " is-unavailable"}`,
          fillResolver: (feature) => {
            if (state.phase === "national") {
              const value = regionValues.get(feature.properties.code);
              return value != null ? colorScale(value) : paletteToken("map-idle", "rgba(255,255,255,0.06)");
            }
            const theme = themeForRegion(feature.properties.code);
            return state.phase !== "landing" && state.selectedRegion === feature.properties.code ? theme.accent : paletteToken("map-idle", "rgba(255,255,255,0.06)");
          },
          tooltipResolver: (feature) => {
            const region = regionsByCode.get(feature.properties.code);
            if (state.phase === "national" && primaryHeroValue(region) != null) {
              return { label: region.name, value: formatCount(primaryHeroValue(region)) };
            }
            if (!region.hasData) return { label: region.name, value: "Données indisponibles" };
            return { label: region.name, value: "Entrer" };
          },
          onClick: (code) => transitionToRegion(code, false),
        });
        chartRefs.regionMap.pathByCode.forEach((element, code) => {
          const theme = themeForRegion(code);
          element
            .style("--region-hover-fill", theme.accent)
            .style("--region-hover-shadow", colorWithAlpha(theme.glow));
        });
        highlightSelectedRegion();
      }

      function highlightSelectedRegion() {
        chartRefs.regionMap.pathByCode.forEach((element, code) => {
          const isSelected = state.phase === "region" && code === state.selectedRegion;
          if (state.phase !== "landing") {
            element.classed("is-hovered", false);
          }
          element.classed("is-selected", isSelected);
          if (state.phase === "region") {
            const theme = themeForRegion(code);
            element.attr("fill", isSelected ? theme.accent : paletteToken("map-idle", "rgba(255,255,255,0.06)"));
          }
          if (isSelected) {
            element.raise();
          }
        });
        chartRefs.regionMap.labelByCode.forEach((element, code) => {
          element.attr("display", state.phase === "region" ? "none" : null);
        });
      }

      function hideMapLabels() {
        chartRefs.regionMap.labelByCode.forEach((element) => {
          element.attr("display", "none");
        });
      }

      function updateVideo(regionCode) {
        const src = regionCode === "national"
          ? nationalVideo
          : (regionsByCode.get(regionCode) || {}).video || nationalVideo;
        if (stageVideo.dataset.src === src) {
          stageVideo.play().catch(() => {});
          return;
        }
        stageVideo.dataset.src = src;
        stageVideo.src = src;
        stageVideo.load();
        stageVideo.play().catch(() => {});
      }

      function clearFocusOverlay() {
        if (chartRefs.regionMap.focusGroup) {
          chartRefs.regionMap.focusGroup.selectAll("*").remove();
        }
      }

      function setMapCameraMoving(isMoving) {
        stageShell.classList.toggle("is-camera-moving", isMoving);
      }

      function applyCameraTransform() {
        const { cameraGroup, cameraState } = chartRefs.regionMap;
        if (!cameraGroup || !cameraState) return;
        cameraGroup.attr("transform", `translate(${cameraState.x},${cameraState.y}) scale(${cameraState.scale})`);
      }

      function getRegionCameraTarget(regionCode, options = {}) {
        const selection = chartRefs.regionMap.pathByCode.get(regionCode);
        if (!selection) return null;
        const node = selection.node();
        const bbox = node.getBBox();
        const scaleMultiplier = options.scaleMultiplier ?? 1;
        const minScale = options.minScale ?? 1.8;
        const maxScale = options.maxScale ?? 4.2;
        const targetScale = Math.max(minScale, Math.min(maxScale, (620 / Math.max(bbox.width, bbox.height)) * scaleMultiplier));
        return {
          scale: targetScale,
          x: mapLayout.width / 2 - (bbox.x + bbox.width / 2) * targetScale,
          y: mapLayout.height / 2 - (bbox.y + bbox.height / 2) * targetScale,
        };
      }

      function animateCameraToTarget(target, options = {}) {
        if (!target) return Promise.resolve();
        const transform = chartRefs.regionMap.cameraState;
        if (REDUCED_MOTION) {
          transform.scale = target.scale;
          transform.x = target.x;
          transform.y = target.y;
          applyCameraTransform();
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          gsap.to(transform, {
            scale: target.scale,
            x: target.x,
            y: target.y,
            duration: options.duration ?? 1.2,
            ease: options.ease ?? "power2.inOut",
            onUpdate: applyCameraTransform,
            onComplete: resolve,
          });
        });
      }

      function drawDepartmentFocusPaths(regionCode) {
        const focusGroup = chartRefs.regionMap.focusGroup;
        const generator = chartRefs.regionMap.pathGeneratorByCode.get(regionCode);
        if (!focusGroup || !generator || !DATA.geography.departments) return [];
        clearFocusOverlay();
        return (geographyIndex(DATA.geography).departmentsByRegion.get(regionCode) || [])
          .map((feature) => focusGroup.append("path")
            .datum(feature)
            .attr("class", "focus-department-path")
            .attr("d", generator(feature))
            .attr("stroke-dasharray", 1)
            .attr("stroke-dashoffset", 1)
            .attr("pathLength", 1)
            .attr("opacity", 0));
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
        return group;
      }

      function animateDepartmentFocus(regionCode) {
        const paths = drawDepartmentFocusPaths(regionCode);
        const cityMarker = drawRegionCityMarker(regionCode);
        if (!paths.length) return Promise.resolve();
        if (REDUCED_MOTION) {
          paths.forEach((path) => path.attr("stroke-dashoffset", 0).attr("opacity", 1));
          if (cityMarker) cityMarker.attr("opacity", 1);
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          const timeline = gsap.timeline({ onComplete: resolve });
          const totalStagger = 0.7;
          const eachDelay = paths.length > 1 ? totalStagger / (paths.length - 1) : 0;
          paths.forEach((path, index) => {
            timeline.to(path.node(), {
              attr: { "stroke-dashoffset": 0 },
              opacity: 1,
              duration: 0.62,
              ease: "power2.out",
            }, index * eachDelay);
          });
          if (cityMarker) {
            timeline.to(cityMarker.node(), {
              opacity: 1,
              duration: 0.38,
              ease: "power2.out",
            }, Math.min(totalStagger * 0.45, 0.42));
          }
        });
      }

      async function parseDeferredData() {
        const binary = atob(deferredGzip);
        deferredGzip = null;
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        return JSON.parse(await new Response(stream).text());
      }

      function ensureDeferredData() {
        if (DATA.modules && DATA.geography.departments) {
          return Promise.resolve(DATA);
        }
        deferredDataPromise ??= parseDeferredData().then((deferred) => {
          DATA.geography = { ...DATA.geography, ...deferred.geography };
          DATA.modules = deferred.modules;
          if (DATA.modules.sector) {
            state.sectorEffectifsSeriesKey ??= DATA.modules.sector.regional.national.defaultSeriesKey;
            state.sectorPayrollSeriesKey ??= DATA.modules.sector.regional.national.defaultSeriesKey;
            state.sectorDepartmentSectorKey ??= DATA.modules.sector.departmental.defaultSectorKey;
          }
          if (DATA.modules.auto) state.autoSector ??= DATA.modules.auto.defaultSector;
          return DATA;
        });
        return deferredDataPromise;
      }

      function scheduleDeferredPreload() {
        const preload = () => {
          ensureDeferredData().catch((error) => console.error("Deferred payload error", error));
        };
        const schedule = () => {
          if ("requestIdleCallback" in window) {
            window.requestIdleCallback(preload, { timeout: 1500 });
          } else {
            window.setTimeout(preload, 250);
          }
        };
        if (document.readyState === "complete") {
          schedule();
        } else {
          window.addEventListener("load", schedule, { once: true });
        }
      }

      function resetCamera() {
        chartRefs.regionMap.cameraState.scale = 1;
        chartRefs.regionMap.cameraState.x = 0;
        chartRefs.regionMap.cameraState.y = 0;
        applyCameraTransform();
      }

      function setMapStageMode(mode) {
        mapStage.classList.remove("is-muted", "is-hidden");
        if (mode === "landing") {
          gsap.set(mapStage, { opacity: 1 });
          return;
        }
        if (mode === "national") {
          gsap.set(mapStage, { opacity: 1 });
          return;
        }
        mapStage.classList.add("is-hidden");
        gsap.set(mapStage, { opacity: 0 });
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
              renderStoryModules();
              hydrateChapterSections();
              scheduleScrollTriggerRefresh();
            })
            .catch((error) => console.error("Deferred payload error", error));
        });
      }

      function revealContent() {
        story.classList.add("is-visible");
        // Set initial animation styles before the browser can paint the story.
        mountScrollReveal();
        scheduleScrollTriggerRefresh();
      }

      function applyPhase(phase) {
        state.phase = phase;
        stageShell.dataset.phase = phase;
        if (phase === "landing") {
          state.mapHoverLocked = false;
          storyRenderGeneration += 1;
          if (storyRenderHandle != null) cancelAnimationFrame(storyRenderHandle);
          storyRenderHandle = null;
        }
        stageShell.classList.toggle("is-map-hover-locked", state.mapHoverLocked);
        renderHeaderActions();
        if (phase === "landing") {
          story.classList.remove("is-visible");
          setMapStageMode("landing");
        } else if (phase === "national") {
          setMapStageMode("national");
        }
      }

      function animateFranceRipple() {
        const transitionToken = regionTransitionToken;
        const values = DATA.regions.map((region) => primaryHeroValue(region)).filter((value) => value != null);
        const scale = buildScale(
          d3.extent(values),
          [paletteToken("map-national-low", "rgba(255,255,255,0.08)"), paletteToken("map-national-high", "rgba(120,236,203,0.92)")],
        );
        const center = { x: mapLayout.width / 2, y: mapLayout.height / 2 };
        const ring = chartRefs.regionMap.focusGroup.append("circle").attr("class", "ripple-ring").attr("cx", center.x).attr("cy", center.y).attr("r", 30).attr("opacity", 0.7);
        const timeline = gsap.timeline();
        timeline.to(ring.node(), { attr: { r: 760 }, opacity: 0, duration: REDUCED_MOTION ? 0.01 : 1.8, ease: "power2.out" });
        chartRefs.regionMap.pathByCode.forEach((selection, code) => {
          const region = regionsByCode.get(code);
          const value = primaryHeroValue(region);
          const box = selection.node().getBBox();
          const dx = center.x - (box.x + box.width / 2);
          const dy = center.y - (box.y + box.height / 2);
          const delay = Math.sqrt(dx * dx + dy * dy) / 560;
          timeline.to(selection.node(), { fill: value != null ? scale(value) : paletteToken("map-empty", "rgba(255,255,255,0.06)"), duration: REDUCED_MOTION ? 0.01 : 0.9, ease: "power2.out" }, delay);
        });
        timeline.add(() => {
          if (transitionToken === regionTransitionToken) clearFocusOverlay();
        });
        return timeline;
      }

      function transitionToLanding() {
        regionTransitionToken += 1;
        setMapCameraMoving(false);
        clearFocusOverlay();
        gsap.killTweensOf(chartRefs.regionMap.cameraState);
        gsap.killTweensOf(mapStage);
        stageVideo.pause();
        resetCamera();
        setTheme(null);
        applyPhase("landing");
        renderLandingMap();
        window.scrollTo({
          top: 0,
          behavior: REDUCED_MOTION ? "auto" : "smooth",
        });
      }

      function transitionToNational(fromRail) {
        const transitionToken = ++regionTransitionToken;
        setMapCameraMoving(false);
        clearFocusOverlay();
        gsap.killTweensOf(chartRefs.regionMap.cameraState);
        gsap.killTweensOf(mapStage);
        resetCamera();
        applyPhase("national");
        setTheme(state.selectedRegion);
        updateVideo("national");
        mapStage.classList.remove("is-hidden", "is-muted");
        gsap.set(mapStage, { opacity: 1 });
        renderLandingMap();
        renderHero();
        if (REDUCED_MOTION || fromRail) {
          try {
            animateFranceRipple();
          } catch (error) {
            console.error("National ripple animation error", error);
          }
          revealContent();
          scheduleStoryRender();
          setMapStageMode("national");
          return;
        }
        let revealDone = false;
        const finishReveal = () => {
          if (revealDone || transitionToken !== regionTransitionToken) return;
          revealDone = true;
          revealContent();
          scheduleStoryRender();
          setMapStageMode("national");
        };
        const revealFallback = window.setTimeout(finishReveal, 1800);
        const timeline = gsap.timeline();
        timeline.add(() => {
          if (transitionToken !== regionTransitionToken) return;
          try {
            animateFranceRipple();
          } catch (error) {
            console.error("National ripple animation error", error);
            window.clearTimeout(revealFallback);
            finishReveal();
          }
        }, 0.05);
        timeline.call(() => {
          window.clearTimeout(revealFallback);
          finishReveal();
        }, null, 1.45);
      }

      async function transitionToRegion(regionCode, fromRail) {
        const transitionToken = ++regionTransitionToken;
        setMapCameraMoving(false);
        state.mapHoverLocked = true;
        stageShell.classList.add("is-map-hover-locked");
        chartRefs.regionMap.pathByCode.forEach((element) => element.classed("is-hovered", false));
        hideTooltip();
        state.selectedRegion = regionCode;
        setTheme(regionCode);
        hideMapLabels();
        updateVideo(regionCode);
        clearFocusOverlay();
        gsap.killTweensOf(chartRefs.regionMap.cameraState);
        gsap.killTweensOf(mapStage);

        if (REDUCED_MOTION || fromRail || state.phase !== "landing") {
          applyPhase("region");
          renderHero();
          setMapStageMode("region");
          scheduleStoryRender();
          revealContent();
          return;
        }

        renderHero();
        mapStage.classList.remove("is-hidden", "is-muted");
        gsap.set(mapStage, { opacity: 1 });
        resetCamera();

        setMapCameraMoving(true);
        await animateCameraToTarget(
          getRegionCameraTarget(regionCode),
          { duration: 1.2, ease: "power2.inOut" },
        );
        if (transitionToken !== regionTransitionToken) return;

        await ensureDeferredData().catch((error) => {
          console.error("Deferred payload error", error);
        });
        if (transitionToken !== regionTransitionToken) return;

        await animateDepartmentFocus(regionCode);
        if (transitionToken !== regionTransitionToken) return;

        await animateCameraToTarget(
          getRegionCameraTarget(regionCode, { scaleMultiplier: 1.28, maxScale: 5.1 }),
          { duration: 1.22, ease: "power2.out" },
        );
        if (transitionToken !== regionTransitionToken) return;

        setMapCameraMoving(false);
        clearFocusOverlay();
        applyPhase("region");
        renderHero();
        await new Promise((resolve) => {
          gsap.to(mapStage, {
            opacity: 0,
            duration: 0.32,
            ease: "power2.inOut",
            onComplete: resolve,
          });
        });
        if (transitionToken !== regionTransitionToken) return;

        setMapStageMode("region");
        revealContent();
        scheduleStoryRender();
        clearFocusOverlay();
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

      function syncDepartmentRankingHeight(gridElement) {
        if (!gridElement || rankingHeightFrames.has(gridElement)) return;
        rankingHeightFrames.set(gridElement, requestAnimationFrame(() => {
          rankingHeightFrames.delete(gridElement);
          const isStacked = window.matchMedia("(max-width: 980px)").matches;
          const mapPanel = gridElement.querySelector(".map-card");
          const rankingPanel = gridElement.querySelector(".department-ranking-panel");
          if (!mapPanel || !rankingPanel || isStacked) {
            gridElement.style.removeProperty("--department-map-height");
            return;
          }
          const mapHeight = mapPanel.offsetHeight;
          if (mapHeight > 0) {
            gridElement.style.setProperty("--department-map-height", `${mapHeight}px`);
          }
        }));
      }
__CHAPTER_MODULES_SCRIPT__
      function renderStoryModules() {
        chapterRegistry.forEach((chapter) => chapter.render());
      }

      function initGeographySelector() {
        publicationMeta.textContent = publicationLabel;
        geoTrigger.addEventListener("click", () => {
          setGeoMenuOpen(!geoControl.classList.contains("is-open"));
        });
        document.addEventListener("click", (event) => {
          if (!geoControl.contains(event.target)) {
            setGeoMenuOpen(false);
          }
        });
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
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
              start: "top 82%",
              once: true,
            },
          });
        });
      }

      function boot() {
        applyColorTokens();
        setTheme(null);
        hydrateChapterSections();
        window.addEventListener("resize", scheduleScrollTriggerRefresh, { passive: true });
        initGeographySelector();
        renderLandingMap();
        renderHero();
        renderHeaderActions();
        stageVideo.muted = true;
        setMapStageMode("landing");
        scheduleDeferredPreload();
        if (document.readyState === "complete") {
          scheduleScrollTriggerRefresh();
        } else {
          window.addEventListener("load", scheduleScrollTriggerRefresh, { once: true });
        }
      }

      boot();
    })();
  
