      // Les textes issus des sources ne passent jamais par un interpréteur HTML.
      function textElement(tag, text, className = "") {
        const element = document.createElement(tag);
        element.textContent = text == null ? "" : String(text);
        if (className) element.className = className;
        return element;
      }

      function textLines(target, lines) {
        target.replaceChildren();
        lines.forEach((line, index) => {
          if (index) target.append(document.createElement("br"));
          target.append(document.createTextNode(String(line)));
        });
      }

      function rangeLegend(target, first, last) {
        target.replaceChildren(textElement("span", first), textElement("span", "→"), textElement("span", last));
      }

      function rankingArticle(title, value, scope, annualChange = null) {
        const article = document.createElement("article");
        article.className = "ranking-item";
        const topline = document.createElement("div");
        topline.className = "topline";
        topline.append(textElement("strong", title), textElement("strong", value));
        article.append(topline, textElement("span", scope));
        if (annualChange !== null) article.append(textElement("small", annualChange));
        return article;
      }