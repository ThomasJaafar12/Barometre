    (() => {
      const DATA = window.BAROMETRE_BOOT;
      const { d3 } = window;
      if (!DATA || !d3) return;
      const sharedGeography = __REGION_GEOJSON__;
      if (sharedGeography) DATA.geography.regions = sharedGeography;
      const { detail } = DATA;
      const regionOrder = DATA.meta.experienceRegionCodes;
      const domCodes = new Set(DATA.meta.domRegionCodes);
      const mapLayout = DATA.meta.mapLayout;
      const regionsByCode = new Map(DATA.regions.map((region) => [region.code, region]));
      const DISPLAY_POLYGON_AREA_RATIO = 0.01;

      const MAINLAND_REGION_LABELS = new Map([
        ["11", { lines: ["Île-de-", "France"], dy: 3 }],
        ["24", { lines: ["Centre-Val", "de Loire"], dy: 2 }],
        ["27", { lines: ["Bourgogne-", "Franche-Comté"], dx: 9, dy: 5 }],
        ["28", { lines: ["Normandie"], dx: 1, dy: -5 }],
        ["32", { lines: ["Hauts-de-", "France"], dx: 6, dy: -5 }],
        ["44", { lines: ["Grand Est"], dx: 12, dy: -4 }],
        ["52", { lines: ["Pays de", "la Loire"], dx: -9, dy: -2 }],
        ["53", { lines: ["Bretagne"], dx: -8, dy: -6 }],
        ["75", { lines: ["Nouvelle-", "Aquitaine"], dx: -12, dy: 7 }],
        ["76", { lines: ["Occitanie"], dx: 6, dy: 15 }],
        ["84", { lines: ["Auvergne-", "Rhône-Alpes"], dx: 10, dy: 2 }],
        ["93", { lines: ["Provence-Alpes-", "Côte d'Azur"], dx: 16, dy: 7 }],
        ["94", { lines: ["Corse"], dx: -1, dy: -51 }],
      ]);

      const landingMapSvg = d3.select("#landingMap");
      const tooltip = document.getElementById("tooltip");
      const tooltipLabel = document.getElementById("tooltipLabel");
      const tooltipValue = document.getElementById("tooltipValue");
      const geoTrigger = document.getElementById("geoTrigger");
      const state = {
        phase: "landing",
        selectedRegion: "11",
        selectedHistorical: null,
        mapHoverLocked: false,
      };
      const chartRefs = {};
      const compositeMapViews = new WeakMap();
      let pendingIntent = window.BAROMETRE_TAKE_GEOGRAPHY_TOGGLE?.() ? { type: "geography" } : null;
      delete window.BAROMETRE_TAKE_GEOGRAPHY_TOGGLE;
      let onRegion = null;
      let onTerritory = null;

      function queueGeographyToggle() {
        pendingIntent = pendingIntent?.type === "geography" ? null : { type: "geography" };
      }

      function selectRegion(code) {
        if (onRegion) {
          onRegion(code);
        } else {
          pendingIntent = { type: "region", code };
        }
      }

      function selectTerritory(code) {
        if (onTerritory) onTerritory(code);
        else pendingIntent = { type: "territory", code };
      }

      function hydrate({ activateRegion, activateTerritory, toggleGeography }) {
        onRegion = activateRegion;
        onTerritory = activateTerritory;
        geoTrigger.removeEventListener("click", queueGeographyToggle);
        const intent = pendingIntent;
        pendingIntent = null;
        if (intent?.type === "region") activateRegion(intent.code);
        if (intent?.type === "territory") activateTerritory(intent.code);
        if (intent?.type === "geography") toggleGeography();
      }

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

      let tooltipClientX = 0;
      let tooltipClientY = 0;
      let tooltipFitsViewport = false;
      let tooltipWidth = 0;
      let tooltipHeight = 0;

      function applyTooltipPosition() {
        if (tooltipFitsViewport) {
          const right = document.documentElement.clientWidth - tooltipWidth - 8;
          const bottom = window.innerHeight - tooltipHeight - 8;
          const left = Math.max(8, Math.min(tooltipClientX - tooltipWidth / 2, right));
          const above = tooltipClientY - tooltipHeight - 10;
          const top = Math.max(8, Math.min(above >= 8 ? above : tooltipClientY + 10, bottom));
          tooltip.style.transform = `translate3d(${left}px, ${top}px, 0)`;
          return;
        }
        tooltip.style.transform = `translate3d(${tooltipClientX}px, ${tooltipClientY}px, 0) translate(-50%, calc(-100% - 10px))`;
      }

      function showTooltip(event, label, value, fitViewport = false) {
        tooltipClientX = event.clientX;
        tooltipClientY = event.clientY;
        const labelChanged = tooltipLabel.textContent !== label;
        const valueChanged = tooltipValue.textContent !== value;
        if (labelChanged) tooltipLabel.textContent = label;
        if (valueChanged) tooltipValue.textContent = value;
        if (fitViewport && (!tooltipFitsViewport || labelChanged || valueChanged)) {
          tooltipWidth = tooltip.offsetWidth;
          tooltipHeight = tooltip.offsetHeight;
        }
        tooltipFitsViewport = fitViewport;
        applyTooltipPosition();
        tooltip.classList.add("is-visible");
      }

      function hideTooltip() {
        tooltip.classList.remove("is-visible");
      }

__COCKPIT_READOUT__

__COCKPIT_MAP__

      function drawCompositeMap(selection, featureCollection, config) {
        const viewKey = selection.node();
        const previousView = compositeMapViews.get(viewKey);
        if (previousView && previousView.featureCollection === featureCollection
          && previousView.refs.rootGroup.node().parentNode === viewKey) {
          previousView.update(config);
          return previousView.refs;
        }
        selection.selectChildren(":not(title):not(desc)").remove();
        const root = selection.append("g").attr("class", "map-root");
        const cameraGroup = root.append("g").attr("class", "camera-group");
        const featureLayer = cameraGroup.append("g").attr("class", "feature-layer");
        const focusGroup = cameraGroup.append("g").attr("class", "focus-layer");
        const features = featureCollection.features;
        const mainlandFeatures = features.filter((feature) => !domCodes.has(config.regionResolver(feature)));
        const projection = d3.geoMercator().fitExtent(
          [[mapLayout.mainlandExtent[0], mapLayout.mainlandExtent[1]], [mapLayout.mainlandExtent[2], mapLayout.mainlandExtent[3]]],
          { type: "FeatureCollection", features: mainlandFeatures },
        );
        const path = d3.geoPath(projection).digits(config.cockpit ? 1 : 3);
        const pathByCode = new Map();
        const labelByCode = new Map();
        const pathGeneratorByCode = new Map();

        const mainlandGroup = featureLayer.append("g").attr("class", "mainland-layer");
        mainlandFeatures.forEach((feature) => {
          const key = config.keyResolver(feature);
          const element = mainlandGroup.append("path")
            .datum(feature)
            .attr("class", config.className(feature))
            .attr("d", path)
            .attr("fill", config.fillResolver(feature))
            .attr("data-code", key);
          pathByCode.set(key, element);
          pathGeneratorByCode.set(key, path);
        });
        if (config.cockpit) {
          const labelLayer = featureLayer.append("g").attr("class", "mainland-label-layer");
          mainlandFeatures.forEach((feature) => {
            const code = config.regionResolver(feature);
            const region = regionsByCode.get(code);
            if (!region) return;
            const layout = MAINLAND_REGION_LABELS.get(code) || { lines: [region.name] };
            const [baseX, baseY] = path.centroid(feature);
            if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) return;
            const x = baseX + (layout.dx || 0);
            const text = labelLayer.append("text")
              .attr("class", "map-region-label region-name")
              .attr("x", x)
              .attr("y", baseY + (layout.dy || 0))
              .attr("data-code", code);
            layout.lines.forEach((line, index) => {
              text.append("tspan").attr("x", x)
                .attr("dy", index ? "1em" : layout.lines.length === 1 ? ".34em" : "-.14em")
                .text(line);
            });
            labelByCode.set(code, text);
          });
        }

        const insets = config.cockpit ? [] : Object.entries(mapLayout.domInsets);
        insets.forEach(([regionCode, inset]) => {
          const insetFeatures = features.filter((feature) => config.regionResolver(feature) === regionCode);
          const insetProjection = d3.geoMercator().fitExtent(
            [[inset.x + 18, inset.y + 34], [inset.x + inset.width - 18, inset.y + inset.height - 18]],
            { type: "FeatureCollection", features: insetFeatures },
          );
          const insetPath = d3.geoPath(insetProjection);
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
            pathByCode.set(key, element);
            pathGeneratorByCode.set(key, insetPath);
          });
        });

        const refs = {
          rootGroup: root,
          cameraGroup,
          mainlandProjection: projection,
          cameraState: { scale: 1, x: 0, y: 0 },
          featureLayer,
          focusGroup,
          pathByCode,
          labelByCode,
          pathGeneratorByCode,
        };
        // Les vues départementales réutilisent les chemins quand seules les valeurs changent.
        if (!config.cockpit) {
          const paths = featureLayer.selectAll("path.path-department");
          config.bindDepartmentTooltip(paths, config.tooltipResolver);
          compositeMapViews.set(viewKey, { featureCollection, refs, update(nextConfig) {
            config = nextConfig;
            pathByCode.forEach((element) => {
              const feature = element.datum();
              element.attr("class", config.className(feature)).attr("fill", config.fillResolver(feature));
            });
            config.bindDepartmentTooltip(paths, config.tooltipResolver);
          } });
        }
        return refs;
      }

      function renderLandingMap() {
        chartRefs.regionMap = drawCompositeMap(landingMapSvg, displayRegionsGeojson, {
          cockpit: true,
          keyResolver: (feature) => feature.properties.code,
          regionResolver: (feature) => feature.properties.code,
          className: (feature) => `path-region${regionsByCode.get(feature.properties.code).hasData ? "" : " is-unavailable"}`,
          fillResolver: () => null,
        });
        mountCockpitMap(chartRefs.regionMap);
      }

      applyColorTokens();
      setTheme(null);
      initCockpitReadout();
      renderLandingMap();
      geoTrigger.addEventListener("click", queueGeographyToggle);

      window.BAROMETRE_REGION_MAP = {
        buildScale, chartRefs, colorWithAlpha, drawCompositeMap, hideTooltip, hydrate,
        paletteToken, regionsByCode, resetTerritoryPreview, setTheme, showTooltip, state, themeForRegion,
        frNumber, formatCount, formatCurrency, monthLabel, quarterLabel, createIndicatorCard, updateIndicatorCard, cockpitCenter,
      };
    })();
