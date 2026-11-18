(() => {
__INDICATOR_CHARTS__

  const data = BAROMETRE_BRIEF;
  const headers = [...document.querySelectorAll("[data-brief-topic]")];
  const requestedTopic = new URLSearchParams(window.location.search).get("rubrique");
  const activeHeader = headers.find(header => header.dataset.briefTopic === requestedTopic) ?? headers[0];
  for (const header of headers) header.hidden = header !== activeHeader;

  const topic = activeHeader.dataset.briefTopic;
  const { indicators: topicIndicators, scopes } = topic === "chiffres" ? data.monthly : data;
  const { indicatorKeys } = activeHeader.dataset;
  const keys = new Set(indicatorKeys.split(" "));
  const indicators = indicatorKeys ? topicIndicators.filter(indicator => keys.has(indicator.key)) : topicIndicators;
  document.title = `${activeHeader.querySelector("h1").textContent} · En bref · Urssaf`;
  document.getElementById("briefDetailLink").href = `barometre_${topic}.html`;

  const selector = document.getElementById("regionSelect");
  const scopeLabel = document.getElementById("scopeLabel");
  const chartGrid = document.getElementById("indicators");
  chartGrid.dataset.topic = topic;
  const renderIndicators = createIndicatorCharts(chartGrid, barometreDependenciesAvailable());

  function render() {
    const code = Object.hasOwn(scopes, selector.value) ? selector.value : "national";
    scopeLabel.textContent = code === "national" ? "France entière" : data.regions.find(region => region.code === code).name;
    renderIndicators(indicators, scopes[code]);
  }

  selector.addEventListener("change", render);
  render();
})();
