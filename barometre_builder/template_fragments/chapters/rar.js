      function renderSparkline(container, values, color) {
        const width = 240;
        const height = 44;
        const svg = d3.create("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "sparkline-canvas");
        const x = d3.scaleLinear().domain([0, values.length - 1]).range([4, width - 4]);
        const y = d3.scaleLinear().domain(d3.extent(values)).nice().range([height - 6, 6]);
        const line = d3.line().x((_, index) => x(index)).y((value) => y(value)).curve(d3.curveMonotoneX);
        svg.append("path").attr("d", line(values)).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.5);
        container.appendChild(svg.node());
      }

      function renderRarModule() {
        const subtitle = document.getElementById("rarSubtitle");
        const primaryTitle = document.getElementById("rarPrimaryTitle");
        const primaryMeta = document.getElementById("rarPrimaryMeta");
        const secondaryTitle = document.getElementById("rarSecondaryTitle");
        const secondaryMeta = document.getElementById("rarSecondaryMeta");
        const secondaryBody = document.getElementById("rarSecondaryBody");

        renderMetricSwitch("rarMetricSwitch", DATA.modules.rar.metrics, state.rarMetric, (key) => {
          state.rarMetric = key;
          renderRarModule();
        });

        if (state.phase === "national") {
          subtitle.textContent = `France entière / ${monthLabel(DATA.modules.rar.latestDate)} / choropleth régional + rail de séries récentes`;
          primaryTitle.textContent = "Carte des tensions";
          primaryMeta.textContent = DATA.modules.rar.metrics.find((metric) => metric.key === state.rarMetric).label;
          secondaryTitle.textContent = "Régions à surveiller";
          secondaryMeta.textContent = "12 derniers mois";

          const svg = d3.select("#rarPrimarySvg");
          svg.selectAll("*").remove();
          const latestMap = new Map(DATA.modules.rar.national.latestByMetric[state.rarMetric].map((item) => [item.code, item.value]));
          const values = [...latestMap.values()].filter((value) => value != null);
          const scale = buildScale(d3.extent(values), [paletteToken("chart-rar-low", "rgba(255,255,255,0.06)"), paletteToken("chart-rar-high", "rgba(255,151,131,0.92)")]);
          drawCompositeMap(svg, displayRegionsGeojson, {
            clickable: false,
            keyResolver: (feature) => feature.properties.code,
            regionResolver: (feature) => feature.properties.code,
            className: () => "path-region",
            fillResolver: (feature) => {
              const value = latestMap.get(feature.properties.code);
              return value != null ? scale(value) : paletteToken("map-empty", "rgba(255,255,255,0.05)");
            },
            tooltipResolver: (feature) => ({ label: regionsByCode.get(feature.properties.code).name, value: formatPercent(latestMap.get(feature.properties.code)) }),
          });

          secondaryBody.innerHTML = "";
          const sparklineStack = document.createElement("div");
          sparklineStack.className = "sparkline-stack";
          DATA.modules.rar.national.latestByMetric[state.rarMetric].slice(0, 8).forEach((entry) => {
            const row = document.createElement("div");
            row.className = "sparkline-row";
            row.innerHTML = `<div class="topline"><strong>${entry.name}</strong><strong>${formatPercent(entry.value)}</strong></div><div class="sparkline-value">${entry.yearlyChange != null ? `Glissement annuel ${formatPercent(entry.yearlyChange)}` : "—"}</div>`;
            const series = ((DATA.modules.rar.regions[entry.code] && DATA.modules.rar.regions[entry.code].points) || []).slice(-12).map((point) => point[state.rarMetric]).filter((value) => value != null);
            renderSparkline(row, series.length ? series : [0, 0], "var(--danger)");
            sparklineStack.appendChild(row);
          });
          secondaryBody.appendChild(sparklineStack);
          return;
        }

        const scope = DATA.modules.rar.regions[state.selectedRegion];
        if (!scope || !scope.points || !scope.points.length) {
          subtitle.textContent = `${scopeLabel()} / aucun historique RAR exploitable.`;
          renderEmptyState(document.getElementById("rarPrimaryPanel"), "RAR indisponible", "La mesure n'existe pas pour ce territoire dans les CSV fournis.");
          secondaryBody.innerHTML = "";
          return;
        }

        subtitle.textContent = `${scopeLabel()} / 36 derniers mois / trois courbes pour lire le relief du recouvrement`;
        primaryTitle.textContent = "Courbes mensuelles";
        primaryMeta.textContent = monthLabel(scope.points[scope.points.length - 1].date);
        secondaryTitle.textContent = "Dernier point";
        secondaryMeta.textContent = "Lecture simultanée";

        const svg = d3.select("#rarPrimarySvg");
        svg.selectAll("*").remove();
        const points = scope.points.slice(-36);
        const margin = { top: 20, right: 24, bottom: 34, left: 52 };
        const width = 760 - margin.left - margin.right;
        const height = 420 - margin.top - margin.bottom;
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const x = d3.scaleTime().domain(d3.extent(points, (point) => new Date(`${point.date}T00:00:00`))).range([0, width]);
        const y = d3.scaleLinear()
          .domain([
            0,
            d3.max(points, (point) => Math.max(
              point.rar_fin_mois ?? 0,
              point.rar_mois_suivant ?? 0,
              point.rar_90 ?? 0,
            )) || 1,
          ])
          .nice()
          .range([height, 0]);
        const palette = {
          rar_fin_mois: paletteToken("chart-rar-fin", "#8db8ff"),
          rar_mois_suivant: paletteToken("chart-rar-next", "#ffd37a"),
          rar_90: paletteToken("chart-rar-90", "#ff9783"),
        };
        ["rar_fin_mois", "rar_mois_suivant", "rar_90"].forEach((key) => {
          const line = d3.line()
            .defined((point) => point[key] != null)
            .x((point) => x(new Date(`${point.date}T00:00:00`)))
            .y((point) => y(point[key]))
            .curve(d3.curveMonotoneX);
          g.append("path")
            .attr("d", line(points))
            .attr("fill", "none")
            .attr("stroke", palette[key])
            .attr("stroke-width", key === "rar_90" ? 3 : 2.4);
        });
        g.append("g")
          .attr("transform", `translate(0,${height})`)
          .call(d3.axisBottom(x).ticks(6).tickFormat((date) => date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })))
          .call((axis) => axis.selectAll("text").attr("fill", "rgba(238,247,255,0.52)").style("font-size", "11px"))
          .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.08)"));
        g.append("g")
          .call(d3.axisLeft(y).ticks(5).tickFormat((value) => formatPercent(value)))
          .call((axis) => axis.selectAll("text").attr("fill", "rgba(238,247,255,0.52)").style("font-size", "11px"))
          .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.08)"));

        secondaryBody.innerHTML = `<div class="mini-grid"><article class="mini-stat"><small>Fin de mois</small><strong>${formatPercent(points[points.length - 1].rar_fin_mois)}</strong><span>${monthLabel(points[points.length - 1].date)}</span></article><article class="mini-stat"><small>Mois suivant</small><strong>${formatPercent(points[points.length - 1].rar_mois_suivant)}</strong><span>${monthLabel(points[points.length - 1].date)}</span></article><article class="mini-stat"><small>+90 jours</small><strong>${formatPercent(points[points.length - 1].rar_90)}</strong><span>${monthLabel(points[points.length - 1].date)}</span></article></div>`;
      }
