      function employmentTickIndices(length, step = length > 36 ? 2 : 1) {
        const indices = [];
        for (let index = 0; index < length; index += step) {
          indices.push(index);
        }
        if (indices[indices.length - 1] !== length - 1) {
          if (length - 1 - indices.at(-1) < step / 2) indices.pop();
          indices.push(length - 1);
        }
        return indices;
      }

      function drawEmploymentChart(config, points, metric) {
        const svg = d3.select(`#${config.chartSvgId}`);
        const tooltip = document.getElementById(config.tooltipId);
        const hideChartTooltip = () => {
          tooltip.classList.remove("is-visible");
          tooltip.setAttribute("aria-hidden", "true");
        };
        dismissVizTooltip(svg.node());
        hideChartTooltip();
        svg.selectAll(":scope > :not(title, desc)").remove();
        const availableWidth = config.responsive ? svg.node().clientWidth : 980;
        const compact = availableWidth < 600;
        const width = compact ? Math.max(260, availableWidth) : 980;
        const height = compact ? 360 : 560;
        const margin = { top: 38, right: compact ? 50 : 84, bottom: compact ? 72 : 78, left: compact ? 52 : 76 };
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
        const { periodLabel = quarterLabel, periodName = "Trimestre" } = config;
        const hasLevel = (point) => Number.isFinite(point[metric.levelKey]);
        const hasYoY = (point) => Number.isFinite(point[metric.yoyKey]);

        const chart = root.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        if (!points.some(hasLevel)) {
          chart.append("text").attr("x", innerWidth / 2).attr("y", innerHeight / 2).attr("text-anchor", "middle")
            .attr("fill", chartMuted).text("Données indisponibles");
          return;
        }
        const yoyValues = points.filter(hasYoY).map((point) => point[metric.yoyKey]);
        const levelValues = points.filter(hasLevel).map((point) => point[metric.levelKey]);
        let yoyMin = d3.min(yoyValues) ?? -1;
        let yoyMax = d3.max(yoyValues) ?? 1;
        const yoyPad = Math.max(0.6, (yoyMax - yoyMin) * 0.12);
        yoyMin = Math.min(0, yoyMin - yoyPad);
        yoyMax = Math.max(0, yoyMax + yoyPad);
        let levelMin = d3.min(levelValues) ?? 0;
        let levelMax = d3.max(levelValues) ?? 1;
        const levelPad = Math.max(levelMax * 0.02, (levelMax - levelMin) * 0.08) || 1;
        levelMin -= levelPad;
        levelMax += levelPad;

        const dates = points.map((point) => point.date);
        const xScale = d3.scalePoint().domain(dates).range([0, innerWidth]).padding(config.responsive ? 0.5 : 0.25);
        const x = (point) => xScale(point.date);
        const yYoY = d3.scaleLinear().domain([yoyMin, yoyMax]).nice().range([innerHeight, 0]);
        const yLevel = d3.scaleLinear().domain([levelMin, levelMax]).nice().range([innerHeight, 0]);
        const barStep = xScale.step();
        const barWidth = Math.min(18, barStep * 0.72);

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
          .style("font-size", compact ? "10px" : "12px")
          .text(compact ? "Gliss. annuel" : "Glissement annuel");

        chart.append("text")
          .attr("x", innerWidth)
          .attr("y", -14)
          .attr("text-anchor", "end")
          .attr("fill", chartInk)
          .style("font-family", "IBM Plex Mono, monospace")
          .style("font-size", compact ? "10px" : "12px")
          .text(compact && metric.compactAxisTitle ? metric.compactAxisTitle : metric.axisTitle);

        const zeroY = yYoY(0);
        chart.append("g")
          .selectAll("rect")
          .data(points.filter(hasYoY))
          .join("rect")
          .attr("class", "employment-yoy-bar")
          .attr("x", (point) => x(point) - barWidth / 2)
          .attr("y", (point) => point[metric.yoyKey] >= 0 ? yYoY(point[metric.yoyKey]) : zeroY)
          .attr("width", barWidth)
          .attr("height", (point) => Math.abs(yYoY(point[metric.yoyKey]) - zeroY))
          .attr("fill", (point) => point[metric.yoyKey] >= 0 ? chartPositive : chartNegative);

        const line = d3.line()
          .defined(hasLevel)
          .x(x)
          .y((point) => yLevel(point[metric.levelKey]))
          .curve(d3.curveCatmullRom.alpha(0.6));

        chart.append("path")
          .datum(points)
          .attr("class", "employment-level-line")
          .attr("d", line)
          .attr("fill", "none")
          .attr("stroke", chartInk)
          .attr("stroke-width", 3.4)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round");

        chart.append("g")
          .selectAll("circle")
          .data(points.filter(hasLevel))
          .join("circle")
          .attr("cx", x)
          .attr("cy", (point) => yLevel(point[metric.levelKey]))
          .attr("r", (_, index, nodes) => index === nodes.length - 1 ? 5.2 : compact ? 1.4 : Math.min(3, barStep / 3))
          .attr("fill", (_, index, nodes) => index === nodes.length - 1 ? "#ffffff" : chartInk)
          .attr("stroke", chartInk)
          .attr("stroke-width", (_, index, nodes) => index === nodes.length - 1 ? 2.8 : 0);

        chart.append("line")
          .attr("x1", 0)
          .attr("x2", innerWidth)
          .attr("y1", innerHeight)
          .attr("y2", innerHeight)
          .attr("stroke", chartGridStrong);

        const tickStep = compact ? Math.max(1, Math.ceil(points.length / 5)) : config.tickInterval;
        const tickIndices = employmentTickIndices(points.length, tickStep);
        const xAxis = chart.append("g").attr("transform", `translate(0,${innerHeight})`);
        tickIndices.forEach((index) => {
          const tickX = x(points[index]);
          xAxis.append("line")
            .attr("x1", tickX)
            .attr("x2", tickX)
            .attr("y1", 0)
            .attr("y2", 7)
            .attr("stroke", chartGridStrong);
          xAxis.append("text")
            .attr("x", tickX)
            .attr("y", 26)
            .attr("fill", chartMuted)
            .style("font-family", "IBM Plex Mono, monospace")
            .style("font-size", "12px")
            .attr("transform", `rotate(-38 ${tickX} 26)`)
            .attr("text-anchor", "end")
            .text(periodLabel(points[index].date));
        });

        if (periodName) {
          chart.append("text")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + 60)
            .attr("text-anchor", "middle")
            .attr("fill", chartText)
            .style("font-family", "IBM Plex Mono, monospace")
            .style("font-size", "12px")
            .text(periodName);
        }

        const tooltipOverline = tooltip.querySelector(".tooltip-overline");
        const tooltipBody = tooltip.querySelector(".tooltip-body");
        const chartShell = tooltip.parentElement;

        function pointDetails(point) {
          return [
            `Niveau : ${metric.tooltipLevel(point[metric.levelKey])}`,
            `Glissement annuel : ${formatPercent(point[metric.yoyKey])}`,
          ];
        }

        function showChartTooltip(event, point) {
          const shellBounds = chartShell.getBoundingClientRect();
          tooltipOverline.textContent = periodLabel(point.date);
          textLines(tooltipBody, pointDetails(point));
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

        const targets = chart.append("g")
          .selectAll("rect")
          .data(points.filter(hasLevel))
          .join("rect")
          .attr("class", "employment-point-hit")
          .attr("x", (point) => x(point) - barStep / 2)
          .attr("y", 0)
          .attr("width", barStep)
          .attr("height", innerHeight)
          .attr("fill", "transparent")
          .attr("pointer-events", "all");
        bindVizTooltip(targets, {
          label: (point) => `${periodLabel(point.date)} · ${pointDetails(point).join(" · ")}`,
          show: showChartTooltip,
          hide: hideChartTooltip,
          arrowNavigation: true,
        });
      }
