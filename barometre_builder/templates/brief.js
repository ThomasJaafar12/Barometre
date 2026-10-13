(() => {
  const DATA = BAROMETRE_BRIEF;
  const hasCharts = barometreDependenciesAvailable();
  const container = document.getElementById("indicators");
  const selector = document.getElementById("regionSelect");
  const numberFormats = [0, 1, 2].map(digits => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }));
  const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  const axisDateFormat = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" });
  const chartViewport = window.matchMedia("(max-width: 760px)");
  let chartViews = [];
  const number = (value, digits = 0) => numberFormats[digits].format(Number(value));
  const element = (tag, text = "", className = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const isValue = value => typeof value === "number" && Number.isFinite(value);
  const iconPaths = {
    clock: ["M12 8v4l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"],
    info: ["M12 11v5M12 8h.01", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"],
    up: ["M12 18V6m-5 5 5-5 5 5"],
    down: ["M12 6v12m-5-5 5 5 5-5"],
  };
  const icon = name => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false", class: "indicator-icon" }).forEach(([key, value]) => svg.setAttribute(key, value));
    iconPaths[name].forEach(d => {
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", d);
      svg.append(path);
    });
    return svg;
  };
  const period = (date, frequency) => {
    if (!date) return "Période indisponible";
    const value = new Date(date + "T00:00:00");
    return frequency === "month"
      ? monthFormat.format(value)
      : `${Math.floor(value.getMonth() / 3) + 1}${value.getMonth() < 3 ? "er" : "e"} trimestre ${value.getFullYear()}`;
  };
  const valueLabel = (value, unit) => {
    if (!isValue(value)) return "Données indisponibles";
    if (unit === "euros") {
      if (value >= 1e9) return `${number(value / 1e9, 1)} milliards d’euros`;
      if (value >= 1e6) return `${number(value / 1e6, 1)} millions d’euros`;
      return `${number(value)} euros`;
    }
    return `${number(value)} ${unit === "salaries" ? "salariés" : unit === "declarations" ? "déclarations" : "procédures"}`;
  };
  const changeLabel = value => !isValue(value) ? "Comparaison annuelle indisponible"
    : value === 0 ? "Stable sur un an" : `${value > 0 ? "Hausse" : "Baisse"} de ${number(Math.abs(value), 1)} % sur un an`;

  function chartHover(plot, svg, indicator, data, x, y) {
    const svgNode = svg.node();
    const labels = data.map(point => ({
      date: period(point.date, indicator.frequency),
      value: valueLabel(point.value, indicator.unit),
      change: isValue(point.yearlyChange) ? `${point.yearlyChange > 0 ? "+" : ""}${number(point.yearlyChange === 0 ? 0 : point.yearlyChange, 1)} %` : "Indisponible",
      trend: !isValue(point.yearlyChange) || point.yearlyChange === 0 ? "neutral" : point.yearlyChange > 0 ? "up" : "down",
    }));
    const tooltip = element("div", "", "chart-tooltip");
    tooltip.id = "brief-tooltip-" + indicator.key;
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    const date = element("p", "", "chart-tooltip-period");
    const level = element("strong");
    const change = element("strong", "", "chart-tooltip-change");
    const valueRow = element("div", "", "chart-tooltip-row");
    const changeRow = element("div", "", "chart-tooltip-row");
    valueRow.append(element("span", "Niveau :"), level);
    changeRow.append(element("span", "Glissement annuel :"), change);
    tooltip.append(date, valueRow, changeRow);
    plot.append(tooltip);
    const hover = svg.append("g").attr("class", "chart-hover").attr("aria-hidden", "true").attr("visibility", "hidden");
    const guide = hover.append("line").attr("class", "chart-guide").attr("y1", y.range()[1]).attr("y2", y.range()[0]);
    const marker = hover.append("circle").attr("class", "chart-marker");
    const hitArea = svg.append("rect").attr("class", "chart-hit-area")
      .attr("x", x.range()[0]).attr("y", y.range()[1])
      .attr("width", x.range()[1] - x.range()[0]).attr("height", y.range()[0] - y.range()[1])
      .attr("fill", "transparent").attr("tabindex", 0).attr("role", "slider")
      .attr("aria-label", `Parcourir les valeurs de ${indicator.label.toLowerCase()}`)
      .attr("aria-orientation", "horizontal").attr("aria-valuemin", 1).attr("aria-valuemax", data.length)
      .attr("aria-describedby", tooltip.id);
    const nearest = d3.bisector(point => point.time).center;
    let activeIndex = data.length - 1;
    let dismissed = false;
    const updateAccessibleValue = index => hitArea.attr("aria-valuenow", index + 1)
      .attr("aria-valuetext", `${labels[index].date}. Niveau : ${labels[index].value}. Glissement annuel : ${labels[index].change}.`);
    updateAccessibleValue(activeIndex);
    const hide = () => {
      tooltip.hidden = true;
      hover.attr("visibility", "hidden");
    };
    const show = index => {
      // The tooltip follows an observation, so moving within its interval needs no DOM writes.
      if (index === activeIndex && !tooltip.hidden) return;
      activeIndex = index;
      const point = data[index];
      const label = labels[index];
      date.textContent = label.date;
      level.textContent = label.value;
      change.textContent = label.change;
      change.dataset.trend = label.trend;
      updateAccessibleValue(index);
      const posX = x(point.time);
      const posY = isValue(point.level) ? y(point.level) : (y.range()[0] + y.range()[1]) / 2;
      const scale = svgNode.clientWidth / svgNode.viewBox.baseVal.width;
      guide.attr("x1", posX).attr("x2", posX);
      marker.attr("cx", posX).attr("cy", posY).attr("r", 4.5 / scale).attr("visibility", isValue(point.level) ? "visible" : "hidden");
      hover.attr("visibility", "visible");
      tooltip.hidden = false;
      const screenX = posX * scale;
      const screenY = (posY - svgNode.viewBox.baseVal.y) * scale;
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const left = screenX + tooltipWidth + 14 <= plot.clientWidth - 8 ? screenX + 14 : screenX - tooltipWidth - 14;
      tooltip.style.left = `${Math.max(8, Math.min(plot.clientWidth - tooltipWidth - 8, left))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(svgNode.clientHeight - tooltipHeight - 8, screenY - tooltipHeight - 12))}px`;
    };
    const showAtPointer = event => {
      if (!dismissed) show(nearest(data, x.invert(d3.pointer(event, svgNode)[0])));
    };
    hitArea.on("pointermove", showAtPointer).on("pointerdown", event => {
      dismissed = false;
      showAtPointer(event);
      if (event.pointerType === "touch") hitArea.node().focus({ preventScroll: true });
    }).on("pointercancel", hide).on("focus", () => { dismissed = false; show(activeIndex); }).on("blur", hide)
      .on("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); dismissed = true; hide(); return; }
        const index = event.key === "Home" ? 0 : event.key === "End" ? data.length - 1
          : ["ArrowLeft", "ArrowDown"].includes(event.key) ? Math.max(0, activeIndex - 1)
          : ["ArrowRight", "ArrowUp"].includes(event.key) ? Math.min(data.length - 1, activeIndex + 1) : null;
        if (index === null) return;
        event.preventDefault();
        dismissed = false;
        show(index);
      });
    d3.select(plot).on("pointerleave.chart-hover", event => {
      dismissed = false;
      if (event.pointerType !== "touch" && document.activeElement !== hitArea.node()) hide();
    });
    return hide;
  }

  function chart(card, indicator, points) {
    if (!hasCharts || !points.some(point => isValue(point.value))) {
      card.append(element("p", hasCharts ? "Aucune donnée disponible pour ce territoire." : "Graphique indisponible ; les valeurs restent consultables ci-dessous.", "chart-empty"));
      return;
    }
    const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const width = chartViewport.matches ? 380 : 560;
    svgNode.setAttribute("viewBox", `0 -12 ${width} 247`);
    svgNode.setAttribute("role", "group");
    svgNode.setAttribute("aria-label", `Évolution de ${indicator.label.toLowerCase()} sur les trois dernières années disponibles`);
    svgNode.classList.add("chart");
    card.append(svgNode);
    const maximum = Math.max(...points.filter(point => isValue(point.value)).map(point => point.value));
    const divisor = indicator.unit === "euros" ? 1e9 : maximum >= 1e6 ? 1e6 : maximum >= 1e3 ? 1e3 : 1;
    const noun = indicator.unit === "salaries" ? "salariés" : indicator.unit === "declarations" ? "déclarations" : "procédures";
    const unit = indicator.unit === "euros" ? "milliards d’euros" : `${divisor === 1e6 ? "millions de " : divisor === 1e3 ? "milliers de " : ""}${noun}`;
    const data = points.map(point => ({ ...point, time: new Date(point.date + "T00:00:00"), level: isValue(point.value) ? point.value / divisor : null }));
    const svg = d3.select(svgNode);
    const descriptionId = "brief-chart-description-" + indicator.key;
    svg.attr("aria-describedby", descriptionId);
    svg.append("desc").attr("id", descriptionId).text(`Niveau en ${unit}. Les valeurs et leurs dates sont disponibles dans le tableau situé sous le graphique. Utilisez les flèches pour parcourir les périodes et Échap pour fermer l’infobulle.`);
    const x = d3.scaleTime().domain(d3.extent(data, point => point.time)).range([64, width - 10]);
    const levels = data.filter(point => isValue(point.level)).map(point => point.level);
    const bounds = d3.extent(levels);
    const padding = Math.max((bounds[1] - bounds[0]) * .2, bounds[1] * .015, divisor > 1 ? .001 : 1);
    const y = d3.scaleLinear().domain([Math.max(0, bounds[0] - padding), bounds[1] + padding]).nice().range([194, 16]);
    svg.append("g").attr("class", "chart-y-axis").attr("transform", "translate(64,0)").call(d3.axisLeft(y).ticks(4).tickSize(-(width - 74)).tickFormat(value => number(value, divisor > 1 ? 2 : 0)));
    const tickDates = data.length > 1 ? [data[0].time, data[Math.floor((data.length - 1) / 2)].time, data[data.length - 1].time] : [data[0].time];
    const axis = svg.append("g").attr("class", "chart-x-axis").attr("transform", "translate(0,194)").call(d3.axisBottom(x).tickValues(tickDates).tickFormat(date => axisDateFormat.format(date)).tickPadding(10));
    axis.selectAll("text").attr("text-anchor", (_, index) => index === 0 ? "start" : index === tickDates.length - 1 ? "end" : "middle");
    const gradientId = "brief-gradient-" + indicator.key;
    const gradient = svg.append("defs").append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "var(--indicator-color)").attr("stop-opacity", .18);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "var(--indicator-color)").attr("stop-opacity", 0);
    const line = d3.line().defined(point => isValue(point.level)).curve(d3.curveMonotoneX).x(point => x(point.time)).y(point => y(point.level));
    const area = d3.area().defined(point => isValue(point.level)).curve(d3.curveMonotoneX).x(point => x(point.time)).y0(194).y1(point => y(point.level));
    svg.append("path").datum(data).attr("class", "chart-area").attr("fill", `url(#${gradientId})`).attr("d", area);
    svg.append("path").datum(data).attr("class", "chart-line").attr("d", line);
    card.append(element("p", `Niveau · ${unit}. L’axe vertical est ajusté pour rendre les variations lisibles.`, "chart-note"));
    return chartHover(card, svg, indicator, data, x, y);
  }

  function valuesTable(card, indicator, points) {
    if (!points.length) return;
    const details = element("details");
    details.append(element("summary", "Consulter les valeurs du graphique"));
    let loaded = false;
    details.addEventListener("toggle", () => {
      if (!details.open || loaded) return;
      const shell = element("div", "", "table-scroll");
      const table = element("table");
      const caption = element("caption", `${indicator.label} · valeurs par période`);
      const head = element("thead");
      const row = element("tr");
      ["Période", "Niveau", "Évolution sur un an"].forEach(label => { const cell = element("th", label); cell.scope = "col"; row.append(cell); });
      head.append(row);
      const body = element("tbody");
      [...points].reverse().forEach(point => {
        const row = element("tr");
        row.append(element("td", period(point.date, indicator.frequency)), element("td", isValue(point.value) ? number(point.value) + (indicator.unit === "euros" ? " €" : "") : "Indisponible"), element("td", isValue(point.yearlyChange) ? `${point.yearlyChange > 0 ? "+" : ""}${number(point.yearlyChange, 1)} %` : "Indisponible"));
        body.append(row);
      });
      table.append(caption, head, body); shell.append(table); details.append(shell);
      loaded = true;
    });
    card.append(details);
  }

  function resizeChartLabels() {
    const sizes = chartViews.map(({ plot }) => plot.clientWidth);
    chartViews.forEach(({ plot, hideHover }, index) => {
      hideHover?.();
      const svg = plot.querySelector("svg");
      if (!svg || !sizes[index]) return;
      const width = svg.viewBox.baseVal.width;
      const scale = width / sizes[index];
      const dateSize = scale * 10;
      svg.style.setProperty("--chart-label-size", `${scale * 11}px`);
      svg.style.setProperty("--chart-date-size", `${dateSize}px`);
      const labels = [...svg.querySelectorAll(".chart-x-axis .tick text")];
      labels.forEach(label => label.setAttribute("dy", ".71em"));
      const boxes = labels.map(label => label.getBoundingClientRect());
      const crowded = boxes.some((box, index) => index > 0 && boxes[index - 1].right + 4 > box.left);
      if (crowded && labels.length === 3) labels[1].setAttribute("dy", "2.2em");
      svg.setAttribute("viewBox", `0 -12 ${width} ${247 + (crowded && labels.length === 3 ? dateSize * 1.8 : 0)}`);
    });
  }

  function render() {
    const code = Object.hasOwn(DATA.scopes, selector.value) ? selector.value : "national";
    const scope = DATA.scopes[code];
    document.getElementById("scopeLabel").textContent = code === "national" ? "France entière" : DATA.regions.find(region => region.code === code).name;
    const fragment = document.createDocumentFragment();
    const nextChartViews = [];
    DATA.indicators.forEach((indicator, index) => {
      const series = scope[indicator.key];
      const points = series.points;
      const latest = points[points.length - 1];
      const card = element("article", "", "indicator");
      card.id = "indicateur-" + indicator.key;
      card.dataset.indicator = indicator.key;
      const title = element("h3", indicator.label);
      title.id = card.id + "-titre";
      card.setAttribute("aria-labelledby", title.id);
      const heading = element("div", "", "indicator-heading");
      const indexBadge = element("span", String(index + 1).padStart(2, "0"), "indicator-number");
      indexBadge.setAttribute("aria-hidden", "true");
      heading.append(title, indexBadge);
      const metric = element("div", "", "indicator-metric");
      const subline = element("div", "", "indicator-subline");
      const date = element("p", "", "indicator-period");
      date.append(icon("clock"), element("span", latest ? period(latest.date, indicator.frequency) : "Ce territoire n’est pas documenté dans la source fournie."));
      const trend = isValue(latest?.yearlyChange) && latest.yearlyChange !== 0 ? latest.yearlyChange > 0 ? "up" : "down" : "neutral";
      const change = element("span", "", "indicator-change trend-" + trend);
      if (trend !== "neutral") change.append(icon(trend));
      change.append(element("span", changeLabel(latest?.yearlyChange)));
      subline.append(date, change);
      metric.append(element("strong", valueLabel(latest?.value, indicator.unit), "indicator-value"), subline);
      card.append(heading, element("p", indicator.definition, "definition"), metric);
      const plot = element("div", "", "indicator-plot");
      const hideHover = chart(plot, indicator, points);
      nextChartViews.push({ plot, indicator, points, hideHover });
      const explanation = element("div", "", "explanation");
      explanation.append(icon("info"), element("p", indicator.explanation));
      const footer = element("div", "", "indicator-footer");
      footer.append(element("p", indicator.source, "source-note"));
      if (series.coverageNote) footer.append(element("p", series.coverageNote, "coverage-note"));
      valuesTable(footer, indicator, points);
      card.append(plot, explanation, footer);
      fragment.append(card);
    });
    container.replaceChildren(fragment);
    chartViews = nextChartViews;
    resizeChartLabels();
  }
  selector.addEventListener("change", render);
  chartViewport.addEventListener("change", () => {
    chartViews.forEach(view => {
      view.plot.replaceChildren();
      view.hideHover = chart(view.plot, view.indicator, view.points);
    });
    resizeChartLabels();
  });
  let chartGridWidth = 0;
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === chartGridWidth) return;
    chartGridWidth = entry.contentRect.width;
    resizeChartLabels();
  }).observe(container);
  render();
})();
