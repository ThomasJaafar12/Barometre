      const dpaePointWindows = new WeakMap();

      function normalizeDpaePoints(rawPoints, displayStartDate) {
        const cached = dpaePointWindows.get(rawPoints);
        if (cached && cached.displayStartDate === displayStartDate) return cached.points;
        const history = new Map(rawPoints.map((point) => [point.date, {
          ...point, long: Number.isFinite(point.cdi) && Number.isFinite(point.cddlong) ? point.cdi + point.cddlong : null,
        }]));
        const change = (value, previous) => Number.isFinite(value) && Number.isFinite(previous) && previous !== 0
          ? Math.round((value / previous - 1) * 1000) / 10 : null;
        const points = [...history.values()].filter((point) => point.date >= displayStartDate).map((point) => {
          const year = Number(point.date.slice(0, 4));
          const month = Number(point.date.slice(5, 7));
          const previousYear = history.get(`${year - 1}${point.date.slice(4)}`);
          const previousMonth = history.get(`${month > 1 ? year : year - 1}-${String(month > 1 ? month - 1 : 12).padStart(2, "0")}-01`);
          const result = { ...point };
          ["value", "long", "cdi", "cddlong", "cddcourt"].forEach((key) => {
            result[`${key}_yoy`] = change(point[key], previousYear?.[key]);
            result[`${key}_mom`] = change(point[key], previousMonth?.[key]);
          });
          return result;
        });
        dpaePointWindows.set(rawPoints, { displayStartDate, points });
        return points;
      }

      function selectDpaeMode(key) {
        state.dpaeMode = key;
        renderDpaeModule();
        document.querySelector('#dpaeModeSwitch [aria-pressed="true"]').focus({ preventScroll: true });
      }

      function dpaeCompactNumber(value) {
        if (value >= 1e6) return `${frNumber(value / 1e6, 1)} M`;
        if (value >= 1e3) return `${frNumber(value / 1e3, 0)} k`;
        return frNumber(value, 0);
      }

      function renderDpaeModule() {
        const data = DATA.modules.dpae;
        if (!data) return;
        const scope = state.phase === "national" ? data.national : data.regions[state.selectedRegion];
        const mode = data.modes.find((item) => item.id === state.dpaeMode) || data.modes[0];
        state.dpaeMode = mode.id;
        const points = normalizeDpaePoints(scope?.points || [], data.displayStartDate);
        const latest = points[points.length - 1];
        const title = `Déclarations préalables à l’embauche : ${scopeLabel()}`;
        document.getElementById("dpaeChartTitle").textContent = title;
        document.getElementById("dpaeScope").textContent = `${scopeLabel()} • ${mode.label}`;
        const period = document.getElementById("dpaePeriod");
        period.textContent = latest ? monthLabel(latest.date) : "Données indisponibles";
        period.dateTime = latest?.date || "";
        renderQuarterlyModeSwitch("dpaeModeSwitch", data.modes, mode.id, selectDpaeMode);
        document.getElementById("dpaeCurrentNbLabel").textContent = `Nombre de DPAE · ${mode.label}`;
        document.getElementById("dpaeCurrentNb").textContent = frNumber(latest?.[mode.key], 0);
        document.getElementById("dpaeCurrentLong").textContent = frNumber(latest?.long, 0);
        document.getElementById("dpaeLongShare").textContent = latest?.long != null && latest.value > 0
          ? `${formatPercent(latest.long / latest.value * 100)} de l’ensemble des déclarations` : "";
        renderEmploymentTrend("dpaeCurrentNbYoY", latest?.[`${mode.key}_yoy`]);
        renderEmploymentTrend("dpaeCurrentNbMoM", latest?.[`${mode.key}_mom`]);
        renderEmploymentTrend("dpaeCurrentLongYoY", latest?.long_yoy);
        renderEmploymentTrend("dpaeCurrentLongMoM", latest?.long_mom);
        document.getElementById("dpaeLegendNb").textContent = mode.label;
        document.getElementById("dpaeContractsMeta").textContent = latest ? monthLabel(latest.date) : "—";
        renderSectorRanking({
          containerId: "dpaeContractsTable", tableClass: "dpae-contract-table", labelHeader: "Contrat", showRank: false,
          rows: latest ? data.modes.filter((item) => item.id !== "all").map((item) => ({
            key: item.id, label: item.label, value: latest[item.key], yoy: latest[`${item.key}_yoy`],
          })).sort((a, b) => (b.value ?? -1) - (a.value ?? -1)) : [],
          valueLabel: "Nombre", formatValue: (value) => frNumber(value, 0), formatLabel: (item) => item.label,
          selectionLabel: (item) => `Afficher les DPAE en ${item.label}`, selectedKey: mode.id,
          emptyMessage: "Aucune donnée par contrat pour ce territoire.", onSelect: selectDpaeMode,
        });
        const missing = DATA.regions.filter((region) => !data.coveredRegions.includes(region.code)).map((region) => region.name);
        document.getElementById("dpaeCoverageNote").textContent = !scope
          ? `Les données DPAE ne sont pas disponibles pour ${scopeLabel()} dans le fichier fourni.`
          : state.phase === "national" && missing.length ? `Périmètre national : régions disponibles dans le fichier, hors ${missing.join(", ")}.` : "";
        drawQuarterlyComparisonChart({
          svgId: "dpaeChartSvg", tooltipId: "dpaeTooltip", points, sharedScale: true,
          periodLabel: monthLabel, tickInterval: 12,
          description: `Évolution mensuelle des déclarations préalables à l’embauche — ${mode.label}`,
          scope: scopeLabel(),
          series: [
            { key: mode.key, label: mode.label, axisLabel: "Nombre de DPAE", compactAxisLabel: "DPAE", color: "var(--accent)", format: (value) => frNumber(value, 0), compactFormat: dpaeCompactNumber, yoyKey: `${mode.key}_yoy` },
            { key: "long", label: "CDI et CDD longs", color: "var(--accent-secondary)", format: (value) => frNumber(value, 0), yoyKey: "long_yoy" },
          ],
        });
      }
