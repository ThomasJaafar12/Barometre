      const chiffresPayrollChart = {
        chartSvgId: "chiffresPayrollChartSvg",
        tooltipId: "chiffresPayrollTooltip",
        periodLabel: monthLabel,
        periodName: null,
        tickInterval: 12,
        responsive: true,
      };
      const chiffresPayrollMetric = {
        levelKey: "value",
        yoyKey: "yearlyChange",
        tooltipLevel: formatCurrency,
      };
      let displayedChiffresScope;
      let chiffresPayrollObserver;

      function drawChiffresPayroll(points) {
        const billions = d3.max(points, ({ value }) => value) >= 1e9;
        drawEmploymentChart(chiffresPayrollChart, points, {
          ...chiffresPayrollMetric,
          axisTitle: billions ? "Niveau (milliards d’euros)" : "Niveau (millions d’euros)",
          compactAxisTitle: billions ? "Niveau (Md€)" : "Niveau (M€)",
          axisTick: (value) => billions ? frNumber(value / 1e9, 1) : frNumber(value / 1e6, 0),
        });
      }

      function renderChiffresPayrollRanking(scopes, date, selectedCode) {
        const { points: nationalPoints } = scopes.national.payrollEarly;
        const national = date ? nationalPoints.findLast((point) => point.date === date)
          : nationalPoints.findLast(({ value }) => Number.isFinite(value));
        const rankingDate = date || national?.date;
        const total = national?.value;
        const hasTotal = Number.isFinite(total) && total > 0;
        const rows = [];
        if (rankingDate) {
          for (const { code, name } of DATA.regions) {
            const point = scopes[code]?.payrollEarly.points.findLast(({ date }) => date === rankingDate);
            if (!Number.isFinite(point?.value)) continue;
            rows.push({ key: code, label: name, value: point.value, share: hasTotal ? point.value / total * 100 : null });
          }
          rows.sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, "fr"));
        }

        const ranking = document.getElementById("chiffresPayrollRanking");
        ranking.hidden = !rows.length;
        if (ranking.hidden) return;
        const period = document.getElementById("chiffresPayrollRankingPeriod");
        period.textContent = monthLabel(rankingDate);
        period.dateTime = rankingDate;
        document.getElementById("chiffresPayrollCoverage").textContent = hasTotal
          ? "Part du total national couvert par le classeur, hors Mayotte."
          : "Part nationale indisponible pour ce mois.";
        renderSectorRanking({
          containerId: "chiffresPayrollRankingTable", rows, selectedKey: selectedCode,
          labelHeader: "Région", valueLabel: "Masse", changeLabel: "Part nationale",
          formatLabel: ({ label }) => label, formatValue: formatCurrency,
          formatSecondary: ({ share }) => formatPercent(share, 2),
        });
        const table = document.getElementById("chiffresPayrollRankingTable");
        const activeRow = table.querySelector(".is-active");
        const bottom = activeRow ? activeRow.getBoundingClientRect().bottom - table.getBoundingClientRect().top + table.scrollTop : 0;
        table.scrollTop = Math.max(0, Math.ceil(bottom - table.clientHeight));
      }

      function renderChiffresPayroll({ points }, scopes, code) {
        const latest = points.findLast(({ value }) => Number.isFinite(value));
        const territory = scopeLabel();
        document.getElementById("chiffresPayrollTitle").textContent = `Masse salariale mensuelle du secteur privé · ${territory}`;
        document.getElementById("chiffresPayrollScope").textContent = territory;
        const period = document.getElementById("chiffresPayrollPeriod");
        period.textContent = latest ? monthLabel(latest.date) : "Données indisponibles";
        if (latest) period.dateTime = latest.date;
        else period.removeAttribute("datetime");
        document.getElementById("chiffresPayrollCurrentLevel").textContent = formatCurrency(latest?.value);
        renderEmploymentTrend("chiffresPayrollCurrentYoY", latest?.yearlyChange);
        renderEmploymentTrend("chiffresPayrollCurrentMoM", latest?.monthlyChange);
        renderChiffresPayrollRanking(scopes, latest?.date, code);
        drawChiffresPayroll(points);
        if (!chiffresPayrollObserver) {
          chiffresPayrollObserver = new ResizeObserver(([{ target }]) => {
            const width = target.clientWidth;
            const viewBoxWidth = width < 600 ? Math.max(260, width) : 980;
            if (width && displayedChiffresScope && viewBoxWidth !== target.viewBox.baseVal.width) {
              drawChiffresPayroll(displayedChiffresScope.payrollEarly.points);
            }
          });
          chiffresPayrollObserver.observe(document.getElementById(chiffresPayrollChart.chartSvgId));
        }
      }

      function renderChiffresModule() {
        const { scopes, arrears } = DATA.modules.chiffres;
        const code = state.phase === "national" ? "national" : state.selectedRegion;
        const scope = scopes[code];
        if (displayedChiffresScope === scope) return;
        renderChiffresPayroll(scope.payrollEarly, scopes, code);
        renderTrarModule(arrears);
        renderChiffresDpae(scope.dpae);
        displayedChiffresScope = scope;
      }
