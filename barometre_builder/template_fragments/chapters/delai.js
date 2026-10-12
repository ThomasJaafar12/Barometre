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

        renderQuarterlyModeSwitch("delaiModeSwitch", modes, currentMode, (newMode) => {
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

        drawQuarterlyComparisonChart({
          svgId: "delaiChartSvg", tooltipId: "delaiTooltip", points,
          description: "Évolution trimestrielle des accords de délais de paiement des travailleurs indépendants",
          scope: sectorLabel,
          series: [
            { key: "nb", label: "Nombre d'accords", axisLabel: "Nb d'accords", compactAxisLabel: "Accords", color: "var(--accent)", format: (value) => frNumber(value, 0), yoyKey: "nb_yoy" },
            { key: "mt", label: "Montant accordé", axisLabel: "Montant accordé", compactAxisLabel: "Montant", color: "var(--accent-secondary)", format: formatDelaiCurrency, yoyKey: "mt_yoy" },
          ],
        });
      }
