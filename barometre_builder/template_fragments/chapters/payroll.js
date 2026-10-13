      function renderPayrollModule() {
        document.getElementById("payrollSubtitle").textContent = `Suivez les procédures collectives, les déclarations préalables à l’embauche et les accords de délais de paiement en ${scopeLabel()}.`;
        renderPcolModule();
        renderDpaeModule();
        renderDelaiModule();
      }
