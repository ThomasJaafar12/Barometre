      const employmentDepartmentViews = new Map();

      function departmentRelativeChange(value, reference) {
        return Number.isFinite(value) && Number.isFinite(reference) && reference !== 0
          ? 100 * (value - reference) / reference : null;
      }

      function departmentPercentChange(value) {
        return `${value >= 0.05 ? "+" : ""}${formatPercent(value)}`;
      }

      function decodeEmploymentDepartmentSeries(series) {
        let value = 0;
        return series?.map((delta) => {
          if (delta == null) return null;
          value = Array.isArray(delta) ? delta[0] : value + delta;
          return value;
        }) || [];
      }

      function renderEmploymentDepartmentHistory(view, selection, code) {
        const { prefix, sector, metric, history, departments, dateIndex, priorYear, reference,
          referenceLabel, formatValue } = view;
        const element = (suffix) => document.getElementById(`${prefix}${suffix}`);
        const department = departments.get(code);
        const place = department ? `${department.name} (${code})` : "";
        element("DepartmentChartTitle").textContent = place ? `Historique · ${place}` : "Historique départemental";
        const values = department?.values || [];
        const firstIndex = values.findIndex(Number.isFinite);
        const lastIndex = values.findLastIndex(Number.isFinite);
        const points = firstIndex < 0 ? [] : history.dates.slice(firstIndex, lastIndex + 1).map((date, offset) => {
          const index = firstIndex + offset;
          return {
            date, [metric.key]: values[index], reference: reference[index],
            [`${metric.key}_yoy`]: departmentRelativeChange(values[index], values[priorYear[index]]),
          };
        });

        const kpis = element("DepartmentKpis");
        kpis.replaceChildren();
        if (department) {
          const gap = departmentRelativeChange(department.value, reference[dateIndex]);
          const trend = department.change;
          for (const [title, value, color] of [
            [metric.label, formatValue(department.value)],
            ["Gliss. annuel", departmentPercentChange(trend), trend >= 0.05 ? "var(--dashboard-green)" : trend <= -0.05 ? "var(--dashboard-red)" : null],
            ["Écart à la moyenne", departmentPercentChange(gap)],
          ]) {
            const item = textElement("div", "", "trar-mini-kpi");
            const number = textElement("strong", value);
            if (color) number.style.color = color;
            item.append(textElement("small", title), number);
            kpis.append(item);
          }
        }

        const period = element("HistoryPeriod");
        const drawPeriod = () => {
          const lastDate = history.dates[lastIndex];
          const recentStart = lastDate ? `${Number(lastDate.slice(0, 4)) - 3}${lastDate.slice(4)}` : "";
          const windowPoints = selection.fullHistory ? points : points.filter(({ date }) => date > recentStart);
          const firstDate = windowPoints[0]?.date;
          const benchmarkPoints = windowPoints.map(({ date, reference }) => ({ date, [metric.key]: reference }));
          const hasBenchmark = benchmarkPoints.some((point) => Number.isFinite(point[metric.key]));
          period.textContent = selection.fullHistory ? "Série complète" : "3 dernières années";
          period.setAttribute("aria-label", selection.fullHistory ? "Série complète. Afficher les trois dernières années"
            : "3 dernières années. Afficher la série complète");
          period.disabled = !points.length;
          element("DepartmentChartContext").textContent = `${sector.label} · ${metric.label}${firstDate ? ` · depuis ${quarterLabel(firstDate)}` : ""}`;
          renderDepartmentChartLegend(`${prefix}DepartmentChartLegend`, department ? `${department.name} · ${metric.label}` : metric.label,
            metric.color, hasBenchmark ? referenceLabel : null);
          renderDepartmentChart(`${prefix}DepartmentChartSvg`, `${prefix}DepartmentChartTooltip`, {
            points: windowPoints, metric, scope: place, benchmarkPoints: hasBenchmark ? benchmarkPoints : null,
            benchmarkLabel: referenceLabel, viewBoxWidth: 640, compactHeight: 360, quarterly: true,
            formatValue, formatPeriod: quarterLabel, formatChange: departmentPercentChange,
            axisLabel: metric.label, changeLabel: "Glissement annuel",
          });
        };
        period.onclick = () => {
          selection.fullHistory = !selection.fullHistory;
          drawPeriod();
        };
        drawPeriod();
      }

      function renderEmploymentDepartment({ prefix, data, sectors, sectorState, metricState, groups, endpoints, color }) {
        let selection = employmentDepartmentViews.get(prefix);
        if (!selection) {
          selection = { departments: new Map(), fullHistory: false };
          employmentDepartmentViews.set(prefix, selection);
        }
        const sector = sectors.find(({ key }) => key === state[sectorState]) || sectors[0];
        const activeMetric = data.metrics.find(({ key }) => key === state[metricState]) || data.metrics[0];
        const metric = { ...activeMetric, color, shortLabel: activeMetric.label };
        state[sectorState] = sector.key;
        const rerender = () => renderEmploymentDepartment({ prefix, data, sectors, sectorState, metricState, groups, endpoints, color });
        renderEmploymentSectorPicker(`${prefix}SectorPicker`, sectors, sectorState, rerender, groups);
        renderButtonOptions(document.getElementById(`${prefix}MetricSwitch`), data.metrics, metric.key, (key) => {
          state[metricState] = key;
          rerender();
        }, { ariaPressed: true, skipActive: true });

        const national = state.phase === "national";
        const scope = national ? "national" : state.selectedRegion;
        const label = scopeLabel();
        const geography = DATA.geography;
        const features = national ? geography.departments.features : geographyIndex(geography).departmentsByRegion.get(scope) || [];
        const history = data.history || { dates: [], departments: {} };
        const dateIndices = new Map(history.dates.map((date, index) => [date, index]));
        const dateIndex = dateIndices.get(data.latestDate);
        const priorYear = history.dates.map((date) => dateIndices.get(`${Number(date.slice(0, 4)) - 1}${date.slice(4)}`));
        const departments = new Map(features.map(({ properties: { code, nom: name, region } }) => {
          const values = decodeEmploymentDepartmentSeries(history.departments[code]?.[sector.key]?.[metric.key]);
          const value = values[dateIndex];
          return [code, { code, name, region, value, values, hasHistory: values.some(Number.isFinite),
            change: departmentRelativeChange(value, values[priorYear[dateIndex]]) }];
        }));
        const reference = history.dates.map((_, index) => d3.mean(departments.values(), ({ values }) => values[index]));
        const referenceLabel = `Moyenne des départements · ${label}`;
        const formatValue = ["masse_cvs", "turnover"].includes(metric.key) ? formatCurrency : formatCount;
        const view = { prefix, sector, metric, history, departments, dateIndex, priorYear, reference, referenceLabel, formatValue };
        const element = (suffix) => document.getElementById(`${prefix}${suffix}`);
        const selectionKey = `${scope}:${sector.key}:${metric.key}`;
        element("TreemapShell").hidden = !national;
        element("MapShell").hidden = national;
        const interpolate = d3.interpolateRgb(...endpoints);
        const snapshot = renderDepartmentSnapshot({
          mapSvg: element("MapSvg"), treemapSvg: element("TreemapSvg"), legend: element("Legend"),
          features, national, label, departments, formatValue, palette: [0, 0.25, 0.5, 0.75, 1].map(interpolate),
          selected: selection.departments.get(selectionKey),
          describe: ({ name, code, region, value, change }) => {
            const regionName = national ? regionsByCode.get(region)?.name : null;
            const details = [`${metric.label} : ${Number.isFinite(value) ? formatValue(value) : "Donnée indisponible"}`];
            if (Number.isFinite(change)) details.push(`Glissement annuel : ${departmentPercentChange(change)}`);
            return { place: `${name} (${code})${regionName ? ` · ${regionName}` : ""}`, details: details.join(" · ") };
          },
          onSelect: (code) => {
            selection.departments.set(selectionKey, code);
            renderEmploymentDepartmentHistory(view, selection, code);
          },
        });
        element("MapMeta").textContent = `${label} · ${sector.label} · ${metric.label} · ${snapshot.hasValues ? quarterLabel(data.latestDate) : "Données indisponibles"}`;
        const { highest } = snapshot;
        element("HighestDepartment").hidden = !highest;
        if (highest) element("HighestDepartmentLabel").textContent = `Valeur la plus élevée : ${highest.name} (${highest.code}) · ${formatValue(highest.value)}`;
        renderEmploymentDepartmentHistory(view, selection, snapshot.selected);
      }
