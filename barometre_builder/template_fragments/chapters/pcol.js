      const pcolPointWindows = new WeakMap();
      const pcolRankingRows = new WeakMap();

      const PCOL_SECTOR_GROUPS = [
        { key: "industry", label: "Industrie & agriculture", codes: ["AZ", "C1", "C2", "C3", "C4", "C5", "DE"] },
        { key: "trade", label: "Construction & commerce", codes: ["FZ", "GZ", "HZ", "IZ"] },
        { key: "business", label: "Services", codes: ["JZ", "KZ", "LZ", "MN", "OQ", "RU"] },
        { key: "collective", label: "Autres", codes: ["Inconnu"] },
      ];

      function normalizePcolPoints(rawPoints, displayStartDate) {
        const cached = pcolPointWindows.get(rawPoints);
        if (cached && cached.displayStartDate === displayStartDate) return cached.points;
        const history = new Map(rawPoints.map((point) => [point[0], point]));
        const change = (value, previous) => previous ? Math.round((value / previous - 1) * 1000) / 10 : null;
        const points = rawPoints.filter((point) => point[0] >= displayStartDate).map(([date, nb, jobs]) => {
          const year = Number(date.slice(0, 4));
          const month = Number(date.slice(5, 7));
          const previousYear = history.get(`${year - 1}${date.slice(4)}`);
          const previousQuarter = history.get(`${month > 3 ? year : year - 1}-${String(month > 3 ? month - 3 : 10).padStart(2, "0")}-01`);
          return {
            date, nb, jobs,
            nb_yoy: change(nb, previousYear?.[1]), jobs_yoy: change(jobs, previousYear?.[2]),
            nb_qoq: change(nb, previousQuarter?.[1]), jobs_qoq: change(jobs, previousQuarter?.[2]),
          };
        });
        pcolPointWindows.set(rawPoints, { displayStartDate, points });
        return points;
      }

      function renderPcolTopSectors(rows) {
        let rankingRows = pcolRankingRows.get(rows);
        if (!rankingRows) {
          rankingRows = rows.map((sector) => ({ ...sector, value: sector.nb, yoy: sector.nb_yoy }));
          pcolRankingRows.set(rows, rankingRows);
        }
        renderSectorRanking({
          containerId: "pcolTopSectorsTable",
          tableClass: "pcol-top-table",
          rows: rankingRows,
          valueLabel: "Nombre",
          formatValue: (value) => frNumber(value, 0),
          emptyMessage: "Aucune procédure sectorielle sur ce trimestre.",
          onSelect: (key) => {
            state.pcolSectorKey = key;
            renderPcolModule();
            document.getElementById("pcolSectorPicker").querySelector(".employment-sector-trigger").focus({ preventScroll: true });
          },
        });
      }

      function renderPcolModule() {
        const data = DATA.modules.pcol;
        const scope = state.phase === "national" ? data?.national : data?.regions[state.selectedRegion];
        if (!data) return;
        if (!data.sectors.some((sector) => sector.key === state.pcolSectorKey)) state.pcolSectorKey = "population-entiere";
        if (!data.modes.some((mode) => mode.id === state.pcolMode)) state.pcolMode = "all";
        const sector = data.sectors.find((item) => item.key === state.pcolSectorKey);
        const mode = data.modes.find((item) => item.id === state.pcolMode);
        const points = normalizePcolPoints(scope?.modes[state.pcolMode]?.[state.pcolSectorKey] || [], data.displayStartDate);
        const latest = points[points.length - 1];
        document.getElementById("pcolChartTitle").textContent = `Procédures collectives : ${scopeLabel()}`;
        document.getElementById("pcolScope").textContent = `${scopeLabel()} • ${sector.label}`;
        const period = document.getElementById("pcolPeriod");
        period.textContent = latest ? quarterLabel(latest.date) : "Données indisponibles";
        period.dateTime = latest?.date || "";
        renderEmploymentSectorPicker("pcolSectorPicker", data.sectors, "pcolSectorKey", renderPcolModule, PCOL_SECTOR_GROUPS);
        renderQuarterlyModeSwitch("pcolModeSwitch", data.modes, state.pcolMode, (key) => {
          state.pcolMode = key;
          renderPcolModule();
        });
        document.getElementById("pcolCurrentNb").textContent = latest ? frNumber(latest.nb, 0) : "—";
        document.getElementById("pcolCurrentJobs").textContent = latest ? frNumber(latest.jobs, 0) : "—";
        renderEmploymentTrend("pcolCurrentNbYoY", latest?.nb_yoy);
        renderEmploymentTrend("pcolCurrentNbQoQ", latest?.nb_qoq);
        renderEmploymentTrend("pcolCurrentJobsYoY", latest?.jobs_yoy);
        renderEmploymentTrend("pcolCurrentJobsQoQ", latest?.jobs_qoq);
        document.getElementById("pcolTopSectorsMeta").textContent = latest ? quarterLabel(latest.date) : "—";
        renderPcolTopSectors(scope?.topSectors[state.pcolMode] || []);
        document.getElementById("pcolDataNote").textContent = "Entreprises employeuses · données brutes, non corrigées des variations saisonnières.";
        drawQuarterlyComparisonChart({
          svgId: "pcolChartSvg", tooltipId: "pcolTooltip", points,
          description: `Évolution trimestrielle des procédures collectives et des emplois menacés ou détruits — ${mode.label}`,
          scope: `${scopeLabel()} • ${sector.label}`,
          series: [
            { key: "nb", label: "Nombre de procédures", axisLabel: "Nb de procédures", compactAxisLabel: "Procédures", color: "var(--accent)", format: (value) => frNumber(value, 0), yoyKey: "nb_yoy" },
            { key: "jobs", label: "Emplois menacés ou détruits", axisLabel: "Emplois menacés ou détruits", compactAxisLabel: "Emplois", color: "var(--accent-secondary)", format: (value) => frNumber(value, 0), yoyKey: "jobs_yoy" },
          ],
        });
      }
