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
        let view = sectorRankingViews.get(container);
        if (!view || view.showRank !== showRank || view.table.parentNode !== container) {
          const table = document.createElement("table");
          const head = document.createElement("thead");
          const headings = document.createElement("tr");
          [["#", "delai-th-rank"], ["Secteur", "delai-th-sector"], ["", "delai-th-mt"], ["Évol. 1 an", "delai-th-yoy"]].forEach(([label, className]) => {
            if (!showRank && className === "delai-th-rank") return;
            const cell = textElement("th", label, className);
            cell.scope = "col";
            headings.append(cell);
          });
          head.append(headings);
          const body = document.createElement("tbody");
          table.append(head, body);
          view = { table, body, showRank, rows: new Map(), config };
          sectorRankingViews.set(container, view);
          container.replaceChildren(table);
        }
        view.config = config;
        view.table.className = `delai-top-table sector-ranking-table ${config.tableClass || ""}`;
        rankingText(view.table.querySelector(".delai-th-sector"), config.labelHeader || "Secteur");
        rankingText(view.table.querySelector(".delai-th-mt"), config.valueLabel);
        const currentKeys = new Set();
        config.rows.forEach((sector, index) => {
          const key = sector.key;
          currentKeys.add(key);
          let entry = view.rows.get(key);
          if (!entry) {
            const row = document.createElement("tr");
            const rank = textElement("td", "", "delai-td-rank");
            const labelCell = document.createElement("td");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "sector-ranking-link";
            button.addEventListener("click", () => view.config.onSelect(key));
            labelCell.append(button);
            const value = textElement("td", "", "delai-td-mt mono");
            const change = document.createElement("td");
            if (showRank) row.append(rank);
            row.append(labelCell, value, change);
            entry = { row, rank, button, value, change };
            view.rows.set(key, entry);
          }
          const { row, rank, button, value, change } = entry;
          row.className = `delai-top-row${config.selectedKey != null && sector.key === config.selectedKey ? " is-active" : ""}`;
          rankingText(rank, index + 1);
          button.title = sector.label;
          rankingText(button, config.formatLabel ? config.formatLabel(sector) : employmentSectorDisplayLabel(sector));
          button.setAttribute("aria-label", config.selectionLabel ? config.selectionLabel(sector) : `Afficher le secteur ${sector.label}`);
          if (config.selectedKey != null) button.setAttribute("aria-pressed", String(sector.key === config.selectedKey));
          else button.removeAttribute("aria-pressed");
          rankingText(value, config.formatValue(sector.value));
          change.className = `delai-td-yoy mono ${sector.yoy > 0 ? "trend-up" : sector.yoy < 0 ? "trend-down" : "trend-flat"}`;
          rankingText(change, employmentSignedPercent(sector.yoy));
          if (view.body.children[index] !== row) view.body.insertBefore(row, view.body.children[index] || null);
        });
        view.rows.forEach((entry, key) => {
          if (currentKeys.has(key)) return;
          entry.row.remove();
          view.rows.delete(key);
        });
      }
