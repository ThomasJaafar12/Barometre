      const sectorRankingViews = new WeakMap();

      function rankingText(node, value) {
        const text = value == null ? "" : String(value);
        if (node.textContent !== text) node.textContent = text;
      }

      function renderSectorRanking(config) {
        const container = document.getElementById(config.containerId);
        if (!config.rows.length) {
          container.replaceChildren(textElement("div", config.emptyMessage, "delai-empty-table"));
          sectorRankingViews.delete(container);
          return;
        }

        const showRank = config.showRank !== false;
        const interactive = Boolean(config.onSelect);
        let view = sectorRankingViews.get(container);
        if (!view || view.showRank !== showRank || view.interactive !== interactive || view.table.parentNode !== container) {
          const table = document.createElement("table");
          const head = document.createElement("thead");
          const headings = document.createElement("tr");
          [["#", "delai-th-rank"], ["Secteur", "delai-th-sector"], ["", "delai-th-mt"], ["", "delai-th-yoy"]].forEach(([label, className]) => {
            if (!showRank && className === "delai-th-rank") return;
            const cell = textElement("th", label, className);
            cell.scope = "col";
            headings.append(cell);
          });
          head.append(headings);
          const body = document.createElement("tbody");
          table.append(head, body);
          view = { table, body, showRank, interactive, rows: new Map(), config };
          sectorRankingViews.set(container, view);
          container.replaceChildren(table);
        }
        view.config = config;
        view.table.className = `delai-top-table sector-ranking-table ${config.tableClass || ""}`;
        rankingText(view.table.querySelector(".delai-th-sector"), config.labelHeader || "Secteur");
        rankingText(view.table.querySelector(".delai-th-mt"), config.valueLabel);
        rankingText(view.table.querySelector(".delai-th-yoy"), config.changeLabel || "Évol. 1 an");
        const currentKeys = new Set();
        config.rows.forEach((sector, index) => {
          const key = sector.key;
          currentKeys.add(key);
          let entry = view.rows.get(key);
          if (!entry) {
            const row = document.createElement("tr");
            const rank = textElement("td", "", "delai-td-rank");
            const labelCell = document.createElement("td");
            const label = textElement(interactive ? "button" : "span", "", interactive ? "sector-ranking-link" : "delai-sector-name");
            if (interactive) {
              label.type = "button";
              label.addEventListener("click", () => view.config.onSelect(key));
            }
            labelCell.append(label);
            const value = textElement("td", "", "delai-td-mt mono");
            const change = document.createElement("td");
            if (showRank) row.append(rank);
            row.append(labelCell, value, change);
            entry = { row, rank, label, value, change };
            view.rows.set(key, entry);
          }
          const { row, rank, label, value, change } = entry;
          const isSelected = config.selectedKey != null && key === config.selectedKey;
          row.className = `delai-top-row${isSelected ? " is-active" : ""}`;
          rankingText(rank, index + 1);
          rankingText(label, config.formatLabel ? config.formatLabel(sector) : employmentSectorDisplayLabel(sector));
          if (interactive) {
            label.title = sector.label;
            label.setAttribute("aria-label", config.selectionLabel ? config.selectionLabel(sector) : `Afficher le secteur ${sector.label}`);
            if (config.selectedKey != null) label.setAttribute("aria-pressed", String(isSelected));
            else label.removeAttribute("aria-pressed");
          } else if (isSelected) {
            label.setAttribute("aria-current", "true");
          } else {
            label.removeAttribute("aria-current");
          }
          rankingText(value, config.formatValue(sector.value));
          if (config.formatSecondary) {
            change.className = "delai-td-yoy mono trend-flat";
            rankingText(change, config.formatSecondary(sector));
          } else {
            change.className = `delai-td-yoy mono ${sector.yoy > 0 ? "trend-up" : sector.yoy < 0 ? "trend-down" : "trend-flat"}`;
            rankingText(change, (config.formatChange || employmentSignedPercent)(sector.yoy));
          }
          if (view.body.children[index] !== row) view.body.insertBefore(row, view.body.children[index] || null);
        });
        view.rows.forEach((entry, key) => {
          if (currentKeys.has(key)) return;
          entry.row.remove();
          view.rows.delete(key);
        });
      }
