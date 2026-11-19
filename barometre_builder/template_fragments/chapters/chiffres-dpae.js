      const CHIFFRES_DPAE_MODES = [
        { id: "value", label: "CDI et CDD longs" },
        { id: "cdi", label: "CDI" },
        { id: "cddlong", label: "CDD de plus d’un mois" },
      ];
      let chiffresDpaeMode = "value";

      function renderChiffresDpae(series) {
        const scope = scopeLabel();
        const histories = {
          value: series?.points || [],
          cdi: series?.contracts?.cdi?.points || [],
          cddlong: series?.contracts?.cddlong?.points || [],
        };
        const latestByMode = Object.fromEntries(CHIFFRES_DPAE_MODES.map(({ id }) => [id,
          histories[id].findLast((point) => Number.isFinite(point.value)),
        ]));
        const byDate = Object.fromEntries(CHIFFRES_DPAE_MODES.map(({ id }) => [id,
          new Map(histories[id].map((point) => [point.date, point])),
        ]));
        const modes = CHIFFRES_DPAE_MODES.filter(({ id }) => latestByMode[id]);
        const contractModes = modes.filter(({ id }) => id !== "value");
        const totalMode = CHIFFRES_DPAE_MODES[0];
        const contractLabel = (mode) => mode.id === "value" ? "CDI et CDD de plus d’un mois" : mode.label;
        const formatLevel = (value) => frNumber(value, 0);
        document.getElementById("chiffresDpaeTitle").textContent = `Déclarations préalables à l’embauche · ${scope}`;
        document.getElementById("chiffresDpaeScope").textContent = scope;
        document.getElementById("chiffresDpaeCoverageNote").textContent = series?.coverageNote || "";
        document.getElementById("chiffresDpaeControls").hidden = modes.length < 2;
        document.getElementById("chiffresDpaeContracts").hidden = !contractModes.length;

        function setPeriod(id, date) {
          const period = document.getElementById(id);
          period.textContent = monthLabel(date);
          if (date) period.dateTime = date;
          else period.removeAttribute("datetime");
        }

        function selectMode(key) {
          chiffresDpaeMode = key;
          renderMode(modes.find(({ id }) => id === key));
        }

        function renderMode(mode) {
          const latest = latestByMode[mode.id];
          renderQuarterlyModeSwitch("chiffresDpaeModeSwitch", modes, mode.id, selectMode);
          setPeriod("chiffresDpaePeriod", latest?.date);
          setPeriod("chiffresDpaeContractsPeriod", latest?.date);
          document.getElementById("chiffresDpaeCurrentLabel").textContent = `Nombre de DPAE · ${contractLabel(mode)}`;
          document.getElementById("chiffresDpaeCurrentLevel").textContent = formatLevel(latest?.value);
          renderEmploymentTrend("chiffresDpaeCurrentYoY", latest?.yearlyChange);
          renderEmploymentTrend("chiffresDpaeCurrentMoM", latest?.monthlyChange);
          renderSectorRanking({
            containerId: "chiffresDpaeContractsTable", tableClass: "dpae-contract-table", labelHeader: "Contrat", showRank: false,
            rows: contractModes.map(({ id, label }) => {
              const point = byDate[id].get(latest?.date);
              return { key: id, label, value: point?.value, yoy: point?.yearlyChange };
            }),
            valueLabel: "Nombre", formatValue: formatLevel, formatLabel: ({ label }) => label,
            selectionLabel: ({ label }) => `Afficher les DPAE en ${label}`, selectedKey: mode.id,
            emptyMessage: "Aucune donnée disponible par contrat.", onSelect: selectMode,
          });

          const visibleModes = [mode];
          if (mode.id !== "value" && latestByMode.value) visibleModes.push(totalMode);
          const dates = [...new Set(visibleModes.flatMap(({ id }) => Array.from(byDate[id].keys())))].sort();
          const points = dates.map((date) => {
            const point = { date };
            for (const { id } of visibleModes) {
              const observation = byDate[id].get(date);
              point[id] = observation?.value;
              point[`${id}_yoy`] = observation?.yearlyChange;
            }
            return point;
          });
          const chartSeries = visibleModes.map((item, index) => ({
            key: item.id, label: contractLabel(item), yoyKey: `${item.id}_yoy`,
            axisLabel: "Nombre de DPAE", compactAxisLabel: "DPAE",
            color: index ? "var(--accent-secondary)" : "var(--accent)", format: formatLevel,
            compactFormat: (value) => value >= 1e3 ? `${frNumber(value / 1e3, 0)} k` : formatLevel(value),
          }));
          document.getElementById("chiffresDpaeLegend").replaceChildren(...(latest ? chartSeries : []).map(({ color, label }) => {
            const chip = textElement("span", "", "legend-chip");
            const line = textElement("i", "", "legend-line");
            line.style.color = color;
            line.setAttribute("aria-hidden", "true");
            chip.append(line, document.createTextNode(label));
            return chip;
          }));
          drawQuarterlyComparisonChart({
            svgId: "chiffresDpaeChartSvg", tooltipId: "chiffresDpaeTooltip", points, scope, sharedScale: true,
            periodLabel: monthLabel, tickInterval: Math.max(12, Math.ceil(points.length / 120) * 12),
            description: latest ? "Évolution mensuelle des déclarations préalables à l’embauche"
              : "Déclarations préalables à l’embauche · données indisponibles",
            series: chartSeries,
          });
        }

        renderMode(modes.find(({ id }) => id === chiffresDpaeMode) || modes[0] || totalMode);
      }
