(() => {
__INDICATOR_CHARTS__

  const data = BAROMETRE_BRIEF;
  const headers = [...document.querySelectorAll("[data-brief-topic]")];
  const requestedTopic = new URLSearchParams(window.location.search).get("rubrique");
  const activeHeader = headers.find(header => header.dataset.briefTopic === requestedTopic) ?? headers[0];
  for (const header of headers) header.hidden = header !== activeHeader;

  const topic = activeHeader.dataset.briefTopic;
  const { indicatorKeys } = activeHeader.dataset;
  const keys = new Set(indicatorKeys.split(" "));
  const indicators = indicatorKeys ? data.indicators.filter(indicator => keys.has(indicator.key)) : data.indicators;
  document.title = `${activeHeader.querySelector("h1").textContent} · En bref · Urssaf`;
  document.getElementById("briefDetailLink").href = `barometre_${topic}.html`;

  const selector = document.getElementById("regionSelect");
  const scopeLabel = document.getElementById("scopeLabel");
  const renderIndicators = createIndicatorCharts(document.getElementById("indicators"), barometreDependenciesAvailable());

  function render() {
    const code = Object.hasOwn(data.scopes, selector.value) ? selector.value : "national";
    scopeLabel.textContent = code === "national" ? "France entière" : data.regions.find(region => region.code === code).name;
    renderIndicators(indicators, data.scopes[code]);
  }

  selector.addEventListener("change", render);
  render();
})();
