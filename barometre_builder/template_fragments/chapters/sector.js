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
        const axisDecimals = isHeadcount ? 1 : 0;
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
          focusPeakResolver: (points, mode) => {
            let selected = null;
            points.forEach((point) => {
              const value = point ? point[isHeadcount ? "effectifs_yoy" : "masse_yoy"] : null;
              if (value == null) return;
              if (!selected) {
                selected = point;
                return;
              }
              const selectedValue = selected[isHeadcount ? "effectifs_yoy" : "masse_yoy"];
              if ((mode === "min" && value < selectedValue) || (mode !== "min" && value > selectedValue)) {
                selected = point;
              }
            });
            return selected;
          },
        };
      }

      function employmentFocusBlueprint() {
        return [
          {
            key: "crash",
            button: "2020 / rupture",
            startDate: "2020-01-01",
            endDate: "2020-12-31",
          },
          {
            key: "rebound",
            button: "2021-2022 / rebond",
            startDate: "2021-01-01",
            endDate: "2022-12-31",
          },
          {
            key: "plateau",
            button: "2024-2025 / plateau",
            startDate: "2024-01-01",
            endDate: "2025-12-31",
          },
        ];
      }

      function findDateIndex(points, predicate) {
        for (let index = 0; index < points.length; index += 1) {
          if (predicate(points[index], index)) return index;
        }
        return -1;
      }

      function findLastDateIndex(points, predicate) {
        for (let index = points.length - 1; index >= 0; index -= 1) {
          if (predicate(points[index], index)) return index;
        }
        return -1;
      }

      function buildEmploymentFocuses(points, metric) {
        return employmentFocusBlueprint().map((item) => {
          let startIndex = findDateIndex(points, (point) => point.date >= item.startDate);
          let endIndex = findLastDateIndex(points, (point) => point.date <= item.endDate);
          if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
            endIndex = points.length - 1;
            startIndex = Math.max(0, endIndex - 7);
          }
          const focusPoints = points.slice(startIndex, endIndex + 1);
          const peakMode = item.key === "crash" ? "min" : "max";
          let levelPoint = focusPoints[focusPoints.length - 1] || null;
          focusPoints.forEach((point) => {
            if (!levelPoint || (point[metric.levelKey] || 0) > (levelPoint[metric.levelKey] || 0)) {
              levelPoint = point;
            }
          });
          return {
            ...item,
            peakMode,
            startIndex,
            endIndex,
            points: focusPoints,
            peakPoint: metric.focusPeakResolver(focusPoints, peakMode),
            levelPoint,
          };
        });
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

      function drawEmploymentAnnotation(group, x, y, label, detail, options = {}) {
        const dx = options.dx ?? 24;
        const dy = options.dy ?? -54;
        const boxWidth = options.width ?? 166;
        const textAnchor = options.anchor ?? "start";
        const ink = paletteToken("employment-chart-text", "#16212c");
        const muted = paletteToken("employment-chart-muted", "#5b6773");
        const gridStrong = paletteToken("employment-chart-grid-strong", "rgba(22,33,44,0.24)");
        const originX = x + dx;
        const originY = y + dy;

        group.append("line")
          .attr("x1", x)
          .attr("y1", y)
          .attr("x2", originX)
          .attr("y2", originY + 16)
          .attr("stroke", gridStrong)
          .attr("stroke-width", 1.2);

        const boxX = textAnchor === "end" ? originX - boxWidth : originX;
        const box = group.append("g").attr("transform", `translate(${boxX},${originY})`);
        box.append("rect")
          .attr("width", boxWidth)
          .attr("height", 54)
          .attr("rx", 14)
          .attr("fill", "rgba(255,255,255,0.94)")
          .attr("stroke", "rgba(22,33,44,0.08)");
        box.append("text")
          .attr("x", 12)
          .attr("y", 18)
          .attr("fill", ink)
          .style("font-family", "IBM Plex Mono, monospace")
          .style("font-size", "11px")
          .style("letter-spacing", "0.08em")
          .text(label);
        box.append("text")
          .attr("x", 12)
          .attr("y", 36)
          .attr("fill", muted)
          .style("font-family", "Manrope, sans-serif")
          .style("font-size", "12px")
          .text(detail);
      }

      function renderEmploymentSeriesSelect(selectId, scope, stateKey, onRender) {
        const select = document.getElementById(selectId);
        select.innerHTML = "";
        scope.seriesOptions.forEach((option) => {
          const element = document.createElement("option");
          element.value = option.key;
          element.textContent = option.label;
          element.selected = option.key === state[stateKey];
          select.appendChild(element);
        });
        if (!select.dataset.bound) {
          select.addEventListener("change", (event) => {
            state[stateKey] = event.target.value;
            onRender();
          });
          select.dataset.bound = "true";
        }
      }

      function renderEmploymentFocusSwitch(containerId, focuses, activeKey, stateKey, onRender) {
        const container = document.getElementById(containerId);
        container.innerHTML = "";
        focuses.forEach((focus) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `employment-focus-button${focus.key === activeKey ? " is-active" : ""}`;
          button.textContent = focus.button;
          button.addEventListener("click", () => {
            state[stateKey] = focus.key;
            onRender();
          });
          container.appendChild(button);
        });
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

      function drawEmploymentChart(config, points, metric, focuses, activeFocus) {
        const svg = d3.select(`#${config.chartSvgId}`);
        svg.selectAll("*").remove();
        const width = 980;
        const height = 560;
        const margin = { top: 38, right: 84, bottom: 78, left: 76 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const root = svg.attr("viewBox", `0 0 ${width} ${height}`);
        const prefix = config.chartSvgId;
        const chartInk = paletteToken("employment-chart-ink", "#1a4e93");
        const chartInkSoft = paletteToken("employment-chart-ink-soft", "rgba(26,78,147,0.16)");
        const chartText = paletteToken("employment-chart-text", "#16212c");
        const chartMuted = paletteToken("employment-chart-muted", "#5b6773");
        const chartGrid = paletteToken("employment-chart-grid", "rgba(22,33,44,0.07)");
        const chartGridStrong = paletteToken("employment-chart-grid-strong", "rgba(22,33,44,0.18)");

        const defs = root.append("defs");
        const positiveFillId = `${prefix}-positive-fill`;
        const negativeFillId = `${prefix}-negative-fill`;
        const focusFillId = `${prefix}-focus-fill`;
        const glowId = `${prefix}-line-glow`;
        const positiveGradient = defs.append("linearGradient").attr("id", positiveFillId).attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
        positiveGradient.append("stop").attr("offset", "0%").attr("stop-color", paletteToken("employment-chart-positive-a", "rgba(38,193,160,0.95)"));
        positiveGradient.append("stop").attr("offset", "100%").attr("stop-color", paletteToken("employment-chart-positive-b", "rgba(38,193,160,0.54)"));
        const negativeGradient = defs.append("linearGradient").attr("id", negativeFillId).attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
        negativeGradient.append("stop").attr("offset", "0%").attr("stop-color", paletteToken("employment-chart-negative-a", "rgba(228,134,118,0.95)"));
        negativeGradient.append("stop").attr("offset", "100%").attr("stop-color", paletteToken("employment-chart-negative-b", "rgba(228,134,118,0.50)"));
        const focusGradient = defs.append("linearGradient").attr("id", focusFillId).attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
        focusGradient.append("stop").attr("offset", "0%").attr("stop-color", paletteToken("employment-chart-focus-a", "rgba(26,78,147,0.13)"));
        focusGradient.append("stop").attr("offset", "100%").attr("stop-color", paletteToken("employment-chart-focus-b", "rgba(26,78,147,0)"));
        const glow = defs.append("filter").attr("id", glowId).attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
        glow.append("feGaussianBlur").attr("stdDeviation", 3.2).attr("result", "blur");
        const merge = glow.append("feMerge");
        merge.append("feMergeNode").attr("in", "blur");
        merge.append("feMergeNode").attr("in", "SourceGraphic");

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

        const focusStartX = xScale(activeFocus.startIndex) - barWidth;
        const focusEndX = xScale(activeFocus.endIndex) + barWidth;
        chart.append("rect")
          .attr("x", focusStartX)
          .attr("y", 0)
          .attr("width", Math.max(88, focusEndX - focusStartX))
          .attr("height", innerHeight)
          .attr("rx", 20)
          .attr("fill", `url(#${focusFillId})`);

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
          .attr("rx", 6)
          .attr("fill", (point) => point[metric.yoyKey] >= 0 ? `url(#${positiveFillId})` : `url(#${negativeFillId})`);

        const line = d3.line()
          .x((point, index) => xScale(index))
          .y((point) => yLevel(point[metric.levelKey]))
          .curve(d3.curveCatmullRom.alpha(0.6));

        chart.append("path")
          .datum(points)
          .attr("d", line)
          .attr("fill", "none")
          .attr("stroke", chartInkSoft)
          .attr("stroke-width", 10)
          .attr("filter", `url(#${glowId})`);

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

        const crashFocus = focuses.find((focus) => focus.key === "crash");
        const reboundFocus = focuses.find((focus) => focus.key === "rebound");
        const plateauFocus = focuses.find((focus) => focus.key === "plateau");
        const annotationLayer = chart.append("g");
        if (crashFocus && crashFocus.peakPoint) {
          const pointIndex = points.findIndex((point) => point.date === crashFocus.peakPoint.date);
          drawEmploymentAnnotation(
            annotationLayer,
            xScale(pointIndex),
            yYoY(crashFocus.peakPoint[metric.yoyKey]),
            "RUPTURE",
            `${quarterLabel(crashFocus.peakPoint.date)} / ${formatPercent(crashFocus.peakPoint[metric.yoyKey])}`,
            { dx: -192, dy: 12, width: 180, anchor: "end" },
          );
        }
        if (reboundFocus && reboundFocus.peakPoint) {
          const pointIndex = points.findIndex((point) => point.date === reboundFocus.peakPoint.date);
          drawEmploymentAnnotation(
            annotationLayer,
            xScale(pointIndex),
            yYoY(reboundFocus.peakPoint[metric.yoyKey]),
            "REBOND",
            `${quarterLabel(reboundFocus.peakPoint.date)} / ${formatPercent(reboundFocus.peakPoint[metric.yoyKey])}`,
            { dx: 22, dy: -70, width: 176 },
          );
        }
        if (plateauFocus && plateauFocus.levelPoint) {
          const pointIndex = points.findIndex((point) => point.date === plateauFocus.levelPoint.date);
          drawEmploymentAnnotation(
            annotationLayer,
            xScale(pointIndex),
            yLevel(plateauFocus.levelPoint[metric.levelKey]),
            "PLATEAU",
            `${quarterLabel(plateauFocus.levelPoint.date)} / ${metric.summaryLevel(plateauFocus.levelPoint[metric.levelKey])}`,
            { dx: -196, dy: -74, width: 184, anchor: "end" },
          );
        }

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
          tooltipBody.innerHTML = `Glissement annuel : ${formatPercent(point[metric.yoyKey])}<br>Niveau : ${metric.tooltipLevel(point[metric.levelKey])}`;
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
        if (!scope || !scope.seriesOptions || !scope.seriesOptions.length) return;
        if (!state[config.seriesStateKey] || !scope.series[state[config.seriesStateKey]]) {
          state[config.seriesStateKey] = scope.defaultSeriesKey;
        }
        const selectedSeries = scope.series[state[config.seriesStateKey]] || scope.series[scope.defaultSeriesKey];
        if (!selectedSeries || !selectedSeries.points || !selectedSeries.points.length) return;

        const points = selectedSeries.points.filter((point) => point.date >= (regionalData.displayStartDate || "2014-01-01"));
        const focuses = buildEmploymentFocuses(points, metric);
        const availableFocusKeys = new Set(focuses.map((focus) => focus.key));
        if (!availableFocusKeys.has(state[config.focusStateKey])) {
          state[config.focusStateKey] = "rebound";
        }
        const activeFocus = focuses.find((focus) => focus.key === state[config.focusStateKey]) || focuses[0];
        const lastPoint = points[points.length - 1];

        renderEmploymentSeriesSelect(config.seriesSelectId, scope, config.seriesStateKey, renderSectorModule);
        renderEmploymentFocusSwitch(config.focusSwitchId, focuses, activeFocus.key, config.focusStateKey, renderSectorModule);

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

        drawEmploymentChart(config, points, metric, focuses, activeFocus);
      }

      function sectorTreemapMetricFormatter(metricKey, value) {
        return metricKey === "masse_cvs" ? formatCurrency(value) : formatCount(value);
      }

      function sectorTreemapLatestRows(scope, metric) {
        if (!scope || !scope.seriesOptions || !scope.series) return [];
        return scope.seriesOptions
          .filter((option) => option.key !== scope.defaultSeriesKey && option.key !== "population-entiere")
          .map((option) => {
            const series = scope.series[option.key];
            const point = series && series.points
              ? [...series.points].reverse().find((item) => item && item[metric.levelKey] > 0)
              : null;
            if (!point) return null;
            return {
              key: option.key,
              label: option.label,
              date: point.date,
              value: point[metric.levelKey],
              yoy: point[metric.yoyKey],
            };
          })
          .filter(Boolean)
          .sort((left, right) => right.value - left.value);
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
          .replace(/^[A-Z]{1,3}[a-z]?\s+/, "")
          .replace(/\s*\[[^\]]+\]/g, "")
          .trim();
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
        const rows = sectorTreemapLatestRows(scope, metric);

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
              <title id="employmentTreemapTitleSvg">Treemap sectorielle des effectifs et de la masse salariale</title>
              <desc id="employmentTreemapDescSvg">La surface represente le niveau et la couleur represente le glissement annuel.</desc>
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

        meta.textContent = `${scopeLabel()} / ${quarterLabel(latestDate)} / surface = ${metric.label.toLowerCase()} / couleur = glissement annuel`;
        legend.innerHTML = `
          <span class="legend-chip"><i class="employment-treemap-swatch is-negative"></i>Repli annuel</span>
          <span class="legend-chip"><i class="employment-treemap-swatch is-neutral"></i>Quasi stable</span>
          <span class="legend-chip"><i class="employment-treemap-swatch is-positive"></i>Hausse annuelle</span>
        `;

        const root = d3.hierarchy({ children: rows })
          .sum((row) => row.value)
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
          if (tileWidth < 112 || tileHeight < 58 || area < 9800) return;
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
          tooltipBody.innerHTML = `${metric.label} : ${sectorTreemapMetricFormatter(metricKey, row.value)}<br>Glissement annuel : ${formatPercent(row.yoy)}<br>${quarterLabel(row.date)}`;
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

        const sectorSelect = document.getElementById("employmentDeptSectorSelect");
        if (!sectorSelect.dataset.bound) {
          sectorSelect.addEventListener("change", (event) => {
            state.sectorDepartmentSectorKey = event.target.value;
            renderSectorModule();
          });
          sectorSelect.dataset.bound = "true";
        }
        sectorSelect.innerHTML = "";
        departmentModule.sectorOptions.forEach((option) => {
          const element = document.createElement("option");
          element.value = option.key;
          element.textContent = option.label;
          element.selected = option.key === state.sectorDepartmentSectorKey;
          sectorSelect.appendChild(element);
        });

        if (!state.sectorDepartmentSectorKey) {
          state.sectorDepartmentSectorKey = departmentModule.defaultSectorKey;
          sectorSelect.value = state.sectorDepartmentSectorKey;
        }

        if (state.phase === "national") {
          mapMeta.textContent = "Choisir une région pour ouvrir la maille départementale";
          rankingMeta.textContent = "Lecture régionale requise";
          mapShell.innerHTML = `<div class="empty-state"><strong>Choisir une région</strong><p>La carte départementale s'active après sélection d'un territoire dans la rail des régions.</p></div>`;
          legend.innerHTML = "";
          ranking.innerHTML = `<div class="empty-state"><strong>Classement indisponible</strong><p>Le classement départemental n'est pas affiché à l'échelle France entière.</p></div>`;
          syncDepartmentRankingHeight(mapGrid);
          return;
        }

        const regionScope = (departmentModule.regions[state.selectedRegion] && departmentModule.regions[state.selectedRegion].departments) || [];
        const selectedSector = departmentModule.sectorOptions.find((option) => option.key === state.sectorDepartmentSectorKey) || departmentModule.sectorOptions[0];
        if (selectedSector && selectedSector.key !== state.sectorDepartmentSectorKey) {
          state.sectorDepartmentSectorKey = selectedSector.key;
          sectorSelect.value = selectedSector.key;
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
        legend.innerHTML = `<span>${departmentMetricFormatter(state.sectorDepartmentMetric, domain[0])}</span><span>→</span><span>${departmentMetricFormatter(state.sectorDepartmentMetric, domain[1])}</span>`;

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
            article.innerHTML = `
              <div class="topline">
                <strong>${department.name}</strong>
                <strong>${departmentMetricFormatter(state.sectorDepartmentMetric, department.metricValue)}</strong>
              </div>
              <span>${scopeLabel()}</span>
              <small>Glissement annuel : ${formatPercent(department.yoyValue)}</small>
            `;
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
          focusStateKey: "sectorEffectifsFocusKey",
          chartTitleId: "employmentEffectifsChartTitle",
          seriesSelectId: "employmentEffectifsSeriesSelect",
          focusSwitchId: "employmentEffectifsFocusSwitch",
          chartSvgId: "employmentEffectifsChartSvg",
          tooltipId: "employmentEffectifsTooltip",
          legendLineId: "employmentEffectifsLegendLine",
          scopeId: "employmentEffectifsScope",
          periodId: "employmentEffectifsPeriod",
          currentLevelId: "employmentEffectifsCurrentLevel",
          currentYoYId: "employmentEffectifsCurrentYoY",
          currentQoQId: "employmentEffectifsCurrentQoQ",
          interpretationId: "employmentEffectifsInterpretation",
        });

        renderRegionalEmploymentBlock({
          metricKey: "masse_cvs",
          seriesStateKey: "sectorPayrollSeriesKey",
          focusStateKey: "sectorPayrollFocusKey",
          chartTitleId: "employmentPayrollChartTitle",
          seriesSelectId: "employmentPayrollSeriesSelect",
          focusSwitchId: "employmentPayrollFocusSwitch",
          chartSvgId: "employmentPayrollChartSvg",
          tooltipId: "employmentPayrollTooltip",
          legendLineId: "employmentPayrollLegendLine",
          scopeId: "employmentPayrollScope",
          periodId: "employmentPayrollPeriod",
          currentLevelId: "employmentPayrollCurrentLevel",
          currentYoYId: "employmentPayrollCurrentYoY",
          currentQoQId: "employmentPayrollCurrentQoQ",
          interpretationId: "employmentPayrollInterpretation",
        });

        renderSectorTreemap();
        renderSectorDepartmentModule();
      }
