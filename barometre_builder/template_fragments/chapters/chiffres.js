      let renderChiffresIndicators;
      let displayedChiffresScope;
      let renderChiffresArrears;

      function createChiffresArrearsBreakdown(data, indicator) {
        const disclosure = document.getElementById("chiffresArrears");
        const territorySelect = document.getElementById("chiffresArrearsTerritory");
        const sectorSelect = document.getElementById("chiffresArrearsSector");
        const sectorLabel = document.getElementById("chiffresArrearsSectorLabel");
        const history = document.getElementById("chiffresArrearsHistory");
        const { dates, sectors, national, regions, departments } = data;
        const dateIndex = new Map(dates.map((date, index) => [date, index]));
        const previousYearIndexes = dates.map(date => dateIndex.get(`${Number(date.slice(0, 4)) - 1}${date.slice(4)}`));
        const sectorLabels = {
          national: "Secteur d’activité (NACE 88)",
          regional: "Secteur d’activité (NACE 28)",
          departmental: "Grand secteur d’activité",
        };
        const compareNames = new Intl.Collator("fr").compare;
        let territories;
        let renderChart;
        let displayedSector;

        function availableSectors(level, series) {
          return (sectors[level] || []).filter(({ key }) => series?.[key]?.some(Number.isFinite));
        }

        function renderHistory() {
          const territory = territories?.get(territorySelect.value);
          if (!disclosure.open || !territory) return;
          const sector = territory.options.find(({ key }) => key === sectorSelect.value);
          if (!sector || sector === displayedSector) return;
          const rates = territory.series[sector.key];
          const first = rates.findIndex(Number.isFinite);
          const last = rates.findLastIndex(Number.isFinite);
          const points = rates.slice(first, last + 1).map((value, offset) => {
            const index = first + offset;
            const previous = rates[previousYearIndexes[index]];
            return {
              date: dates[index], value,
              yearlyChange: Number.isFinite(value) && Number.isFinite(previous) ? value - previous : null,
            };
          });
          const chartIndicator = {
            ...indicator, key: "trar90Breakdown", label: `${sector.label} · ${territory.label}`,
          };
          renderChart ??= createIndicatorCharts(history, true);
          renderChart([chartIndicator], { [chartIndicator.key]: { points } });
          displayedSector = sector;
        }

        function renderSectors() {
          const territory = territories.get(territorySelect.value);
          displayedSector = null;
          sectorLabel.textContent = sectorLabels[territory.level];
          sectorSelect.replaceChildren(...territory.options.map(({ key, label }) => new Option(label, key)));
          renderHistory();
        }

        territorySelect.addEventListener("change", renderSectors);
        sectorSelect.addEventListener("change", renderHistory);
        disclosure.addEventListener("toggle", renderHistory);

        return (code) => {
          const isNational = code === "national";
          territories = new Map();
          const addTerritory = (key, label, level, series) => {
            const options = availableSectors(level, series);
            if (options.length) territories.set(key, { label, level, series, options });
          };
          addTerritory("scope", scopeLabel(), isNational ? "national" : "regional", isNational ? national : regions[code]);
          const geography = DATA.geography;
          const features = isNational ? geography.departments.features : geographyIndex(geography).departmentsByRegion.get(code) || [];
          const departmentOptions = features.map(({ properties }) => properties)
            .sort((left, right) => compareNames(left.nom, right.nom));
          for (const { code: departmentCode, nom } of departmentOptions) {
            addTerritory(departmentCode, `${nom} (${departmentCode})`, "departmental", departments[departmentCode]);
          }
          disclosure.hidden = territories.size === 0;
          if (disclosure.hidden) return;
          territorySelect.replaceChildren(...Array.from(territories, ([key, { label }]) => new Option(label, key)));
          territorySelect.disabled = territories.size === 1;
          renderSectors();
        };
      }

      function renderChiffresModule() {
        const { indicators, scopes, arrears } = DATA.modules.chiffres;
        const code = state.phase === "national" ? "national" : state.selectedRegion;
        const scope = scopes[code];
        if (displayedChiffresScope === scope) return;
        renderChiffresIndicators ??= createIndicatorCharts(document.getElementById("chiffresIndicators"), true);
        renderChiffresIndicators(indicators, scope);
        const arrearsIndicator = indicators.find(({ key }) => key === "trar90");
        if (arrears?.dates?.length && arrearsIndicator) {
          renderChiffresArrears ??= createChiffresArrearsBreakdown(arrears, arrearsIndicator);
          renderChiffresArrears(code);
        }
        displayedChiffresScope = scope;
      }
