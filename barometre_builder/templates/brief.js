(() => {
  const DATA = BAROMETRE_BRIEF;
  const hasCharts = barometreDependenciesAvailable();
  const container = document.getElementById("indicators");
  const selector = document.getElementById("regionSelect");
  const number = (value, digits = 0) => Number(value).toLocaleString("fr-FR", { maximumFractionDigits: digits });
  const element = (tag, text = "", className = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const isValue = value => typeof value === "number" && Number.isFinite(value);
  const period = (date, frequency) => {
    if (!date) return "Période indisponible";
    const value = new Date(date + "T00:00:00");
    return frequency === "month"
      ? value.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
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

  function chart(card, indicator, points) {
    const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    const width = mobile ? 380 : 560;
    svgNode.setAttribute("viewBox", `0 0 ${width} 235`);
    svgNode.setAttribute("role", "img");
    svgNode.setAttribute("aria-label", `Évolution de ${indicator.label.toLowerCase()} sur les trois dernières années disponibles`);
    svgNode.classList.add("chart");
    card.append(svgNode);
    if (!hasCharts || !points.some(point => isValue(point.value))) {
      const label = document.createElementNS(svgNode.namespaceURI, "text");
      label.setAttribute("x", "20"); label.setAttribute("y", "110");
      label.textContent = hasCharts ? "Aucune donnée disponible pour ce territoire." : "Graphique indisponible ; les valeurs restent consultables ci-dessous.";
      svgNode.append(label);
      return;
    }
    const maximum = Math.max(...points.filter(point => isValue(point.value)).map(point => point.value));
    const divisor = indicator.unit === "euros" ? 1e9 : maximum >= 1e6 ? 1e6 : maximum >= 1e3 ? 1e3 : 1;
    const noun = indicator.unit === "salaries" ? "salariés" : indicator.unit === "declarations" ? "déclarations" : "procédures";
    const unit = indicator.unit === "euros" ? "milliards d’euros" : `${divisor === 1e6 ? "millions de " : divisor === 1e3 ? "milliers de " : ""}${noun}`;
    const data = points.map(point => ({ ...point, time: new Date(point.date + "T00:00:00"), level: isValue(point.value) ? point.value / divisor : null }));
    const svg = d3.select(svgNode);
    svg.append("title").text(`Évolution de ${indicator.label.toLowerCase()}`);
    svg.append("desc").text(`Niveau en ${unit}. Les valeurs et leurs dates sont disponibles dans le tableau situé sous le graphique.`);
    const x = d3.scaleTime().domain(d3.extent(data, point => point.time)).range([64, width - 10]);
    const levels = data.filter(point => isValue(point.level)).map(point => point.level);
    const bounds = d3.extent(levels);
    const padding = Math.max((bounds[1] - bounds[0]) * .2, bounds[1] * .015, divisor > 1 ? .001 : 1);
    const y = d3.scaleLinear().domain([Math.max(0, bounds[0] - padding), bounds[1] + padding]).nice().range([194, 16]);
    svg.append("g").attr("transform", "translate(64,0)").call(d3.axisLeft(y).ticks(4).tickSize(-(width - 74)).tickFormat(value => number(value, divisor > 1 ? 2 : 0)));
    const tickDates = data.length > 1 ? [data[0].time, data[Math.floor((data.length - 1) / 2)].time, data[data.length - 1].time] : [data[0].time];
    const axis = svg.append("g").attr("transform", "translate(0,194)").call(d3.axisBottom(x).tickValues(tickDates).tickFormat(date => date.toLocaleDateString("fr-FR", {month:"short", year:"numeric"})).tickPadding(10));
    axis.selectAll("text").attr("text-anchor", (_, index) => index === 0 ? "start" : index === tickDates.length - 1 ? "end" : "middle");
    const line = d3.line().defined(point => isValue(point.level)).x(point => x(point.time)).y(point => y(point.level));
    svg.append("path").datum(data).attr("fill", "none").attr("stroke", indicator.key === "headcount" || indicator.key === "pcol" ? "#2B82F6" : "#0A8C90").attr("stroke-width", 3).attr("d", line);
    svg.selectAll("circle").data(data.filter(point => isValue(point.level))).join("circle").attr("cx", point => x(point.time)).attr("cy", point => y(point.level)).attr("r", 2.5).attr("fill", "#0B1D3A")
      .append("title").text(point => `${period(point.date, indicator.frequency)} : ${valueLabel(point.value, indicator.unit)}`);
    card.append(element("p", `Niveau · ${unit}. L’axe vertical est ajusté pour rendre les variations lisibles.`, "chart-note"));
  }

  function valuesTable(card, indicator, points) {
    if (!points.length) return;
    const details = element("details");
    details.append(element("summary", "Consulter les valeurs du graphique"));
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
    table.append(caption, head, body); shell.append(table); details.append(shell); card.append(details);
  }

  function render() {
    const code = Object.hasOwn(DATA.scopes, selector.value) ? selector.value : "national";
    const scope = DATA.scopes[code];
    document.getElementById("scopeLabel").textContent = code === "national" ? "France entière" : DATA.regions.find(region => region.code === code).name;
    container.replaceChildren();
    DATA.indicators.forEach((indicator, index) => {
      const series = scope[indicator.key];
      const points = series.points;
      const latest = points[points.length - 1];
      const card = element("article", "", "indicator");
      card.id = "indicateur-" + indicator.key;
      const heading = element("div", "", "indicator-heading");
      heading.append(element("span", String(index + 1).padStart(2, "0"), "indicator-number"), element("h3", indicator.label));
      card.append(heading, element("p", indicator.definition, "definition"), element("strong", valueLabel(latest?.value, indicator.unit), "indicator-value"), element("p", latest ? period(latest.date, indicator.frequency) : "Ce territoire n’est pas documenté dans la source fournie.", "indicator-period"), element("span", changeLabel(latest?.yearlyChange), "indicator-change"));
      chart(card, indicator, points);
      card.append(element("p", indicator.explanation, "explanation"), element("p", indicator.source, "source-note"));
      if (series.coverageNote) card.append(element("p", series.coverageNote, "coverage-note"));
      valuesTable(card, indicator, points);
      container.append(card);
    });
  }
  selector.addEventListener("change", render);
  render();
})();
