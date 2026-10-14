from pathlib import Path
import unittest
from unittest import mock

from barometre_builder.security import validate_application_script
from barometre_builder.publication import assemble_publication
from barometre_builder.renderers import RENDERERS
from tests.test_pages import example_context


class ApplicationDomGuardTests(unittest.TestCase):
    def test_html_interpreters_and_code_evaluation_are_rejected(self):
        attacks = (
            'node.innerHTML = label', 'node.outerHTML = label',
            'node["innerHTML"] = label', "node['outerHTML'] = label",
            'node.insertAdjacentHTML("beforeend", label)',
            'new DOMParser()', 'range.createContextualFragment(label)',
            'parser.parseFromString(label, "text/html")',
            'node.setHTMLUnsafe(label)', 'node.setHTML(label)',
            'document.write(label)', 'document.writeln(label)',
            'selection.html(label)', 'eval(label)', 'new Function(label)',
        )
        for attack in attacks:
            with self.subTest(attack=attack), self.assertRaises(ValueError):
                validate_application_script(attack)

    def test_native_text_and_dom_construction_are_allowed(self):
        validate_application_script('''
            const node = document.createElement("span");
            node.textContent = label;
            parent.replaceChildren(node);
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 900 620");
        ''')

    def test_all_application_sources_use_native_dom(self):
        root = Path(__file__).resolve().parent.parent / "barometre_builder"
        scripts = [*root.joinpath("templates").glob("*.js"),
                   *root.joinpath("template_fragments", "chapters").glob("*.js")]
        self.assertTrue(scripts)
        for path in scripts:
            with self.subTest(path=path.name):
                validate_application_script(path.read_text(encoding="utf-8"))

    def test_generator_refuses_an_application_html_interpreter(self):
        renderer = RENDERERS["barometre_details.html"]
        def unsafe(context):
            return renderer(context).replace("(() => {", '(() => {\nnode.innerHTML = label;', 1)
        with mock.patch.dict(RENDERERS, {"barometre_details.html": unsafe}):
            with self.assertRaisesRegex(ValueError, "interpr"):
                assemble_publication(example_context())

    def test_generated_application_scripts_are_checked_without_vendor_changes(self):
        publication = assemble_publication(example_context())
        for name, data in publication.files.items():
            if name.startswith("assets/js/"):
                validate_application_script(data.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
