      function getSectorScopeData() {
        return state.phase === "national" ? DATA.modules.sector.national : DATA.modules.sector.regions[state.selectedRegion];
      }

      function renderSectorModule() {
        const scope = getSectorScopeData();
        const subtitle = document.getElementById("sectorSubtitle");
        const rankingMeta = document.getElementById("sectorRankingMeta");
        const seriesTitle = document.getElementById("sectorSeriesTitle");
        const seriesMeta = document.getElementById("sectorSeriesMeta");
        renderMetricSwitch("sectorMetricSwitch", DATA.modules.sector.metrics, state.sectorMetric, (key) => {
          state.sectorMetric = key;
          renderSectorModule();
        });

        if (!scope || !scope.latest || !scope.latest.length) {
          subtitle.textContent = `${scopeLabel()} / données indisponibles dans les CSV fournis.`;
          renderEmptyState(document.getElementById("sectorRankingSvg").parentElement, "Aucune série", "Ce territoire ne dispose pas de ventilation sectorielle exploitable.");
          renderEmptyState(document.getElementById("sectorSeriesSvg").parentElement, "Aucune trajectoire", "La sélection ne peut pas être tracée avec les données actuelles.");
          return;
        }

        if (!scope.series[state.sectorKey]) {
          state.sectorKey = scope.defaultSector;
        }
        const sorted = [...scope.latest].sort((a, b) => (b[state.sectorMetric] || 0) - (a[state.sectorMetric] || 0));
        const top = sorted.slice(0, 12);
        const selectedSeries = scope.series[state.sectorKey] || scope.series[scope.defaultSector];
        subtitle.textContent = `${scopeLabel()} / lecture ${quarterLabel(scope.latestDate)} / classement cliquable + trajectoire liée`;
        rankingMeta.textContent = state.sectorMetric === "effectifs_cvs" ? "Classement par effectifs CVS" : "Classement par masse salariale CVS";
        seriesTitle.textContent = selectedSeries ? selectedSeries.label : "Trajectoire";
        seriesMeta.textContent = selectedSeries ? `Série complète / ${quarterLabel(scope.latestDate)}` : "";

        const rankingSvg = d3.select("#sectorRankingSvg");
        rankingSvg.selectAll("*").remove();
        const margin = { top: 16, right: 22, bottom: 18, left: 210 };
        const width = 640 - margin.left - margin.right;
        const height = Math.max(360, top.length * 34);
        const g = rankingSvg.attr("viewBox", `0 0 640 ${height + 40}`).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const x = d3.scaleLinear().domain([0, d3.max(top, (d) => d[state.sectorMetric]) || 1]).range([0, width]);
        const y = d3.scaleBand().domain(top.map((item) => item.key)).range([0, height]).padding(0.24);
        const color = d3.scaleLinear().domain([0, top.length - 1]).range([paletteToken("chart-sector-start", "rgba(141,184,255,0.96)"), paletteToken("chart-sector-end", "rgba(120,236,203,0.96)")]);

        g.selectAll(".bar")
          .data(top)
          .join("rect")
          .attr("x", 0)
          .attr("y", (d) => y(d.key))
          .attr("height", y.bandwidth())
          .attr("width", (d) => x(d[state.sectorMetric] || 0))
          .attr("rx", 12)
          .attr("fill", (_, index) => color(index))
          .attr("opacity", (d) => (d.key === state.sectorKey ? 1 : 0.62))
          .style("cursor", "pointer")
          .on("click", (_, datum) => {
            state.sectorKey = datum.key;
            renderSectorModule();
          });

        g.selectAll(".sector-label")
          .data(top)
          .join("text")
          .attr("x", -16)
          .attr("y", (d) => (y(d.key) || 0) + y.bandwidth() / 2 + 5)
          .attr("text-anchor", "end")
          .attr("fill", "rgba(238,247,255,0.82)")
          .style("font-size", "13px")
          .style("font-weight", (d) => (d.key === state.sectorKey ? 800 : 600))
          .text((d) => d.label.length > 34 ? `${d.label.slice(0, 34)}…` : d.label);

        g.selectAll(".bar-value")
          .data(top)
          .join("text")
          .attr("x", (d) => x(d[state.sectorMetric] || 0) + 10)
          .attr("y", (d) => (y(d.key) || 0) + y.bandwidth() / 2 + 5)
          .attr("fill", "rgba(238,247,255,0.76)")
          .style("font-size", "12px")
          .text((d) => state.sectorMetric === "effectifs_cvs" ? formatCount(d.effectifs_cvs) : formatCurrency(d.masse_cvs));

        const seriesSvg = d3.select("#sectorSeriesSvg");
        seriesSvg.selectAll("*").remove();
        const seriesMargin = { top: 18, right: 18, bottom: 36, left: 48 };
        const seriesWidth = 640 - seriesMargin.left - seriesMargin.right;
        const seriesHeight = 520 - seriesMargin.top - seriesMargin.bottom;
        const seriesG = seriesSvg.append("g").attr("transform", `translate(${seriesMargin.left},${seriesMargin.top})`);
        const points = selectedSeries.points.map((point) => ({ ...point, value: point[state.sectorMetric] || 0 }));
        const xScale = d3.scaleTime().domain(d3.extent(points, (point) => new Date(`${point.date}T00:00:00`))).range([0, seriesWidth]);
        const yScale = d3.scaleLinear().domain([0, d3.max(points, (point) => point.value) || 1]).nice().range([seriesHeight, 0]);
        const area = d3.area()
          .x((point) => xScale(new Date(`${point.date}T00:00:00`)))
          .y0(seriesHeight)
          .y1((point) => yScale(point.value))
          .curve(d3.curveCatmullRom.alpha(0.6));
        const line = d3.line()
          .x((point) => xScale(new Date(`${point.date}T00:00:00`)))
          .y((point) => yScale(point.value))
          .curve(d3.curveCatmullRom.alpha(0.6));
        seriesG.append("path").attr("d", area(points)).attr("fill", paletteToken("chart-sector-area", "rgba(141,184,255,0.18)"));
        seriesG.append("path").attr("d", line(points)).attr("fill", "none").attr("stroke", "var(--accent-secondary)").attr("stroke-width", 3.2);
        seriesG.append("g")
          .attr("transform", `translate(0,${seriesHeight})`)
          .call(d3.axisBottom(xScale).ticks(6).tickFormat((date) => `T${Math.floor(date.getMonth() / 3) + 1} ${String(date.getFullYear()).slice(-2)}`))
          .call((axis) => axis.selectAll("text").attr("fill", "rgba(238,247,255,0.52)").style("font-size", "11px"))
          .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.08)"));
        seriesG.append("g")
          .call(d3.axisLeft(yScale).ticks(5).tickFormat((value) => (state.sectorMetric === "effectifs_cvs" ? formatCount(value) : formatCurrency(value))))
          .call((axis) => axis.selectAll("text").attr("fill", "rgba(238,247,255,0.52)").style("font-size", "11px"))
          .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.08)"));
        const latestPoint = points[points.length - 1];
        seriesG.append("circle")
          .attr("cx", xScale(new Date(`${latestPoint.date}T00:00:00`)))
          .attr("cy", yScale(latestPoint.value))
          .attr("r", 4.5)
          .attr("fill", "#fff")
          .attr("stroke", "var(--accent-secondary)")
          .attr("stroke-width", 2.5);
      }
