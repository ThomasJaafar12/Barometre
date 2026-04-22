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
          levelKey: metricKey,
          yoyKey: isHeadcount ? "effectifs_yoy" : "masse_yoy",
          qoqKey: isHeadcount ? "effectifs_qoq" : "masse_qoq",
          axisTitle: isHeadcount ? "Niveau (millions)" : "Niveau (milliards d'euros)",
          axisCopy: (seriesLabel) => (
            isHeadcount
              ? `La courbe suit ${seriesLabel === "Population entière" ? "le niveau des effectifs privés" : `le niveau des effectifs privés du secteur ${seriesLabel}`} en millions.`
              : `La courbe suit ${seriesLabel === "Population entière" ? "la masse salariale privée" : `la masse salariale du secteur ${seriesLabel}`} en milliards d'euros.`
          ),
          legendLine: isHeadcount ? "Niveau des effectifs" : "Niveau de masse salariale",
          tooltipLevel: (value) => isHeadcount ? `${frNumber(value / divisor, 2)} M` : `${frNumber(value / divisor, 1)} Md€`,
          summaryLevel: (value) => isHeadcount ? `${frNumber(value / divisor, 2)} M` : `${frNumber(value / divisor, 1)} Md€`,
          axisTick: (value) => frNumber(value / divisor, axisDecimals),
          subject: (seriesLabel) => {
            if (seriesLabel === "Population entière") {
              return isHeadcount ? "l'emploi privé" : "la masse salariale privée";
            }
            return isHeadcount ? `l'emploi privé du secteur ${seriesLabel}` : `la masse salariale du secteur ${seriesLabel}`;
          },
          chartObject: (seriesLabel) => {
            if (seriesLabel === "Population entière") {
              return isHeadcount ? "l'emploi privé" : "la masse salariale privée";
            }
            return isHeadcount ? `l'emploi privé du secteur ${seriesLabel}` : `la masse salariale du secteur ${seriesLabel}`;
          },
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
        const originX = x + dx;
        const originY = y + dy;

        group.append("line")
          .attr("x1", x)
          .attr("y1", y)
          .attr("x2", originX)
          .attr("y2", originY + 16)
          .attr("stroke", "rgba(22,33,44,0.24)")
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
          .attr("fill", "#16212c")
          .style("font-family", "IBM Plex Mono, monospace")
          .style("font-size", "11px")
          .style("letter-spacing", "0.08em")
          .text(label);
        box.append("text")
          .attr("x", 12)
          .attr("y", 36)
          .attr("fill", "#5b6773")
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

      function employmentCurrentSignal(value) {
        if (value == null) return "reste non documenté";
        if (value >= 4) return "accélère nettement";
        if (value >= 1.5) return "progresse à un rythme soutenu";
        if (value >= 0.3) return "demeure orienté à la hausse";
        if (value > -0.3) return "évolue presque à l'étale";
        if (value > -1.5) return "s'inscrit en léger retrait";
        return "se replie sensiblement";
      }

      function employmentFocusWindowLabel(key) {
        if (key === "crash") return "la séquence de rupture de 2020";
        if (key === "rebound") return "la phase de rebond 2021-2022";
        return "la période récente 2024-2025";
      }

      function employmentEndSignal(startValue, endValue) {
        if (startValue == null || endValue == null) return "reste peu lisible";
        const delta = endValue - startValue;
        if (delta >= 1) return "se raffermit en fin de fenêtre";
        if (delta <= -1) return "se modère en fin de fenêtre";
        return "se stabilise en fin de fenêtre";
      }

      function employmentNarrative(metric, seriesLabel, activeFocus, latestPoint) {
        const peakPoint = activeFocus.peakPoint;
        const focusPoints = activeFocus.points || [];
        const focusStart = focusPoints[0] || null;
        const focusEnd = focusPoints[focusPoints.length - 1] || latestPoint;
        const latestYoY = latestPoint ? latestPoint[metric.yoyKey] : null;
        const currentSignal = employmentCurrentSignal(latestYoY);
        const endSignal = employmentEndSignal(
          focusStart ? focusStart[metric.yoyKey] : null,
          focusEnd ? focusEnd[metric.yoyKey] : null,
        );
        const peakLabel = peakPoint
          ? `${quarterLabel(peakPoint.date)}, le glissement annuel atteint ${formatPercent(peakPoint[metric.yoyKey])}`
          : "la fenêtre de lecture ne permet pas d'isoler de point saillant";
        const subject = metric.subject(seriesLabel);
        const levelLabel = latestPoint ? metric.summaryLevel(latestPoint[metric.levelKey]) : "n.d.";
        const latestQuarter = latestPoint ? quarterLabel(latestPoint.date) : "dernier trimestre connu";
        let title = "";
        if (activeFocus.key === "crash") {
          title = peakPoint && peakPoint[metric.yoyKey] != null && peakPoint[metric.yoyKey] <= -2.5
            ? "2020 / rupture marquée."
            : "2020 / rupture nette.";
        } else if (activeFocus.key === "rebound") {
          title = peakPoint && peakPoint[metric.yoyKey] != null && peakPoint[metric.yoyKey] >= 4
            ? "2021-2022 / reprise vigoureuse."
            : "2021-2022 / reprise visible.";
        } else {
          title = latestYoY != null && latestYoY <= 0.3
            ? "2024-2025 / haut niveau, rythme contenu."
            : "2024-2025 / haut niveau encore orienté.";
        }
        const copy = `${scopeLabel()} / ${seriesLabel}. Sur ${employmentFocusWindowLabel(activeFocus.key)}, ${subject} ${currentSignal}. Au point le plus marquant, ${peakLabel}. À ${latestQuarter}, le niveau s'établit à ${levelLabel} et ${endSignal}.`;
        return { title, copy };
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

        const defs = root.append("defs");
        const positiveFillId = `${prefix}-positive-fill`;
        const negativeFillId = `${prefix}-negative-fill`;
        const focusFillId = `${prefix}-focus-fill`;
        const glowId = `${prefix}-line-glow`;
        const positiveGradient = defs.append("linearGradient").attr("id", positiveFillId).attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
        positiveGradient.append("stop").attr("offset", "0%").attr("stop-color", "rgba(38,193,160,0.95)");
        positiveGradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(38,193,160,0.38)");
        const negativeGradient = defs.append("linearGradient").attr("id", negativeFillId).attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
        negativeGradient.append("stop").attr("offset", "0%").attr("stop-color", "rgba(228,134,118,0.95)");
        negativeGradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(228,134,118,0.42)");
        const focusGradient = defs.append("linearGradient").attr("id", focusFillId).attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
        focusGradient.append("stop").attr("offset", "0%").attr("stop-color", "rgba(26,78,147,0.13)");
        focusGradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(26,78,147,0)");
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
          .attr("stroke", (value) => value === 0 ? "rgba(22,33,44,0.18)" : "rgba(22,33,44,0.07)")
          .attr("stroke-width", (value) => value === 0 ? 1.4 : 1);

        const leftAxis = chart.append("g")
          .call(d3.axisLeft(yYoY).ticks(7).tickFormat((value) => `${frNumber(value, 1)} %`));
        leftAxis.selectAll("text").attr("fill", "#5b6773").style("font-family", "IBM Plex Mono, monospace").style("font-size", "12px");
        leftAxis.selectAll("path,line").attr("stroke", "rgba(22,33,44,0)");

        const rightAxis = chart.append("g")
          .attr("transform", `translate(${innerWidth},0)`)
          .call(d3.axisRight(yLevel).ticks(6).tickFormat((value) => metric.axisTick(value)));
        rightAxis.selectAll("text").attr("fill", "#1a4e93").style("font-family", "IBM Plex Mono, monospace").style("font-size", "12px");
        rightAxis.selectAll("path,line").attr("stroke", "rgba(26,78,147,0.12)");

        chart.append("text")
          .attr("x", 0)
          .attr("y", -14)
          .attr("fill", "#16212c")
          .style("font-family", "IBM Plex Mono, monospace")
          .style("font-size", "12px")
          .text("Glissement annuel");

        chart.append("text")
          .attr("x", innerWidth)
          .attr("y", -14)
          .attr("text-anchor", "end")
          .attr("fill", "#1a4e93")
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
          .attr("stroke", "rgba(26,78,147,0.16)")
          .attr("stroke-width", 10)
          .attr("filter", `url(#${glowId})`);

        chart.append("path")
          .datum(points)
          .attr("d", line)
          .attr("fill", "none")
          .attr("stroke", "#1a4e93")
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
          .attr("fill", (_, index) => index === points.length - 1 ? "#ffffff" : "#1a4e93")
          .attr("stroke", "#1a4e93")
          .attr("stroke-width", (_, index) => index === points.length - 1 ? 2.8 : 0);

        chart.append("line")
          .attr("x1", 0)
          .attr("x2", innerWidth)
          .attr("y1", innerHeight)
          .attr("y2", innerHeight)
          .attr("stroke", "rgba(22,33,44,0.16)");

        const tickIndices = employmentTickIndices(points.length);
        const xAxis = chart.append("g").attr("transform", `translate(0,${innerHeight})`);
        tickIndices.forEach((index) => {
          const x = xScale(index);
          xAxis.append("line")
            .attr("x1", x)
            .attr("x2", x)
            .attr("y1", 0)
            .attr("y2", 7)
            .attr("stroke", "rgba(22,33,44,0.16)");
          xAxis.append("text")
            .attr("x", x)
            .attr("y", 26)
            .attr("fill", "#5b6773")
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
          .attr("fill", "#16212c")
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
          const x = Math.min(event.clientX - shellBounds.left + 14, shellBounds.width - 252);
          const y = Math.max(event.clientY - shellBounds.top - 82, 16);
          tooltip.style.left = `${Math.max(16, x)}px`;
          tooltip.style.top = `${y}px`;
          tooltipOverline.textContent = quarterLabel(point.date);
          tooltipBody.innerHTML = `Glissement annuel : ${formatPercent(point[metric.yoyKey])}<br>Niveau : ${metric.tooltipLevel(point[metric.levelKey])}`;
          tooltip.classList.add("is-visible");
          tooltip.setAttribute("aria-hidden", "false");
        }

        chart.append("g")
          .selectAll("rect")
          .data(points)
          .join("rect")
          .attr("x", (_, index) => xScale(index) - Math.max(barWidth, 12))
          .attr("y", 0)
          .attr("width", Math.max(barWidth * 2, 18))
          .attr("height", innerHeight)
          .attr("fill", "transparent")
          .style("cursor", "pointer")
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
        const narrative = employmentNarrative(metric, selectedSeries.label, activeFocus, lastPoint);

        renderEmploymentSeriesSelect(config.seriesSelectId, scope, config.seriesStateKey, renderSectorModule);
        renderEmploymentFocusSwitch(config.focusSwitchId, focuses, activeFocus.key, config.focusStateKey, renderSectorModule);

        document.getElementById(config.chartTitleId).textContent = `Deux mesures, une scène claire pour ${metric.chartObject(selectedSeries.label)}.`;
        document.getElementById(config.chartMetaId).textContent = `${scopeLabel()} / ${selectedSeries.label} / ${metric.label.toLowerCase()} / fenêtre 2014-2025`;
        document.getElementById(config.legendLineId).textContent = metric.legendLine;
        document.getElementById(config.axisCopyId).textContent = metric.axisCopy(selectedSeries.label);
        document.getElementById(config.focusTitleId).textContent = narrative.title;
        document.getElementById(config.focusCopyId).textContent = narrative.copy;
        document.getElementById(config.currentLevelId).textContent = metric.summaryLevel(lastPoint[metric.levelKey]);
        document.getElementById(config.currentLevelMetaId).textContent = `${quarterLabel(lastPoint.date)} / niveau observé`;
        document.getElementById(config.currentYoYId).textContent = formatPercent(lastPoint[metric.yoyKey]);
        document.getElementById(config.currentYoYMetaId).textContent = `${quarterLabel(lastPoint.date)} / vs il y a un an`;
        document.getElementById(config.focusPeakId).textContent = formatPercent(activeFocus.peakPoint ? activeFocus.peakPoint[metric.yoyKey] : null);
        document.getElementById(config.focusPeakMetaId).textContent = activeFocus.peakPoint
          ? `${quarterLabel(activeFocus.peakPoint.date)} / point le plus marqué`
          : "Fenêtre de focus";
        document.getElementById(config.focusLevelId).textContent = metric.summaryLevel(activeFocus.levelPoint ? activeFocus.levelPoint[metric.levelKey] : null);
        document.getElementById(config.focusLevelMetaId).textContent = activeFocus.levelPoint
          ? `${quarterLabel(activeFocus.levelPoint.date)} / niveau atteint dans la fenêtre`
          : "Fenêtre de focus";

        drawEmploymentChart(config, points, metric, focuses, activeFocus);
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
          return;
        }

        const values = regionScope
          .map((department) => departmentMetricValue(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric))
          .filter((value) => value != null);
        const features = featuresByRegion.get(state.selectedRegion) || [];
        const scale = values.length
          ? buildScale(
              d3.extent(values),
              [paletteToken("chart-auto-low", "rgba(255,255,255,0.08)"), paletteToken("chart-auto-high", "rgba(120,236,203,0.94)")],
            )
          : () => paletteToken("chart-auto-low", "rgba(255,255,255,0.08)");

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
          : `${scopeLabel()} / lecture régionale ${quarterLabel(regionalScope.latestDate)} + carte départementale ${quarterLabel(departmentData.latestDate)}`;

        renderRegionalEmploymentBlock({
          metricKey: "effectifs_cvs",
          seriesStateKey: "sectorEffectifsSeriesKey",
          focusStateKey: "sectorEffectifsFocusKey",
          chartTitleId: "employmentEffectifsChartTitle",
          chartMetaId: "employmentEffectifsChartMeta",
          seriesSelectId: "employmentEffectifsSeriesSelect",
          focusSwitchId: "employmentEffectifsFocusSwitch",
          chartSvgId: "employmentEffectifsChartSvg",
          tooltipId: "employmentEffectifsTooltip",
          legendLineId: "employmentEffectifsLegendLine",
          focusTitleId: "employmentEffectifsFocusTitle",
          focusCopyId: "employmentEffectifsFocusCopy",
          currentLevelId: "employmentEffectifsCurrentLevel",
          currentLevelMetaId: "employmentEffectifsCurrentLevelMeta",
          currentYoYId: "employmentEffectifsCurrentYoY",
          currentYoYMetaId: "employmentEffectifsCurrentYoYMeta",
          focusPeakId: "employmentEffectifsFocusPeak",
          focusPeakMetaId: "employmentEffectifsFocusPeakMeta",
          focusLevelId: "employmentEffectifsFocusLevel",
          focusLevelMetaId: "employmentEffectifsFocusLevelMeta",
          axisCopyId: "employmentEffectifsAxisCopy",
        });

        renderRegionalEmploymentBlock({
          metricKey: "masse_cvs",
          seriesStateKey: "sectorPayrollSeriesKey",
          focusStateKey: "sectorPayrollFocusKey",
          chartTitleId: "employmentPayrollChartTitle",
          chartMetaId: "employmentPayrollChartMeta",
          seriesSelectId: "employmentPayrollSeriesSelect",
          focusSwitchId: "employmentPayrollFocusSwitch",
          chartSvgId: "employmentPayrollChartSvg",
          tooltipId: "employmentPayrollTooltip",
          legendLineId: "employmentPayrollLegendLine",
          focusTitleId: "employmentPayrollFocusTitle",
          focusCopyId: "employmentPayrollFocusCopy",
          currentLevelId: "employmentPayrollCurrentLevel",
          currentLevelMetaId: "employmentPayrollCurrentLevelMeta",
          currentYoYId: "employmentPayrollCurrentYoY",
          currentYoYMetaId: "employmentPayrollCurrentYoYMeta",
          focusPeakId: "employmentPayrollFocusPeak",
          focusPeakMetaId: "employmentPayrollFocusPeakMeta",
          focusLevelId: "employmentPayrollFocusLevel",
          focusLevelMetaId: "employmentPayrollFocusLevelMeta",
          axisCopyId: "employmentPayrollAxisCopy",
        });

        renderSectorDepartmentModule();
      }
