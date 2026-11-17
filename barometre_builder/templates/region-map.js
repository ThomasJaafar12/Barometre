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

      const landingMapShadowSvg = d3.select("#landingMapShadow");
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
      let formatRegionCount = null;

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

      function hydrate({ activateRegion, toggleGeography, formatCount }) {
        onRegion = activateRegion;
        formatRegionCount = formatCount;
        geoTrigger.removeEventListener("click", queueGeographyToggle);
        const intent = pendingIntent;
        pendingIntent = null;
        if (intent?.type === "region") activateRegion(intent.code);
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

      function mapRegionValues() {
        if (state.phase === "national") {
          return new Map(DATA.regions.map((region) => [region.code, primaryHeroValue(region)]));
        }
        return new Map();
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

      let tooltipMoveFrame = null;
      let tooltipClientX = 0;
      let tooltipClientY = 0;
      let tooltipFitsViewport = false;
      let tooltipWidth = 0;
      let tooltipHeight = 0;

      function applyTooltipPosition() {
        tooltipMoveFrame = null;
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

      function moveTooltip(event) {
        tooltipClientX = event.clientX;
        tooltipClientY = event.clientY;
        if (tooltipMoveFrame != null) return;
        tooltipMoveFrame = requestAnimationFrame(applyTooltipPosition);
      }

      function showTooltip(event, label, value, fitViewport = false) {
        if (tooltipMoveFrame != null) {
          cancelAnimationFrame(tooltipMoveFrame);
          tooltipMoveFrame = null;
        }
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
        if (tooltipMoveFrame != null) {
          cancelAnimationFrame(tooltipMoveFrame);
          tooltipMoveFrame = null;
        }
        tooltip.classList.remove("is-visible");
      }

      function cachedPath(generator) {
        const projectedPaths = new WeakMap();
        return (feature) => {
          if (!projectedPaths.has(feature)) projectedPaths.set(feature, generator(feature));
          return projectedPaths.get(feature);
        };
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
        selection.selectChildren(":not(title):not(desc)").remove();
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
        const pathData = staticShadowLayer ? cachedPath(path) : path;
        const pathByCode = new Map();
        const labelByCode = new Map();
        const pathGeneratorByCode = new Map();
        let hoveredElement = null;
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
        const setPathHover = (element, datum, enabled) => {
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
                const shape = element.attr("d");
                hoverEffectPaths.forEach((effectPath) => {
                  effectPath
                    .attr("d", shape)
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
        const bindPathInteractions = (element, key) => {
          if (!config.clickable) return;
          element
            .on("mouseenter", (event, datum) => {
              if (!canUseHoverEffect()) {
                clearPathHover();
              } else {
                setPathHover(element, datum, true);
              }
              if (!canShowPathTooltip()) {
                hideTooltip();
                return;
              }
              const tooltipText = config.tooltipResolver(datum);
              showTooltip(event, tooltipText.label, tooltipText.value);
            })
            .on("mousemove", (event) => {
              if (!canUseHoverEffect()) clearPathHover();
              if (!canShowPathTooltip()) {
                hideTooltip();
                return;
              }
              moveTooltip(event);
            })
            .on("mouseleave", (event, datum) => {
              setPathHover(element, datum, false);
              hideTooltip();
            })
            .on("click", () => {
              clearPathHover();
              hideTooltip();
              config.onClick(key);
            });
        };

        if (staticShadowLayer) {
          const mainlandShadowGroup = staticShadowLayer.append("g").attr("class", "map-static-mainland-shadow");
          mainlandFeatures
            .filter((feature) => !config.shadowFeatureFilter || config.shadowFeatureFilter(feature))
            .forEach((feature) => {
              mainlandShadowGroup.append("path").datum(feature).attr("class", "map-static-shadow-shape").attr("d", pathData);
            });
        }

        const mainlandGroup = featureLayer.append("g").attr("class", "mainland-layer");
        const labelLayer = config.showMainlandLabels ? featureLayer.append("g").attr("class", "mainland-label-layer") : null;
        mainlandFeatures.forEach((feature) => {
          const key = config.keyResolver(feature);
          const element = mainlandGroup.append("path")
            .datum(feature)
            .attr("class", config.className(feature))
            .attr("d", pathData)
            .attr("fill", config.fillResolver(feature))
            .attr("data-code", key);
          bindPathInteractions(element, key);
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
          const insetPathData = staticShadowLayer ? cachedPath(insetPath) : insetPath;
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
                insetPathShadowGroup.append("path").datum(feature).attr("class", "map-static-shadow-shape").attr("d", insetPathData);
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
              .attr("d", insetPathData)
              .attr("fill", config.fillResolver(feature))
              .attr("data-code", key);
            bindPathInteractions(element, key);
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
        // Les vues départementales réutilisent les chemins quand seules les valeurs changent.
        if (!config.clickable) {
          const paths = featureLayer.selectAll("path.path-department");
          config.bindDepartmentTooltip(paths, config.tooltipResolver);
          compositeMapViews.set(viewKey, { featureCollection, geometryKey, refs, update(nextConfig) {
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
              return { label: region.name, value: formatRegionCount(primaryHeroValue(region)) };
            }
            if (!region.hasData) return { label: region.name, value: "Données indisponibles" };
            return { label: region.name, value: "Entrer" };
          },
          onClick: selectRegion,
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

      applyColorTokens();
      setTheme(null);
      renderLandingMap();
      geoTrigger.addEventListener("click", queueGeographyToggle);

      window.BAROMETRE_REGION_MAP = {
        buildScale, chartRefs, colorWithAlpha, drawCompositeMap, hideTooltip, hydrate,
        paletteToken, primaryHeroValue, regionsByCode, renderLandingMap, setTheme, showTooltip, state, themeForRegion,
      };
    })();
