      let renderChiffresIndicators;
      let displayedChiffresScope;

      function renderChiffresModule() {
        const { indicators, scopes } = DATA.modules.chiffres;
        const code = state.phase === "national" ? "national" : state.selectedRegion;
        const scope = scopes[code];
        if (displayedChiffresScope === scope) return;
        renderChiffresIndicators ??= createIndicatorCharts(document.getElementById("chiffresIndicators"), true);
        renderChiffresIndicators(indicators, scope);
        displayedChiffresScope = scope;
      }
