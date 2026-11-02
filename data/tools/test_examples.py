import tempfile
import unittest
import zipfile
from pathlib import Path
from import_examples import select_examples


class ExampleImportTest(unittest.TestCase):
    def test_import_requires_license_and_both_sentence_authors(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'examples.zip'
            with zipfile.ZipFile(archive, 'w') as output:
                output.writestr('cmn.txt', '\n'.join([
                    'We should retain this useful old document.\t我们应当保留这份旧文件。\tCC-BY 2.0 (France) Attribution: tatoeba.org #1 (Alice) & #2 (Bob)',
                    'We should foster a spirit of cooperation.\t我们应该培养合作精神。\tunknown owner',
                    'We should retain these important useful old documents forever.\t我们应该永远保留旧文件。\tCC-BY 2.0 (France) Attribution: tatoeba.org #3 (Alice) & #4 (Bob)',
                ]))
            entries = select_examples(archive, {'retain', 'foster'}, lambda text: text)
            self.assertEqual(set(entries), {'retain'})
            self.assertEqual(entries['retain']['exampleSource']['status'], 'corpus-draft')
            self.assertIn('Alice', entries['retain']['exampleSource']['attribution'])
            self.assertEqual(entries['retain']['exampleSource']['translationUrl'], 'https://tatoeba.org/en/sentences/show/4')


if __name__ == '__main__':
    unittest.main()
