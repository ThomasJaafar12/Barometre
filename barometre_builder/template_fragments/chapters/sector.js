      function getSectorScopeData() {
        return state.phase === "national" ? DATA.modules.sector.national : DATA.modules.sector.regions[state.selectedRegion];
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
              ? `La courbe suit le niveau ${seriesLabel === "Population entière" ? "des effectifs" : `des effectifs du secteur ${seriesLabel}`} en millions.`
              : `La courbe suit ${seriesLabel === "Population entière" ? "la masse salariale" : `la masse salariale du secteur ${seriesLabel}`} en milliards d'euros.`
          ),
          legendLine: isHeadcount ? "Niveau des effectifs" : "Niveau de masse salariale",
          tooltipLevel: (value) => isHeadcount ? `${frNumber(value / divisor, 2)} M` : `${frNumber(value / divisor, 1)} MdEUR`,
          summaryLevel: (value) => isHeadcount ? `${frNumber(value / divisor, 2)} M` : `${frNumber(value / divisor, 1)} MdEUR`,
          axisTick: (value) => frNumber(value / divisor, axisDecimals),
          subject: (seriesLabel) => {
            if (seriesLabel === "Population entière") {
              return isHeadcount ? "les effectifs privés" : "la masse salariale privée";
            }
            return isHeadcount ? `les effectifs privés du secteur ${seriesLabel}` : `la masse salariale du secteur ${seriesLabel}`;
          },
          chartObject: (seriesLabel) => {
            if (seriesLabel === "Population entière") {
              return isHeadcount ? "l'emploi prive" : "la masse salariale privee";
            }
            return `${metricKey === "effectifs_cvs" ? "les effectifs" : "la masse salariale"} de ${seriesLabel}`;
          },
          focusPeakResolver: (points) => {
            let best = null;
            points.forEach((point) => {
              if (point == null || point[isHeadcount ? "effectifs_yoy" : "masse_yoy"] == null) return;
              if (!best || point[isHeadcount ? "effectifs_yoy" : "masse_yoy"] > best[isHeadcount ? "effectifs_yoy" : "masse_yoy"]) {
                best = point;
              }
            });
            return best;
          },
          focusFloorResolver: (points) => {
            let best = null;
            points.forEach((point) => {
              if (point == null || point[isHeadcount ? "effectifs_yoy" : "masse_yoy"] == null) return;
              if (!best || point[isHeadcount ? "effectifs_yoy" : "masse_yoy"] < best[isHeadcount ? "effectifs_yoy" : "masse_yoy"]) {
                best = point;
              }
            });
            return best;
          },
        };
      }

      function employmentFocusBlueprint(metric, seriesLabel) {
        return [
          {
            key: "crash",
            button: "2020 / rupture",
            startDate: "2020-01-01",
            endDate: "2020-12-31",
            title: "2020 / rupture nette.",
            copy: `Le choc 2020 casse la trajectoire de ${metric.subject(seriesLabel)}. La barre passe sous zero pendant que la courbe replonge avant de se restabiliser.`,
            peakMode: "min",
          },
          {
            key: "rebound",
            button: "2021-2022 / rebond",
            startDate: "2021-01-01",
            endDate: "2022-12-31",
            title: "2021-2022 / reprise visible.",
            copy: `Le rebond devient un chapitre a part entiere. Le glissement annuel accelere, et le niveau retrouve rapidement un rythme d'expansion lisible pour ${metric.subject(seriesLabel)}.`,
            peakMode: "max",
          },
          {
            key: "plateau",
            button: "2024-2025 / plateau",
            startDate: "2024-01-01",
            endDate: "2025-12-31",
            title: "2024-2025 / ralentissement haut.",
            copy: `La fin de periode reste a haut niveau, mais l'energie se tasse. Les barres s'aplatissent tandis que la courbe dessine presque une ligne d'horizon pour ${metric.subject(seriesLabel)}.`,
            peakMode: "max",
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

      function buildEmploymentFocuses(points, metric, seriesLabel) {
        const blueprints = employmentFocusBlueprint(metric, seriesLabel);
        return blueprints.map((item) => {
          let startIndex = findDateIndex(points, (point) => point.date >= item.startDate);
          let endIndex = findLastDateIndex(points, (point) => point.date <= item.endDate);
          if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
            endIndex = points.length - 1;
            startIndex = Math.max(0, endIndex - 7);
          }
          const focusPoints = points.slice(startIndex, endIndex + 1);
          const peakPoint = item.peakMode === "min" ? metric.focusFloorResolver(focusPoints) : metric.focusPeakResolver(focusPoints);
          let levelPoint = focusPoints[focusPoints.length - 1] || null;
          focusPoints.forEach((point) => {
            if (!levelPoint || (point[metric.levelKey] || 0) > (levelPoint[metric.levelKey] || 0)) {
              levelPoint = point;
            }
          });
          return {
            ...item,
            startIndex,
            endIndex,
            peakPoint,
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

      function getSelectedSectorSeries(scope) {
        const fallbackKey = scope.defaultSeriesKey;
        if (!state.sectorSeriesKey || !scope.series[state.sectorSeriesKey]) {
          state.sectorSeriesKey = fallbackKey;
        }
        return scope.series[state.sectorSeriesKey] || scope.series[fallbackKey] || null;
      }

      function renderEmploymentSeriesSelect(scope, selectedKey) {
        const select = document.getElementById("employmentSeriesSelect");
        select.innerHTML = "";
        scope.seriesOptions.forEach((option) => {
          const element = document.createElement("option");
          element.value = option.key;
          element.textContent = option.label;
          element.selected = option.key === selectedKey;
          select.appendChild(element);
        });
        if (!select.dataset.bound) {
          select.addEventListener("change", (event) => {
            state.sectorSeriesKey = event.target.value;
            renderSectorModule();
          });
          select.dataset.bound = "true";
        }
      }

      function renderEmploymentFocusSwitch(focuses, activeKey) {
        const container = document.getElementById("employmentFocusSwitch");
        container.innerHTML = "";
        focuses.forEach((focus) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `employment-focus-button${focus.key === activeKey ? " is-active" : ""}`;
          button.textContent = focus.button;
          button.addEventListener("click", () => {
            state.sectorFocusKey = focus.key;
            renderSectorModule();
          });
          container.appendChild(button);
        });
      }

      function renderSectorModule() {
        const scope = getSectorScopeData();
        const subtitle = document.getElementById("sectorSubtitle");
        const chartMeta = document.getElementById("employmentChartMeta");
        const axisCopy = document.getElementById("employmentAxisCopy");
        const legendLine = document.getElementById("employmentLegendLine");

        renderMetricSwitch("sectorMetricSwitch", DATA.modules.sector.metrics, state.sectorMetric, (key) => {
          state.sectorMetric = key;
          renderSectorModule();
        });

        if (!scope || !scope.seriesOptions || !scope.seriesOptions.length) {
          subtitle.textContent = `${scopeLabel()} / donnees indisponibles dans les CSV fournis.`;
          renderEmptyState(document.getElementById("employmentChartSvg").parentElement, "Aucune serie", "Ce territoire ne dispose pas de serie trimestrielle exploitable.");
          renderEmptyState(document.querySelector("#module-sector .employment-side"), "Aucun detail", "Les cartes editoriales seront disponibles des que la serie sera chargee.");
          return;
        }

        const selectedSeries = getSelectedSectorSeries(scope);
        if (!selectedSeries || !selectedSeries.points || !selectedSeries.points.length) {
          subtitle.textContent = `${scopeLabel()} / serie indisponible.`;
          renderEmptyState(document.getElementById("employmentChartSvg").parentElement, "Serie indisponible", "La serie selectionnee ne contient pas de points exploitables.");
          return;
        }

        const metric = employmentMetricConfig(state.sectorMetric);
        const displayStartDate = DATA.modules.sector.displayStartDate || "2014-01-01";
        const seriesLabel = selectedSeries.label;
        const points = selectedSeries.points.filter((point) => point.date >= displayStartDate);
        const lastPoint = points[points.length - 1];
        const focuses = buildEmploymentFocuses(points, metric, seriesLabel);
        const availableFocusKeys = new Set(focuses.map((focus) => focus.key));
        if (!availableFocusKeys.has(state.sectorFocusKey)) {
          state.sectorFocusKey = "rebound";
        }
        const activeFocus = focuses.find((focus) => focus.key === state.sectorFocusKey) || focuses[0];

        renderEmploymentSeriesSelect(scope, state.sectorSeriesKey);
        renderEmploymentFocusSwitch(focuses, activeFocus.key);
        subtitle.textContent = `${scopeLabel()} / ${seriesLabel} / lecture ${quarterLabel(lastPoint.date)} / glissement annuel a gauche + niveau a droite`;
        chartMeta.textContent = `${scopeLabel()} / ${seriesLabel} / ${metric.label.toLowerCase()} / fenetre 2014-2025`;
        axisCopy.textContent = metric.axisCopy(seriesLabel);
        legendLine.textContent = metric.legendLine;

        document.getElementById("employmentChartTitle").textContent = `Deux mesures, une scene claire pour ${metric.chartObject(seriesLabel)}.`;
        document.getElementById("employmentFocusTitle").textContent = activeFocus.title;
        document.getElementById("employmentFocusCopy").textContent = activeFocus.copy;
        document.getElementById("employmentCurrentLevel").textContent = metric.summaryLevel(lastPoint[metric.levelKey]);
        document.getElementById("employmentCurrentLevelMeta").textContent = `${quarterLabel(lastPoint.date)} / niveau observe`;
        document.getElementById("employmentCurrentYoY").textContent = formatPercent(lastPoint[metric.yoyKey]);
        document.getElementById("employmentCurrentYoYMeta").textContent = `${quarterLabel(lastPoint.date)} / vs il y a un an`;
        document.getElementById("employmentFocusPeak").textContent = formatPercent(activeFocus.peakPoint ? activeFocus.peakPoint[metric.yoyKey] : null);
        document.getElementById("employmentFocusPeakMeta").textContent = activeFocus.peakPoint ? `${quarterLabel(activeFocus.peakPoint.date)} / point le plus marquant du focus` : "Fenetre de focus";
        document.getElementById("employmentFocusLevel").textContent = metric.summaryLevel(activeFocus.levelPoint ? activeFocus.levelPoint[metric.levelKey] : null);
        document.getElementById("employmentFocusLevelMeta").textContent = activeFocus.levelPoint ? `${quarterLabel(activeFocus.levelPoint.date)} / niveau atteint dans la fenetre` : "Fenetre de focus";

        const svg = d3.select("#employmentChartSvg");
        svg.selectAll("*").remove();
        const width = 980;
        const height = 560;
        const margin = { top: 38, right: 84, bottom: 78, left: 76 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const root = svg.attr("viewBox", `0 0 ${width} ${height}`);

        const defs = root.append("defs");
        const positiveGradient = defs.append("linearGradient").attr("id", "employmentPositiveFill").attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
        positiveGradient.append("stop").attr("offset", "0%").attr("stop-color", "rgba(38,193,160,0.95)");
        positiveGradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(38,193,160,0.38)");
        const negativeGradient = defs.append("linearGradient").attr("id", "employmentNegativeFill").attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
        negativeGradient.append("stop").attr("offset", "0%").attr("stop-color", "rgba(228,134,118,0.95)");
        negativeGradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(228,134,118,0.42)");
        const focusGradient = defs.append("linearGradient").attr("id", "employmentFocusFill").attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
        focusGradient.append("stop").attr("offset", "0%").attr("stop-color", "rgba(26,78,147,0.13)");
        focusGradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(26,78,147,0)");
        const glow = defs.append("filter").attr("id", "employmentLineGlow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
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
          .attr("fill", "url(#employmentFocusFill)");

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
          .attr("fill", (point) => point[metric.yoyKey] >= 0 ? "url(#employmentPositiveFill)" : "url(#employmentNegativeFill)");

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
          .attr("filter", "url(#employmentLineGlow)");

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

        const tooltip = document.getElementById("employmentChartTooltip");
        const tooltipOverline = tooltip.querySelector(".tooltip-overline");
        const tooltipBody = tooltip.querySelector(".tooltip-body");
        const chartShell = tooltip.parentElement;

        function hideTooltip() {
          tooltip.classList.remove("is-visible");
          tooltip.setAttribute("aria-hidden", "true");
        }

        function showTooltip(event, point) {
          const shellBounds = chartShell.getBoundingClientRect();
          const x = Math.min(event.clientX - shellBounds.left + 14, shellBounds.width - 252);
          const y = Math.max(event.clientY - shellBounds.top - 82, 16);
          tooltip.style.left = `${Math.max(16, x)}px`;
          tooltip.style.top = `${y}px`;
          tooltipOverline.textContent = quarterLabel(point.date);
          tooltipBody.innerHTML = `Glissement annuel: ${formatPercent(point[metric.yoyKey])}<br>Niveau: ${metric.tooltipLevel(point[metric.levelKey])}`;
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
          .on("mousemove", (event, point) => showTooltip(event, point))
          .on("mouseleave", hideTooltip);

        root.on("mouseleave", hideTooltip);
      }
