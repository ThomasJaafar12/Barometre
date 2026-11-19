      const employmentPointWindows = new WeakMap();
      const employmentLatestRowsByScope = new WeakMap();
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

        const focusedTile = rootSvg.node().contains(document.activeElement) ? document.activeElement.dataset.sectorKey : null;
        dismissVizTooltip(rootSvg.node());
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
        const color = treemapVariationColorScale(rows, (row) => row.yoy);
        const latestDate = rows[0].date;
        const layoutRows = sectorTreemapLayoutRows(rows, width - padding * 2, height - padding * 2);

        meta.textContent = `${scopeLabel()} / ${quarterLabel(latestDate)}`;
        legend.replaceChildren(...treemapVariationLegend({
          negative: "Repli annuel",
          positive: "Hausse annuelle",
          missing: rows.some((row) => !Number.isFinite(row.yoy)) ? "GA indisponible" : null,
        }));
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
          .attr("data-sector-key", (leaf) => leaf.data.key);

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
        }

        function showTreemapTooltip(event, row) {
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

        bindVizTooltip(leaves, {
          label: ({ data: row }) => `${sectorTreemapTrimLabel(row.label)}. ${metric.label} : ${sectorTreemapMetricFormatter(metricKey, row.value)}. Glissement annuel : ${sectorTreemapAnnualFormatter(row.yoy)}. ${quarterLabel(row.date)}.`,
          show: (position, leaf) => showTreemapTooltip(position, leaf.data),
          hide: hideTreemapTooltip,
          enabled: () => !interacting,
        });

        const zoom = d3.zoom()
          .extent([[0, 0], [width, height]])
          .scaleExtent([1, 6])
          .translateExtent([[-width / 2, -height / 2], [width * 1.5, height * 1.5]])
          .clickDistance(4)
          .duration(REDUCED_MOTION ? 0 : 200)
          .on("start", () => {
            interacting = true;
            shell.classList.add("is-interacting");
            dismissVizTooltip(rootSvg.node());
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
        if (focusedTile) leaves.filter((leaf) => leaf.data.key === focusedTile).node()?.focus({ preventScroll: true });
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
          } else if (["+", "=", "-", "−", "0", "Home"].includes(event.key)) {
            event.preventDefault();
            rootSvg.interrupt();
            if (event.key === "0" || event.key === "Home") rootSvg.call(zoom.transform, d3.zoomIdentity);
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

      function renderSectorDepartmentModule() {
        const data = DATA.modules.sector.departmental;
        renderEmploymentDepartment({
          prefix: "employmentDept", data, sectors: data.sectorOptions, groups: EMPLOYMENT_GRAND_SECTOR_GROUPS,
          sectorState: "sectorDepartmentSectorKey", metricState: "sectorDepartmentMetric",
          endpoints: [paletteToken("chart-employment-dept-low", "#F7C96B"), paletteToken("chart-employment-dept-high", "#E86E2A")],
          color: "#A84A18",
        });
      }

      function renderSectorModule() {
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
