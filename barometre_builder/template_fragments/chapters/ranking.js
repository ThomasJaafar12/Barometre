      function renderSectorRanking(config) {
        const container = document.getElementById(config.containerId);
        container.replaceChildren();
        if (!config.rows.length) {
          const empty = document.createElement("div");
          empty.className = "delai-empty-table";
          empty.textContent = config.emptyMessage;
          container.appendChild(empty);
          return;
        }

        const table = document.createElement("table");
        table.className = `delai-top-table sector-ranking-table ${config.tableClass || ""}`;
        table.innerHTML = `<thead><tr><th scope="col" class="delai-th-rank">#</th><th scope="col" class="delai-th-sector">Secteur</th><th scope="col" class="delai-th-mt"></th><th scope="col" class="delai-th-yoy">Évol. 1 an</th></tr></thead><tbody></tbody>`;
        table.querySelector(".delai-th-sector").textContent = config.labelHeader || "Secteur";
        if (config.showRank === false) table.querySelector(".delai-th-rank").remove();
        table.querySelector(".delai-th-mt").textContent = config.valueLabel;
        const body = table.querySelector("tbody");
        config.rows.forEach((sector, index) => {
          const row = document.createElement("tr");
          row.className = `delai-top-row${config.selectedKey != null && sector.key === config.selectedKey ? " is-active" : ""}`;
          const rank = document.createElement("td");
          rank.className = "delai-td-rank";
          rank.textContent = index + 1;
          const labelCell = document.createElement("td");
          const button = document.createElement("button");
          button.type = "button";
          button.className = "sector-ranking-link";
          button.title = sector.label;
          button.textContent = config.formatLabel ? config.formatLabel(sector) : employmentSectorDisplayLabel(sector);
          button.setAttribute("aria-label", config.selectionLabel ? config.selectionLabel(sector) : `Afficher le secteur ${sector.label}`);
          if (config.selectedKey != null) button.setAttribute("aria-pressed", String(sector.key === config.selectedKey));
          button.addEventListener("click", () => config.onSelect(sector.key));
          labelCell.appendChild(button);
          const value = document.createElement("td");
          value.className = "delai-td-mt mono";
          value.textContent = config.formatValue(sector.value);
          const change = document.createElement("td");
          change.className = `delai-td-yoy mono ${sector.yoy > 0 ? "trend-up" : sector.yoy < 0 ? "trend-down" : "trend-flat"}`;
          change.textContent = employmentSignedPercent(sector.yoy);
          if (config.showRank !== false) row.appendChild(rank);
          row.append(labelCell, value, change);
          body.appendChild(row);
        });
        container.appendChild(table);
      }
