      function renderQuarterlyModeSwitch(containerId, modes, currentMode, onSelect) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";
        modes.forEach((mode) => {
          const btn = document.createElement("button");
          btn.type = "button";
          const isActive = mode.id === currentMode;
          btn.className = `metric-button${isActive ? " is-active" : ""}`;
          btn.setAttribute("aria-pressed", String(isActive));
          btn.textContent = mode.label;
          btn.addEventListener("click", () => {
            if (mode.id !== currentMode) {
              onSelect(mode.id);
            }
          });
          container.appendChild(btn);
        });
      }

      const quarterlyChartConfigs = new Map();
      let quarterlyResizeFrame = null;
      window.addEventListener("resize", () => {
        if (quarterlyResizeFrame != null) return;
        quarterlyResizeFrame = requestAnimationFrame(() => {
          quarterlyResizeFrame = null;
          quarterlyChartConfigs.forEach((config) => {
            const node = document.getElementById(config.svgId);
            const availableWidth = node.getBoundingClientRect().width;
            const targetWidth = availableWidth < 600 ? Math.max(280, availableWidth) : 980;
            if (Math.abs(node.viewBox.baseVal.width - targetWidth) > 1) drawQuarterlyComparisonChart(config);
          });
        });
      });

      function drawQuarterlyComparisonChart(config) {
        const { svgId, tooltipId, points, series, description, scope } = config;
        quarterlyChartConfigs.set(svgId, config);
        const svg = d3.select(`#${svgId}`);
        const tooltip = document.getElementById(tooltipId);
        tooltip.classList.remove("is-visible");
        tooltip.setAttribute("aria-hidden", "true");
        svg.selectAll("*").remove();
        svg.append("title").attr("id", `${svgId}Title`).text(description);
        svg.append("desc").attr("id", `${svgId}Desc`).text(`${scope}. ${series.map((item) => item.label).join(" et ")}.`);
        svg.attr("aria-labelledby", `${svgId}Title ${svgId}Desc`);

        const availableWidth = svg.node().getBoundingClientRect().width;
        const compact = availableWidth < 600;
        const viewBoxWidth = compact ? Math.max(280, availableWidth) : 980;
        const viewBoxHeight = compact ? 360 : 560;
        svg.attr("viewBox", `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
        const margin = { top: 32, right: compact ? 58 : 74, bottom: compact ? 44 : 54, left: compact ? 56 : 74 };
        const width = viewBoxWidth - margin.left - margin.right;
        const height = viewBoxHeight - margin.top - margin.bottom;
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const muted = paletteToken("employment-chart-muted", "#64748B");
        const gridColor = paletteToken("employment-chart-grid", "rgba(148,163,184,0.18)");
        const gridStrong = paletteToken("employment-chart-grid-strong", "rgba(148,163,184,0.28)");

        if (!points.length) {
          g.append("text").attr("x", width / 2).attr("y", height / 2).attr("text-anchor", "middle")
            .attr("fill", muted).style("font-size", "18px").text("Aucune donnée disponible pour ce territoire.");
          return;
        }

        const dates = points.map((point) => point.date);
        const x = d3.scalePoint().domain(dates).range([0, width]).padding(0.3);
        const yScales = series.map((item) => d3.scaleLinear()
          .domain([0, Math.max(10, d3.max(points, (point) => point[item.key]) || 0) * 1.12]).nice().range([height, 0]));
        g.append("g").call(d3.axisLeft(yScales[0]).ticks(compact ? 4 : 6).tickSize(-width).tickFormat(""))
          .call((axis) => {
            axis.select(".domain").remove();
            axis.selectAll("line").attr("stroke", gridColor).attr("stroke-dasharray", "3 3");
          });

        const defs = svg.append("defs");
        const markers = [];
        series.forEach((item, index) => {
          const y = yScales[index];
          const gradientId = `${svgId}-area-${index}`;
          const gradient = defs.append("linearGradient").attr("id", gradientId)
            .attr("x1", "0%").attr("x2", "0%").attr("y1", "0%").attr("y2", "100%");
          gradient.append("stop").attr("offset", "0%").attr("stop-color", item.color).attr("stop-opacity", 0.2);
          gradient.append("stop").attr("offset", "100%").attr("stop-color", item.color).attr("stop-opacity", 0);
          const area = d3.area().x((point) => x(point.date)).y0(height).y1((point) => y(point[item.key])).curve(d3.curveMonotoneX);
          const line = d3.line().x((point) => x(point.date)).y((point) => y(point[item.key])).curve(d3.curveMonotoneX);
          g.append("path").attr("d", area(points)).attr("fill", `url(#${gradientId})`);
          g.append("path").attr("class", "quarterly-series").attr("data-metric", item.key)
            .attr("d", line(points)).attr("fill", "none").attr("stroke", item.color)
            .attr("stroke-width", compact ? 2.4 : 3.2).attr("stroke-linecap", "round");
          g.append("g").selectAll("circle").data(points).join("circle")
            .attr("cx", (point) => x(point.date)).attr("cy", (point) => y(point[item.key]))
            .attr("r", compact ? 2 : 3.5).attr("fill", item.color).attr("stroke", "#FFFFFF").attr("stroke-width", compact ? 1 : 1.8);

          const axis = g.append("g").attr("transform", `translate(${index ? width : 0},0)`)
            .call((index ? d3.axisRight(y) : d3.axisLeft(y)).ticks(compact ? 4 : 6).tickFormat(item.format));
          axis.select(".domain").attr("stroke", gridStrong);
          axis.selectAll("line").attr("stroke", gridStrong);
          axis.selectAll("text").attr("fill", item.color)
            .style("font-family", "IBM Plex Mono, monospace").style("font-size", "11px").style("font-weight", "600");
          axis.append("text").attr("x", index ? 10 : -10).attr("y", -14)
            .attr("fill", item.color).attr("text-anchor", index ? "end" : "start")
            .style("font-family", "Manrope, sans-serif").style("font-size", "11px").style("font-weight", "600").text(compact ? item.compactAxisLabel : item.axisLabel);
          markers.push(g.append("circle").attr("r", 6).attr("fill", item.color)
            .attr("stroke", "#FFFFFF").attr("stroke-width", 2.5).style("opacity", 0));
        });

        const tickStep = compact ? Math.max(1, Math.ceil(dates.length / 3)) : dates.length > 36 ? 4 : dates.length > 20 ? 2 : 1;
        const tickIndices = dates.map((_, index) => index).filter((index) => index % tickStep === 0);
        const lastIndex = dates.length - 1;
        if (tickIndices[tickIndices.length - 1] !== lastIndex) {
          if (lastIndex - tickIndices[tickIndices.length - 1] < tickStep * 0.65) tickIndices.pop();
          tickIndices.push(lastIndex);
        }
        const xAxis = g.append("g").attr("transform", `translate(0,${height})`)
          .call(d3.axisBottom(x).tickValues(tickIndices.map((index) => dates[index])).tickFormat(quarterLabel));
        xAxis.selectAll("path,line").attr("stroke", gridStrong);
        xAxis.selectAll("text").attr("fill", muted)
          .style("font-family", "IBM Plex Mono, monospace").style("font-size", "11px").attr("dy", "1.2em");

        const crosshair = g.append("line").attr("y1", 0).attr("y2", height)
          .attr("stroke", muted).attr("stroke-width", 1.2).attr("stroke-dasharray", "4 4").style("opacity", 0);
        const chartShell = tooltip.parentElement;
        const hideTooltip = () => {
          crosshair.style("opacity", 0);
          markers.forEach((marker) => marker.style("opacity", 0));
          tooltip.classList.remove("is-visible");
          tooltip.setAttribute("aria-hidden", "true");
        };
        const showTooltip = (event) => {
          const [mouseX] = d3.pointer(event, g.node());
          // The quarterly points are evenly spaced: locate the nearest in O(1).
          const index = Math.max(0, Math.min(points.length - 1, Math.round((mouseX - x(dates[0])) / (x.step() || 1))));
          const point = points[index];
          const posX = x(point.date);
          crosshair.attr("x1", posX).attr("x2", posX).style("opacity", 0.6);
          markers.forEach((marker, i) => marker.attr("cx", posX).attr("cy", yScales[i](point[series[i].key])).style("opacity", 1));
          tooltip.querySelector(".tooltip-overline").textContent = `${quarterLabel(point.date)} • ${scope}`;
          const body = tooltip.querySelector(".tooltip-body");
          body.replaceChildren();
          series.forEach((item) => {
            const row = document.createElement("div");
            row.className = "tooltip-row";
            const label = document.createElement("span");
            label.className = "tooltip-label";
            label.style.color = item.color;
            label.textContent = `${item.label} :`;
            const value = document.createElement("strong");
            const change = point[item.yoyKey];
            value.textContent = `${item.format(point[item.key])}${change == null ? "" : ` (${employmentSignedPercent(change)} /an)`}`;
            row.append(label, value);
            body.appendChild(row);
          });
          if (point.duree != null) {
            const row = document.createElement("div");
            row.className = "tooltip-row";
            row.textContent = `Durée moyenne : ${frNumber(point.duree, 1)} mois`;
            body.appendChild(row);
          }
          tooltip.classList.add("is-visible");
          tooltip.setAttribute("aria-hidden", "false");
          const shellBounds = chartShell.getBoundingClientRect();
          const svgBounds = svg.node().getBoundingClientRect();
          const screenX = svgBounds.left - shellBounds.left + (margin.left + posX) * svgBounds.width / viewBoxWidth;
          const screenY = svgBounds.top - shellBounds.top + (margin.top + Math.min(...series.map((item, i) => yScales[i](point[item.key])))) * svgBounds.height / viewBoxHeight;
          const tooltipWidth = tooltip.offsetWidth;
          const left = screenX + 16 + tooltipWidth <= shellBounds.width ? screenX + 16 : screenX - tooltipWidth - 16;
          tooltip.style.left = `${Math.max(8, Math.min(shellBounds.width - tooltipWidth - 8, left))}px`;
          tooltip.style.top = `${Math.max(8, Math.min(shellBounds.height - tooltip.offsetHeight - 8, screenY - 40))}px`;
        };
        g.append("rect").attr("class", "quarterly-overlay").attr("width", width).attr("height", height)
          .attr("fill", "none").attr("pointer-events", "all")
          .on("pointermove", showTooltip).on("pointerleave", hideTooltip);
      }
