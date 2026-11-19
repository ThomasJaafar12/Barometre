      function renderDepartmentChartLegend(id, title, color, reference = null) {
        const makeChip = (label, color, dashed) => {
          const chip = textElement("span", "", "legend-chip");
          const sample = textElement("i", "", "trar-line-sample");
          sample.style.borderColor = color;
          sample.style.borderTopStyle = dashed ? "dashed" : "solid";
          sample.setAttribute("aria-hidden", "true");
          chip.append(sample, document.createTextNode(label));
          return chip;
        };
        const legend = document.getElementById(id);
        legend.replaceChildren(makeChip(title, color, false));
        if (reference) legend.append(makeChip(reference, "#64748B", true));
      }

      function departmentChartTickDates(dates, xScale, compact, quarterly) {
        const step = compact || quarterly
          ? Math.max(1, Math.ceil(dates.length / (compact ? 3 : 6)))
          : dates.length > 60 ? 12 : dates.length > 30 ? 6 : 3;
        const tickDates = dates.filter((_, i) => i % step === 0);
        const lastDate = dates[dates.length - 1];
        if (tickDates[tickDates.length - 1] !== lastDate) {
          if (tickDates.length && xScale(lastDate) - xScale(tickDates[tickDates.length - 1]) < 68) {
            tickDates.pop();
          }
          tickDates.push(lastDate);
        }
        return tickDates;
      }

      function drawDepartmentChart({
        svgNode,
        tooltipNode,
        points,
        metric,
        scope,
        formatValue,
        formatChange,
        formatPeriod,
        axisLabel,
        changeLabel,
        quarterly = false,
        benchmarkPoints = null,
        benchmarkLabel = "",
        viewBoxWidth = 940,
        compactHeight = 460,
      }) {
        const svg = d3.select(svgNode);
        svg.selectAll("g").remove();
        tooltipNode.classList.remove("is-visible");
        tooltipNode.setAttribute("aria-hidden", "true");
        const compact = svgNode.clientWidth > 0 && svgNode.clientWidth < 430;
        const width = compact ? Math.max(260, svgNode.clientWidth) : viewBoxWidth;
        const height = compact ? 300 : compactHeight;
        const margin = compact ? { top: 26, right: 24, bottom: 38, left: 56 }
          : { top: 30, right: 24, bottom: 48, left: 66 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        svg.attr("viewBox", `0 0 ${width} ${height}`);

        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const valid = points.filter((p) => Number.isFinite(p[metric.key]));
        if (!valid.length) {
          g.append("text").attr("x", innerW / 2).attr("y", innerH / 2).attr("text-anchor", "middle")
            .attr("fill", "#64748B").style("font-size", compact ? "12px" : "16px").text("Données indisponibles");
          return;
        }

        const dates = points.map((p) => p.date);
        const x = d3.scalePoint().domain(dates).range([0, innerW]).padding(0.2);

        const allVals = valid.map((p) => p[metric.key]);
        if (benchmarkPoints?.length) {
          benchmarkPoints.forEach((p) => {
            if (Number.isFinite(p[metric.key])) allVals.push(p[metric.key]);
          });
        }
        const minV = Math.min(0, d3.min(allVals) ?? 0);
        const maxV = d3.max(allVals) ?? 1;
        const pad = (maxV - minV) * 0.1 || 0.1;
        const y = d3.scaleLinear().domain([minV < 0 ? minV - pad : 0, maxV + pad]).nice().range([innerH, 0]);

        // Grid
        g.append("g")
          .call(d3.axisLeft(y).ticks(compact ? 4 : 6).tickSize(-innerW).tickFormat(""))
          .call((ax) => {
            ax.select(".domain").remove();
            ax.selectAll("line").attr("stroke", "rgba(148,163,184,0.22)").attr("stroke-dasharray", "3 3");
          });

        // Benchmark curve (if provided)
        let benchByDate = null;
        if (benchmarkPoints?.length) {
          benchByDate = new Map(benchmarkPoints.map((p) => [p.date, p[metric.key]]));
          const benchLine = d3.line()
            .defined((p) => Number.isFinite(benchByDate.get(p.date)))
            .x((p) => x(p.date))
            .y((p) => y(benchByDate.get(p.date)))
            .curve(d3.curveMonotoneX);
          g.append("path")
            .attr("class", "trar-reference-series")
            .attr("d", benchLine(points))
            .attr("fill", "none")
            .attr("stroke", "#64748B")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "5 5")
            .attr("opacity", 0.78);
        }

        // Main line
        const line = d3.line()
          .defined((p) => Number.isFinite(p[metric.key]))
          .x((p) => x(p.date))
          .y((p) => y(p[metric.key]))
          .curve(d3.curveMonotoneX);
        g.append("path")
          .attr("class", "quarterly-series").attr("data-metric", metric.key)
          .attr("d", line(points))
          .attr("fill", "none")
          .attr("stroke", metric.color)
          .attr("stroke-width", 3.2)
          .attr("stroke-linecap", "round");

        // Points
        g.append("g").selectAll("circle").data(valid).join("circle")
          .attr("cx", (p) => x(p.date))
          .attr("cy", (p) => y(p[metric.key]))
          .attr("r", (_, i) => (i === valid.length - 1 ? 5.2 : compact ? 1.8 : 2.6))
          .attr("fill", (_, i) => (i === valid.length - 1 ? "#FFFFFF" : metric.color))
          .attr("stroke", metric.color)
          .attr("stroke-width", (_, i) => (i === valid.length - 1 ? 2.8 : 1));

        // Axes
        const yAxis = g.append("g").call(d3.axisLeft(y).ticks(compact ? 4 : 6).tickFormat(formatValue));
        yAxis.select(".domain").attr("stroke", "#CBD5E1");
        yAxis.selectAll("line").attr("stroke", "#CBD5E1");
        yAxis.selectAll("text").attr("fill", metric.color).style("font-size", "11px").style("font-weight", "600");
        yAxis.append("text").attr("x", -8).attr("y", -12).attr("fill", metric.color)
          .attr("text-anchor", "start").style("font-size", "11px").style("font-weight", "700")
          .text(axisLabel);

        const tickDates = departmentChartTickDates(dates, x, compact, quarterly);
        const xAxis = g.append("g").attr("transform", `translate(0,${innerH})`)
          .call(d3.axisBottom(x).tickValues(tickDates).tickFormat(formatPeriod));
        xAxis.selectAll("path,line").attr("stroke", "#CBD5E1");
        xAxis.selectAll("text").attr("fill", "#64748B").style("font-size", "11.5px").attr("dy", "1.2em");

        // Tooltip & Crosshair
        const crosshair = g.append("line").attr("y1", 0).attr("y2", innerH)
          .attr("stroke", "#64748B").attr("stroke-width", 1.2).attr("stroke-dasharray", "4 4").style("opacity", 0);
        const marker = g.append("circle").attr("r", 6).attr("fill", metric.color)
          .attr("stroke", "#FFFFFF").attr("stroke-width", 2.5).style("opacity", 0);
        const shell = tooltipNode.parentElement;

        const hide = () => {
          crosshair.style("opacity", 0);
          marker.style("opacity", 0);
          tooltipNode.classList.remove("is-visible");
          tooltipNode.setAttribute("aria-hidden", "true");
        };

        const show = (event) => {
          const [mx] = d3.pointer(event, g.node());
          const idx = Math.max(0, Math.min(points.length - 1, Math.round((mx - x(dates[0])) / (x.step() || 1))));
          const pt = points[idx];
          const px = x(pt.date);
          const val = pt[metric.key];
          crosshair.attr("x1", px).attr("x2", px).style("opacity", 0.65);
          if (Number.isFinite(val)) {
            marker.attr("cx", px).attr("cy", y(val)).style("opacity", 1);
          } else {
            marker.style("opacity", 0);
          }
          tooltipNode.querySelector(".tooltip-overline").textContent = `${formatPeriod(pt.date)} · ${scope}`;
          const body = tooltipNode.querySelector(".tooltip-body");
          body.replaceChildren();
          const row1 = textElement("div", "", "tooltip-row");
          const lbl = textElement("span", `${metric.shortLabel} :`);
          lbl.style.color = metric.color;
          lbl.style.fontWeight = "600";
          row1.append(lbl, textElement("strong", formatValue(val)));
          body.append(row1);

          const yoy = pt[`${metric.key}_yoy`];
          if (Number.isFinite(yoy)) {
            const row2 = textElement("div", "", "tooltip-row");
            row2.append(textElement("span", `${changeLabel} :`), textElement("strong", formatChange(yoy)));
            body.append(row2);
          }

          if (benchByDate && Number.isFinite(benchByDate.get(pt.date))) {
            const rowB = textElement("div", "", "tooltip-row");
            rowB.append(textElement("span", `${benchmarkLabel} :`), textElement("strong", formatValue(benchByDate.get(pt.date))));
            body.append(rowB);
          }

          tooltipNode.classList.add("is-visible");
          tooltipNode.setAttribute("aria-hidden", "false");

          const shellBounds = shell.getBoundingClientRect();
          const svgBounds = svgNode.getBoundingClientRect();
          const sx = svgBounds.left - shellBounds.left + (margin.left + px) * svgBounds.width / width;
          const sy = svgBounds.top - shellBounds.top + (margin.top + (Number.isFinite(val) ? y(val) : innerH / 2)) * svgBounds.height / height;
          const tw = tooltipNode.offsetWidth;
          const th = tooltipNode.offsetHeight;
          const left = sx + 16 + tw <= shellBounds.width ? sx + 16 : sx - tw - 16;
          tooltipNode.style.left = `${Math.max(8, Math.min(shellBounds.width - tw - 8, left))}px`;
          tooltipNode.style.top = `${Math.max(8, Math.min(shellBounds.height - th - 8, sy - th - 12))}px`;
        };

        g.append("rect").attr("class", "quarterly-overlay").attr("width", innerW).attr("height", innerH).attr("fill", "none").attr("pointer-events", "all")
          .on("pointermove", show).on("pointerleave", hide);
      }

      const departmentChartViews = new Map();

      function renderDepartmentChart(svgId, tooltipId, config) {
        const svgNode = document.getElementById(svgId);
        const firstRender = !departmentChartViews.has(svgNode);
        const view = { ...config, svgNode, tooltipNode: document.getElementById(tooltipId) };
        departmentChartViews.set(svgNode, view);
        drawDepartmentChart(view);
        if (firstRender) departmentChartObserver.observe(svgNode);
      }

      const departmentChartObserver = new ResizeObserver((entries) => {
        if (state.phase === "landing") return;
        entries.forEach(({ target }) => {
          const view = departmentChartViews.get(target);
          const width = target.clientWidth;
          const desiredWidth = width < 430 ? Math.max(260, width) : view.viewBoxWidth;
          if (width && target.viewBox.baseVal.width !== desiredWidth) drawDepartmentChart(view);
        });
      });
