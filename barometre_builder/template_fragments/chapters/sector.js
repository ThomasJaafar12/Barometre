      const employmentPointWindows = new WeakMap();
      const employmentLatestRowsByScope = new WeakMap();
      const sectorDepartmentsByScope = new WeakMap();
      let sectorDepartmentGeometry = null;
      let sectorDepartmentHover = null;
      let sectorTreemapResizeObserver = null;
      let sectorTreemapResizeFrame = null;
      let sectorTreemapFontsBound = false;
      let sectorTreemapLabelFitFrame = null;
      let sectorTreemapLabelFitQueued = false;

      function getSectorRegionalScopeData() {
        return state.phase === "national"
          ? DATA.modules.sector.regional.national
          : DATA.modules.sector.regional.regions[state.selectedRegion];
      }

      function getSectorDepartmentFeaturesByRegion() {
        return geographyIndex(DATA.geography).departmentsByRegion;
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

      function renderEmploymentSeriesPicker(controlId, scope, stateKey, onRender) {
        renderEmploymentSectorPicker(controlId, scope.seriesOptions, stateKey, onRender, EMPLOYMENT_SECTOR_GROUPS);
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
        if (!scope || !scope.seriesOptions || !scope.seriesOptions.length) {
          renderMissingEmploymentBlock(config, metric);
          return;
        }
        if (!state[config.seriesStateKey] || !scope.series[state[config.seriesStateKey]]) {
          state[config.seriesStateKey] = scope.defaultSeriesKey;
        }
        const selectedSeries = scope.series[state[config.seriesStateKey]] || scope.series[scope.defaultSeriesKey];
        if (!selectedSeries || !selectedSeries.points || !selectedSeries.points.length) {
          renderMissingEmploymentBlock(config, metric);
          return;
        }
        document.getElementById(config.seriesControlId).querySelector(".employment-sector-trigger").disabled = false;

        const displayStartDate = regionalData.displayStartDate || "2014-01-01";
        let pointWindow = employmentPointWindows.get(selectedSeries.points);
        if (!pointWindow || pointWindow.displayStartDate !== displayStartDate) {
          pointWindow = { displayStartDate, points: selectedSeries.points.filter((point) => point.date >= displayStartDate) };
          employmentPointWindows.set(selectedSeries.points, pointWindow);
        }
        const points = pointWindow.points;
        const lastPoint = points[points.length - 1];

        renderEmploymentSeriesPicker(config.seriesControlId, scope, config.seriesStateKey, () => renderRegionalEmploymentBlock(config));

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

      function renderMissingEmploymentBlock(config, metric) {
        const picker = document.getElementById(config.seriesControlId);
        setEmploymentSectorPickerOpen(picker, false);
        picker.querySelector(".employment-sector-trigger").disabled = true;
        picker.querySelector(".employment-sector-trigger-value").textContent = "Données indisponibles";
        const title = `${metric.heading} : données indisponibles en ${scopeLabel()}.`;
        document.getElementById(config.chartTitleId).textContent = title;
        document.getElementById(config.scopeId).textContent = scopeLabel();
        const period = document.getElementById(config.periodId);
        period.textContent = "Données indisponibles";
        period.removeAttribute("datetime");
        document.getElementById(config.currentLevelId).textContent = "—";
        renderEmploymentTrend(config.currentYoYId, null);
        renderEmploymentTrend(config.currentQoQId, null);
        document.getElementById(config.interpretationId).textContent = "Aucune donnée disponible pour ce territoire.";
        document.getElementById(config.legendLineId).textContent = metric.legendLine;
        const tooltip = document.getElementById(config.tooltipId);
        tooltip.classList.remove("is-visible");
        tooltip.setAttribute("aria-hidden", "true");
        const svg = d3.select(`#${config.chartSvgId}`);
        svg.selectAll("*").remove();
        svg.append("title").text(title);
        svg.append("text").attr("x", 490).attr("y", 280).attr("text-anchor", "middle")
          .attr("fill", paletteToken("employment-chart-muted", "#64748B")).text("Données indisponibles");
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
            renderRegionalEmploymentBlock(config);
            document.getElementById(config.seriesControlId).querySelector(".employment-sector-trigger").focus({ preventScroll: true });
          },
        });
      }

      function sectorTreemapMetricFormatter(metricKey, value) {
        return metricKey === "masse_cvs" ? formatCurrency(value) : formatCount(value);
      }

      function sectorTreemapAnnualFormatter(value) {
        return employmentSignedPercent(Number.isFinite(value) && Math.abs(value) < 0.05 ? 0 : value);
      }

      function sectorTreemapDimensions(shell) {
        const width = Math.max(320, Math.round(shell.clientWidth || 980));
        const height = width < 640 ? Math.round(width * 2.6) : Math.max(480, Math.min(800, window.innerHeight - 340));
        return { width, height };
      }

      function scheduleSectorTreemapResize() {
        if (sectorTreemapResizeFrame != null) return;
        sectorTreemapResizeFrame = requestAnimationFrame(() => {
          sectorTreemapResizeFrame = null;
          const shell = document.getElementById("employmentTreemapShell");
          if (shell.classList.contains("is-empty")) return;
          const viewBox = document.getElementById("employmentTreemapSvg").viewBox.baseVal;
          const { width, height } = sectorTreemapDimensions(shell);
          if (viewBox.width !== width || viewBox.height !== height) renderSectorTreemap();
        });
      }

      function employmentLatestSectorRows(scope, metric) {
        if (!scope || !scope.seriesOptions || !scope.series) return [];
        let rowsByMetric = employmentLatestRowsByScope.get(scope);
        if (!rowsByMetric) {
          rowsByMetric = new Map();
          employmentLatestRowsByScope.set(scope, rowsByMetric);
        }
        if (rowsByMetric.has(metric.key)) return rowsByMetric.get(metric.key);
        const rows = scope.seriesOptions
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
        rowsByMetric.set(metric.key, rows);
        return rows;
      }

      function sectorTreemapColorScale(rows) {
        const maxAbs = Math.max(1.5, d3.max(rows, (row) => Number.isFinite(row.yoy) ? Math.abs(row.yoy) : 0) || 0);
        const negative = d3.interpolateRgb("#FF967D", paletteToken("employment-treemap-negative", "#ED4766"));
        const positive = d3.interpolateRgb("#62DDB1", paletteToken("employment-treemap-positive", "#10AD8D"));
        const neutral = paletteToken("employment-treemap-neutral", "#F6C65B");
        return (value) => {
          if (!Number.isFinite(value)) return "#E2E8F0";
          if (Math.abs(value) <= 0.05) return neutral;
          const intensity = Math.sqrt(Math.min(1, Math.abs(value) / maxAbs));
          return value < 0 ? negative(intensity) : positive(intensity);
        };
      }

      function sectorTreemapTrimLabel(label) {
        return String(label || "")
          .replace(/^[A-Z]{1,3}[a-z]?(?:-[A-Z]{1,3}[a-z]?)*\s+/, "")
          .trim();
      }

      function sectorTreemapNaceCode(label, key) {
        const labelMatch = String(label || "").match(/^([A-Z]{1,3}[a-z]?(?:-[A-Z]{1,3}[a-z]?)*)\s+/);
        const keyMatch = String(key || "").match(/^([a-z]{1,3}(?:-[a-z]{1,3})*)-/i);
        const rawCode = labelMatch ? labelMatch[1] : (keyMatch ? keyMatch[1] : "");
        return rawCode.replace(/-/g, " ").toUpperCase();
      }

      function sectorTreemapLayoutRows(rows, width, height) {
        const total = d3.sum(rows, (row) => row.value);
        // A small, disclosed area floor keeps a name, level and GA in every tile.
        // Only the layout uses this floor; all displayed figures stay unchanged.
        const minimumLayoutValue = total * Math.max(0.012, 7600 / (width * height));
        return rows.map((row) => ({
          ...row,
          naceCode: sectorTreemapNaceCode(row.label, row.key),
          layoutValue: Math.max(row.value, minimumLayoutValue),
        }));
      }

      const SECTOR_TREEMAP_LABELS = {
        GZ: "Commerce et réparation automobile",
        FZ: "Construction",
        QB: "Action sociale et médico-social",
        IZ: "Hébergement et restauration",
        HZ: "Transports et entreposage",
        NZB: "Services administratifs et de soutien",
        MA: "Conseil, droit et ingénierie",
        KZ: "Finance et assurance",
        NZA: "Intérimaires",
        CA: "Industries agroalimentaires",
        QA: "Santé humaine",
        "JA JB JC": "Édition, télécoms et informatique",
        "CK CL": "Machines et matériel de transport",
        SZ: "Autres services",
        PZ: "Éducation",
        RZ: "Arts, spectacles et loisirs",
        "DZ EZ": "Électricité, gaz et eau",
        CM: "Meuble, réparation et industries diverses",
        CH: "Métallurgie et produits métalliques",
        CC: "Bois et papier",
        LZ: "Immobilier",
        "CI CJ": "Électronique et matériel électrique",
        "MB MC": "Recherche et sciences",
        OZ: "Administration publique",
        CG: "Plastiques et produits divers",
        "CD CE CF": "Raffinage, chimie et pharmacie",
        CB: "Textile, habillement et cuir",
        BZ: "Industries extractives",
      };

      function drawSectorTreemapLabel(tile, leaf, metricKey) {
        const width = leaf.x1 - leaf.x0;
        const height = leaf.y1 - leaf.y0;
        const inset = Math.min(14, Math.max(6, Math.min(width, height) * 0.09));
        const compact = width < 120 || height < 100;
        const label = SECTOR_TREEMAP_LABELS[leaf.data.naceCode] || sectorTreemapTrimLabel(leaf.data.label);
        const content = tile.append("foreignObject")
          .attr("x", inset).attr("y", inset)
          .attr("width", Math.max(1, width - inset * 2))
          .attr("height", Math.max(1, height - inset * 2))
          .attr("aria-hidden", "true")
          .append("xhtml:div")
          .attr("class", `employment-treemap-content${compact ? " is-compact" : ""}`)
          .style("--treemap-label-size", `${compact ? 11 : Math.min(18, width / 12)}px`)
          .style("--treemap-value-size", `${compact ? 18 : Math.min(30, width / 7)}px`)
          .style("--treemap-yoy-size", `${compact ? 9.5 : 11}px`);
        content.append("span").attr("class", "employment-treemap-label").text(label);
        content.append("span").attr("class", "employment-treemap-value").text(sectorTreemapMetricFormatter(metricKey, leaf.data.value));
        content.append("span").attr("class", "employment-treemap-yoy").text(`GA ${sectorTreemapAnnualFormatter(leaf.data.yoy)}`);
      }

      function fitSectorTreemapLabels(svgNode) {
        // Fit once after layout, never on pan/zoom. All three lines stay present.
        svgNode.querySelectorAll(".employment-treemap-content").forEach((content) => {
          if (!content.clientHeight) return;
          content.style.setProperty("--treemap-type-scale", "1");
          const [label, value, annual] = content.children;
          // A long currency value must not shrink the name or GA with it.
          [[value, "--treemap-value-size"], [annual, "--treemap-yoy-size"]].forEach(([line, variable]) => {
            if (line.scrollWidth > content.clientWidth) {
              const size = parseFloat(getComputedStyle(line).fontSize);
              content.style.setProperty(variable, `${size * content.clientWidth / line.scrollWidth * 0.98}px`);
            }
          });
          let labelSize = parseFloat(getComputedStyle(label).fontSize);
          while (labelSize > 8.5 && content.scrollHeight > content.clientHeight) {
            labelSize -= 0.25;
            content.style.setProperty("--treemap-label-size", `${labelSize}px`);
          }
          if (content.scrollHeight > content.clientHeight) {
            value.style.marginTop = "2px";
            annual.style.marginTop = "2px";
          }
          let valueSize = parseFloat(getComputedStyle(value).fontSize);
          while (valueSize > 12 && content.scrollHeight > content.clientHeight) {
            valueSize -= 0.5;
            content.style.setProperty("--treemap-value-size", `${valueSize}px`);
          }
          let scale = 1;
          while (scale > 0.6 && (content.scrollHeight > content.clientHeight
            || [...content.children].some((line) => line.scrollWidth > content.clientWidth + 1))) {
            scale -= 0.025;
            content.style.setProperty("--treemap-type-scale", scale.toFixed(3));
          }
        });
      }

      function fitCurrentSectorTreemapLabels() {
        sectorTreemapLabelFitQueued = false;
        const svgNode = document.getElementById("employmentTreemapSvg");
        const shell = document.getElementById("employmentTreemapShell");
        if (svgNode?.isConnected && shell && !shell.classList.contains("is-empty")) fitSectorTreemapLabels(svgNode);
      }

      function scheduleSectorTreemapLabelFit() {
        if (fontsReadySettled) {
          if (sectorTreemapLabelFitFrame != null) {
            cancelAnimationFrame(sectorTreemapLabelFitFrame);
            sectorTreemapLabelFitFrame = null;
          }
          if (sectorTreemapLabelFitQueued) return;
          sectorTreemapLabelFitQueued = true;
          Promise.resolve().then(fitCurrentSectorTreemapLabels);
        } else if (sectorTreemapLabelFitFrame == null) {
          sectorTreemapLabelFitFrame = requestAnimationFrame(() => {
            sectorTreemapLabelFitFrame = null;
            fitCurrentSectorTreemapLabels();
          });
        }
      }

      function renderSectorTreemap() {
        const scope = getSectorRegionalScopeData();
        const metricKey = state.sectorTreemapMetric || "effectifs_cvs";
        const metric = employmentMetricConfig(metricKey);
        const metrics = DATA.modules.sector.regional.metrics || [];
        const shell = document.getElementById("employmentTreemapShell");
        const meta = document.getElementById("employmentTreemapMeta");
        const legend = document.getElementById("employmentTreemapLegend");
        const tooltipNode = document.getElementById("employmentTreemapTooltip");
        const rootSvg = d3.select("#employmentTreemapSvg");
        const zoomControls = document.getElementById("employmentTreemapZoomControls");
        const zoomLevel = document.getElementById("employmentTreemapZoomLevel");
        const note = document.getElementById("employmentTreemapNote");
        const rows = employmentLatestSectorRows(scope, metric);

        renderMetricSwitch("employmentTreemapMetricSwitch", metrics, metricKey, (key) => {
          state.sectorTreemapMetric = key;
          renderSectorTreemap();
        });

        gsap.killTweensOf(rootSvg.selectAll(".employment-treemap-tile").nodes());
        rootSvg.interrupt().selectAll("*").remove();
        rootSvg.on(".zoom", null).on(".treemap", null);
        tooltipNode.classList.remove("is-visible");
        tooltipNode.setAttribute("aria-hidden", "true");
        zoomControls.querySelectorAll("button").forEach((button) => { button.disabled = !rows.length; });
        note.hidden = !rows.length;
        shell.querySelector(".employment-treemap-empty")?.remove();
        if (!rows.length) {
          meta.textContent = `${scopeLabel()} / aucun secteur exploitable`;
          legend.replaceChildren();
          shell.classList.add("is-empty");
          rootSvg.style("display", "none");
          zoomLevel.textContent = "—";
          const empty = document.createElement("div");
          empty.className = "employment-treemap-empty";
          shell.appendChild(empty);
          renderEmptyState(empty, "Composition indisponible", "Les séries sectorielles ne contiennent pas de niveau exploitable pour ce territoire.");
          return;
        }
        shell.classList.remove("is-empty");
        rootSvg.style("display", null);
        const previousViewBox = rootSvg.attr("viewBox");
        const { width, height } = sectorTreemapDimensions(shell);
        const padding = width < 640 ? 10 : 14;
        const color = sectorTreemapColorScale(rows);
        const latestDate = rows[0].date;
        const layoutRows = sectorTreemapLayoutRows(rows, width - padding * 2, height - padding * 2);

        meta.textContent = `${scopeLabel()} / ${quarterLabel(latestDate)}`;
        const legendChip = (stateName, label) => {
          const chip = document.createElement("span");
          chip.className = "legend-chip";
          chip.append(textElement("i", "", `employment-treemap-swatch is-${stateName}`), document.createTextNode(label));
          return chip;
        };
        legend.replaceChildren(
          legendChip("negative", "Repli annuel"),
          legendChip("neutral", "Quasi stable"),
          legendChip("positive", "Hausse annuelle"),
        );
        if (rows.some((row) => !Number.isFinite(row.yoy))) {
          legend.append(legendChip("unknown", "GA indisponible"));
        }
        rootSvg.attr("viewBox", `0 0 ${width} ${height}`);
        rootSvg.append("title").attr("id", "employmentTreemapTitleSvg")
          .text(`Composition sectorielle des ${metric.label.toLowerCase()} en ${scopeLabel()}`);
        rootSvg.append("desc").attr("id", "employmentTreemapDescSvg")
          .text("Chaque secteur affiche son nom, son niveau et son glissement annuel. La surface représente le niveau, avec un minimum pour les petits secteurs, et la couleur représente le glissement annuel. Utilisez + et − pour zoomer, les flèches pour déplacer et 0 pour recentrer.");

        const root = d3.hierarchy({ children: layoutRows })
          .sum((row) => row.layoutValue)
          .sort((left, right) => right.value - left.value);
        d3.treemap()
          .tile(d3.treemapSquarify.ratio(1))
          .size([width - padding * 2, height - padding * 2])
          .paddingInner(5)
          .paddingOuter(0)
          .round(true)(root);

        const previousTransform = previousViewBox === `0 0 ${width} ${height}` ? d3.zoomTransform(rootSvg.node()) : d3.zoomIdentity;
        const viewport = rootSvg.append("g").attr("class", "employment-treemap-viewport");
        const chart = viewport.append("g").attr("transform", `translate(${padding},${padding})`);
        const leaves = chart.selectAll("g")
          .data(root.leaves())
          .join("g")
          .attr("class", "employment-treemap-tile")
          .attr("transform", (leaf) => `translate(${leaf.x0},${leaf.y0})`)
          .attr("tabindex", 0).attr("role", "img")
          .attr("aria-label", (leaf) => `${sectorTreemapTrimLabel(leaf.data.label)}. ${metric.label} : ${sectorTreemapMetricFormatter(metricKey, leaf.data.value)}. Glissement annuel : ${sectorTreemapAnnualFormatter(leaf.data.yoy)}. ${quarterLabel(leaf.data.date)}.`);

        leaves.append("rect")
          .attr("width", (leaf) => Math.max(0, leaf.x1 - leaf.x0))
          .attr("height", (leaf) => Math.max(0, leaf.y1 - leaf.y0))
          .attr("rx", 8)
          .attr("fill", (leaf) => color(leaf.data.yoy))
          .attr("stroke", "rgba(255,255,255,0.9)")
          .attr("stroke-width", 1)
          .attr("vector-effect", "non-scaling-stroke");

        leaves.each(function(leaf) {
          drawSectorTreemapLabel(d3.select(this), leaf, metricKey);
        });

        const tooltipOverline = tooltipNode.querySelector(".tooltip-overline");
        const tooltipBody = tooltipNode.querySelector(".tooltip-body");
        const tooltipTitle = textElement("div", "", "employment-treemap-tooltip-title");
        const tooltipMetrics = document.createElement("div");
        tooltipMetrics.className = "employment-treemap-tooltip-metrics";
        const tooltipLevel = document.createElement("div");
        const tooltipAnnual = document.createElement("div");
        const tooltipLevelValue = textElement("strong", "", "employment-treemap-tooltip-value");
        const tooltipAnnualValue = textElement("strong", "", "employment-treemap-tooltip-value");
        tooltipLevel.append(textElement("span", metric.label), tooltipLevelValue);
        tooltipAnnual.append(textElement("span", "Glissement annuel"), tooltipAnnualValue);
        tooltipMetrics.append(tooltipLevel, tooltipAnnual);
        tooltipBody.replaceChildren(tooltipTitle, tooltipMetrics);
        let tooltipKey = null;
        let tooltipWidth = 0;
        let tooltipHeight = 0;
        let interacting = false;

        function hideTreemapTooltip() {
          tooltipNode.classList.remove("is-visible");
          tooltipNode.setAttribute("aria-hidden", "true");
          leaves.classed("is-hovered", false);
        }

        function showTreemapTooltip(event, row) {
          if (interacting) return;
          const shellBounds = shell.getBoundingClientRect();
          if (tooltipKey !== row.key) {
            tooltipKey = row.key;
            tooltipOverline.textContent = `${row.naceCode} · ${quarterLabel(row.date)}`;
            tooltipTitle.textContent = sectorTreemapTrimLabel(row.label);
            tooltipLevelValue.textContent = sectorTreemapMetricFormatter(metricKey, row.value);
            tooltipAnnualValue.textContent = sectorTreemapAnnualFormatter(row.yoy);
            tooltipWidth = tooltipNode.offsetWidth;
            tooltipHeight = tooltipNode.offsetHeight;
          }
          tooltipNode.classList.add("is-visible");
          tooltipNode.setAttribute("aria-hidden", "false");

          const gap = 14;
          const margin = 12;
          const left = Math.max(margin, margin - shellBounds.left);
          const right = Math.min(shellBounds.width - margin, window.innerWidth - shellBounds.left - margin);
          const top = Math.max(margin, margin - shellBounds.top);
          const bottom = Math.min(shellBounds.height - margin, window.innerHeight - shellBounds.top - margin);
          let x = event.clientX - shellBounds.left + gap;
          let y = event.clientY - shellBounds.top - tooltipHeight - gap;
          if (x + tooltipWidth > right) x -= tooltipWidth + gap * 2;
          if (y < top) y = event.clientY - shellBounds.top + gap;
          tooltipNode.style.left = `${Math.max(left, Math.min(x, right - tooltipWidth))}px`;
          tooltipNode.style.top = `${Math.max(top, Math.min(y, bottom - tooltipHeight))}px`;
        }

        leaves
          .on("mouseenter", function(event, leaf) {
            if (interacting) return;
            leaves.classed("is-hovered", false);
            d3.select(this).classed("is-hovered", true);
            showTreemapTooltip(event, leaf.data);
          })
          .on("mousemove", (event, leaf) => showTreemapTooltip(event, leaf.data))
          .on("mouseleave", function() {
            hideTreemapTooltip();
          })
          .on("focus", function(event, leaf) {
            d3.select(this).classed("is-hovered", true);
            const bounds = this.getBoundingClientRect();
            showTreemapTooltip({ clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }, leaf.data);
          })
          .on("blur", hideTreemapTooltip)
          .on("click", (event, leaf) => showTreemapTooltip(event, leaf.data));
        rootSvg.on("mouseleave.treemap", hideTreemapTooltip);

        const zoom = d3.zoom()
          .extent([[0, 0], [width, height]])
          .scaleExtent([1, 6])
          .translateExtent([[-width / 2, -height / 2], [width * 1.5, height * 1.5]])
          .clickDistance(4)
          .duration(REDUCED_MOTION ? 0 : 200)
          .on("start", () => {
            interacting = true;
            shell.classList.add("is-interacting");
            hideTreemapTooltip();
          })
          .on("zoom", (event) => {
            viewport.attr("transform", event.transform);
            zoomLevel.textContent = `${Math.round(event.transform.k * 100)} %`;
            zoomControls.querySelector('[data-treemap-action="out"]').disabled = event.transform.k <= 1.001;
            zoomControls.querySelector('[data-treemap-action="in"]').disabled = event.transform.k >= 5.999;
          })
          .on("end", () => {
            interacting = false;
            shell.classList.remove("is-interacting");
          });
        rootSvg.call(zoom).call(zoom.transform, previousTransform);
        if (!sectorTreemapResizeObserver) {
          sectorTreemapResizeObserver = new ResizeObserver(scheduleSectorTreemapResize);
          sectorTreemapResizeObserver.observe(shell);
          window.addEventListener("resize", scheduleSectorTreemapResize);
        }
        zoomControls.onclick = (event) => {
          const action = event.target.closest("[data-treemap-action]")?.dataset.treemapAction;
          if (!action) return;
          const target = REDUCED_MOTION ? rootSvg.interrupt() : rootSvg.interrupt().transition().duration(180);
          if (action === "reset") target.call(zoom.transform, d3.zoomIdentity);
          else target.call(zoom.scaleBy, action === "in" ? 1.5 : 1 / 1.5);
        };
        rootSvg.on("keydown.treemap", (event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const pan = { ArrowLeft: [48, 0], ArrowRight: [-48, 0], ArrowUp: [0, 48], ArrowDown: [0, -48] }[event.key];
          if (pan) {
            event.preventDefault();
            rootSvg.interrupt().call(zoom.translateBy, pan[0] / d3.zoomTransform(rootSvg.node()).k, pan[1] / d3.zoomTransform(rootSvg.node()).k);
          } else if (["+", "=", "-", "−", "0", "Home", "Escape"].includes(event.key)) {
            event.preventDefault();
            rootSvg.interrupt();
            if (event.key === "Escape") hideTreemapTooltip();
            else if (event.key === "0" || event.key === "Home") rootSvg.call(zoom.transform, d3.zoomIdentity);
            else rootSvg.call(zoom.scaleBy, event.key === "+" || event.key === "=" ? 1.5 : 1 / 1.5);
          }
        });
        if (!sectorTreemapFontsBound) {
          sectorTreemapFontsBound = true;
          onFontsReady(scheduleSectorTreemapLabelFit);
        }
        scheduleSectorTreemapLabelFit();

        if (!REDUCED_MOTION) {
          gsap.fromTo(
            leaves.nodes(),
            { opacity: 0 },
            { opacity: 1, duration: 0.35, stagger: 0.006, ease: "power2.out" },
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

      function sectorDepartmentIndex(departments) {
        let index = sectorDepartmentsByScope.get(departments);
        if (!index) {
          index = new Map(departments.map((department) => [department.code, department]));
          sectorDepartmentsByScope.set(departments, index);
        }
        return index;
      }

      // Seuls les chemins calculés sont conservés ; la projection ne dépend pas des métriques.
      function departmentMapGeometry(features) {
        const projection = d3.geoMercator().fitExtent([[32, 32], [868, 588]], { type: "FeatureCollection", features });
        const path = d3.geoPath(projection);
        return { features, paths: new Map(features.map((feature) => [feature.properties.code, path(feature)])) };
      }

      function showSectorDepartmentTooltip(event, feature) {
        sectorDepartmentHover = { element: event.currentTarget, feature, clientX: event.clientX, clientY: event.clientY };
        updateSectorDepartmentTooltip(event, feature);
      }

      function updateSectorDepartmentTooltip(event, feature) {
        const departments = DATA.modules.sector.departmental.regions[state.selectedRegion]?.departments;
        const department = departments ? sectorDepartmentIndex(departments).get(feature.properties.code) : null;
        const value = department ? departmentMetricValue(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric) : null;
        showTooltip(event, department ? department.name : feature.properties.nom, departmentMetricFormatter(state.sectorDepartmentMetric, value));
      }

      function hideSectorDepartmentTooltip() {
        sectorDepartmentHover = null;
        hideTooltip();
      }

      function refreshSectorDepartmentTooltip() {
        const hovered = sectorDepartmentHover;
        if (hovered?.element.isConnected && hovered.element.matches(":hover") && tooltip.classList.contains("is-visible")) {
          updateSectorDepartmentTooltip(hovered, hovered.element.__data__);
        }
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
          renderSectorDepartmentModule();
        });

        if (!state.sectorDepartmentSectorKey) {
          state.sectorDepartmentSectorKey = departmentModule.defaultSectorKey;
        }
        renderEmploymentSectorPicker(
          "employmentDeptSectorPicker",
          departmentModule.sectorOptions,
          "sectorDepartmentSectorKey",
          renderSectorDepartmentModule,
          EMPLOYMENT_GRAND_SECTOR_GROUPS,
        );

        if (state.phase === "national") {
          sectorDepartmentHover = null;
          mapMeta.textContent = "Choisir une région pour ouvrir la maille départementale";
          rankingMeta.textContent = "Lecture régionale requise";
          renderEmptyState(mapShell, "Choisir une région", "La carte départementale s'active après sélection d'un territoire dans la barre des régions.");
          legend.replaceChildren();
          renderEmptyState(ranking, "Classement indisponible", "Le classement départemental n'est pas affiché à l'échelle France entière.");
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
          sectorDepartmentHover = null;
          renderEmptyState(mapShell, "Données indisponibles", "Le fichier départemental ne documente pas ce territoire pour le dernier trimestre retenu.");
          legend.replaceChildren();
          renderEmptyState(ranking, "Aucun classement", "Les départements de cette région ne sont pas présents dans la source départementale fournie.");
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

        if (!document.getElementById("employmentDeptMapSvg")) {
          mapShell.replaceChildren(svgElement("svg", { id: "employmentDeptMapSvg", viewBox: "0 0 900 620" }));
        }
        const svg = d3.select("#employmentDeptMapSvg");
        const departmentsByCode = sectorDepartmentIndex(regionScope);
        const geometryChanged = !sectorDepartmentGeometry || sectorDepartmentGeometry.features !== features;
        if (geometryChanged) {
          sectorDepartmentGeometry = departmentMapGeometry(features);
        }
        let root = svg.select("g");
        if (root.empty()) root = svg.append("g");
        const paths = root
          .selectAll("path")
          .data(features, (feature) => feature.properties.code)
          .join((enter) => enter.append("path")
            .attr("d", (feature) => sectorDepartmentGeometry.paths.get(feature.properties.code))
            .on("mouseenter", showSectorDepartmentTooltip)
            .on("mousemove", showSectorDepartmentTooltip)
            .on("mouseleave", hideSectorDepartmentTooltip));
        if (geometryChanged) paths.attr("d", (feature) => sectorDepartmentGeometry.paths.get(feature.properties.code));
        paths
          .attr("class", (feature) => `path-department${departmentsByCode.has(feature.properties.code) ? "" : " is-unavailable"}`)
          .attr("fill", (feature) => {
            const department = departmentsByCode.get(feature.properties.code);
            const value = department ? departmentMetricValue(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric) : null;
            return value != null ? scale(value) : paletteToken("map-empty", "rgba(255,255,255,0.05)");
          });

        const domain = d3.extent(values);
        rangeLegend(legend, departmentMetricFormatter(state.sectorDepartmentMetric, domain[0]), departmentMetricFormatter(state.sectorDepartmentMetric, domain[1]));

        const articles = regionScope
          .map((department) => ({
            ...department,
            metricValue: departmentMetricValue(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric),
            yoyValue: departmentMetricYoY(department, state.sectorDepartmentSectorKey, state.sectorDepartmentMetric),
          }))
          .filter((department) => department.metricValue != null)
          .sort((left, right) => right.metricValue - left.metricValue)
          .map((department) => rankingArticle(department.name, departmentMetricFormatter(state.sectorDepartmentMetric, department.metricValue), scopeLabel(), `Glissement annuel : ${formatPercent(department.yoyValue)}`));
        ranking.replaceChildren(...articles);
        if (!geometryChanged) refreshSectorDepartmentTooltip();
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
