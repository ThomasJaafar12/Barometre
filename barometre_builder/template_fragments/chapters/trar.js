      const TRAR_HORIZONS = [
        { key: "fin", label: "Fin du mois d’échéance", shortLabel: "À l’échéance", color: "#004B9B" },
        { key: "moisSuivant", label: "Fin du mois suivant", shortLabel: "Mois suivant", color: "#087783", dash: "8 4" },
        { key: "j90", label: "90 jours après l’échéance", shortLabel: "À 90 jours", color: "#98511F", dash: "2 5" },
      ];
      const TRAR_COLOR_MODES = [
        { key: "annual", label: "Écart annuel" },
        { key: "rate", label: "Taux" },
      ];
      const TRAR_DEFAULT_SECTOR = "tous-secteurs";
      const trarSelection = {
        nationalSector: TRAR_DEFAULT_SECTOR,
        regionalSector: TRAR_DEFAULT_SECTOR,
        departmentSector: TRAR_DEFAULT_SECTOR,
        horizon: TRAR_HORIZONS[0].key,
        colorMode: TRAR_COLOR_MODES[0].key,
        rankingHorizon: TRAR_HORIZONS[0].key,
        department: "",
      };
      const trarSelectOptions = new WeakMap();
      const trarSeriesByValues = new WeakMap();
      const trarSnapshotsByData = new WeakMap();
      let trarTreemapView = null;
      let trarTreemapLayout = null;
      let trarTreemapObserver = null;

      function formatTrarPercent(value) {
        if (!Number.isFinite(value)) return "—";
        const magnitude = Math.abs(value);
        const decimals = magnitude && magnitude < 0.00005 ? 6 : magnitude && magnitude < 0.005 ? 4 : 2;
        return `${frNumber(value, decimals)}\u00a0%`;
      }

      function formatTrarChange(change) {
        if (!Number.isFinite(change)) return "—";
        const sign = change > 0 ? "+" : change < 0 ? "−" : "";
        return `${sign}${frNumber(Math.abs(change), 2)}\u00a0pt`;
      }

      function renderTrarSelect(id, options, value, onSelect, placeholder = null) {
        const select = document.getElementById(id);
        if (trarSelectOptions.get(select) !== options) {
          const nodes = options.map(({ key, label }) => new Option(label, key));
          if (placeholder !== null) nodes.unshift(new Option(placeholder, ""));
          select.replaceChildren(...nodes);
          trarSelectOptions.set(select, options);
        }
        select.value = value;
        select.disabled = options.length === 0;
        select.onchange = () => onSelect(select.value);
      }

      function trarSeries({ dates, displayStartDate }, values) {
        if (!values) return { points: [], latest: TRAR_HORIZONS.map(() => null) };
        const cached = trarSeriesByValues.get(values);
        if (cached) return cached;
        const latest = TRAR_HORIZONS.map(() => null);
        const allPoints = dates.map((date, index) => {
          const point = { date };
          TRAR_HORIZONS.forEach(({ key }, horizonIndex) => {
            const value = values[index]?.[horizonIndex];
            point[key] = value ?? null;
            if (date >= displayStartDate && Number.isFinite(value)) latest[horizonIndex] = { date, value };
          });
          return point;
        });
        const first = allPoints.findIndex((point) => point.date >= displayStartDate
          && TRAR_HORIZONS.some(({ key }) => Number.isFinite(point[key])));
        const points = first === -1 ? [] : allPoints.slice(first);
        const result = { points, latest };
        trarSeriesByValues.set(values, result);
        return result;
      }

      function trarHistoryLabel(points) {
        return points.length ? ` · Historique depuis ${monthLabel(points[0].date)}` : "";
      }

      function renderTrarCurveLegend(id) {
        const legend = document.getElementById(id);
        if (legend.childElementCount) return;
        legend.replaceChildren(...TRAR_HORIZONS.map(({ label, color, dash }) => {
          const chip = textElement("span", "", "legend-chip");
          const sample = textElement("i", "", "trar-line-sample");
          sample.style.borderColor = color;
          sample.style.borderTopStyle = dash ? (dash.startsWith("2") ? "dotted" : "dashed") : "solid";
          sample.setAttribute("aria-hidden", "true");
          chip.append(sample, document.createTextNode(label));
          return chip;
        }));
      }

      function renderTrarChart(svgId, tooltipId, legendId, points, scope) {
        renderTrarCurveLegend(legendId);
        drawQuarterlyComparisonChart({
          svgId, tooltipId, points, scope, sharedScale: true, periodLabel: monthLabel, tickInterval: 12, area: false,
          description: "Évolution mensuelle du taux de reste à recouvrer",
          scaleDomain: (minimum, maximum) => {
            const low = Math.min(0, minimum);
            const high = Math.max(0, maximum);
            const padding = (high - low) * 0.08 || 0.01;
            return [low < 0 ? low - padding : 0, high + padding];
          },
          series: TRAR_HORIZONS.map((horizon) => ({
            ...horizon, axisLabel: "Taux de reste à recouvrer (%)", compactAxisLabel: "Taux (%)", format: formatTrarPercent,
          })),
        });
      }

      function renderTrarLatest(latest, changes) {
        document.getElementById("trarLatest").replaceChildren(...TRAR_HORIZONS.map(({ key, label }, index) => {
          const point = latest[index];
          const row = textElement("div", "", "delai-kpi-block");
          row.dataset.horizon = key;
          const value = textElement("dd", "", "trar-latest-value");
          const level = textElement("div", "", "trar-rate-level");
          level.append(textElement("strong", formatTrarPercent(point?.value), "delai-level-value"));
          if (point) {
            const period = textElement("time", monthLabel(point.date));
            period.dateTime = point.date;
            level.append(period);
          }
          const [yoy, mom] = changes?.[index] || [];
          const stats = textElement("div", "", "employment-dashboard-stats");
          stats.append(trarTrend("Gliss. annuel", yoy), trarTrend("Gliss. mensuel", mom));
          value.append(level, stats);
          row.append(textElement("dt", label, "employment-dashboard-level-label"), value);
          return row;
        }));
      }

      function trarTrend(label, change) {
        const item = textElement("div", "", "employment-dashboard-stat");
        const direction = !Number.isFinite(change) ? "unknown" : change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
        const trend = textElement("strong", "", `employment-dashboard-trend is-${direction}`);
        const svg = svgElement("svg", { "aria-hidden": "true", viewBox: "0 0 24 24" });
        svg.append(svgElement("path", { d: "M5 10l7-7m0 0 7 7M12 3v18" }));
        trend.append(svg, textElement("span", formatTrarChange(change)));
        item.append(textElement("span", label, "employment-dashboard-stat-label"), trend);
        return item;
      }

      function renderTrarRanking(options, dashboard, selectedKey, selectSector) {
        const horizonIndex = TRAR_HORIZONS.findIndex(({ key }) => key === trarSelection.rankingHorizon);
        const snapshot = dashboard?.rankings[horizonIndex];
        const date = snapshot?.date;
        const rows = (snapshot?.rows || []).map(([key, value, yoy]) => ({
          key, label: options.find((option) => option.key === key).label, value, yoy,
        }));

        const period = document.getElementById("trarTopSectorsMeta");
        period.textContent = date ? monthLabel(date) : "—";
        if (date) period.dateTime = date;
        else period.removeAttribute("datetime");
        renderTrarSelect("trarRankingHorizon", TRAR_HORIZONS, trarSelection.rankingHorizon, (key) => {
          trarSelection.rankingHorizon = key;
          renderTrarRanking(options, dashboard, selectedKey, selectSector);
        });
        renderSectorRanking({
          containerId: "trarTopSectorsTable",
          tableClass: "trar-top-table",
          rows, selectedKey,
          valueLabel: "Taux",
          changeLabel: "Écart annuel",
          formatLabel: ({ label }) => label,
          formatValue: formatTrarPercent,
          formatChange: formatTrarChange,
          emptyMessage: "Aucun taux sectoriel disponible pour cette échéance.",
          onSelect: (key) => {
            selectSector(key);
            document.getElementById("trarSectorSelect").focus({ preventScroll: true });
          },
        });
      }

      function trarSnapshot(data, sectorKey, horizonIndex) {
        let snapshots = trarSnapshotsByData.get(data);
        if (!snapshots) {
          snapshots = new Map();
          trarSnapshotsByData.set(data, snapshots);
        }
        const key = `${sectorKey}:${horizonIndex}`;
        if (snapshots.has(key)) return snapshots.get(key);
        const dateIndex = data.departmentSnapshots[sectorKey]?.[horizonIndex];
        const date = dateIndex == null ? null : data.dates[dateIndex];
        const values = new Map();
        const changes = new Map();
        if (date) {
          const previousYearDate = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
          const previousYearIndex = data.dates.indexOf(previousYearDate);
          Object.entries(data.departments).forEach(([code, scope]) => {
            const series = scope[sectorKey];
            const value = series?.[dateIndex]?.[horizonIndex];
            if (!Number.isFinite(value)) return;
            values.set(code, value);
            const previous = series?.[previousYearIndex]?.[horizonIndex];
            if (Number.isFinite(previous)) changes.set(code, Number((value - previous).toFixed(2)));
          });
        }
        const rates = [...values.values()].sort(d3.ascending);
        const distinct = [...new Set(rates)];
        const { positive: [lightGreen, green], neutral, negative: [lightRed, red] } = treemapPalette();
        const ratePalette = [green, lightGreen, neutral, lightRed, red];
        const classCount = Math.min(distinct.length, ratePalette.length);
        const cuts = Array.from({ length: Math.max(0, classCount - 1) }, (_, index) =>
          d3.quantileSorted(rates, (index + 1) / classCount));
        const thresholds = [...new Set(cuts)].filter((cut) => cut > rates[0]);
        if (!thresholds.length && classCount > 1) thresholds.push(distinct[1]);
        const colors = thresholds.length
          ? Array.from({ length: thresholds.length + 1 }, (_, index) =>
              ratePalette[Math.round(index * (ratePalette.length - 1) / thresholds.length)])
          : [neutral];
        const rateColor = d3.scaleThreshold(thresholds, colors);
        const annualColor = treemapVariationColorScale(changes.values(), (change) => change);
        const result = { date, values, changes, thresholds, colors, rateColor, annualColor };
        snapshots.set(key, result);
        return result;
      }

      function renderTrarSnapshotLegend({ snapshot, annual, departments }) {
        const legend = document.getElementById("trarSnapshotLegend");
        if (annual) {
          const hasMissing = [...departments.values()].some(({ change }) => !Number.isFinite(change));
          legend.replaceChildren(...treemapVariationLegend({
            negative: "Hausse annuelle",
            positive: "Repli annuel",
            missing: hasMissing ? "Écart annuel indisponible" : null,
          }));
          return;
        }
        const { thresholds, colors, values } = snapshot;
        const items = !values.size ? [] : colors.map((color, index) => {
          const lower = thresholds[index - 1];
          const upper = thresholds[index];
          let interval = formatTrarPercent(values.values().next().value);
          if (upper !== undefined) interval = `${lower === undefined ? "" : `${formatTrarPercent(lower)} à `}< ${formatTrarPercent(upper)}`;
          else if (lower !== undefined) interval = `≥ ${formatTrarPercent(lower)}`;
          const key = textElement("span", "", "trar-color-key");
          const swatch = textElement("i", "");
          swatch.style.backgroundColor = color;
          key.append(swatch, document.createTextNode(interval));
          return key;
        });
        const missing = textElement("span", "", "trar-color-key");
        missing.append(textElement("i", "", "trar-missing-swatch"), document.createTextNode("Donnée indisponible"));
        legend.replaceChildren(...items, missing);
      }

      function trarDepartmentDatum(feature, snapshot, departmentSeries, sectorKey, annual) {
        const { code, nom: name, region } = feature.properties;
        const value = snapshot.values.get(code);
        const change = snapshot.changes.get(code);
        // Une hausse du taux de reste à recouvrer est défavorable.
        const fill = annual ? snapshot.annualColor(-change) : (snapshot.rateColor(value) ?? "#E2E8F0");
        return { code, name, region, value, change, fill, hasHistory: Boolean(departmentSeries[code]?.[sectorKey]) };
      }

      function setTrarSelectionAppearance() {
        document.querySelectorAll("#trarTreemapSvg [data-code], #trarMapSvg [data-code]").forEach((node) => {
          const selected = node.dataset.code === trarSelection.department;
          node.classList.toggle("is-selected", selected);
          if (node.getAttribute("role") === "button") node.setAttribute("aria-pressed", String(selected));
        });
      }

      function bindTrarDepartmentMarks(marks, datum, context) {
        const place = (department) => {
          const name = `${department.name} (${department.code})`;
          const region = regionsByCode.get(department.region);
          return context.national && region ? `${name} · ${region.name}` : name;
        };
        const rateLabel = ({ value }) => Number.isFinite(value) ? formatTrarPercent(value) : "Taux indisponible";
        const changeLabel = ({ change }) => Number.isFinite(change)
          ? `Écart annuel : ${formatTrarChange(change)}` : "Écart annuel indisponible";
        const period = context.snapshot.date ? ` en ${monthLabel(context.snapshot.date)}` : "";
        const label = (item) => {
          const department = datum(item);
          return `${place(department)}. ${rateLabel(department)}${period}.${context.annual ? ` ${changeLabel(department)}.` : ""}`;
        };
        marks.attr("aria-disabled", (item) => datum(item).hasHistory ? null : "true");
        bindVizTooltip(marks, {
          label,
          show: (position, item) => {
            const department = datum(item);
            const rate = rateLabel(department);
            showTooltip(position, place(department), context.annual ? `${rate} · ${changeLabel(department)}` : rate, true);
          },
          hide: hideTooltip,
          arrowNavigation: true,
          activate: (item) => {
            const department = datum(item);
            if (department.hasHistory) selectTrarDepartment(department.code);
          },
        });
      }

      function trarTreemapWidth() {
        return document.getElementById("trarTreemapShell").clientWidth;
      }

      function buildTrarTreemap(features, width) {
        if (trarTreemapLayout?.width === width && trarTreemapLayout.features === features) return trarTreemapLayout;
        const grouped = d3.groups(features, ({ properties }) => properties.region);
        const height = width < 640 ? Math.round(width * 2.35) : Math.round(Math.max(480, width * 0.51));
        const root = d3.hierarchy({
          children: grouped.map(([code, features]) => ({ code, children: features.map(({ properties }) => ({ code: properties.code })) })),
        }).sum((node) => node.children ? 0 : 1)
          .sort((left, right) => right.value - left.value || left.data.code.localeCompare(right.data.code, "fr"));
        d3.treemap().tile(d3.treemapSquarify.ratio(1)).size([width, height])
          .paddingInner((node) => node.depth === 0 ? 4 : 2)
          .paddingLeft(3).paddingRight(3).paddingBottom(3)
          .paddingTop((node) => node.depth === 1 && node.y1 - node.y0 >= 38 ? 20 : 3).round(true)(root);
        trarTreemapLayout = { features, width, root, height };
        return trarTreemapLayout;
      }

      function renderTrarTreemap(context, width) {
        if (!width) return;
        const { root, height } = buildTrarTreemap(context.features, width);
        const getDepartment = (node) => context.departments.get(node.data.code);
        const svg = d3.select("#trarTreemapSvg").attr("viewBox", `0 0 ${width} ${height}`);
        const groups = svg.selectAll("g.trar-region-group").data(root.children || [], (node) => node.data.code)
          .join((enter) => {
            const group = enter.append("g").attr("class", "trar-region-group");
            group.append("rect").attr("rx", 4).attr("aria-hidden", "true");
            group.append("text").attr("class", "trar-region-text").attr("aria-hidden", "true");
            return group;
          });
        groups.attr("transform", (node) => `translate(${node.x0},${node.y0})`);
        groups.select("rect").attr("width", (node) => node.x1 - node.x0).attr("height", (node) => node.y1 - node.y0);
        groups.select("text").attr("x", 6).attr("y", 14).text((node) => {
          if (node.y1 - node.y0 < 38) return "";
          const label = regionsByCode.get(node.data.code)?.name || node.data.code;
          const length = Math.floor((node.x1 - node.x0 - 12) / 6.4);
          return label.length <= length ? label : length >= 4 ? `${label.slice(0, length - 1)}…` : "";
        });
        const tiles = groups.selectAll("g.trar-department-tile")
          .data((node) => node.children, (node) => node.data.code)
          .join((enter) => {
            const tile = enter.append("g").attr("class", "trar-department-tile");
            tile.append("rect").attr("rx", 3).attr("aria-hidden", "true");
            tile.append("text").attr("class", "trar-tile-code").attr("aria-hidden", "true");
            tile.append("text").attr("class", "trar-tile-rate").attr("aria-hidden", "true");
            tile.append("text").attr("class", "trar-tile-change").attr("aria-hidden", "true");
            return tile;
          });
        tiles.attr("data-code", (node) => node.data.code)
          .attr("transform", (node) => `translate(${node.x0 - node.parent.x0},${node.y0 - node.parent.y0})`)
          .attr("fill", "#0B1E36");
        tiles.select("rect").attr("width", (node) => node.x1 - node.x0).attr("height", (node) => node.y1 - node.y0)
          .attr("fill", (node) => getDepartment(node).fill);
        const center = (node) => (node.x1 - node.x0) / 2;
        const offset = (node) => (node.y1 - node.y0) / 2;
        const showRate = (node) => node.x1 - node.x0 >= 51 && node.y1 - node.y0 >= 35;
        const showChange = (node) => context.annual && node.x1 - node.x0 >= 58 && node.y1 - node.y0 >= 46;
        tiles.select(".trar-tile-code").attr("x", center)
          .attr("y", (node) => offset(node) - (showChange(node) ? 13 : showRate(node) ? 5 : 0))
          .text((node) => node.x1 - node.x0 >= 19 && node.y1 - node.y0 >= 15 ? node.data.code : "");
        tiles.select(".trar-tile-rate").attr("x", center)
          .attr("y", (node) => offset(node) + (showChange(node) ? 1 : 9))
          .text((node) => showRate(node) ? formatTrarPercent(getDepartment(node).value) : "");
        tiles.select(".trar-tile-change").attr("x", center)
          .attr("y", (node) => offset(node) + 14)
          .text((node) => showChange(node) ? formatTrarChange(getDepartment(node).change) : "");
        bindTrarDepartmentMarks(tiles, getDepartment, context);
      }

      function renderTrarMap(context) {
        const svg = d3.select("#trarMapSvg").attr("aria-label", `Carte des départements · ${scopeLabel()}`);
        const getDepartment = ({ properties }) => context.departments.get(properties.code);
        const marks = renderDepartmentMapPaths(svg, context.features)
          .classed("path-department trar-map-department", true)
          .attr("data-code", ({ properties }) => properties.code)
          .attr("fill", (feature) => getDepartment(feature).fill);
        bindTrarDepartmentMarks(marks, getDepartment, context);
      }

      function renderTrarDepartmentHistory(data, departmentSector, department) {
        const panel = document.getElementById("trarDepartmentDetail");
        panel.hidden = !department;
        if (!department) return;
        const { points } = trarSeries(data, data.departments[department.code]?.[departmentSector.key]);
        const scope = `${department.name} (${department.code}) · ${departmentSector.label}`;
        document.getElementById("trarDepartmentChartTitle").textContent = `Historique · ${department.name} (${department.code})`;
        document.getElementById("trarDepartmentChartContext").textContent = `${departmentSector.label}${trarHistoryLabel(points)}`;
        renderTrarChart("trarDepartmentChartSvg", "trarDepartmentChartTooltip", "trarDepartmentChartLegend", points, scope);
      }

      function selectTrarDepartment(code) {
        trarSelection.department = code;
        document.getElementById("trarDepartmentSelect").value = code;
        setTrarSelectionAppearance();
        const data = DATA.modules.trar;
        const { departmentByCode } = geographyIndex(DATA.geography);
        const feature = departmentByCode.get(code);
        const department = feature && { code, name: feature.properties.nom };
        const sector = data.sectors.departmental.find(({ key }) => key === trarSelection.departmentSector);
        renderTrarDepartmentHistory(data, sector, department);
      }

      function renderTrarDepartmentSnapshot(data, national) {
        const departmentSector = data.sectors.departmental.find(({ key }) => key === trarSelection.departmentSector);
        const horizonIndex = TRAR_HORIZONS.findIndex(({ key }) => key === trarSelection.horizon);
        const horizon = TRAR_HORIZONS[horizonIndex];
        const snapshot = trarSnapshot(data, departmentSector.key, horizonIndex);
        const annual = trarSelection.colorMode === "annual";
        const features = national ? DATA.geography.departments.features
          : geographyIndex(DATA.geography).departmentsByRegion.get(state.selectedRegion) || [];
        const departments = new Map(features.map((feature) => [feature.properties.code,
          trarDepartmentDatum(feature, snapshot, data.departments, departmentSector.key, annual)]));
        const context = { departments, features, snapshot, national, annual };
        const metadata = document.getElementById("trarDepartmentContext");
        const periodLabel = snapshot.date ? monthLabel(snapshot.date) : "Données indisponibles";
        metadata.textContent = `${scopeLabel()} · ${departmentSector.label} · ${horizon.label} · ${periodLabel}`;
        renderButtonOptions(document.getElementById("trarHorizonSwitch"),
          TRAR_HORIZONS.map(({ key, shortLabel }) => ({ key, label: shortLabel })), horizon.key, (key) => {
            trarSelection.horizon = key;
            renderTrarDepartmentSnapshot(data, national);
          }, { ariaPressed: true, skipActive: true });
        renderButtonOptions(document.getElementById("trarColorSwitch"),
          TRAR_COLOR_MODES, trarSelection.colorMode, (key) => {
            trarSelection.colorMode = key;
            renderTrarDepartmentSnapshot(data, national);
          }, { ariaPressed: true, skipActive: true });
        const treemapShell = document.getElementById("trarTreemapShell");
        const mapShell = document.getElementById("trarMapShell");
        dismissVizTooltip(document.getElementById(national ? "trarMapSvg" : "trarTreemapSvg"));
        treemapShell.hidden = !national;
        mapShell.hidden = national;
        const note = document.getElementById("trarTreemapNote");
        const weight = national ? "Chaque département a le même poids dans le treemap. " : "";
        note.textContent = weight + (annual
          ? "La couleur représente l’écart avec le même mois de l’année précédente, en points de pourcentage."
          : "La couleur représente le taux.");
        note.hidden = !national && !annual;
        if (national) {
          const width = trarTreemapWidth();
          trarTreemapView = { context, width };
          renderTrarTreemap(context, width);
          if (!trarTreemapObserver) {
            trarTreemapObserver = new ResizeObserver(() => {
              if (!trarTreemapView || treemapShell.hidden) return;
              const width = trarTreemapWidth();
              if (width > 0 && width !== trarTreemapView.width) {
                trarTreemapView.width = width;
                renderTrarTreemap(trarTreemapView.context, width);
                setTrarSelectionAppearance();
              }
            });
            trarTreemapObserver.observe(treemapShell);
          }
        } else {
          trarTreemapView = null;
          renderTrarMap(context);
        }
        renderTrarSnapshotLegend(context);
        setTrarSelectionAppearance();
        return departments;
      }

      function renderTrarDepartmentView(data, national) {
        const departments = renderTrarDepartmentSnapshot(data, national);
        renderTrarSelect("trarDepartmentSectorSelect", data.sectors.departmental, trarSelection.departmentSector, (key) => {
          trarSelection.departmentSector = key;
          renderTrarDepartmentView(data, national);
        });
        const departmentOptions = [...departments.values()].filter((department) => department.hasHistory)
          .sort((left, right) => left.name.localeCompare(right.name, "fr"))
          .map(({ code, name }) => ({ key: code, label: `${name} (${code})` }));
        if (!departmentOptions.some(({ key }) => key === trarSelection.department)) trarSelection.department = "";
        renderTrarSelect("trarDepartmentSelect", departmentOptions, trarSelection.department, selectTrarDepartment, "Choisir un département");
        selectTrarDepartment(trarSelection.department);
      }

      function renderTrarMainChart(data, national) {
        const options = national ? data.sectors.national : data.sectors.regional;
        const sectorState = national ? "nationalSector" : "regionalSector";
        const sector = options.find(({ key }) => key === trarSelection[sectorState]);
        const scope = national ? data.national : data.regions[state.selectedRegion];
        const dashboard = national ? data.dashboards.national : data.dashboards.regions[state.selectedRegion];
        const mesh = national ? "NACE 88" : "NACE 28";
        const selectSector = (key) => {
          trarSelection[sectorState] = key;
          renderTrarMainChart(data, national);
        };
        const { points, latest } = trarSeries(data, scope?.[sector.key]);
        document.getElementById("trarSectorLabel").textContent = `Secteur d’activité (${mesh})`;
        document.getElementById("trarChartScope").textContent = `${scopeLabel()} · Données mensuelles CVS${trarHistoryLabel(points)}`;
        const dashboardScope = document.getElementById("trarDashboardScope");
        dashboardScope.textContent = `${scopeLabel()} · ${sector.label}`;
        dashboardScope.title = dashboardScope.textContent;
        renderTrarSelect("trarSectorSelect", options, sector.key, selectSector);
        renderTrarLatest(latest, dashboard?.changes[sector.key]);
        renderTrarRanking(options, dashboard, sector.key, selectSector);
        renderTrarChart("trarChartSvg", "trarChartTooltip", "trarChartLegend", points, `${scopeLabel()} · ${sector.label}`);
      }

      function renderTrarModule() {
        const data = DATA.modules.trar;
        const container = document.getElementById("module-trar");
        container.hidden = !data;
        if (!data) return;
        const national = state.phase === "national";
        renderTrarMainChart(data, national);
        renderTrarDepartmentView(data, national);
      }
