      const TRAR_HORIZONS = [
        { key: "j90", index: 2, label: "90 jours après l’échéance", shortLabel: "À 90 jours", color: "#98511F" },
        { key: "moisSuivant", index: 1, label: "Fin du mois suivant", shortLabel: "Mois suivant", color: "#087783" },
        { key: "fin", index: 0, label: "Fin du mois d’échéance", shortLabel: "À l’échéance", color: "#004B9B" },
      ];
      const TRAR_REGIONAL_GROUPS = [
        {
          key: "industry",
          label: "Industrie & énergie",
          codes: [
            "industries-extractives", "industries-agro", "habillement-textile-et-cuir", "bois-et-papier",
            "cokefaction-raffinage-industrie-chimique-et-pharmaceutique",
            "industrie-des-plastiques-et-autres-produits-non-mineraux",
            "metallurgie-et-fabrication-de-produits-metalliques",
            "fabrication-de-produits-inform-elect-et-optiques-et-d-equipement-elect",
            "fabrication-de-machines-et-de-materiel-de-transport",
            "industrie-du-meuble-et-diverses-reparation-et-installation-de-machines",
            "production-et-distribution-d-electricite-de-gaz-et-d-eau",
          ],
        },
        {
          key: "trade",
          label: "BTP, commerce & transp.",
          codes: [
            "construction", "commerce-reparation-d-automobiles-et-de-motocycles",
            "transports-et-entreposage", "hebergement-et-restauration",
          ],
        },
        {
          key: "business",
          label: "Services entreprises",
          codes: [
            "edition-telecommunications-et-activites-informatiques",
            "activites-financieres-et-d-assurance", "activites-immobilieres",
            "activites-juridiques-de-conseil-et-d-ingenierie",
            "recherche-developpement-et-autres-activites-scientifiques-et-techniques",
            "interimaires", "activites-de-services-administratifs-et-de-soutien-hors-interimaires",
          ],
        },
        {
          key: "collective",
          label: "Services collectifs",
          codes: [
            "administration-publique", "education", "activites-pour-la-sante-humaine",
            "action-sociale-et-hebergement-medico", "arts-spectacles-et-activites-recreatives",
            "autres-activites-de-services",
          ],
        },
      ];

      const TRAR_NATIONAL_GROUPS = [
        { key: "industry", label: "Agri, industrie & énergie", min: 1, max: 39 },
        { key: "trade", label: "BTP, commerce & transp.", min: 41, max: 56 },
        { key: "business", label: "Services entreprises", min: 58, max: 82 },
        { key: "collective", label: "Services collectifs", min: 84, max: 96 },
      ];

      const TRAR_DEFAULT_SECTOR = "tous-secteurs";
      const TRAR_HORIZON_OPTIONS = TRAR_HORIZONS.map(({ key, shortLabel }) => ({ key, label: shortLabel }));
      const trarSelection = {
        nationalSector: TRAR_DEFAULT_SECTOR,
        regionalSector: TRAR_DEFAULT_SECTOR,
        departmentSector: TRAR_DEFAULT_SECTOR,
        mainHorizon: "j90",
        departmentHorizon: "j90",
        fullHistory: false,
        departments: new Map(),
      };
      const trarSeriesByValues = new WeakMap();
      const trarPickerViews = new WeakMap();
      const trarDateIndexes = new WeakMap();
      const trarSnapshots = new Map();

      function formatTrarPercent(value) {
        if (!Number.isFinite(value)) return "—";
        const magnitude = Math.abs(value);
        const decimals = magnitude && magnitude < 0.00005 ? 6 : magnitude && magnitude < 0.005 ? 4 : 2;
        return `${frNumber(value, decimals)}\u00a0%`;
      }

      function formatTrarChange(change) {
        if (!Number.isFinite(change)) return "—";
        const sign = change > 0 ? "+" : change < 0 ? "−" : "";
        return `${sign}${frNumber(Math.abs(change), 2)}\u00a0pt`;
      }

      function trarPreviousYearIndex(data, date) {
        let index = trarDateIndexes.get(data.dates);
        if (!index) {
          index = new Map(data.dates.map((month, position) => [month, position]));
          trarDateIndexes.set(data.dates, index);
        }
        return index.get(`${Number(date.slice(0, 4)) - 1}${date.slice(4)}`);
      }

      function trarHorizonValue(data, value, horizon) {
        return data.horizon ? value : value?.[horizon.index];
      }

      function trarSeries(data, values) {
        if (!values) return { points: [], latest: {} };
        const cached = trarSeriesByValues.get(values);
        if (cached) return cached;
        const horizons = data.horizon ? TRAR_HORIZONS.filter(({ key }) => key === data.horizon) : TRAR_HORIZONS;
        const latest = {};
        const allPoints = data.dates.map((date, month) => {
          const point = { date };
          const previous = values[trarPreviousYearIndex(data, date)];
          horizons.forEach((horizon) => {
            const { key } = horizon;
            const value = trarHorizonValue(data, values[month], horizon);
            point[key] = value ?? null;
            if (!Number.isFinite(value)) return;
            const prior = trarHorizonValue(data, previous, horizon);
            if (Number.isFinite(prior)) point[`${key}_yoy`] = Number((value - prior).toFixed(2));
            if (date >= data.displayStartDate) latest[key] = { date, value };
          });
          return point;
        });
        const first = allPoints.findIndex((point) => point.date >= data.displayStartDate
          && horizons.some(({ key }) => Number.isFinite(point[key])));
        const end = data.horizon ? allPoints.findLastIndex((point) => Number.isFinite(point[data.horizon])) + 1 : allPoints.length;
        const result = { points: first === -1 ? [] : allPoints.slice(first, end), latest };
        trarSeriesByValues.set(values, result);
        return result;
      }

      function trarRecentPoints({ points, latest }, horizon) {
        const lastDate = latest[horizon.key]?.date;
        if (!lastDate) return [];
        const start = new Date(lastDate);
        start.setUTCMonth(start.getUTCMonth() - 35);
        const firstDate = start.toISOString().slice(0, 10);
        return points.filter(({ date }) => date >= firstDate && date <= lastDate);
      }

      function trarSetPeriod(id, date) {
        const period = document.getElementById(id);
        period.textContent = date ? monthLabel(date) : "—";
        if (date) period.dateTime = date;
        else period.removeAttribute("datetime");
      }

      function renderTrarHorizonSwitch(id, data, activeKey, onSelect) {
        const container = document.getElementById(id);
        container.hidden = Boolean(data.horizon);
        if (container.hidden) return;
        renderButtonOptions(container, TRAR_HORIZON_OPTIONS, activeKey, onSelect, { ariaPressed: true, skipActive: true });
        Array.from(container.children).forEach((button, index) => {
          if (button.firstElementChild) return;
          const dot = textElement("span", "", "horizon-dot");
          dot.setAttribute("aria-hidden", "true");
          dot.style.background = TRAR_HORIZONS[index].color;
          button.prepend(dot);
        });
      }

      function trarPickerGroups(options, national) {
        const categories = national ? TRAR_NATIONAL_GROUPS : TRAR_REGIONAL_GROUPS;
        const groups = categories.map(({ key, label, codes, min, max }) => ({
          key, label,
          options: national
            ? options.filter((option) => Number(option.key) >= min && Number(option.key) <= max)
            : codes.map((code) => options.find((option) => option.key === code)).filter(Boolean),
        }));
        const grouped = new Set(groups.flatMap((group) => group.options.map((option) => option.key)));
        const others = options.filter(({ key }) => key !== TRAR_DEFAULT_SECTOR && !grouped.has(key));
        if (others.length) groups.push({ key: "other", label: "Autres secteurs", options: others });
        return groups;
      }

      function mountTrarSectorPicker(control, searchable) {
        const label = textElement("span", "", "employment-select-label");
        const trigger = textElement("button", "", "employment-sector-trigger");
        const value = textElement("span", "", "employment-sector-trigger-value");
        const arrow = svgElement("svg", { viewBox: "0 0 20 20", "aria-hidden": "true" });
        arrow.append(svgElement("path", { d: "m5 7.5 5 5 5-5" }));
        const menu = textElement("div", "", "employment-sector-menu");
        menu.id = `${control.id}Menu`;
        menu.setAttribute("role", "listbox");
        trigger.type = "button";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-controls", menu.id);
        trigger.setAttribute("aria-expanded", "false");
        trigger.append(value, arrow);
        control.append(label, trigger, menu);

        const view = { label, trigger, value, menu, buttons: new Map() };
        const setOpen = (open, focusPosition) => {
          if (open) {
            closeEmploymentSectorPickers(control);
            if (view.search?.value) {
              view.search.value = "";
              view.filterOptions();
            }
          }
          setEmploymentSectorPickerOpen(control, open, focusPosition);
          if (open && searchable && !focusPosition) {
            requestAnimationFrame(() => {
              if (control.classList.contains("is-open")) view.search.focus();
            });
          }
        };
        trigger.addEventListener("click", () => setOpen(!control.classList.contains("is-open")));
        trigger.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true, event.key === "ArrowDown" ? "active" : "last");
        });
        menu.addEventListener("click", (event) => {
          const option = event.target.closest("[data-sector-key]");
          if (!option) return;
          setOpen(false);
          view.onSelect(option.dataset.sectorKey);
          trigger.focus({ preventScroll: true });
        });
        menu.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            trigger.focus({ preventScroll: true });
            return;
          }
          const options = Array.from(view.buttons.values(), ({ button }) => button)
            .filter((button) => !button.closest("[hidden]"));
          const index = options.indexOf(document.activeElement);
          const offsets = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
          if (index === -1 && event.key !== "ArrowDown") return;
          let next;
          if (event.key === "Home") next = 0;
          else if (event.key === "End") next = options.length - 1;
          else if (offsets[event.key]) next = Math.max(0, Math.min(options.length - 1, index + offsets[event.key]));
          else return;
          event.preventDefault();
          options[next]?.focus({ preventScroll: true });
        });
        document.addEventListener("click", (event) => {
          if (control.classList.contains("is-open") && !control.contains(event.target)) setOpen(false);
        });
        return view;
      }

      function renderTrarSectorPicker({ id, label, options, groups, selectedKey, onSelect, rateFor = null }) {
        const control = document.getElementById(id);
        const searchable = Boolean(rateFor);
        let view = trarPickerViews.get(control);
        if (!view) {
          view = mountTrarSectorPicker(control, searchable);
          trarPickerViews.set(control, view);
        }

        view.label.textContent = label;
        view.menu.setAttribute("aria-label", label);
        const current = options.find(({ key }) => key === selectedKey)?.label || "—";
        view.value.textContent = current;
        view.trigger.setAttribute("aria-label", `${label} · ${current}`);
        view.onSelect = onSelect;
        if (view.options !== options) {
          view.options = options;
          view.buttons.clear();
          const optionButton = ({ key, label }, aggregate = false) => {
            const button = textElement("button", "", `employment-sector-option${aggregate ? " employment-sector-all-option" : ""}`);
            button.type = "button";
            button.dataset.sectorKey = key;
            button.setAttribute("role", "option");
            const right = textElement("span", "", "employment-sector-option-right");
            const badge = searchable ? textElement("span", "", "picker-rate-pill") : null;
            if (badge) right.append(badge);
            const dot = textElement("span", "", "employment-sector-active-dot");
            dot.setAttribute("aria-hidden", "true");
            right.append(dot);
            button.append(textElement("span", label), right);
            view.buttons.set(key, { button, badge });
            return button;
          };
          const header = textElement("div", "", "employment-sector-menu-header");
          header.append(textElement("span", label, "employment-sector-menu-title"));
          const aggregate = options.find(({ key }) => key === TRAR_DEFAULT_SECTOR);
          const tools = textElement("div", "", "employment-sector-menu-tools");
          if (aggregate) tools.append(optionButton(aggregate, true));
          const search = searchable ? textElement("input", "", "picker-search-input") : null;
          if (search) {
            search.type = "search";
            search.placeholder = "Rechercher un secteur…";
            search.setAttribute("aria-label", "Rechercher un secteur");
            view.search = search;
            tools.append(search);
          }
          header.append(tools);
          const grid = textElement("div", "", "employment-sector-grid");
          const columns = groups().filter((group) => group.options.length).map((group) => {
            const column = textElement("section", "", `employment-sector-column employment-sector-column--${group.key}`);
            column.setAttribute("role", "group");
            column.setAttribute("aria-label", group.label);
            const head = textElement("div", "", "employment-sector-column-header");
            const count = textElement("span", group.options.length, "employment-sector-count");
            head.append(textElement("span", group.label, "employment-sector-badge"), count);
            const list = textElement("ul", "", "employment-sector-list");
            const items = group.options.map((option) => {
              const item = textElement("li", "");
              item.append(optionButton(option));
              list.append(item);
              return { item, label: `${option.label} ${option.key}`.toLocaleLowerCase("fr") };
            });
            column.append(head, list);
            grid.append(column);
            return { column, count, items };
          });
          view.filterOptions = () => {
            const query = search.value.trim().toLocaleLowerCase("fr");
            columns.forEach(({ column, count, items }) => {
              let visible = 0;
              items.forEach(({ item, label }) => {
                item.hidden = !label.includes(query);
                if (!item.hidden) visible += 1;
              });
              column.hidden = visible === 0;
              count.textContent = visible;
            });
          };
          search?.addEventListener("input", view.filterOptions);
          view.menu.replaceChildren(header, grid);
        }
        view.buttons.forEach(({ button, badge }, key) => {
          const selected = key === selectedKey;
          button.classList.toggle("is-active", selected);
          button.setAttribute("aria-selected", String(selected));
          if (!badge) return;
          const rate = rateFor(key);
          badge.hidden = !Number.isFinite(rate);
          badge.textContent = formatTrarPercent(rate);
        });
      }

      function trarTrend(label, change) {
        const item = textElement("div", "", "employment-dashboard-stat");
        const direction = !Number.isFinite(change) ? "unknown" : change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
        const trend = textElement("strong", "", `employment-dashboard-trend is-${direction}`);
        const svg = svgElement("svg", { "aria-hidden": "true", viewBox: "0 0 24 24" });
        svg.append(svgElement("path", { d: "M5 10l7-7m0 0 7 7M12 3v18" }));
        trend.append(svg, textElement("span", formatTrarChange(change)));
        item.append(textElement("span", label, "employment-dashboard-stat-label"), trend);
        return item;
      }

      function renderTrarLatest(horizon, latest, changes, comparison, referenceLabel) {
        const card = textElement("div", "", "delai-kpi-block");
        const level = textElement("div", "", "trar-rate-level");
        level.append(textElement("strong", formatTrarPercent(latest?.value), "delai-level-value"));
        if (latest) {
          const period = textElement("time", monthLabel(latest.date));
          period.dateTime = latest.date;
          level.append(period);
        }
        const [year, month] = changes || [];
        const stats = textElement("div", "", "employment-dashboard-stats");
        stats.append(trarTrend("Gliss. annuel", year), trarTrend("Gliss. mensuel", month));
        card.append(textElement("span", horizon.label, "employment-dashboard-level-label"), level, stats);
        if (latest && comparison) {
          const diff = Number((latest.value - comparison.value).toFixed(2));
          const chip = textElement("div", "", `trar-benchmark-gap${diff > 0 ? " is-higher" : diff < 0 ? " is-lower" : ""}`);
          chip.append(document.createTextNode(`Écart vs ${referenceLabel} : `), textElement("strong", formatTrarChange(diff)));
          card.append(chip);
        }
        document.getElementById("trarLatest").replaceChildren(card);
      }

      function renderTrarLegend(id, title, horizon, reference = null) {
        renderDepartmentChartLegend(id, title, horizon.color, reference);
      }

      function renderTrarRanking(options, snapshot, selectedKey, selectSector) {
        trarSetPeriod("trarTopSectorsMeta", snapshot?.date);
        const rows = (snapshot?.rows || []).map(([key, value, yoy]) => ({
          key, label: options.find((option) => option.key === key)?.label || key, value, yoy,
        }));
        renderSectorRanking({
          containerId: "trarTopSectorsTable",
          rows, selectedKey,
          valueLabel: "Taux", changeLabel: "Écart 1 an",
          formatLabel: ({ label }) => label,
          formatValue: formatTrarPercent,
          formatChange: formatTrarChange,
          emptyMessage: "Aucun taux sectoriel disponible pour cette échéance.",
          onSelect: (key) => {
            selectSector(key);
            trarPickerViews.get(document.getElementById("trarSectorPicker")).trigger.focus({ preventScroll: true });
          },
        });
      }

      function trarSnapshot(data, features, scope, sectorKey, horizon) {
        const cacheKey = `${scope}:${sectorKey}:${horizon.key}`;
        if (trarSnapshots.has(cacheKey)) return trarSnapshots.get(cacheKey);
        const dateIndex = trarHorizonValue(data, data.departmentSnapshots[sectorKey], horizon);
        const date = dateIndex == null ? null : data.dates[dateIndex];
        const previousIndex = date ? trarPreviousYearIndex(data, date) : undefined;
        const departments = new Map(features.map(({ properties }) => {
          const { code, nom: name, region } = properties;
          const series = data.departments[code]?.[sectorKey];
          const value = trarHorizonValue(data, series?.[dateIndex], horizon);
          const previous = trarHorizonValue(data, series?.[previousIndex], horizon);
          const change = Number.isFinite(value) && Number.isFinite(previous)
            ? Number((value - previous).toFixed(2)) : null;
          const hasHistory = Boolean(data.horizon ? series?.some(Number.isFinite) : series);
          return [code, { code, name, region, value, change, hasHistory }];
        }));
        const result = { date, ...buildDepartmentSnapshot(departments) };
        trarSnapshots.set(cacheKey, result);
        return result;
      }

      function describeTrarDepartment({ name, code, region, value, change }, national, horizon) {
        const regionName = national ? regionsByCode.get(region)?.name : null;
        const place = `${name} (${code})${regionName ? ` · ${regionName}` : ""}`;
        const rate = Number.isFinite(value) ? formatTrarPercent(value) : "Taux indisponible";
        const details = [`${horizon.shortLabel} : ${rate}`];
        if (Number.isFinite(change)) details.push(`Écart annuel : ${formatTrarChange(change)}`);
        return { place, details: details.join(" · ") };
      }

      function renderTrarChart(svgId, tooltipId, { horizon, ...config }) {
        renderDepartmentChart(svgId, tooltipId, {
          ...config, metric: horizon, formatValue: formatTrarPercent, formatChange: formatTrarChange,
          formatPeriod: monthLabel, axisLabel: `${horizon.label} (%)`, changeLabel: "Écart annuel",
        });
      }

      function renderTrarMainChart(data, { national, scope, label, scopeSeries }) {
        const options = national ? data.sectors.national : data.sectors.regional;
        const sectorState = national ? "nationalSector" : "regionalSector";
        const sector = options.find(({ key }) => key === trarSelection[sectorState]) || options[0];
        const dashboard = national ? data.dashboards.national : data.dashboards.regions[scope];
        const horizon = TRAR_HORIZONS.find(({ key }) => key === (data.horizon || trarSelection.mainHorizon));
        const { points, latest } = trarSeries(data, scopeSeries?.[sector.key]);

        const selectSector = (key) => {
          trarSelection[sectorState] = key;
          renderTrarMainChart(data, { national, scope, label, scopeSeries });
        };
        renderTrarSectorPicker({
          id: "trarSectorPicker",
          label: `Secteur d’activité (${national ? "NACE 88" : "NACE 28"})`,
          options,
          groups: () => trarPickerGroups(options, national),
          selectedKey: sector.key,
          onSelect: selectSector,
          rateFor: (key) => trarSeries(data, scopeSeries?.[key]).latest[horizon.key]?.value,
        });
        renderTrarHorizonSwitch("trarMainHorizonSwitch", data, horizon.key, (key) => {
          trarSelection.mainHorizon = key;
          renderTrarMainChart(data, { national, scope, label, scopeSeries });
        });
        document.getElementById("trarChartScope").textContent = `${label} · ${sector.label} · ${horizon.label}`;
        document.getElementById("trarDashboardScope").textContent = `${label} · ${sector.label}`;
        trarSetPeriod("trarDashboardPeriod", latest[horizon.key]?.date);

        let reference = null;
        let referenceLabel = "";
        if (sector.key !== TRAR_DEFAULT_SECTOR) {
          reference = trarSeries(data, scopeSeries?.[TRAR_DEFAULT_SECTOR]);
          referenceLabel = "Tous secteurs";
        } else if (!national) {
          reference = trarSeries(data, data.national?.[TRAR_DEFAULT_SECTOR]);
          referenceLabel = "France entière · Tous secteurs";
        }
        const observation = latest[horizon.key];
        const changes = trarHorizonValue(data, dashboard?.changes?.[sector.key], horizon);
        const ranking = trarHorizonValue(data, dashboard?.rankings, horizon);
        const comparison = data.horizon ? trarReferenceAtDate(reference, observation?.date, horizon) : reference?.latest[horizon.key];
        renderTrarLatest(horizon, observation, changes, comparison, referenceLabel);
        renderTrarRanking(options, ranking, sector.key, selectSector);
        renderTrarLegend("trarChartLegend", `${horizon.label} (${sector.label})`, horizon,
          reference?.points.length ? `Référence · ${referenceLabel}` : null);
        renderTrarChart("trarChartSvg", "trarChartTooltip", {
          points, horizon, scope: `${label} · ${sector.label}`,
          benchmarkPoints: reference?.points,
          benchmarkLabel: referenceLabel,
          viewBoxWidth: 940,
        });
      }

      function trarReferenceAtDate(reference, date, horizon) {
        const value = reference?.points.findLast((point) => point.date === date)?.[horizon.key];
        return Number.isFinite(value) ? { value } : null;
      }

      function renderTrarDepartmentHistory({ data, selected, sector, horizon, national, label, snapshot, reference }) {
        const department = snapshot.departments.get(selected);
        const place = department ? `${department.name} (${department.code})` : "";
        document.getElementById("trarDepartmentChartTitle").textContent = place ? `Historique · ${place}` : "Historique départemental";
        const series = trarSeries(data, department && data.departments[department.code]?.[sector.key]);
        const recent = trarRecentPoints(series, horizon);
        const period = document.getElementById("trarHistoryPeriod");

        const kpis = document.getElementById("trarDepartmentKpis");
        function miniKpi(title, value, change = null) {
          const item = textElement("div", "", "trar-mini-kpi");
          const number = textElement("strong", value);
          if (Number.isFinite(change) && change !== 0) number.style.color = change > 0 ? "var(--dashboard-red)" : "var(--dashboard-green)";
          item.append(textElement("small", title), number);
          return item;
        }
        kpis.replaceChildren();
        if (department) {
          const benchmark = data.horizon ? trarReferenceAtDate(reference, snapshot.date, horizon) : reference.latest[horizon.key];
          const referenceValue = benchmark?.value;
          const gap = Number.isFinite(department.value) && Number.isFinite(referenceValue)
            ? Number((department.value - referenceValue).toFixed(2)) : null;
          kpis.append(
            miniKpi(horizon.shortLabel, formatTrarPercent(department.value)),
            miniKpi("Gliss. annuel", formatTrarChange(department.change), department.change),
            miniKpi(national ? "Écart vs France" : "Écart vs région", formatTrarChange(gap), gap)
          );
        }
        const referenceLabel = national ? "Moyenne nationale (Tous secteurs)" : `Moyenne ${label} (Tous secteurs)`;
        renderTrarLegend("trarDepartmentChartLegend", `${department?.name || "Département"} (${horizon.shortLabel})`,
          horizon, reference.points.length ? referenceLabel : null);

        function drawPeriod() {
          const full = trarSelection.fullHistory;
          const points = full ? series.points : recent;
          const firstDate = points[0]?.date;
          const lastDate = points.at(-1)?.date;
          const benchmarkPoints = firstDate
            ? reference.points.filter(({ date }) => date >= firstDate && date <= lastDate)
            : [];
          const buttonLabel = full ? "Série complète" : "3 dernières années";
          const action = full ? "Afficher les trois dernières années" : "Afficher la série complète";
          period.textContent = buttonLabel;
          period.setAttribute("aria-label", `${buttonLabel}. ${action}`);
          document.getElementById("trarDepartmentChartContext").textContent =
            `${sector.label} · ${horizon.label}${firstDate ? ` · depuis ${monthLabel(firstDate)}` : ""}`;
          renderTrarChart("trarDepartmentChartSvg", "trarDepartmentChartTooltip", {
            points, horizon, scope: place, benchmarkPoints, benchmarkLabel: label, viewBoxWidth: 640, compactHeight: 360,
          });
        }
        period.onclick = () => {
          trarSelection.fullHistory = !trarSelection.fullHistory;
          drawPeriod();
        };
        drawPeriod();
      }

      function renderTrarDepartmentView(data, territory) {
        const { national, scope, label, scopeSeries } = territory;
        const options = data.sectors.departmental;
        const sector = options.find(({ key }) => key === trarSelection.departmentSector) || options[0];
        const horizon = TRAR_HORIZONS.find(({ key }) => key === (data.horizon || trarSelection.departmentHorizon));
        const geography = DATA.geography;
        const features = national ? geography.departments.features : geographyIndex(geography).departmentsByRegion.get(scope) || [];
        const snapshot = trarSnapshot(data, features, scope, sector.key, horizon);
        const selectionKey = `${scope}:${sector.key}:${horizon.key}`;
        const reference = trarSeries(data, scopeSeries?.[TRAR_DEFAULT_SECTOR]);
        renderTrarSectorPicker({
          id: "trarDepartmentSectorPicker",
          label: "Grand secteur (NACE 5)",
          options,
          groups: () => [{ key: "grand", label: "Grands secteurs",
            options: options.filter(({ key }) => key !== TRAR_DEFAULT_SECTOR) }],
          selectedKey: sector.key,
          onSelect: (key) => {
            trarSelection.departmentSector = key;
            renderTrarDepartmentView(data, territory);
          },
        });
        renderTrarHorizonSwitch("trarHorizonSwitch", data, horizon.key, (key) => {
          trarSelection.departmentHorizon = key;
          renderTrarDepartmentView(data, territory);
        });
        const date = snapshot.date && snapshot.values.length ? monthLabel(snapshot.date) : "Données indisponibles";
        document.getElementById("trarDepartmentContext").textContent = `${label} · ${sector.label} · ${horizon.label} · ${date}`;
        const maxChip = document.getElementById("trarHighestDepartment");
        maxChip.hidden = !snapshot.highest;
        if (snapshot.highest) {
          const { name, code, value } = snapshot.highest;
          document.getElementById("trarHighestDepartmentLabel").textContent = `Plus fort taux : ${name} (${code}) · ${formatTrarPercent(value)}`;
        }

        document.getElementById("trarTreemapShell").hidden = !national;
        document.getElementById("trarMapShell").hidden = national;
        const history = { data, sector, horizon, national, label, snapshot, reference };
        const { selected } = renderDepartmentSnapshot({
          mapSvg: document.getElementById("trarMapSvg"),
          treemapSvg: document.getElementById("trarTreemapSvg"),
          legend: document.getElementById("trarSnapshotLegend"),
          features, national, label, snapshot,
          selected: trarSelection.departments.get(selectionKey),
          formatValue: formatTrarPercent,
          describe: (department) => describeTrarDepartment(department, national, horizon),
          onSelect: (code) => {
            trarSelection.departments.set(selectionKey, code);
            renderTrarDepartmentHistory({ ...history, selected: code });
          },
        });
        renderTrarDepartmentHistory({ ...history, selected });
      }

      function renderTrarModule(data = DATA.modules.trar) {
        const container = document.getElementById("module-trar");
        container.hidden = !data?.dates?.length;
        if (container.hidden) return;
        const national = state.phase === "national";
        const scope = national ? "national" : state.selectedRegion;
        const territory = {
          national, scope, label: scopeLabel(),
          scopeSeries: national ? data.national : data.regions[scope],
        };
        container.querySelectorAll(".employment-sector-picker.is-open")
          .forEach((control) => setEmploymentSectorPickerOpen(control, false));
        renderTrarMainChart(data, territory);
        renderTrarDepartmentView(data, territory);
      }
