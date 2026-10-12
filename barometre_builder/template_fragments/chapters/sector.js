      let sectorDepartmentFeaturesByRegion = null;

      function getSectorRegionalScopeData() {
        return state.phase === "national"
          ? DATA.modules.sector.regional.national
          : DATA.modules.sector.regional.regions[state.selectedRegion];
      }

      function getSectorDepartmentFeaturesByRegion() {
        if (!sectorDepartmentFeaturesByRegion) {
          sectorDepartmentFeaturesByRegion = new Map();
          DATA.geography.departments.features.forEach((feature) => {
            const regionCode = feature.properties.region;
            const features = sectorDepartmentFeaturesByRegion.get(regionCode) || [];
            features.push(feature);
            sectorDepartmentFeaturesByRegion.set(regionCode, features);
          });
        }
        return sectorDepartmentFeaturesByRegion;
      }

      function employmentMetricConfig(metricKey) {
        const isHeadcount = metricKey === "effectifs_cvs";
        const divisor = isHeadcount ? 1e6 : 1e9;
        const axisDecimals = isHeadcount ? 2 : 1;
        return {
          key: metricKey,
          label: isHeadcount ? "Effectifs" : "Masse salariale",
          heading: isHeadcount
            ? "Effectifs privés hors agricole"
            : "Masse salariale du secteur privé hors agricole",
          levelKey: metricKey,
          yoyKey: isHeadcount ? "effectifs_yoy" : "masse_yoy",
          qoqKey: isHeadcount ? "effectifs_qoq" : "masse_qoq",
          axisTitle: isHeadcount ? "Niveau (millions)" : "Niveau (milliards d'euros)",
          legendLine: isHeadcount ? "Niveau des effectifs" : "Niveau de masse salariale",
          tooltipLevel: (value) => isHeadcount ? `${frNumber(value / divisor, 2)} M` : `${frNumber(value / divisor, 1)} Md€`,
          summaryLevel: (value) => isHeadcount ? `${frNumber(value / divisor, 2)} M` : `${frNumber(value / divisor, 1)} Md€`,
          axisTick: (value) => frNumber(value / divisor, axisDecimals),
        };
      }

      function employmentTickIndices(length) {
        const step = length > 36 ? 2 : 1;
        const indices = [];
        for (let index = 0; index < length; index += step) {
          indices.push(index);
        }
        if (indices[indices.length - 1] !== length - 1) {
          indices.push(length - 1);
        }
        return indices;
      }

      const EMPLOYMENT_SECTOR_GROUPS = [
        { key: "industry", label: "Industrie & énergie", codes: ["BZ", "CA", "CB", "CC", "CD-CE-CF", "CG", "CH", "CI-CJ", "CK-CL", "CM", "DZ-EZ"] },
        { key: "trade", label: "Commerce & transp.", codes: ["GZ", "FZ", "HZ", "IZ"] },
        { key: "business", label: "Services entreprises", codes: ["JA-JB-JC", "KZ", "LZ", "MA", "MB-MC", "NZa", "NZb"] },
        { key: "collective", label: "Services collectifs", codes: ["OZ", "PZ", "QA", "QB", "RZ", "SZ"] },
      ];
      const EMPLOYMENT_GRAND_SECTOR_GROUPS = [
        { key: "grand", label: "Grands secteurs", codes: ["GS5", "GS3", "GS1", "GS7", "GS2", "GS4", "GS6"] },
      ];

      function employmentSectorCode(option) {
        return option.label.trim().split(/\s+/, 1)[0];
      }

      function employmentSectorDisplayLabel(option) {
        if (option.key === "population-entiere") return option.label;
        const code = employmentSectorCode(option);
        const description = option.label
          .slice(code.length)
          .trim()
          .replace(/^[-–—:]\s*/, "");
        return description ? `${code} — ${description}` : option.label;
      }

      function setEmploymentSectorPickerOpen(control, isOpen, focusPosition = "active") {
        const trigger = control.querySelector(".employment-sector-trigger");
        const menu = control.querySelector(".employment-sector-menu");
        control.closest(".employment-main, .employment-map-panel")?.classList.toggle("has-open-sector-picker", isOpen);
        control.classList.toggle("is-open", isOpen);
        trigger.setAttribute("aria-expanded", String(isOpen));
        if (!isOpen) return;
        requestAnimationFrame(() => {
          const options = [...menu.querySelectorAll(".employment-sector-option")];
          const target = focusPosition === "last"
            ? options[options.length - 1]
            : options.find((option) => option.getAttribute("aria-selected") === "true") || options[0];
          target?.focus();
        });
      }

      function closeEmploymentSectorPickers(except = null) {
        document.querySelectorAll(".employment-sector-picker.is-open").forEach((control) => {
          if (control !== except) setEmploymentSectorPickerOpen(control, false);
        });
      }

      function renderEmploymentSectorPicker(controlId, sectorOptions, stateKey, onRender, groups = EMPLOYMENT_SECTOR_GROUPS) {
        const control = document.getElementById(controlId);
        const trigger = control.querySelector(".employment-sector-trigger");
        const triggerValue = control.querySelector(".employment-sector-trigger-value");
        const menu = control.querySelector(".employment-sector-menu");
        const selectedOption = sectorOptions.find((option) => option.key === state[stateKey]) || sectorOptions[0];
        const aggregateOption = sectorOptions.find((option) => option.key === "population-entiere");

        const selectedDisplayLabel = employmentSectorDisplayLabel(selectedOption);
        triggerValue.textContent = selectedDisplayLabel;
        trigger.setAttribute("aria-label", `Choisir le secteur, actuellement ${selectedDisplayLabel}`);
        menu.id = `${controlId}Menu`;
        trigger.setAttribute("aria-controls", menu.id);
        menu.innerHTML = "";

        const createOptionButton = (option, extraClass = "") => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `employment-sector-option${extraClass ? ` ${extraClass}` : ""}${option.key === state[stateKey] ? " is-active" : ""}`;
          button.dataset.sectorKey = option.key;
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", String(option.key === state[stateKey]));
          const label = document.createElement("span");
          label.textContent = employmentSectorDisplayLabel(option);
          const dot = document.createElement("span");
          dot.className = "employment-sector-active-dot";
          dot.setAttribute("aria-hidden", "true");
          button.append(label, dot);
          return button;
        };

        const header = document.createElement("div");
        header.className = "employment-sector-menu-header";
        const title = document.createElement("span");
        title.className = "employment-sector-menu-title";
        title.textContent = "Sélection du secteur d’activité";
        header.appendChild(title);
        if (aggregateOption) header.appendChild(createOptionButton(aggregateOption, "employment-sector-all-option"));
        menu.appendChild(header);

        const grid = document.createElement("div");
        grid.className = "employment-sector-grid";
        menu.appendChild(grid);
        groups.forEach((group) => {
          const options = sectorOptions
            .filter((option) => group.codes.includes(employmentSectorCode(option)))
            .sort((left, right) => group.codes.indexOf(employmentSectorCode(left)) - group.codes.indexOf(employmentSectorCode(right)));
          if (!options.length) return;
          const column = document.createElement("section");
          column.className = `employment-sector-column employment-sector-column--${group.key}`;
          column.setAttribute("role", "group");
          const groupTitleId = `${controlId}-${group.key}-title`;
          column.setAttribute("aria-labelledby", groupTitleId);

          const columnHeader = document.createElement("div");
          columnHeader.className = "employment-sector-column-header";
          const badge = document.createElement("span");
          badge.className = "employment-sector-badge";
          badge.id = groupTitleId;
          badge.textContent = group.label;
          const count = document.createElement("span");
          count.className = "employment-sector-count";
          count.textContent = String(options.length);
          columnHeader.append(badge, count);

          const list = document.createElement("ul");
          list.className = "employment-sector-list";
          options.forEach((option) => {
            const item = document.createElement("li");
            item.appendChild(createOptionButton(option));
            list.appendChild(item);
          });
          column.append(columnHeader, list);
          grid.appendChild(column);
        });

        if (!control.dataset.bound) {
          trigger.addEventListener("click", () => {
            const shouldOpen = !control.classList.contains("is-open");
            closeEmploymentSectorPickers(control);
            setEmploymentSectorPickerOpen(control, shouldOpen);
          });
          trigger.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            closeEmploymentSectorPickers(control);
            setEmploymentSectorPickerOpen(control, true, event.key === "ArrowUp" ? "last" : "active");
          });
          menu.addEventListener("click", (event) => {
            const option = event.target.closest(".employment-sector-option");
            if (!option) return;
            state[stateKey] = option.dataset.sectorKey;
            setEmploymentSectorPickerOpen(control, false);
            onRender();
            requestAnimationFrame(() => control.querySelector(".employment-sector-trigger")?.focus());
          });
          menu.addEventListener("keydown", (event) => {
            const options = [...menu.querySelectorAll(".employment-sector-option")];
            const currentIndex = options.indexOf(document.activeElement);
            let nextIndex = null;
            if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = Math.min(currentIndex + 1, options.length - 1);
            if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = Math.max(currentIndex - 1, 0);
            if (event.key === "Home") nextIndex = 0;
            if (event.key === "End") nextIndex = options.length - 1;
            if (nextIndex != null) {
              event.preventDefault();
              options[nextIndex]?.focus();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setEmploymentSectorPickerOpen(control, false);
              trigger.focus();
            }
          });
          document.addEventListener("click", (event) => {
            if (!control.contains(event.target)) setEmploymentSectorPickerOpen(control, false);
          });
          control.dataset.bound = "true";
        }
      }

      function renderEmploymentSeriesPicker(controlId, scope, stateKey, onRender) {
        renderEmploymentSectorPicker(controlId, scope.seriesOptions, stateKey, onRender);
      }

      function employmentTrendState(value) {
        if (value == null || Number.isNaN(value)) return "unknown";
        if (value > 0.05) return "positive";
        if (value < -0.05) return "negative";
        return "neutral";
      }

      function employmentSignedPercent(value) {
        if (value == null || Number.isNaN(value)) return "—";
        return `${value > 0 ? "+" : ""}${formatPercent(value)}`;
      }

      function employmentInterpretation(latestPoint, metric) {
        const annual = employmentTrendState(latestPoint ? latestPoint[metric.yoyKey] : null);
        const quarterly = employmentTrendState(latestPoint ? latestPoint[metric.qoqKey] : null);
        const messages = {
          "positive-positive": "La hausse du dernier trimestre confirme la progression sur un an : la dynamique reste favorable.",
          "negative-positive": "La hausse du dernier trimestre contraste avec le recul sur un an et signale une amélioration récente.",
          "positive-negative": "Le repli du dernier trimestre contraste avec la progression sur un an et signale un ralentissement récent.",
          "negative-negative": "Le repli du dernier trimestre prolonge le recul sur un an : la tendance reste défavorable.",
          "neutral-positive": "Après une évolution quasi stable sur un an, la hausse du dernier trimestre dessine une amélioration récente.",
          "neutral-negative": "Après une évolution quasi stable sur un an, le repli du dernier trimestre dégrade la dynamique récente.",
          "positive-neutral": "La progression sur un an demeure, tandis que le niveau se stabilise au dernier trimestre.",
          "negative-neutral": "Le recul sur un an demeure, tandis que le niveau se stabilise au dernier trimestre.",
          "neutral-neutral": "L'indicateur est quasiment stable sur un an comme sur le dernier trimestre.",
        };
        return messages[`${annual}-${quarterly}`]
          || "Les données disponibles ne permettent pas de comparer les dynamiques annuelle et trimestrielle.";
      }

      function renderEmploymentTrend(elementId, value) {
        const element = document.getElementById(elementId);
        const stateName = employmentTrendState(value);
        element.classList.remove("is-positive", "is-negative", "is-neutral", "is-unknown");
        element.classList.add(`is-${stateName}`);
        element.querySelector("span").textContent = employmentSignedPercent(value);
        element.setAttribute("aria-label", employmentSignedPercent(value));
      }

      function drawEmploymentChart(config, points, metric) {
        const svg = d3.select(`#${config.chartSvgId}`);
        svg.selectAll("*").remove();
        const width = 980;
        const height = 560;
        const margin = { top: 38, right: 84, bottom: 78, left: 76 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const root = svg.attr("viewBox", `0 0 ${width} ${height}`);
        const chartInk = paletteToken("employment-chart-ink", "#1a4e93");
        const chartInkSoft = paletteToken("employment-chart-ink-soft", "rgba(26,78,147,0.16)");
        const chartText = paletteToken("employment-chart-text", "#16212c");
        const chartMuted = paletteToken("employment-chart-muted", "#5b6773");
        const chartGrid = paletteToken("employment-chart-grid", "rgba(22,33,44,0.07)");
        const chartGridStrong = paletteToken("employment-chart-grid-strong", "rgba(22,33,44,0.18)");
        const chartPositive = paletteToken("employment-chart-positive", "#0EA5A8");
        const chartNegative = paletteToken("employment-chart-negative", "#E11D48");

        const chart = root.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const yoyValues = points.map((point) => point[metric.yoyKey]).filter((value) => value != null);
        const levelValues = points.map((point) => point[metric.levelKey]).filter((value) => value != null);
        let yoyMin = d3.min(yoyValues) ?? -1;
        let yoyMax = d3.max(yoyValues) ?? 1;
        const yoyPad = Math.max(0.6, (yoyMax - yoyMin) * 0.12);
        yoyMin = Math.min(0, yoyMin - yoyPad);
        yoyMax = Math.max(0, yoyMax + yoyPad);
        let levelMin = d3.min(levelValues) ?? 0;
        let levelMax = d3.max(levelValues) ?? 1;
        const levelPad = Math.max(levelMax * 0.02, (levelMax - levelMin) * 0.08);
        levelMin -= levelPad;
        levelMax += levelPad;

        const xScale = d3.scalePoint().domain(points.map((_, index) => index)).range([0, innerWidth]).padding(0.25);
        const yYoY = d3.scaleLinear().domain([yoyMin, yoyMax]).nice().range([innerHeight, 0]);
        const yLevel = d3.scaleLinear().domain([levelMin, levelMax]).nice().range([innerHeight, 0]);
        const barStep = points.length > 1 ? xScale(1) - xScale(0) : innerWidth;
        const barWidth = Math.max(8, Math.min(18, barStep * 0.72));

        chart.append("g")
          .selectAll("line")
          .data(yYoY.ticks(7))
          .join("line")
          .attr("x1", 0)
          .attr("x2", innerWidth)
          .attr("y1", (value) => yYoY(value))
          .attr("y2", (value) => yYoY(value))
          .attr("stroke", (value) => value === 0 ? chartGridStrong : chartGrid)
          .attr("stroke-width", (value) => value === 0 ? 1.4 : 1);

        const leftAxis = chart.append("g")
          .call(d3.axisLeft(yYoY).ticks(7).tickFormat((value) => `${frNumber(value, 1)} %`));
        leftAxis.selectAll("text").attr("fill", chartMuted).style("font-family", "IBM Plex Mono, monospace").style("font-size", "12px");
        leftAxis.selectAll("path,line").attr("stroke", "rgba(22,33,44,0)");

        const rightAxis = chart.append("g")
          .attr("transform", `translate(${innerWidth},0)`)
          .call(d3.axisRight(yLevel).ticks(6).tickFormat((value) => metric.axisTick(value)));
        rightAxis.selectAll("text").attr("fill", chartInk).style("font-family", "IBM Plex Mono, monospace").style("font-size", "12px");
        rightAxis.selectAll("path,line").attr("stroke", chartInkSoft);

        chart.append("text")
          .attr("x", 0)
          .attr("y", -14)
          .attr("fill", chartText)
          .style("font-family", "IBM Plex Mono, monospace")
          .style("font-size", "12px")
          .text("Glissement annuel");

        chart.append("text")
          .attr("x", innerWidth)
          .attr("y", -14)
          .attr("text-anchor", "end")
          .attr("fill", chartInk)
          .style("font-family", "IBM Plex Mono, monospace")
          .style("font-size", "12px")
          .text(metric.axisTitle);

        const zeroY = yYoY(0);
        chart.append("g")
          .selectAll("rect")
          .data(points)
          .join("rect")
          .attr("x", (_, index) => xScale(index) - barWidth / 2)
          .attr("y", (point) => point[metric.yoyKey] >= 0 ? yYoY(point[metric.yoyKey]) : zeroY)
          .attr("width", barWidth)
          .attr("height", (point) => Math.abs(yYoY(point[metric.yoyKey]) - zeroY))
          .attr("fill", (point) => point[metric.yoyKey] >= 0 ? chartPositive : chartNegative);

        const line = d3.line()
          .x((point, index) => xScale(index))
          .y((point) => yLevel(point[metric.levelKey]))
          .curve(d3.curveCatmullRom.alpha(0.6));

        chart.append("path")
          .datum(points)
          .attr("d", line)
          .attr("fill", "none")
          .attr("stroke", chartInk)
          .attr("stroke-width", 3.4)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round");

        chart.append("g")
          .selectAll("circle")
          .data(points)
          .join("circle")
          .attr("cx", (_, index) => xScale(index))
          .attr("cy", (point) => yLevel(point[metric.levelKey]))
          .attr("r", (_, index) => index === points.length - 1 ? 5.2 : 3)
          .attr("fill", (_, index) => index === points.length - 1 ? "#ffffff" : chartInk)
          .attr("stroke", chartInk)
          .attr("stroke-width", (_, index) => index === points.length - 1 ? 2.8 : 0);

        chart.append("line")
          .attr("x1", 0)
          .attr("x2", innerWidth)
          .attr("y1", innerHeight)
          .attr("y2", innerHeight)
          .attr("stroke", chartGridStrong);

        const tickIndices = employmentTickIndices(points.length);
        const xAxis = chart.append("g").attr("transform", `translate(0,${innerHeight})`);
        tickIndices.forEach((index) => {
          const x = xScale(index);
          xAxis.append("line")
            .attr("x1", x)
            .attr("x2", x)
            .attr("y1", 0)
            .attr("y2", 7)
            .attr("stroke", chartGridStrong);
          xAxis.append("text")
            .attr("x", x)
            .attr("y", 26)
            .attr("fill", chartMuted)
            .style("font-family", "IBM Plex Mono, monospace")
            .style("font-size", "12px")
            .attr("transform", `rotate(-38 ${x} 26)`)
            .attr("text-anchor", "end")
            .text(quarterLabel(points[index].date));
        });

        chart.append("text")
          .attr("x", innerWidth / 2)
          .attr("y", innerHeight + 60)
          .attr("text-anchor", "middle")
          .attr("fill", chartText)
          .style("font-family", "IBM Plex Mono, monospace")
          .style("font-size", "12px")
          .text("Trimestre");

        const tooltip = document.getElementById(config.tooltipId);
        const tooltipOverline = tooltip.querySelector(".tooltip-overline");
        const tooltipBody = tooltip.querySelector(".tooltip-body");
        const chartShell = tooltip.parentElement;

        function hideChartTooltip() {
          tooltip.classList.remove("is-visible");
          tooltip.setAttribute("aria-hidden", "true");
        }

        function showChartTooltip(event, point) {
          const shellBounds = chartShell.getBoundingClientRect();
          tooltipOverline.textContent = quarterLabel(point.date);
          textLines(tooltipBody, [`Glissement annuel : ${formatPercent(point[metric.yoyKey])}`, `Niveau : ${metric.tooltipLevel(point[metric.levelKey])}`]);
          tooltip.classList.add("is-visible");
          tooltip.setAttribute("aria-hidden", "false");

          const margin = 12;
          const cursorGap = 14;
          const tooltipBounds = tooltip.getBoundingClientRect();
          const cursorX = event.clientX - shellBounds.left;
          const cursorY = event.clientY - shellBounds.top;
          let x = cursorX + cursorGap;
          let y = cursorY - tooltipBounds.height - cursorGap;

          if (x + tooltipBounds.width > shellBounds.width - margin) {
            x = cursorX - tooltipBounds.width - cursorGap;
          }
          if (y < margin) {
            y = cursorY + cursorGap;
          }

          x = Math.min(Math.max(margin, x), shellBounds.width - tooltipBounds.width - margin);
          y = Math.min(Math.max(margin, y), shellBounds.height - tooltipBounds.height - margin);
          tooltip.style.left = `${x}px`;
          tooltip.style.top = `${y}px`;
        }

        chart.append("g")
          .selectAll("rect")
          .data(points)
          .join("rect")
          .attr("x", (_, index) => xScale(index) - Math.max(barWidth, 12))
          .attr("y", 0)
          .attr("width", Math.max(barWidth * 2, 18))
          .attr("height", innerHeight)
          .attr("fill", "rgba(255,255,255,0.001)")
          .attr("pointer-events", "all")
          .style("cursor", "pointer")
          .on("mouseenter", (event, point) => showChartTooltip(event, point))
          .on("mousemove", (event, point) => showChartTooltip(event, point))
          .on("mouseleave", hideChartTooltip);

        root.on("mouseleave", hideChartTooltip);
      }

      function renderRegionalEmploymentBlock(config) {
        const scope = getSectorRegionalScopeData();
        const metric = employmentMetricConfig(config.metricKey);
        const regionalData = DATA.modules.sector.regional;
        renderEmploymentSectorRanking(config, scope, metric);
        if (!scope || !scope.seriesOptions || !scope.seriesOptions.length) return;
        if (!state[config.seriesStateKey] || !scope.series[state[config.seriesStateKey]]) {
          state[config.seriesStateKey] = scope.defaultSeriesKey;
        }
        const selectedSeries = scope.series[state[config.seriesStateKey]] || scope.series[scope.defaultSeriesKey];
        if (!selectedSeries || !selectedSeries.points || !selectedSeries.points.length) return;

        const points = selectedSeries.points.filter((point) => point.date >= (regionalData.displayStartDate || "2014-01-01"));
        const lastPoint = points[points.length - 1];

        renderEmploymentSeriesPicker(config.seriesControlId, scope, config.seriesStateKey, renderSectorModule);

        const periodLabel = quarterLabel(lastPoint.date);
        document.getElementById(config.chartTitleId).textContent = `${metric.heading} ${periodLabel} : niveau et évolution en ${scopeLabel()}.`;
        document.getElementById(config.legendLineId).textContent = metric.legendLine;
        document.getElementById(config.scopeId).textContent = selectedSeries.label;
        document.getElementById(config.periodId).textContent = periodLabel;
        document.getElementById(config.periodId).dateTime = lastPoint.date;
        document.getElementById(config.currentLevelId).textContent = metric.summaryLevel(lastPoint[metric.levelKey]);
        renderEmploymentTrend(config.currentYoYId, lastPoint[metric.yoyKey]);
        renderEmploymentTrend(config.currentQoQId, lastPoint[metric.qoqKey]);
        document.getElementById(config.interpretationId).textContent = employmentInterpretation(lastPoint, metric);

        drawEmploymentChart(config, points, metric);
      }

      function renderEmploymentSectorRanking(config, scope, metric) {
        const rankingPeriod = document.getElementById(config.rankingMetaId);
        rankingPeriod.textContent = scope?.latestDate ? quarterLabel(scope.latestDate) : "—";
        rankingPeriod.dateTime = scope?.latestDate || "";
        renderSectorRanking({
          containerId: config.rankingTableId,
          rows: employmentLatestSectorRows(scope, metric).slice(0, 5),
          valueLabel: metric.key === "effectifs_cvs" ? "Effectifs" : "Masse",
          formatValue: (value) => sectorTreemapMetricFormatter(metric.key, value),
          emptyMessage: "Aucune donnée sectorielle sur ce trimestre.",
          onSelect: (key) => {
            state[config.seriesStateKey] = key;
            renderSectorModule();
            document.getElementById(config.seriesControlId).querySelector(".employment-sector-trigger").focus({ preventScroll: true });
          },
        });
      }

      function sectorTreemapMetricFormatter(metricKey, value) {
        return metricKey === "masse_cvs" ? formatCurrency(value) : formatCount(value);
      }

      function employmentLatestSectorRows(scope, metric) {
        if (!scope || !scope.seriesOptions || !scope.series) return [];
        return scope.seriesOptions
          .filter((option) => option.key !== scope.defaultSeriesKey && option.key !== "population-entiere")
          .map((option) => {
            const series = scope.series[option.key];
            const point = series?.points?.at(-1);
            if (!point || point.date !== scope.latestDate || !Number.isFinite(point[metric.levelKey]) || point[metric.levelKey] <= 0) return null;
            return {
              key: option.key,
              label: option.label,
              date: point.date,
              value: point[metric.levelKey],
              yoy: point[metric.yoyKey],
            };
          })
          .filter(Boolean)
          .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, "fr"));
      }

      function sectorTreemapColorScale(rows) {
        const yoyValues = rows.map((row) => row.yoy).filter((value) => value != null);
        const maxAbs = Math.max(1.5, d3.max(yoyValues.map((value) => Math.abs(value))) || 1.5);
        return d3.scaleLinear()
          .domain([-maxAbs, 0, maxAbs])
          .range([
            paletteToken("employment-treemap-negative", "#D94B65"),
            paletteToken("employment-treemap-neutral", "#F3E7D4"),
            paletteToken("employment-treemap-positive", "#0EA5A8"),
          ])
          .clamp(true);
      }

      function sectorTreemapTextFill(yoy) {
        return "rgb(7, 23, 47)";
      }

      function sectorTreemapTrimLabel(label) {
        return String(label || "")
          .replace(/^[A-Z]{1,3}[a-z]?(?:-[A-Z]{1,3}[a-z]?)*\s+/, "")
          .replace(/\s*\[[^\]]+\]/g, "")
          .trim();
      }

      function sectorTreemapNaceCode(label, key) {
        const labelMatch = String(label || "").match(/^([A-Z]{1,3}[a-z]?(?:-[A-Z]{1,3}[a-z]?)*)\s+/);
        const keyMatch = String(key || "").match(/^([a-z]{1,3}(?:-[a-z]{1,3})*)-/i);
        const rawCode = labelMatch ? labelMatch[1] : (keyMatch ? keyMatch[1] : "");
        return rawCode.replace(/-/g, " ").toUpperCase();
      }

      function sectorTreemapLayoutRows(rows) {
        const total = d3.sum(rows, (row) => row.value);
        // Reserve roughly a 50 x 50 px tile at the current viewBox size. Only
        // the very smallest sectors are lifted, while displayed values remain exact.
        const minimumLayoutValue = total * 0.005;
        return rows.map((row) => ({
          ...row,
          naceCode: sectorTreemapNaceCode(row.label, row.key),
          layoutValue: Math.max(row.value, minimumLayoutValue),
        }));
      }

      function drawSectorTreemapCode(tile, code, tileWidth, tileHeight, fill) {
        if (!code || tileWidth < 20 || tileHeight < 18) return;
        const tokens = code.split(" ");
        const horizontalWidth = code.length * 6.5;
        const canUseHorizontal = horizontalWidth <= tileWidth - 14;
        const canStack = tokens.length > 1
          && Math.max(...tokens.map((token) => token.length)) * 6.5 <= tileWidth - 12
          && tokens.length * 13 <= tileHeight - 10;
        const text = tile.append("text")
          .attr("x", Math.max(6, Math.min(10, tileWidth * 0.16)))
          .attr("y", Math.max(14, Math.min(18, tileHeight * 0.34)))
          .attr("fill", fill)
          .attr("class", "employment-treemap-code");

        if (!canUseHorizontal && canStack) {
          text.attr("y", Math.max(14, (tileHeight - (tokens.length - 1) * 13) / 2));
          tokens.forEach((token, index) => {
            text.append("tspan")
              .attr("x", Math.max(6, Math.min(10, tileWidth * 0.16)))
              .attr("dy", index === 0 ? 0 : 13)
              .text(token);
          });
          return;
        }
        text.text(code);
      }

      function renderSectorTreemap() {
        const scope = getSectorRegionalScopeData();
        const metricKey = state.sectorTreemapMetric || "effectifs_cvs";
        const metric = employmentMetricConfig(metricKey);
        const metrics = DATA.modules.sector.regional.metrics || [];
        const shell = document.getElementById("employmentTreemapShell");
        const meta = document.getElementById("employmentTreemapMeta");
        const legend = document.getElementById("employmentTreemapLegend");
        const tooltip = document.getElementById("employmentTreemapTooltip");
        const svg = d3.select("#employmentTreemapSvg");
        const rows = employmentLatestSectorRows(scope, metric);

        renderMetricSwitch("employmentTreemapMetricSwitch", metrics, metricKey, (key) => {
          state.sectorTreemapMetric = key;
          renderSectorTreemap();
        });

        svg.selectAll("*").remove();
        if (!rows.length) {
          meta.textContent = `${scopeLabel()} / aucun secteur exploitable`;
          legend.innerHTML = "";
          shell.classList.add("is-empty");
          renderEmptyState(shell, "Composition indisponible", "Les séries sectorielles ne contiennent pas de niveau exploitable pour ce territoire.");
          return;
        }
        shell.classList.remove("is-empty");
        if (!shell.querySelector("#employmentTreemapSvg")) {
          shell.innerHTML = `
            <svg id="employmentTreemapSvg" viewBox="0 0 980 620" role="img" aria-labelledby="employmentTreemapTitleSvg employmentTreemapDescSvg">
              <title id="employmentTreemapTitleSvg">Carte proportionnelle des secteurs des effectifs et de la masse salariale</title>
              <desc id="employmentTreemapDescSvg">La surface représente le niveau et la couleur représente le glissement annuel.</desc>
            </svg>
            <div id="employmentTreemapTooltip" class="employment-tooltip employment-treemap-tooltip" aria-hidden="true">
              <div class="tooltip-overline"></div>
              <div class="tooltip-body"></div>
            </div>
          `;
        }

        const rootSvg = d3.select("#employmentTreemapSvg");
        rootSvg.selectAll("*").remove();
        const width = 980;
        const height = 620;
        const padding = 18;
        const color = sectorTreemapColorScale(rows);
        const latestDate = rows[0].date;
        const layoutRows = sectorTreemapLayoutRows(rows);

        meta.textContent = `${scopeLabel()} / ${quarterLabel(latestDate)}`;
        legend.innerHTML = `
          <span class="legend-chip"><i class="employment-treemap-swatch is-negative"></i>Repli annuel</span>
          <span class="legend-chip"><i class="employment-treemap-swatch is-neutral"></i>Quasi stable</span>
          <span class="legend-chip"><i class="employment-treemap-swatch is-positive"></i>Hausse annuelle</span>
        `;

        const root = d3.hierarchy({ children: layoutRows })
          .sum((row) => row.layoutValue)
          .sort((left, right) => right.value - left.value);
        d3.treemap()
          .tile(d3.treemapSquarify.ratio(1.22))
          .size([width - padding * 2, height - padding * 2])
          .paddingInner(5)
          .paddingOuter(0)
          .round(true)(root);

        const defs = rootSvg.append("defs");
        const glow = defs.append("filter")
          .attr("id", "employmentTreemapGlow")
          .attr("x", "-16%")
          .attr("y", "-16%")
          .attr("width", "132%")
          .attr("height", "132%");
        glow.append("feDropShadow")
          .attr("dx", 0)
          .attr("dy", 16)
          .attr("stdDeviation", 12)
          .attr("flood-color", "rgba(11,29,58,0.24)");

        const chart = rootSvg.append("g").attr("transform", `translate(${padding},${padding})`);
        const leaves = chart.selectAll("g")
          .data(root.leaves())
          .join("g")
          .attr("class", "employment-treemap-tile")
          .attr("transform", (leaf) => `translate(${leaf.x0},${leaf.y0})`);

        leaves.append("rect")
          .attr("width", (leaf) => Math.max(0, leaf.x1 - leaf.x0))
          .attr("height", (leaf) => Math.max(0, leaf.y1 - leaf.y0))
          .attr("rx", 10)
          .attr("fill", (leaf) => color(leaf.data.yoy ?? 0))
          .attr("stroke", "rgba(255,255,255,0.82)")
          .attr("stroke-width", 1.4);

        leaves.each(function(leaf) {
          const tile = d3.select(this);
          const tileWidth = leaf.x1 - leaf.x0;
          const tileHeight = leaf.y1 - leaf.y0;
          const area = tileWidth * tileHeight;
          const fill = sectorTreemapTextFill(leaf.data.yoy);
          const showFullLabel = tileWidth >= 112 && tileHeight >= 58 && area >= 9800;
          if (!showFullLabel) {
            drawSectorTreemapCode(tile, leaf.data.naceCode, tileWidth, tileHeight, fill);
            return;
          }
          const label = sectorTreemapTrimLabel(leaf.data.label);
          const maxChars = Math.max(8, Math.floor((tileWidth - 42) / 7.7));
          const displayLabel = label.length > maxChars ? `${label.slice(0, Math.max(5, maxChars - 3))}...` : label;
          tile.append("text")
            .attr("x", 14)
            .attr("y", 24)
            .attr("fill", fill)
            .attr("class", "employment-treemap-label")
            .text(displayLabel);
          if (tileHeight >= 92 && tileWidth >= 150) {
            tile.append("text")
              .attr("x", 14)
              .attr("y", 50)
              .attr("fill", fill)
              .attr("class", "employment-treemap-value")
              .text(sectorTreemapMetricFormatter(metricKey, leaf.data.value));
            tile.append("text")
              .attr("x", 14)
              .attr("y", 73)
              .attr("fill", fill)
              .attr("class", "employment-treemap-yoy")
              .text(`GA ${formatPercent(leaf.data.yoy)}`);
          }
        });

        const tooltipNode = document.getElementById("employmentTreemapTooltip");
        const tooltipOverline = tooltipNode.querySelector(".tooltip-overline");
        const tooltipBody = tooltipNode.querySelector(".tooltip-body");

        function hideTreemapTooltip() {
          tooltipNode.classList.remove("is-visible");
          tooltipNode.setAttribute("aria-hidden", "true");
        }

        function showTreemapTooltip(event, row) {
          const shellBounds = shell.getBoundingClientRect();
          tooltipOverline.textContent = sectorTreemapTrimLabel(row.label);
          textLines(tooltipBody, [`${metric.label} : ${sectorTreemapMetricFormatter(metricKey, row.value)}`, `Glissement annuel : ${formatPercent(row.yoy)}`, quarterLabel(row.date)]);
          tooltipNode.classList.add("is-visible");
          tooltipNode.setAttribute("aria-hidden", "false");

          const gap = 16;
          const margin = 12;
          const bounds = tooltipNode.getBoundingClientRect();
          let x = event.clientX - shellBounds.left + gap;
          let y = event.clientY - shellBounds.top - bounds.height - gap;
          if (x + bounds.width > shellBounds.width - margin) x = event.clientX - shellBounds.left - bounds.width - gap;
          if (y < margin) y = event.clientY - shellBounds.top + gap;
          tooltipNode.style.left = `${Math.min(Math.max(margin, x), shellBounds.width - bounds.width - margin)}px`;
          tooltipNode.style.top = `${Math.min(Math.max(margin, y), shellBounds.height - bounds.height - margin)}px`;
        }

        leaves
          .on("mouseenter", function(event, leaf) {
            d3.select(this).raise().classed("is-hovered", true);
            showTreemapTooltip(event, leaf.data);
          })
          .on("mousemove", (event, leaf) => showTreemapTooltip(event, leaf.data))
          .on("mouseleave", function() {
            d3.select(this).classed("is-hovered", false);
            hideTreemapTooltip();
          });
        rootSvg.on("mouseleave", hideTreemapTooltip);

        if (!REDUCED_MOTION) {
          gsap.fromTo(
            leaves.nodes(),
            { opacity: 0, scale: 0.94, transformOrigin: "50% 50%" },
            { opacity: 1, scale: 1, duration: 0.58, stagger: 0.015, ease: "power3.out" },
          );
        }
      }

      function departmentMetricValue(department, sectorKey, metricKey) {
        const series = department.values[sectorKey];
        return series ? series[metricKey] : null;
      }

      function departmentMetricYoY(department, sectorKey, metricKey) {
        const series = department.values[sectorKey];
        if (!series) return null;
        return metricKey === "effectifs_cvs" ? series.effectifs_yoy : series.masse_yoy;
      }

      function departmentMetricFormatter(metricKey, value) {
        return metricKey === "masse_cvs" ? formatCurrency(value) : formatCount(value);
      }

      function renderSectorDepartmentModule() {
        const departmentModule = DATA.modules.sector.departmental;
        const mapMeta = document.getElementById("employmentDeptMapMeta");
        const rankingMeta = document.getElementById("employmentDeptRankingMeta");
        const mapShell = document.getElementById("employmentDeptMapShell");
        const legend = document.getElementById("employmentDeptLegend");
        const ranking = document.getElementById("employmentDeptRanking");
        const mapGrid = document.querySelector("#module-sector .employment-map-grid");
        const featuresByRegion = getSectorDepartmentFeaturesByRegion();

        renderMetricSwitch("employmentDeptMetricSwitch", departmentModule.metrics, state.sectorDepartmentMetric, (key) => {
          state.sectorDepartmentMetric = key;
          renderSectorModule();
        });

        if (!state.sectorDepartmentSectorKey) {
          state.sectorDepartmentSectorKey = departmentModule.defaultSectorKey;
        }
        renderEmploymentSectorPicker(
          "employmentDeptSectorPicker",
          departmentModule.sectorOptions,
          "sectorDepartmentSectorKey",
          renderSectorModule,
          EMPLOYMENT_GRAND_SECTOR_GROUPS,
        );

        if (state.phase === "national") {
          mapMeta.textContent = "Choisir une région pour ouvrir la maille départementale";
          rankingMeta.textContent = "Lecture régionale requise";
          mapShell.innerHTML = `<div class="empty-state"><strong>Choisir une région</strong><p>La carte départementale s'active après sélection d'un territoire dans la barre des régions.</p></div>`;
          legend.innerHTML = "";
          ranking.innerHTML = `<div class="empty-state"><strong>Classement indisponible</strong><p>Le classement départemental n'est pas affiché à l'échelle France entière.</p></div>`;
          syncDepartmentRankingHeight(mapGrid);
          return;
        }

        const regionScope = (departmentModule.regions[state.selectedRegion] && departmentModule.regions[state.selectedRegion].departments) || [];
        const selectedSector = departmentModule.sectorOptions.find((option) => option.key === state.sectorDepartmentSectorKey) || departmentModule.sectorOptions[0];
        if (selectedSector && selectedSector.key !== state.sectorDepartmentSectorKey) {
          state.sectorDepartmentSectorKey = selectedSector.key;
        }
        const selectedMetric = departmentModule.metrics.find((item) => item.key === state.sectorDepartmentMetric) || departmentModule.metrics[0];
        mapMeta.textContent = `${scopeLabel()} / ${selectedSector.label} / ${quarterLabel(departmentModule.latestDate)}`;
        rankingMeta.textContent = `${selectedMetric.label} / niveau actuel + glissement annuel`;

        if (!regionScope.length) {
          mapShell.innerHTML = `<div class="empty-state"><strong>Données indisponibles</strong><p>Le fichier départemental ne documente pas ce territoire pour le dernier trimestre retenu.</p></div>`;
          legend.innerHTML = "";
          ranking.innerHTML = `<div class="empty-state"><strong>Aucun classement</strong><p>Les départements de cette région ne sont pas présents dans la source départementale fournie.</p></div>`;
          syncDepartmentRankingHeight(mapGrid);
          return;
        }

        const values = regionScope
          .map((department) => departmentMetricValue(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric))
          .filter((value) => value != null);
        const features = featuresByRegion.get(state.selectedRegion) || [];
        const scale = values.length
          ? buildScale(
              d3.extent(values),
              [
                paletteToken("chart-employment-dept-low", "#F7C96B"),
                paletteToken("chart-employment-dept-high", "#E86E2A"),
              ],
            )
          : () => paletteToken("chart-employment-dept-low", "#F7C96B");

        mapShell.innerHTML = `<svg id="employmentDeptMapSvg" viewBox="0 0 900 620"></svg>`;
        const svg = d3.select("#employmentDeptMapSvg");
        const departmentsByCode = new Map(regionScope.map((department) => [department.code, department]));
        const projection = d3.geoMercator().fitExtent([[32, 32], [868, 588]], { type: "FeatureCollection", features });
        const path = d3.geoPath(projection);
        svg.append("g")
          .selectAll("path")
          .data(features)
          .join("path")
          .attr("class", (feature) => `path-department${departmentsByCode.has(feature.properties.code) ? "" : " is-unavailable"}`)
          .attr("d", path)
          .attr("fill", (feature) => {
            const department = departmentsByCode.get(feature.properties.code);
            const value = department ? departmentMetricValue(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric) : null;
            return value != null ? scale(value) : paletteToken("map-empty", "rgba(255,255,255,0.05)");
          })
          .on("mouseenter", (event, feature) => {
            const department = departmentsByCode.get(feature.properties.code);
            const value = department ? departmentMetricValue(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric) : null;
            showTooltip(event, department ? department.name : feature.properties.nom, departmentMetricFormatter(state.sectorDepartmentMetric, value));
          })
          .on("mousemove", (event, feature) => {
            const department = departmentsByCode.get(feature.properties.code);
            const value = department ? departmentMetricValue(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric) : null;
            showTooltip(event, department ? department.name : feature.properties.nom, departmentMetricFormatter(state.sectorDepartmentMetric, value));
          })
          .on("mouseleave", hideTooltip);

        const domain = d3.extent(values);
        rangeLegend(legend, departmentMetricFormatter(state.sectorDepartmentMetric, domain[0]), departmentMetricFormatter(state.sectorDepartmentMetric, domain[1]));

        ranking.innerHTML = "";
        regionScope
          .map((department) => ({
            ...department,
            metricValue: departmentMetricValue(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric),
            yoyValue: departmentMetricYoY(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric),
          }))
          .filter((department) => department.metricValue != null)
          .sort((left, right) => right.metricValue - left.metricValue)
          .forEach((department) => {
            const article = document.createElement("article");
            article.className = "ranking-item";
            article.replaceChildren(...rankingArticle(department.name, departmentMetricFormatter(state.sectorDepartmentMetric, department.metricValue), scopeLabel(), `Glissement annuel : ${formatPercent(department.yoyValue)}`).childNodes);
            ranking.appendChild(article);
          });
        syncDepartmentRankingHeight(mapGrid);
      }

      function renderSectorModule() {
        const regionalData = DATA.modules.sector.regional;
        const departmentData = DATA.modules.sector.departmental;
        const subtitle = document.getElementById("sectorSubtitle");

        const regionalScope = state.phase === "national"
          ? regionalData.national
          : regionalData.regions[state.selectedRegion];
        subtitle.textContent = state.phase === "national"
          ? `France entière / conjoncture de l'emploi / séries régionales 2014-2025 + zoom départemental après sélection d'une région`
          : `Suivez l’évolution de l’emploi privé en ${scopeLabel()}.`;

        renderRegionalEmploymentBlock({
          metricKey: "effectifs_cvs",
          seriesStateKey: "sectorEffectifsSeriesKey",
          chartTitleId: "employmentEffectifsChartTitle",
          seriesControlId: "employmentEffectifsSeriesPicker",
          chartSvgId: "employmentEffectifsChartSvg",
          tooltipId: "employmentEffectifsTooltip",
          legendLineId: "employmentEffectifsLegendLine",
          scopeId: "employmentEffectifsScope",
          periodId: "employmentEffectifsPeriod",
          currentLevelId: "employmentEffectifsCurrentLevel",
          currentYoYId: "employmentEffectifsCurrentYoY",
          currentQoQId: "employmentEffectifsCurrentQoQ",
          interpretationId: "employmentEffectifsInterpretation",
          rankingMetaId: "employmentEffectifsTopSectorsMeta",
          rankingTableId: "employmentEffectifsTopSectorsTable",
        });

        renderRegionalEmploymentBlock({
          metricKey: "masse_cvs",
          seriesStateKey: "sectorPayrollSeriesKey",
          chartTitleId: "employmentPayrollChartTitle",
          seriesControlId: "employmentPayrollSeriesPicker",
          chartSvgId: "employmentPayrollChartSvg",
          tooltipId: "employmentPayrollTooltip",
          legendLineId: "employmentPayrollLegendLine",
          scopeId: "employmentPayrollScope",
          periodId: "employmentPayrollPeriod",
          currentLevelId: "employmentPayrollCurrentLevel",
          currentYoYId: "employmentPayrollCurrentYoY",
          currentQoQId: "employmentPayrollCurrentQoQ",
          interpretationId: "employmentPayrollInterpretation",
          rankingMetaId: "employmentPayrollTopSectorsMeta",
          rankingTableId: "employmentPayrollTopSectorsTable",
        });

        renderSectorTreemap();
        renderSectorDepartmentModule();
        renderAutoModule();
      }
