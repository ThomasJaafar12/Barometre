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
      const trarMapGeometries = new WeakMap();
      let trarTreemapLayout = null;

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

      function trarSeries(data, values) {
        if (!values) return { points: [], latest: {} };
        const cached = trarSeriesByValues.get(values);
        if (cached) return cached;
        const latest = {};
        const allPoints = data.dates.map((date, month) => {
          const point = { date };
          const previous = values[trarPreviousYearIndex(data, date)];
          TRAR_HORIZONS.forEach(({ key, index }) => {
            const value = values[month]?.[index];
            point[key] = value ?? null;
            if (!Number.isFinite(value)) return;
            const prior = previous?.[index];
            if (Number.isFinite(prior)) point[`${key}_yoy`] = Number((value - prior).toFixed(2));
            if (date >= data.displayStartDate) latest[key] = { date, value };
          });
          return point;
        });
        const first = allPoints.findIndex((point) => point.date >= data.displayStartDate
          && TRAR_HORIZONS.some(({ key }) => Number.isFinite(point[key])));
        const result = { points: first === -1 ? [] : allPoints.slice(first), latest };
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

      function renderTrarHorizonSwitch(id, activeKey, onSelect) {
        const container = document.getElementById(id);
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
        const makeChip = (label, color, dashed) => {
          const chip = textElement("span", "", "legend-chip");
          const sample = textElement("i", "", "trar-line-sample");
          sample.style.borderColor = color;
          sample.style.borderTopStyle = dashed ? "dashed" : "solid";
          sample.setAttribute("aria-hidden", "true");
          chip.append(sample, document.createTextNode(label));
          return chip;
        };
        const legend = document.getElementById(id);
        legend.replaceChildren(makeChip(title, horizon.color, false));
        if (reference) legend.append(makeChip(reference, "#64748B", true));
      }

      function renderTrarRanking(options, dashboard, selectedKey, horizon, selectSector) {
        const snapshot = dashboard?.rankings[horizon.index];
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

      function trarChartTickDates(dates, xScale, compact) {
        const step = compact ? Math.max(1, Math.ceil(dates.length / 3)) : dates.length > 60 ? 12 : dates.length > 30 ? 6 : 3;
        const tickDates = dates.filter((_, i) => i % step === 0);
        const lastDate = dates[dates.length - 1];
        if (tickDates[tickDates.length - 1] !== lastDate) {
          if (tickDates.length && xScale(lastDate) - xScale(tickDates[tickDates.length - 1]) < 68) {
            tickDates.pop();
          }
          tickDates.push(lastDate);
        }
        return tickDates;
      }

      /* ====================================================================
         DESSIN DES GRAPHIQUES (COURBE UNIQUE, COURBE+BARRES, COMPARAISON)
         ==================================================================== */
      function drawTrarChart({
        svgNode,
        tooltipNode,
        points,
        horizon,
        scope,
        benchmarkPoints = null,
        benchmarkLabel = "",
        viewBoxWidth = 940,
        compactHeight = 460,
      }) {
        const svg = d3.select(svgNode);
        svg.selectAll("g").remove();
        tooltipNode.classList.remove("is-visible");
        tooltipNode.setAttribute("aria-hidden", "true");
        const compact = svgNode.clientWidth > 0 && svgNode.clientWidth < 430;
        const width = compact ? Math.max(260, svgNode.clientWidth) : viewBoxWidth;
        const height = compact ? 300 : compactHeight;
        const margin = compact ? { top: 26, right: 24, bottom: 38, left: 56 }
          : { top: 30, right: 24, bottom: 48, left: 66 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        svg.attr("viewBox", `0 0 ${width} ${height}`);

        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const valid = points.filter((p) => Number.isFinite(p[horizon.key]));
        if (!valid.length) {
          g.append("text").attr("x", innerW / 2).attr("y", innerH / 2).attr("text-anchor", "middle")
            .attr("fill", "#64748B").style("font-size", compact ? "12px" : "16px").text("Données indisponibles");
          return;
        }

        const dates = points.map((p) => p.date);
        const x = d3.scalePoint().domain(dates).range([0, innerW]).padding(0.2);

        const allVals = valid.map((p) => p[horizon.key]);
        if (benchmarkPoints?.length) {
          benchmarkPoints.forEach((p) => {
            if (Number.isFinite(p[horizon.key])) allVals.push(p[horizon.key]);
          });
        }
        const minV = Math.min(0, d3.min(allVals) ?? 0);
        const maxV = d3.max(allVals) ?? 1;
        const pad = (maxV - minV) * 0.1 || 0.1;
        const y = d3.scaleLinear().domain([minV < 0 ? minV - pad : 0, maxV + pad]).nice().range([innerH, 0]);

        // Grid
        g.append("g")
          .call(d3.axisLeft(y).ticks(compact ? 4 : 6).tickSize(-innerW).tickFormat(""))
          .call((ax) => {
            ax.select(".domain").remove();
            ax.selectAll("line").attr("stroke", "rgba(148,163,184,0.22)").attr("stroke-dasharray", "3 3");
          });

        // Benchmark curve (if provided)
        let benchByDate = null;
        if (benchmarkPoints?.length) {
          benchByDate = new Map(benchmarkPoints.map((p) => [p.date, p[horizon.key]]));
          const benchLine = d3.line()
            .defined((p) => Number.isFinite(benchByDate.get(p.date)))
            .x((p) => x(p.date))
            .y((p) => y(benchByDate.get(p.date)))
            .curve(d3.curveMonotoneX);
          g.append("path")
            .attr("class", "trar-reference-series")
            .attr("d", benchLine(points))
            .attr("fill", "none")
            .attr("stroke", "#64748B")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "5 5")
            .attr("opacity", 0.78);
        }

        // Main line
        const line = d3.line()
          .defined((p) => Number.isFinite(p[horizon.key]))
          .x((p) => x(p.date))
          .y((p) => y(p[horizon.key]))
          .curve(d3.curveMonotoneX);
        g.append("path")
          .attr("class", "quarterly-series").attr("data-metric", horizon.key)
          .attr("d", line(points))
          .attr("fill", "none")
          .attr("stroke", horizon.color)
          .attr("stroke-width", 3.2)
          .attr("stroke-linecap", "round");

        // Points
        g.append("g").selectAll("circle").data(valid).join("circle")
          .attr("cx", (p) => x(p.date))
          .attr("cy", (p) => y(p[horizon.key]))
          .attr("r", (_, i) => (i === valid.length - 1 ? 5.2 : compact ? 1.8 : 2.6))
          .attr("fill", (_, i) => (i === valid.length - 1 ? "#FFFFFF" : horizon.color))
          .attr("stroke", horizon.color)
          .attr("stroke-width", (_, i) => (i === valid.length - 1 ? 2.8 : 1));

        // Axes
        const yAxis = g.append("g").call(d3.axisLeft(y).ticks(compact ? 4 : 6).tickFormat(formatTrarPercent));
        yAxis.select(".domain").attr("stroke", "#CBD5E1");
        yAxis.selectAll("line").attr("stroke", "#CBD5E1");
        yAxis.selectAll("text").attr("fill", horizon.color).style("font-size", "11px").style("font-weight", "600");
        yAxis.append("text").attr("x", -8).attr("y", -12).attr("fill", horizon.color)
          .attr("text-anchor", "start").style("font-size", "11px").style("font-weight", "700")
          .text(`${horizon.label} (%)`);

        const tickDates = trarChartTickDates(dates, x, compact);
        const xAxis = g.append("g").attr("transform", `translate(0,${innerH})`)
          .call(d3.axisBottom(x).tickValues(tickDates).tickFormat(monthLabel));
        xAxis.selectAll("path,line").attr("stroke", "#CBD5E1");
        xAxis.selectAll("text").attr("fill", "#64748B").style("font-size", "11.5px").attr("dy", "1.2em");

        // Tooltip & Crosshair
        const crosshair = g.append("line").attr("y1", 0).attr("y2", innerH)
          .attr("stroke", "#64748B").attr("stroke-width", 1.2).attr("stroke-dasharray", "4 4").style("opacity", 0);
        const marker = g.append("circle").attr("r", 6).attr("fill", horizon.color)
          .attr("stroke", "#FFFFFF").attr("stroke-width", 2.5).style("opacity", 0);
        const shell = tooltipNode.parentElement;

        const hide = () => {
          crosshair.style("opacity", 0);
          marker.style("opacity", 0);
          tooltipNode.classList.remove("is-visible");
          tooltipNode.setAttribute("aria-hidden", "true");
        };

        const show = (event) => {
          const [mx] = d3.pointer(event, g.node());
          const idx = Math.max(0, Math.min(points.length - 1, Math.round((mx - x(dates[0])) / (x.step() || 1))));
          const pt = points[idx];
          const px = x(pt.date);
          const val = pt[horizon.key];
          crosshair.attr("x1", px).attr("x2", px).style("opacity", 0.65);
          if (Number.isFinite(val)) {
            marker.attr("cx", px).attr("cy", y(val)).style("opacity", 1);
          } else {
            marker.style("opacity", 0);
          }
          tooltipNode.querySelector(".tooltip-overline").textContent = `${monthLabel(pt.date)} · ${scope}`;
          const body = tooltipNode.querySelector(".tooltip-body");
          body.replaceChildren();
          const row1 = textElement("div", "", "tooltip-row");
          const lbl = textElement("span", `${horizon.shortLabel} :`);
          lbl.style.color = horizon.color;
          lbl.style.fontWeight = "600";
          row1.append(lbl, textElement("strong", formatTrarPercent(val)));
          body.append(row1);

          const yoy = pt[`${horizon.key}_yoy`];
          if (Number.isFinite(yoy)) {
            const row2 = textElement("div", "", "tooltip-row");
            row2.append(textElement("span", "Écart annuel :"), textElement("strong", formatTrarChange(yoy)));
            body.append(row2);
          }

          if (benchByDate && Number.isFinite(benchByDate.get(pt.date))) {
            const rowB = textElement("div", "", "tooltip-row");
            rowB.append(textElement("span", `${benchmarkLabel} :`), textElement("strong", formatTrarPercent(benchByDate.get(pt.date))));
            body.append(rowB);
          }

          tooltipNode.classList.add("is-visible");
          tooltipNode.setAttribute("aria-hidden", "false");

          const shellBounds = shell.getBoundingClientRect();
          const svgBounds = svgNode.getBoundingClientRect();
          const sx = svgBounds.left - shellBounds.left + (margin.left + px) * svgBounds.width / width;
          const sy = svgBounds.top - shellBounds.top + (margin.top + (Number.isFinite(val) ? y(val) : innerH / 2)) * svgBounds.height / height;
          const tw = tooltipNode.offsetWidth;
          const th = tooltipNode.offsetHeight;
          const left = sx + 16 + tw <= shellBounds.width ? sx + 16 : sx - tw - 16;
          tooltipNode.style.left = `${Math.max(8, Math.min(shellBounds.width - tw - 8, left))}px`;
          tooltipNode.style.top = `${Math.max(8, Math.min(shellBounds.height - th - 8, sy - th - 12))}px`;
        };

        g.append("rect").attr("class", "quarterly-overlay").attr("width", innerW).attr("height", innerH).attr("fill", "none").attr("pointer-events", "all")
          .on("pointermove", show).on("pointerleave", hide);
      }

      function trarSnapshot(data, features, scope, sectorKey, horizon) {
        const cacheKey = `${scope}:${sectorKey}:${horizon.key}`;
        if (trarSnapshots.has(cacheKey)) return trarSnapshots.get(cacheKey);
        const dateIndex = data.departmentSnapshots[sectorKey]?.[horizon.index];
        const date = dateIndex == null ? null : data.dates[dateIndex];
        const previousIndex = date ? trarPreviousYearIndex(data, date) : undefined;
        const departments = new Map(features.map(({ properties }) => {
          const { code, nom: name, region } = properties;
          const series = data.departments[code]?.[sectorKey];
          const value = series?.[dateIndex]?.[horizon.index];
          const previous = series?.[previousIndex]?.[horizon.index];
          const change = Number.isFinite(value) && Number.isFinite(previous)
            ? Number((value - previous).toFixed(2)) : null;
          return [code, { code, name, region, value, change, hasHistory: Boolean(series) }];
        }));
        const rates = Array.from(departments.values(), ({ value }) => value).filter(Number.isFinite).sort(d3.ascending);
        const distinct = [...new Set(rates)];
        const { positive: [lightGreen, green], neutral, negative: [lightRed, red] } = treemapPalette();
        const palette = [green, lightGreen, neutral, lightRed, red];
        const classCount = Math.min(distinct.length, palette.length);
        const cuts = d3.range(1, classCount).map((index) => {
          if (distinct.length > 12) return d3.quantileSorted(rates, index / classCount);
          // Au niveau régional, choisir un seuil entre deux valeurs observées.
          const position = Math.round(index * distinct.length / classCount) - 1;
          return Number(((distinct[position] + distinct[position + 1]) / 2).toFixed(3));
        });
        const thresholds = [...new Set(cuts)].filter((cut) => cut > rates[0]);
        if (!thresholds.length && classCount > 1) thresholds.push(distinct[1]);
        const colors = thresholds.length
          ? d3.range(thresholds.length + 1).map((index) => palette[Math.round(index * (palette.length - 1) / thresholds.length)])
          : [neutral];
        const colorScale = d3.scaleThreshold(thresholds, colors);
        departments.forEach((department) => {
          department.fill = Number.isFinite(department.value) ? colorScale(department.value) : "#E2E8F0";
        });
        const candidates = Array.from(departments.values()).filter(({ value }) => Number.isFinite(value));
        const highest = d3.least(candidates, (a, b) => b.value - a.value || a.name.localeCompare(b.name, "fr"));
        const result = { date, departments, thresholds, colors, rates, highest };
        trarSnapshots.set(cacheKey, result);
        return result;
      }

      function renderTrarSnapshotLegend({ thresholds, colors, rates, departments }) {
        function makeKey(color, label) {
          const key = textElement("span", "", "trar-color-key");
          const swatch = textElement("i", "");
          swatch.style.backgroundColor = color;
          swatch.setAttribute("aria-hidden", "true");
          key.append(swatch, document.createTextNode(label));
          return key;
        }
        const legend = document.getElementById("trarSnapshotLegend");
        const items = rates.length ? colors.map((color, index) => {
          const lower = thresholds[index - 1];
          const upper = thresholds[index];
          let interval = formatTrarPercent(rates[0]);
          if (upper !== undefined) interval = `${lower === undefined ? "" : `${formatTrarPercent(lower)} à `}< ${formatTrarPercent(upper)}`;
          else if (lower !== undefined) interval = `≥ ${formatTrarPercent(lower)}`;
          return makeKey(color, interval);
        }) : [];
        if (rates.length < departments.size) items.push(makeKey("#E2E8F0", "Donnée indisponible"));
        legend.replaceChildren(...items);
      }

      function bindTrarDepartmentMarks(marks, datum, context) {
        const description = (item) => {
          const { name, code, region, value, change } = datum(item);
          const regionName = context.national ? regionsByCode.get(region)?.name : null;
          const place = `${name} (${code})${regionName ? ` · ${regionName}` : ""}`;
          const rate = Number.isFinite(value) ? formatTrarPercent(value) : "Taux indisponible";
          const details = [`${context.horizon.shortLabel} : ${rate}`];
          if (Number.isFinite(change)) details.push(`Écart annuel : ${formatTrarChange(change)}`);
          return { place, details: details.join(" · ") };
        };
        marks.attr("data-code", (item) => datum(item).code)
          .attr("aria-disabled", (item) => datum(item).hasHistory ? null : "true");
        bindVizTooltip(marks, {
          label: (item) => {
            const { place, details } = description(item);
            return `${place} · ${details}`;
          },
          show: (position, item) => {
            const { place, details } = description(item);
            showTooltip(position, place, details, true);
          },
          hide: hideTooltip,
          arrowNavigation: true,
          activate: (item) => {
            const department = datum(item);
            if (!department.hasHistory || context.selected === department.code) return;
            context.selected = department.code;
            trarSelection.departments.set(context.selectionKey, department.code);
            updateTrarDepartmentSelection(context);
            renderTrarDepartmentHistory(context);
          },
        });
      }

      function trarRegionalGeometry(features) {
        let geometry = trarMapGeometries.get(features);
        if (geometry) return geometry;
        const collection = { type: "FeatureCollection", features };
        const path = d3.geoPath(d3.geoMercator().fitSize([700, 520], collection));
        const [[x0, y0], [x1, y1]] = path.bounds(collection);
        const pad = 26;
        const viewBox = Number.isFinite(x0)
          ? [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].join(" ")
          : "0 0 700 520";
        const paths = new Map(features.map((feature) => [feature.properties.code, path(feature)]));
        const centroids = new Map(features.map((feature) => [feature.properties.code, path.centroid(feature)]));
        geometry = { viewBox, paths, centroids };
        trarMapGeometries.set(features, geometry);
        return geometry;
      }

      function renderTrarMap(context) {
        const { features, snapshot: { departments } } = context;
        const { viewBox, paths } = trarRegionalGeometry(features);
        const svg = d3.select("#trarMapSvg").attr("viewBox", viewBox)
          .attr("aria-label", `Carte départementale · ${context.label}`);
        const marks = svg.selectAll("g.trar-map-paths").data([null]).join("g").attr("class", "trar-map-paths")
          .selectAll("path").data(features, ({ properties }) => properties.code)
          .join("path").attr("class", "trar-map-department")
          .attr("d", ({ properties }) => paths.get(properties.code))
          .attr("fill", ({ properties }) => departments.get(properties.code).fill);
        bindTrarDepartmentMarks(marks, ({ properties }) => departments.get(properties.code), context);
      }

      function renderTrarTreemap(context) {
        const { features, snapshot: { departments } } = context;
        const width = 660;
        const height = 470;
        if (trarTreemapLayout?.features !== features) {
          const children = d3.groups(features, ({ properties }) => properties.region)
            .map(([code, group]) => ({ code, children: group.map(({ properties }) => ({ code: properties.code })) }));
          const root = d3.hierarchy({ children }).sum((node) => node.children ? 0 : 1)
            .sort((a, b) => b.value - a.value || a.data.code.localeCompare(b.data.code, "fr"));
          d3.treemap().tile(d3.treemapSquarify.ratio(1)).size([width, height])
            .paddingInner((node) => node.depth === 0 ? 4 : 2)
            .paddingLeft(3).paddingRight(3).paddingBottom(3)
            .paddingTop((node) => node.depth === 1 && node.y1 - node.y0 >= 38 ? 18 : 3).round(true)(root);
          trarTreemapLayout = { features, groups: root.children || [] };
        }
        const svg = d3.select("#trarTreemapSvg").attr("viewBox", `0 0 ${width} ${height}`);
        const groups = svg.selectAll("g.trar-region-group").data(trarTreemapLayout.groups, (node) => node.data.code)
          .join((enter) => {
            const group = enter.append("g").attr("class", "trar-region-group");
            group.append("rect").attr("rx", 4).attr("aria-hidden", "true");
            group.append("text").attr("class", "trar-region-text").attr("aria-hidden", "true");
            return group;
          });
        groups.attr("transform", (node) => `translate(${node.x0},${node.y0})`);
        groups.select("rect").attr("width", (node) => node.x1 - node.x0).attr("height", (node) => node.y1 - node.y0);
        groups.select(".trar-region-text").attr("x", 5).attr("y", 12).text((node) => {
          if (node.y1 - node.y0 < 38) return "";
          const name = regionsByCode.get(node.data.code)?.name || node.data.code;
          const maxChars = Math.floor((node.x1 - node.x0 - 10) / 5.8);
          return name.length <= maxChars ? name : maxChars >= 4 ? `${name.slice(0, maxChars - 1)}…` : "";
        });
        const getDepartment = (node) => departments.get(node.data.code);
        const tiles = groups.selectAll("g.trar-department-tile").data((node) => node.children, (node) => node.data.code)
          .join((enter) => {
            const tile = enter.append("g").attr("class", "trar-department-tile");
            tile.append("rect").attr("rx", 3).attr("aria-hidden", "true");
            tile.append("text").attr("class", "trar-tile-code").attr("aria-hidden", "true");
            tile.append("text").attr("class", "trar-tile-rate").attr("aria-hidden", "true");
            return tile;
          });
        tiles.attr("transform", (node) => `translate(${node.x0 - node.parent.x0},${node.y0 - node.parent.y0})`);
        const tileWidth = (node) => node.x1 - node.x0;
        const tileHeight = (node) => node.y1 - node.y0;
        const showRate = (node) => tileWidth(node) >= 44 && tileHeight(node) >= 30;
        tiles.select("rect").attr("width", tileWidth).attr("height", tileHeight).attr("fill", (node) => getDepartment(node).fill);
        tiles.select(".trar-tile-code").attr("x", (node) => tileWidth(node) / 2)
          .attr("y", (node) => tileHeight(node) / 2 - (showRate(node) ? 5 : 0))
          .text((node) => tileWidth(node) >= 18 && tileHeight(node) >= 14 ? node.data.code : "");
        tiles.select(".trar-tile-rate").attr("x", (node) => tileWidth(node) / 2)
          .attr("y", (node) => tileHeight(node) / 2 + 8)
          .text((node) => showRate(node) ? formatTrarPercent(getDepartment(node).value) : "");
        bindTrarDepartmentMarks(tiles, getDepartment, context);
      }

      function updateTrarDepartmentSelection({ selected, features, snapshot, national }) {
        const svg = d3.select(national ? "#trarTreemapSvg" : "#trarMapSvg");
        svg.selectAll("[data-code]").classed("is-selected", function() { return this.dataset.code === selected; })
          .attr("aria-pressed", function() { return String(this.dataset.code === selected); });
        if (national) return;
        const { centroids } = trarRegionalGeometry(features);
        const labels = Array.from(snapshot.departments.values()).flatMap(({ code, value }) => {
          const [x, y] = centroids.get(code);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
          if (code !== selected || !Number.isFinite(value)) return [{ code, x, y, text: code, className: "trar-map-label" }];
          return [
            { code, x, y: y - 7, text: code, className: "trar-map-label" },
            { code, x, y: y + 9, text: formatTrarPercent(value), className: "trar-map-sublabel" },
          ];
        });
        svg.selectAll("g.trar-map-labels").data([null]).join("g").attr("class", "trar-map-labels")
          .attr("aria-hidden", "true").selectAll("text").data(labels, ({ code, className }) => `${code}:${className}`)
          .join("text").attr("class", ({ className }) => className)
          .attr("x", ({ x }) => x).attr("y", ({ y }) => y).text(({ text }) => text);
      }

      const trarChartViews = new Map();

      function renderTrarChart(svgId, tooltipId, config) {
        const svgNode = document.getElementById(svgId);
        const firstRender = !trarChartViews.has(svgNode);
        const view = { ...config, svgNode, tooltipNode: document.getElementById(tooltipId) };
        trarChartViews.set(svgNode, view);
        drawTrarChart(view);
        if (firstRender) trarChartObserver.observe(svgNode);
      }

      const trarChartObserver = new ResizeObserver((entries) => {
        if (state.phase === "landing") return;
        entries.forEach(({ target }) => {
          const view = trarChartViews.get(target);
          const width = target.clientWidth;
          const desiredWidth = width < 430 ? Math.max(260, width) : view.viewBoxWidth;
          if (width && target.viewBox.baseVal.width !== desiredWidth) drawTrarChart(view);
        });
      });

      function renderTrarMainChart(data, { national, scope, label, scopeSeries }) {
        const options = national ? data.sectors.national : data.sectors.regional;
        const sectorState = national ? "nationalSector" : "regionalSector";
        const sector = options.find(({ key }) => key === trarSelection[sectorState]) || options[0];
        const dashboard = national ? data.dashboards.national : data.dashboards.regions[scope];
        const horizon = TRAR_HORIZONS.find(({ key }) => key === trarSelection.mainHorizon);
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
        renderTrarHorizonSwitch("trarMainHorizonSwitch", horizon.key, (key) => {
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
        renderTrarLatest(horizon, latest[horizon.key], dashboard?.changes[sector.key]?.[horizon.index],
          reference?.latest[horizon.key], referenceLabel);
        renderTrarRanking(options, dashboard, sector.key, horizon, selectSector);
        renderTrarLegend("trarChartLegend", `${horizon.label} (${sector.label})`, horizon,
          reference?.points.length ? `Référence · ${referenceLabel}` : null);
        renderTrarChart("trarChartSvg", "trarChartTooltip", {
          points, horizon, scope: `${label} · ${sector.label}`,
          benchmarkPoints: reference?.points,
          benchmarkLabel: referenceLabel,
          viewBoxWidth: 940,
        });
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
          const referenceValue = reference.latest[horizon.key]?.value;
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
        const horizon = TRAR_HORIZONS.find(({ key }) => key === trarSelection.departmentHorizon);
        const geography = DATA.geography;
        const features = national ? geography.departments.features : geographyIndex(geography).departmentsByRegion.get(scope) || [];
        const snapshot = trarSnapshot(data, features, scope, sector.key, horizon);
        const selectionKey = `${scope}:${sector.key}:${horizon.key}`;
        const saved = trarSelection.departments.get(selectionKey);
        const selected = snapshot.departments.get(saved)?.hasHistory
          ? saved : snapshot.highest?.code || Array.from(snapshot.departments.values()).find(({ hasHistory }) => hasHistory)?.code;
        const reference = trarSeries(data, scopeSeries?.[TRAR_DEFAULT_SECTOR]);
        const context = { data, features, snapshot, selectionKey, selected, sector, horizon, national, label, reference };
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
        renderTrarHorizonSwitch("trarHorizonSwitch", horizon.key, (key) => {
          trarSelection.departmentHorizon = key;
          renderTrarDepartmentView(data, territory);
        });
        const date = snapshot.date && snapshot.rates.length ? monthLabel(snapshot.date) : "Données indisponibles";
        document.getElementById("trarDepartmentContext").textContent = `${label} · ${sector.label} · ${horizon.label} · ${date}`;
        const maxChip = document.getElementById("trarHighestDepartment");
        maxChip.hidden = !snapshot.highest;
        if (snapshot.highest) {
          const { name, code, value } = snapshot.highest;
          document.getElementById("trarHighestDepartmentLabel").textContent = `Plus fort taux : ${name} (${code}) · ${formatTrarPercent(value)}`;
        }

        document.getElementById("trarTreemapShell").hidden = !national;
        document.getElementById("trarMapShell").hidden = national;
        dismissVizTooltip(document.getElementById(national ? "trarMapSvg" : "trarTreemapSvg"));
        if (national) renderTrarTreemap(context);
        else renderTrarMap(context);
        updateTrarDepartmentSelection(context);
        renderTrarSnapshotLegend(snapshot);
        renderTrarDepartmentHistory(context);
      }

      function renderTrarModule() {
        const data = DATA.modules.trar;
        const container = document.getElementById("module-trar");
        container.hidden = !data;
        if (!data) return;
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
