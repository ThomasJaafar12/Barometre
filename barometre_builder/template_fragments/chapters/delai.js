      function getDelaiScopeData() {
        if (!DATA.modules.delai) return null;
        return state.phase === "national"
          ? DATA.modules.delai.national
          : (DATA.modules.delai.regions && DATA.modules.delai.regions[state.selectedRegion]);
      }

      function normalizeDelaiPoint(raw) {
        if (!raw) return null;
        if (Array.isArray(raw)) {
          return {
            date: raw[0],
            nb: raw[1],
            mt: raw[2],
            duree: raw[3],
            nb_yoy: raw[4],
            mt_yoy: raw[5],
            nb_qoq: raw[6],
            mt_qoq: raw[7],
          };
        }
        return raw;
      }

      function formatDelaiCurrency(value) {
        if (value == null) return "—";
        const num = Number(value);
        if (num >= 1e6) {
          return `${frNumber(num / 1e6, 2)} M€`;
        }
        if (num >= 1e3) {
          return `${frNumber(num / 1e3, 1)} k€`;
        }
        return `${frNumber(num, 0)} €`;
      }

      function formatDelaiQuarter(dateStr) {
        if (!dateStr) return "—";
        const parts = dateStr.split("-");
        const year = parts[0];
        const month = parseInt(parts[1], 10);
        const quarter = Math.ceil(month / 3);
        return `T${quarter} ${year}`;
      }

      function setDelaiSectorPickerOpen(control, isOpen) {
        const trigger = control.querySelector(".employment-sector-trigger");
        const menu = control.querySelector(".employment-sector-menu");
        control.classList.toggle("is-open", isOpen);
        trigger.setAttribute("aria-expanded", String(isOpen));
        if (isOpen) {
          requestAnimationFrame(() => {
            const activeOption = menu.querySelector(".employment-sector-option.is-active") || menu.querySelector(".employment-sector-option");
            activeOption?.focus();
          });
        }
      }

      function renderDelaiSectorPicker(sectors, currentSectorKey, onSelect) {
        const picker = document.getElementById("delaiSectorPicker");
        if (!picker) return;
        const trigger = picker.querySelector(".employment-sector-trigger");
        const triggerValue = document.getElementById("delaiSectorTriggerValue");
        const menu = document.getElementById("delaiSectorMenu");

        const selectedOption = sectors.find((s) => s.id === currentSectorKey) || sectors[0];
        if (triggerValue) {
          triggerValue.textContent = selectedOption ? selectedOption.label : "Ensemble des secteurs";
        }

        menu.innerHTML = "";
        sectors.forEach((sec) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `employment-sector-option${sec.id === currentSectorKey ? " is-active" : ""}`;
          btn.setAttribute("role", "option");
          btn.setAttribute("aria-selected", String(sec.id === currentSectorKey));
          btn.innerHTML = `<span>${sec.label}</span><span class="employment-sector-option-dot"></span>`;
          btn.addEventListener("click", () => {
            setDelaiSectorPickerOpen(picker, false);
            onSelect(sec.id);
          });
          menu.appendChild(btn);
        });

        trigger.onclick = (event) => {
          event.stopPropagation();
          const isOpen = picker.classList.contains("is-open");
          closeEmploymentSectorPickers();
          setDelaiSectorPickerOpen(picker, !isOpen);
        };
      }

      function renderDelaiModeSwitch(modes, currentMode, onSelect) {
        const container = document.getElementById("delaiModeSwitch");
        if (!container) return;
        container.innerHTML = "";
        modes.forEach((mode) => {
          const btn = document.createElement("button");
          btn.type = "button";
          const isActive = mode.id === currentMode;
          btn.className = `metric-button${isActive ? " is-active" : ""}`;
          btn.setAttribute("aria-pressed", String(isActive));
          btn.textContent = mode.label;
          btn.addEventListener("click", () => {
            if (mode.id !== currentMode) {
              onSelect(mode.id);
            }
          });
          container.appendChild(btn);
        });
      }

      function updateDelaiTrendElement(elementId, value) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const span = el.querySelector("span");
        const svg = el.querySelector("svg");
        el.className = "employment-dashboard-trend";
        if (value == null) {
          if (span) span.textContent = "—";
          if (svg) svg.style.display = "none";
          return;
        }
        if (svg) svg.style.display = "";
        const isPositive = value > 0;
        const isZero = Math.abs(value) < 0.01;
        el.classList.add(isPositive ? "is-positive" : isZero ? "is-neutral" : "is-negative");
        if (span) {
          span.textContent = `${isPositive ? "+" : ""}${frNumber(value, 1)} %`;
        }
      }

      function renderDelaiTopSectorsTable(topSectors, onSectorClick) {
        const container = document.getElementById("delaiTopSectorsTable");
        if (!container) return;
        if (!topSectors || !topSectors.length) {
          container.innerHTML = `<div class="delai-empty-table">Aucune donnée sectorielle disponible.</div>`;
          return;
        }

        let html = `
          <table class="delai-top-table">
            <thead>
              <tr>
                <th class="delai-th-rank">#</th>
                <th class="delai-th-sector">Secteur</th>
                <th class="delai-th-mt">Montant</th>
                <th class="delai-th-yoy">Évol. 1 an</th>
              </tr>
            </thead>
            <tbody>
        `;

        topSectors.forEach((sector, idx) => {
          const yoy = sector.mt_yoy;
          const yoyClass = yoy != null ? (yoy > 0 ? "trend-up" : yoy < 0 ? "trend-down" : "trend-flat") : "trend-none";
          const yoyText = yoy != null ? `${yoy > 0 ? "+" : ""}${frNumber(yoy, 1)} %` : "—";
          const shortLabel = sector.label.length > 32 ? `${sector.label.slice(0, 30)}…` : sector.label;

          html += `
            <tr class="delai-top-row" data-sector-id="${sector.id}" title="${sector.label}">
              <td class="delai-td-rank">${idx + 1}</td>
              <td class="delai-td-sector">
                <span class="delai-sector-name">${shortLabel}</span>
                <span class="delai-sector-nb mono">${frNumber(sector.nb, 0)} accords</span>
              </td>
              <td class="delai-td-mt mono">${formatDelaiCurrency(sector.mt)}</td>
              <td class="delai-td-yoy mono ${yoyClass}">${yoyText}</td>
            </tr>
          `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;

        container.querySelectorAll(".delai-top-row").forEach((row) => {
          row.addEventListener("click", () => {
            const secId = row.getAttribute("data-sector-id");
            if (secId && onSectorClick) {
              onSectorClick(secId);
            }
          });
        });
      }

      function renderDelaiModule() {
        const delaiData = DATA.modules.delai;
        const scope = getDelaiScopeData();
        const mainPanel = document.querySelector(".delai-main");
        if (!delaiData || !scope || !scope.modes) {
          if (mainPanel) {
            renderEmptyState(mainPanel, "Données indisponibles", "Le module des accords de délais n'a pu être chargé.");
          }
          return;
        }

        if (!state.delaiSectorKey) state.delaiSectorKey = "ensemble";
        if (!state.delaiMode) state.delaiMode = "all";

        const currentMode = state.delaiMode;
        const currentSectorKey = state.delaiSectorKey;
        const sectors = delaiData.sectors || [];
        const modes = delaiData.modes || [];

        const chartTitle = document.getElementById("delaiChartTitle");
        if (chartTitle) {
          const regName = state.phase === "national" ? "France entière" : (regionsByCode.get(state.selectedRegion)?.name || "");
          chartTitle.textContent = `Accords de délais de paiement des indépendants : ${regName}`;
        }

        const scopeElem = document.getElementById("delaiScope");
        const periodElem = document.getElementById("delaiPeriod");
        const activeSector = sectors.find((s) => s.id === currentSectorKey);
        const sectorLabel = activeSector ? activeSector.label : "Ensemble des secteurs";
        if (scopeElem) {
          scopeElem.textContent = `${scopeLabel()} • ${sectorLabel}`;
        }
        if (periodElem) {
          periodElem.textContent = formatDelaiQuarter(delaiData.latestDate);
        }

        renderDelaiSectorPicker(sectors, currentSectorKey, (newSector) => {
          state.delaiSectorKey = newSector;
          renderDelaiModule();
        });

        renderDelaiModeSwitch(modes, currentMode, (newMode) => {
          state.delaiMode = newMode;
          renderDelaiModule();
        });

        const modeData = scope.modes[currentMode] || scope.modes["all"] || {};
        const points = (modeData[currentSectorKey] || modeData["ensemble"] || []).map(normalizeDelaiPoint);

        const latestPoint = points.length ? points[points.length - 1] : null;
        const currentNbEl = document.getElementById("delaiCurrentNb");
        const currentMtEl = document.getElementById("delaiCurrentMt");

        if (latestPoint) {
          if (currentNbEl) currentNbEl.textContent = frNumber(latestPoint.nb, 0);
          if (currentMtEl) currentMtEl.textContent = formatDelaiCurrency(latestPoint.mt);
          updateDelaiTrendElement("delaiCurrentNbYoY", latestPoint.nb_yoy);
          updateDelaiTrendElement("delaiCurrentNbQoQ", latestPoint.nb_qoq);
          updateDelaiTrendElement("delaiCurrentMtYoY", latestPoint.mt_yoy);
          updateDelaiTrendElement("delaiCurrentMtQoQ", latestPoint.mt_qoq);
        } else {
          if (currentNbEl) currentNbEl.textContent = "—";
          if (currentMtEl) currentMtEl.textContent = "—";
          updateDelaiTrendElement("delaiCurrentNbYoY", null);
          updateDelaiTrendElement("delaiCurrentNbQoQ", null);
          updateDelaiTrendElement("delaiCurrentMtYoY", null);
          updateDelaiTrendElement("delaiCurrentMtQoQ", null);
        }

        const topSectors = (scope.topSectors && scope.topSectors[currentMode]) || [];
        renderDelaiTopSectorsTable(topSectors, (secId) => {
          state.delaiSectorKey = secId;
          renderDelaiModule();
        });

        const svg = d3.select("#delaiChartSvg");
        svg.selectAll("*").remove();

        if (!points || !points.length) {
          return;
        }

        const viewBoxWidth = 980;
        const viewBoxHeight = 560;
        const margin = { top: 32, right: 74, bottom: 54, left: 74 };
        const width = viewBoxWidth - margin.left - margin.right;
        const height = viewBoxHeight - margin.top - margin.bottom;

        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        const dates = points.map((p) => p.date);
        const x = d3.scalePoint().domain(dates).range([0, width]).padding(0.3);

        const maxNb = d3.max(points, (p) => p.nb) || 10;
        const yLeft = d3.scaleLinear().domain([0, maxNb * 1.12]).nice().range([height, 0]);

        const maxMt = d3.max(points, (p) => p.mt) || 1000;
        const yRight = d3.scaleLinear().domain([0, maxMt * 1.15]).nice().range([height, 0]);

        const axisText = paletteToken("employment-chart-muted", "#64748B");
        const axisLine = paletteToken("employment-chart-grid", "rgba(148,163,184,0.18)");
        const gridStrong = paletteToken("employment-chart-grid-strong", "rgba(148,163,184,0.28)");

        g.append("g")
          .attr("class", "grid-lines")
          .call(
            d3.axisLeft(yLeft)
              .ticks(6)
              .tickSize(-width)
              .tickFormat("")
          )
          .call((axis) => {
            axis.select(".domain").remove();
            axis.selectAll("line").attr("stroke", axisLine).attr("stroke-dasharray", "3 3");
          });

        const defs = svg.append("defs");
        const gradNb = defs.append("linearGradient")
          .attr("id", "gradDelaiNb")
          .attr("x1", "0%").attr("y1", "0%")
          .attr("x2", "0%").attr("y2", "100%");
        gradNb.append("stop").attr("offset", "0%").attr("stop-color", "var(--accent, #004d80)").attr("stop-opacity", 0.18);
        gradNb.append("stop").attr("offset", "100%").attr("stop-color", "var(--accent, #004d80)").attr("stop-opacity", 0.0);

        const gradMt = defs.append("linearGradient")
          .attr("id", "gradDelaiMt")
          .attr("x1", "0%").attr("y1", "0%")
          .attr("x2", "0%").attr("y2", "100%");
        gradMt.append("stop").attr("offset", "0%").attr("stop-color", "var(--accent-secondary, #0e8a72)").attr("stop-opacity", 0.22);
        gradMt.append("stop").attr("offset", "100%").attr("stop-color", "var(--accent-secondary, #0e8a72)").attr("stop-opacity", 0.0);

        const areaNb = d3.area()
          .x((p) => x(p.date))
          .y0(height)
          .y1((p) => yLeft(p.nb))
          .curve(d3.curveMonotoneX);

        const areaMt = d3.area()
          .x((p) => x(p.date))
          .y0(height)
          .y1((p) => yRight(p.mt))
          .curve(d3.curveMonotoneX);

        g.append("path").attr("d", areaNb(points)).attr("fill", "url(#gradDelaiNb)");
        g.append("path").attr("d", areaMt(points)).attr("fill", "url(#gradDelaiMt)");

        const lineNb = d3.line()
          .x((p) => x(p.date))
          .y((p) => yLeft(p.nb))
          .curve(d3.curveMonotoneX);

        const lineMt = d3.line()
          .x((p) => x(p.date))
          .y((p) => yRight(p.mt))
          .curve(d3.curveMonotoneX);

        g.append("path")
          .attr("d", lineNb(points))
          .attr("fill", "none")
          .attr("stroke", "var(--accent, #004d80)")
          .attr("stroke-width", 3.2)
          .attr("stroke-linecap", "round");

        g.append("path")
          .attr("d", lineMt(points))
          .attr("fill", "none")
          .attr("stroke", "var(--accent-secondary, #0e8a72)")
          .attr("stroke-width", 3.2)
          .attr("stroke-linecap", "round");

        const pointsGroup = g.append("g").attr("class", "delai-points");
        points.forEach((p) => {
          pointsGroup.append("circle")
            .attr("cx", x(p.date))
            .attr("cy", yLeft(p.nb))
            .attr("r", 3.5)
            .attr("fill", "var(--accent, #004d80)")
            .attr("stroke", "var(--surface, #ffffff)")
            .attr("stroke-width", 1.8);

          pointsGroup.append("circle")
            .attr("cx", x(p.date))
            .attr("cy", yRight(p.mt))
            .attr("r", 3.5)
            .attr("fill", "var(--accent-secondary, #0e8a72)")
            .attr("stroke", "var(--surface, #ffffff)")
            .attr("stroke-width", 1.8);
        });

        const tickStep = dates.length > 36 ? 4 : dates.length > 20 ? 2 : 1;
        const tickDates = dates.filter((_, idx) => idx % tickStep === 0 || idx === dates.length - 1);

        const xAxis = d3.axisBottom(x)
          .tickValues(tickDates)
          .tickFormat((d) => formatDelaiQuarter(d));

        g.append("g")
          .attr("transform", `translate(0,${height})`)
          .call(xAxis)
          .call((axis) => {
            axis.select(".domain").attr("stroke", gridStrong);
            axis.selectAll("text")
              .attr("fill", axisText)
              .style("font-family", "IBM Plex Mono, monospace")
              .style("font-size", "11px")
              .attr("dy", "1.2em");
            axis.selectAll("line").attr("stroke", gridStrong);
          });

        const yAxisLeft = d3.axisLeft(yLeft)
          .ticks(6)
          .tickFormat((val) => frNumber(val, 0));

        g.append("g")
          .call(yAxisLeft)
          .call((axis) => {
            axis.select(".domain").attr("stroke", gridStrong);
            axis.selectAll("text")
              .attr("fill", "var(--accent, #004d80)")
              .style("font-family", "IBM Plex Mono, monospace")
              .style("font-size", "11px")
              .style("font-weight", "600");
            axis.selectAll("line").attr("stroke", gridStrong);
          })
          .append("text")
          .attr("x", -10)
          .attr("y", -14)
          .attr("fill", "var(--accent, #004d80)")
          .attr("text-anchor", "start")
          .style("font-family", "Manrope, sans-serif")
          .style("font-size", "11px")
          .style("font-weight", "600")
          .text("Nb d'accords");

        const yAxisRight = d3.axisRight(yRight)
          .ticks(6)
          .tickFormat((val) => formatDelaiCurrency(val));

        g.append("g")
          .attr("transform", `translate(${width},0)`)
          .call(yAxisRight)
          .call((axis) => {
            axis.select(".domain").attr("stroke", gridStrong);
            axis.selectAll("text")
              .attr("fill", "var(--accent-secondary, #0e8a72)")
              .style("font-family", "IBM Plex Mono, monospace")
              .style("font-size", "11px")
              .style("font-weight", "600");
            axis.selectAll("line").attr("stroke", gridStrong);
          })
          .append("text")
          .attr("x", 10)
          .attr("y", -14)
          .attr("fill", "var(--accent-secondary, #0e8a72)")
          .attr("text-anchor", "end")
          .style("font-family", "Manrope, sans-serif")
          .style("font-size", "11px")
          .style("font-weight", "600")
          .text("Montant accordé");

        const crosshair = g.append("line")
          .attr("class", "delai-crosshair")
          .attr("y1", 0)
          .attr("y2", height)
          .attr("stroke", "var(--ink, #16212c)")
          .attr("stroke-width", 1.2)
          .attr("stroke-dasharray", "4 4")
          .style("opacity", 0);

        const focusCircleNb = g.append("circle")
          .attr("r", 6)
          .attr("fill", "var(--accent, #004d80)")
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 2.5)
          .style("opacity", 0);

        const focusCircleMt = g.append("circle")
          .attr("r", 6)
          .attr("fill", "var(--accent-secondary, #0e8a72)")
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 2.5)
          .style("opacity", 0);

        const tooltip = document.getElementById("delaiTooltip");
        const chartShell = document.querySelector(".delai-chart-shell");

        g.append("rect")
          .attr("class", "delai-overlay")
          .attr("width", width)
          .attr("height", height)
          .attr("fill", "none")
          .attr("pointer-events", "all")
          .on("mousemove", function (event) {
            const [mouseX] = d3.pointer(event);
            let closest = points[0];
            let minDiff = Infinity;
            points.forEach((p) => {
              const diff = Math.abs(x(p.date) - mouseX);
              if (diff < minDiff) {
                minDiff = diff;
                closest = p;
              }
            });

            if (!closest) return;

            const posX = x(closest.date);
            const posY_Nb = yLeft(closest.nb);
            const posY_Mt = yRight(closest.mt);

            crosshair
              .attr("x1", posX)
              .attr("x2", posX)
              .style("opacity", 0.6);

            focusCircleNb
              .attr("cx", posX)
              .attr("cy", posY_Nb)
              .style("opacity", 1);

            focusCircleMt
              .attr("cx", posX)
              .attr("cy", posY_Mt)
              .style("opacity", 1);

            if (tooltip && chartShell) {
              const overline = tooltip.querySelector(".tooltip-overline");
              const body = tooltip.querySelector(".tooltip-body");
              if (overline) overline.textContent = `${formatDelaiQuarter(closest.date)} • ${sectorLabel}`;
              
              const nbYoyStr = closest.nb_yoy != null ? ` (${closest.nb_yoy > 0 ? "+" : ""}${frNumber(closest.nb_yoy, 1)} % /an)` : "";
              const mtYoyStr = closest.mt_yoy != null ? ` (${closest.mt_yoy > 0 ? "+" : ""}${frNumber(closest.mt_yoy, 1)} % /an)` : "";
              const durStr = closest.duree != null ? `<div class="tooltip-row"><span class="tooltip-label">Durée moyenne :</span><strong>${frNumber(closest.duree, 1)} mois</strong></div>` : "";

              if (body) {
                body.innerHTML = `
                  <div class="tooltip-row">
                    <span class="tooltip-label" style="color: var(--accent, #004d80)">● Nb accords :</span>
                    <strong>${frNumber(closest.nb, 0)}${nbYoyStr}</strong>
                  </div>
                  <div class="tooltip-row">
                    <span class="tooltip-label" style="color: var(--accent-secondary, #0e8a72)">● Montant accordé :</span>
                    <strong>${formatDelaiCurrency(closest.mt)}${mtYoyStr}</strong>
                  </div>
                  ${durStr}
                `;
              }

              tooltip.classList.add("is-visible");
              const shellRect = chartShell.getBoundingClientRect();
              const svgRect = svg.node().getBoundingClientRect();
              const scaleX = svgRect.width / viewBoxWidth;
              const scaleY = svgRect.height / viewBoxHeight;
              const screenX = (margin.left + posX) * scaleX;
              const screenY = (margin.top + Math.min(posY_Nb, posY_Mt)) * scaleY;

              const tooltipWidth = tooltip.offsetWidth || 220;
              const leftOffset = screenX + 16 + tooltipWidth > shellRect.width
                ? screenX - tooltipWidth - 16
                : screenX + 16;
              const topOffset = Math.max(12, Math.min(shellRect.height - 120, screenY - 40));

              tooltip.style.left = `${leftOffset}px`;
              tooltip.style.top = `${topOffset}px`;
            }
          })
          .on("mouseleave", function () {
            crosshair.style("opacity", 0);
            focusCircleNb.style("opacity", 0);
            focusCircleMt.style("opacity", 0);
            if (tooltip) tooltip.classList.remove("is-visible");
          });
      }
