      function getPayrollScopeData() {
        return state.phase === "national" ? DATA.modules.payroll.national : DATA.modules.payroll.regions[state.selectedRegion];
      }

      function renderPayrollModule() {
        const scope = getPayrollScopeData();
        const subtitle = document.getElementById("payrollSubtitle");
        const chartMeta = document.getElementById("payrollChartMeta");
        const statsMeta = document.getElementById("payrollStatsMeta");
        const stats = document.getElementById("payrollStats");
        const panel = document.getElementById("payrollSvg").parentElement;
        if (!scope || !scope.points || !scope.points.length) {
          subtitle.textContent = `${scopeLabel()} / aucun flux mensuel exploitable.`;
          renderEmptyState(panel, "Flux indisponible", "Le couple masse salariale / chômage partiel manque pour ce territoire.");
          stats.innerHTML = "";
          return;
        }

        subtitle.textContent = `${scopeLabel()} / lecture mensuelle / masse salariale + part de l'assiette chômage partiel`;
        chartMeta.textContent = `Fenêtre mobile / ${monthLabel(scope.points[0].date)} → ${monthLabel(scope.latestDate)}`;
        statsMeta.textContent = `Dernier mois / ${monthLabel(scope.latestDate)}`;

        const points = scope.points.slice(-48);
        const svg = d3.select("#payrollSvg");
        svg.selectAll("*").remove();
        const margin = { top: 18, right: 58, bottom: 34, left: 58 };
        const width = 760 - margin.left - margin.right;
        const height = 420 - margin.top - margin.bottom;
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const x = d3.scaleTime().domain(d3.extent(points, (point) => new Date(`${point.date}T00:00:00`))).range([0, width]);
        const yLeft = d3.scaleLinear().domain([0, d3.max(points, (point) => point.payroll) || 1]).nice().range([height, 0]);
        const yRight = d3.scaleLinear().domain([0, d3.max(points, (point) => point.share) || 1]).nice().range([height, 0]);
        const area = d3.area()
          .x((point) => x(new Date(`${point.date}T00:00:00`)))
          .y0(height)
          .y1((point) => yLeft(point.payroll))
          .curve(d3.curveMonotoneX);
        const line = d3.line()
          .x((point) => x(new Date(`${point.date}T00:00:00`)))
          .y((point) => yRight(point.share))
          .curve(d3.curveMonotoneX);

        g.append("path").attr("d", area(points)).attr("fill", paletteToken("chart-payroll-area", "rgba(120,236,203,0.18)"));
        g.append("path").attr("d", d3.line().x((point) => x(new Date(`${point.date}T00:00:00`))).y((point) => yLeft(point.payroll)).curve(d3.curveMonotoneX)(points))
          .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 3.4);
        g.append("path").attr("d", line(points)).attr("fill", "none").attr("stroke", "var(--warning)").attr("stroke-width", 2.4).attr("stroke-dasharray", "7 7");
        g.append("g")
          .attr("transform", `translate(0,${height})`)
          .call(d3.axisBottom(x).ticks(6).tickFormat((date) => date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })))
          .call((axis) => axis.selectAll("text").attr("fill", "rgba(238,247,255,0.52)").style("font-size", "11px"))
          .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.08)"));
        g.append("g")
          .call(d3.axisLeft(yLeft).ticks(5).tickFormat((value) => formatCurrency(value)))
          .call((axis) => axis.selectAll("text").attr("fill", "rgba(238,247,255,0.52)").style("font-size", "11px"))
          .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.08)"));
        g.append("g")
          .attr("transform", `translate(${width},0)`)
          .call(d3.axisRight(yRight).ticks(5).tickFormat((value) => formatPercent(value)))
          .call((axis) => axis.selectAll("text").attr("fill", "rgba(238,247,255,0.52)").style("font-size", "11px"))
          .call((axis) => axis.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.08)"));

        const latest = points[points.length - 1];
        const previous = points[points.length - 2] || latest;
        stats.innerHTML = "";
        [
          { label: "Masse salariale", value: formatCurrency(latest.payroll), meta: monthLabel(latest.date) },
          { label: "Part chômage partiel", value: formatPercent(latest.share), meta: "recalcul national si nécessaire" },
          { label: "Variation annuelle", value: formatPercent(latest.yearlyChange), meta: previous ? `vs ${monthLabel(previous.date)}` : "—" },
        ].forEach((entry) => {
          const article = document.createElement("article");
          article.className = "mini-stat";
          article.innerHTML = `<small>${entry.label}</small><strong>${entry.value}</strong><span>${entry.meta}</span>`;
          stats.appendChild(article);
        });
      }
